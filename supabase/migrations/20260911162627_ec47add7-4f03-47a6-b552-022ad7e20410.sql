-- PCOMP-R2D (1) — SLA_POLICY authoring contract, normalisation, validation, compatibility.

CREATE OR REPLACE FUNCTION public.supervisory_sla_policy_rules(_content jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT r, i FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(COALESCE(_content->'stages', _content->'rules', _content->'slas','null'::jsonb)) = 'array'
           THEN COALESCE(_content->'stages', _content->'rules', _content->'slas')
           ELSE '[]'::jsonb END) WITH ORDINALITY AS t(r, i)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rule_code', COALESCE(NULLIF(btrim(COALESCE(r->>'rule_code', r->>'code','')),''),
                          'SLA-' || lpad(i::text, 2, '0')),
    'label', NULLIF(btrim(COALESCE(r->>'label', r->>'name','')),''),
    'stage', NULLIF(btrim(COALESCE(r->>'stage', r->>'stage_name', r->>'step','')),''),
    'applies_to_action', NULLIF(upper(btrim(COALESCE(r->>'applies_to_action', r->>'action', r->>'supervisory_action',''))),''),
    'operational_action', public.supervisory_response_policy_operational_action(
                            NULLIF(upper(btrim(COALESCE(r->>'applies_to_action', r->>'action', r->>'supervisory_action',''))),'')),
    'risk_band', NULLIF(upper(btrim(COALESCE(r->>'risk_band', r->>'rating', r->>'band',''))),''),
    'duration_days', NULLIF(btrim(COALESCE(r->>'duration_days', r->>'days', r->>'timeframe_days','')),'')::numeric,
    'calendar_mode', CASE upper(btrim(COALESCE(r->>'calendar_mode', r->>'calendar', r->>'day_basis','')))
        WHEN '' THEN 'CALENDAR_DAYS'
        WHEN 'CALENDAR' THEN 'CALENDAR_DAYS'
        WHEN 'CALENDAR_DAYS' THEN 'CALENDAR_DAYS'
        WHEN 'BUSINESS' THEN 'BUSINESS_DAYS'
        WHEN 'BUSINESS_DAYS' THEN 'BUSINESS_DAYS'
        WHEN 'WORKING_DAYS' THEN 'BUSINESS_DAYS'
        ELSE upper(btrim(COALESCE(r->>'calendar_mode', r->>'calendar', r->>'day_basis',''))) END,
    'pause_permitted', CASE
        WHEN jsonb_typeof(COALESCE(r->'pause_permitted','null'::jsonb)) = 'boolean'
          THEN (r->>'pause_permitted')::boolean
        WHEN upper(btrim(COALESCE(r->>'pause_permitted',''))) IN ('YES','TRUE','Y') THEN true
        ELSE false END,
    'pause_reasons', CASE WHEN jsonb_typeof(COALESCE(r->'pause_reasons','null'::jsonb)) = 'array'
        THEN (SELECT COALESCE(jsonb_agg(upper(btrim(v))), '[]'::jsonb)
                FROM jsonb_array_elements_text(r->'pause_reasons') v WHERE btrim(v) <> '')
        ELSE '[]'::jsonb END,
    'warning_percentage', NULLIF(btrim(COALESCE(r->>'warning_percentage', r->>'warning_pct','')),'')::numeric,
    'escalation_tier_profile', NULLIF(btrim(COALESCE(r->>'escalation_tier_profile', r->>'escalation_profile','')),''),
    'breach_severity', CASE upper(btrim(COALESCE(r->>'breach_severity', r->>'severity','')))
        WHEN '' THEN 'MEDIUM' ELSE upper(btrim(COALESCE(r->>'breach_severity', r->>'severity',''))) END,
    'policy_note', NULLIF(btrim(COALESCE(r->>'policy_note', r->>'note','')),'')
    ) ORDER BY i), '[]'::jsonb)
  FROM raw;
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_sla_policy_content_errors(_content jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE _rules jsonb; _r jsonb; _e text[] := ARRAY[]::text[]; _n int;
BEGIN
  _rules := public.supervisory_sla_policy_rules(_content);

  IF _content ? 'bypass_prerequisites' OR _content ? 'suppress_escalation'
     OR _content ? 'auto_close' OR _content ? 'auto_execute' THEN
    _e := _e || ARRAY['SLA policy may state when supervisory work is due, but it may never bypass platform controls, suppress escalation or close supervisory work automatically'];
  END IF;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF COALESCE(_r->>'stage','') = '' THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' names no supervisory stage'];
    END IF;
    IF _r->>'duration_days' IS NULL THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states no duration in days'];
    ELSIF (_r->>'duration_days')::numeric <= 0 THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states a duration of '
                   || (_r->>'duration_days') || ' days; a duration must be greater than zero'];
    END IF;
    IF _r->>'applies_to_action' IS NOT NULL AND _r->>'operational_action' IS NULL THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' times supervisory action '
                   || (_r->>'applies_to_action')
                   || ', which is not in the canonical supervisory consequence catalogue'];
    END IF;
    IF NOT (jsonb_build_array('CALENDAR_DAYS','BUSINESS_DAYS') @> to_jsonb(COALESCE(_r->>'calendar_mode',''))) THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states day basis '
                   || COALESCE(NULLIF(_r->>'calendar_mode',''),'(blank)')
                   || '; use calendar days or business days'];
    END IF;
    IF NOT (jsonb_build_array('LOW','MEDIUM','HIGH','CRITICAL') @> to_jsonb(COALESCE(_r->>'breach_severity',''))) THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states breach severity '
                   || COALESCE(NULLIF(_r->>'breach_severity',''),'(blank)')
                   || '; use low, medium, high or critical'];
    END IF;
    IF _r->>'warning_percentage' IS NOT NULL
       AND ((_r->>'warning_percentage')::numeric <= 0 OR (_r->>'warning_percentage')::numeric >= 100) THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code')
                   || ' states a warning threshold outside 1 to 99 per cent of the elapsed period'];
    END IF;
    IF NOT COALESCE((_r->>'pause_permitted')::boolean,false)
       AND jsonb_array_length(COALESCE(_r->'pause_reasons','[]'::jsonb)) > 0 THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code')
                   || ' lists permitted pause reasons but does not permit the clock to be paused'];
    END IF;
  END LOOP;

  SELECT count(*) INTO _n FROM (
    SELECT r->>'rule_code' c FROM jsonb_array_elements(_rules) r
     GROUP BY 1 HAVING count(*) > 1) d;
  IF _n > 0 THEN
    _e := _e || ARRAY['two or more SLA stages share the same rule reference'];
  END IF;

  SELECT count(*) INTO _n FROM (
    SELECT COALESCE(r->>'applies_to_action','-') a, COALESCE(r->>'risk_band','-') b
      FROM jsonb_array_elements(_rules) r
     WHERE r->>'applies_to_action' IS NOT NULL
     GROUP BY 1,2 HAVING count(*) > 1) d;
  IF _n > 0 THEN
    _e := _e || ARRAY['the same supervisory action is timed more than once for the same risk band, so the applicable deadline is indeterminate'];
  END IF;

  RETURN _e;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_sla_policy_compatibility(_profile_id uuid, _component_id uuid, _methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _content jsonb; _rules jsonb; _r jsonb; _f jsonb := '[]'::jsonb;
        _codes jsonb; _v text; _actions jsonb;
BEGIN
  SELECT content INTO _content FROM public.supervisory_policy_component WHERE id = _component_id;
  _rules := public.supervisory_sla_policy_rules(_content);

  SELECT COALESCE(jsonb_agg(m->>'policy_action'), '[]'::jsonb) INTO _actions
    FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m;

  IF _methodology_id IS NULL THEN
    _codes := public.supervisory_policy_vocabulary('RISK_BAND_ORDERED');
  ELSE
    SELECT COALESCE(jsonb_agg(x->>'code'), '[]'::jsonb) INTO _codes
      FROM jsonb_array_elements(public.supervisory_methodology_rating_order(_methodology_id)) x;
  END IF;

  FOR _v IN SELECT unnest(public.supervisory_sla_policy_content_errors(_content)) LOOP
    _f := _f || jsonb_build_object('code','SLA_CONTENT_INVALID','severity','ERROR',
      'component_type','SLA_POLICY','message', initcap(left(_v,1)) || substr(_v,2) || '.');
  END LOOP;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF _r->>'risk_band' IS NOT NULL AND NOT (_codes @> to_jsonb(_r->>'risk_band')) THEN
      _f := _f || jsonb_build_object('code','SLA_RATING_UNKNOWN','severity','ERROR',
        'component_type','SLA_POLICY',
        'message','Risk band '||(_r->>'risk_band')||' is not in the rating vocabulary of the bound methodology.');
    END IF;
    IF _r->>'applies_to_action' IS NOT NULL AND NOT (_actions @> to_jsonb(_r->>'applies_to_action')) THEN
      _f := _f || jsonb_build_object('code','SLA_ACTION_UNKNOWN','severity','ERROR',
        'component_type','SLA_POLICY',
        'message','Supervisory action '||(_r->>'applies_to_action')||' is not in the canonical supervisory consequence catalogue.');
    END IF;
    IF _r->>'risk_band' IS NOT NULL AND _methodology_id IS NULL THEN
      _f := _f || jsonb_build_object('code','SLA_POLICY_WITHOUT_METHODOLOGY','severity','ERROR',
        'component_type','SLA_POLICY',
        'message','This SLA policy times supervisory work by risk band, so it may only be bound together with the methodology that owns the rating vocabulary.');
    END IF;
  END LOOP;

  RETURN _f;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_sla_policy_rules(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_sla_policy_content_errors(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_sla_policy_compatibility(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_sla_policy_rules(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_sla_policy_content_errors(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_sla_policy_compatibility(uuid, uuid, uuid) TO authenticated, service_role;

-- Replace the placeholder SLA_POLICY authoring contract branch in place.
DO $mig$
DECLARE _def text; _new text; _start int; _stop int; _block text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_policy_component_content_contract' AND pronargs = 1;
  IF _def IS NULL THEN RAISE EXCEPTION 'content contract not found'; END IF;

  _start := position('    WHEN ''SLA_POLICY'' THEN jsonb_build_object(' in _def);
  _stop  := position('    WHEN ''DASHBOARD_POLICY'' THEN jsonb_build_object(' in _def);
  IF _start = 0 OR _stop = 0 OR _stop <= _start THEN
    RAISE EXCEPTION 'R2D: SLA_POLICY contract branch not found';
  END IF;

  _block := '    WHEN ''SLA_POLICY'' THEN jsonb_build_object(' || E'\n'
   || '      ''collection'',''stages'',''item_label'',''SLA stage'',' || E'\n'
   || '      ''runtime'',''SLA_POLICY_RUNTIME'',' || E'\n'
   || '      ''canonical_owner'',''Platform SLA stage engine (sla_stage_instances / sla_stage_events / sla_escalation_tiers)'',' || E'\n'
   || '      ''required_fields'', jsonb_build_array(''rule_code'',''stage'',''duration_days''),' || E'\n'
   || '      ''field_aliases'', jsonb_build_object(' || E'\n'
   || '        ''duration_days'',''days'',''applies_to_action'',''action'',''risk_band'',''rating'',' || E'\n'
   || '        ''calendar_mode'',''calendar'',''escalation_tier_profile'',''escalation_profile'',' || E'\n'
   || '        ''breach_severity'',''severity'',''policy_note'',''note''),' || E'\n'
   || '      ''enums'', jsonb_build_object(' || E'\n'
   || '        ''calendar_mode'', jsonb_build_array(''CALENDAR_DAYS'',''BUSINESS_DAYS''),' || E'\n'
   || '        ''breach_severity'', jsonb_build_array(''LOW'',''MEDIUM'',''HIGH'',''CRITICAL''),' || E'\n'
   || '        ''risk_band'', public.supervisory_policy_vocabulary(''RISK_BAND_ORDERED''),' || E'\n'
   || '        ''applies_to_action'', (SELECT COALESCE(jsonb_agg(m->>''policy_action''), ''[]''::jsonb)' || E'\n'
   || '                                 FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m)),' || E'\n'
   || '      ''booleans'', jsonb_build_array(''pause_permitted''),' || E'\n'
   || '      ''positive_numbers'', jsonb_build_array(''duration_days'',''warning_percentage''),' || E'\n'
   || '      ''action_map'', public.supervisory_response_policy_action_map(),' || E'\n'
   || '      ''timing_ownership'', jsonb_build_object(' || E'\n'
   || '        ''authority'',''SLA_POLICY'',' || E'\n'
   || '        ''note'',''SLA policy owns when supervisory work is due, overdue and escalated. Deadlines, pauses, breaches and escalation are calculated and recorded by the platform SLA stage engine; the policy states the duration, day basis and escalation profile only.''))' || E'\n';

  _new := substr(_def, 1, _start - 1) || _block || substr(_def, _stop);
  EXECUTE _new;
END $mig$;

-- Profile compatibility delegates SLA_POLICY to its own checker.
DO $mig$
DECLARE _def text; _new text; _start int; _stop int; _block text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_policy_profile_compatibility' AND pronargs = 1;
  IF _def IS NULL THEN RAISE EXCEPTION 'profile compatibility not found'; END IF;

  IF position('supervisory_sla_policy_compatibility' in _def) > 0 THEN RETURN; END IF;

  _start := position('    ELSIF _row.component_type = ''SLA_POLICY'' THEN' in _def);
  IF _start = 0 THEN RAISE EXCEPTION 'R2D: SLA_POLICY compatibility branch not found'; END IF;

  _stop := _start + position(E'\n    ELSIF ' in substr(_def, _start + 10));
  IF _stop <= _start THEN RAISE EXCEPTION 'R2D: SLA_POLICY branch terminator not found'; END IF;

  _block := '    ELSIF _row.component_type = ''SLA_POLICY'' THEN' || E'\n'
         || '      _f := _f || public.supervisory_sla_policy_compatibility(_profile_id, _row.id, _meth_id);' || E'\n';

  _new := substr(_def, 1, _start - 1) || _block || substr(_def, _stop + 10);
  EXECUTE _new;
END $mig$;

COMMENT ON FUNCTION public.supervisory_sla_policy_rules(jsonb) IS
'PCOMP-R2D. Normalises SLA policy content into governed stage rules. Duration, day basis, pause permission, warning threshold, escalation profile and breach severity are policy statements; every deadline, pause, breach and escalation is calculated and recorded by the canonical platform SLA stage engine.';