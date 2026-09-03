CREATE OR REPLACE FUNCTION public.supervisory_finding_response(_finding_id uuid, _response_state text, _management_response text, _proposed_action text DEFAULT NULL::text, _responsible_person text DEFAULT NULL::text, _target_date date DEFAULT NULL::date, _attachments jsonb DEFAULT NULL::jsonb, _received_from text DEFAULT NULL::text, _received_date date DEFAULT NULL::date, _channel text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.supervisory_finding; _state text; _internal boolean;
        _entity_side boolean; _source text; _chan text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO _row FROM public.supervisory_finding WHERE id = _finding_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: finding' USING ERRCODE='22023'; END IF;
  IF _row.status NOT IN ('ISSUED','MANAGEMENT_RESPONSE') THEN
    RAISE EXCEPTION 'response_not_open: finding is %', _row.status USING ERRCODE='22023'; END IF;

  _state := upper(COALESCE(_response_state,''));
  IF _state NOT IN ('ACCEPTED','DISPUTED','PARTIALLY_ACCEPTED') THEN
    RAISE EXCEPTION 'invalid_response_state: %', _state USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_management_response,''))) < 10 THEN
    RAISE EXCEPTION 'a management response of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  _internal := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'aml_supervision.finding_manage','supervisory_spine.edit',
      'prudential_supervision.manage_remediation','inspection_management.edit']);
  -- "entity side" means the regulated entity itself: an external portal user of
  -- that entity. A supervisory assignment makes an officer internal, never the
  -- respondent, so it must not be used to classify who answered.
  _entity_side := EXISTS (SELECT 1 FROM public.external_user_entity_ids(_uid) e
                           WHERE e = _row.entity_id);
  IF NOT _internal AND NOT _entity_side
     AND NOT public.user_has_entity_assignment(_uid, _row.entity_id) THEN
    RAISE EXCEPTION 'not_authorized: you may only respond to findings for your own entity' USING ERRCODE='42501'; END IF;

  -- provenance is derived from who is acting: an officer transcribing a letter is
  -- never recorded as the entity having answered in the platform.
  _source := CASE WHEN _entity_side THEN 'ENTITY_SUBMITTED' ELSE 'OFFICER_RECORDED' END;
  _chan := upper(NULLIF(btrim(COALESCE(_channel,'')), ''));

  IF _source = 'OFFICER_RECORDED' THEN
    IF length(btrim(COALESCE(_received_from,''))) < 3 THEN
      RAISE EXCEPTION 'response_provenance_required: record who the response was received from' USING ERRCODE='22023'; END IF;
    IF _received_date IS NULL THEN
      RAISE EXCEPTION 'response_provenance_required: record the date the response was received' USING ERRCODE='22023'; END IF;
    IF _received_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'response_provenance_invalid: the receipt date cannot be in the future' USING ERRCODE='22023'; END IF;
    IF _row.issued_at IS NOT NULL AND _received_date < _row.issued_at::date THEN
      RAISE EXCEPTION 'response_provenance_invalid: the response cannot predate issue of the finding' USING ERRCODE='22023'; END IF;
    IF _chan IS NULL OR _chan NOT IN ('EMAIL','LETTER','MEETING','TELEPHONE','OTHER') THEN
      RAISE EXCEPTION 'response_provenance_required: record the channel the response arrived through' USING ERRCODE='22023'; END IF;
  ELSE
    _chan := 'PORTAL';
  END IF;

  UPDATE public.supervisory_finding SET
    response_state = _state,
    management_response = btrim(_management_response),
    proposed_action = COALESCE(_proposed_action, proposed_action),
    responsible_person = COALESCE(_responsible_person, responsible_person),
    response_target_date = COALESCE(_target_date, response_target_date),
    response_attachments = COALESCE(_attachments, response_attachments),
    response_source = _source,
    response_received_from = CASE WHEN _source='OFFICER_RECORDED' THEN btrim(_received_from) ELSE NULL END,
    response_received_date = CASE WHEN _source='OFFICER_RECORDED' THEN _received_date ELSE CURRENT_DATE END,
    response_channel = _chan,
    response_recorded_by = _uid,
    response_recorded_at = now(),
    -- response_by remains the entity's own act; an officer transcription leaves it unset
    response_by = CASE WHEN _source='ENTITY_SUBMITTED' THEN _uid ELSE NULL END,
    response_at = now(),
    status = CASE WHEN status = 'ISSUED' THEN 'MANAGEMENT_RESPONSE' ELSE status END,
    updated_at = now()
  WHERE id = _finding_id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_finding_id, 'MANAGEMENT_RESPONSE', _row.status, 'MANAGEMENT_RESPONSE',
          btrim(_management_response), _uid,
          jsonb_build_object('response_state', _state, 'response_source', _source,
                             'received_from', CASE WHEN _source='OFFICER_RECORDED' THEN btrim(_received_from) END,
                             'received_date', CASE WHEN _source='OFFICER_RECORDED' THEN _received_date END,
                             'channel', _chan));
  RETURN _finding_id;
END $function$;