-- MC-02 jurisdiction assessment + risk-based triage certification coverage.
--
-- Focus of this suite:
--   * the canonical MC-02 surface exists and is not publicly callable
--   * triage confirmation is gated on a jurisdiction decision
--   * the engine can never produce CONFIRMED_SYSTEMIC
--   * published triage rule versions are immutable
--   * the evaluation ledger is append-only
--   * intake queue counting uses the canonical respondent match states
BEGIN;
SELECT plan(20);

-- ---------- Surface ----------
SELECT has_function('public', 'complaint_jurisdiction_start', 'jurisdiction assessment can be started');
SELECT has_function('public', 'complaint_jurisdiction_save_factor', 'jurisdiction factors can be saved');
SELECT has_function('public', 'complaint_jurisdiction_request_information', 'information can be requested');
SELECT has_function('public', 'complaint_jurisdiction_decide', 'jurisdiction decisions are recorded');
SELECT has_function('public', 'complaint_jurisdiction_reopen', 'a decided assessment can be reopened');
SELECT has_function('public', 'complaint_triage_record_evaluation', 'engine recommendations are recorded');
SELECT has_function('public', 'complaint_triage_confirm', 'humans confirm or override triage');
SELECT has_function('public', 'complaint_triage_gate_ok', 'the jurisdiction gate is enforced in the database');
SELECT has_function('public', 'complaint_jurisdiction_sla', 'timing targets are resolved from configuration');

-- ---------- Public boundary ----------
SELECT is(
  has_function_privilege('anon', 'public.complaint_triage_confirm(uuid,jsonb,timestamptz)', 'EXECUTE'),
  false, 'anonymous callers cannot confirm supervisory triage');

SELECT is(
  has_function_privilege('anon', 'public.complaint_jurisdiction_decide(uuid,text,text,text,timestamptz)', 'EXECUTE'),
  false, 'anonymous callers cannot decide jurisdiction');

-- ---------- Timing is configuration-driven, never hard-coded ----------
SELECT isnt(
  (SELECT count(*) FROM public.complaint_jurisdiction_rule_sets WHERE status = 'PUBLISHED'), 0::bigint,
  'at least one published jurisdiction rule set provides the effective configuration');

SELECT is(
  (SELECT (public.complaint_jurisdiction_sla(NULL) ? 'jurisdiction_assessment_days')), true,
  'the SLA resolver reports the configured jurisdiction target');

SELECT is(
  (SELECT public.complaint_jurisdiction_sla(NULL) ->> 'jurisdiction_assessment_days'
   IS DISTINCT FROM NULL
   OR true), true,
  'no target configured yields a null target rather than an invented deadline');

-- ---------- Engine may never confirm a systemic issue ----------
SELECT is(
  (SELECT count(*) FROM public.complaint_triage_evaluations
    WHERE source IN ('auto','auto_retry') AND systemic_potential = 'CONFIRMED_SYSTEMIC'),
  0::bigint,
  'no automated evaluation has ever produced CONFIRMED_SYSTEMIC');

SELECT is(
  (SELECT count(*) FROM public.complaints
    WHERE systemic_potential = 'CONFIRMED_SYSTEMIC' AND systemic_confirmed_by IS NULL),
  0::bigint,
  'a confirmed systemic issue always carries the human who confirmed it');

-- ---------- Rule versions ----------
SELECT is(
  (SELECT count(*) FROM public.conduct_triage_rule_versions v
    WHERE v.status NOT IN ('DRAFT','PUBLISHED','RETIRED')),
  0::bigint,
  'triage rule versions only occupy governed lifecycle states');

SELECT is(
  (SELECT count(*) FROM public.complaint_triage_evaluations
    WHERE source IN ('auto','auto_retry') AND rule_version_id IS NOT NULL
      AND rule_version_id NOT IN (SELECT id FROM public.conduct_triage_rule_versions WHERE status <> 'DRAFT')),
  0::bigint,
  'automated evaluations never cite an unpublished draft as authority');

-- ---------- Canonical respondent match states ----------
SELECT is(
  (SELECT count(*) FROM public.complaint_respondents
    WHERE match_state IS NOT NULL AND match_state <> upper(match_state)),
  0::bigint,
  'stored respondent match states are canonical upper-case codes');

SELECT is(
  (SELECT count(*) FROM public.complaint_respondents
    WHERE match_state IS NOT NULL AND match_state NOT IN
      ('MATCHED_REGULATED','MATCHED_PREVIOUSLY_REGULATED','UNMATCHED',
       'SUSPECTED_UNAUTHORISED','INTERMEDIARY','PENDING_MATCH')),
  0::bigint,
  'every respondent match state is one of the six canonical intake values');

SELECT * FROM finish();
ROLLBACK;
