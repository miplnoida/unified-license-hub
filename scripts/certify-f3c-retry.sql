-- ============================================================================
-- F3-C RETRY — REGISTRATION FINAL CERTIFICATION PROBES
--
--   C1  attempt-1 defect closure (DEF-F3-C-01 permission reference)
--   C2  public duplicate / privacy boundary (GAP-F3-14 residual)
--   C3  registration decision lifecycle (maker / checker / edits / stale)
--   C4  F3 -> F4 handoff boundary (GAP-F3-05)
--
-- Fixtures are created inside a single transaction and rolled back.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/certify-f3c-retry.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = warning;

BEGIN;

CREATE TEMP TABLE f3c_results (
  seq serial, stage text, id text, descr text, passed boolean, detail text
);

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f3c_results (stage, id, descr, passed, detail) VALUES (_stage, _id, _d, _ok, _detail);
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

-- transition helper: runs the governed RPC as a given actor and returns the payload
CREATE OR REPLACE FUNCTION pg_temp.act(_uid uuid, _reg uuid, _instance uuid, _step uuid,
                                       _action text, _comments text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _out jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
  BEGIN
    SELECT public.perform_registration_workflow_transition(_reg, _instance, _step, _action, _comments)
      INTO _out;
  EXCEPTION WHEN others THEN
    _out := jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN coalesce(_out, '{}'::jsonb);
END $$;

-- ===========================================================================
-- C1 — ATTEMPT-1 DEFECT CLOSURE (DEF-F3-C-01)
-- ===========================================================================
DO $c1$
DECLARE _n int; _detail text;
BEGIN
  PERFORM pg_temp.rec('C1','D-01','permission module "registration_review" does not exist',
    NOT EXISTS (SELECT 1 FROM public.permissions WHERE module = 'registration_review'),
    'module absent');

  SELECT count(*), coalesce(string_agg(proname, ', '), 'none') INTO _n, _detail
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosrc ~ 'registration_review';
  PERFORM pg_temp.rec('C1','D-02','no runtime database function references registration_review',
    _n = 0, 'functions=' || _n || ' [' || _detail || ']');

  PERFORM pg_temp.rec('C1','D-03','start_registration_workflow authorises on catalogued registration_management pair',
    (SELECT prosrc LIKE '%registration_management%' AND prosrc LIKE '%approve%'
       FROM pg_proc WHERE oid = 'public.start_registration_workflow(uuid)'::regprocedure),
    'catalogued permission reference');

  SELECT count(*) INTO _n FROM public.permissions
   WHERE module = 'registration_management' AND name IN ('approve','workflow_action');
  PERFORM pg_temp.rec('C1','D-04','registration_management approve/workflow_action are catalogued',
    _n = 2, 'catalogued=' || _n);
END $c1$;


-- ===========================================================================
-- C2 — PUBLIC DUPLICATE / PRIVACY BOUNDARY (GAP-F3-14)
-- ===========================================================================
DO $c2$
DECLARE _n int; _detail text;
BEGIN
  SELECT count(*), coalesce(string_agg(p.proname || '/anon', ', '), 'none') INTO _n, _detail
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'check_applicant_name_exists'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('C2','P-01','unauthenticated callers cannot execute the applicant-name existence probe',
    _n = 0, 'anon grants=' || _n || ' [' || _detail || ']');


  SELECT count(*) INTO _n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND p.proname ~ 'applicant_name|registration_number';
  PERFORM pg_temp.rec('C2','P-02','no anonymous applicant-name / registration-number oracle remains',
    _n = 0, 'anon-executable probes=' || _n);

  PERFORM pg_temp.rec('C2','P-03','server-side duplicate control remains authoritative (unique indexes present)',
    (SELECT count(*) FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'registrations'
        AND indexname IN ('registrations_registration_number_uidx',
                          'registrations_one_live_per_user_uidx')) = 2,
    'uniqueness indexes enforced in the database');
END $c2$;

-- ===========================================================================
-- C3 / C4 — LIFECYCLE + F3 -> F4 BOUNDARY (rolled-back fixtures)
-- ===========================================================================
DO $c3$
DECLARE
  _applicant uuid; _maker uuid; _checker uuid; _other uuid;
  _wf uuid; _s1 uuid; _s2 uuid; _reg uuid; _reg2 uuid; _inst uuid;
  _out jsonb; _res text; _st text; _n int; _hn int; _app uuid; _app2 uuid;
  _checker_role uuid := 'b5c0d563-3923-4164-88d3-4b93bdb45509';
BEGIN
  PERFORM set_config('app.registration_mutation_context', 'governed', true);
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  _wf := public.resolve_registration_workflow(NULL);
  SELECT id INTO _s1 FROM public.approval_steps WHERE workflow_id = _wf ORDER BY step_order ASC LIMIT 1;
  SELECT id INTO _s2 FROM public.approval_steps WHERE workflow_id = _wf ORDER BY step_order DESC LIMIT 1;

  SELECT ur.user_id INTO _maker FROM public.user_roles ur
   WHERE ur.role = 'licensing_officer' LIMIT 1;
  SELECT p.id INTO _applicant FROM public.profiles p
   WHERE NOT public.is_internal_staff(p.id) LIMIT 1;
  SELECT p.id INTO _other FROM public.profiles p
   WHERE NOT public.is_internal_staff(p.id) AND p.id <> _applicant LIMIT 1;
  -- distinct checker: an internal staff member holding the step-2 approver role
  SELECT ur.user_id INTO _checker FROM public.user_roles ur
   WHERE ur.user_id <> _maker AND public.is_internal_staff(ur.user_id) LIMIT 1;
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  VALUES (_checker, _checker_role) ON CONFLICT DO NOTHING;

  -- fixture registration in intake state
  INSERT INTO public.registrations (
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    mailing_address, physical_address, same_as_mailing,
    first_name, last_name, telephone, email, status, registration_reference)
  SELECT _applicant, r.sector_id, r.sub_sector_id, r.category_id, 'F3C Probe Entity',
         '{"line1":"addr"}'::jsonb, '{"line1":"addr"}'::jsonb, true, 'F3C', 'Probe', '0000000', 'f3c.probe@example.test',
         'pending_review', 'F3C-PROBE-' || substr(gen_random_uuid()::text, 1, 8)
    FROM public.registrations r WHERE r.sector_id IS NOT NULL LIMIT 1
  RETURNING id INTO _reg;

  -- C4 pre-approval: intake creates no F4 artefact
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  PERFORM pg_temp.rec('C4','H-01','intake / pending_review creates no F4 handoff artefact',
    _hn = 0, 'handoffs=' || _hn);

  _inst := public.start_registration_workflow(_reg);
  PERFORM pg_temp.rec('C3','L-01','governed workflow instance is created for a submitted registration',
    _inst IS NOT NULL, 'instance=' || coalesce(_inst::text, 'null'));

  -- applicant cannot act as decision maker
  _out := pg_temp.act(_applicant, _reg, _inst, _s1, 'approve', 'applicant self-approval attempt');
  PERFORM pg_temp.rec('C3','L-02','applicant cannot approve their own registration',
    coalesce(_out->>'code','') IN ('WRONG_APPROVER','FORBIDDEN','UNAUTHORIZED')
      AND (SELECT status FROM public.registrations WHERE id = _reg) = 'pending_review',
    'code=' || coalesce(_out->>'code', _out::text));

  -- unrelated user cannot act
  _out := pg_temp.act(_other, _reg, _inst, _s1, 'approve', 'unrelated actor attempt');
  PERFORM pg_temp.rec('C3','L-03','unrelated authenticated user cannot act on the step',
    coalesce(_out->>'code','') IN ('WRONG_APPROVER','FORBIDDEN','UNAUTHORIZED'),
    'code=' || coalesce(_out->>'code', _out::text));

  -- wrong maker: step-2 checker cannot act on step 1
  _out := pg_temp.act(_checker, _reg, _inst, _s1, 'approve', 'wrong step actor');
  PERFORM pg_temp.rec('C3','L-04','a step-2 approver cannot act on step 1 (wrong maker denied)',
    coalesce(_out->>'code','') = 'WRONG_APPROVER'
      OR coalesce((_out->>'success')::boolean, false) = false,
    'code=' || coalesce(_out->>'code', _out::text));

  -- remarks mandatory
  _out := pg_temp.act(_maker, _reg, _inst, _s1, 'approve', NULL);
  PERFORM pg_temp.rec('C3','L-05','mandatory remarks are enforced on decision actions',
    coalesce(_out->>'code','') = 'REMARKS_REQUIRED', 'code=' || coalesce(_out->>'code', _out::text));

  -- stale instance / step rejected
  _out := pg_temp.act(_maker, _reg, gen_random_uuid(), _s1, 'approve', 'stale instance');
  PERFORM pg_temp.rec('C3','L-06','stale workflow instance transitions are rejected',
    coalesce(_out->>'code','') = 'STALE_INSTANCE', 'code=' || coalesce(_out->>'code', _out::text));
  _out := pg_temp.act(_maker, _reg, _inst, _s2, 'approve', 'stale step');
  PERFORM pg_temp.rec('C3','L-07','stale step transitions are rejected',
    coalesce(_out->>'code','') = 'STALE_STEP', 'code=' || coalesce(_out->>'code', _out::text));

  -- correct maker approves -> in_progress at step 2, no F4 artefact yet
  _out := pg_temp.act(_maker, _reg, _inst, _s1, 'approve', 'maker recommends approval');
  SELECT status INTO _st FROM public.registrations WHERE id = _reg;
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  PERFORM pg_temp.rec('C3','L-08','correct maker advances the case to the checker step',
    coalesce((_out->>'success')::boolean,false) AND _st = 'in_progress'
      AND (SELECT current_step_id FROM public.workflow_instances WHERE id = _inst) = _s2,
    'status=' || _st || ' code=' || coalesce(_out->>'code','ok'));
  PERFORM pg_temp.rec('C4','H-02','in_progress (maker approved) creates no F4 handoff artefact',
    _hn = 0, 'handoffs=' || _hn);

  -- maker cannot also act as checker on the final step
  _out := pg_temp.act(_maker, _reg, _inst, _s2, 'approve', 'maker attempts checker action');
  PERFORM pg_temp.rec('C3','L-09','maker cannot also perform the checker decision (segregation of duties)',
    coalesce((_out->>'success')::boolean,false) = false,
    'code=' || coalesce(_out->>'code', _out::text));

  -- checker requests resubmission -> resubmission_required, still no handoff
  _out := pg_temp.act(_checker, _reg, _inst, _s2, 'request_resubmission', 'more information required');
  SELECT status INTO _st FROM public.registrations WHERE id = _reg;
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  PERFORM pg_temp.rec('C3','L-10','checker can return the case for resubmission',
    coalesce((_out->>'success')::boolean,false) AND _st = 'resubmission_required',
    'status=' || _st);
  PERFORM pg_temp.rec('C4','H-03','resubmission_required creates no F4 handoff artefact',
    _hn = 0, 'handoffs=' || _hn);

  -- governed applicant edit permitted in resubmission state, and only on whitelisted fields
  _res := pg_temp.as_user(_applicant,
    format('SELECT public.registration_applicant_apply_edit(%L, %L::jsonb)', _reg,
           '{"telephone":"1234567"}'));
  PERFORM pg_temp.rec('C3','L-11','governed applicant edit succeeds in resubmission state',
    _res = '00000' AND (SELECT telephone FROM public.registrations WHERE id = _reg) = '1234567',
    'state=' || _res);

  _res := pg_temp.as_user(_applicant,
    format('UPDATE public.registrations SET status = %L WHERE id = %L', 'approved', _reg));
  PERFORM pg_temp.rec('C3','L-12','applicant cannot mutate the registration record directly',
    _res <> '00000' AND (SELECT status FROM public.registrations WHERE id = _reg) = 'resubmission_required',
    'state=' || _res);

  _res := pg_temp.as_user(_other,
    format('SELECT public.registration_applicant_apply_edit(%L, %L::jsonb)', _reg,
           '{"telephone":"9999999"}'));
  PERFORM pg_temp.rec('C3','L-13','a different user cannot edit another entity''s registration',
    _res <> '00000' AND (SELECT telephone FROM public.registrations WHERE id = _reg) = '1234567',
    'state=' || _res);

  -- resubmission returns the case to review
  _res := pg_temp.as_user(_applicant,
    format('SELECT public.registration_applicant_resubmit(%L, %L::jsonb)', _reg, '{}'));
  SELECT status INTO _st FROM public.registrations WHERE id = _reg;
  PERFORM pg_temp.rec('C3','L-14','governed resubmission returns the case to the review lifecycle',
    _res = '00000' AND _st IN ('pending_review','in_progress'), 'state=' || _res || ' status=' || _st);

  -- final approval by the checker
  SELECT id, current_step_id INTO _inst, _s2 FROM public.workflow_instances
   WHERE entity_id = _reg AND entity_type = 'registration' AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1;
  IF _s2 <> (SELECT id FROM public.approval_steps WHERE workflow_id = _wf ORDER BY step_order DESC LIMIT 1) THEN
    _out := pg_temp.act(_maker, _reg, _inst, _s2, 'approve', 'maker re-recommends approval');
    SELECT current_step_id INTO _s2 FROM public.workflow_instances WHERE id = _inst;
  END IF;
  _out := pg_temp.act(_checker, _reg, _inst, _s2, 'approve', 'checker approves registration');
  SELECT status INTO _st FROM public.registrations WHERE id = _reg;
  PERFORM pg_temp.rec('C3','L-15','checker final approval moves the registration to approved',
    coalesce((_out->>'success')::boolean,false) AND _st = 'approved',
    'status=' || _st || ' code=' || coalesce(_out->>'code','ok'));

  -- C4: exactly one canonical handoff, matching the registration, idempotent
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  SELECT application_id INTO _app FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  PERFORM pg_temp.rec('C4','H-04','final approval creates exactly one canonical F4 handoff row',
    _hn = 1 AND _app IS NOT NULL, 'handoffs=' || _hn || ' application=' || coalesce(_app::text,'null'));

  PERFORM pg_temp.rec('C4','H-05','handoff binds the correct registration, applicant and reference',
    (SELECT h.registration_reference = r.registration_reference
       FROM public.registration_licensing_handoffs h
       JOIN public.registrations r ON r.id = h.registration_id
      WHERE h.registration_id = _reg)
    AND (SELECT a.applicant_id FROM public.applications a WHERE a.id = _app) = _applicant,
    'reference and applicant bindings match');

  _out := public.registration_licensing_handoff(_reg);
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  SELECT application_id INTO _app2 FROM public.registration_licensing_handoffs WHERE registration_id = _reg;
  PERFORM pg_temp.rec('C4','H-06','repeated handoff invocation is idempotent',
    _hn = 1 AND _app2 = _app AND coalesce((_out->>'idempotent')::boolean,false),
    'handoffs=' || _hn || ' idempotent=' || coalesce(_out->>'idempotent','false'));

  PERFORM pg_temp.rec('C4','H-07','F3 does not advance the F4 application beyond the draft handoff',
    (SELECT status FROM public.applications WHERE id = _app) = 'draft',
    'application status=' || coalesce((SELECT status FROM public.applications WHERE id = _app),'null'));

  _res := pg_temp.as_user(_applicant,
    format('UPDATE public.registration_licensing_handoffs SET application_id = NULL WHERE registration_id = %L', _reg));
  PERFORM pg_temp.rec('C4','H-08','browser roles cannot mutate the handoff artefact',
    _res <> '00000'
      OR (SELECT count(*) FROM (VALUES ('anon'),('authenticated')) r(rolename)
           WHERE has_table_privilege(r.rolename, 'public.registration_licensing_handoffs', 'UPDATE')) = 0,
    'state=' || _res);

  -- terminal-state immutability
  _out := pg_temp.act(_checker, _reg, _inst, _s2, 'approve', 'post-terminal attempt');
  PERFORM pg_temp.rec('C3','L-16','approved registrations are immutable to further workflow actions',
    coalesce(_out->>'code','') IN ('INVALID_STATUS','NO_ACTIVE_INSTANCE'),
    'code=' || coalesce(_out->>'code', _out::text));

  _res := pg_temp.as_user(_applicant,
    format('SELECT public.registration_applicant_apply_edit(%L, %L::jsonb)', _reg, '{"telephone":"7777777"}'));
  PERFORM pg_temp.rec('C3','L-17','approved registration data cannot be edited by the applicant',
    _res <> '00000' AND (SELECT telephone FROM public.registrations WHERE id = _reg) = '1234567',
    'state=' || _res);

  _res := pg_temp.as_user(_applicant,
    format('SELECT public.registration_applicant_withdraw(%L, %L)', _reg, 'change of plan'));
  PERFORM pg_temp.rec('C3','L-18','withdrawal is refused after a final decision',
    _res <> '00000' AND (SELECT status FROM public.registrations WHERE id = _reg) = 'approved',
    'state=' || _res);

  -- audit trail
  SELECT count(*) INTO _n FROM public.approval_actions
   WHERE entity_type = 'registration' AND entity_id = _reg;
  PERFORM pg_temp.rec('C3','L-19','every decision action is recorded in the approval history',
    _n >= 3, 'recorded actions=' || _n);

  -- second fixture: reject + withdraw paths, and their handoff boundary
  INSERT INTO public.registrations (
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    mailing_address, physical_address, same_as_mailing,
    first_name, last_name, telephone, email, status, registration_reference)
  SELECT _other, r.sector_id, r.sub_sector_id, r.category_id, 'F3C Probe Entity 2',
         '{"line1":"addr"}'::jsonb, '{"line1":"addr"}'::jsonb, true, 'F3C', 'Probe2', '0000000', 'f3c.probe2@example.test',
         'pending_review', 'F3C-PROBE-' || substr(gen_random_uuid()::text, 1, 8)
    FROM public.registrations r WHERE r.sector_id IS NOT NULL LIMIT 1
  RETURNING id INTO _reg2;
  _inst := public.start_registration_workflow(_reg2);

  _out := pg_temp.act(_maker, _reg2, _inst, _s1, 'reject', 'rejected on eligibility grounds');
  SELECT status INTO _st FROM public.registrations WHERE id = _reg2;
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg2;
  PERFORM pg_temp.rec('C3','L-20','rejection is a terminal decision recorded by the workflow',
    coalesce((_out->>'success')::boolean,false) AND _st = 'rejected', 'status=' || _st);
  PERFORM pg_temp.rec('C4','H-09','rejected registrations create no F4 handoff artefact',
    _hn = 0, 'handoffs=' || _hn);

  _out := public.registration_licensing_handoff(_reg2);
  PERFORM pg_temp.rec('C4','H-10','handoff is refused for a non-approved registration',
    coalesce(_out->>'code','') = 'NOT_APPROVED', 'code=' || coalesce(_out->>'code', _out::text));

  -- withdrawal before final decision
  UPDATE public.registrations SET status = 'pending_review' WHERE id = _reg2;
  _res := pg_temp.as_user(_other,
    format('SELECT public.registration_applicant_withdraw(%L, %L)', _reg2, 'applicant withdrew'));
  SELECT status INTO _st FROM public.registrations WHERE id = _reg2;
  SELECT count(*) INTO _hn FROM public.registration_licensing_handoffs WHERE registration_id = _reg2;
  PERFORM pg_temp.rec('C3','L-21','applicant can withdraw before a final decision',
    _res = '00000' AND _st = 'withdrawn', 'state=' || _res || ' status=' || _st);
  PERFORM pg_temp.rec('C4','H-11','withdrawn registrations create no F4 handoff artefact',
    _hn = 0, 'handoffs=' || _hn);
END $c3$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT stage, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f3c_results ORDER BY seq;

DO $r$
DECLARE _t int; _p int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE passed) INTO _t, _p FROM f3c_results;
  RAISE NOTICE 'F3-C RETRY PROBES: %/% passed', _p, _t;
  IF _p <> _t THEN
    RAISE EXCEPTION 'F3-C probe failures: %', (
      SELECT string_agg(stage || '/' || id || ' ' || detail, ' | ') FROM f3c_results WHERE NOT passed);
  END IF;
END $r$;

ROLLBACK;
