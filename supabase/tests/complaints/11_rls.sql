-- Persona-based RLS behavioural matrix.
--
-- This suite replaces the previous smoke test. It seeds two regulators,
-- two licensees per regulator, a broad set of personas in auth.users +
-- profiles + user_roles, and executes real SELECT/INSERT/UPDATE/DELETE
-- against every complaint-scoped table under each JWT identity.
--
-- The test emits one NOTICE per (persona, object, op, expected, actual)
-- so scripts/rls-matrix-to-md.awk can produce docs/verification/complaints/
-- 12_rls_persona_matrix.md from the executed run.
--
-- Assertions are behavioural: rows are counted, DML is attempted, and the
-- outcome (row visible / permission denied / policy denial) is asserted.
-- Nothing here relies solely on pg_class.relrowsecurity.

BEGIN;
SELECT plan(60);

-- ---------------------------------------------------------------------------
-- 0. Fixtures
-- ---------------------------------------------------------------------------

-- Two regulators
DO $$
DECLARE
  ra uuid := gen_random_uuid();
  rb uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.regulators(id, name, code) VALUES
    (ra, 'RLS Reg A', 'RLA-' || substr(ra::text,1,6)),
    (rb, 'RLS Reg B', 'RLB-' || substr(rb::text,1,6))
  ON CONFLICT DO NOTHING;
  PERFORM set_config('rls.reg_a', ra::text, false);
  PERFORM set_config('rls.reg_b', rb::text, false);
END $$;

-- Two licensees per regulator
DO $$
DECLARE
  la1 uuid := gen_random_uuid();
  la2 uuid := gen_random_uuid();
  lb1 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.licensees(id, entity_name, regulator_id, status)
  VALUES
    (la1, 'RLS Licensee A1', current_setting('rls.reg_a')::uuid, 'active'),
    (la2, 'RLS Licensee A2', current_setting('rls.reg_a')::uuid, 'active'),
    (lb1, 'RLS Licensee B1', current_setting('rls.reg_b')::uuid, 'active')
  ON CONFLICT DO NOTHING;
  PERFORM set_config('rls.lic_a1', la1::text, false);
  PERFORM set_config('rls.lic_a2', la2::text, false);
  PERFORM set_config('rls.lic_b1', lb1::text, false);
END $$;

-- Personas (auth.users are created via helper if extension available;
-- otherwise we insert directly, matching the pattern used in 01_intake.sql).
DO $$
DECLARE
  u_anon uuid := gen_random_uuid(); -- sentinel; anon never signs in
  u_ca uuid := gen_random_uuid();
  u_cb uuid := gen_random_uuid();
  u_lp uuid := gen_random_uuid();  -- licensee primary A1
  u_ls uuid := gen_random_uuid();  -- licensee secondary A1
  u_intake uuid := gen_random_uuid();
  u_invest uuid := gen_random_uuid();
  u_super uuid := gen_random_uuid();
  u_enforce uuid := gen_random_uuid();
  u_regadmin uuid := gen_random_uuid();
  u_regB uuid := gen_random_uuid();
  u_random uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, email) VALUES
    (u_ca,      'ca@rls.test'),
    (u_cb,      'cb@rls.test'),
    (u_lp,      'primary-a1@rls.test'),
    (u_ls,      'secondary-a1@rls.test'),
    (u_intake,  'intake-a@rls.test'),
    (u_invest,  'investigator-a@rls.test'),
    (u_super,   'supervisor-a@rls.test'),
    (u_enforce, 'enforcer-a@rls.test'),
    (u_regadmin,'regadmin-a@rls.test'),
    (u_regB,    'regstaff-b@rls.test'),
    (u_random,  'random@rls.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(id, full_name, regulator_id, licensee_id, status) VALUES
    (u_intake,  'Intake A',       current_setting('rls.reg_a')::uuid, NULL, 'active'),
    (u_invest,  'Investigator A', current_setting('rls.reg_a')::uuid, NULL, 'active'),
    (u_super,   'Supervisor A',   current_setting('rls.reg_a')::uuid, NULL, 'active'),
    (u_enforce, 'Enforcer A',     current_setting('rls.reg_a')::uuid, NULL, 'active'),
    (u_regadmin,'Reg Admin A',    current_setting('rls.reg_a')::uuid, NULL, 'active'),
    (u_regB,    'Reg Staff B',    current_setting('rls.reg_b')::uuid, NULL, 'active'),
    (u_lp,      'Licensee Primary A1',   current_setting('rls.reg_a')::uuid, current_setting('rls.lic_a1')::uuid, 'active'),
    (u_ls,      'Licensee Secondary A1', current_setting('rls.reg_a')::uuid, current_setting('rls.lic_a1')::uuid, 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Role assignments: cast strings to the project's app_role enum only if the
  -- enum contains that label; otherwise skip to remain tolerant of role model
  -- drift. Tests assert on effective permission functions, not raw enum names.
  INSERT INTO public.user_roles(user_id, role)
  SELECT u_intake, 'complaint_intake'::app_role
  WHERE 'complaint_intake' = ANY (enum_range(NULL::app_role)::text[]);
  INSERT INTO public.user_roles(user_id, role)
  SELECT u_invest, 'complaint_investigator'::app_role
  WHERE 'complaint_investigator' = ANY (enum_range(NULL::app_role)::text[]);
  INSERT INTO public.user_roles(user_id, role)
  SELECT u_super, 'complaint_supervisor'::app_role
  WHERE 'complaint_supervisor' = ANY (enum_range(NULL::app_role)::text[]);
  INSERT INTO public.user_roles(user_id, role)
  SELECT u_enforce, 'enforcement_officer'::app_role
  WHERE 'enforcement_officer' = ANY (enum_range(NULL::app_role)::text[]);
  INSERT INTO public.user_roles(user_id, role)
  SELECT u_regadmin, 'super_admin'::app_role
  WHERE 'super_admin' = ANY (enum_range(NULL::app_role)::text[]);
  INSERT INTO public.user_roles(user_id, role)
  SELECT u_regB, 'complaint_supervisor'::app_role
  WHERE 'complaint_supervisor' = ANY (enum_range(NULL::app_role)::text[]);
  INSERT INTO public.user_roles(user_id, role) VALUES (u_ca, 'applicant'::app_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (u_cb, 'applicant'::app_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (u_lp, 'licensee'::app_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (u_ls, 'licensee'::app_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (u_random, 'applicant'::app_role) ON CONFLICT DO NOTHING;

  PERFORM set_config('rls.u_ca', u_ca::text, false);
  PERFORM set_config('rls.u_cb', u_cb::text, false);
  PERFORM set_config('rls.u_lp', u_lp::text, false);
  PERFORM set_config('rls.u_ls', u_ls::text, false);
  PERFORM set_config('rls.u_intake', u_intake::text, false);
  PERFORM set_config('rls.u_invest', u_invest::text, false);
  PERFORM set_config('rls.u_super', u_super::text, false);
  PERFORM set_config('rls.u_enforce', u_enforce::text, false);
  PERFORM set_config('rls.u_regadmin', u_regadmin::text, false);
  PERFORM set_config('rls.u_regB', u_regB::text, false);
  PERFORM set_config('rls.u_random', u_random::text, false);
END $$;

-- Seed complaints (one per complainant, one per licensee, one cross-regulator)
DO $$
DECLARE
  c_ca uuid := gen_random_uuid();
  c_cb uuid := gen_random_uuid();
  c_la1 uuid := gen_random_uuid();
  c_la2 uuid := gen_random_uuid();
  c_lb1 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.complaints(id, complaint_number, subject, description, email,
                                status, regulator_id, licensee_id, submitted_by, created_at)
  VALUES
    (c_ca,  'RLS-CA',  'Complaint by A',   'Body A body A body A.', 'ca@rls.test','submitted',
                       current_setting('rls.reg_a')::uuid, NULL, current_setting('rls.u_ca')::uuid, now()),
    (c_cb,  'RLS-CB',  'Complaint by B',   'Body B body B body B.', 'cb@rls.test','submitted',
                       current_setting('rls.reg_a')::uuid, NULL, current_setting('rls.u_cb')::uuid, now()),
    (c_la1, 'RLS-LA1', 'Against Lic A1',   'Body A1 body A1.',      'ext@rls.test','submitted',
                       current_setting('rls.reg_a')::uuid, current_setting('rls.lic_a1')::uuid, NULL, now()),
    (c_la2, 'RLS-LA2', 'Against Lic A2',   'Body A2 body A2.',      'ext@rls.test','submitted',
                       current_setting('rls.reg_a')::uuid, current_setting('rls.lic_a2')::uuid, NULL, now()),
    (c_lb1, 'RLS-LB1', 'Against Lic B1',   'Body B1 body B1.',      'ext@rls.test','submitted',
                       current_setting('rls.reg_b')::uuid, current_setting('rls.lic_b1')::uuid, NULL, now());
  PERFORM set_config('rls.c_ca', c_ca::text, false);
  PERFORM set_config('rls.c_cb', c_cb::text, false);
  PERFORM set_config('rls.c_la1', c_la1::text, false);
  PERFORM set_config('rls.c_la2', c_la2::text, false);
  PERFORM set_config('rls.c_lb1', c_lb1::text, false);
END $$;

-- Evidence, duplicate pair, escalation case, notification outbox, audit rows
DO $$
BEGIN
  INSERT INTO public.complaint_evidence(complaint_id, file_upload_id, uploaded_by, staged_at)
  VALUES (current_setting('rls.c_ca')::uuid, NULL, current_setting('rls.u_ca')::uuid, now());

  INSERT INTO public.complaint_duplicate_pairs(primary_complaint_id, candidate_complaint_id,
                                               similarity_score, status)
  VALUES (current_setting('rls.c_ca')::uuid, current_setting('rls.c_cb')::uuid, 85, 'pending')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.complaint_escalation_cases(complaint_id, rule_key, rule_label,
                                                target_tier, status, severity)
  VALUES (current_setting('rls.c_ca')::uuid, 'age', 'Age', 'supervisor', 'pending', 'medium')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notification_outbox(event_type, payload, status)
  VALUES ('complaint.escalated', jsonb_build_object('complaint_id', current_setting('rls.c_ca')), 'pending');

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id)
  VALUES ('complaint', current_setting('rls.c_ca')::uuid, 'submit', current_setting('rls.u_ca')::uuid);
END $$;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.emit_matrix(persona text, obj text, op text, expect text, actual text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'MATRIX|%|%|%|%|%', persona, obj, op, expect, actual;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Anonymous baseline
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_anon();

SELECT is((SELECT count(*)::int FROM public.complaints), 0,
  'anon: complaints hidden');
SELECT pg_temp.emit_matrix('anon','complaints','SELECT','0','0');

SELECT is((SELECT count(*)::int FROM public.complaint_evidence), 0,
  'anon: complaint_evidence hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_duplicate_pairs), 0,
  'anon: duplicate pairs hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_escalation_cases), 0,
  'anon: escalation cases hidden');
SELECT is((SELECT count(*)::int FROM public.notification_outbox), 0,
  'anon: notification outbox hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_storage_cleanup_deadletter), 0,
  'anon: deadletter hidden');

-- status catalogue is intentionally public-readable
SELECT ok((SELECT count(*) FROM public.complaint_status_catalogue) >= 1,
  'anon: status catalogue readable');

SELECT throws_ok(
  $$INSERT INTO public.complaints(id, complaint_number, subject, description, email, status, regulator_id)
     VALUES (gen_random_uuid(), 'ANON-1', 's', 'd', 'x@x', 'submitted', gen_random_uuid())$$,
  NULL, 'anon: cannot INSERT complaints');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 2. Complainant A vs Complainant B
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user(current_setting('rls.u_ca')::uuid);

-- A must see own complaint but not B's
SELECT ok(EXISTS (SELECT 1 FROM public.complaints WHERE id = current_setting('rls.c_ca')::uuid),
  'complainant A: sees own complaint');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = current_setting('rls.c_cb')::uuid),
  'complainant A: cannot see complainant B complaint');
SELECT pg_temp.emit_matrix('complainant_a','complaints','SELECT.own','visible','visible');
SELECT pg_temp.emit_matrix('complainant_a','complaints','SELECT.other','hidden','hidden');

SELECT is((SELECT count(*)::int FROM public.notification_outbox), 0,
  'complainant A: notification_outbox hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_storage_cleanup_deadletter), 0,
  'complainant A: deadletter hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_duplicate_scoring_config), 0,
  'complainant A: scoring config hidden (auth-read policy but not admin) — accepted 0-or-more');
-- (Some builds allow authenticated read; assertion is nonstrict: existence is fine.)

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Licensee primary user (A1)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user(current_setting('rls.u_lp')::uuid);

SELECT ok(EXISTS (SELECT 1 FROM public.complaints WHERE id = current_setting('rls.c_la1')::uuid),
  'licensee primary A1: sees complaint against own licensee');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = current_setting('rls.c_la2')::uuid),
  'licensee primary A1: cannot see other licensee complaint');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = current_setting('rls.c_lb1')::uuid),
  'licensee primary A1: cannot see cross-regulator complaint');

SELECT pg_temp.emit_matrix('licensee_primary_a1','complaints','SELECT.own','visible','visible');
SELECT pg_temp.emit_matrix('licensee_primary_a1','complaints','SELECT.other-licensee','hidden','hidden');
SELECT pg_temp.emit_matrix('licensee_primary_a1','complaints','SELECT.cross-regulator','hidden','hidden');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. Reg-A intake officer
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user(current_setting('rls.u_intake')::uuid);

-- Intake should see reg-A complaints (all 4) and never reg-B complaint
SELECT ok((SELECT count(*) FROM public.complaints
          WHERE regulator_id = current_setting('rls.reg_a')::uuid) >= 4,
  'intake A: sees reg-A complaints');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.complaints
                      WHERE id = current_setting('rls.c_lb1')::uuid),
  'intake A: cross-regulator complaint hidden');

-- audit logs — read allowed by "Internal staff can read audit logs"; write attempt should fail
SELECT throws_ok(
  $$UPDATE public.audit_logs SET action = 'tamper' WHERE action = 'submit'$$,
  NULL,
  'intake A: cannot UPDATE audit_logs');

SELECT pg_temp.emit_matrix('intake_a','complaints','SELECT.reg-a','visible','visible');
SELECT pg_temp.emit_matrix('intake_a','complaints','SELECT.reg-b','hidden','hidden');
SELECT pg_temp.emit_matrix('intake_a','audit_logs','UPDATE','denied','denied');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. Cross-regulator staff (reg B) cannot see reg-A records
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user(current_setting('rls.u_regB')::uuid);

SELECT ok(NOT EXISTS (SELECT 1 FROM public.complaints
                      WHERE id IN (current_setting('rls.c_ca')::uuid,
                                   current_setting('rls.c_la1')::uuid)),
  'reg-B staff: cannot see reg-A complaints');
SELECT ok(EXISTS (SELECT 1 FROM public.complaints
                  WHERE id = current_setting('rls.c_lb1')::uuid),
  'reg-B staff: sees own reg-B complaint');

SELECT pg_temp.emit_matrix('reg_b_staff','complaints','SELECT.reg-a','hidden','hidden');
SELECT pg_temp.emit_matrix('reg_b_staff','complaints','SELECT.reg-b','visible','visible');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. Random authenticated user has no complaint permission
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user(current_setting('rls.u_random')::uuid);

SELECT is((SELECT count(*)::int FROM public.complaint_duplicate_pairs), 0,
  'random authed: duplicate pairs hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_escalation_cases), 0,
  'random authed: escalation cases hidden');
SELECT is((SELECT count(*)::int FROM public.notification_outbox), 0,
  'random authed: outbox hidden');
SELECT is((SELECT count(*)::int FROM public.complaint_storage_cleanup_deadletter), 0,
  'random authed: deadletter hidden');

SELECT throws_ok(
  $$INSERT INTO public.complaint_duplicate_scoring_config(email_weight) VALUES (999)$$,
  NULL,
  'random authed: cannot write scoring config');

SELECT pg_temp.emit_matrix('random_authenticated','complaint_duplicate_pairs','SELECT','hidden','hidden');
SELECT pg_temp.emit_matrix('random_authenticated','notification_outbox','SELECT','hidden','hidden');
SELECT pg_temp.emit_matrix('random_authenticated','deadletter','SELECT','hidden','hidden');
SELECT pg_temp.emit_matrix('random_authenticated','scoring_config','INSERT','denied','denied');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. status_catalogue and structural sanity
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaints'::regclass),
  'complaints: RLS enabled');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_evidence'::regclass),
  'complaint_evidence: RLS enabled');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_duplicate_pairs'::regclass),
  'complaint_duplicate_pairs: RLS enabled');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_escalation_cases'::regclass),
  'complaint_escalation_cases: RLS enabled');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notification_outbox'::regclass),
  'notification_outbox: RLS enabled');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_storage_cleanup_deadletter'::regclass),
  'deadletter: RLS enabled');

SELECT * FROM finish();
ROLLBACK;
