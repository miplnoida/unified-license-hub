CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_purge(_methodology_id uuid, _rationale text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; _responses integer := 0;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status <> 'DRAFT' THEN
    RAISE EXCEPTION 'methodology_immutable: questions may only be purged on a DRAFT version (status %)', _status
      USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  -- Recorded supervisory answers live in supervisory_assessment_question_response.
  -- The earlier reference to a non-existent table made this guard unreachable.
  SELECT count(*) INTO _responses
    FROM public.supervisory_assessment_question_response r
    JOIN public.supervisory_methodology_question q ON q.id = r.methodology_question_id
   WHERE q.methodology_id = _methodology_id;
  IF _responses > 0 THEN
    RAISE EXCEPTION 'refused: % recorded responses reference this version''s questions', _responses
      USING ERRCODE = '22023'; END IF;

  WITH del AS (
    DELETE FROM public.supervisory_methodology_question WHERE methodology_id = _methodology_id RETURNING 1)
  SELECT count(*) INTO _n FROM del;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_PURGE', btrim(_rationale), _uid, jsonb_build_object('removed', _n));
  RETURN _n;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_question_purge(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_purge(uuid, text) TO authenticated, service_role;