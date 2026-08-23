-- GAP: entity users could not attach evidence documents to a supervisory
-- remediation action (prudential_action), which blocks the mandatory
-- evidence step of every remediation / examination CAP closure.
CREATE OR REPLACE FUNCTION public.external_can_access_prudential_action(_user_id uuid, _action_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.prudential_actions a
    WHERE a.id = _action_id
      AND a.entity_id IS NOT NULL
      AND public.has_portal_capability(_user_id, a.entity_id, 'licensing'::public.portal_area, _capability)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.external_can_access_prudential_action(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_can_access_prudential_action(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.external_can_access_document_ref(_user_id uuid, _entity_type text, _entity_id uuid, _capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ELSIF v_type IN ('prudential_action', 'prudential_actions', 'supervisory_action') THEN
    RETURN public.external_can_access_prudential_action(_user_id, _entity_id, _capability);
  ELSIF v_type IN ('licensee', 'licensees', 'entity') THEN
    RETURN public.has_portal_capability(_user_id, _entity_id, 'licensing'::public.portal_area, _capability);
  END IF;

  RETURN false;
END;
$function$;

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
  ELSIF v_type IN ('prudential_action', 'prudential_actions', 'supervisory_action') THEN
    RETURN public.external_can_access_prudential_action(_user_id, v_entity, 'can_upload_documents');
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