-- AML-03 certification fix: the programme create/register capability contract
-- resolved regulator scope with no capability, so supervisory_authorised_regulator_options
-- fell back to the super-admin-only branch and can_create was false for every
-- regulator-scoped supervisory administrator, even though
-- supervisory_assessment_programme_set_create accepts their write.

CREATE OR REPLACE FUNCTION public.supervisory_authorised_regulator_options_any(_capability text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d record; _o jsonb;
        _seen jsonb := '{}'::jsonb; _rows jsonb := '[]'::jsonb;
        _n int; _active jsonb := NULL; _cross boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  FOR _d IN SELECT domain_code FROM public.supervisory_domain_authority ORDER BY domain_code LOOP
    IF NOT public.supervisory_domain_valid(_d.domain_code) THEN CONTINUE; END IF;
    _o := public.supervisory_authorised_regulator_options(_d.domain_code, _capability);
    _cross := _cross OR COALESCE((_o->>'cross_regulator_allowed')::boolean, false);
    SELECT COALESCE(jsonb_object_agg(r->>'id', r), '{}'::jsonb) INTO _seen
      FROM (SELECT r FROM jsonb_array_elements(_seen) AS a(r)
            UNION ALL
            SELECT r FROM jsonb_array_elements(COALESCE(_o->'regulators','[]'::jsonb)) AS b(r)) u(r);
  END LOOP;

  SELECT COALESCE(jsonb_agg(v ORDER BY v->>'name'), '[]'::jsonb) INTO _rows
    FROM jsonb_each(_seen) AS e(k, v);

  _n := jsonb_array_length(_rows);
  IF _n = 1 THEN _active := _rows->0; END IF;

  RETURN jsonb_build_object(
    'selectable_count', _n,
    'cross_regulator_allowed', (_n > 1 AND _cross),
    'active_regulator', _active,
    'regulators', _rows,
    'reason', CASE WHEN _n = 0
                   THEN 'No active regulator is available in your authorised scope.'
                   ELSE NULL END);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_authorised_regulator_options_any(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_authorised_regulator_options_any(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_create_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _scope jsonb; _domains jsonb := '[]'::jsonb;
        _d record; _ok boolean; _reg uuid; _reason text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  -- Scope is resolved across the supervisory domains this officer administers.
  _scope := public.supervisory_authorised_regulator_options_any(NULL);
  _reg := NULLIF(_scope->'active_regulator'->>'id','')::uuid;

  -- A domain is offered only where the server would actually accept the write.
  FOR _d IN SELECT domain_code FROM public.supervisory_domain_authority ORDER BY domain_code LOOP
    IF NOT public.supervisory_domain_valid(_d.domain_code) THEN CONTINUE; END IF;
    _ok := false;
    BEGIN
      IF _reg IS NULL THEN
        PERFORM public.supervisory_domain_require_manage(_d.domain_code);
      ELSE
        PERFORM public.supervisory_domain_require_manage_for_regulator(_d.domain_code, _reg);
      END IF;
      _ok := true;
    EXCEPTION WHEN OTHERS THEN _ok := false; _reason := COALESCE(_reason, SQLERRM); END;
    IF _ok THEN _domains := _domains || to_jsonb(_d.domain_code); END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'can_create', jsonb_array_length(_domains) > 0
                  AND COALESCE((_scope->>'selectable_count')::int,0) > 0,
    'reason', CASE
       WHEN COALESCE((_scope->>'selectable_count')::int,0) = 0 THEN _scope->>'reason'
       WHEN jsonb_array_length(_domains) = 0
         THEN COALESCE(_reason,'You do not hold authority to configure supervisory assessment programmes.')
       END,
    'domains', _domains,
    'origin', 'REGULATOR_AUTHORED',
    'status', 'DRAFT',
    'regulators', COALESCE(_scope->'regulators','[]'::jsonb),
    'selectable_regulator_count', COALESCE(_scope->'selectable_count','0'::jsonb),
    'cross_regulator_allowed', COALESCE(_scope->'cross_regulator_allowed','false'::jsonb),
    'active_regulator', COALESCE(_scope->'active_regulator','null'::jsonb),
    'regulator_scope_reason', _scope->'reason');
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_register_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _scope jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _scope := public.supervisory_authorised_regulator_options_any(NULL);

  RETURN jsonb_build_object(
    'domains', (SELECT COALESCE(jsonb_agg(DISTINCT domain_code), '[]'::jsonb)
                  FROM public.supervisory_assessment_programme_set s
                 WHERE public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)),
    'origins', jsonb_build_array('MIPL_REFERENCE','REGULATOR_ADOPTED','REGULATOR_AUTHORED'),
    'statuses', jsonb_build_array('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED'),
    'regulators', COALESCE(_scope->'regulators','[]'::jsonb),
    'selectable_regulator_count', COALESCE(_scope->'selectable_count','0'::jsonb),
    'cross_regulator_allowed', COALESCE(_scope->'cross_regulator_allowed','false'::jsonb),
    'active_regulator', COALESCE(_scope->'active_regulator','null'::jsonb),
    'regulator_scope_reason', _scope->'reason',
    'period_rules', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='PERIOD_RULE' AND v.is_active),
    'question_classes', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='QUESTION_CLASS' AND v.is_active),
    'assessment_types', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='ASSESSMENT_TYPE' AND v.is_active),
    'trigger_codes', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='TRIGGER_CODE' AND v.is_active));
END $function$;