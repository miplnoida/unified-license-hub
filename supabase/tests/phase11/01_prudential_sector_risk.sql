-- ============================================================
-- PHASE 11 / TEST 01 — PRUDENTIAL SECTOR RISK METHODOLOGY
-- Proves prudential_sector_risk() aggregates real prudential
-- evidence (breaches, EWI, assessments, group risk, actions),
-- bands deterministically, never reports LOW by default, and
-- is denied to callers without prudential view rights.
-- ============================================================
BEGIN;
SELECT plan(18);

-- ---------- structure ----------
SELECT has_function('public', 'prudential_sector_risk', ARRAY['integer'],
  'prudential_sector_risk(lookback_days) exists');
SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prudential_sector_risk'),
  true, 'prudential_sector_risk is SECURITY DEFINER');
SELECT is(
  (SELECT has_function_privilege('anon', 'public.prudential_sector_risk(integer)', 'EXECUTE')),
  false, 'anon has no EXECUTE privilege on the aggregation');

-- ---------- fixtures ----------
CREATE TEMP TABLE _p11 AS
SELECT gen_random_uuid() AS admin_id,
       gen_random_uuid() AS stranger_id,
       gen_random_uuid() AS reg_id,
       gen_random_uuid() AS sector_hot_id,
       gen_random_uuid() AS sector_quiet_id,
       gen_random_uuid() AS sector_mid_id,
       gen_random_uuid() AS ent_hot_id,
       gen_random_uuid() AS ent_mid_id,
       gen_random_uuid() AS ent_quiet_id,
       gen_random_uuid() AS rule_id,
       gen_random_uuid() AS group_id;

INSERT INTO auth.users (id, email)
SELECT admin_id, 'p11-admin@test.local' FROM _p11
UNION ALL SELECT stranger_id, 'p11-stranger@test.local' FROM _p11;

INSERT INTO public.user_roles (user_id, role)
SELECT admin_id, 'super_admin'::app_role FROM _p11;

INSERT INTO public.regulators (id, code, name)
SELECT reg_id, 'P11REG', 'Phase 11 Regulator' FROM _p11;

INSERT INTO public.sectors (id, name, regulator_id)
SELECT sector_hot_id, 'P11 Hot Sector', reg_id FROM _p11
UNION ALL SELECT sector_mid_id, 'P11 Mid Sector', reg_id FROM _p11
UNION ALL SELECT sector_quiet_id, 'P11 Quiet Sector', reg_id FROM _p11;

INSERT INTO public.licensees (id, name, sector_id)
SELECT ent_hot_id, 'P11 Hot Bank', sector_hot_id FROM _p11
UNION ALL SELECT ent_mid_id, 'P11 Mid Bank', sector_mid_id FROM _p11
UNION ALL SELECT ent_quiet_id, 'P11 Quiet Bank', sector_quiet_id FROM _p11;

INSERT INTO public.prudential_ewi_rules (id, code, name, rule_type)
SELECT rule_id, 'P11-EWI', 'Phase 11 EWI rule', 'threshold' FROM _p11;

-- Hot sector: 2 severe open EWI (w4) + 1 adverse assessment (w5) + 1 open critical action (w2)
INSERT INTO public.prudential_ewi_alerts (entity_id, rule_id, rule_code, severity, status, executed_at)
SELECT ent_hot_id, rule_id, 'P11-EWI', 'critical', 'open', now() - interval '2 days' FROM _p11
UNION ALL SELECT ent_hot_id, rule_id, 'P11-EWI', 'high', 'open', now() - interval '3 days' FROM _p11
-- noise that must be excluded: low severity and resolved
UNION ALL SELECT ent_hot_id, rule_id, 'P11-EWI', 'low', 'open', now() - interval '3 days' FROM _p11
UNION ALL SELECT ent_hot_id, rule_id, 'P11-EWI', 'critical', 'resolved', now() - interval '3 days' FROM _p11
-- outside the lookback window
UNION ALL SELECT ent_hot_id, rule_id, 'P11-EWI', 'critical', 'open', now() - interval '800 days' FROM _p11;

INSERT INTO public.prudential_assessments (entity_id, overall_rating, status)
SELECT ent_hot_id, '5', 'approved' FROM _p11
UNION ALL SELECT ent_hot_id, '2', 'approved' FROM _p11;  -- benign rating excluded

INSERT INTO public.prudential_actions (entity_id, action_type, source_type, title, severity, status)
SELECT ent_hot_id, 'directive', 'ewi', 'P11 open directive', 'critical', 'open' FROM _p11
UNION ALL SELECT ent_hot_id, 'directive', 'ewi', 'P11 closed directive', 'critical', 'closed' FROM _p11
UNION ALL SELECT ent_hot_id, 'directive', 'ewi', 'P11 low directive', 'low', 'open' FROM _p11;

-- Mid sector: single high group risk signal only (w3)
INSERT INTO public.financial_groups (id, name, sector_id, status)
SELECT group_id, 'P11 Group', sector_mid_id, 'active' FROM _p11;
INSERT INTO public.financial_group_members (group_id, licensee_id, member_role, consolidation_treatment)
SELECT group_id, ent_mid_id, 'subsidiary', 'full' FROM _p11;
INSERT INTO public.group_risk_scores (group_id, period_key, score, band, is_current)
SELECT group_id, '2026Q1', 71, 'high', true FROM _p11;

-- Quiet sector: deliberately no evidence at all.

-- ---------- authorized aggregation ----------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_id::text FROM _p11), 'role', 'authenticated')::text, true);

SELECT is(
  (SELECT severe_ewi FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  2, 'only high/critical open EWI alerts inside the lookback window are counted');

SELECT is(
  (SELECT adverse_assessments FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  1, 'only adverse (4/5) assessment ratings are counted');

SELECT is(
  (SELECT open_actions FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  1, 'only open high/critical supervisory actions are counted');

SELECT is(
  (SELECT ratio_breaches FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  0, 'no threshold breaches exist for the fixture sector');

SELECT is(
  (SELECT evidence_count FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  4, 'evidence count is the sum of the five contributing signal families');

-- weighted = 2*4 (ewi) + 1*5 (assessment) + 1*2 (action) = 15, 1 entity => 15.00
SELECT is(
  (SELECT score FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  15.00::numeric, 'documented weights reproduce the published score exactly');

SELECT is(
  (SELECT band FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  'CRITICAL', 'score >= 8 bands CRITICAL');

SELECT is(
  (SELECT group_risk_signals FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_mid_id FROM _p11)),
  1, 'high/critical current group risk scores propagate to member sectors');

SELECT is(
  (SELECT score FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_mid_id FROM _p11)),
  3.00::numeric, 'group-only sector scores at the documented w3 weight');

SELECT is(
  (SELECT band FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_mid_id FROM _p11)),
  'MEDIUM', 'score between 1.5 and 4 bands MEDIUM');

-- ---------- never LOW by default ----------
SELECT is(
  (SELECT band FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_quiet_id FROM _p11)),
  'INSUFFICIENT_DATA', 'a sector with no evidence is INSUFFICIENT_DATA, never LOW');

SELECT ok(
  (SELECT score IS NULL FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_quiet_id FROM _p11)),
  'no score is published when there is no evidence');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.prudential_sector_risk()
                WHERE band = 'LOW' AND evidence_count = 0),
  'LOW is never emitted for an empty evidence set');

-- ---------- lookback is honoured ----------
SELECT is(
  (SELECT severe_ewi FROM public.prudential_sector_risk(1)
     WHERE sector_id = (SELECT sector_hot_id FROM _p11)),
  0, 'a 1-day lookback excludes older alerts');

-- ---------- unauthorized callers ----------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT stranger_id::text FROM _p11), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  'SELECT * FROM public.prudential_sector_risk()',
  '42501', NULL, 'a user without prudential_supervision.view is denied');

RESET role;
SELECT set_config('request.jwt.claims', NULL, true);
SET LOCAL role anon;
SELECT throws_ok(
  'SELECT * FROM public.prudential_sector_risk()',
  NULL, NULL, 'anonymous callers are denied the aggregation');
RESET role;

SELECT * FROM finish();
ROLLBACK;
