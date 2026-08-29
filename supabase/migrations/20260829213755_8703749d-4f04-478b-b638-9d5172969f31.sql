CREATE OR REPLACE FUNCTION public.returns_attach_evidence(_version_id uuid, _document_name text, _storage_path text, _file_type text DEFAULT NULL::text, _file_size bigint DEFAULT NULL::bigint, _description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record; v_id uuid; v_internal boolean;
BEGIN
  IF COALESCE(length(trim(_document_name)),0) = 0 OR COALESCE(length(trim(_storage_path)),0) = 0 THEN
    RAISE EXCEPTION 'A document name and stored file are required';
  END IF;
  SELECT v2.id, v2.status, v2.return_filing_id, f.entity_id,
         f.entity_reporting_obligation_id AS obligation_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;

  -- Only genuine internal staff act as regulator-side document handlers; an
  -- external portal user holding the upload permission is still an entity user.
  v_internal := public.is_super_admin(auth.uid())
             OR (public.sec_is_internal_user(auth.uid())
                 AND NOT public.has_external_role(auth.uid())
                 AND public.has_permission(auth.uid(),'returns_management','upload_documents'));

  IF NOT v_internal THEN
    IF NOT public.returns_can_file_obligation(v.obligation_id) THEN
      RAISE EXCEPTION 'You are not authorised to attach evidence to this return' USING ERRCODE='42501';
    END IF;
    IF v.status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
      RAISE EXCEPTION 'Evidence can only be added while the return is open for filing';
    END IF;
  END IF;

  INSERT INTO public.return_filing_evidence(
    return_filing_id, return_filing_version_id, entity_id, document_name, storage_path,
    file_type, file_size, description, uploaded_by)
  VALUES (v.return_filing_id, _version_id, v.entity_id, trim(_document_name), trim(_storage_path),
          _file_type, _file_size, _description, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.create_audit_log('return_filing', v.return_filing_id, 'RETURN_EVIDENCE_ATTACHED',
    jsonb_build_object('evidence_id', v_id, 'version_id', _version_id, 'document_name', trim(_document_name)));
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.returns_withdraw_evidence(_evidence_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e record; v_status text; v_internal boolean;
BEGIN
  IF COALESCE(length(trim(_reason)),0) < 5 THEN
    RAISE EXCEPTION 'Please record why this document is being withdrawn';
  END IF;
  SELECT ev.*, v2.status AS version_status, f.entity_reporting_obligation_id AS obligation_id
    INTO e FROM public.return_filing_evidence ev
    JOIN public.return_filing_versions v2 ON v2.id = ev.return_filing_version_id
    JOIN public.return_filings f ON f.id = ev.return_filing_id
   WHERE ev.id = _evidence_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF e.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'This document has already been withdrawn'; END IF;

  v_internal := public.is_super_admin(auth.uid())
             OR (public.sec_is_internal_user(auth.uid())
                 AND NOT public.has_external_role(auth.uid())
                 AND public.has_permission(auth.uid(),'returns_management','upload_documents'));

  IF NOT v_internal THEN
    IF NOT public.returns_can_file_obligation(e.obligation_id) THEN
      RAISE EXCEPTION 'You are not authorised to withdraw this document' USING ERRCODE='42501';
    END IF;
    IF e.version_status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
      RAISE EXCEPTION 'Submitted evidence is durable regulatory record and cannot be withdrawn';
    END IF;
  END IF;

  UPDATE public.return_filing_evidence
     SET withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_reason = trim(_reason)
   WHERE id = _evidence_id;

  PERFORM public.create_audit_log('return_filing', e.return_filing_id, 'RETURN_EVIDENCE_WITHDRAWN',
    jsonb_build_object('evidence_id', _evidence_id, 'reason', trim(_reason)));
END $function$;