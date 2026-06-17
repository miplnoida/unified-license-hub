-- External Portal Access hardening (additive)

-- Helpers used by RLS policies. These do not grant access by themselves; they
-- centralize the same capability checks used across portal data tables.
CREATE OR REPLACE FUNCTION public.safe_uuid(_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF _value IS NULL OR btrim(_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN _value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_portal_capability(
  _user_id uuid,
  _entity_id uuid,
  _area public.portal_area,
  _capability text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Authenticated clients may only check their own capability. Internal staff
  -- can check for management screens. Service-role calls have auth.uid() NULL.
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.external_portal_access epa
    WHERE epa.user_id = _user_id
      AND epa.portal_area = _area
      AND epa.status = 'active'
      AND (_entity_id IS NULL OR epa.entity_id = _entity_id)
      AND CASE _capability
        WHEN 'can_submit' THEN epa.can_submit
        WHEN 'can_upload_documents' THEN epa.can_upload_documents
        WHEN 'can_view_status' THEN epa.can_view_status
        WHEN 'can_respond_rfi' THEN epa.can_respond_rfi
        WHEN 'can_submit_returns' THEN epa.can_submit_returns
        WHEN 'can_submit_complaints' THEN epa.can_submit_complaints
        WHEN 'can_submit_fp_declarations' THEN epa.can_submit_fp_declarations
        ELSE false
      END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_application_entity_ids(_application_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT entity_id
  FROM (
    SELECT public.safe_uuid(a.data->>'licensee_id') AS entity_id
    FROM public.applications a
    WHERE a.id = _application_id

    UNION

    SELECT p.licensee_id AS entity_id
    FROM public.applications a
    JOIN public.profiles p ON p.id = a.applicant_id
    WHERE a.id = _application_id

    UNION

    SELECT l.id AS entity_id
    FROM public.licenses lic
    JOIN public.licensees l ON l.license_id = lic.id
    WHERE lic.application_id = _application_id

    UNION

    SELECT lic.holder_id AS entity_id
    FROM public.licenses lic
    WHERE lic.application_id = _application_id
      AND EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = lic.holder_id)
  ) s
  WHERE entity_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_application(
  _user_id uuid,
  _application_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = _application_id
      AND a.applicant_id = _user_id
      AND public.has_portal_capability(_user_id, NULL, 'licensing'::public.portal_area, _capability)
  )
  OR EXISTS (
    SELECT 1
    FROM public.portal_application_entity_ids(_application_id) e(entity_id)
    WHERE public.has_portal_capability(_user_id, e.entity_id, 'licensing'::public.portal_area, _capability)
  );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_application_values(
  _user_id uuid,
  _applicant_id uuid,
  _data jsonb,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    _applicant_id = _user_id
    AND public.has_portal_capability(_user_id, NULL, 'licensing'::public.portal_area, _capability)
  )
  OR (
    public.safe_uuid(_data->>'licensee_id') IS NOT NULL
    AND public.has_portal_capability(
      _user_id,
      public.safe_uuid(_data->>'licensee_id'),
      'licensing'::public.portal_area,
      _capability
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.portal_license_entity_ids(_license_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT entity_id
  FROM (
    SELECT l.id AS entity_id
    FROM public.licensees l
    WHERE l.license_id = _license_id

    UNION

    SELECT lic.holder_id AS entity_id
    FROM public.licenses lic
    WHERE lic.id = _license_id
      AND EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = lic.holder_id)

    UNION

    SELECT p.licensee_id AS entity_id
    FROM public.licenses lic
    JOIN public.profiles p ON p.id = lic.holder_id
    WHERE lic.id = _license_id

    UNION

    SELECT e.entity_id
    FROM public.licenses lic
    CROSS JOIN LATERAL public.portal_application_entity_ids(lic.application_id) e(entity_id)
    WHERE lic.id = _license_id
      AND lic.application_id IS NOT NULL
  ) s
  WHERE entity_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_license(
  _user_id uuid,
  _license_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_license_entity_ids(_license_id) e(entity_id)
    WHERE public.has_portal_capability(_user_id, e.entity_id, 'licensing'::public.portal_area, _capability)
  )
  OR EXISTS (
    SELECT 1
    FROM public.licenses lic
    WHERE lic.id = _license_id
      AND lic.holder_id = _user_id
      AND public.has_portal_capability(_user_id, NULL, 'licensing'::public.portal_area, _capability)
  );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_compliance_return_values(
  _user_id uuid,
  _license_id uuid,
  _on_behalf_of_licensee_id uuid,
  _submitter_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _submitter_id = _user_id
     AND (
       (
         _on_behalf_of_licensee_id IS NOT NULL
         AND public.has_portal_capability(_user_id, _on_behalf_of_licensee_id, 'returns'::public.portal_area, _capability)
       )
       OR EXISTS (
         SELECT 1
         FROM public.portal_license_entity_ids(_license_id) e(entity_id)
         WHERE public.has_portal_capability(_user_id, e.entity_id, 'returns'::public.portal_area, _capability)
       )
     );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_compliance_return(
  _user_id uuid,
  _return_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.compliance_returns r
    WHERE r.id = _return_id
      AND public.external_can_access_compliance_return_values(
        _user_id,
        r.license_id,
        r.on_behalf_of_licensee_id,
        r.submitter_id,
        _capability
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_return_filed_values(
  _user_id uuid,
  _entity_id uuid,
  _on_behalf_of_licensee_id uuid,
  _created_by uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _created_by = _user_id
     AND (
       (_entity_id IS NOT NULL AND public.has_portal_capability(_user_id, _entity_id, 'returns'::public.portal_area, _capability))
       OR (_on_behalf_of_licensee_id IS NOT NULL AND public.has_portal_capability(_user_id, _on_behalf_of_licensee_id, 'returns'::public.portal_area, _capability))
     );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_return_filed(
  _user_id uuid,
  _return_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = _return_id
      AND public.external_can_access_return_filed_values(
        _user_id,
        r.entity_id,
        r.on_behalf_of_licensee_id,
        r.created_by,
        _capability
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_complaint_values(
  _user_id uuid,
  _complainant_id uuid,
  _license_holder_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _complainant_id = _user_id
     AND (
       (_license_holder_id IS NULL AND public.has_portal_capability(_user_id, NULL, 'complaints'::public.portal_area, _capability))
       OR (_license_holder_id IS NOT NULL AND public.has_portal_capability(_user_id, _license_holder_id, 'complaints'::public.portal_area, _capability))
     );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_complaint(
  _user_id uuid,
  _complaint_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.complaints c
    WHERE c.id = _complaint_id
      AND public.external_can_access_complaint_values(_user_id, c.complainant_id, c.license_holder_id, _capability)
  );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_payment_values(
  _user_id uuid,
  _payment_user_id uuid,
  _application_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _payment_user_id = _user_id
     AND (
       _application_id IS NULL
       OR public.external_can_access_application(_user_id, _application_id, _capability)
     );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_payment(
  _user_id uuid,
  _payment_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.id = _payment_id
      AND public.external_can_access_payment_values(_user_id, p.user_id, p.application_id, _capability)
  );
$$;

CREATE OR REPLACE FUNCTION public.external_can_access_document_ref(
  _user_id uuid,
  _entity_type text,
  _entity_id uuid,
  _capability text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text := lower(coalesce(_entity_type, ''));
BEGIN
  IF _entity_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_type IN ('application', 'applications') THEN
    RETURN public.external_can_access_application(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('license', 'licenses') THEN
    RETURN public.external_can_access_license(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('compliance_return', 'compliance_returns') THEN
    RETURN public.external_can_access_compliance_return(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('return', 'returns_filed', 'return_filed') THEN
    RETURN public.external_can_access_return_filed(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('complaint', 'complaints') THEN
    RETURN public.external_can_access_complaint(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('payment', 'payments') THEN
    RETURN public.external_can_access_payment(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('licensee', 'licensees', 'entity') THEN
    RETURN public.has_portal_capability(_user_id, _entity_id, 'licensing'::public.portal_area, _capability);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.external_can_upload_document_ref(
  _user_id uuid,
  _entity_type text,
  _entity_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text := lower(coalesce(_entity_type, ''));
  v_entity uuid := _entity_id;
BEGIN
  IF v_entity IS NULL THEN
    RETURN false;
  END IF;

  IF v_type IN ('application', 'applications', 'license', 'licenses', 'licensee', 'licensees', 'entity', 'payment', 'payments') THEN
    RETURN public.external_can_access_document_ref(_user_id, v_type, v_entity, 'can_upload_documents');
  ELSIF v_type IN ('compliance_return', 'compliance_returns') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.compliance_returns r
      WHERE r.id = v_entity
        AND public.external_can_access_compliance_return_values(_user_id, r.license_id, r.on_behalf_of_licensee_id, r.submitter_id, 'can_upload_documents')
    );
  ELSIF v_type IN ('return', 'returns_filed', 'return_filed') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.returns_filed r
      WHERE r.id = v_entity
        AND (
          (r.entity_id IS NOT NULL AND public.has_portal_capability(_user_id, r.entity_id, 'returns'::public.portal_area, 'can_upload_documents'))
          OR (r.on_behalf_of_licensee_id IS NOT NULL AND public.has_portal_capability(_user_id, r.on_behalf_of_licensee_id, 'returns'::public.portal_area, 'can_upload_documents'))
        )
    );
  ELSIF v_type IN ('complaint', 'complaints') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.complaints c
      WHERE c.id = v_entity
        AND public.external_can_access_complaint_values(_user_id, c.complainant_id, c.license_holder_id, 'can_submit_complaints')
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_portal_capability(uuid, uuid, public.portal_area, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_application_entity_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_application(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_application_values(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_license_entity_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_license(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_compliance_return_values(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_compliance_return(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_return_filed_values(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_return_filed(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_complaint_values(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_complaint(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_payment_values(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_payment(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_access_document_ref(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_can_upload_document_ref(uuid, text, uuid) TO authenticated;

-- Audit trigger fix: previous version used old_values/new_values, but the
-- actual table columns are old_value/new_value.
CREATE OR REPLACE FUNCTION public.log_external_portal_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'EXTERNAL_PORTAL_ACCESS_GRANTED';
    v_actor := COALESCE(auth.uid(), NEW.created_by);
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (v_actor, v_action, 'external_portal_access', NEW.id::text, NULL, to_jsonb(NEW), jsonb_build_object('portal_area', NEW.portal_area, 'target_user_id', NEW.user_id, 'entity_id', NEW.entity_id));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'inactive' AND OLD.status = 'active' THEN
      v_action := 'EXTERNAL_PORTAL_ACCESS_REVOKED';
    ELSE
      v_action := 'EXTERNAL_PORTAL_ACCESS_UPDATED';
    END IF;
    v_actor := COALESCE(auth.uid(), NEW.created_by, OLD.created_by);
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (v_actor, v_action, 'external_portal_access', NEW.id::text, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('portal_area', NEW.portal_area, 'target_user_id', NEW.user_id, 'entity_id', NEW.entity_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'EXTERNAL_PORTAL_ACCESS_REVOKED';
    v_actor := COALESCE(auth.uid(), OLD.created_by);
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (v_actor, v_action, 'external_portal_access', OLD.id::text, to_jsonb(OLD), NULL, jsonb_build_object('portal_area', OLD.portal_area, 'target_user_id', OLD.user_id, 'entity_id', OLD.entity_id));
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_epa_audit ON public.external_portal_access;
CREATE TRIGGER trg_epa_audit
AFTER INSERT OR UPDATE OR DELETE ON public.external_portal_access
FOR EACH ROW EXECUTE FUNCTION public.log_external_portal_access_change();

-- Idempotent default seeding. Secondary external users intentionally receive no
-- defaults; explicit assignment is required.
CREATE OR REPLACE FUNCTION public.seed_external_portal_defaults(
  _user_id uuid,
  _entity_id uuid,
  _role app_role,
  _actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _role IN ('applicant'::app_role, 'pre_licensee'::app_role) THEN
    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'licensing', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit = true,
          can_upload_documents = true,
          can_view_status = true,
          can_respond_rfi = true,
          status = 'active',
          updated_at = now();
  ELSIF _role = 'licensee_primary'::app_role THEN
    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'licensing', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit = true, can_upload_documents = true, can_view_status = true, can_respond_rfi = true, status = 'active', updated_at = now();

    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit_returns, can_upload_documents, can_view_status, can_respond_rfi, created_by)
    VALUES (_user_id, _entity_id, 'returns', true, true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_returns = true, can_upload_documents = true, can_view_status = true, can_respond_rfi = true, status = 'active', updated_at = now();

    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit_complaints, can_upload_documents, can_view_status, created_by)
    VALUES (_user_id, _entity_id, 'complaints', true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_complaints = true, can_upload_documents = true, can_view_status = true, status = 'active', updated_at = now();

    INSERT INTO public.external_portal_access
      (user_id, entity_id, portal_area, can_submit_fp_declarations, can_upload_documents, can_view_status, created_by)
    VALUES (_user_id, _entity_id, 'fp_declarations', true, true, true, _actor)
    ON CONFLICT (user_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), portal_area) DO UPDATE
      SET can_submit_fp_declarations = true, can_upload_documents = true, can_view_status = true, status = 'active', updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_external_portal_defaults(uuid, uuid, app_role, uuid) TO service_role;

-- Capability gates on external portal data. These are RESTRICTIVE policies,
-- so they narrow the existing permissive owner/admin policies without changing
-- internal/admin workflows.

DROP POLICY IF EXISTS "external_applications_select_capability_gate" ON public.applications;
CREATE POLICY "external_applications_select_capability_gate"
ON public.applications AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_application(auth.uid(), id, 'can_view_status')
);

DROP POLICY IF EXISTS "external_applications_insert_capability_gate" ON public.applications;
CREATE POLICY "external_applications_insert_capability_gate"
ON public.applications AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_application_values(auth.uid(), applicant_id, data, 'can_submit')
);

DROP POLICY IF EXISTS "external_applications_update_capability_gate" ON public.applications;
CREATE POLICY "external_applications_update_capability_gate"
ON public.applications AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_application(auth.uid(), id, 'can_submit')
  OR public.external_can_access_application(auth.uid(), id, 'can_respond_rfi')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_application_values(auth.uid(), applicant_id, data, 'can_submit')
  OR public.external_can_access_application_values(auth.uid(), applicant_id, data, 'can_respond_rfi')
);

DROP POLICY IF EXISTS "external_licenses_select_capability_gate" ON public.licenses;
CREATE POLICY "external_licenses_select_capability_gate"
ON public.licenses AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_license(auth.uid(), id, 'can_view_status')
);

DROP POLICY IF EXISTS "external_compliance_returns_select_capability_gate" ON public.compliance_returns;
CREATE POLICY "external_compliance_returns_select_capability_gate"
ON public.compliance_returns AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_compliance_return(auth.uid(), id, 'can_view_status')
  OR public.external_can_access_compliance_return(auth.uid(), id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_compliance_returns_insert_capability_gate" ON public.compliance_returns;
CREATE POLICY "external_compliance_returns_insert_capability_gate"
ON public.compliance_returns AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_compliance_return_values(auth.uid(), license_id, on_behalf_of_licensee_id, submitter_id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_compliance_returns_update_capability_gate" ON public.compliance_returns;
CREATE POLICY "external_compliance_returns_update_capability_gate"
ON public.compliance_returns AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_compliance_return(auth.uid(), id, 'can_submit_returns')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_compliance_return_values(auth.uid(), license_id, on_behalf_of_licensee_id, submitter_id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_returns_filed_select_capability_gate" ON public.returns_filed;
CREATE POLICY "external_returns_filed_select_capability_gate"
ON public.returns_filed AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), id, 'can_view_status')
  OR public.external_can_access_return_filed(auth.uid(), id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_returns_filed_insert_capability_gate" ON public.returns_filed;
CREATE POLICY "external_returns_filed_insert_capability_gate"
ON public.returns_filed AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_returns_filed_update_capability_gate" ON public.returns_filed;
CREATE POLICY "external_returns_filed_update_capability_gate"
ON public.returns_filed AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), id, 'can_submit_returns')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_return_form_data_select_capability_gate" ON public.return_form_data;
CREATE POLICY "external_return_form_data_select_capability_gate"
ON public.return_form_data AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_view_status')
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_return_form_data_write_capability_gate" ON public.return_form_data;
CREATE POLICY "external_return_form_data_write_capability_gate"
ON public.return_form_data AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_return_form_data_update_capability_gate" ON public.return_form_data;
CREATE POLICY "external_return_form_data_update_capability_gate"
ON public.return_form_data AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_return_documents_capability_gate" ON public.return_documents;
CREATE POLICY "external_return_documents_capability_gate"
ON public.return_documents AS RESTRICTIVE FOR ALL TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_view_status')
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND public.external_can_upload_document_ref(auth.uid(), 'returns_filed', return_id))
);

DROP POLICY IF EXISTS "external_return_requests_capability_gate" ON public.return_requests;
CREATE POLICY "external_return_requests_capability_gate"
ON public.return_requests AS RESTRICTIVE FOR ALL TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_view_status')
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_return_filed(auth.uid(), return_id, 'can_submit_returns')
);

DROP POLICY IF EXISTS "external_complaints_select_capability_gate" ON public.complaints;
CREATE POLICY "external_complaints_select_capability_gate"
ON public.complaints AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_complaint(auth.uid(), id, 'can_view_status')
  OR public.external_can_access_complaint(auth.uid(), id, 'can_submit_complaints')
);

DROP POLICY IF EXISTS "external_complaints_insert_capability_gate" ON public.complaints;
CREATE POLICY "external_complaints_insert_capability_gate"
ON public.complaints AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_complaint_values(auth.uid(), complainant_id, license_holder_id, 'can_submit_complaints')
);

DROP POLICY IF EXISTS "external_complaints_update_capability_gate" ON public.complaints;
CREATE POLICY "external_complaints_update_capability_gate"
ON public.complaints AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_documents_select_capability_gate" ON public.documents;
CREATE POLICY "external_documents_select_capability_gate"
ON public.documents AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_document_ref(auth.uid(), entity_type, entity_id, 'can_view_status')
  OR public.external_can_access_document_ref(auth.uid(), entity_type, entity_id, 'can_submit_returns')
  OR public.external_can_access_document_ref(auth.uid(), entity_type, entity_id, 'can_submit_complaints')
);

DROP POLICY IF EXISTS "external_documents_insert_capability_gate" ON public.documents;
CREATE POLICY "external_documents_insert_capability_gate"
ON public.documents AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND public.external_can_upload_document_ref(auth.uid(), entity_type, entity_id))
);

DROP POLICY IF EXISTS "external_file_uploads_select_capability_gate" ON public.file_uploads;
CREATE POLICY "external_file_uploads_select_capability_gate"
ON public.file_uploads AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id), 'can_view_status')
  OR public.external_can_access_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id), 'can_submit_returns')
  OR public.external_can_access_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id), 'can_submit_complaints')
);

DROP POLICY IF EXISTS "external_file_uploads_insert_capability_gate" ON public.file_uploads;
CREATE POLICY "external_file_uploads_insert_capability_gate"
ON public.file_uploads AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND public.external_can_upload_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id)))
);

DROP POLICY IF EXISTS "external_file_uploads_update_capability_gate" ON public.file_uploads;
CREATE POLICY "external_file_uploads_update_capability_gate"
ON public.file_uploads AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND public.external_can_upload_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id)))
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND public.external_can_upload_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id)))
);

DROP POLICY IF EXISTS "external_file_uploads_delete_capability_gate" ON public.file_uploads;
CREATE POLICY "external_file_uploads_delete_capability_gate"
ON public.file_uploads AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND public.external_can_upload_document_ref(auth.uid(), entity_type, public.safe_uuid(entity_id)))
);

DROP POLICY IF EXISTS "external_payments_select_capability_gate" ON public.payments;
CREATE POLICY "external_payments_select_capability_gate"
ON public.payments AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment(auth.uid(), id, 'can_view_status')
  OR public.external_can_access_payment(auth.uid(), id, 'can_submit')
);

DROP POLICY IF EXISTS "external_payments_insert_capability_gate" ON public.payments;
CREATE POLICY "external_payments_insert_capability_gate"
ON public.payments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_submit')
  OR public.external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_view_status')
);

DROP POLICY IF EXISTS "external_payments_update_capability_gate" ON public.payments;
CREATE POLICY "external_payments_update_capability_gate"
ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment(auth.uid(), id, 'can_submit')
  OR public.external_can_access_payment(auth.uid(), id, 'can_view_status')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_submit')
  OR public.external_can_access_payment_values(auth.uid(), user_id, application_id, 'can_view_status')
);

DROP POLICY IF EXISTS "external_payment_attachments_capability_gate" ON public.payment_attachments;
CREATE POLICY "external_payment_attachments_capability_gate"
ON public.payment_attachments AS RESTRICTIVE FOR ALL TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment(auth.uid(), payment_id, 'can_view_status')
  OR public.external_can_access_payment(auth.uid(), payment_id, 'can_submit')
)
WITH CHECK (
  NOT public.has_external_role(auth.uid())
  OR (uploaded_by = auth.uid() AND (public.external_can_access_payment(auth.uid(), payment_id, 'can_submit') OR public.external_can_access_payment(auth.uid(), payment_id, 'can_view_status')))
);

DROP POLICY IF EXISTS "external_payment_receipts_capability_gate" ON public.payment_receipts;
CREATE POLICY "external_payment_receipts_capability_gate"
ON public.payment_receipts AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment(auth.uid(), payment_id, 'can_view_status')
  OR public.external_can_access_payment(auth.uid(), payment_id, 'can_submit')
);

DROP POLICY IF EXISTS "external_payment_remarks_capability_gate" ON public.payment_remarks;
CREATE POLICY "external_payment_remarks_capability_gate"
ON public.payment_remarks AS RESTRICTIVE FOR ALL TO authenticated
USING (
  NOT public.has_external_role(auth.uid())
  OR public.external_can_access_payment(auth.uid(), payment_id, 'can_view_status')
  OR public.external_can_access_payment(auth.uid(), payment_id, 'can_submit')
)
WITH CHECK (NOT public.has_external_role(auth.uid()));

-- Internal regulatory data must not be directly accessible to external portal
-- roles, regardless of frontend route visibility.
DROP POLICY IF EXISTS "external_users_denied_workflow_instances" ON public.workflow_instances;
CREATE POLICY "external_users_denied_workflow_instances"
ON public.workflow_instances AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_approval_steps" ON public.approval_steps;
CREATE POLICY "external_users_denied_approval_steps"
ON public.approval_steps AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_approval_actions" ON public.approval_actions;
CREATE POLICY "external_users_denied_approval_actions"
ON public.approval_actions AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_compliance_audit_logs" ON public.compliance_audit_logs;
CREATE POLICY "external_users_denied_compliance_audit_logs"
ON public.compliance_audit_logs AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_security_event_logs" ON public.security_event_logs;
CREATE POLICY "external_users_denied_security_event_logs"
ON public.security_event_logs AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_reports" ON public.reports;
CREATE POLICY "external_users_denied_reports"
ON public.reports AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_report_definitions" ON public.report_definitions;
CREATE POLICY "external_users_denied_report_definitions"
ON public.report_definitions AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_inspections" ON public.inspections;
CREATE POLICY "external_users_denied_inspections"
ON public.inspections AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_enforcement_actions" ON public.enforcement_actions;
CREATE POLICY "external_users_denied_enforcement_actions"
ON public.enforcement_actions AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_risk_ratings" ON public.risk_ratings;
CREATE POLICY "external_users_denied_risk_ratings"
ON public.risk_ratings AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));

DROP POLICY IF EXISTS "external_users_denied_delegation_rules" ON public.delegation_rules;
CREATE POLICY "external_users_denied_delegation_rules"
ON public.delegation_rules AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.has_external_role(auth.uid()))
WITH CHECK (NOT public.has_external_role(auth.uid()));