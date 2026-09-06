CREATE OR REPLACE FUNCTION public.supervisory_assurance_record_review(
  _signal_id uuid,
  _review_note text DEFAULT NULL,
  _disposition text DEFAULT NULL,
  _disposition_rationale text DEFAULT NULL,
  _linked_module text DEFAULT NULL,
  _linked_record_id uuid DEFAULT NULL,
  _linked_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  _s public.supervisory_signal;
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _s FROM public.supervisory_signal WHERE id = _signal_id;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'Detected condition not found or not visible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.supervisory_monitoring_scope_admits(
           _uid, _s.domain_code, _s.entity_id, NULL, NULL) THEN
    RAISE EXCEPTION 'Entity is outside your supervisory remit' USING ERRCODE = '42501';
  END IF;

  IF _disposition = 'NO_ACTION_REQUIRED'
     AND (_disposition_rationale IS NULL
          OR length(btrim(_disposition_rationale)) < 10) THEN
    RAISE EXCEPTION 'A written rationale is required to record that no further supervisory action is needed'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.supervisory_signal_review (
    signal_id, entity_id, domain_code, reviewed_by, reviewed_at, review_note,
    occurrence_count_at_review, last_detected_at_at_review,
    disposition, disposition_rationale, disposition_by, disposition_at,
    linked_module, linked_record_id, linked_reference, provenance)
  VALUES (
    _s.id, _s.entity_id, _s.domain_code, _uid, now(), NULLIF(btrim(_review_note),''),
    _s.occurrence_count, _s.last_detected_at,
    NULLIF(btrim(_disposition),''), NULLIF(btrim(_disposition_rationale),''),
    CASE WHEN NULLIF(btrim(_disposition),'') IS NULL THEN NULL ELSE _uid END,
    CASE WHEN NULLIF(btrim(_disposition),'') IS NULL THEN NULL ELSE now() END,
    NULLIF(btrim(_linked_module),''), _linked_record_id, NULLIF(btrim(_linked_reference),''),
    jsonb_build_object(
      'recorded_from','OS-02F Management Assurance',
      'condition_fingerprint', _s.fingerprint,
      'condition_source', jsonb_build_object('table', _s.source_table, 'id', _s.source_id),
      'detector_code', _s.detector_code))
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (_uid, 'SUPERVISORY_CONDITION_REVIEW_RECORDED', 'supervisory_signal_review', _id,
    jsonb_build_object('signal_id', _s.id, 'disposition', _disposition),
    jsonb_build_object('domain_code', _s.domain_code, 'entity_id', _s.entity_id,
                       'detector_code', _s.detector_code,
                       'module','OS-02F_MANAGEMENT_ASSURANCE'));

  RETURN jsonb_build_object('review_id', _id, 'signal_id', _s.id,
                            'disposition', _disposition, 'reviewed_at', now());
END $$;

REVOKE ALL ON FUNCTION public.supervisory_assurance_record_review(
  uuid,text,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_record_review(
  uuid,text,text,text,text,uuid,text) TO authenticated, service_role;