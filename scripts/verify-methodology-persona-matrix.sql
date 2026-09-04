-- PERSONA — Supervisory methodology administration persona matrix
--
-- Proves that the governed capability contract behind
-- /admin/supervisory-methodology grants exactly the authority each persona
-- holds, and nothing more. The UI renders `supervisory_methodology_action_
-- capabilities` verbatim, so what this script proves about the server is what
-- the workspace can offer.
--
-- Personas (all except Super Admin / oversight are transactional fixtures):
--   P1 AML viewer                     — aml_supervision.view, Regulator A
--   P2 AML assessment supervisor      — view + approve (ASSESSMENT approval)
--   P3 AML methodology config user    — view + manage_config, Regulator A
--   P4 AML methodology approver       — + methodology_approve, Regulator A
--   P5 P4 without Regulator-B scope   — same identity, Regulator B target
--   P6 Super Admin                    — platform administration
--   P7 Enterprise oversight/audit      — cross-regulator read (if provisioned)
--
-- Run:  psql "$DATABASE_URL" -f scripts/verify-methodology-persona-matrix.sql
--
-- Everything runs inside ONE transaction that always ROLLBACKs. Every gate
-- reports individually into `persona_res`; the final SELECT is the result
-- table. PERSONA-12 proves the fixtures wrote no business record.

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_owner() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('role', 'none', true); END $$;

CREATE TEMP TABLE persona_res(gate text, persona text, status text, detail text);

CREATE TEMP TABLE persona_ctx AS
SELECT
  (SELECT id FROM public.supervisory_methodology
    WHERE domain_code = 'AML_CFT' AND origin = 'MIPL_REFERENCE' AND status = 'DRAFT'
    ORDER BY version DESC LIMIT 1) AS reference_id,
  (SELECT id FROM public.supervisory_methodology
    WHERE domain_code = 'AML_CFT' AND status = 'ACTIVE'
    ORDER BY version DESC LIMIT 1) AS active_id;

CREATE TEMP TABLE persona_actor(
  viewer uuid, supervisor uuid, config_user uuid, approver uuid,
  super_admin uuid, oversight uuid, regulator_a uuid, regulator_b uuid);

DO $$
DECLARE
  _regA uuid; _regB uuid; _mod uuid; _stReg uuid;
  _pView uuid; _pApprove uuid; _pManage uuid; _pMeth uuid;
  _rView uuid; _rSup uuid; _rCfg uuid; _rApp uuid;
  _a uuid[]; _sa uuid; _ov uuid;
BEGIN
  INSERT INTO public.regulators(name, code, status)
  VALUES ('ZZ PERSONA Regulator A (fixture)','ZZPERSA','active') RETURNING id INTO _regA;
  INSERT INTO public.regulators(name, code, status)
  VALUES ('ZZ PERSONA Regulator B (fixture)','ZZPERSB','active') RETURNING id INTO _regB;

  SELECT id INTO _mod   FROM public.sec_modules WHERE key = 'aml_supervision';
  SELECT id INTO _stReg FROM public.sec_scope_types WHERE key = 'regulator';
  SELECT id INTO _pView    FROM public.sec_permissions WHERE module_id = _mod AND key = 'view';
  SELECT id INTO _pApprove FROM public.sec_permissions WHERE module_id = _mod AND key = 'approve';
  SELECT id INTO _pManage  FROM public.sec_permissions WHERE module_id = _mod AND key = 'manage_config';
  SELECT id INTO _pMeth    FROM public.sec_permissions WHERE module_id = _mod AND key = 'methodology_approve';

  SELECT array_agg(id) INTO _a FROM (
    SELECT u.id FROM auth.users u
     WHERE NOT public.is_super_admin(u.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.sec_user_roles ur
           JOIN public.sec_role_permissions rp ON rp.role_id = ur.role_id
           JOIN public.sec_permissions p ON p.id = rp.permission_id
           JOIN public.sec_modules m ON m.id = p.module_id
          WHERE ur.user_id = u.id AND m.key = 'aml_supervision')
     ORDER BY u.created_at, u.id LIMIT 4) s;
  IF COALESCE(array_length(_a,1),0) <> 4 THEN
    RAISE EXCEPTION 'fixture_identities_unavailable: need 4 AML-unprivileged accounts, found %',
      COALESCE(array_length(_a,1),0);
  END IF;

  INSERT INTO public.sec_roles(key,name,role_type,status) VALUES
    ('zz_persona_viewer','ZZ PERSONA Viewer','internal','active') RETURNING id INTO _rView;
  INSERT INTO public.sec_roles(key,name,role_type,status) VALUES
    ('zz_persona_supervisor','ZZ PERSONA Assessment Supervisor','internal','active') RETURNING id INTO _rSup;
  INSERT INTO public.sec_roles(key,name,role_type,status) VALUES
    ('zz_persona_config','ZZ PERSONA Methodology Configuration','internal','active') RETURNING id INTO _rCfg;
  INSERT INTO public.sec_roles(key,name,role_type,status) VALUES
    ('zz_persona_approver','ZZ PERSONA Methodology Approver','internal','active') RETURNING id INTO _rApp;

  INSERT INTO public.sec_role_permissions(role_id, permission_id) VALUES
    (_rView,_pView),
    (_rSup,_pView),(_rSup,_pApprove),
    (_rCfg,_pView),(_rCfg,_pManage),
    (_rApp,_pView),(_rApp,_pManage),(_rApp,_pMeth);

  INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id) VALUES
    (_rView,_mod,_stReg),(_rSup,_mod,_stReg),(_rCfg,_mod,_stReg),(_rApp,_mod,_stReg);
  INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
  SELECT rs.id, 'regulator', _regA FROM public.sec_role_scopes rs
    JOIN public.sec_roles r ON r.id = rs.role_id
   WHERE r.key IN ('zz_persona_viewer','zz_persona_supervisor','zz_persona_config','zz_persona_approver');

  INSERT INTO public.sec_user_roles(user_id, role_id, status) VALUES
    (_a[1],_rView,'active'),(_a[2],_rSup,'active'),
    (_a[3],_rCfg,'active'),(_a[4],_rApp,'active');

  SELECT u.id INTO _sa FROM auth.users u WHERE public.is_super_admin(u.id)
   ORDER BY u.created_at LIMIT 1;

  SELECT ur.user_id INTO _ov
    FROM public.sec_user_roles ur
    JOIN public.sec_role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.sec_permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE ur.status = 'active' AND p.key IN ('view','view_confidential')
     AND m.key IN ('audit','compliance_audit','enterprise_oversight','supervision')
     AND NOT public.is_super_admin(ur.user_id)
   LIMIT 1;

  INSERT INTO persona_actor VALUES (_a[1],_a[2],_a[3],_a[4],_sa,_ov,_regA,_regB);
END $$;

CREATE TEMP TABLE persona_pre_ids AS
SELECT id FROM public.supervisory_methodology;

CREATE TEMP TABLE persona_baseline AS
SELECT
  (SELECT count(*) FROM public.supervisory_methodology) AS methodologies,
  (SELECT count(*) FROM public.supervisory_methodology_regulator_approval a
     WHERE a.methodology_id IN (SELECT id FROM persona_pre_ids)) AS approvals,
  (SELECT count(*) FROM public.supervisory_methodology_question q
     WHERE q.active AND q.methodology_id IN (SELECT id FROM persona_pre_ids)) AS questions,
  (SELECT count(*) FROM public.supervisory_methodology_parameter p
     WHERE (p.value_numeric IS NOT NULL OR p.value_text IS NOT NULL)
       AND p.methodology_id IN (SELECT id FROM persona_pre_ids)) AS valued_parameters,
  (SELECT count(*) FROM public.supervisory_methodology_event) AS events,
  (SELECT count(*) FROM public.supervisory_assessment) AS assessments;

GRANT SELECT ON persona_ctx, persona_actor, persona_baseline, persona_pre_ids TO authenticated;

-- ===========================================================================
-- PERSONA-01 — AML viewer: read yes, every governed action refused
-- ===========================================================================
DO $$
DECLARE _u uuid := (SELECT viewer FROM persona_actor); _ref uuid := (SELECT reference_id FROM persona_ctx);
        _c jsonb; _reg jsonb; _bad text;
BEGIN
  PERFORM pg_temp.act_as(_u);
  _reg := public.supervisory_methodology_register();
  _c   := public.supervisory_methodology_action_capabilities(_ref);
  PERFORM pg_temp.act_as_owner();
  IF (_reg->>'total_count')::bigint IS NULL THEN
    RAISE EXCEPTION 'viewer could not read the register';
  END IF;
  SELECT string_agg(k, ', ') INTO _bad FROM (
    SELECT k FROM jsonb_each(_c) x(k,v)
     WHERE k IN ('can_edit','can_adopt','can_submit_review','can_return_to_draft','can_approve','can_activate')
       AND (v->>'allowed')::boolean) s;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'viewer was granted: %', _bad; END IF;
  INSERT INTO persona_res VALUES ('PERSONA-01','AML viewer','PASS',
    format('register readable (%s rows visible); all six actions refused', _reg->>'total_count'));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-01','AML viewer','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-02 — assessment approval authority is NOT methodology approval
-- ===========================================================================
DO $$
DECLARE _u uuid := (SELECT supervisor FROM persona_actor); _ref uuid := (SELECT reference_id FROM persona_ctx);
        _c jsonb; _hasAssess boolean; _hasMeth boolean;
BEGIN
  SELECT bool_or(p.key = 'approve'), bool_or(p.key = 'methodology_approve')
    INTO _hasAssess, _hasMeth
    FROM public.sec_user_roles ur
    JOIN public.sec_role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.sec_permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE ur.user_id = _u AND m.key = 'aml_supervision';
  PERFORM pg_temp.act_as(_u);
  _c := public.supervisory_methodology_action_capabilities(_ref);
  PERFORM pg_temp.act_as_owner();
  IF NOT COALESCE(_hasAssess,false) THEN RAISE EXCEPTION 'fixture lost assessment approval authority'; END IF;
  IF COALESCE(_hasMeth,false) THEN RAISE EXCEPTION 'assessment supervisor holds methodology_approve'; END IF;
  IF (_c->'can_approve'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'assessment supervisor was offered methodology approval';
  END IF;
  IF (_c->'can_activate'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'assessment supervisor was offered activation';
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-02','AML assessment supervisor','PASS',
    format('assessment approve held, methodology approval refused: %s',
      COALESCE(_c->'can_approve'->>'reason','no reason')));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-02','AML assessment supervisor','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-03 — config user may adopt, only into scoped regulators
-- ===========================================================================
DO $$
DECLARE _u uuid := (SELECT config_user FROM persona_actor);
        _ref uuid := (SELECT reference_id FROM persona_ctx);
        _regA uuid := (SELECT regulator_a FROM persona_actor);
        _regB uuid := (SELECT regulator_b FROM persona_actor);
        _t jsonb; _c jsonb; _ids uuid[];
BEGIN
  PERFORM pg_temp.act_as(_u);
  _t := public.supervisory_methodology_adoption_targets(_ref);
  _c := public.supervisory_methodology_action_capabilities(_ref);
  PERFORM pg_temp.act_as_owner();
  SELECT array_agg((r->>'id')::uuid) INTO _ids FROM jsonb_array_elements(COALESCE(_t->'rows','[]'::jsonb)) r;
  IF _regB = ANY(COALESCE(_ids,'{}'::uuid[])) THEN
    RAISE EXCEPTION 'unscoped Regulator B appeared as an adoption target';
  END IF;
  IF NOT (_regA = ANY(COALESCE(_ids,'{}'::uuid[]))) THEN
    RAISE EXCEPTION 'scoped Regulator A missing from adoption targets (reason: %)', _t->>'reason';
  END IF;
  IF (_c->'can_approve'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'configuration authority was also granted methodology approval';
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-03','AML methodology config user','PASS',
    format('adoption targets server-scoped (%s), adopt=%s, approve refused',
      jsonb_array_length(COALESCE(_t->'rows','[]'::jsonb)), _c->'can_adopt'->>'allowed'));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-03','AML methodology config user','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-04 — a MIPL reference is never approvable in place
-- ===========================================================================
DO $$
DECLARE _u uuid := (SELECT approver FROM persona_actor);
        _ref uuid := (SELECT reference_id FROM persona_ctx); _c jsonb;
BEGIN
  PERFORM pg_temp.act_as(_u);
  _c := public.supervisory_methodology_action_capabilities(_ref);
  PERFORM pg_temp.act_as_owner();
  IF (_c->'can_approve'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'a MIPL reference was offered regulator approval';
  END IF;
  IF (_c->'can_activate'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'activation was offered on a MIPL reference';
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-04','AML methodology approver (Regulator A)','PASS',
    format('reference not approvable: %s', COALESCE(_c->'can_approve'->>'reason','no reason')));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-04','AML methodology approver (Regulator A)','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-05 — maker/checker: the submitter is never the approver
-- ===========================================================================
DO $$
DECLARE _cfg uuid := (SELECT config_user FROM persona_actor);
        _app uuid := (SELECT approver FROM persona_actor);
        _ref uuid := (SELECT reference_id FROM persona_ctx);
        _regA uuid := (SELECT regulator_a FROM persona_actor);
        _new uuid; _c jsonb; _cApp jsonb;
BEGIN
  PERFORM pg_temp.act_as(_cfg);
  _new := public.supervisory_methodology_adopt_reference(_ref, _regA,
    'PERSONA fixture adoption — rolled back, no business record retained.');
  PERFORM public.supervisory_methodology_lifecycle(_new, 'REVIEW',
    'PERSONA fixture submission — rolled back, no business record retained.');
  _c := public.supervisory_methodology_action_capabilities(_new);
  PERFORM pg_temp.act_as(_app);
  _cApp := public.supervisory_methodology_action_capabilities(_new);
  PERFORM pg_temp.act_as_owner();

  IF (_c->'can_approve'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'the submitting officer was offered the approval decision';
  END IF;
  IF (_cApp->'maker_checker'->>'actor_is_submitter')::boolean THEN
    RAISE EXCEPTION 'the second officer was misreported as the submitter';
  END IF;
  IF (_cApp->'can_activate'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'activation was offered to the approver';
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-05','Maker/checker separation','PASS',
    format('submitter refused (%s); separate approver can_approve=%s',
      COALESCE(_c->'can_approve'->>'reason','no reason'), _cApp->'can_approve'->>'allowed'));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-05','Maker/checker separation','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-06 — Regulator A authority cannot read Regulator B's approvals
-- ===========================================================================
DO $$
DECLARE _app uuid := (SELECT approver FROM persona_actor);
        _regB uuid := (SELECT regulator_b FROM persona_actor);
        _rows jsonb; _n int; _bad int;
BEGIN
  PERFORM pg_temp.act_as(_app);
  _rows := public.supervisory_methodology_approval_register(NULL, _regB);
  _n := (_rows->>'total_count')::int;
  _rows := public.supervisory_methodology_approval_register();
  SELECT count(*) INTO _bad FROM jsonb_array_elements(COALESCE(_rows->'rows','[]'::jsonb)) r
   WHERE (r->>'regulator_id')::uuid = _regB;
  PERFORM pg_temp.act_as_owner();
  IF COALESCE(_n,0) <> 0 THEN RAISE EXCEPTION 'Regulator B approvals were returned (% rows)', _n; END IF;
  IF _bad > 0 THEN RAISE EXCEPTION 'Regulator B approvals leaked into the unfiltered register'; END IF;
  INSERT INTO persona_res VALUES ('PERSONA-06','Approver without Regulator-B scope','PASS',
    'Regulator B approval register empty and no cross-regulator leak');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-06','Approver without Regulator-B scope','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-07 — Super Admin: platform administration, no substantive approval
-- ===========================================================================
DO $$
DECLARE _sa uuid := (SELECT super_admin FROM persona_actor);
        _ref uuid := (SELECT reference_id FROM persona_ctx);
        _act uuid := (SELECT active_id FROM persona_ctx); _c jsonb; _cA jsonb;
BEGIN
  IF _sa IS NULL THEN
    INSERT INTO persona_res VALUES ('PERSONA-07','Super Admin','SKIP','no super administrator account exists');
    RETURN;
  END IF;
  PERFORM pg_temp.act_as(_sa);
  _c  := public.supervisory_methodology_action_capabilities(_ref);
  _cA := public.supervisory_methodology_action_capabilities(_act);
  PERFORM pg_temp.act_as_owner();
  IF NOT (_c->>'is_platform_administrator')::boolean THEN
    RAISE EXCEPTION 'super admin was not recognised as platform administration';
  END IF;
  IF (_c->'can_approve'->>'allowed')::boolean OR (_cA->'can_approve'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'platform administration was offered a substantive regulator approval';
  END IF;
  IF (_c->'can_activate'->>'allowed')::boolean OR (_cA->'can_activate'->>'allowed')::boolean THEN
    RAISE EXCEPTION 'platform administration was offered activation';
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-07','Super Admin','PASS',
    format('platform administrator; approval refused (%s), activation never offered',
      COALESCE(_c->'can_approve'->>'reason','no reason')));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-07','Super Admin','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-08 — enterprise oversight/audit reads, never writes
-- ===========================================================================
DO $$
DECLARE _ov uuid := (SELECT oversight FROM persona_actor);
        _ref uuid := (SELECT reference_id FROM persona_ctx); _reg jsonb; _c jsonb; _bad text;
BEGIN
  IF _ov IS NULL THEN
    INSERT INTO persona_res VALUES ('PERSONA-08','Enterprise oversight/audit','SKIP',
      'no enterprise oversight persona is provisioned');
    RETURN;
  END IF;
  PERFORM pg_temp.act_as(_ov);
  _reg := public.supervisory_methodology_register();
  _c   := public.supervisory_methodology_action_capabilities(_ref);
  PERFORM pg_temp.act_as_owner();
  SELECT string_agg(k, ', ') INTO _bad FROM (
    SELECT k FROM jsonb_each(_c) x(k,v)
     WHERE k IN ('can_edit','can_adopt','can_submit_review','can_return_to_draft','can_approve','can_activate')
       AND (v->>'allowed')::boolean) s;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'oversight persona was granted: %', _bad; END IF;
  INSERT INTO persona_res VALUES ('PERSONA-08','Enterprise oversight/audit','PASS',
    format('read-only across %s visible methodologies', _reg->>'total_count'));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-08','Enterprise oversight/audit','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-09 — no persona may write a methodology table directly
-- ===========================================================================
DO $$
DECLARE _u uuid; _ref uuid := (SELECT reference_id FROM persona_ctx); _blocked int := 0; _tried int := 0;
BEGIN
  FOR _u IN SELECT unnest(ARRAY[
      (SELECT viewer FROM persona_actor), (SELECT supervisor FROM persona_actor),
      (SELECT config_user FROM persona_actor), (SELECT approver FROM persona_actor)]) LOOP
    _tried := _tried + 1;
    PERFORM pg_temp.act_as(_u);
    BEGIN
      UPDATE public.supervisory_methodology SET status = 'ACTIVE' WHERE id = _ref;
      IF NOT FOUND THEN _blocked := _blocked + 1; END IF;
    EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN
      _blocked := _blocked + 1;
    END;
    PERFORM pg_temp.act_as_owner();
  END LOOP;
  IF _blocked <> _tried THEN
    RAISE EXCEPTION 'a persona wrote supervisory_methodology directly (%/% blocked)', _blocked, _tried;
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-09','Direct table write','PASS',
    format('%s/%s personas refused a direct lifecycle write', _blocked, _tried));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-09','Direct table write','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-10 — no persona may set a materiality parameter value
-- ===========================================================================
DO $$
DECLARE _u uuid; _p uuid; _blocked int := 0; _tried int := 0;
BEGIN
  SELECT p.id INTO _p FROM public.supervisory_methodology_parameter p
    JOIN public.supervisory_methodology m ON m.id = p.methodology_id
   WHERE m.domain_code = 'AML_CFT' ORDER BY p.parameter_code LIMIT 1;
  IF _p IS NULL THEN
    INSERT INTO persona_res VALUES ('PERSONA-10','Materiality value write','SKIP','no parameter defined');
    RETURN;
  END IF;
  FOR _u IN SELECT unnest(ARRAY[
      (SELECT config_user FROM persona_actor), (SELECT approver FROM persona_actor),
      COALESCE((SELECT super_admin FROM persona_actor), (SELECT viewer FROM persona_actor))]) LOOP
    _tried := _tried + 1;
    PERFORM pg_temp.act_as(_u);
    BEGIN
      UPDATE public.supervisory_methodology_parameter
         SET value_numeric = 1, approval_status = 'APPROVED' WHERE id = _p;
      IF NOT FOUND THEN _blocked := _blocked + 1; END IF;
    EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN
      _blocked := _blocked + 1;
    END;
    PERFORM pg_temp.act_as_owner();
  END LOOP;
  IF _blocked <> _tried THEN
    RAISE EXCEPTION 'a persona set a materiality policy value (%/% blocked)', _blocked, _tried;
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-10','Materiality value write','PASS',
    format('%s/%s personas refused a parameter value write', _blocked, _tried));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-10','Materiality value write','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-11 — activation is refused to every persona, by every route
-- ===========================================================================
DO $$
DECLARE _u uuid; _ref uuid := (SELECT reference_id FROM persona_ctx); _refused int := 0; _tried int := 0;
BEGIN
  FOR _u IN SELECT unnest(ARRAY[
      (SELECT config_user FROM persona_actor), (SELECT approver FROM persona_actor),
      COALESCE((SELECT super_admin FROM persona_actor), (SELECT viewer FROM persona_actor))]) LOOP
    _tried := _tried + 1;
    PERFORM pg_temp.act_as(_u);
    BEGIN
      PERFORM public.supervisory_methodology_lifecycle(_ref, 'ACTIVE',
        'PERSONA activation probe — must be refused.');
    EXCEPTION WHEN OTHERS THEN _refused := _refused + 1;
    END;
    PERFORM pg_temp.act_as_owner();
  END LOOP;
  IF _refused <> _tried THEN
    RAISE EXCEPTION 'activation succeeded for a persona (%/% refused)', _refused, _tried;
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-11','Activation refused','PASS',
    format('%s/%s activation attempts refused server-side', _refused, _tried));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.act_as_owner();
  INSERT INTO persona_res VALUES ('PERSONA-11','Activation refused','FAIL', SQLERRM);
END $$;

-- ===========================================================================
-- PERSONA-12 — the production population is unchanged apart from fixtures
-- ===========================================================================
DO $$
DECLARE b record; _valued bigint; _approvals bigint; _questions bigint;
BEGIN
  SELECT * INTO b FROM persona_baseline;
  -- Only the pre-existing (production) population is compared: the PERSONA-05
  -- maker/checker fixture legitimately creates a regulator draft inside this
  -- transaction, and the final ROLLBACK discards it.
  SELECT count(*) INTO _valued FROM public.supervisory_methodology_parameter p
    WHERE (p.value_numeric IS NOT NULL OR p.value_text IS NOT NULL)
      AND p.methodology_id IN (SELECT id FROM persona_pre_ids);
  SELECT count(*) INTO _approvals FROM public.supervisory_methodology_regulator_approval a
    WHERE a.methodology_id IN (SELECT id FROM persona_pre_ids);
  SELECT count(*) INTO _questions FROM public.supervisory_methodology_question q
    WHERE q.active AND q.methodology_id IN (SELECT id FROM persona_pre_ids);
  IF _valued <> b.valued_parameters THEN RAISE EXCEPTION 'parameter values changed'; END IF;
  IF _approvals <> b.approvals THEN RAISE EXCEPTION 'regulator approvals changed'; END IF;
  IF _questions <> b.questions THEN RAISE EXCEPTION 'question population changed'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment) <> b.assessments THEN
    RAISE EXCEPTION 'assessment population changed';
  END IF;
  INSERT INTO persona_res VALUES ('PERSONA-12','Zero business write','PASS',
    format('approvals %s, valued parameters %s, questions %s, assessments %s unchanged; fixtures roll back',
      _approvals, _valued, _questions, b.assessments));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO persona_res VALUES ('PERSONA-12','Zero business write','FAIL', SQLERRM);
END $$;

SELECT gate, status, persona, detail FROM persona_res ORDER BY gate;

ROLLBACK;
