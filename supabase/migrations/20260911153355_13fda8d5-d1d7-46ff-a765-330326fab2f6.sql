-- PCOMP-R2C (1/3): RESPONSE_POLICY contract, normalisation, semantics and compatibility.

-- 1. Server-owned mapping between policy vocabulary and canonical AML-08 operational actions.
CREATE OR REPLACE FUNCTION public.supervisory_response_policy_action_map()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_array(
    jsonb_build_object('policy_action','SUPERVISORY_PLAN','operational_action','OPEN_SUPERVISORY_PLAN',
      'target_kind','SUPERVISORY_PLAN','label','Supervisory plan','ledger_only', false,
      'prerequisite', NULL::text),
    jsonb_build_object('policy_action','REASSESSMENT_REQUIREMENT','operational_action','REQUIRE_REASSESSMENT',
      'target_kind','REASSESSMENT_REQUIREMENT','label','Reassessment requirement','ledger_only', false,
      'prerequisite', NULL::text),
    jsonb_build_object('policy_action','SUPERVISORY_INTERVENTION','operational_action','OPEN_INTERVENTION',
      'target_kind','SUPERVISORY_INTERVENTION','label','Supervisory intervention','ledger_only', false,
      'prerequisite','PLAN'),
    jsonb_build_object('policy_action','EXAMINATION','operational_action','OPEN_EXAMINATION',
      'target_kind','EXAMINATION','label','Examination','ledger_only', false,
      'prerequisite','INTERVENTION'),
    jsonb_build_object('policy_action','SUPERVISORY_FINDING','operational_action','RAISE_FINDING',
      'target_kind','SUPERVISORY_FINDING','label','Supervisory finding','ledger_only', false,
      'prerequisite','ASSESSMENT_ORIGIN'),
    jsonb_build_object('policy_action','ENFORCEMENT_ACTION','operational_action','REFER_TO_ENFORCEMENT',
      'target_kind','ENFORCEMENT_ACTION','label','Enforcement referral','ledger_only', false,
      'prerequisite','FINDING'),
    jsonb_build_object('policy_action','MONITORING','operational_action','RECORD_MONITORING',
      'target_kind', NULL::text,'label','Continued monitoring','ledger_only', true,
      'prerequisite', NULL::text),
    jsonb_build_object('policy_action','DEFERRAL','operational_action','RECORD_DEFERRED',
      'target_kind', NULL::text,'label','Recorded deferral or blocked decision','ledger_only', true,
      'prerequisite', NULL::text));
$function$;

COMMENT ON FUNCTION public.supervisory_response_policy_action_map() IS
'PCOMP-R2C: the single server-owned mapping from RESPONSE_POLICY action vocabulary to the canonical AML-08 consequence actions. Never computed in the client.';

CREATE OR REPLACE FUNCTION public.supervisory_response_policy_operational_action(_policy_action text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT m->>'operational_action' FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m
   WHERE m->>'policy_action' = upper(btrim(COALESCE(_policy_action,'')))
      OR m->>'operational_action' = upper(btrim(COALESCE(_policy_action,'')))
   LIMIT 1;
$function$;

-- 2. Normalised response rules. One rule = one action.
--    Backward compatibility: historical content shaped `{risk_band, actions:[...]}` is expanded
--    into one rule per action at response_level PERMITTED. A short-form action list never
--    silently becomes a supervisory requirement.
CREATE OR REPLACE FUNCTION public.supervisory_response_policy_rules(_content jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT r, i FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(COALESCE(_content->'responses', _content->'rules','null'::jsonb)) = 'array'
           THEN COALESCE(_content->'responses', _content->'rules')
           ELSE '[]'::jsonb END) WITH ORDINALITY AS t(r, i)
  ),
  exploded AS (
    -- modern shape: one action per rule
    SELECT r, i, 0 AS j,
           upper(btrim(COALESCE(r->>'action', r->>'supervisory_action',''))) AS action,
           upper(btrim(COALESCE(r->>'response_level', r->>'expectation', r->>'policy_expectation',''))) AS lvl,
           false AS legacy
      FROM raw
     WHERE COALESCE(NULLIF(btrim(COALESCE(r->>'action', r->>'supervisory_action','')),''), '') <> ''
    UNION ALL
    -- legacy shape: an array of actions under one risk band
    SELECT r, i, a.j, upper(btrim(a.v)) AS action,
           upper(btrim(COALESCE(r->>'response_level', r->>'expectation', r->>'policy_expectation',''))) AS lvl,
           true AS legacy
      FROM raw,
           LATERAL (SELECT v, ord AS j FROM jsonb_array_elements_text(
                      CASE WHEN jsonb_typeof(r->'actions') = 'array' THEN r->'actions' ELSE '[]'::jsonb END)
                    WITH ORDINALITY AS x(v, ord)) a
     WHERE COALESCE(NULLIF(btrim(COALESCE(r->>'action', r->>'supervisory_action','')),''), '') = ''
       AND btrim(a.v) <> ''
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rule_code', COALESCE(NULLIF(btrim(COALESCE(e.r->>'rule_code', e.r->>'code','')),'')
                          || CASE WHEN e.legacy AND e.j > 1 THEN '-' || e.j::text ELSE '' END,
                          'RESP-' || lpad(e.i::text, 2, '0')
                          || CASE WHEN e.legacy THEN '-' || e.j::text ELSE '' END),
    'label', NULLIF(btrim(COALESCE(e.r->>'label', e.r->>'name','')),''),
    'risk_band', upper(btrim(COALESCE(e.r->>'risk_band', e.r->>'rating', e.r->>'band',''))),
    'action', e.action,
    'operational_action', public.supervisory_response_policy_operational_action(e.action),
    'response_level', CASE upper(btrim(COALESCE(e.lvl,'')))
        WHEN 'REQUIRED' THEN 'REQUIRED' WHEN 'MANDATORY' THEN 'REQUIRED'
        WHEN 'RECOMMENDED' THEN 'RECOMMENDED' WHEN 'EXPECTED' THEN 'RECOMMENDED'
        WHEN 'PERMITTED' THEN 'PERMITTED' WHEN 'ALLOWED' THEN 'PERMITTED'
        WHEN 'OPTIONAL' THEN 'PERMITTED'
        WHEN 'PROHIBITED' THEN 'PROHIBITED' WHEN 'FORBIDDEN' THEN 'PROHIBITED'
        WHEN 'NOT_PERMITTED' THEN 'PROHIBITED'
        WHEN '' THEN CASE WHEN e.legacy THEN 'PERMITTED' ELSE '' END
        ELSE upper(btrim(e.lvl)) END,
    'rationale_required', CASE
        WHEN jsonb_typeof(COALESCE(e.r->'rationale_required','null'::jsonb)) = 'boolean'
          THEN (e.r->>'rationale_required')::boolean
        WHEN upper(btrim(COALESCE(e.r->>'rationale_required',''))) IN ('NO','FALSE','N') THEN false
        ELSE true END,
    'deferral_allowed', CASE
        WHEN jsonb_typeof(COALESCE(e.r->'deferral_allowed','null'::jsonb)) = 'boolean'
          THEN (e.r->>'deferral_allowed')::boolean
        WHEN upper(btrim(COALESCE(e.r->>'deferral_allowed',''))) IN ('YES','TRUE','Y') THEN true
        ELSE false END,
    'policy_note', NULLIF(btrim(COALESCE(e.r->>'policy_note', e.r->>'note','')),''),
    -- PCOMP-R2C ownership decision: timeframe_days is preserved but advisory only.
    -- Canonical due dates and overdue/escalation behaviour belong to SLA_POLICY (PCOMP-R2D).
    'advisory_timeframe_days', NULLIF(btrim(COALESCE(e.r->>'timeframe_days','')),'')::numeric::int,
    'timing_authority','ADVISORY_UNTIL_SLA_POLICY',
    'legacy_short_form', e.legacy
    ) ORDER BY e.i, e.j), '[]'::jsonb)
  FROM exploded e;
$function$;

COMMENT ON FUNCTION public.supervisory_response_policy_rules(jsonb) IS
'PCOMP-R2C: normalises RESPONSE_POLICY content into one rule per (risk band, action) with a controlled response level. Legacy actions[] content is read as PERMITTED, never REQUIRED. timeframe_days is preserved as advisory response timing metadata; deadline authority stays with SLA_POLICY.';

-- 3. Content-level semantic errors: indeterminate or self-contradictory response policy.
CREATE OR REPLACE FUNCTION public.supervisory_response_policy_content_errors(_content jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE _rules jsonb; _r jsonb; _e text[] := ARRAY[]::text[]; _n int;
BEGIN
  _rules := public.supervisory_response_policy_rules(_content);

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF COALESCE(_r->>'risk_band','') = '' THEN
      _e := _e || ('rule ' || (_r->>'rule_code') || ' states no risk band');
    END IF;
    IF COALESCE(_r->>'action','') = '' THEN
      _e := _e || ('rule ' || (_r->>'rule_code') || ' states no supervisory action');
    END IF;
    IF _r->>'operational_action' IS NULL THEN
      _e := _e || ('rule ' || (_r->>'rule_code') || ' names supervisory action '
                   || COALESCE(NULLIF(_r->>'action',''),'(blank)')
                   || ', which does not map to a canonical supervisory consequence action');
    END IF;
    IF NOT (jsonb_build_array('REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED')
            @> to_jsonb(COALESCE(_r->>'response_level',''))) THEN
      _e := _e || ('rule ' || (_r->>'rule_code') || ' states policy expectation '
                   || COALESCE(NULLIF(_r->>'response_level',''),'(blank)')
                   || '; use required, recommended, permitted or prohibited');
    END IF;
    IF _r->>'response_level' = 'PROHIBITED' AND COALESCE((_r->>'deferral_allowed')::boolean,false) THEN
      _e := _e || ('rule ' || (_r->>'rule_code')
                   || ' prohibits an action and also allows it to be deferred, which is contradictory');
    END IF;
  END LOOP;

  -- duplicate rule references
  SELECT count(*) INTO _n FROM (
    SELECT r->>'rule_code' c FROM jsonb_array_elements(_rules) r
     GROUP BY 1 HAVING count(*) > 1) d;
  IF _n > 0 THEN
    _e := _e || 'two or more response rules share the same rule reference';
  END IF;

  -- non-deterministic: same risk band and action stated twice
  SELECT count(*) INTO _n FROM (
    SELECT r->>'risk_band' b, r->>'action' a FROM jsonb_array_elements(_rules) r
     GROUP BY 1,2 HAVING count(*) > 1) d;
  IF _n > 0 THEN
    _e := _e || 'the same supervisory action is stated more than once for the same risk band, so the applicable expectation is indeterminate';
  END IF;

  -- REQUIRED and PROHIBITED for the same risk band and action
  SELECT count(*) INTO _n FROM (
    SELECT r->>'risk_band' b, r->>'action' a FROM jsonb_array_elements(_rules) r
     WHERE r->>'response_level' IN ('REQUIRED','PROHIBITED')
     GROUP BY 1,2 HAVING count(DISTINCT r->>'response_level') > 1) d;
  IF _n > 0 THEN
    _e := _e || 'the same supervisory action is both required and prohibited for the same risk band';
  END IF;

  RETURN _e;
END $function$;

-- 4. Evolved authoring contract for RESPONSE_POLICY.
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_contract(_component_type text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _out jsonb;
BEGIN
  IF upper(btrim(COALESCE(_component_type,''))) <> 'RESPONSE_POLICY' THEN
    RETURN public.supervisory_policy_component_content_contract_legacy(_component_type);
  END IF;

  _out := jsonb_build_object(
    'collection','responses',
    'item_label','supervisory response',
    'runtime','RESPONSE_POLICY_RUNTIME',
    'canonical_owner','AML-08 supervisory consequence engine (supervisory_consequence_decision / supervisory_consequence_record)',
    'required_fields', jsonb_build_array('rule_code','risk_band','action','response_level'),
    'field_aliases', jsonb_build_object(
      'action','supervisory_action','response_level','policy_expectation',
      'risk_band','rating','policy_note','note'),
    'enums', jsonb_build_object(
      'response_level', jsonb_build_array('REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED'),
      'risk_band', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED'),
      'action', (SELECT COALESCE(jsonb_agg(m->>'policy_action'), '[]'::jsonb)
                   FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m)),
    'booleans', jsonb_build_array('rationale_required','deferral_allowed'),
    'positive_numbers', jsonb_build_array('timeframe_days'),
    'action_map', public.supervisory_response_policy_action_map(),
    'legacy_shape', jsonb_build_object(
      'field','actions',
      'interpretation','PERMITTED',
      'note','Historical response content that lists several actions under one risk band remains readable and is interpreted as PERMITTED. It is never interpreted as a supervisory requirement.'),
    'timing_ownership', jsonb_build_object(
      'field','timeframe_days','authority','ADVISORY_UNTIL_SLA_POLICY',
      'note','Response policy states what supervisory response is expected. When an action becomes due, overdue or escalated is owned by SLA policy; response timing is advisory only.'));

  RETURN _out;
END $function$;

-- 5. Response policy compatibility, delegated from the policy profile compatibility check.
CREATE OR REPLACE FUNCTION public.supervisory_response_policy_compatibility(_profile_id uuid, _component_id uuid, _methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _content jsonb; _rules jsonb; _r jsonb; _f jsonb := '[]'::jsonb;
        _codes jsonb; _v text; _actions jsonb;
BEGIN
  SELECT content INTO _content FROM public.supervisory_policy_component WHERE id = _component_id;
  _rules := public.supervisory_response_policy_rules(_content);

  SELECT COALESCE(jsonb_agg(m->>'policy_action'), '[]'::jsonb) INTO _actions
    FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m;

  IF _methodology_id IS NULL THEN
    _codes := public.supervisory_policy_vocabulary('RISK_BAND_ORDERED');
    _f := _f || jsonb_build_object('code','RESPONSE_POLICY_WITHOUT_METHODOLOGY','severity','ERROR',
      'component_type','RESPONSE_POLICY',
      'message','Response policy is keyed to the published risk rating, so it may only be bound together with the methodology that owns the rating vocabulary.');
  ELSE
    SELECT COALESCE(jsonb_agg(x->>'code'), '[]'::jsonb) INTO _codes
      FROM jsonb_array_elements(public.supervisory_methodology_rating_order(_methodology_id)) x;
  END IF;

  FOR _v IN SELECT unnest(public.supervisory_response_policy_content_errors(_content)) LOOP
    _f := _f || jsonb_build_object('code','RESPONSE_CONTENT_INVALID','severity','ERROR',
      'component_type','RESPONSE_POLICY','message', initcap(left(_v,1)) || substr(_v,2) || '.');
  END LOOP;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF COALESCE(_r->>'risk_band','') <> '' AND NOT (_codes @> to_jsonb(_r->>'risk_band')) THEN
      _f := _f || jsonb_build_object('code','RESPONSE_RATING_UNKNOWN','severity','ERROR',
        'component_type','RESPONSE_POLICY',
        'message','Risk band '||(_r->>'risk_band')||' is not in the rating vocabulary of the bound methodology.');
    END IF;

    IF COALESCE(_r->>'action','') <> '' AND NOT (_actions @> to_jsonb(_r->>'action')) THEN
      _f := _f || jsonb_build_object('code','RESPONSE_ACTION_UNKNOWN','severity','ERROR',
        'component_type','RESPONSE_POLICY',
        'message','Supervisory action '||(_r->>'action')||' is not in the canonical supervisory consequence catalogue.');
    END IF;

    IF _r->>'action' = 'SUPERVISORY_FINDING' AND _r->>'response_level' = 'REQUIRED' THEN
      _f := _f || jsonb_build_object('code','RESPONSE_FINDING_CANNOT_BE_REQUIRED','severity','ERROR',
        'component_type','RESPONSE_POLICY',
        'message','A risk rating is never an authoritative basis for a supervisory finding. A finding may be permitted or recommended by policy, subject to its canonical origin, but it cannot be required by a rating alone.');
    END IF;

    IF _r->>'action' = 'ENFORCEMENT_ACTION' AND _r->>'response_level' = 'REQUIRED' THEN
      _f := _f || jsonb_build_object('code','RESPONSE_ENFORCEMENT_CANNOT_BE_REQUIRED','severity','ERROR',
        'component_type','RESPONSE_POLICY',
        'message','Enforcement is referred from a canonical supervisory finding, never from a risk rating, so it cannot be required by response policy.');
    END IF;

    IF COALESCE(_r->>'bypass_prerequisites','') <> '' OR (_content ? 'bypass_prerequisites') THEN
      _f := _f || jsonb_build_object('code','RESPONSE_PREREQUISITE_BYPASS_PROHIBITED','severity','ERROR',
        'component_type','RESPONSE_POLICY',
        'message','Response policy may add supervisory expectations but may never bypass canonical prerequisites, permissions or maker-checker controls.');
    END IF;
  END LOOP;

  RETURN _f;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_policy_compatibility(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_compatibility(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_action_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_action_map() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_rules(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_content_errors(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_content_errors(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_operational_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_operational_action(text) TO authenticated, service_role;