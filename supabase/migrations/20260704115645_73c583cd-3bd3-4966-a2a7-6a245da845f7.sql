
CREATE OR REPLACE FUNCTION public.external_can_upload_document_ref(_user_id uuid, _entity_type text, _entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text := lower(coalesce(_entity_type, ''));
  v_entity uuid := _entity_id;
  v_app_id uuid;
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
  ELSIF v_type IN ('rfi_response', 'application_rfi_response') THEN
    SELECT r.application_id INTO v_app_id
    FROM public.application_rfi_items it
    JOIN public.application_rfis r ON r.id = it.rfi_id
    WHERE it.id = v_entity
    LIMIT 1;
    IF v_app_id IS NULL THEN RETURN false; END IF;
    RETURN public.external_can_access_document_ref(_user_id, 'application', v_app_id, 'can_upload_documents')
        OR public.external_can_access_document_ref(_user_id, 'application', v_app_id, 'can_respond_rfi');
  ELSIF v_type IN ('rfi', 'application_rfi') THEN
    SELECT application_id INTO v_app_id
    FROM public.application_rfis
    WHERE id = v_entity
    LIMIT 1;
    IF v_app_id IS NULL THEN RETURN false; END IF;
    RETURN public.external_can_access_document_ref(_user_id, 'application', v_app_id, 'can_upload_documents')
        OR public.external_can_access_document_ref(_user_id, 'application', v_app_id, 'can_respond_rfi');
  END IF;

  RETURN false;
END;
$function$;

-- Extend the SELECT gate so applicants can read back their RFI attachments.
DROP POLICY IF EXISTS external_file_uploads_select_capability_gate ON public.file_uploads;
CREATE POLICY external_file_uploads_select_capability_gate
ON public.file_uploads
FOR SELECT
TO authenticated
USING (
  (NOT has_external_role(auth.uid()))
  OR external_can_access_document_ref(auth.uid(), entity_type, safe_uuid(entity_id), 'can_view_status')
  OR external_can_access_document_ref(auth.uid(), entity_type, safe_uuid(entity_id), 'can_submit_returns')
  OR external_can_access_document_ref(auth.uid(), entity_type, safe_uuid(entity_id), 'can_submit_complaints')
  OR (
    lower(coalesce(entity_type, '')) IN ('rfi_response','application_rfi_response','rfi','application_rfi')
    AND external_can_upload_document_ref(auth.uid(), entity_type, safe_uuid(entity_id))
  )
);
