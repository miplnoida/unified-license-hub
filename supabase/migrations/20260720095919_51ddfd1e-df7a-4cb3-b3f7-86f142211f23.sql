
CREATE OR REPLACE FUNCTION public.can_view_entity_returns(
  _user_id uuid,
  _licensee_id uuid,
  _workflow_status text,
  _status text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned boolean;
  v_submitted boolean;
BEGIN
  IF _user_id IS NULL OR _licensee_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;
  IF public.user_has_permission(_user_id, 'returns_management', 'view_all_entities') THEN
    RETURN true;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.id = _licensee_id
      AND (l.lead_regulator_id = _user_id
        OR l.regulator_officer_id = _user_id
        OR l.alternate_regulator_id = _user_id)
  ) INTO v_assigned;
  IF NOT v_assigned THEN
    RETURN false;
  END IF;
  v_submitted := (
    lower(coalesce(_status, '')) IN (
      'submitted','accepted','rejected','resubmission_requested',
      'under_review','resubmitted','resubmit_requested'
    )
    OR upper(coalesce(_workflow_status, '')) IN (
      'SUB','REV','ACC','REJ','SIGN_OFF','SUBMITTED','UNDER_REVIEW',
      'ACCEPTED','REJECTED','RESUBMISSION_REQUESTED','RESUBMITTED'
    )
  );
  RETURN v_submitted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Internal staff view returns for assigned entities" ON public.returns_filed;
CREATE POLICY "Internal staff view returns for assigned entities"
  ON public.returns_filed FOR SELECT TO authenticated
  USING (public.can_view_entity_returns(auth.uid(), entity_id, workflow_status::text, status));

DROP POLICY IF EXISTS "Internal staff view return_form_data for assigned entities" ON public.return_form_data;
CREATE POLICY "Internal staff view return_form_data for assigned entities"
  ON public.return_form_data FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_form_data.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
    )
  );

DROP POLICY IF EXISTS "Internal staff view return_documents for assigned entities" ON public.return_documents;
CREATE POLICY "Internal staff view return_documents for assigned entities"
  ON public.return_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_documents.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
    )
  );

DROP POLICY IF EXISTS "Internal staff view return_upload_attempts for assigned" ON public.return_upload_attempts;
CREATE POLICY "Internal staff view return_upload_attempts for assigned"
  ON public.return_upload_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_upload_attempts.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
    )
  );

DROP POLICY IF EXISTS "Internal staff view return_consolidated_analysis for assigned" ON public.return_consolidated_analysis;
CREATE POLICY "Internal staff view return_consolidated_analysis for assigned"
  ON public.return_consolidated_analysis FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed r
      WHERE r.id = return_consolidated_analysis.return_id
        AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
    )
  );

DROP POLICY IF EXISTS "read return analysis" ON public.return_consolidated_analysis;
CREATE POLICY "read return analysis" ON public.return_consolidated_analysis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed rf
      WHERE rf.id = return_consolidated_analysis.return_id
        AND (
          public.can_view_entity_returns(auth.uid(), rf.entity_id, rf.workflow_status::text, rf.status)
          OR public.can_view_entity_returns(auth.uid(), rf.on_behalf_of_licensee_id, rf.workflow_status::text, rf.status)
          OR rf.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.entity_user_access eua
            WHERE eua.user_id = auth.uid()
              AND eua.is_active = true
              AND eua.entity_id = COALESCE(rf.on_behalf_of_licensee_id, rf.entity_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS "rua_select_owner_or_staff" ON public.return_upload_attempts;
CREATE POLICY "rua_select_owner_or_staff" ON public.return_upload_attempts
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_permission(auth.uid(), 'returns_management', 'view_all_entities')
    OR (
      licensee_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.returns_filed r
          WHERE r.id = return_upload_attempts.return_id
            AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
        )
        OR public.can_current_user_access_licensee(licensee_id, NULL::uuid)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.can_view_return_filed(_user_id uuid, _return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = _user_id
    WHERE r.id = _return_id
      AND (
        r.created_by = _user_id
        OR public.can_view_entity_returns(_user_id, r.entity_id, r.workflow_status::text, r.status)
        OR public.can_view_entity_returns(_user_id, r.on_behalf_of_licensee_id, r.workflow_status::text, r.status)
        OR (
          p.licensee_id IS NOT NULL
          AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id)
        )
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(_user_id))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(_user_id))
        OR public.external_can_access_return_filed(_user_id, r.id, 'can_submit_returns'::text)
        OR public.external_can_access_return_filed(_user_id, r.id, 'can_view_status'::text)
        OR EXISTS (
          SELECT 1
          FROM public.workflow_instances wi
          JOIN public.approval_steps s ON s.id = wi.current_step_id
          WHERE wi.entity_type IN ('return', 'returns_filed', 'return_filed')
            AND wi.entity_id = r.id
            AND wi.status = 'active'
            AND (
              (
                s.approver_type = 'specific_users'
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(s.approver_config->'user_ids', '[]'::jsonb)) AS assigned(user_id)
                  WHERE assigned.user_id = _user_id::text
                )
              )
              OR (
                s.approver_type = 'role_based_user'
                AND s.approver_role_id IN (
                  SELECT udr.role_id
                  FROM public.user_dynamic_roles udr
                  WHERE udr.user_id = _user_id
                )
              )
              OR (
                s.approver_role IS NOT NULL
                AND p.role::text = s.approver_role::text
              )
            )
        )
      )
  );
$function$;

DROP POLICY IF EXISTS "return_uploads_owner_read" ON storage.objects;
CREATE POLICY "return_uploads_owner_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'return-uploads'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.user_has_permission(auth.uid(), 'returns_management', 'view_all_entities')
      OR EXISTS (
        SELECT 1 FROM public.return_upload_attempts a
        LEFT JOIN public.returns_filed r ON r.id = a.return_id
        WHERE a.storage_path = storage.objects.name
          AND (
            a.uploaded_by = auth.uid()
            OR (
              r.id IS NOT NULL
              AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
            )
            OR (
              a.licensee_id IS NOT NULL
              AND public.can_current_user_access_licensee(a.licensee_id, NULL::uuid)
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.return_documents d
        JOIN public.returns_filed r ON r.id = d.return_id
        WHERE d.file_path = storage.objects.name
          AND public.can_view_entity_returns(auth.uid(), r.entity_id, r.workflow_status::text, r.status)
      )
    )
  );
