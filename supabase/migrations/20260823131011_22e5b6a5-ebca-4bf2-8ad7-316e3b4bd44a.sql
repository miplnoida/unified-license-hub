-- P06 authorisation gap: returns_attach_form_response gated preparation on
-- returns_can_file (the SUBMIT authority), so a prepare-only entity user could
-- not prepare anything. Preparation and submission are now distinct capabilities.

ALTER TABLE public.entity_membership_role_permissions
  DROP CONSTRAINT IF EXISTS entity_membership_capability_vocab;

ALTER TABLE public.entity_membership_role_permissions
  ADD CONSTRAINT entity_membership_capability_vocab CHECK (
    capability = ANY (ARRAY[
      'view_status','submit','upload_documents','respond_rfi','pay','manage_users',
      'start_regulatory_request','submit_structural_form','prepare_filing'
    ])
  );

INSERT INTO public.entity_membership_role_permissions (membership_role_id, capability)
SELECT r.id, 'prepare_filing'
  FROM public.entity_membership_roles r
 WHERE r.key IN ('PRIMARY_REPRESENTATIVE','AUTHORIZED_REPRESENTATIVE','FILING_USER','PREPARER')
   AND NOT EXISTS (
     SELECT 1 FROM public.entity_membership_role_permissions p
      WHERE p.membership_role_id = r.id AND p.capability = 'prepare_filing');

CREATE OR REPLACE FUNCTION public.returns_can_prepare(_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.returns_can_file(_entity_id)
    OR public.entity_membership_capability(auth.uid(), _entity_id, 'prepare_filing')
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.returns_can_prepare(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.returns_can_prepare(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.returns_attach_form_response(_requirement_id uuid, _form_response_id uuid, _completion text DEFAULT 'COMPLETED'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_entity uuid; v_status text;
BEGIN
  SELECT f.entity_id, v.status INTO v_entity, v_status
    FROM public.return_filing_form_requirements r
    JOIN public.return_filing_versions v ON v.id = r.return_filing_version_id
    JOIN public.return_filings f ON f.id = v.return_filing_id
   WHERE r.id = _requirement_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'Form requirement not found'; END IF;
  IF NOT public.returns_can_prepare(v_entity) THEN
    RAISE EXCEPTION 'You are not authorised to prepare returns for this entity' USING ERRCODE='42501';
  END IF;
  IF v_status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
    RAISE EXCEPTION 'This filing version is no longer editable';
  END IF;

  UPDATE public.return_filing_form_requirements
     SET form_response_id = _form_response_id,
         completion_status = COALESCE(_completion, 'COMPLETED')
   WHERE id = _requirement_id;
END $function$;