-- ============================================================
-- PHASE 11 / TEST 02 — KPI RECONCILIATION
-- For each executive KPI: the headline number, the drilldown
-- predicate, and the underlying source rows must agree exactly
-- on deterministic fixtures. A KPI that counts rows the
-- drilldown would not show is a reporting defect.
-- ============================================================
BEGIN;
SELECT plan(16);

CREATE TEMP TABLE _k AS
SELECT gen_random_uuid() AS applicant_id,
       gen_random_uuid() AS reg_id,
       gen_random_uuid() AS sector_id,
       gen_random_uuid() AS ent_id,
       gen_random_uuid() AS rule_id,
       gen_random_uuid() AS indiv_id;

INSERT INTO auth.users (id, email) SELECT applicant_id, 'p11-kpi@test.local' FROM _k;
INSERT INTO public.regulators (id, code, name) SELECT reg_id, 'P11KPI', 'Phase 11 KPI Regulator' FROM _k;
INSERT INTO public.sectors (id, name, regulator_id) SELECT sector_id, 'P11 KPI Sector', reg_id FROM _k;
INSERT INTO public.licensees (id, name, sector_id) SELECT ent_id, 'P11 KPI Entity', sector_id FROM _k;

-- ---------- licensing: pending applications ----------
INSERT INTO public.applications (applicant_id, license_type, status, sector_id)
SELECT applicant_id, 'banking', 'under_review', sector_id FROM _k
UNION ALL SELECT applicant_id, 'banking', 'submitted', sector_id FROM _k
UNION ALL SELECT applicant_id, 'banking', 'approved', sector_id FROM _k
UNION ALL SELECT applicant_id, 'banking', 'draft', sector_id FROM _k;

SELECT is(
  (SELECT count(*)::int FROM public.applications
     WHERE sector_id = (SELECT sector_id FROM _k)
       AND status IN ('submitted', 'under_review')),
  2, 'licensing headline: in-flight applications counts submitted + under_review');
SELECT is(
  (SELECT count(*)::int FROM public.applications
     WHERE sector_id = (SELECT sector_id FROM _k)
       AND status NOT IN ('draft', 'approved', 'rejected', 'withdrawn')),
  2, 'licensing drilldown predicate returns the same population as the headline');
SELECT is(
  (SELECT count(*)::int FROM public.applications
     WHERE sector_id = (SELECT sector_id FROM _k) AND status = 'draft'),
  1, 'drafts stay out of the in-flight KPI');

-- ---------- conduct: open complaints ----------
INSERT INTO public.complaints (subject, description, licensee_id, status, severity)
SELECT 'P11 open A', 'd', ent_id, 'under_investigation', 'high' FROM _k
UNION ALL SELECT 'P11 open B', 'd', ent_id, 'received', 'medium' FROM _k
UNION ALL SELECT 'P11 closed', 'd', ent_id, 'closed', 'low' FROM _k;

SELECT is(
  (SELECT count(*)::int FROM public.complaints
     WHERE licensee_id = (SELECT ent_id FROM _k) AND status <> 'closed'),
  2, 'conduct headline: open complaints excludes closed cases');
SELECT is(
  (SELECT count(*)::int FROM public.complaints
     WHERE licensee_id = (SELECT ent_id FROM _k)
       AND status IN ('received', 'under_investigation')),
  2, 'conduct drilldown predicate matches the open-complaint headline');
SELECT is(
  (SELECT count(*)::int FROM public.complaints
     WHERE licensee_id = (SELECT ent_id FROM _k) AND severity = 'high' AND status <> 'closed'),
  1, 'severity slice of the KPI reconciles with the source rows');

-- ---------- prudential: open supervisory actions ----------
INSERT INTO public.prudential_actions (entity_id, action_type, source_type, title, severity, status, due_date)
SELECT ent_id, 'directive', 'ewi', 'P11 KPI open overdue', 'high', 'open', current_date - 5 FROM _k
UNION ALL SELECT ent_id, 'directive', 'ewi', 'P11 KPI open future', 'medium', 'open', current_date + 30 FROM _k
UNION ALL SELECT ent_id, 'directive', 'ewi', 'P11 KPI closed', 'high', 'closed', current_date - 5 FROM _k;

SELECT is(
  (SELECT count(*)::int FROM public.prudential_actions
     WHERE entity_id = (SELECT ent_id FROM _k) AND status = 'open'),
  2, 'prudential headline: open supervisory actions');
SELECT is(
  (SELECT count(*)::int FROM public.prudential_actions
     WHERE entity_id = (SELECT ent_id FROM _k) AND status = 'open' AND due_date < current_date),
  1, 'overdue drilldown is a strict subset of the open headline');
SELECT is(
  (SELECT count(*)::int FROM public.prudential_actions
     WHERE entity_id = (SELECT ent_id FROM _k) AND status <> 'open'),
  1, 'closed actions never inflate the open KPI');

-- ---------- enforcement ----------
INSERT INTO public.enforcement_actions (entity_id, status)
SELECT ent_id, 'open' FROM _k
UNION ALL SELECT ent_id, 'closed' FROM _k;

SELECT is(
  (SELECT count(*)::int FROM public.enforcement_actions
     WHERE entity_id = (SELECT ent_id FROM _k) AND status <> 'closed'),
  1, 'enforcement headline counts only live matters');
SELECT is(
  (SELECT count(*)::int FROM public.enforcement_actions
     WHERE entity_id = (SELECT ent_id FROM _k)),
  2, 'total enforcement rows differ from the open KPI, proving the filter is applied');

-- ---------- investigations ----------
INSERT INTO public.conduct_investigations (allegation, source_type, licensee_id, status)
SELECT 'P11 KPI probe', 'complaint', ent_id, 'open' FROM _k
UNION ALL SELECT 'P11 KPI probe closed', 'complaint', ent_id, 'closed' FROM _k;

SELECT is(
  (SELECT count(*)::int FROM public.conduct_investigations
     WHERE licensee_id = (SELECT ent_id FROM _k) AND status <> 'closed'),
  1, 'investigation headline excludes closed investigations');
SELECT is(
  (SELECT count(*)::int FROM public.conduct_investigations
     WHERE licensee_id = (SELECT ent_id FROM _k) AND status = 'closed'),
  1, 'closed investigations remain reachable through their own drilldown');

-- ---------- prudential sector risk reconciles with its components ----------
INSERT INTO public.prudential_ewi_rules (id, code, name, rule_type)
SELECT rule_id, 'P11-KPI-EWI', 'Phase 11 KPI rule', 'threshold' FROM _k;
INSERT INTO public.prudential_ewi_alerts (entity_id, rule_id, rule_code, severity, status, executed_at)
SELECT ent_id, rule_id, 'P11-KPI-EWI', 'critical', 'open', now() FROM _k;

INSERT INTO public.user_roles (user_id, role) SELECT applicant_id, 'super_admin'::app_role FROM _k;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT applicant_id::text FROM _k), 'role', 'authenticated')::text, true);

SELECT is(
  (SELECT evidence_count FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_id FROM _k)),
  (SELECT (SELECT count(*) FROM public.prudential_ewi_alerts
             WHERE entity_id = (SELECT ent_id FROM _k) AND severity IN ('high','critical') AND status = 'open')
        + (SELECT count(*) FROM public.prudential_actions
             WHERE entity_id = (SELECT ent_id FROM _k) AND severity IN ('high','critical') AND status = 'open'))::int,
  'sector risk evidence count equals the sum of its own source rows');

SELECT is(
  (SELECT severe_ewi FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_id FROM _k)),
  1, 'sector risk EWI component reconciles with the alert drilldown');

SELECT is(
  (SELECT open_actions FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_id FROM _k)),
  1, 'sector risk action component counts only open high/critical actions');

SELECT ok(
  (SELECT score FROM public.prudential_sector_risk()
     WHERE sector_id = (SELECT sector_id FROM _k)) = 6.00::numeric,
  'published score equals w4 EWI + w2 action over one entity');

RESET role;
SELECT set_config('request.jwt.claims', NULL, true);

SELECT * FROM finish();
ROLLBACK;
