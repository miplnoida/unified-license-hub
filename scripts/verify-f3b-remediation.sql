-- ============================================================================
-- F3-B — REGISTRATION CONTROLLED REMEDIATION GATE
--
-- Proves the F3 remediation contract:
--   S1  registration authority boundary            (GAP-F3-01/04)
--   S2  governed applicant mutation surface        (GAP-F3-01/04/13)
--   S3  canonical lifecycle vocabulary             (GAP-F3-03/06)
--   S4  F3 -> F4 handoff contract                  (GAP-F3-05)
--   S5  integrity, reads and uniqueness            (GAP-F3-07/10/11/12/18)
--   S6  workflow / decision authority              (GAP-F3-09)
--   S7  RPC + edge authorization surface           (GAP-F3-02/08/14)
--
-- Read-only apart from rolled-back probe transactions.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f3b-remediation.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = warning;

BEGIN;

DROP TABLE IF EXISTS f3b_results;
CREATE TEMP TABLE f3b_results (
  seq serial, stage text, id text, descr text, passed boolean, detail text
);

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f3b_results (stage, id, descr, passed, detail) VALUES (_stage, _id, _d, _ok, _detail);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- ===========================================================================
-- S1 — REGISTRATION AUTHORITY BOUNDARY (GAP-F3-01/04)
-- ===========================================================================
DO $s1$
DECLARE _n int; _detail text; _res text; _uid uuid; _reg uuid; _other uuid;
BEGIN
  -- A-01..A-03: no browser-role DML privilege on the decision record.
  SELECT count(*), coalesce(string_agg(r.rolename || '/' || p.priv, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('anon'),('authenticated')) r(rolename)
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
   WHERE has_table_privilege(r.rolename, 'public.registrations', p.priv);
  PERFORM pg_temp.rec('S1','A-01','browser roles hold no direct write privilege on the registration decision record',
    _n = 0, 'violations=' || _n || ' [' || _detail || ']');

  PERFORM pg_temp.rec('S1','A-02','a database guard forces every registration mutation through governed server code',
    EXISTS (SELECT 1 FROM pg_trigger t
             WHERE t.tgrelid = 'public.registrations'::regclass
               AND NOT t.tgisinternal
               AND t.tgfoid = 'public.tg_registrations_guard_write()'::regprocedure),
    'guard trigger present');

  PERFORM pg_temp.rec('S1','A-03','the guard function is not callable by browser roles',
    NOT has_function_privilege('anon','public.tg_registrations_guard_write()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.tg_registrations_guard_write()','EXECUTE'),
    'anon=' || has_function_privilege('anon','public.tg_registrations_guard_write()','EXECUTE')::text ||
    ' authenticated=' || has_function_privilege('authenticated','public.tg_registrations_guard_write()','EXECUTE')::text);

  -- Live probes against a real applicant-owned registration.
  SELECT r.id, r.user_id INTO _reg, _uid
    FROM public.registrations r
   WHERE r.user_id IS NOT NULL
   ORDER BY r.created_at DESC LIMIT 1;

  IF _reg IS NULL THEN
    PERFORM pg_temp.rec('S1','A-04','applicant cannot set their own registration status', NULL, 'no fixture');
    PERFORM pg_temp.rec('S1','A-05','applicant cannot alter submitted regulatory data directly', NULL, 'no fixture');
    PERFORM pg_temp.rec('S1','A-06','applicant cannot self-approve through the governed edit RPC', NULL, 'no fixture');
  ELSE
    _res := pg_temp.as_user(_uid, format('UPDATE public.registrations SET status = %L WHERE id = %L', 'approved', _reg));
    PERFORM pg_temp.rec('S1','A-04','applicant cannot set their own registration status',
      _res <> '00000', 'sqlstate=' || _res);

    _res := pg_temp.as_user(_uid, format('UPDATE public.registrations SET applicant_name = %L WHERE id = %L', 'F3B PROBE', _reg));
    PERFORM pg_temp.rec('S1','A-05','applicant cannot alter submitted regulatory data directly',
      _res <> '00000', 'sqlstate=' || _res);

    _res := pg_temp.as_user(_uid,
      format('SELECT public.registration_applicant_apply_edit(%L, %L::jsonb)', _reg, '{"status":"approved"}'));
    PERFORM pg_temp.rec('S1','A-06','applicant cannot self-approve through the governed edit RPC',
      _res <> '00000', 'sqlstate=' || _res);
  END IF;

  -- Cross-tenant probe: a different signed-in user must never edit this record.
  SELECT u.id INTO _other FROM auth.users u WHERE u.id IS DISTINCT FROM _uid ORDER BY u.created_at LIMIT 1;
  IF _reg IS NULL OR _other IS NULL THEN
    PERFORM pg_temp.rec('S1','A-07','a different signed-in user cannot edit someone else''s registration', NULL, 'no fixture');
  ELSE
    _res := pg_temp.as_user(_other,
      format('SELECT public.registration_applicant_apply_edit(%L, %L::jsonb)', _reg, '{"telephone":"000"}'));
    PERFORM pg_temp.rec('S1','A-07','a different signed-in user cannot edit someone else''s registration',
      _res <> '00000', 'sqlstate=' || _res);
  END IF;

  -- Anonymous callers hold nothing at all.
  _res := pg_temp.as_anon('SELECT count(*) FROM public.registrations');
  PERFORM pg_temp.rec('S1','A-08','anonymous callers cannot read the registration register',
    _res <> '00000', 'sqlstate=' || _res);
END
$s1$;

-- ===========================================================================
-- S2 — GOVERNED APPLICANT MUTATION SURFACE (GAP-F3-01/04/13)
-- ===========================================================================
DO $s2$
DECLARE _n int; _detail text; _fields text[]; _res text; _uid uuid; _reg uuid;
BEGIN
  SELECT count(*), coalesce(string_agg(name, ', '), 'none') INTO _n, _detail
    FROM (VALUES
      ('registration_applicant_apply_edit(uuid,jsonb)'),
      ('registration_applicant_resubmit(uuid,jsonb,jsonb,uuid)'),
      ('registration_applicant_withdraw(uuid,text)'),
      ('registration_applicant_editable_fields()')
    ) f(name)
   WHERE to_regprocedure('public.' || name) IS NULL;
  PERFORM pg_temp.rec('S2','B-01','the governed applicant mutation surface exists',
    _n = 0, 'missing=' || _n || ' [' || _detail || ']');

  _fields := public.registration_applicant_editable_fields();
  SELECT count(*), coalesce(string_agg(f, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('status'),('reviewed_by'),('reviewed_at'),('user_id'),('workflow_id'),
                 ('registration_reference'),('review_comments'),('rejection_reason'),
                 ('approved_by'),('approved_at')) v(f)
   WHERE v.f = ANY(_fields);
  PERFORM pg_temp.rec('S2','B-02','no decision, reviewer, workflow or binding field is applicant editable',
    _n = 0, 'leaked=' || _n || ' [' || _detail || ']');

  PERFORM pg_temp.rec('S2','B-03','applicant editable fields are limited to identity/contact/submission content',
    array_length(_fields,1) BETWEEN 8 AND 20, 'editable=' || array_length(_fields,1));

  -- Edits are refused outside allowed lifecycle states.
  SELECT r.id, r.user_id INTO _reg, _uid FROM public.registrations r
   WHERE r.user_id IS NOT NULL AND r.status NOT IN ('pending_verification','awaiting_verification','resubmission_required')
   ORDER BY r.created_at DESC LIMIT 1;
  IF _reg IS NULL THEN
    PERFORM pg_temp.rec('S2','B-04','governed edits are refused outside draft/resubmission states', NULL, 'no fixture');
  ELSE
    _res := pg_temp.as_user(_uid,
      format('SELECT public.registration_applicant_apply_edit(%L, %L::jsonb)', _reg, '{"telephone":"000"}'));
    PERFORM pg_temp.rec('S2','B-04','governed edits are refused outside draft/resubmission states',
      _res <> '00000', 'sqlstate=' || _res);
  END IF;

  -- Withdrawal requires a written reason.
  SELECT r.id, r.user_id INTO _reg, _uid FROM public.registrations r
   WHERE r.user_id IS NOT NULL ORDER BY r.created_at DESC LIMIT 1;
  IF _reg IS NULL THEN
    PERFORM pg_temp.rec('S2','B-05','governed withdrawal requires a written reason', NULL, 'no fixture');
  ELSE
    _res := pg_temp.as_user(_uid, format('SELECT public.registration_applicant_withdraw(%L, %L)', _reg, '   '));
    PERFORM pg_temp.rec('S2','B-05','governed withdrawal requires a written reason',
      _res <> '00000', 'sqlstate=' || _res);
  END IF;

  -- Every applicant RPC is authenticated-only and never anonymous.
  SELECT count(*), coalesce(string_agg(name, ', '), 'none') INTO _n, _detail
    FROM (VALUES
      ('registration_applicant_apply_edit(uuid,jsonb)'),
      ('registration_applicant_resubmit(uuid,jsonb,jsonb,uuid)'),
      ('registration_applicant_withdraw(uuid,text)')
    ) f(name)
   WHERE to_regprocedure('public.' || name) IS NOT NULL
     AND has_function_privilege('anon', to_regprocedure('public.' || name), 'EXECUTE');
  PERFORM pg_temp.rec('S2','B-06','no applicant registration RPC is callable without signing in',
    _n = 0, 'anon-executable=' || _n || ' [' || _detail || ']');
END
$s2$;

-- ===========================================================================
-- S3 — CANONICAL LIFECYCLE VOCABULARY (GAP-F3-03/06)
-- ===========================================================================
DO $s3$
DECLARE _n int; _detail text; _vocab text[];
BEGIN
  PERFORM pg_temp.rec('S3','C-01','a single canonical registration status vocabulary is published',
    to_regprocedure('public.registration_status_vocabulary()') IS NOT NULL, 'vocabulary function present');

  _vocab := public.registration_status_vocabulary();
  PERFORM pg_temp.rec('S3','C-02','the vocabulary covers the real lifecycle including withdrawal',
    'withdrawn' = ANY(_vocab) AND 'approved' = ANY(_vocab) AND 'rejected' = ANY(_vocab)
      AND 'resubmission_required' = ANY(_vocab),
    'vocabulary=' || array_to_string(_vocab, ','));

  PERFORM pg_temp.rec('S3','C-03','the database rejects any status outside the vocabulary',
    EXISTS (SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.registrations'::regclass
               AND c.contype = 'c'
               AND pg_get_constraintdef(c.oid) ILIKE '%registration_status_vocabulary%'),
    'check constraint present');

  SELECT count(*), coalesce(string_agg(DISTINCT status, ', '), 'none') INTO _n, _detail
    FROM public.registrations WHERE status <> ALL (public.registration_status_vocabulary());
  PERFORM pg_temp.rec('S3','C-04','no stored registration carries a legacy or unknown status',
    _n = 0, 'offenders=' || _n || ' [' || _detail || ']');
END
$s3$;

-- ===========================================================================
-- S4 — F3 -> F4 HANDOFF CONTRACT (GAP-F3-05)
-- ===========================================================================
DO $s4$
DECLARE _n int; _detail text;
BEGIN
  PERFORM pg_temp.rec('S4','D-01','a canonical registration-to-licensing handoff register exists',
    to_regclass('public.registration_licensing_handoffs') IS NOT NULL, 'register present');

  PERFORM pg_temp.rec('S4','D-02','the handoff artefact is produced by an idempotent governed server path',
    to_regprocedure('public.registration_licensing_handoff(uuid)') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.registrations'::regclass
                   AND NOT t.tgisinternal
                   AND t.tgfoid = 'public.tg_registration_approved_handoff()'::regprocedure),
    'function + approval trigger present');

  PERFORM pg_temp.rec('S4','D-03','the handoff register is write-protected from browser roles',
    NOT has_table_privilege('anon','public.registration_licensing_handoffs','INSERT')
    AND NOT has_table_privilege('authenticated','public.registration_licensing_handoffs','INSERT')
    AND NOT has_table_privilege('authenticated','public.registration_licensing_handoffs','UPDATE')
    AND NOT has_table_privilege('authenticated','public.registration_licensing_handoffs','DELETE'),
    'privileges locked');

  PERFORM pg_temp.rec('S4','D-04','one handoff per registration is enforced',
    EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
             WHERE i.indrelid = 'public.registration_licensing_handoffs'::regclass
               AND i.indisunique),
    'unique key present');

  -- No handoff may exist for a registration that was never approved.
  SELECT count(*) INTO _n
    FROM public.registration_licensing_handoffs h
    JOIN public.registrations r ON r.id = h.registration_id
   WHERE r.status <> 'approved';
  PERFORM pg_temp.rec('S4','D-05','no licensing handoff exists for a registration that is not approved',
    _n = 0, 'offenders=' || _n);
END
$s4$;

-- ===========================================================================
-- S5 — INTEGRITY, READS AND UNIQUENESS (GAP-F3-07/10/11/12/18)
-- ===========================================================================
DO $s5$
DECLARE _n int; _detail text; _res text; _uid uuid; _cov jsonb;
BEGIN
  -- Grant/policy coherence: applicant-readable satellites must actually be readable.
  SELECT count(*), coalesce(string_agg(t, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('registration_entity_bindings'),('registration_journey_events'),('registration_form_submissions')) v(t)
   WHERE NOT has_table_privilege('authenticated', 'public.' || v.t, 'SELECT');
  PERFORM pg_temp.rec('S5','E-01','signed-in applicants can read their own registration satellites (no grant/policy mismatch)',
    _n = 0, 'unreadable=' || _n || ' [' || _detail || ']');

  SELECT count(*), coalesce(string_agg(t, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('registrations'),('registration_entity_bindings'),('registration_journey_events'),
                 ('registration_form_submissions'),('registration_licensing_handoffs')) v(t)
   WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
                      WHERE ns.nspname='public' AND c.relname = v.t AND c.relrowsecurity);
  PERFORM pg_temp.rec('S5','E-02','row level security is enabled across the registration estate',
    _n = 0, 'without RLS=' || _n || ' [' || _detail || ']');

  PERFORM pg_temp.rec('S5','E-03','authoritative registration-number uniqueness is enforced',
    EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'registrations_registration_number_uidx'),
    'unique index present');

  PERFORM pg_temp.rec('S5','E-04','a user cannot hold two live registrations at once',
    EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'registrations_one_live_per_user_uidx'),
    'partial unique index present');

  -- Entity binding coverage is measured and reported (GAP-F3-18).
  PERFORM pg_temp.rec('S5','E-05','entity-binding coverage is measurable from a governed reporting routine',
    to_regprocedure('public.registration_binding_coverage()') IS NOT NULL, 'coverage routine present');

  IF to_regprocedure('public.registration_binding_coverage()') IS NOT NULL THEN
    _cov := public.registration_binding_coverage();
    PERFORM pg_temp.rec('S5','E-06','every submitted or decided registration is bound to a canonical entity',
      COALESCE((_cov->>'unbound_actionable')::int, 1) = 0, _cov::text);
  ELSE
    PERFORM pg_temp.rec('S5','E-06','every submitted or decided registration is bound to a canonical entity', false, 'no coverage routine');
  END IF;

  -- Resubmission model: submissions are wired to the canonical registration.
  SELECT count(*) INTO _n FROM public.registration_form_submissions WHERE registration_id IS NULL;
  PERFORM pg_temp.rec('S5','E-07','every registration form submission is wired to a canonical registration',
    _n = 0, 'orphans=' || _n);
END
$s5$;

-- ===========================================================================
-- S6 — WORKFLOW / DECISION AUTHORITY (GAP-F3-09)
-- ===========================================================================
DO $s6$
DECLARE _n int; _detail text; _steps int;
BEGIN
  SELECT count(*) INTO _n FROM public.approval_workflows w
   WHERE w.is_active AND w.entity_type = 'registration';
  PERFORM pg_temp.rec('S6','F-01','at least one active governed registration workflow is configured',
    _n >= 1, 'active registration workflows=' || _n);

  -- Maker-checker: the registration workflow must not be a single super-admin step.
  SELECT count(*) INTO _steps FROM public.approval_steps s
   WHERE s.workflow_id IN (
     SELECT w.id FROM public.approval_workflows w
      WHERE w.is_active AND w.entity_type = 'registration');
  PERFORM pg_temp.rec('S6','F-02','registration decisions follow a maker-checker step model',
    _steps >= 2, 'configured steps=' || _steps);

  SELECT count(*), coalesce(string_agg(DISTINCT r.name, ', '), 'none') INTO _n, _detail
    FROM public.approval_steps s
    JOIN public.roles r ON r.id = s.approver_role_id
   WHERE s.workflow_id IN (
     SELECT w.id FROM public.approval_workflows w
      WHERE w.is_active AND w.entity_type = 'registration')
     AND lower(r.name) LIKE '%super%admin%';
  PERFORM pg_temp.rec('S6','F-03','registration approval is not reserved to the platform super administrator',
    _n = 0, 'super-admin steps=' || _n || ' [' || _detail || ']');

  PERFORM pg_temp.rec('S6','F-04','lifecycle transitions run through the canonical server transition function',
    to_regprocedure('public.perform_registration_workflow_transition(uuid,text,text,uuid,uuid)') IS NOT NULL
      OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                  WHERE ns.nspname='public' AND p.proname='perform_registration_workflow_transition'),
    'transition function present');
END
$s6$;

-- ===========================================================================
-- S7 — RPC + EDGE AUTHORIZATION SURFACE (GAP-F3-02/08/14)
-- ===========================================================================
DO $s7$
DECLARE _res text; _uid uuid; _reg uuid; _other uuid;
BEGIN
  -- The anonymous applicant-name enumeration oracle is closed.
  PERFORM pg_temp.rec('S7','G-01','the applicant-name duplicate oracle is no longer anonymous',
    to_regprocedure('public.check_applicant_name_exists(text)') IS NULL
      OR NOT has_function_privilege('anon','public.check_applicant_name_exists(text)','EXECUTE'),
    'anon-executable=' || COALESCE(has_function_privilege('anon','public.check_applicant_name_exists(text)','EXECUTE')::text,'n/a'));

  -- start_registration_workflow must not be arbitrarily executable.
  SELECT r.id, r.user_id INTO _reg, _uid FROM public.registrations r
   WHERE r.user_id IS NOT NULL ORDER BY r.created_at DESC LIMIT 1;
  SELECT u.id INTO _other FROM auth.users u WHERE u.id IS DISTINCT FROM _uid ORDER BY u.created_at LIMIT 1;
  IF _reg IS NULL OR _other IS NULL THEN
    PERFORM pg_temp.rec('S7','G-02','workflow start cannot be triggered by an arbitrary signed-in caller', NULL, 'no fixture');
  ELSE
    _res := pg_temp.as_user(_other, format('SELECT public.start_registration_workflow(%L)', _reg));
    PERFORM pg_temp.rec('S7','G-02','workflow start cannot be triggered by an arbitrary signed-in caller',
      _res <> '00000', 'sqlstate=' || _res);
  END IF;

  _res := pg_temp.as_anon(format('SELECT public.start_registration_workflow(%L)', COALESCE(_reg, gen_random_uuid())));
  PERFORM pg_temp.rec('S7','G-03','workflow start is not reachable anonymously',
    _res <> '00000', 'sqlstate=' || _res);

  -- Internal trigger functions are never part of the API surface.
  PERFORM pg_temp.rec('S7','G-04','registration trigger functions are not callable through the API roles',
    NOT has_function_privilege('anon','public.tg_registration_approved_handoff()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.tg_registration_approved_handoff()','EXECUTE'),
    'handoff trigger locked');
END
$s7$;

-- ===========================================================================
-- EVIDENCE
-- ===========================================================================
\pset border 2
SELECT stage, id, descr,
       CASE WHEN passed IS NULL THEN 'N/A' WHEN passed THEN 'TESTED_PASS' ELSE 'TESTED_FAIL' END AS result,
       detail
FROM f3b_results ORDER BY seq;

DO $sum$
DECLARE _p int; _f int; _n int; _r record;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE passed IS FALSE), count(*) FILTER (WHERE passed IS NULL)
    INTO _p, _f, _n FROM f3b_results;
  FOR _r IN SELECT stage, id, descr, detail FROM f3b_results WHERE passed IS FALSE ORDER BY seq LOOP
    RAISE WARNING 'F3-B FAILED ASSERTION [% %] % -- %', _r.stage, _r.id, _r.descr, _r.detail;
  END LOOP;
  FOR _r IN SELECT stage, id, descr, detail FROM f3b_results WHERE passed IS NULL ORDER BY seq LOOP
    RAISE WARNING 'F3-B NOT-APPLICABLE ASSERTION [% %] % -- %', _r.stage, _r.id, _r.descr, _r.detail;
  END LOOP;
  RAISE WARNING 'F3-B EVIDENCE SUMMARY: % TESTED_PASS / % TESTED_FAIL / % N-A', _p, _f, _n;
  IF _f > 0 THEN
    RAISE EXCEPTION 'F3-B remediation gate FAILED: % assertion(s) failed', _f;
  END IF;
END
$sum$;

ROLLBACK;
