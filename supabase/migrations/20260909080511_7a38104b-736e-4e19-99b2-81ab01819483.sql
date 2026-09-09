
-- ============ Methodology validation: rule findings ============
CREATE OR REPLACE FUNCTION public.supervisory_methodology_rule_findings(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _f jsonb := '[]'::jsonb; _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = _methodology_id AND q.active AND q.question_class = 'CONDITIONAL'
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question_rule r
                      WHERE r.question_id = q.id AND r.rule_kind = 'TRIGGER' AND r.active);
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','CONDITIONAL_RULE_MISSING','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s conditional question(s) have no executable structured trigger rule. Structured applicability must be authored before this version can determine assessment scope.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question_rule r
    JOIN public.supervisory_methodology_question q ON q.id = r.question_id
   WHERE r.methodology_id = _methodology_id AND r.active AND q.methodology_id <> r.methodology_id;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','RULE_CROSS_METHODOLOGY_REFERENCE','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s applicability rule(s) reference a question owned by another methodology version.', _n)); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question_rule r
   WHERE r.methodology_id = _methodology_id AND r.active
     AND jsonb_array_length(public.supervisory_question_rule_check(r.rule_definition, 0)) > 0;
  IF _n > 0 THEN _f := _f || jsonb_build_object('code','RULE_MALFORMED','severity','BLOCKING',
    'object','QUESTION','subject',NULL,'count',_n,
    'message', format('%s applicability rule(s) are malformed or refer to a source the server cannot resolve.', _n)); END IF;

  RETURN _f;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_methodology_rule_findings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_rule_findings(uuid) TO authenticated, service_role;

DO $do$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_methodology_validate';
  IF _def IS NULL THEN RAISE EXCEPTION 'supervisory_methodology_validate not found'; END IF;
  IF position('supervisory_methodology_rule_findings' IN _def) > 0 THEN RETURN; END IF;
  _new := replace(_def,
    E'  RETURN jsonb_build_object(\n    \'methodology_id\', _m.id,',
    E'  _f := _f || public.supervisory_methodology_rule_findings(_methodology_id);\n\n  RETURN jsonb_build_object(\n    \'methodology_id\', _m.id,');
  IF _new = _def THEN RAISE EXCEPTION 'validate anchor not found'; END IF;
  EXECUTE _new;
END $do$;

-- ============ Answerability: only included questions ============
DO $do$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_assessment_question_upsert';
  IF position('supervisory_assessment_question_plan_state' IN _def) > 0 THEN RETURN; END IF;

  _new := replace(_def,
    E'        _actions text[]; _ad_id uuid; _md public.supervisory_methodology_dimension;',
    E'        _actions text[]; _ad_id uuid; _md public.supervisory_methodology_dimension; _pstate text;');
  IF _new = _def THEN RAISE EXCEPTION 'upsert declare anchor not found'; END IF;
  _def := _new;

  _new := replace(_def,
    E'  _resp := upper(btrim(COALESCE(_response,\'\')));',
    E'  -- Scope authority: where a governed question plan exists, only questions the\n'
    '  -- server placed in scope may be answered. Not triggered / out of scope are not\n'
    '  -- answerable, and "not applicable" remains an officer response, never a scope state.\n'
    '  _pstate := public.supervisory_assessment_question_plan_state(_assessment_id, _question_id);\n'
    '  IF _pstate IS NOT NULL AND _pstate NOT LIKE ''INCLUDED%'' THEN\n'
    '    RAISE EXCEPTION ''question_not_in_scope: this question is %s in the governed question plan for this assessment and cannot be answered'', lower(replace(_pstate,''_'','' ''))\n'
    '      USING ERRCODE = ''42501''; END IF;\n\n'
    '  _resp := upper(btrim(COALESCE(_response,'''')));');
  IF _new = _def THEN RAISE EXCEPTION 'upsert body anchor not found'; END IF;
  EXECUTE _new;
END $do$;

-- ============ Completeness respects the plan ============
DO $do$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_assessment_question_gaps_internal';
  IF position('supervisory_assessment_question_plan_state' IN _def) > 0 THEN RETURN; END IF;
  _new := replace(_def,
    E'     WHERE qq.active AND qq.mandatory AND d.active',
    E'     WHERE qq.active AND qq.mandatory AND d.active\n'
    '       AND (NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan pp\n'
    '                         WHERE pp.assessment_id = _assessment_id)\n'
    '            OR COALESCE(public.supervisory_assessment_question_plan_state(_assessment_id, qq.id),'''')\n'
    '               LIKE ''INCLUDED%'')');
  IF _new = _def THEN RAISE EXCEPTION 'gaps anchor not found'; END IF;
  EXECUTE _new;
END $do$;

-- ============ Plan materialised inside programmed creation ============
DO $do$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_assessment_create_programmed';
  IF position('question_plan_materialise_internal' IN _def) > 0 THEN RETURN; END IF;

  _new := replace(_def,
    E'        _allowed jsonb; _trig text; _period jsonb; _ps date; _pe date; _prior uuid; _res jsonb; _mode text;',
    E'        _allowed jsonb; _trig text; _period jsonb; _ps date; _pe date; _prior uuid; _res jsonb; _mode text;\n        _plan jsonb;');
  IF _new = _def THEN RAISE EXCEPTION 'programmed declare anchor not found'; END IF;
  _def := _new;

  _new := replace(_def,
    E'  RETURN _res || jsonb_build_object(\'programme\', jsonb_build_object(',
    E'  -- Question scope is resolved and frozen in this same transaction. If the exact\n'
    '  -- configuration cannot determine scope, the assessment is not created at all.\n'
    '  _plan := public.supervisory_assessment_question_plan_materialise_internal((_res->>''id'')::uuid, auth.uid());\n\n'
    '  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)\n'
    '  VALUES ((_res->>''id'')::uuid, ''QUESTION_PLAN_MATERIALISED'',\n'
    '    ''Question scope resolved from the exact methodology version and assessment programme.'',\n'
    '    jsonb_build_object(''methodology_id'', _res->>''methodology_id'', ''programme_id'', _p.id,\n'
    '      ''programme_code'', _p.programme_code, ''programme_version'', _set.set_version,\n'
    '      ''summary'', _plan), auth.uid());\n\n'
    '  RETURN _res || jsonb_build_object(''question_plan'', _plan) || jsonb_build_object(''programme'', jsonb_build_object(');
  IF _new = _def THEN RAISE EXCEPTION 'programmed return anchor not found'; END IF;
  EXECUTE _new;
END $do$;
