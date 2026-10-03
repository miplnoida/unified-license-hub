CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_basis_integrity(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _snap public.supervisory_assessment_policy_snapshot; _rows jsonb := '[]'::jsonb; _x jsonb; _st text; _m text; _ok boolean := true;
BEGIN
  IF auth.uid() IS NULL OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  IF _snap.id IS NULL THEN RETURN jsonb_build_object('status','NO_SNAPSHOT'); END IF;
  FOR _x IN SELECT * FROM jsonb_array_elements(_snap.components) LOOP
    _m := NULL;
    FOREACH _st IN ARRAY ARRAY['APPROVED','ACTIVE','SUPERSEDED','RETIRED','PUBLISHED'] LOOP
      IF public.supervisory_policy_component_legacy_hash_with_status(_x->>'component_type', (_x->>'component_id')::uuid, _st) = _x->>'content_hash' THEN
        _m := _st; EXIT; END IF;
    END LOOP;
    IF _m IS NULL THEN _ok := false; END IF;
    _rows := _rows || jsonb_build_array(jsonb_build_object(
      'component_type', _x->>'component_type', 'component_id', _x->>'component_id',
      'component_version', _x->>'component_version', 'stored_hash', _x->>'content_hash',
      'current_legacy_hash', public.supervisory_policy_component_content_hash(_x->>'component_type', (_x->>'component_id')::uuid),
      'content_unchanged', _m IS NOT NULL, 'status_at_stamp', _m,
      'content_fingerprint', public.supervisory_policy_component_content_fingerprint(_x->>'component_type', (_x->>'component_id')::uuid)));
  END LOOP;
  RETURN jsonb_build_object('status', CASE WHEN _ok THEN 'CONTENT_UNCHANGED' ELSE 'CONTENT_CHANGED' END,
    'snapshot_content_hash', _snap.content_hash, 'fingerprint_algorithm','cfp1', 'components', _rows);
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_policy_component_content_fingerprint(text, uuid) FROM authenticated;