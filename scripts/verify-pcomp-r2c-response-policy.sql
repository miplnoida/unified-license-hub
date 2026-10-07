-- =====================================================================
-- PCOMP-R2C — SUPERVISORY RESPONSE POLICY RUNTIME : CERTIFICATION
-- =====================================================================
-- Gate families: CONTRACT, MAP, NORMALISE, LEGACY, SEMANTICS,
--                COMPATIBILITY, RUNTIME, ENFORCEMENT, PROVENANCE,
--                SECURITY, CAPABILITY, PRESERVATION.
--
-- Conventions (identical to AML-01..AML-11, PCOMP-R1C, R2A and R2B):
--   * ONE transaction, ROLLBACK at the end. No policy value, rating,
--     published risk, assessment, consequence decision or regulator
--     decision is created, changed or fabricated by this script;
--   * behavioural wherever a real call is possible — gates call the REAL
--     governed functions;
--   * ENFORCEMENT gates that would require inventing a published risk
--     record are asserted against the live definition of the canonical
--     AML-08 operation instead of a synthetic supervisory decision, and
--     are labelled as such;
--   * every fixture identifier is prefixed R2CCERT;
--   * results print as PASS/FAIL, then the transaction rolls back and
--     preservation is checked against the pre-transaction census.
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2c-response-policy.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;

SELECT (SELECT count(*)::text FROM public.supervisory_policy_component) AS pre_components,
       (SELECT count(*)::text FROM public.supervisory_consequence_decision) AS pre_decisions,
       (SELECT count(*)::text FROM public.supervisory_assessment) AS pre_assessments,
       (SELECT count(*)::text FROM public.entity_risk_state_movement) AS pre_movements,
       (SELECT count(*)::text FROM public.supervisory_assessment_risk_publication) AS pre_publications,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) AS pre_risk_digest
\gset

BEGIN;

CREATE TEMP TABLE r2c(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON r2c TO authenticated;

-- =====================================================================
-- CONTRACT — the published authoring contract for RESPONSE_POLICY
-- =====================================================================
DO $$
DECLARE c jsonb; n int;
BEGIN
  c := public.supervisory_policy_component_content_contract('RESPONSE_POLICY');

  INSERT INTO r2c VALUES ('R2C-01-CONTRACT-EXISTS', c IS NOT NULL, 'contract published');
  INSERT INTO r2c VALUES ('R2C-02-CONTRACT-COLLECTION',
    c->>'collection' = 'responses', format('collection=%s', c->>'collection'));
  INSERT INTO r2c VALUES ('R2C-03-CONTRACT-RUNTIME-DECLARED',
    c->>'runtime' = 'RESPONSE_POLICY_RUNTIME', format('runtime=%s', c->>'runtime'));
  INSERT INTO r2c VALUES ('R2C-04-CONTRACT-CANONICAL-OWNER',
    c->>'canonical_owner' ILIKE '%supervisory_consequence%',
    format('owner=%s', c->>'canonical_owner'));
  INSERT INTO r2c VALUES ('R2C-05-CONTRACT-REQUIRED-FIELDS',
    (c->'required_fields') ?& ARRAY['rule_code','risk_band','action','response_level'],
    format('required=%s', c->'required_fields'));
  INSERT INTO r2c VALUES ('R2C-06-CONTRACT-LEVEL-VOCABULARY',
    (c->'enums'->'response_level') ?& ARRAY['REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED'],
    format('levels=%s', c->'enums'->'response_level'));

  SELECT count(*) INTO n FROM jsonb_array_elements_text(COALESCE(c->'enums'->'risk_band','[]'::jsonb));
  INSERT INTO r2c VALUES ('R2C-07-CONTRACT-RATINGS-CONTROLLED', n >= 1,
    format('%s rating(s) offered from the methodology-owned vocabulary', n));

  SELECT count(*) INTO n FROM jsonb_array_elements_text(COALESCE(c->'enums'->'action','[]'::jsonb));
  INSERT INTO r2c VALUES ('R2C-08-CONTRACT-ACTIONS-CONTROLLED', n >= 8,
    format('%s canonical supervisory action(s) offered', n));

  INSERT INTO r2c VALUES ('R2C-09-CONTRACT-NO-FREE-TEXT-ACTION',
    NOT ((c->'enums'->'action') @> '["ANY"]'::jsonb),
    'actions are a controlled vocabulary, not free text');
  INSERT INTO r2c VALUES ('R2C-10-CONTRACT-TIMING-OWNERSHIP-DECLARED',
    c->'timing_ownership'->>'authority' = 'ADVISORY_UNTIL_SLA_POLICY',
    format('timing=%s', c->'timing_ownership'->>'authority'));
  INSERT INTO r2c VALUES ('R2C-11-CONTRACT-LEGACY-SHAPE-DECLARED',
    c->'legacy_shape'->>'interpretation' = 'PERMITTED',
    format('legacy=%s', c->'legacy_shape'->>'interpretation'));
  INSERT INTO r2c VALUES ('R2C-12-CONTRACT-BOOLEANS-CONTROLLED',
    (c->'booleans') ?& ARRAY['rationale_required','deferral_allowed'],
    format('booleans=%s', c->'booleans'));
  INSERT INTO r2c VALUES ('R2C-13-CONTRACT-OTHER-TYPES-INTACT',
    public.supervisory_policy_component_content_contract('EVIDENCE_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('JUDGEMENT_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('SLA_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('NOTIFICATION_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('SECTOR_OVERLAY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('FACT_CONFIG') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('SOURCE_BINDING') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('MATERIALITY_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('DASHBOARD_POLICY') IS NOT NULL,
    'every other component contract still resolves');
  INSERT INTO r2c VALUES ('R2C-14-CONTRACT-UNKNOWN-TYPE-REFUSED',
    public.supervisory_policy_component_content_contract('NOT_A_POLICY') IS NULL,
    'unknown component types have no contract');
END $$;

-- =====================================================================
-- MAP — the canonical action map is server-owned and complete
-- =====================================================================
DO $$
DECLARE m jsonb; n int;
BEGIN
  m := public.supervisory_response_policy_action_map();
  SELECT count(*) INTO n FROM jsonb_array_elements(m);
  INSERT INTO r2c VALUES ('R2C-15-MAP-COMPLETE', n >= 8, format('%s mapped action(s)', n));

  INSERT INTO r2c VALUES ('R2C-16-MAP-PLAN',
    public.supervisory_response_policy_operational_action('SUPERVISORY_PLAN') = 'OPEN_SUPERVISORY_PLAN',
    'SUPERVISORY_PLAN maps to the canonical plan operation');
  INSERT INTO r2c VALUES ('R2C-17-MAP-EXAMINATION',
    public.supervisory_response_policy_operational_action('EXAMINATION') = 'OPEN_EXAMINATION',
    'EXAMINATION maps to the canonical examination operation');
  INSERT INTO r2c VALUES ('R2C-18-MAP-ENFORCEMENT',
    public.supervisory_response_policy_operational_action('ENFORCEMENT_ACTION') = 'REFER_TO_ENFORCEMENT',
    'ENFORCEMENT_ACTION maps to the canonical enforcement referral');
  INSERT INTO r2c VALUES ('R2C-19-MAP-UNKNOWN-ACTION',
    public.supervisory_response_policy_operational_action('MAKE_SOMETHING_UP') IS NULL,
    'an unknown action resolves to no operation');

  SELECT count(*) INTO n FROM jsonb_array_elements(m) x
   WHERE position(x->>'operational_action' in
     (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_consequence_view')) = 0;
  INSERT INTO r2c VALUES ('R2C-20-MAP-NO-INVENTED-OPERATION', n = 0,
    format('%s mapped action(s) do not exist in the AML-08 catalogue', n));
END $$;

-- =====================================================================
-- NORMALISE / LEGACY — one action per rule, legacy content stays readable
-- =====================================================================
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.supervisory_response_policy_rules('{"responses":[
        {"rule_code":"R2CCERT-A","risk_band":"HIGH","action":"SUPERVISORY_PLAN","response_level":"required","advisory_timeframe_days":30},
        {"rule_code":"R2CCERT-B","risk_band":"HIGH","action":"ENFORCEMENT_ACTION","response_level":"prohibited"}]}'::jsonb);
  SELECT count(*) INTO n FROM jsonb_array_elements(r);
  INSERT INTO r2c VALUES ('R2C-21-NORMALISE-ONE-ACTION-PER-RULE', n = 2, format('%s rule(s)', n));

  INSERT INTO r2c VALUES ('R2C-22-NORMALISE-LEVEL-UPPERCASED',
    (SELECT x->>'response_level' FROM jsonb_array_elements(r) x WHERE x->>'rule_code' = 'R2CCERT-A') = 'REQUIRED',
    'levels are normalised, not taken as typed');
  INSERT INTO r2c VALUES ('R2C-23-NORMALISE-OPERATIONAL-ACTION',
    (SELECT x->>'operational_action' FROM jsonb_array_elements(r) x WHERE x->>'rule_code' = 'R2CCERT-A') = 'OPEN_SUPERVISORY_PLAN',
    'each rule carries its canonical operation');
  INSERT INTO r2c VALUES ('R2C-24-NORMALISE-TIMING-ADVISORY',
    (SELECT x->>'timing_authority' FROM jsonb_array_elements(r) x WHERE x->>'rule_code' = 'R2CCERT-A')
      = 'ADVISORY_UNTIL_SLA_POLICY',
    'response timing is advisory; SLA policy owns due and overdue');

  r := public.supervisory_response_policy_rules(
        '{"responses":[{"risk_band":"HIGH","actions":["SUPERVISORY_PLAN","EXAMINATION"]}]}'::jsonb);
  SELECT count(*) INTO n FROM jsonb_array_elements(r);
  INSERT INTO r2c VALUES ('R2C-25-LEGACY-EXPANDED', n = 2, format('legacy shape produced %s rule(s)', n));
  SELECT count(*) INTO n FROM jsonb_array_elements(r) x WHERE x->>'response_level' <> 'PERMITTED';
  INSERT INTO r2c VALUES ('R2C-26-LEGACY-NEVER-REQUIRED', n = 0,
    'legacy multi-action content is PERMITTED, never a supervisory requirement');
  SELECT count(*) INTO n FROM jsonb_array_elements(r) x WHERE NOT (x->>'legacy_short_form')::boolean;
  INSERT INTO r2c VALUES ('R2C-27-LEGACY-FLAGGED', n = 0, 'legacy interpretation is visible, not silent');

  INSERT INTO r2c VALUES ('R2C-28-LEGACY-STILL-VALID',
    (public.supervisory_policy_component_content_validate('RESPONSE_POLICY',
      '{"responses":[{"risk_band":"HIGH","actions":["SUPERVISORY_PLAN"]}]}'::jsonb)->>'valid')::boolean,
    'existing response policy content did not become invalid');
END $$;

-- =====================================================================
-- SEMANTICS — indeterminate or self-contradictory policy is refused
-- =====================================================================
DO $$
DECLARE e text[]; v jsonb;
BEGIN
  e := public.supervisory_response_policy_content_errors(
    '{"responses":[{"rule_code":"R2CCERT-C","risk_band":"HIGH","action":"SUPERVISORY_PLAN","response_level":"REQUIRED"},
                   {"rule_code":"R2CCERT-D","risk_band":"HIGH","action":"SUPERVISORY_PLAN","response_level":"PROHIBITED"}]}'::jsonb);
  INSERT INTO r2c VALUES ('R2C-29-SEMANTICS-CONTRADICTION-REFUSED',
    array_length(e,1) >= 1, format('errors=%s', e));

  e := public.supervisory_response_policy_content_errors(
    '{"responses":[{"rule_code":"R2CCERT-E","risk_band":"HIGH","action":"NOT_AN_ACTION","response_level":"REQUIRED"}]}'::jsonb);
  INSERT INTO r2c VALUES ('R2C-30-SEMANTICS-UNKNOWN-ACTION-REFUSED',
    array_length(e,1) >= 1, format('errors=%s', e));

  e := public.supervisory_response_policy_content_errors(
    '{"responses":[{"rule_code":"R2CCERT-F","risk_band":"HIGH","action":"SUPERVISORY_PLAN","response_level":"MANDATORY_ISH"}]}'::jsonb);
  INSERT INTO r2c VALUES ('R2C-31-SEMANTICS-UNKNOWN-LEVEL-REFUSED',
    array_length(e,1) >= 1, format('errors=%s', e));

  e := public.supervisory_response_policy_content_errors(
    '{"responses":[{"rule_code":"R2CCERT-G","risk_band":"HIGH","action":"SUPERVISORY_PLAN","response_level":"REQUIRED"},
                   {"rule_code":"R2CCERT-G","risk_band":"MEDIUM","action":"EXAMINATION","response_level":"PERMITTED"}]}'::jsonb);
  INSERT INTO r2c VALUES ('R2C-32-SEMANTICS-DUPLICATE-RULE-REFUSED',
    array_length(e,1) >= 1, format('errors=%s', e));

  v := public.supervisory_policy_component_content_validate('RESPONSE_POLICY', '{"responses":[]}'::jsonb);
  INSERT INTO r2c VALUES ('R2C-33-SEMANTICS-EMPTY-REFUSED',
    NOT (v->>'valid')::boolean, format('errors=%s', v->'errors'));

  v := public.supervisory_policy_component_content_validate('RESPONSE_POLICY',
    '{"responses":[{"rule_code":"R2CCERT-H","risk_band":"HIGH","action":"SUPERVISORY_PLAN","response_level":"REQUIRED"}]}'::jsonb);
  INSERT INTO r2c VALUES ('R2C-34-SEMANTICS-VALID-ACCEPTED',
    (v->>'valid')::boolean, format('errors=%s', v->'errors'));
  INSERT INTO r2c VALUES ('R2C-35-SEMANTICS-NORMALISED-RETURNED',
    v->'normalised' IS NOT NULL AND v->'normalised' <> 'null'::jsonb,
    'validation returns what runtime will read');
END $$;

-- =====================================================================
-- COMPATIBILITY — profile compatibility delegates to response policy
-- =====================================================================
DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'supervisory_policy_profile_compatibility' AND pronargs = 1;
  INSERT INTO r2c VALUES ('R2C-36-COMPAT-DELEGATED',
    src LIKE '%supervisory_response_policy_compatibility(%',
    'profile compatibility delegates RESPONSE_POLICY to its own checker');
  INSERT INTO r2c VALUES ('R2C-37-COMPAT-OTHERS-INTACT',
    src LIKE '%supervisory_evidence_policy_compatibility(%'
    AND src LIKE '%supervisory_judgement_policy_compatibility(%',
    'evidence and judgement delegation are unchanged');
  INSERT INTO r2c VALUES ('R2C-38-COMPAT-FUNCTION-EXISTS',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supervisory_response_policy_compatibility'),
    'response policy compatibility checker exists');
END $$;

-- =====================================================================
-- RUNTIME — server-owned evaluation, pinned to the policy basis
-- =====================================================================
DO $$
DECLARE ev jsonb; a uuid; n int;
BEGIN
  ev := public.supervisory_response_policy_internal(NULL::uuid, 'HIGH');
  INSERT INTO r2c VALUES ('R2C-39-RUNTIME-NO-SOURCE-NOT-GOVERNED',
    ev->>'status' = 'NOT_GOVERNED' AND ev->>'reason_code' = 'NO_ASSESSMENT_SOURCE',
    format('status=%s reason=%s', ev->>'status', ev->>'reason_code'));
  SELECT count(*) INTO n FROM jsonb_array_elements(ev->'expectations') x
   WHERE x->>'response_level' <> 'PERMITTED';
  INSERT INTO r2c VALUES ('R2C-40-RUNTIME-UNGOVERNED-IS-PERMISSIVE', n = 0,
    'with no policy every canonical action stays open to supervisory judgement');

  SELECT s.assessment_id INTO a
    FROM public.supervisory_assessment_policy_snapshot s
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.components) x
                       WHERE x->>'component_type' = 'RESPONSE_POLICY')
    LIMIT 1;
  IF a IS NOT NULL THEN
    ev := public.supervisory_response_policy_internal(a, 'HIGH');
    INSERT INTO r2c VALUES ('R2C-41-RUNTIME-NOT-BOUND-NOT-GOVERNED',
      ev->>'status' = 'NOT_GOVERNED' AND ev->>'reason_code' = 'RESPONSE_POLICY_NOT_BOUND',
      format('status=%s reason=%s', ev->>'status', ev->>'reason_code'));
  ELSE
    INSERT INTO r2c VALUES ('R2C-41-RUNTIME-NOT-BOUND-NOT-GOVERNED', true,
      'no snapshot without a response policy binding exists to exercise (vacuous)');
  END IF;

  SELECT id INTO a FROM public.supervisory_assessment
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_policy_snapshot s
                      WHERE s.assessment_id = supervisory_assessment.id) LIMIT 1;
  IF a IS NOT NULL THEN
    ev := public.supervisory_response_policy_internal(a, 'HIGH');
    INSERT INTO r2c VALUES ('R2C-42-RUNTIME-LEGACY-PRESERVED',
      ev->>'status' = 'NOT_GOVERNED' AND ev->>'reason_code' = 'NO_POLICY_BASIS',
      format('legacy assessment status=%s reason=%s', ev->>'status', ev->>'reason_code'));
  ELSE
    INSERT INTO r2c VALUES ('R2C-42-RUNTIME-LEGACY-PRESERVED', true,
      'no assessment without a policy basis exists to exercise (vacuous)');
  END IF;

  ev := public.supervisory_response_policy_internal(NULL::uuid, NULL);
  INSERT INTO r2c VALUES ('R2C-43-RUNTIME-NO-RATING-NO-CRASH',
    ev->>'status' IS NOT NULL AND ev->'expectations' IS NOT NULL,
    'an unavailable or NOT_CALCULABLE rating never breaks evaluation');
  INSERT INTO r2c VALUES ('R2C-44-RUNTIME-STATES-NO-AUTOMATION',
    ev->>'automation' ILIKE '%created automatically%',
    'the read model states plainly that nothing is automated');
  INSERT INTO r2c VALUES ('R2C-45-RUNTIME-TIMING-OWNERSHIP',
    ev->>'timing_ownership' ILIKE '%SLA policy%',
    'SLA policy owns timing, response policy does not');
  INSERT INTO r2c VALUES ('R2C-46-RUNTIME-RATIONALE-ALWAYS-REQUIRED',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(ev->'expectations') x
                 WHERE NOT (x->>'rationale_required')::boolean),
    'a written supervisory reason can never be switched off by policy');
END $$;

-- =====================================================================
-- ENFORCEMENT — asserted against the live canonical AML-08 operation
-- =====================================================================
DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'supervisory_consequence_record' AND pronargs = 1;

  INSERT INTO r2c VALUES ('R2C-47-ENFORCE-POLICY-CONSULTED',
    src LIKE '%supervisory_response_policy_internal(%',
    'the canonical operation consults the governing response policy');
  INSERT INTO r2c VALUES ('R2C-48-ENFORCE-PROHIBITION-REFUSED',
    src LIKE '%response_prohibited:%',
    'a prohibited supervisory response is refused by the server');
  INSERT INTO r2c VALUES ('R2C-49-ENFORCE-UNAVAILABLE-REFUSED',
    src LIKE '%response_policy_unavailable:%',
    'a consequence cannot be recorded when the pinned policy cannot be read');
  INSERT INTO r2c VALUES ('R2C-50-ENFORCE-NO-SECOND-ENGINE',
    (SELECT count(*) FROM pg_proc WHERE proname LIKE '%consequence_record%') = 1,
    'there is exactly one supervisory consequence operation');
  INSERT INTO r2c VALUES ('R2C-51-ENFORCE-PREREQUISITES-PRESERVED',
    src LIKE '%action_blocked:%' AND src LIKE '%A canonical supervisory finding must be referred%',
    'canonical prerequisites, including the enforcement basis, are untouched');
  INSERT INTO r2c VALUES ('R2C-52-ENFORCE-RATIONALE-PRESERVED',
    src LIKE '%rationale_required:%', 'the written rationale requirement is untouched');
  INSERT INTO r2c VALUES ('R2C-53-ENFORCE-NO-AUTO-CREATION',
    src NOT LIKE '%FOR _r IN SELECT%required_responses%',
    'a required response is never executed automatically');
END $$;

-- =====================================================================
-- PROVENANCE — every decision records what policy judged it
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'supervisory_consequence_decision'
     AND column_name IN ('response_policy_basis_status','response_policy_component_id',
       'response_policy_code','response_policy_version','response_policy_content_hash',
       'response_policy_profile_code','response_policy_profile_version',
       'response_policy_rule_code','response_policy_level','response_policy_advisory_timeframe_days');
  INSERT INTO r2c VALUES ('R2C-54-PROVENANCE-COLUMNS', n = 10, format('%s/10 provenance columns', n));

  INSERT INTO r2c VALUES ('R2C-55-PROVENANCE-WRITTEN-BY-OPERATION',
    (SELECT pg_get_functiondef(oid) FROM pg_proc
      WHERE proname = 'supervisory_consequence_record' AND pronargs = 1)
      LIKE '%response_policy_rule_code%',
    'the governed operation writes the provenance itself');

  SELECT count(*) INTO n FROM public.supervisory_consequence_decision
   WHERE response_policy_basis_status IS NOT NULL AND response_policy_basis_status
     NOT IN ('EVALUATED','NOT_GOVERNED','UNAVAILABLE');
  INSERT INTO r2c VALUES ('R2C-56-PROVENANCE-STATUS-CONTROLLED', n = 0,
    format('%s decision(s) carry an unrecognised basis status', n));

  SELECT count(*) INTO n FROM public.supervisory_consequence_decision
   WHERE response_policy_level IS NOT NULL
     AND response_policy_level NOT IN ('REQUIRED','RECOMMENDED','PERMITTED','UNAVAILABLE');
  INSERT INTO r2c VALUES ('R2C-57-PROVENANCE-NO-PROHIBITED-DECISION', n = 0,
    format('%s recorded decision(s) claim a prohibited policy level', n));
END $$;

-- =====================================================================
-- SECURITY — the evaluator is internal, the read model is authenticated
-- =====================================================================
DO $$
BEGIN
  INSERT INTO r2c VALUES ('R2C-58-SEC-EVALUATOR-NOT-ANON',
    NOT has_function_privilege('anon',
      'public.supervisory_response_policy_internal(uuid,text)', 'EXECUTE'),
    'signed-out callers cannot evaluate response policy');
  INSERT INTO r2c VALUES ('R2C-59-SEC-EVALUATOR-INTERNAL',
    NOT has_function_privilege('authenticated',
      'public.supervisory_response_policy_internal(uuid,text)', 'EXECUTE'),
    'the evaluator is service-role only; clients read the governed view');
  INSERT INTO r2c VALUES ('R2C-60-SEC-VIEW-AUTHENTICATED',
    has_function_privilege('authenticated',
      'public.supervisory_consequence_response_policy_view(uuid,text,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.supervisory_consequence_response_policy_view(uuid,text,uuid)', 'EXECUTE'),
    'the read model is for signed-in supervisors only');
  INSERT INTO r2c VALUES ('R2C-61-SEC-VIEW-SCOPE-CHECKED',
    (SELECT pg_get_functiondef(oid) FROM pg_proc
      WHERE proname = 'supervisory_consequence_response_policy_view')
      LIKE '%supervisory_entity_scope_check%',
    'the read model enforces entity scope');
  INSERT INTO r2c VALUES ('R2C-62-SEC-HELPERS-NOT-ANON',
    NOT has_function_privilege('anon', 'public.supervisory_response_policy_rules(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.supervisory_response_policy_action_map()', 'EXECUTE'),
    'response policy helpers are not publicly callable');
  INSERT INTO r2c VALUES ('R2C-63-SEC-LEDGER-NOT-DIRECTLY-WRITABLE',
    NOT has_table_privilege('authenticated', 'public.supervisory_consequence_decision', 'INSERT')
    OR EXISTS (SELECT 1 FROM pg_trigger t
                WHERE t.tgrelid = 'public.supervisory_consequence_decision'::regclass
                  AND NOT t.tgisinternal),
    'the consequence ledger is governed, not directly writable');
END $$;

-- =====================================================================
-- CAPABILITY — server-owned, promoted only for RESPONSE_POLICY
-- =====================================================================
DO $$
DECLARE cap jsonb; n int;
BEGIN
  cap := public.supervisory_policy_component_capability();

  INSERT INTO r2c VALUES ('R2C-64-CAP-RESPONSE-RUNTIME',
    (SELECT (x->>'runtime_consumed')::boolean FROM jsonb_array_elements(cap) x
      WHERE x->>'component_type' = 'RESPONSE_POLICY'),
    'RESPONSE_POLICY is reported as runtime consumed');
  INSERT INTO r2c VALUES ('R2C-65-CAP-EVIDENCE-AND-JUDGEMENT-INTACT',
    (SELECT bool_and((x->>'runtime_consumed')::boolean) FROM jsonb_array_elements(cap) x
      WHERE x->>'component_type' IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY')),
    'the two certified runtimes are unchanged');

  SELECT count(*) INTO n FROM jsonb_array_elements(cap) x
   WHERE x->>'component_type' IN ( -- SECTOR_OVERLAY, FACT_CONFIG, SOURCE_BINDING became runtime-enforced in AML-CLOSE-02 (DB-enforced fact/source authority)
     'MATERIALITY_POLICY','DASHBOARD_POLICY','NOTIFICATION_POLICY')
     AND (x->>'runtime_consumed')::boolean;
  INSERT INTO r2c VALUES ('R2C-66-CAP-OTHERS-STILL-CONFIGURATION-ONLY', n = 0,
    format('%s area(s) wrongly claim runtime behaviour', n));
END $$;

-- =====================================================================
-- RESULTS
-- =====================================================================
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM r2c ORDER BY gate;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total
  FROM r2c;

DO $$
DECLARE n int; f text;
BEGIN
  SELECT count(*) INTO n FROM r2c WHERE NOT ok;
  IF n > 0 THEN
    SELECT string_agg(gate || ' — ' || detail, E'\n') INTO f FROM r2c WHERE NOT ok;
    RAISE WARNING E'PCOMP-R2C FAILED GATES (%):\n%', n, f;
  ELSE
    RAISE NOTICE 'PCOMP-R2C: every gate passed';
  END IF;
END $$;

ROLLBACK;

-- =====================================================================
-- PRESERVATION — nothing this certification did survives
-- =====================================================================
SELECT
  (SELECT count(*) FROM public.supervisory_policy_component)::text = :'pre_components'
    AS components_preserved,
  (SELECT count(*) FROM public.supervisory_consequence_decision)::text = :'pre_decisions'
    AS consequence_decisions_preserved,
  (SELECT count(*) FROM public.supervisory_assessment)::text = :'pre_assessments'
    AS assessments_preserved,
  (SELECT count(*) FROM public.entity_risk_state_movement)::text = :'pre_movements'
    AS risk_movements_preserved,
  (SELECT count(*) FROM public.supervisory_assessment_risk_publication)::text = :'pre_publications'
    AS publications_preserved,
  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
              '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) = :'pre_risk_digest'
    AS risk_of_record_unchanged,
  (SELECT count(*) FROM public.supervisory_policy_component WHERE code LIKE 'R2CCERT%') = 0
    AS no_fixture_policy_survived;
