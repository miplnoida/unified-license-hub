CREATE OR REPLACE FUNCTION public.fp_declaration_invitation_resend(
  _invitation_id uuid,
  _token_hash text,
  _expires_at timestamptz,
  _recipient_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _prior record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');

  IF _token_hash IS NULL OR length(btrim(_token_hash)) = 0 THEN
    RAISE EXCEPTION 'token hash is required' USING ERRCODE='22023';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= now() THEN
    RAISE EXCEPTION 'invitation expiry must be in the future' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _prior FROM public.declaration_invitations WHERE id = _invitation_id FOR UPDATE;
  IF _prior IS NULL THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE='22023';
  END IF;
  IF _prior.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'a submitted declaration cannot be re-issued' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.declaration_invitations (
    individual_id, assessment_id, token_hash, verification_hash, verification_hash_alt,
    channel, recipient_email, recipient_phone, status, expires_at, created_by
  ) VALUES (
    _prior.individual_id, _prior.assessment_id, btrim(_token_hash),
    _prior.verification_hash, _prior.verification_hash_alt,
    _prior.channel,
    COALESCE(NULLIF(btrim(COALESCE(_recipient_email,'')),''), _prior.recipient_email),
    _prior.recipient_phone, 'SENT', _expires_at, _uid
  ) RETURNING * INTO _row;

  UPDATE public.declaration_invitations SET status = 'EXPIRED' WHERE id = _invitation_id;

  PERFORM public.fp_audit_event(
    'fp.declaration.invitation_reissued','fp_assessment',_prior.assessment_id,
    jsonb_build_object('invitation_id',_invitation_id,'status',_prior.status),
    jsonb_build_object('invitation_id',_row.id,'status','SENT'),
    jsonb_build_object('individual_id',_prior.individual_id,'assessment_id',_prior.assessment_id,
                       'channel',_prior.channel),
    NULL,'NOTIFICATION_SENT'::compliance_audit_action);

  RETURN jsonb_build_object('invitation_id',_row.id);
END; $function$;

REVOKE ALL ON FUNCTION public.fp_declaration_invitation_resend(uuid,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_declaration_invitation_resend(uuid,text,timestamptz,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_declaration_invitation_resend(uuid,text,timestamptz,text) TO authenticated, service_role;