
-- =====================================================================
-- SLICE 3 — Returns RLS + storage lockdown
-- =====================================================================

-- 1. Canonical helpers ------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_return_filed_row(
  _user_id uuid,
  _entity_id uuid,
  _on_behalf_of_licensee_id uuid,
  _created_by uuid,
  _return_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF public.has_permission(_user_id, 'returns_management', 'view_all_entities') THEN RETURN true; END IF;
  IF _created_by = _user_id THEN RETURN true; END IF;
  IF public.user_has_entity_assignment(_user_id, _entity_id)
     OR public.user_has_entity_assignment(_user_id, _on_behalf_of_licensee_id) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.licensee_id IS NOT NULL
      AND (p.licensee_id = _entity_id OR p.licensee_id = _on_behalf_of_licensee_id)
  ) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.entity_user_access eua
    WHERE eua.user_id = _user_id AND eua.is_active = true
      AND (eua.end_date IS NULL OR eua.end_date > now())
      AND eua.entity_id = ANY (ARRAY[_entity_id, _on_behalf_of_licensee_id])
  ) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ppoc_mapped_licensee_ids(_user_id) AS m(licensee_id)
    WHERE m.licensee_id = _entity_id OR m.licensee_id = _on_behalf_of_licensee_id
  ) THEN RETURN true; END IF;
  IF _return_id IS NOT NULL AND (
      public.external_can_access_return_filed(_user_id, _return_id, 'can_view_status')
      OR public.external_can_access_return_filed(_user_id, _return_id, 'can_submit_returns')
  ) THEN RETURN true; END IF;
  RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_read_return_filed_row(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_return_filed_row(uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_return_filed(_user_id uuid, _return_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.returns_filed%ROWTYPE;
BEGIN
  IF _user_id IS NULL OR _return_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF public.has_permission(_user_id, 'returns_management', 'view_all_entities') THEN RETURN true; END IF;
  SELECT * INTO r FROM public.returns_filed WHERE id = _return_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.can_read_return_filed_row(_user_id, r.entity_id, r.on_behalf_of_licensee_id, r.created_by, r.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.can_read_return_filed(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_return_filed(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_mutate_return_filed(_user_id uuid, _return_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.returns_filed%ROWTYPE; editable_statuses text[] := ARRAY['TEMP','WIP','TBR'];
BEGIN
  IF _user_id IS NULL OR _return_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF public.has_permission(_user_id, 'returns_management', 'edit') THEN RETURN true; END IF;
  SELECT * INTO r FROM public.returns_filed WHERE id = _return_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (r.workflow_status::text = ANY (editable_statuses)) THEN
    IF r.created_by = _user_id THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.licensee_id IS NOT NULL
               AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
      THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.ppoc_mapped_licensee_ids(_user_id) AS m(licensee_id)
               WHERE m.licensee_id = r.entity_id OR m.licensee_id = r.on_behalf_of_licensee_id)
      THEN RETURN true; END IF;
    IF public.external_can_access_return_filed(_user_id, r.id, 'can_submit_returns')
      THEN RETURN true; END IF;
  END IF;
  RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_mutate_return_filed(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_mutate_return_filed(uuid,uuid) TO authenticated, service_role;

-- 2. returns_filed ----------------------------------------------------

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='returns_filed' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.returns_filed', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.returns_filed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.returns_filed FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.returns_filed TO authenticated;
GRANT ALL ON public.returns_filed TO service_role;

CREATE POLICY returns_filed_read ON public.returns_filed FOR SELECT TO authenticated
USING (public.can_read_return_filed_row(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, id));

CREATE POLICY returns_filed_insert ON public.returns_filed FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by AND (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'returns_management', 'create')
    OR public.has_permission(auth.uid(), 'returns_management', 'edit')
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.licensee_id IS NOT NULL
               AND (pr.licensee_id = entity_id OR pr.licensee_id = on_behalf_of_licensee_id))
    OR EXISTS (SELECT 1 FROM public.ppoc_mapped_licensee_ids(auth.uid()) AS m(licensee_id)
               WHERE m.licensee_id = entity_id OR m.licensee_id = on_behalf_of_licensee_id)
    OR (public.has_external_role(auth.uid())
        AND public.external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns'))
  )
);

CREATE POLICY returns_filed_update ON public.returns_filed FOR UPDATE TO authenticated
USING (public.can_mutate_return_filed(auth.uid(), id))
WITH CHECK (public.can_mutate_return_filed(auth.uid(), id));

CREATE POLICY returns_filed_delete ON public.returns_filed FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management', 'delete'));

-- 3. Child data tables ------------------------------------------------

CREATE OR REPLACE FUNCTION public.__slice3_drop_policies(_table text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=_table LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, _table);
  END LOOP;
END $$;

SELECT public.__slice3_drop_policies(t) FROM unnest(ARRAY[
  'return_form_data','return_documents','return_comments','return_audit_log',
  'return_data_revisions','return_calculated_ratios','return_consolidated_analysis',
  'return_edit_requests','return_requests','return_notifications_log',
  'return_threshold_breaches','return_upload_attempts','return_upload_imports',
  'return_validation_run_log'
]) AS t;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'return_form_data','return_documents','return_comments','return_audit_log',
    'return_data_revisions','return_calculated_ratios','return_consolidated_analysis',
    'return_edit_requests','return_requests','return_notifications_log',
    'return_threshold_breaches','return_upload_attempts','return_upload_imports',
    'return_validation_run_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 3.1 return_form_data
CREATE POLICY return_form_data_read ON public.return_form_data FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_data_insert ON public.return_form_data FOR INSERT TO authenticated
WITH CHECK (public.can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_data_update ON public.return_form_data FOR UPDATE TO authenticated
USING (public.can_mutate_return_filed(auth.uid(), return_id))
WITH CHECK (public.can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_form_data_delete ON public.return_form_data FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management', 'delete'));

-- 3.2 return_documents
CREATE POLICY return_documents_read ON public.return_documents FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_documents_insert ON public.return_documents FOR INSERT TO authenticated
WITH CHECK (public.can_mutate_return_filed(auth.uid(), return_id)
  AND (uploaded_by IS NULL OR uploaded_by = auth.uid()
       OR public.has_permission(auth.uid(), 'returns_management', 'edit')));
CREATE POLICY return_documents_update ON public.return_documents FOR UPDATE TO authenticated
USING (public.can_mutate_return_filed(auth.uid(), return_id))
WITH CHECK (public.can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_documents_delete ON public.return_documents FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid())
       OR (public.can_mutate_return_filed(auth.uid(), return_id)
           AND (uploaded_by = auth.uid()
                OR public.has_permission(auth.uid(), 'returns_management', 'edit'))));

-- 3.3 return_comments
CREATE POLICY return_comments_read ON public.return_comments FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_comments_insert ON public.return_comments FOR INSERT TO authenticated
WITH CHECK (public.can_read_return_filed(auth.uid(), return_id) AND (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'returns_management', 'edit')
  OR public.has_permission(auth.uid(), 'returns_management', 'workflow_action')
  OR public.can_mutate_return_filed(auth.uid(), return_id)
));
CREATE POLICY return_comments_update ON public.return_comments FOR UPDATE TO authenticated
USING (public.can_mutate_return_filed(auth.uid(), return_id))
WITH CHECK (public.can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_comments_delete ON public.return_comments FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'returns_management', 'delete'));

-- 3.4 return_audit_log (append-only)
CREATE POLICY return_audit_log_read ON public.return_audit_log FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_audit_log_insert ON public.return_audit_log FOR INSERT TO authenticated
WITH CHECK (performed_by = auth.uid() AND public.can_read_return_filed(auth.uid(), return_id));

-- 3.5 return_data_revisions
CREATE POLICY return_data_revisions_read ON public.return_data_revisions FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_data_revisions_insert ON public.return_data_revisions FOR INSERT TO authenticated
WITH CHECK (public.can_mutate_return_filed(auth.uid(), return_id)
  AND (created_by IS NULL OR created_by = auth.uid()
       OR public.has_permission(auth.uid(), 'returns_management', 'edit')));
CREATE POLICY return_data_revisions_delete ON public.return_data_revisions FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.6 return_calculated_ratios
CREATE POLICY return_calculated_ratios_read ON public.return_calculated_ratios FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_calculated_ratios_write ON public.return_calculated_ratios FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit'));
CREATE POLICY return_calculated_ratios_update ON public.return_calculated_ratios FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'returns_management', 'edit'))
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit'));
CREATE POLICY return_calculated_ratios_delete ON public.return_calculated_ratios FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.7 return_consolidated_analysis
CREATE POLICY return_consolidated_analysis_read ON public.return_consolidated_analysis FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id)
       OR public.has_permission(auth.uid(), 'report_management', 'view'));
CREATE POLICY return_consolidated_analysis_write ON public.return_consolidated_analysis FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit'));
CREATE POLICY return_consolidated_analysis_update ON public.return_consolidated_analysis FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'returns_management', 'edit'))
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit'));
CREATE POLICY return_consolidated_analysis_delete ON public.return_consolidated_analysis FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.8 return_edit_requests
CREATE POLICY return_edit_requests_read ON public.return_edit_requests FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id)
       OR public.has_permission(auth.uid(), 'returns_management', 'workflow_action'));
CREATE POLICY return_edit_requests_insert ON public.return_edit_requests FOR INSERT TO authenticated
WITH CHECK (public.can_read_return_filed(auth.uid(), return_id)
            OR public.has_permission(auth.uid(), 'returns_management', 'workflow_action'));
CREATE POLICY return_edit_requests_update ON public.return_edit_requests FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'returns_management', 'workflow_action') OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'workflow_action') OR public.is_super_admin(auth.uid()));
CREATE POLICY return_edit_requests_delete ON public.return_edit_requests FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.9 return_requests
CREATE POLICY return_requests_read ON public.return_requests FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id)
       OR public.has_permission(auth.uid(), 'returns_management', 'workflow_action'));
CREATE POLICY return_requests_insert ON public.return_requests FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'workflow_action')
            OR public.can_mutate_return_filed(auth.uid(), return_id));
CREATE POLICY return_requests_update ON public.return_requests FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'returns_management', 'workflow_action') OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'workflow_action') OR public.is_super_admin(auth.uid()));
CREATE POLICY return_requests_delete ON public.return_requests FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.10 return_notifications_log
CREATE POLICY return_notifications_log_read ON public.return_notifications_log FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));

-- 3.11 return_threshold_breaches
CREATE POLICY return_threshold_breaches_read ON public.return_threshold_breaches FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id)
       OR public.has_permission(auth.uid(), 'report_management', 'view'));
CREATE POLICY return_threshold_breaches_insert ON public.return_threshold_breaches FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit'));
CREATE POLICY return_threshold_breaches_update ON public.return_threshold_breaches FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'returns_management', 'edit')
       OR public.has_permission(auth.uid(), 'returns_management', 'workflow_action'))
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit')
            OR public.has_permission(auth.uid(), 'returns_management', 'workflow_action'));
CREATE POLICY return_threshold_breaches_delete ON public.return_threshold_breaches FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.12 return_upload_attempts
CREATE POLICY return_upload_attempts_read ON public.return_upload_attempts FOR SELECT TO authenticated
USING (
  uploaded_by = auth.uid()
  OR (return_id IS NOT NULL AND public.can_read_return_filed(auth.uid(), return_id))
  OR public.has_permission(auth.uid(), 'returns_management', 'view_all_entities')
  OR public.is_super_admin(auth.uid())
);
CREATE POLICY return_upload_attempts_insert ON public.return_upload_attempts FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    return_id IS NULL
    OR public.can_mutate_return_filed(auth.uid(), return_id)
    OR public.has_permission(auth.uid(), 'returns_management', 'edit')
  )
);
CREATE POLICY return_upload_attempts_update ON public.return_upload_attempts FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid()
       OR public.has_permission(auth.uid(), 'returns_management', 'edit')
       OR public.is_super_admin(auth.uid()))
WITH CHECK (uploaded_by = auth.uid()
            OR public.has_permission(auth.uid(), 'returns_management', 'edit')
            OR public.is_super_admin(auth.uid()));
CREATE POLICY return_upload_attempts_delete ON public.return_upload_attempts FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.13 return_upload_imports (fk column: upload_id → return_upload_attempts.id)
CREATE POLICY return_upload_imports_read ON public.return_upload_imports FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'returns_management', 'view_all_entities')
  OR public.has_permission(auth.uid(), 'returns_management', 'edit')
  OR EXISTS (
    SELECT 1 FROM public.return_upload_attempts a
    WHERE a.id = return_upload_imports.upload_id
      AND (a.uploaded_by = auth.uid()
           OR (a.return_id IS NOT NULL AND public.can_read_return_filed(auth.uid(), a.return_id)))
  )
);
CREATE POLICY return_upload_imports_insert ON public.return_upload_imports FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.return_upload_attempts a
          WHERE a.id = upload_id AND a.uploaded_by = auth.uid())
  OR public.has_permission(auth.uid(), 'returns_management', 'edit')
);
CREATE POLICY return_upload_imports_delete ON public.return_upload_imports FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3.14 return_validation_run_log
CREATE POLICY return_validation_run_log_read ON public.return_validation_run_log FOR SELECT TO authenticated
USING (public.can_read_return_filed(auth.uid(), return_id));
CREATE POLICY return_validation_run_log_write ON public.return_validation_run_log FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'returns_management', 'edit'));
CREATE POLICY return_validation_run_log_delete ON public.return_validation_run_log FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP FUNCTION public.__slice3_drop_policies(text);

-- 4. Storage — return-uploads ----------------------------------------

DROP POLICY IF EXISTS return_uploads_owner_read   ON storage.objects;
DROP POLICY IF EXISTS return_uploads_owner_write  ON storage.objects;
DROP POLICY IF EXISTS return_uploads_owner_delete ON storage.objects;
DROP POLICY IF EXISTS return_uploads_read         ON storage.objects;
DROP POLICY IF EXISTS return_uploads_write        ON storage.objects;
DROP POLICY IF EXISTS return_uploads_delete       ON storage.objects;

CREATE POLICY return_uploads_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'return-uploads' AND (
    owner = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'returns_management', 'view_all_entities')
    OR EXISTS (
      SELECT 1 FROM public.return_upload_attempts a
      WHERE a.storage_path = storage.objects.name
        AND (a.uploaded_by = auth.uid()
             OR (a.return_id IS NOT NULL AND public.can_read_return_filed(auth.uid(), a.return_id)))
    )
    OR EXISTS (
      SELECT 1 FROM public.return_documents d
      WHERE d.file_path = storage.objects.name
        AND public.can_read_return_filed(auth.uid(), d.return_id)
    )
  )
);

CREATE POLICY return_uploads_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'return-uploads'
  AND owner = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'returns_management', 'edit')
    OR public.has_permission(auth.uid(), 'returns_management', 'create')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.licensee_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.ppoc_mapped_licensee_ids(auth.uid()) LIMIT 1)
    OR public.has_external_role(auth.uid())
  )
);

CREATE POLICY return_uploads_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'return-uploads' AND (
    public.is_super_admin(auth.uid())
    OR (owner = auth.uid() AND
         NOT EXISTS (
           SELECT 1 FROM public.return_upload_attempts a
           WHERE a.storage_path = storage.objects.name
             AND a.return_id IS NOT NULL
             AND NOT public.can_mutate_return_filed(auth.uid(), a.return_id)
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.return_documents d
           WHERE d.file_path = storage.objects.name
             AND NOT public.can_mutate_return_filed(auth.uid(), d.return_id)
         )
    )
  )
);

-- 5. Register missing catalog permissions -----------------------------

INSERT INTO public.permissions (module, name, description)
SELECT 'returns_management', a.name, a.description
FROM (VALUES
  ('view_all_entities', 'View returns filed by any entity'),
  ('workflow_action',   'Perform return workflow transitions')
) AS a(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p
  WHERE lower(regexp_replace(p.module,'\s+','_','g')) = 'returns_management'
    AND lower(p.name) = lower(a.name)
);
