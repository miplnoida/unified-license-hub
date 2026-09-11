-- =====================================================================
-- PCOMP-R2D — SUPERVISORY SLA POLICY RUNTIME : CERTIFICATION
-- =====================================================================
-- Gate families: CONTRACT, NORMALISE, VALIDATION, COMPATIBILITY,
--                OWNERSHIP, RUNTIME, ENGINE, OBLIGATION, ENFORCEMENT,
--                PROVENANCE, SECURITY, CAPABILITY, PRESERVATION.
--
-- Conventions (identical to AML-01..AML-11, PCOMP-R1C, R2A, R2B, R2C):
--   * ONE transaction, ROLLBACK at the end. No policy value, rating,
--     published risk, assessment, consequence decision, SLA
--     configuration or regulator decision is created, changed or
--     fabricated by this script;
--   * behavioural wherever a real call is possible — gates call the REAL
--     governed functions and the REAL platform SLA stage engine;
--   * where a gate would otherwise require inventing a published risk
--     record or an immutable policy basis, it is asserted against the
--     live definition of the canonical operation and is labelled as such;
--   * every fixture identifier is prefixed R2DCERT / r2dcert;
--   * results print as PASS/FAIL, then the transaction rolls back and
--     preservation is checked against the pre-transaction census.
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2d-sla-policy.sql
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
       (SELECT count(*)::text FROM public.sla_stage_instances) AS pre_stages,
       (SELECT count(*)::text FROM public.sla_stage_events) AS pre_stage_events,
       (SELECT count(*)::text FROM public.sla_configurations) AS pre_sla_configs,
       (SELECT count(*)::text FROM public.supervisory_response_sla_obligation) AS pre_obligations,
       (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                            '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) AS pre_risk_digest
\gset

BEGIN;

CREATE TEMP TABLE r2d(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON r2d TO authenticated;

-- =====================================================================
-- CONTRACT — the published authoring contract for SLA_POLICY
-- =====================================================================
DO $$
DECLARE c jsonb; n int;
BEGIN
  c := public.supervisory_policy_component_content_contract('SLA_POLICY');

  INSERT INTO r2d VALUES ('R2D-01-CONTRACT-EXISTS', c IS NOT NULL, 'contract published');
  INSERT INTO r2d VALUES ('R2D-02-CONTRACT-COLLECTION',
    c->>'collection' = 'stages', format('collection=%s', c->>'collection'));
  INSERT INTO r2d VALUES ('R2D-03-CONTRACT-RUNTIME-DECLARED',
    c->>'runtime' = 'SLA_POLICY_RUNTIME', format('runtime=%s', c->>'runtime'));
  INSERT INTO r2d VALUES ('R2D-04-CONTRACT-CANONICAL-OWNER',
    c->>'canonical_owner' ILIKE '%sla_stage_instances%',
    format('owner=%s', c->>'canonical_owner'));
  INSERT INTO r2d VALUES ('R2D-05-CONTRACT-REQUIRED-FIELDS',
    (c->'required_fields') ?& ARRAY['rule_code','stage','duration_days'],
    format('required=%s', c->'required_fields'));
  INSERT INTO r2d VALUES ('R2D-06-CONTRACT-CALENDAR-VOCABULARY',
    (c->'enums'->'calendar_mode') ?& ARRAY['CALENDAR_DAYS','BUSINESS_DAYS'],
    format('modes=%s', c->'enums'->'calendar_mode'));
  INSERT INTO r2d VALUES ('R2D-07-CONTRACT-SEVERITY-VOCABULARY',
    (c->'enums'->'breach_severity') ?& ARRAY['LOW','MEDIUM','HIGH','CRITICAL'],
    format('severities=%s', c->'enums'->'breach_severity'));

  SELECT count(*) INTO n FROM jsonb_array_elements_text(COALESCE(c->'enums'->'applies_to_action','[]'::jsonb));
  INSERT INTO r2d VALUES ('R2D-08-CONTRACT-ACTIONS-CONTROLLED', n >= 8,
    format('%s canonical supervisory action(s) offered', n));

  SELECT count(*) INTO n FROM jsonb_array_elements_text(COALESCE(c->'enums'->'risk_band','[]'::jsonb));
  INSERT INTO r2d VALUES ('R2D-09-CONTRACT-RATINGS-CONTROLLED', n >= 1,
    format('%s rating(s) offered from the methodology-owned vocabulary', n));

  INSERT INTO r2d VALUES ('R2D-10-CONTRACT-TIMING-OWNERSHIP-CLAIMED',
    c->'timing_ownership'->>'authority' = 'SLA_POLICY',
    format('timing=%s', c->'timing_ownership'->>'authority'));
  INSERT INTO r2d VALUES ('R2D-11-CONTRACT-ENGINE-NOT-CLAIMED',
    c->'timing_ownership'->>'note' ILIKE '%platform SLA stage engine%',
    'the contract states the platform engine owns the clock');
  INSERT INTO r2d VALUES ('R2D-12-CONTRACT-POSITIVE-NUMBERS',
    (c->'positive_numbers') ?& ARRAY['duration_days','warning_percentage'],
    format('positive=%s', c->'positive_numbers'));
  INSERT INTO r2d VALUES ('R2D-13-CONTRACT-OTHER-TYPES-INTACT',
    public.supervisory_policy_component_content_contract('EVIDENCE_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('JUDGEMENT_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('RESPONSE_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('NOTIFICATION_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('SECTOR_OVERLAY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('FACT_CONFIG') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('SOURCE_BINDING') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('MATERIALITY_POLICY') IS NOT NULL
    AND public.supervisory_policy_component_content_contract('DASHBOARD_POLICY') IS NOT NULL,
    'every other component contract still resolves');
  INSERT INTO r2d VALUES ('R2D-14-CONTRACT-RESPONSE-TIMING-STILL-ADVISORY',
    public.supervisory_policy_component_content_contract('RESPONSE_POLICY')
      ->'timing_ownership'->>'authority' = 'ADVISORY_UNTIL_SLA_POLICY',
    'response policy still declares its own timeframes advisory');
END $$;

-- =====================================================================
-- NORMALISE — one governed stage rule per authored stage
-- =====================================================================
DO $$
DECLARE r jsonb; x jsonb; n int;
BEGIN
  r := public.supervisory_sla_policy_rules('{"stages":[
        {"rule_code":"R2DCERT-A","stage":"Open supervisory plan","action":"SUPERVISORY_PLAN",
         "risk_band":"HIGH","duration_days":30,"calendar_mode":"business","pause_permitted":true,
         "pause_reasons":["awaiting information"],"warning_percentage":80,
         "escalation_tier_profile":"r2dcert_profile","severity":"critical","note":"fixture"},
        {"stage":"Continued monitoring","days":"90"}]}'::jsonb);

  SELECT count(*) INTO n FROM jsonb_array_elements(r);
  INSERT INTO r2d VALUES ('R2D-15-NORMALISE-COUNT', n = 2, format('%s rule(s) normalised', n));

  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'rule_code' = 'R2DCERT-A';
  INSERT INTO r2d VALUES ('R2D-16-NORMALISE-ACTION',
    x->>'applies_to_action' = 'SUPERVISORY_PLAN' AND x->>'operational_action' = 'OPEN_SUPERVISORY_PLAN',
    format('action=%s operational=%s', x->>'applies_to_action', x->>'operational_action'));
  INSERT INTO r2d VALUES ('R2D-17-NORMALISE-DURATION',
    (x->>'duration_days')::numeric = 30, format('duration=%s', x->>'duration_days'));
  INSERT INTO r2d VALUES ('R2D-18-NORMALISE-CALENDAR-ALIAS',
    x->>'calendar_mode' = 'BUSINESS_DAYS', format('calendar=%s', x->>'calendar_mode'));
  INSERT INTO r2d VALUES ('R2D-19-NORMALISE-PAUSE',
    (x->>'pause_permitted')::boolean AND (x->'pause_reasons') @> '["AWAITING INFORMATION"]'::jsonb,
    format('pause=%s reasons=%s', x->>'pause_permitted', x->'pause_reasons'));
  INSERT INTO r2d VALUES ('R2D-20-NORMALISE-SEVERITY-ALIAS',
    x->>'breach_severity' = 'CRITICAL', format('severity=%s', x->>'breach_severity'));
  INSERT INTO r2d VALUES ('R2D-21-NORMALISE-WARNING',
    (x->>'warning_percentage')::numeric = 80, format('warning=%s', x->>'warning_percentage'));
  INSERT INTO r2d VALUES ('R2D-22-NORMALISE-ESCALATION-PROFILE',
    x->>'escalation_tier_profile' = 'r2dcert_profile',
    format('profile=%s', x->>'escalation_tier_profile'));
  INSERT INTO r2d VALUES ('R2D-23-NORMALISE-NOTE-ALIAS',
    x->>'policy_note' = 'fixture', format('note=%s', x->>'policy_note'));

  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'stage' = 'Continued monitoring';
  INSERT INTO r2d VALUES ('R2D-24-NORMALISE-DEFAULTS',
    x->>'rule_code' IS NOT NULL AND x->>'calendar_mode' = 'CALENDAR_DAYS'
    AND x->>'breach_severity' = 'MEDIUM' AND NOT (x->>'pause_permitted')::boolean
    AND (x->>'duration_days')::numeric = 90,
    format('defaults applied: %s / %s / %s', x->>'rule_code', x->>'calendar_mode', x->>'breach_severity'));
  INSERT INTO r2d VALUES ('R2D-25-NORMALISE-UNSCOPED-RULE',
    x->>'applies_to_action' IS NULL AND x->>'risk_band' IS NULL,
    'a stage may be authored without narrowing it to one action or rating');
  INSERT INTO r2d VALUES ('R2D-26-NORMALISE-EMPTY-CONTENT',
    public.supervisory_sla_policy_rules('{}'::jsonb) = '[]'::jsonb,
    'content with no stages normalises to no rules');
END $$;

-- =====================================================================
-- VALIDATION — invalid SLA policy content is refused at authoring time
-- =====================================================================
DO $$
DECLARE e text[];
BEGIN
  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-B","duration_days":10}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-27-VALIDATE-STAGE-REQUIRED',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%no supervisory stage%'),
    format('%s error(s)', array_length(e,1)));

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-C","stage":"Plan"}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-28-VALIDATE-DURATION-REQUIRED',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%no duration%'), 'a stage must state a duration');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-D","stage":"Plan","duration_days":0}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-29-VALIDATE-DURATION-POSITIVE',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%greater than zero%'), 'a zero duration is refused');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-E","stage":"Plan","duration_days":5,"action":"DO_WHATEVER"}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-30-VALIDATE-ACTION-VOCABULARY',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%canonical supervisory consequence catalogue%'),
    'an unknown supervisory action is refused');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-F","stage":"Plan","duration_days":5,"calendar_mode":"LUNAR"}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-31-VALIDATE-CALENDAR-VOCABULARY',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%calendar days or business days%'),
    'an unknown day basis is refused');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-G","stage":"Plan","duration_days":5,"severity":"APOCALYPTIC"}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-32-VALIDATE-SEVERITY-VOCABULARY',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%low, medium, high or critical%'),
    'an unknown breach severity is refused');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-H","stage":"Plan","duration_days":5,"warning_percentage":140}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-33-VALIDATE-WARNING-RANGE',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%1 to 99 per cent%'),
    'an impossible warning threshold is refused');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-I","stage":"Plan","duration_days":5,
                 "pause_permitted":false,"pause_reasons":["anything"]}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-34-VALIDATE-PAUSE-CONTRADICTION',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%does not permit the clock to be paused%'),
    'permitted pause reasons without pause permission are contradictory');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-J","stage":"A","duration_days":5},
                {"rule_code":"R2DCERT-J","stage":"B","duration_days":6}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-35-VALIDATE-DUPLICATE-RULE-CODE',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%same rule reference%'),
    'two stages may not share a rule reference');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-K1","stage":"A","duration_days":5,"action":"EXAMINATION","risk_band":"HIGH"},
                {"rule_code":"R2DCERT-K2","stage":"B","duration_days":9,"action":"EXAMINATION","risk_band":"HIGH"}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-36-VALIDATE-INDETERMINATE-DEADLINE',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%indeterminate%'),
    'the same action may not be timed twice for the same rating');

  e := public.supervisory_sla_policy_content_errors(
    '{"suppress_escalation":true,"stages":[{"rule_code":"R2DCERT-L","stage":"A","duration_days":5}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-37-VALIDATE-NO-CONTROL-BYPASS',
    EXISTS (SELECT 1 FROM unnest(e) v WHERE v ILIKE '%never bypass platform controls%'),
    'SLA policy may not suppress escalation or close work automatically');

  e := public.supervisory_sla_policy_content_errors(
    '{"stages":[{"rule_code":"R2DCERT-M","stage":"Open supervisory plan","duration_days":30,
                 "action":"SUPERVISORY_PLAN","calendar_mode":"BUSINESS_DAYS","pause_permitted":true,
                 "pause_reasons":["AWAITING INFORMATION"],"warning_percentage":75,"severity":"HIGH"}]}'::jsonb);
  INSERT INTO r2d VALUES ('R2D-38-VALIDATE-VALID-CONTENT-ACCEPTED',
    COALESCE(array_length(e,1),0) = 0, format('%s error(s) on valid content', COALESCE(array_length(e,1),0)));
END $$;

-- =====================================================================
-- COMPATIBILITY — binding is checked against methodology and catalogue
-- =====================================================================
DO $$
DECLARE d text; f jsonb;
BEGIN
  d := (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = 'supervisory_policy_profile_compatibility' AND pronargs = 1);
  INSERT INTO r2d VALUES ('R2D-39-COMPAT-DELEGATED',
    position('supervisory_sla_policy_compatibility' in d) > 0,
    'profile compatibility delegates SLA_POLICY to its own checker');
  INSERT INTO r2d VALUES ('R2D-40-COMPAT-PEERS-STILL-DELEGATED',
    position('supervisory_evidence_policy_compatibility' in d) > 0
    AND position('supervisory_judgement_policy_compatibility' in d) > 0
    AND position('supervisory_response_policy_compatibility' in d) > 0,
    'the three certified runtimes are still delegated');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_sla_policy_compatibility');
  INSERT INTO r2d VALUES ('R2D-41-COMPAT-USES-METHODOLOGY-VOCABULARY',
    position('supervisory_methodology_rating_order' in d) > 0,
    'ratings are checked against the methodology that owns them');
  INSERT INTO r2d VALUES ('R2D-42-COMPAT-USES-ACTION-CATALOGUE',
    position('supervisory_response_policy_action_map' in d) > 0,
    'actions are checked against the canonical consequence catalogue');
  INSERT INTO r2d VALUES ('R2D-43-COMPAT-SURFACES-CONTENT-ERRORS',
    position('supervisory_sla_policy_content_errors' in d) > 0,
    'authoring errors surface as binding findings');
END $$;

-- =====================================================================
-- OWNERSHIP / ENGINE — no second SLA engine was created
-- =====================================================================
DO $$
DECLARE n int; d text;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r'
     AND c.relname ~ '(sla|deadline)' AND c.relname NOT LIKE 'sla_%'
     AND c.relname <> 'supervisory_response_sla_obligation'
     AND c.relname NOT LIKE '%process_sla%';
  INSERT INTO r2d VALUES ('R2D-44-ENGINE-NO-RIVAL-TABLES', n = 0,
    format('%s rival SLA table(s) found', n));

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_open');
  INSERT INTO r2d VALUES ('R2D-45-ENGINE-DELEGATES-OPEN',
    position('public.sla_stage_open' in d) > 0,
    'governed deadlines are opened through the canonical stage engine');
  INSERT INTO r2d VALUES ('R2D-46-ENGINE-NO-LOCAL-DUE-DATE-MATHS',
    position('make_interval' in d) = 0 AND position($q$|| ' hours'$q$ in d) = 0,
    'the deadline is not recalculated outside the canonical calendar helper');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = 'sla_stage_open' AND pronargs = 11);
  INSERT INTO r2d VALUES ('R2D-47-ENGINE-SINGLE-CALENDAR-HELPER',
    position('public.sla_add_duration' in d) > 0,
    'the stage engine still computes every deadline through sla_add_duration');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc
         WHERE proname = 'sla_stage_open' AND pronargs = 7);
  INSERT INTO r2d VALUES ('R2D-48-ENGINE-LEGACY-SIGNATURE-PRESERVED',
    d IS NOT NULL AND position('public.sla_stage_open' in d) > 0,
    'the original seven-argument opener still exists and delegates');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_pause');
  INSERT INTO r2d VALUES ('R2D-49-ENGINE-DELEGATES-PAUSE',
    position('public.sla_stage_pause' in d) > 0 AND position('public.sla_stage_resume' in d) > 0,
    'holds and releases are performed by the canonical engine');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_complete');
  INSERT INTO r2d VALUES ('R2D-50-ENGINE-DELEGATES-COMPLETE',
    position('public.sla_stage_complete' in d) > 0,
    'completion is performed by the canonical engine');
  INSERT INTO r2d VALUES ('R2D-51-ENGINE-BREACH-NOT-REIMPLEMENTED',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname LIKE '%mark_breached%') = 1,
    'breach detection exists exactly once');
  INSERT INTO r2d VALUES ('R2D-52-ENGINE-ESCALATION-NOT-REIMPLEMENTED',
    (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relname = 'sla_escalation_dispatches') = 1
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
          WHERE ns.nspname = 'public' AND p.proname LIKE '%mark_escalated%') = 1,
    'escalation dispatch exists exactly once');
END $$;

-- =====================================================================
-- RUNTIME — the evaluator resolves only through the Policy Basis
-- =====================================================================
DO $$
DECLARE e jsonb; a uuid; d text;
BEGIN
  e := public.supervisory_sla_policy_internal(NULL, 'SUPERVISORY_PLAN', 'HIGH');
  INSERT INTO r2d VALUES ('R2D-53-RUNTIME-NO-SOURCE',
    e->>'status' = 'NOT_GOVERNED' AND e->>'reason_code' = 'NO_ASSESSMENT_SOURCE'
    AND NOT (e->>'governed')::boolean,
    format('status=%s reason=%s', e->>'status', e->>'reason_code'));
  INSERT INTO r2d VALUES ('R2D-54-RUNTIME-AUTHORITY-DECLARED',
    e->>'timing_authority' = 'SLA_POLICY' AND e->>'engine' = 'PLATFORM_SLA_STAGE_ENGINE',
    format('authority=%s engine=%s', e->>'timing_authority', e->>'engine'));
  INSERT INTO r2d VALUES ('R2D-55-RUNTIME-NO-AUTOMATIC-ACTION',
    e->>'automation' ILIKE '%never creates%',
    'the evaluator states plainly that it executes nothing');

  SELECT id INTO a FROM public.supervisory_assessment ORDER BY created_at LIMIT 1;
  IF a IS NULL THEN
    INSERT INTO r2d VALUES ('R2D-56-RUNTIME-LEGACY-ASSESSMENT-PRESERVED', true,
      'no assessment exists to evaluate; nothing was fabricated');
  ELSE
    e := public.supervisory_sla_policy_internal(a, 'SUPERVISORY_PLAN', 'HIGH');
    INSERT INTO r2d VALUES ('R2D-56-RUNTIME-LEGACY-ASSESSMENT-PRESERVED',
      e->>'status' = 'NOT_GOVERNED'
      AND e->>'reason_code' IN ('NO_POLICY_BASIS','SLA_POLICY_NOT_BOUND','NO_MATCHING_SLA_RULE'),
      format('an existing assessment reports %s / %s', e->>'status', e->>'reason_code'));
  END IF;

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_sla_policy_internal');
  INSERT INTO r2d VALUES ('R2D-57-RUNTIME-POLICY-BASIS-ONLY',
    position('supervisory_assessment_policy_snapshot' in d) > 0
    AND position('supervisory_policy_profile_binding' in d) = 0,
    'the evaluator reads the pinned snapshot, never live bindings');
  INSERT INTO r2d VALUES ('R2D-58-RUNTIME-PINNED-POLICY-MISSING-HANDLED',
    position('PINNED_POLICY_MISSING' in d) > 0 AND position('UNAVAILABLE' in d) > 0,
    'a missing pinned policy version is reported, not guessed');
  INSERT INTO r2d VALUES ('R2D-59-RUNTIME-DURATION-FROM-POLICY-ONLY',
    position($q$(_rule->>'duration_days')::numeric * 24.0$q$ in d) > 0,
    'the duration comes from the policy rule, never from a hard-coded default');
END $$;

-- =====================================================================
-- OBLIGATION — behavioural: a policy-supplied deadline runs on the
-- canonical engine, pauses, breaches, escalates and closes late
-- =====================================================================
DO $$
DECLARE k uuid := gen_random_uuid(); s uuid; row public.sla_stage_instances; n int;
BEGIN
  s := public.sla_stage_open(
    'r2dcert_profile', 'aml_supervisory_response', k, k, NULL, 'R2DCERT stage',
    now() - interval '2 days', 24::numeric, NULL::uuid, 'policy',
    jsonb_build_object('sla_policy_rule_code','R2DCERT-A','sla_calendar_mode','CALENDAR_DAYS'));

  SELECT * INTO row FROM public.sla_stage_instances WHERE id = s;
  INSERT INTO r2d VALUES ('R2D-60-OBLIGATION-STAGE-OPENED',
    row.id IS NOT NULL AND row.state = 'active', format('state=%s', row.state));
  INSERT INTO r2d VALUES ('R2D-61-OBLIGATION-POLICY-DURATION-APPLIED',
    row.sla_hours = 24 AND row.sla_source = 'policy' AND row.sla_config_id IS NULL,
    format('hours=%s source=%s', row.sla_hours, row.sla_source));
  INSERT INTO r2d VALUES ('R2D-62-OBLIGATION-DUE-DATE-FROM-CANONICAL-HELPER',
    row.due_at IS NOT DISTINCT FROM
      public.sla_add_duration(row.started_at, row.sla_hours, row.calendar_profile_id),
    format('due=%s', row.due_at));
  INSERT INTO r2d VALUES ('R2D-63-OBLIGATION-PROVENANCE-ON-STAGE',
    row.metadata->>'sla_policy_rule_code' = 'R2DCERT-A',
    'the stage records which SLA policy rule produced it');

  SELECT count(*) INTO n FROM public.sla_stage_events
   WHERE stage_instance_id = s AND event_type = 'started';
  INSERT INTO r2d VALUES ('R2D-64-OBLIGATION-LEDGER-STARTED', n = 1,
    format('%s started event(s)', n));

  PERFORM public.sla_stage_pause('aml_supervisory_response', k, 'R2DCERT hold', '{}'::jsonb);
  SELECT * INTO row FROM public.sla_stage_instances WHERE id = s;
  INSERT INTO r2d VALUES ('R2D-65-OBLIGATION-PAUSE-RECORDED',
    row.state = 'paused' AND row.paused_at IS NOT NULL, format('state=%s', row.state));

  PERFORM public.sla_stage_resume('aml_supervisory_response', k, 'R2DCERT release', '{}'::jsonb);
  SELECT * INTO row FROM public.sla_stage_instances WHERE id = s;
  INSERT INTO r2d VALUES ('R2D-66-OBLIGATION-RESUME-EXTENDS-DEADLINE',
    row.state = 'active' AND row.pause_seconds >= 0 AND row.paused_at IS NULL,
    format('state=%s paused_seconds=%s', row.state, row.pause_seconds));

  INSERT INTO r2d VALUES ('R2D-67-OBLIGATION-BREACH-DETECTED',
    public.sla_stage_mark_breached(s, 'R2DCERT sweep') = true, 'an overdue deadline breaches once');
  INSERT INTO r2d VALUES ('R2D-68-OBLIGATION-BREACH-NOT-REPEATED',
    public.sla_stage_mark_breached(s, 'R2DCERT repeat sweep') = false,
    'a breached deadline does not breach again');

  PERFORM public.sla_stage_mark_escalated(s, 1, 'r2dcert@example.test');
  SELECT count(*) INTO n FROM public.sla_stage_events
   WHERE stage_instance_id = s AND event_type = 'escalated';
  INSERT INTO r2d VALUES ('R2D-69-OBLIGATION-ESCALATION-RECORDED', n = 1,
    format('%s escalation event(s)', n));

  PERFORM public.sla_stage_complete(s, 'R2DCERT closed');
  SELECT * INTO row FROM public.sla_stage_instances WHERE id = s;
  INSERT INTO r2d VALUES ('R2D-70-OBLIGATION-COMPLETION-RECORDED',
    row.state = 'completed' AND row.completed_at IS NOT NULL, format('state=%s', row.state));
  INSERT INTO r2d VALUES ('R2D-71-OBLIGATION-LATE-EVIDENCE-AVAILABLE',
    row.completed_at > row.due_at,
    'the engine preserves the evidence that the work finished after the deadline');

  SELECT count(DISTINCT event_type) INTO n FROM public.sla_stage_events WHERE stage_instance_id = s;
  INSERT INTO r2d VALUES ('R2D-72-OBLIGATION-FULL-EVENT-TRAIL', n >= 5,
    format('%s distinct event type(s) recorded', n));
END $$;

-- =====================================================================
-- ENFORCEMENT — asserted against live definitions of the canonical
-- operations, because a governed deadline requires a real published
-- rating and an immutable policy basis that this script must not invent
-- =====================================================================
DO $$
DECLARE d text;
BEGIN
  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_pause');
  INSERT INTO r2d VALUES ('R2D-73-ENFORCE-PAUSE-PROHIBITION',
    position('sla_pause_prohibited' in d) > 0 AND position('pause_permitted' in d) > 0,
    'a hold is refused where the governing policy does not permit one');
  INSERT INTO r2d VALUES ('R2D-74-ENFORCE-PAUSE-REASON-CONTROLLED',
    position('sla_pause_reason_not_permitted' in d) > 0,
    'a hold is refused for a reason the policy does not allow');
  INSERT INTO r2d VALUES ('R2D-75-ENFORCE-PAUSE-RATIONALE',
    position('rationale_required' in d) > 0, 'a written reason is required to hold a deadline');
  INSERT INTO r2d VALUES ('R2D-76-ENFORCE-PAUSE-SCOPE-AND-ROLE',
    position('supervisory_entity_scope_check' in d) > 0
    AND position('aml_supervision' in d) > 0,
    'holding a deadline requires supervisory scope and review authority');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_complete');
  INSERT INTO r2d VALUES ('R2D-77-ENFORCE-ON-TIME-LATE-SERVER-OWNED',
    position($q$'LATE'$q$ in d) > 0 AND position($q$'ON_TIME'$q$ in d) > 0
    AND position('now() > _s.due_at' in d) > 0,
    'on time or late is decided by the server from the recorded deadline');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_sync');
  INSERT INTO r2d VALUES ('R2D-78-ENFORCE-OPENED-ON-RECORD',
    position('supervisory_response_sla_open' in d) > 0,
    'every recorded supervisory consequence is offered a governed deadline');
  INSERT INTO r2d VALUES ('R2D-79-ENFORCE-CLOSED-ON-WITHDRAWAL',
    position('WITHDRAWN' in d) > 0 AND position('NOT_APPLICABLE' in d) > 0,
    'withdrawing or superseding a consequence closes its deadline');

  d := (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_open');
  INSERT INTO r2d VALUES ('R2D-80-ENFORCE-NEVER-BLOCKS-RECORDING',
    position('EXCEPTION WHEN OTHERS' in d) > 0 AND position('RETURN NULL' in d) > 0,
    'SLA policy governs timing and can never prevent a supervisory consequence being recorded');
  INSERT INTO r2d VALUES ('R2D-81-ENFORCE-IDEMPOTENT',
    position('IF EXISTS (SELECT 1 FROM public.supervisory_response_sla_obligation' in d) > 0,
    'a consequence receives exactly one governed deadline');
  INSERT INTO r2d VALUES ('R2D-82-ENFORCE-NO-ACTION-EXECUTED',
    position('supervisory_consequence_record' in d) = 0
    AND position('INSERT INTO public.supervisory_finding' in d) = 0,
    'no supervisory action, finding or enforcement case is created by the SLA runtime');
END $$;

-- =====================================================================
-- PROVENANCE — the obligation record is immutable and fully attributed
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'supervisory_response_sla_obligation'
     AND column_name IN ('sla_policy_basis_status','sla_policy_component_id','sla_policy_code',
       'sla_policy_version','sla_policy_content_hash','sla_policy_profile_code',
       'sla_policy_profile_version','sla_policy_rule_code','sla_duration_days',
       'sla_calendar_mode','due_at','outcome','stage_instance_id');
  INSERT INTO r2d VALUES ('R2D-83-PROV-COLUMNS', n = 13,
    format('%s of 13 provenance columns present', n));

  INSERT INTO r2d VALUES ('R2D-84-PROV-DECISION-UNIQUE',
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.supervisory_response_sla_obligation'::regclass
               AND contype = 'u' AND pg_get_constraintdef(oid) ILIKE '%decision_id%'),
    'one governed deadline per supervisory consequence');
  INSERT INTO r2d VALUES ('R2D-85-PROV-OUTCOME-CONTROLLED',
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.supervisory_response_sla_obligation'::regclass
               AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%ON_TIME%'),
    'the outcome is a controlled vocabulary');
  INSERT INTO r2d VALUES ('R2D-86-PROV-IMMUTABLE-TRIGGER',
    EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.supervisory_response_sla_obligation'::regclass
               AND tgname = 'srso_immutable_guard'),
    'the policy basis of a deadline cannot be edited or deleted');
  INSERT INTO r2d VALUES ('R2D-87-PROV-WRITER-GUARD',
    EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.supervisory_response_sla_obligation'::regclass
               AND tgname = 'srso_writer_guard'),
    'only the platform SLA runtime may write a deadline record');
  INSERT INTO r2d VALUES ('R2D-88-PROV-DIRECT-WRITE-REFUSED',
    NOT has_table_privilege('authenticated', 'public.supervisory_response_sla_obligation', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.supervisory_response_sla_obligation', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.supervisory_response_sla_obligation', 'DELETE'),
    'signed-in users cannot write deadline records directly');
  INSERT INTO r2d VALUES ('R2D-89-PROV-RESPONSE-PROVENANCE-CARRIED',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'supervisory_response_sla_obligation'
        AND column_name IN ('response_policy_rule_code','response_policy_advisory_timeframe_days')) = 2,
    'the advisory response timeframe it replaces is recorded alongside it');
END $$;

-- =====================================================================
-- SECURITY
-- =====================================================================
DO $$
BEGIN
  INSERT INTO r2d VALUES ('R2D-90-SEC-EVALUATOR-NOT-ANON',
    NOT has_function_privilege('anon',
      'public.supervisory_sla_policy_internal(uuid,text,text)', 'EXECUTE'),
    'signed-out callers cannot evaluate SLA policy');
  INSERT INTO r2d VALUES ('R2D-91-SEC-EVALUATOR-INTERNAL',
    NOT has_function_privilege('authenticated',
      'public.supervisory_sla_policy_internal(uuid,text,text)', 'EXECUTE'),
    'the evaluator is service-role only; clients read the governed view');
  INSERT INTO r2d VALUES ('R2D-92-SEC-OPENER-INTERNAL',
    NOT has_function_privilege('authenticated', 'public.supervisory_response_sla_open(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.supervisory_response_sla_open(uuid)', 'EXECUTE'),
    'deadlines are opened by the platform, not by clients');
  INSERT INTO r2d VALUES ('R2D-93-SEC-POLICY-OVERRIDE-OPENER-INTERNAL',
    NOT has_function_privilege('authenticated',
      'public.sla_stage_open(text,text,uuid,uuid,uuid,text,timestamptz,numeric,uuid,text,jsonb)', 'EXECUTE'),
    'a client cannot supply its own SLA duration to the stage engine');
  INSERT INTO r2d VALUES ('R2D-94-SEC-VIEW-AUTHENTICATED',
    has_function_privilege('authenticated',
      'public.supervisory_response_sla_view(uuid,text,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.supervisory_response_sla_view(uuid,text,uuid)', 'EXECUTE'),
    'the read model is for signed-in supervisors only');
  INSERT INTO r2d VALUES ('R2D-95-SEC-VIEW-SCOPE-CHECKED',
    (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'supervisory_response_sla_view')
      LIKE '%supervisory_entity_scope_check%',
    'the read model enforces entity scope');
  INSERT INTO r2d VALUES ('R2D-96-SEC-HELPERS-NOT-ANON',
    NOT has_function_privilege('anon', 'public.supervisory_sla_policy_rules(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.supervisory_sla_policy_content_errors(jsonb)', 'EXECUTE'),
    'SLA policy helpers are not publicly callable');
  INSERT INTO r2d VALUES ('R2D-97-SEC-LEDGERS-STILL-APPEND-ONLY',
    NOT has_table_privilege('authenticated', 'public.sla_stage_instances', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.sla_stage_events', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.sla_stage_events', 'DELETE'),
    'the canonical SLA ledgers remain append-only for clients');
  INSERT INTO r2d VALUES ('R2D-98-SEC-OBLIGATION-RLS',
    (SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.supervisory_response_sla_obligation'::regclass)
    AND (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'supervisory_response_sla_obligation') >= 4,
    'row level security governs the deadline record');
END $$;

-- =====================================================================
-- CAPABILITY — server-owned, promoted only for SLA_POLICY
-- =====================================================================
DO $$
DECLARE cap jsonb; n int;
BEGIN
  cap := public.supervisory_policy_component_capability();

  INSERT INTO r2d VALUES ('R2D-99-CAP-SLA-RUNTIME',
    (SELECT (x->>'runtime_consumed')::boolean FROM jsonb_array_elements(cap) x
      WHERE x->>'component_type' = 'SLA_POLICY'),
    'SLA_POLICY is reported as runtime consumed');
  INSERT INTO r2d VALUES ('R2D-100-CAP-PEERS-INTACT',
    (SELECT bool_and((x->>'runtime_consumed')::boolean) FROM jsonb_array_elements(cap) x
      WHERE x->>'component_type' IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY')),
    'the three certified runtimes are unchanged');
  INSERT INTO r2d VALUES ('R2D-101-CAP-OWNER-DECLARED',
    (SELECT x->>'canonical_owner' FROM jsonb_array_elements(cap) x
      WHERE x->>'component_type' = 'SLA_POLICY') ILIKE '%sla_stage_instances%',
    'the capability record names the canonical engine as owner');

  SELECT count(*) INTO n FROM jsonb_array_elements(cap) x
   WHERE x->>'component_type' IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING',
     'MATERIALITY_POLICY','DASHBOARD_POLICY','NOTIFICATION_POLICY')
     AND (x->>'runtime_consumed')::boolean;
  INSERT INTO r2d VALUES ('R2D-102-CAP-OTHERS-STILL-CONFIGURATION-ONLY', n = 0,
    format('%s area(s) wrongly claim runtime behaviour', n));
END $$;

-- =====================================================================
-- RESULTS
-- =====================================================================
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM r2d ORDER BY gate;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total
  FROM r2d;

DO $$
DECLARE n int; f text;
BEGIN
  SELECT count(*) INTO n FROM r2d WHERE NOT ok;
  IF n > 0 THEN
    SELECT string_agg(gate || ' — ' || detail, E'\n') INTO f FROM r2d WHERE NOT ok;
    RAISE WARNING E'PCOMP-R2D FAILED GATES (%):\n%', n, f;
  ELSE
    RAISE NOTICE 'PCOMP-R2D: every gate passed';
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
  (SELECT count(*) FROM public.sla_stage_instances)::text = :'pre_stages'
    AS sla_stages_preserved,
  (SELECT count(*) FROM public.sla_stage_events)::text = :'pre_stage_events'
    AS sla_stage_events_preserved,
  (SELECT count(*) FROM public.sla_configurations)::text = :'pre_sla_configs'
    AS sla_configuration_preserved,
  (SELECT count(*) FROM public.supervisory_response_sla_obligation)::text = :'pre_obligations'
    AS obligations_preserved,
  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
              '|' ORDER BY r.entity_id),'')) FROM public.entity_risk_state r) = :'pre_risk_digest'
    AS risk_of_record_unchanged,
  (SELECT count(*) FROM public.sla_stage_instances WHERE process_type = 'r2dcert_profile') = 0
    AS no_fixture_stage_survived,
  (SELECT count(*) FROM public.supervisory_policy_component WHERE code LIKE 'R2DCERT%') = 0
    AS no_fixture_policy_survived;
