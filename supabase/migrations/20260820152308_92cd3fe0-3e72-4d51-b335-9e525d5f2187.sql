CREATE OR REPLACE FUNCTION public.fp_declaration_invitation_create(
  _assessment_id uuid,
  _individual_id uuid,
  _token_hash text,
  _verification_hash text,
  _channel text,
  _expires_at timestamptz,
  _verification_hash_alt text DEFAULT NULL,
  _recipient_email text DEFAULT NULL,
  _recipient_phone text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _assessment record; _row record; _merged jsonb;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');

  IF _channel NOT IN ('EMAIL','SMS','PORTAL') THEN
    RAISE EXCEPTION 'invalid declaration channel %', _channel USING ERRCODE='22023';
  END IF;
  IF _token_hash IS NULL OR length(btrim(_token_hash)) = 0
     OR _verification_hash IS NULL OR length(btrim(_verification_hash)) = 0 THEN
    RAISE EXCEPTION 'token and verification hashes are required' USING ERRCODE='22023';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= now() THEN
    RAISE EXCEPTION 'invitation expiry must be in the future' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _assessment FROM public.fp_assessments WHERE id = _assessment_id FOR UPDATE;
  IF _assessment IS NULL THEN
    RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023';
  END IF;
  IF _assessment.individual_id <> _individual_id THEN
    RAISE EXCEPTION 'individual does not belong to this assessment' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.declaration_invitations (
    individual_id, assessment_id, token_hash, verification_hash, verification_hash_alt,
    channel, recipient_email, recipient_phone, status, expires_at, created_by
  ) VALUES (
    _individual_id, _assessment_id, btrim(_token_hash), btrim(_verification_hash),
    NULLIF(btrim(COALESCE(_verification_hash_alt,'')),''),
    _channel, NULLIF(btrim(COALESCE(_recipient_email,'')),''),
    NULLIF(btrim(COALESCE(_recipient_phone,'')),''),
    'PENDING', _expires_at, _uid
  ) RETURNING * INTO _row;

  _merged := COALESCE(_assessment.declaration_data,'{}'::jsonb) || jsonb_build_object(
    'channel', _channel,
    'requested_at', now(),
    'note', NULLIF(btrim(COALESCE(_note,'')),'')
  );

  UPDATE public.fp_assessments SET declaration_data = _merged WHERE id = _assessment_id;

  PERFORM public.fp_audit_event(
    'fp.declaration.invitation_created','fp_assessment',_assessment_id,
    jsonb_build_object('declaration_data',_assessment.declaration_data),
    jsonb_build_object('declaration_data',_merged,'invitation_id',_row.id),
    jsonb_build_object('individual_id',_individual_id,'assessment_id',_assessment_id,
                       'channel',_channel),
    NULLIF(btrim(COALESCE(_note,'')),''),
    'NOTIFICATION_SENT'::compliance_audit_action);

  RETURN jsonb_build_object('invitation_id',_row.id,'declaration_data',_merged);
END; $function$;

REVOKE ALL ON FUNCTION public.fp_declaration_invitation_create(uuid,uuid,text,text,text,timestamptz,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_declaration_invitation_create(uuid,uuid,text,text,text,timestamptz,text,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_declaration_invitation_create(uuid,uuid,text,text,text,timestamptz,text,text,text,text) TO authenticated, service_role;