-- F1-B — decision authority governance (GAP-F1-01) and service configuration
-- completeness (GAP-F1-04). Positive + negative certification.
BEGIN;
SELECT plan(15);

-- ── Structure ────────────────────────────────────────────────────────────
SELECT has_table('public', 'service_config_expectations',
  'service configuration expectations table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'service_config_expectations'),
  'expectations table has RLS enabled');

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.service_config_expectations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.service_config_expectations', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.service_config_expectations', 'DELETE'),
  'expectations are governed-writer only: no direct DML for authenticated');

SELECT ok(
  EXISTS (SELECT 1 FROM public.config_governed_tables WHERE table_name = 'service_config_expectations')
  AND EXISTS (SELECT 1 FROM public.config_governed_tables WHERE table_name = 'license_fee_bindings')
  AND EXISTS (SELECT 1 FROM public.config_governed_tables WHERE table_name = 'license_verification_templates'),
  'fee, verification and expectation configuration are registered as governed');

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.license_fee_bindings', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.license_verification_templates', 'UPDATE'),
  'GAP-F1-05: fee bindings and verification templates cannot be written directly');

-- ── GAP-F1-02 — anonymous configuration reads are closed ────────────────
SELECT ok(
  NOT has_table_privilege('anon', 'public.form_templates', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.notification_templates', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.escalation_rules', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.license_fee_bindings', 'SELECT'),
  'GAP-F1-02: anon cannot read operational configuration tables');

-- ── Authority writers are not anonymously callable ──────────────────────
SELECT ok(
  NOT has_function_privilege('anon',
    'public.decision_authority_rule_upsert(text,uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean,text,integer,boolean,boolean,text,text,uuid,timestamptz,timestamptz,text)',
    'execute'),
  'decision authority writer is not anonymous-executable');

SELECT ok(
  NOT has_function_privilege('anon', 'public.service_configuration_completeness_report()', 'execute'),
  'completeness report is not anonymous-executable');

-- ── The resolver is consumed by the product decision path ───────────────
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'approval_actions'
            AND t.tgname = 'trg_approval_action_decision_authority' AND NOT t.tgisinternal),
  'every recorded approval action evaluates decision authority');

-- ── Baseline configuration is observation-only ──────────────────────────
SELECT ok(
  (SELECT count(*) FROM public.decision_authority_rules
    WHERE status = 'active' AND enforcement_mode = 'ENFORCED') = 0,
  'no active rule enforces authority without an explicit regulator decision');

SELECT ok(
  (SELECT count(*) FROM public.decision_authority_rules
    WHERE status = 'active' AND enforcement_mode = 'OBSERVE_ONLY') >= 8,
  'a baseline observation rule exists for the main decision points');

-- ── Completeness model: every gap carries an explanation ────────────────
SELECT is(
  (SELECT count(*)::int FROM public.service_configuration_completeness c
    WHERE c.state = 'MISSING_REQUIRED'
      AND NOT EXISTS (
        SELECT 1 FROM public.service_config_expectations e
         WHERE e.is_active AND e.dimension = c.dimension
           AND e.justification IS NOT NULL
           AND (e.service_id IS NULL OR e.service_id = c.service_id))),
  0,
  'no unexplained incomplete service configuration remains');

-- ── DEF-F1-C-02: canonical status vocabulary is active / retired ─────────
SELECT ok(
  (SELECT pg_get_constraintdef(oid) LIKE '%''active''%'
      AND pg_get_constraintdef(oid) LIKE '%''retired''%'
     FROM pg_constraint
    WHERE conrelid = 'public.decision_authority_rules'::regclass
      AND conname = 'decision_authority_rules_status_chk'),
  'the rule status constraint uses the canonical active/retired vocabulary');

SELECT is(
  (SELECT count(*)::int FROM public.decision_authority_rules
    WHERE status NOT IN ('active','retired')),
  0,
  'no decision authority rule holds a legacy status value');

-- ── DEF-F1-C-01: audit log is read-only for signed-in users ─────────────
SELECT ok(
  NOT (has_table_privilege('authenticated', 'public.config_change_log', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.config_change_log', 'DELETE')
    OR has_table_privilege('anon', 'public.config_change_log', 'SELECT')),
  'the configuration audit log is signed-in read-only and never public');

SELECT * FROM finish();
ROLLBACK;
