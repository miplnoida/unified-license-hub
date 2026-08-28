-- ============================================================================
-- F4-B3 — DEF-F4-C-02 REMEDIATION PROBES
--
--   A  Coordination case create + owner seeding + clearance transition
--   B  Participant clearance workflow (pending -> cleared)
--   C  Valid case status update
--   D  Flag raise / resolve / withdraw
--   E  Audit contract: actor non-null, action keys, state + provenance
--   F  Negative: non-participant operations denied by RLS
--   G  F4 readiness dimension: coordination BLOCKED -> CLEAR, other
--      dimensions independently evaluated
--
-- Every fixture is synthetic and created inside a single transaction that is
-- ROLLED BACK at the end. No production record is mutated.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f4b3-coordination.sql
-- ============================================================================
\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
-- Every gate restores the default explicitly so RLS probes are deterministic.
SET row_security = on;
SET client_min_messages = warning;

BEGIN;

CREATE TEMP TABLE f4b3_results (
  seq serial, stage text, id text, descr text, passed boolean, detail text
) ON COMMIT DROP;

CREATE TEMP TABLE f4b3_fixture (k text primary key, v uuid) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO f4b3_results (stage, id, descr, passed, detail)
  VALUES (_stage, _id, _d, _ok, _detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.put(_k text, _v uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO f4b3_fixture (k, v) VALUES (_k, _v)
  ON CONFLICT (k) DO UPDATE SET v = excluded.v RETURNING v;
$$;

CREATE OR REPLACE FUNCTION pg_temp.get(_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT v FROM f4b3_fixture WHERE k = _k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_uid(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- Latest audit row for a coordination entity.
--
-- DEF-F5-B3R-02: `ORDER BY created_at DESC, ctid DESC` was NOT deterministic.
-- Every audit row written inside this transaction shares created_at, and heap
-- ctid order is not insertion order (rolled-back earlier runs leave reusable
-- free space, so a newer row can land on a lower ctid). That made B2/B4/C2
-- intermittently read a *later* transition than the one under test.
--
-- The gate now uses an explicit watermark: every audit row already seen (or
-- pre-existing) is recorded in coord_audit_seen, and aud() returns the single
-- row this step newly produced.
CREATE TEMP TABLE coord_audit_seen (id uuid PRIMARY KEY) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.aud(_etype text, _eid uuid)
RETURNS public.audit_logs LANGUAGE plpgsql AS $$
DECLARE r public.audit_logs;
BEGIN
  SELECT a.* INTO r
    FROM public.audit_logs a
   WHERE a.entity_type = _etype
     AND a.entity_id = _eid::text
     AND NOT EXISTS (SELECT 1 FROM coord_audit_seen s WHERE s.id = a.id)
   ORDER BY a.created_at DESC
   LIMIT 1;
  IF r.id IS NOT NULL THEN
    INSERT INTO coord_audit_seen (id) VALUES (r.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN r;
END $$;

-- Marks every audit row currently present for an entity as already observed,
-- so a subsequent aud() call can only return rows produced afterwards.
CREATE OR REPLACE FUNCTION pg_temp.aud_mark(_etype text, _eid uuid)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO coord_audit_seen (id)
  SELECT a.id FROM public.audit_logs a
   WHERE a.entity_type = _etype AND a.entity_id = _eid::text
  ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION pg_temp.coord_state(_app uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT d->>'state'
    FROM jsonb_array_elements(public.application_licensing_readiness(_app)->'gates') d
   WHERE d->>'gate' = 'coordination' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.coord_blockers(_app uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT jsonb_array_length(COALESCE(d->'blockers','[]'::jsonb))
    FROM jsonb_array_elements(public.application_licensing_readiness(_app)->'gates') d
   WHERE d->>'gate' = 'coordination' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.non_coord_gates(_app uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_object_agg(d->>'gate', d->>'state')
    FROM jsonb_array_elements(public.application_licensing_readiness(_app)->'gates') d
   WHERE d->>'gate' <> 'coordination';
$$;

-- ===========================================================================
-- FIXTURES
-- ===========================================================================
DO $fx$
DECLARE
  v_owner uuid; v_peer uuid; v_outsider uuid; v_reg uuid; v_app uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.user_roles WHERE role = 'super_admin' LIMIT 1;
  SELECT user_id INTO v_peer FROM public.user_roles
   WHERE role IN ('supervisor','licensing_officer','analyst') AND user_id <> v_owner LIMIT 1;
  SELECT ur.user_id INTO v_outsider FROM public.user_roles ur
   WHERE ur.role IN ('applicant','pre_licensee')
     AND ur.user_id NOT IN (v_owner, COALESCE(v_peer, v_owner))
     AND NOT public.is_super_admin(ur.user_id)
   ORDER BY ur.user_id LIMIT 1;
  SELECT id INTO v_reg FROM public.regulators ORDER BY created_at LIMIT 1;
  SELECT id INTO v_app FROM public.applications ORDER BY created_at DESC LIMIT 1;

  IF v_owner IS NULL OR v_peer IS NULL OR v_outsider IS NULL OR v_app IS NULL THEN
    RAISE EXCEPTION 'F4-B3 fixture precondition failed (owner=% peer=% outsider=% app=%)',
      v_owner, v_peer, v_outsider, v_app;
  END IF;

  PERFORM pg_temp.put('owner', v_owner);
  PERFORM pg_temp.put('peer', v_peer);
  PERFORM pg_temp.put('outsider', v_outsider);
  PERFORM pg_temp.put('reg', v_reg);
  PERFORM pg_temp.put('app', v_app);
END $fx$;

-- ===========================================================================
-- A. Case create -> owner seeded -> auto clearance -> audit
-- ===========================================================================
DO $a$
DECLARE
  v_case uuid; v_owner uuid := pg_temp.get('owner'); v_status text;
  v_a public.audit_logs; v_participants int;
  v_reg uuid := pg_temp.get('reg'); v_app uuid := pg_temp.get('app');
BEGIN
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.coordination_cases
    (title, description, subject_type, subject_id, owner_regulator_id, owner_user_id,
     primary_regulator_id, clearance_required)
  VALUES ('CERT-F4B3 coordination probe', 'F4-B3 rollback-safe probe', 'application',
          v_app, v_reg, v_owner, v_reg, true)
  RETURNING id INTO v_case;

  RESET ROLE;
  PERFORM pg_temp.put('case', v_case);
  PERFORM pg_temp.rec('A','A1','coordination case create succeeds (no 42703)', v_case IS NOT NULL, v_case::text);

  SELECT count(*) INTO v_participants FROM public.coordination_participants WHERE case_id = v_case;
  PERFORM pg_temp.rec('A','A2','owner seeded as cleared participant', v_participants = 1,
    'participants=' || v_participants);

  SELECT status INTO v_status FROM public.coordination_cases WHERE id = v_case;
  PERFORM pg_temp.rec('A','A3','clearance trigger transitions case to cleared', v_status = 'cleared',
    'status=' || v_status);

  v_a := pg_temp.aud('coordination_case', v_case);
  PERFORM pg_temp.rec('A','A4','audit row written for case clearance', v_a.id IS NOT NULL,
    COALESCE(v_a.action,'<none>'));
  PERFORM pg_temp.rec('A','A5','action key = coordination.case.cleared',
    v_a.action = 'coordination.case.cleared', COALESCE(v_a.action,'<none>'));
  PERFORM pg_temp.rec('A','A6','audit actor non-null and equals authenticated user',
    v_a.user_id = v_owner, COALESCE(v_a.user_id::text,'NULL'));
  PERFORM pg_temp.rec('A','A7','state transition captured in old_value/new_value',
    v_a.old_value->>'status' IS NOT NULL AND v_a.new_value->>'status' = 'cleared',
    COALESCE(v_a.old_value::text,'-') || ' -> ' || COALESCE(v_a.new_value::text,'-'));
  PERFORM pg_temp.rec('A','A8','coordination provenance preserved in metadata',
    v_a.metadata->>'subject_type' = 'application'
      AND v_a.metadata->>'primary_regulator_id' IS NOT NULL
      AND v_a.metadata->>'from_status' IS NOT NULL,
    COALESCE(v_a.metadata::text,'NULL'));
END $a$;

-- ===========================================================================
-- B. Participant clearance workflow: pending -> pending_clearance -> cleared
-- ===========================================================================
DO $b$
DECLARE
  v_case uuid := pg_temp.get('case'); v_owner uuid := pg_temp.get('owner');
  v_peer uuid := pg_temp.get('peer'); v_status text; v_a public.audit_logs; v_part uuid;
  v_reg uuid := pg_temp.get('reg');
BEGIN
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.coordination_participants (case_id, regulator_id, user_id, participant_role, invited_by)
  VALUES (v_case, v_reg, v_peer, 'participant', v_owner)
  RETURNING id INTO v_part;
  RESET ROLE;

  SELECT status INTO v_status FROM public.coordination_cases WHERE id = v_case;
  PERFORM pg_temp.rec('B','B1','pending participant returns case to pending_clearance',
    v_status = 'pending_clearance', 'status=' || v_status);

  v_a := pg_temp.aud('coordination_case', v_case);
  PERFORM pg_temp.rec('B','B2','audit records coordination.case.pending_clearance',
    v_a.action = 'coordination.case.pending_clearance' AND v_a.user_id = v_owner,
    COALESCE(v_a.action,'<none>') || ' by ' || COALESCE(v_a.user_id::text,'NULL'));

  -- peer clears itself (canonical clearance path)
  PERFORM pg_temp.as_uid(v_peer);
  SET LOCAL ROLE authenticated;
  UPDATE public.coordination_participants
     SET clearance_status = 'cleared', cleared_at = now(), clearance_note = 'F4-B3 probe'
   WHERE id = v_part;
  RESET ROLE;

  SELECT status INTO v_status FROM public.coordination_cases WHERE id = v_case;
  PERFORM pg_temp.rec('B','B3','all-cleared participants transition case to cleared',
    v_status = 'cleared', 'status=' || v_status);

  v_a := pg_temp.aud('coordination_case', v_case);
  PERFORM pg_temp.rec('B','B4','clearance audit attributed to the clearing participant',
    v_a.action = 'coordination.case.cleared' AND v_a.user_id = v_peer,
    COALESCE(v_a.action,'<none>') || ' by ' || COALESCE(v_a.user_id::text,'NULL'));
END $b$;

-- ===========================================================================
-- C. Valid case status update by owner
-- ===========================================================================
DO $c$
DECLARE
  v_case uuid := pg_temp.get('case'); v_owner uuid := pg_temp.get('owner');
  v_a public.audit_logs; v_status text;
BEGIN
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;
  UPDATE public.coordination_cases
     SET status = 'closed', closed_at = now(), closed_by = v_owner,
         closure_rationale = 'F4-B3 probe closure', updated_at = now()
   WHERE id = v_case;
  RESET ROLE;

  SELECT status INTO v_status FROM public.coordination_cases WHERE id = v_case;
  PERFORM pg_temp.rec('C','C1','owner case status update succeeds', v_status = 'closed', 'status=' || v_status);

  v_a := pg_temp.aud('coordination_case', v_case);
  PERFORM pg_temp.rec('C','C2','audit records coordination.case.closed with transition',
    v_a.action = 'coordination.case.closed'
      AND v_a.old_value->>'status' = 'cleared'
      AND v_a.new_value->>'status' = 'closed'
      AND v_a.user_id = v_owner,
    COALESCE(v_a.action,'<none>'));

  -- reopen for the flag probes
  UPDATE public.coordination_cases SET status = 'cleared', closed_at = NULL, closed_by = NULL
   WHERE id = v_case;
END $c$;

-- ===========================================================================
-- D. Flag raise / resolve / withdraw
-- ===========================================================================
DO $d$
DECLARE
  v_case uuid := pg_temp.get('case'); v_owner uuid := pg_temp.get('owner');
  v_flag uuid; v_flag2 uuid; v_a public.audit_logs; v_app uuid := pg_temp.get('app');
BEGIN
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.coordination_flags
    (case_id, flag_type, title, description, linked_application_id, created_by)
  VALUES (v_case, 'blocker', 'CERT-F4B3 blocker', 'F4-B3 probe blocker',
          v_app, v_owner)
  RETURNING id INTO v_flag;
  RESET ROLE;

  PERFORM pg_temp.put('flag', v_flag);
  PERFORM pg_temp.rec('D','D1','flag raise succeeds (no 42703)', v_flag IS NOT NULL, v_flag::text);

  v_a := pg_temp.aud('coordination_flag', v_flag);
  PERFORM pg_temp.rec('D','D2','audit records coordination.flag.raised with actor + provenance',
    v_a.action = 'coordination.flag.raised' AND v_a.user_id = v_owner
      AND v_a.metadata->>'case_id' = v_case::text
      AND v_a.metadata->>'linked_application_id' = v_app::text
      AND v_a.new_value->>'flag_type' = 'blocker',
    COALESCE(v_a.action,'<none>') || ' meta=' || COALESCE(v_a.metadata::text,'NULL'));

  -- second flag, later withdrawn
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.coordination_flags
    (case_id, flag_type, title, linked_application_id, created_by)
  VALUES (v_case, 'concurrent_review', 'CERT-F4B3 withdrawable', v_app, v_owner)
  RETURNING id INTO v_flag2;
  RESET ROLE;
  PERFORM pg_temp.put('flag2', v_flag2);
  PERFORM pg_temp.rec('D','D3','second flag raise succeeds', v_flag2 IS NOT NULL, v_flag2::text);
  -- DEF-F5-B3R-02: watermark the raise row so E3 can only observe the audit row
  -- produced by the withdraw transition itself (created_at ties are unavoidable
  -- inside one transaction).
  PERFORM pg_temp.aud_mark('coordination_flag', v_flag2);
END $d$;

-- ===========================================================================
-- E. Readiness dimension: BLOCKED -> CLEAR
-- ===========================================================================
DO $e$
DECLARE
  v_app uuid := pg_temp.get('app'); v_owner uuid := pg_temp.get('owner');
  v_state text; v_before jsonb; v_after jsonb; v_n int; v_a public.audit_logs;
  v_flag uuid := pg_temp.get('flag'); v_flag2 uuid := pg_temp.get('flag2');
  v_case uuid := pg_temp.get('case'); v_app_rows int; v_row_status text;
BEGIN
  v_state := pg_temp.coord_state(v_app);
  v_n := pg_temp.coord_blockers(v_app);
  v_before := pg_temp.non_coord_gates(v_app);
  PERFORM pg_temp.rec('E','E1','readiness reports coordination BLOCKED with open flags',
    v_state = 'REQUIRED_AND_INCOMPLETE' AND v_n >= 2,
    'state=' || COALESCE(v_state,'NULL') || ' blockers=' || v_n);

  -- canonical resolve
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;
  UPDATE public.coordination_flags
     SET status = 'resolved', resolved_at = now(), resolved_by = v_owner
   WHERE id = v_flag;
  GET DIAGNOSTICS v_app_rows = ROW_COUNT;
  RESET ROLE;

  SELECT status INTO v_row_status FROM public.coordination_flags WHERE id = v_flag;
  v_a := pg_temp.aud('coordination_flag', v_flag);
  PERFORM pg_temp.rec('E','E2','flag resolve succeeds and audits coordination.flag.resolved',
    v_app_rows = 1 AND v_row_status = 'resolved'
      AND v_a.action = 'coordination.flag.resolved' AND v_a.user_id = v_owner
      AND v_a.old_value->>'status' = 'open' AND v_a.new_value->>'status' = 'resolved'
      AND v_a.metadata->>'case_id' = v_case::text
      AND v_a.metadata->>'linked_application_id' = v_app::text,
    'rows=' || v_app_rows || ' status=' || COALESCE(v_row_status,'NULL')
      || ' ' || COALESCE(v_a.action,'<none>'));

  -- canonical withdraw
  PERFORM pg_temp.as_uid(v_owner);
  SET LOCAL ROLE authenticated;
  UPDATE public.coordination_flags
     SET status = 'withdrawn', resolved_at = now(), resolved_by = v_owner
   WHERE id = v_flag2;
  GET DIAGNOSTICS v_app_rows = ROW_COUNT;
  RESET ROLE;

  SELECT status INTO v_row_status FROM public.coordination_flags WHERE id = v_flag2;
  v_a := pg_temp.aud('coordination_flag', v_flag2);
  PERFORM pg_temp.rec('E','E3','flag withdraw succeeds and audits coordination.flag.withdrawn',
    v_app_rows = 1 AND v_row_status = 'withdrawn'
      AND v_a.action = 'coordination.flag.withdrawn' AND v_a.user_id = v_owner
      AND v_a.old_value->>'status' = 'open' AND v_a.new_value->>'status' = 'withdrawn'
      AND v_a.metadata->>'case_id' = v_case::text
      AND v_a.metadata->>'linked_application_id' = v_app::text,
    'rows=' || v_app_rows || ' status=' || COALESCE(v_row_status,'NULL')
      || ' ' || COALESCE(v_a.action,'<none>'));

  v_state := pg_temp.coord_state(v_app);
  v_n := pg_temp.coord_blockers(v_app);
  PERFORM pg_temp.rec('E','E4','coordination dimension becomes CLEAR after canonical resolution',
    v_state = 'PASS' AND v_n = 0,
    'state=' || COALESCE(v_state,'NULL') || ' blockers=' || v_n);

  v_after := pg_temp.non_coord_gates(v_app);
  PERFORM pg_temp.rec('E','E5','other readiness dimensions evaluated independently and unchanged',
    v_before = v_after AND (SELECT count(*) FROM jsonb_object_keys(v_after)) >= 5,
    'gates=' || COALESCE(v_after::text,'NULL'));
END $e$;

-- ===========================================================================
-- F. Negative probes: non-participant / cross-entity denied
-- ===========================================================================
DO $f$
DECLARE
  v_case uuid := pg_temp.get('case'); v_out uuid := pg_temp.get('outsider');
  v_seen int; v_rows int; v_err text;
BEGIN
  PERFORM pg_temp.as_uid(v_out);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_seen FROM public.coordination_cases WHERE id = v_case;
  UPDATE public.coordination_cases SET status = 'open' WHERE id = v_case;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RESET ROLE;
  PERFORM pg_temp.rec('F','F1','non-participant cannot read the coordination case', v_seen = 0,
    'rows_visible=' || v_seen);
  PERFORM pg_temp.rec('F','F2','non-participant cannot update case status', v_rows = 0,
    'rows_updated=' || v_rows);

  BEGIN
    PERFORM pg_temp.as_uid(v_out);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.coordination_flags (case_id, flag_type, title, created_by)
    VALUES (v_case, 'blocker', 'CERT-F4B3 illegal flag', v_out);
    RESET ROLE;
    v_err := 'ALLOWED';
  EXCEPTION WHEN others THEN
    RESET ROLE;
    v_err := SQLSTATE;
  END;
  PERFORM pg_temp.rec('F','F3','non-participant cannot raise a flag on the case',
    v_err <> 'ALLOWED', 'result=' || v_err);
END $f$;

-- ===========================================================================
-- G. Contract guard: no stale audit writers remain
-- ===========================================================================
DO $g$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND pg_get_functiondef(p.oid) ~* 'insert\s+into\s+(public\.)?audit_logs\s*\([^)]*(actor_id|details)';
  PERFORM pg_temp.rec('G','G1','no audit_logs writer references actor_id/details', v_bad = 0,
    'stale_writers=' || v_bad);
END $g$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT stage, id, descr, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM f4b3_results ORDER BY seq;

DO $r$
DECLARE v_total int; v_fail int; v_detail text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT passed) INTO v_total, v_fail FROM f4b3_results;
  SELECT string_agg(id || ' ' || descr || ' [' || COALESCE(detail,'') || ']', '; ')
    INTO v_detail FROM f4b3_results WHERE NOT passed;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'F4-B3 coordination probes FAILED — %/% assertions failed: %', v_fail, v_total, v_detail;
  END IF;
  RAISE NOTICE 'F4-B3 coordination probes PASSED — %/% assertions', v_total, v_total;
END $r$;

ROLLBACK;
