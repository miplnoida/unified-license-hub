CREATE OR REPLACE FUNCTION public.supervisory_assurance_disposition_is_traceable(_signal_id uuid, _disposition text, _module text, _record_id uuid, _reference text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _d text := upper(coalesce(btrim(_disposition), ''));
  _r jsonb;
BEGIN
  IF _d = '' THEN RETURN false; END IF;
  IF _d = 'NO_ACTION_REQUIRED' THEN RETURN true; END IF;
  IF _d = 'REFERRED' THEN RETURN false; END IF;
  IF _d NOT IN ('ACTION_OPENED', 'REASSESSMENT_REQUIRED', 'COVERED_BY_EXISTING_ACTION') THEN
    RETURN false;
  END IF;

  _r := public.supervisory_assurance_link_resolve(_signal_id, _module, _record_id);
  IF NOT COALESCE((_r ->> 'valid')::boolean, false) THEN RETURN false; END IF;

  IF NULLIF(btrim(coalesce(_reference, '')), '') IS NOT NULL
     AND (_r ->> 'reference') IS NOT NULL
     AND btrim(_reference) <> (_r ->> 'reference') THEN
    RETURN false;
  END IF;

  IF _d = 'ACTION_OPENED' THEN
    RETURN COALESCE((_r ->> 'signal_related')::boolean, false)
       AND upper(coalesce(_module,'')) IN
           ('SUPERVISORY_FINDING','SUPERVISORY_REMEDIATION','SUPERVISORY_ATTENTION');
  ELSIF _d = 'REASSESSMENT_REQUIRED' THEN
    RETURN COALESCE((_r ->> 'signal_related')::boolean, false)
       AND upper(coalesce(_module,'')) = 'REASSESSMENT_REQUIREMENT';
  ELSE
    -- COVERED_BY_EXISTING_ACTION: coverage must be proven by canonical provenance
    -- to the underlying condition (finding.signal_id, remediation parent finding
    -- signal_id, or supervisory_attention_origin.signal_id) AND still be open.
    -- Same entity / same domain / similar text / same owner is NOT coverage.
    RETURN COALESCE((_r ->> 'signal_related')::boolean, false)
       AND COALESCE((_r ->> 'is_open')::boolean, false)
       AND upper(coalesce(_module,'')) IN
           ('SUPERVISORY_FINDING','SUPERVISORY_REMEDIATION','SUPERVISORY_ATTENTION');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assurance_record_review(_signal_id uuid, _review_note text DEFAULT NULL::text, _disposition text DEFAULT NULL::text, _disposition_rationale text DEFAULT NULL::text, _linked_module text DEFAULT NULL::text, _linked_record_id uuid DEFAULT NULL::uuid, _linked_reference text DEFAULT NULL::text, _supersedes_review_id uuid DEFAULT NULL::uuid, _correction_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.supervisory_signal;
  _uid uuid := auth.uid();
  _id uuid;
  _disp text := NULLIF(btrim(_disposition), '');
  _mod text := NULLIF(upper(btrim(coalesce(_linked_module, ''))), '');
  _link jsonb;
  _ref text;
  _prev public.supervisory_signal_review;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _s FROM public.supervisory_signal WHERE id = _signal_id;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'Detected condition not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.supervisory_assurance_review_admits(_uid, _s.id) THEN
    RAISE EXCEPTION 'You do not hold supervisory review authority for this entity and domain'
      USING ERRCODE = '42501';
  END IF;

  IF _disp IS NOT NULL AND _disp NOT IN
     ('ACTION_OPENED','REASSESSMENT_REQUIRED','COVERED_BY_EXISTING_ACTION','NO_ACTION_REQUIRED') THEN
    IF _disp = 'REFERRED' THEN
      RAISE EXCEPTION 'No canonical supervisory referral record exists to evidence a referral disposition'
        USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'Unrecognised supervisory disposition' USING ERRCODE = '23514';
  END IF;

  IF _disp = 'NO_ACTION_REQUIRED'
     AND (_disposition_rationale IS NULL OR length(btrim(_disposition_rationale)) < 10) THEN
    RAISE EXCEPTION 'A written rationale is required to record that no further supervisory action is needed'
      USING ERRCODE = '23514';
  END IF;

  IF _disp IN ('ACTION_OPENED','REASSESSMENT_REQUIRED','COVERED_BY_EXISTING_ACTION') THEN
    _link := public.supervisory_assurance_link_resolve(_s.id, _mod, _linked_record_id);
    IF NOT COALESCE((_link ->> 'valid')::boolean, false) THEN
      RAISE EXCEPTION 'The supervisory record linked to this disposition could not be verified (%)',
        COALESCE(_link ->> 'reason', 'LINK_NOT_RELATED') USING ERRCODE = '23514';
    END IF;
    IF _disp = 'COVERED_BY_EXISTING_ACTION'
       AND NOT COALESCE((_link ->> 'signal_related')::boolean, false) THEN
      RAISE EXCEPTION 'The selected supervisory record cannot be proven to cover this detected condition'
        USING ERRCODE = '23514';
    END IF;
    IF NOT public.supervisory_assurance_disposition_is_traceable(
             _s.id, _disp, _mod, _linked_record_id, NULL) THEN
      RAISE EXCEPTION 'The supervisory record linked to this disposition could not be verified (%)',
        COALESCE(_link ->> 'reason', 'LINK_NOT_RELATED') USING ERRCODE = '23514';
    END IF;
    _ref := _link ->> 'reference';   -- server-derived; client value ignored
  ELSE
    _mod := NULL; _linked_record_id := NULL; _ref := NULL;
  END IF;

  IF _supersedes_review_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.supervisory_signal_review WHERE id = _supersedes_review_id;
    IF _prev.id IS NULL OR _prev.signal_id <> _s.id THEN
      RAISE EXCEPTION 'The review being superseded does not belong to this condition'
        USING ERRCODE = '23514';
    END IF;
    IF _prev.superseded_by_review_id IS NOT NULL THEN
      RAISE EXCEPTION 'That review has already been superseded' USING ERRCODE = '23514';
    END IF;
    IF _correction_reason IS NULL OR length(btrim(_correction_reason)) < 10 THEN
      RAISE EXCEPTION 'A written reason is required when superseding an earlier review'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.supervisory_signal_review (
    signal_id, entity_id, domain_code, reviewed_by, reviewed_at, review_note,
    occurrence_count_at_review, last_detected_at_at_review,
    disposition, disposition_rationale, disposition_by, disposition_at,
    linked_module, linked_record_id, linked_reference, provenance,
    supersedes_review_id, correction_reason)
  VALUES (
    _s.id, _s.entity_id, _s.domain_code, _uid, now(), NULLIF(btrim(_review_note), ''),
    _s.occurrence_count, _s.last_detected_at,
    _disp, NULLIF(btrim(_disposition_rationale), ''),
    CASE WHEN _disp IS NULL THEN NULL ELSE _uid END,
    CASE WHEN _disp IS NULL THEN NULL ELSE now() END,
    _mod, _linked_record_id, _ref,
    jsonb_build_object(
      'recorded_from', 'OS-02F Management Assurance',
      'condition_fingerprint', _s.fingerprint,
      'condition_source', jsonb_build_object('table', _s.source_table, 'id', _s.source_id),
      'detector_code', _s.detector_code,
      'authority', 'supervisory_assurance_review_admits',
      'link', _link),
    _supersedes_review_id, NULLIF(btrim(_correction_reason), ''))
  RETURNING id INTO _id;

  IF _supersedes_review_id IS NOT NULL THEN
    PERFORM set_config('app.assurance_supersede', 'on', true);
    UPDATE public.supervisory_signal_review
       SET superseded_by_review_id = _id
     WHERE id = _supersedes_review_id;
    PERFORM set_config('app.assurance_supersede', 'off', true);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (_uid, 'SUPERVISORY_ASSURANCE_REVIEW', 'supervisory_signal_review', _id::text,
          jsonb_build_object('signal_id', _s.id, 'disposition', _disp,
                             'linked_module', _mod, 'linked_record_id', _linked_record_id,
                             'linked_reference', _ref),
          jsonb_build_object('entity_id', _s.entity_id, 'domain_code', _s.domain_code,
                             'supersedes_review_id', _supersedes_review_id));

  RETURN jsonb_build_object('review_id', _id, 'signal_id', _s.id,
                            'disposition', _disp, 'linked_reference', _ref);
END $function$;