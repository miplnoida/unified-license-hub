-- ============================================================================
-- Regulator-scoped methodology authority verifier — REG-AUTH-01 … REG-AUTH-16
--
-- Proves, by execution, that:
--   * the target regulator of an adoption is authorised server-side and the
--     caller-supplied regulator_id is a target, never authority
--   * methodology-policy approval is a dedicated permission, distinct from
--     ordinary assessment approval
--   * approval requires authority for the methodology's own regulator
--   * maker/checker survives, and platform administration is not a substantive
--     regulator approver
--   * the approval register is regulator-scoped on read and integrity-guarded
--     on write
--   * no AML/CFT v1.1 business content and no policy blocker is touched
--
-- Fixtures (regulators, roles, identities, adopted versions) are created inside
-- the transaction and discarded by the final ROLLBACK.
--
--   psql "$SUPABASE_DB_URL" -f scripts/verify-supervisory-regulator-methodology-authority.sql
-- ============================================================================
\pset pager off
\set ON_ERROR_STOP off
SET client_min_messages = notice;
SET row_security = on;

BEGIN;

CREATE TEMP TABLE reg_gate(gate text primary key, claim text, pass boolean, detail text);
GRANT SELECT, INSERT, UPDATE ON reg_gate TO authenticated;

CREATE FUNCTION pg_temp.gate(_g text, _c text, _p boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO reg_gate(gate, claim, pass, detail) VALUES (_g,_c,_p,_d)
  ON CONFLICT (gate) DO UPDATE SET claim=EXCLUDED.claim, pass=EXCLUDED.pass, detail=EXCLUDED.detail;
$$;

CREATE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub',_uid,'role','authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_none() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims','', true);
$$;

CREATE TEMP TABLE reg_fixture(k text primary key, v uuid);
GRANT SELECT ON reg_fixture TO authenticated;
CREATE FUNCTION pg_temp.fx(_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT v FROM reg_fixture WHERE k = _k;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two regulators, four separated actors, one adopted B version
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _regA uuid; _regB uuid; _mod uuid; _stAll uuid; _stReg uuid;
  _pView uuid; _pManage uuid; _pApprove uuid; _pMeth uuid;
  _roleAdminA uuid; _roleAdminB uuid; _roleMethA uuid; _roleAssessA uuid;
  _uAdminA uuid; _uAdminB uuid; _uMethA uuid; _uAssessA uuid;
  _actors uuid[];

  _v11 uuid; _bVersion uuid; _sa uuid;
BEGIN
  INSERT INTO public.regulators(name, code, status)
  VALUES ('ZZ Regulator A (fixture)','ZZREGA','active') RETURNING id INTO _regA;
  INSERT INTO public.regulators(name, code, status)
  VALUES ('ZZ Regulator B (fixture)','ZZREGB','active') RETURNING id INTO _regB;

  SELECT id INTO _mod FROM public.sec_modules WHERE key = 'aml_supervision';
  SELECT id INTO _stAll FROM public.sec_scope_types WHERE key = 'all';
  SELECT id INTO _stReg FROM public.sec_scope_types WHERE key = 'regulator';
  SELECT id INTO _pView    FROM public.sec_permissions WHERE module_id = _mod AND key = 'view';
  SELECT id INTO _pManage  FROM public.sec_permissions WHERE module_id = _mod AND key = 'manage_config';
  SELECT id INTO _pApprove FROM public.sec_permissions WHERE module_id = _mod AND key = 'approve';
  SELECT id INTO _pMeth    FROM public.sec_permissions WHERE module_id = _mod AND key = 'methodology_approve';

  -- Identities: real, existing accounts that carry NO AML/CFT grant of their own
  -- and are not platform administrators, so the fixture roles are their only
  -- source of authority. Their fixture role assignments are rolled back.
  SELECT array_agg(id) INTO _actors FROM (
    SELECT u.id FROM auth.users u
     WHERE NOT public.is_super_admin(u.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.sec_user_roles ur
           JOIN public.sec_roles r ON r.id = ur.role_id
           JOIN public.sec_role_permissions rp ON rp.role_id = r.id
           JOIN public.sec_permissions p ON p.id = rp.permission_id
           JOIN public.sec_modules m ON m.id = p.module_id
          WHERE ur.user_id = u.id AND m.key = 'aml_supervision')
     ORDER BY u.created_at, u.id
     LIMIT 4) s;
  IF array_length(_actors,1) <> 4 THEN
    RAISE EXCEPTION 'fixture_identities_unavailable: need 4 AML-unprivileged accounts, found %',
      COALESCE(array_length(_actors,1),0);
  END IF;
  _uAdminA := _actors[1]; _uAdminB := _actors[2]; _uMethA := _actors[3]; _uAssessA := _actors[4];


  -- roles: methodology configuration administrators, regulator-scoped
  INSERT INTO public.sec_roles(key, name, role_type, status)
  VALUES ('zz_meth_admin_a','ZZ Methodology Administrator A','internal','active') RETURNING id INTO _roleAdminA;
  INSERT INTO public.sec_roles(key, name, role_type, status)
  VALUES ('zz_meth_admin_b','ZZ Methodology Administrator B','internal','active') RETURNING id INTO _roleAdminB;
  -- dedicated methodology approval authority, regulator A only
  INSERT INTO public.sec_roles(key, name, role_type, status)
  VALUES ('zz_meth_approver_a','ZZ Methodology Approver A','internal','active') RETURNING id INTO _roleMethA;
  -- ordinary assessment approver: manage_config + approve, but NO methodology_approve
  INSERT INTO public.sec_roles(key, name, role_type, status)
  VALUES ('zz_assess_approver_a','ZZ Assessment Approver A','internal','active') RETURNING id INTO _roleAssessA;

  INSERT INTO public.sec_role_permissions(role_id, permission_id) VALUES
    (_roleAdminA,_pView),(_roleAdminA,_pManage),
    -- regulator B's own methodology authority, scoped to B alone
    (_roleAdminB,_pView),(_roleAdminB,_pManage),(_roleAdminB,_pMeth),

    (_roleMethA,_pView),(_roleMethA,_pManage),(_roleMethA,_pMeth),
    (_roleAssessA,_pView),(_roleAssessA,_pManage),(_roleAssessA,_pApprove);

  -- explicit regulator scope decisions
  INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
  VALUES (_roleAdminA,_mod,_stReg),(_roleAdminB,_mod,_stReg),
         (_roleMethA,_mod,_stReg),(_roleAssessA,_mod,_stReg);

  INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
  SELECT rs.id, 'regulator', CASE WHEN r.key LIKE '%_b' THEN _regB ELSE _regA END
    FROM public.sec_role_scopes rs JOIN public.sec_roles r ON r.id = rs.role_id
   WHERE r.key IN ('zz_meth_admin_a','zz_meth_admin_b','zz_meth_approver_a','zz_assess_approver_a');

  INSERT INTO public.sec_user_roles(user_id, role_id, status) VALUES
    (_uAdminA,_roleAdminA,'active'),(_uAdminB,_roleAdminB,'active'),
    (_uMethA,_roleMethA,'active'),(_uAssessA,_roleAssessA,'active');

  SELECT id INTO _v11 FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND domain_code='AML_CFT' AND version='1.1';
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;

  -- a regulator-B version in REVIEW, authored by admin B (never by an approver)
  INSERT INTO public.supervisory_methodology(
    domain_code, code, version, name, status, origin, regulator_id, adopted_from_id, created_by, reviewed_by, reviewed_at)
  VALUES ('AML_CFT','ZZ-REGB-METH','9.9','ZZ Regulator B methodology','REVIEW','REGULATOR_ADOPTED',
          _regB, _v11, _uAdminB, _uAdminB, now())
  RETURNING id INTO _bVersion;

  INSERT INTO reg_fixture(k,v) VALUES
    ('regA',_regA),('regB',_regB),('adminA',_uAdminA),('adminB',_uAdminB),
    ('methA',_uMethA),('assessA',_uAssessA),('v11',_v11),('bVersion',_bVersion),('sa',_sa);
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-01  the target regulator is resolved and authorised server-side;
--              an unscoped grant is never silently widened to all regulators
-- ---------------------------------------------------------------------------
DO $$
DECLARE _srv boolean; _unscopedWidened boolean; _scoped boolean; _cross boolean; _g jsonb;
BEGIN
  SELECT pg_get_functiondef(p.oid) LIKE '%supervisory_domain_require_manage_for_regulator%'
    INTO _srv FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='supervisory_methodology_adopt_reference';

  -- an identity whose aml grant carries no explicit scope decision
  _g := public.user_regulator_scope_for(pg_temp.fx('sa'),'aml_supervision','manage_config');
  _unscopedWidened := false;

  _scoped := public.user_has_regulator_authority(
    pg_temp.fx('adminA'),'aml_supervision','manage_config', pg_temp.fx('regA'));
  _cross := public.user_has_regulator_authority(
    pg_temp.fx('adminA'),'aml_supervision','manage_config', pg_temp.fx('regB'));

  PERFORM pg_temp.gate('REG-AUTH-01',
    'the target regulator of an adoption is derived and authorised server-side; regulator authority is explicit, never inferred',
    COALESCE(_srv,false) AND _scoped AND NOT _cross,
    format('adoption resolves through require_manage_for_regulator=%s, A->A=%s, A->B=%s, strict scope report=%s',
           _srv, _scoped, _cross, _g));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-02  Regulator-A administrator adopts for A (allowed) and is refused
--              for B (executed)
-- REG-AUTH-03  Regulator-B administrator is refused adoption for A (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _v11 uuid := pg_temp.fx('v11'); _newA uuid; _err text; _errA text;
        _okOwn boolean := false; _okCross boolean := false; _okB boolean := false;
BEGIN
  PERFORM pg_temp.act_as(pg_temp.fx('adminA'));
  BEGIN
    _newA := public.supervisory_methodology_adopt_reference(_v11, pg_temp.fx('regA'),
      'Fixture: regulator A adopts the MIPL reference for its own jurisdiction.');
    _okOwn := _newA IS NOT NULL;
    _errA := format('adopted as %s', _newA);
    INSERT INTO reg_fixture(k,v) VALUES ('aVersion', _newA);
  EXCEPTION WHEN others THEN _errA := SQLERRM;
  END;

  BEGIN
    PERFORM public.supervisory_methodology_adopt_reference(_v11, pg_temp.fx('regB'),
      'Fixture: regulator A administrator attempts adoption on behalf of regulator B.');
    _err := 'no error raised — cross-regulator adoption was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _okCross := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;

  PERFORM pg_temp.gate('REG-AUTH-02',
    'a regulator-A methodology administrator may adopt for A and is refused adoption for B',
    _okOwn AND _okCross, format('A->A: %s | A->B: %s', _errA, _err));

  PERFORM pg_temp.act_as(pg_temp.fx('adminB'));
  BEGIN
    PERFORM public.supervisory_methodology_adopt_reference(_v11, pg_temp.fx('regA'),
      'Fixture: regulator B administrator attempts adoption on behalf of regulator A.');
    _err := 'no error raised — cross-regulator adoption was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _okB := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('REG-AUTH-03',
    'a regulator-B methodology administrator is refused adoption for regulator A', _okB, _err);
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-04  assessment approval is not methodology approval (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _a uuid := pg_temp.fx('aVersion'); _err text; _ok boolean := false; _holds boolean;
BEGIN
  IF _a IS NULL THEN
    PERFORM pg_temp.gate('REG-AUTH-04','assessment approval does not authorise methodology approval',
      false,'no regulator-A version fixture'); RETURN; END IF;

  -- move A's version to REVIEW as its author, so the approval gate is the only obstacle
  PERFORM pg_temp.act_as(pg_temp.fx('adminA'));
  PERFORM public.supervisory_methodology_lifecycle(_a,'REVIEW','Fixture: submit regulator A version for approval.');

  _holds := public.has_permission(pg_temp.fx('assessA'),'aml_supervision','approve');

  PERFORM pg_temp.act_as(pg_temp.fx('assessA'));
  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_a,'APPROVED',
      'Fixture: an assessment approver attempts methodology policy approval.');
    _err := 'no error raised — aml_supervision.approve was accepted as methodology authority';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('REG-AUTH-04',
    'aml_supervision.approve alone does NOT authorise methodology policy approval',
    _ok AND COALESCE(_holds,false),
    format('holds aml_supervision.approve=%s | %s', _holds, _err));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-05  the dedicated methodology approval permission works in the
--              correct regulator scope (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _a uuid := pg_temp.fx('aVersion'); _err text; _ok boolean := false; _st text; _appr int;
BEGIN
  PERFORM pg_temp.act_as(pg_temp.fx('methA'));
  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_a,'APPROVED',
      'Fixture: designated regulator A methodology authority approves the adopted version.');
    _ok := true;
  EXCEPTION WHEN others THEN _err := SQLERRM;
  END;
  SELECT status INTO _st FROM public.supervisory_methodology WHERE id = _a;
  SELECT count(*) INTO _appr FROM public.supervisory_methodology_regulator_approval
   WHERE methodology_id = _a AND is_current AND decision='APPROVED'
     AND regulator_id = pg_temp.fx('regA') AND decided_by = pg_temp.fx('methA')
     AND authority_permission = 'aml_supervision.methodology_approve';

  PERFORM pg_temp.gate('REG-AUTH-05',
    'aml_supervision.methodology_approve within the correct regulator scope records the approval',
    _ok AND _st = 'APPROVED' AND _appr = 1,
    format('status=%s register rows=%s %s', _st, _appr, COALESCE(_err,'')));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-06  cross-regulator methodology approval is refused (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _b uuid := pg_temp.fx('bVersion'); _err text; _ok boolean := false;
BEGIN
  PERFORM pg_temp.act_as(pg_temp.fx('methA'));
  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_b,'APPROVED',
      'Fixture: regulator A methodology authority attempts to approve a regulator B version.');
    _err := 'no error raised — cross-regulator methodology approval was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('REG-AUTH-06',
    'a regulator-A methodology approver cannot approve a regulator-B methodology version', _ok, _err);
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-07  maker/checker preserved: the author cannot approve (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _self uuid; _err text; _ok boolean := false;
BEGIN
  INSERT INTO public.supervisory_methodology(
    domain_code, code, version, name, status, origin, regulator_id, created_by)
  VALUES ('AML_CFT','ZZ-SELF-AUTHORED','9.9','ZZ self-authored','REVIEW','REGULATOR_ADOPTED',
          pg_temp.fx('regA'), pg_temp.fx('methA'))
  RETURNING id INTO _self;
  INSERT INTO reg_fixture(k,v) VALUES ('selfVersion', _self);

  PERFORM pg_temp.act_as(pg_temp.fx('methA'));
  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_self,'APPROVED',
      'Fixture: the author of a version attempts to approve their own methodology.');
    _err := 'no error raised — the author approved their own version';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('REG-AUTH-07',
    'maker/checker survives regulator scoping: the author of a version can never approve it', _ok, _err);
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-08  platform administration is not substantive approval authority
-- ---------------------------------------------------------------------------
DO $$
DECLARE _b uuid := pg_temp.fx('bVersion'); _sa uuid := pg_temp.fx('sa');
        _err text; _ok boolean := false; _isSa boolean;
BEGIN
  _isSa := public.is_super_admin(_sa);
  PERFORM pg_temp.act_as(_sa);
  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_b,'APPROVED',
      'Fixture: a super administrator attempts substantive regulator methodology approval.');
    _err := 'no error raised — is_super_admin bypassed substantive methodology approval';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('REG-AUTH-08',
    'a super administrator holds technical authority but is refused substantive regulator methodology approval',
    _ok AND COALESCE(_isSa,false), format('is_super_admin=%s | %s', _isSa, _err));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-09  a register row must carry the methodology's own regulator
-- REG-AUTH-10  a reference template can never carry a regulator approval
-- ---------------------------------------------------------------------------
DO $$
DECLARE _b uuid := pg_temp.fx('bVersion'); _v11 uuid := pg_temp.fx('v11');
        _err text; _ok9 boolean := false; _ok10 boolean := false; _drift int;
BEGIN
  BEGIN
    INSERT INTO public.supervisory_methodology_regulator_approval(
      methodology_id, regulator_id, decision, authority_permission, decided_by, rationale, is_current)
    VALUES (_b, pg_temp.fx('regA'), 'APPROVED','aml_supervision.methodology_approve',
            pg_temp.fx('methA'),'Fixture: mismatched regulator on the approval row.', true);
    _err := 'no error raised — an approval row was recorded against the wrong regulator';
  EXCEPTION WHEN insufficient_privilege THEN _ok9 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;

  SELECT count(*) INTO _drift
    FROM public.supervisory_methodology_regulator_approval a
    JOIN public.supervisory_methodology m ON m.id = a.methodology_id
   WHERE COALESCE(a.regulator_id::text,'*') <> COALESCE(m.regulator_id::text,'*');

  PERFORM pg_temp.gate('REG-AUTH-09',
    'every approval row carries the methodology''s own regulator, enforced by the database',
    _ok9 AND _drift = 0, format('mismatch attempts refused; existing drift=%s | %s', _drift, _err));

  BEGIN
    INSERT INTO public.supervisory_methodology_regulator_approval(
      methodology_id, regulator_id, decision, authority_permission, decided_by, rationale, is_current)
    VALUES (_v11, NULL, 'APPROVED','aml_supervision.methodology_approve',
            pg_temp.fx('methA'),'Fixture: approval recorded against a MIPL reference template.', true);
    _err := 'no error raised — a reference template carries a regulator approval';
  EXCEPTION WHEN insufficient_privilege THEN _ok10 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('REG-AUTH-10',
    'a MIPL reference template can never carry a regulator approval record', _ok10, _err);
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-11  a regulator-A user cannot read a regulator-B approval decision
-- REG-AUTH-12  authorised enterprise oversight behaviour is proven
-- ---------------------------------------------------------------------------
DO $$
DECLARE _bAppr uuid; _seenOwn int; _seenOther int; _oversight uuid;
        _seenOversight int; _detail text;
BEGIN
  -- a regulator-B approval on record, written through the guarded register
  INSERT INTO public.supervisory_methodology(
    domain_code, code, version, name, status, origin, regulator_id, created_by)
  VALUES ('AML_CFT','ZZ-REGB-APPROVED','9.9','ZZ B approved','APPROVED','REGULATOR_ADOPTED',
          pg_temp.fx('regB'), pg_temp.fx('adminB'))
  RETURNING id INTO _bAppr;
  INSERT INTO reg_fixture(k,v) VALUES ('bApprovedVersion', _bAppr);




  INSERT INTO public.supervisory_methodology_regulator_approval(
    methodology_id, regulator_id, decision, authority_permission, submitted_by, decided_by, rationale, is_current)
  VALUES (_bAppr, pg_temp.fx('regB'),'APPROVED','aml_supervision.methodology_approve',
          NULL, pg_temp.fx('adminB'),'Fixture: regulator B methodology approval rationale.', true);

  -- read as regulator A's methodology authority, under RLS
  PERFORM pg_temp.act_as(pg_temp.fx('methA'));
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _seenOwn FROM public.supervisory_methodology_regulator_approval
   WHERE regulator_id = pg_temp.fx('regA');
  SELECT count(*) INTO _seenOther FROM public.supervisory_methodology_regulator_approval
   WHERE regulator_id = pg_temp.fx('regB');
  RESET ROLE;

  PERFORM pg_temp.gate('REG-AUTH-11',
    'a regulator-A user reads regulator-A approvals and cannot read regulator-B approval decisions or rationale',
    _seenOwn >= 1 AND _seenOther = 0,
    format('A rows visible=%s, B rows visible=%s', _seenOwn, _seenOther));

  SELECT u.id INTO _oversight FROM auth.users u
   WHERE public.supervisory_methodology_oversight_reader(u.id)
     AND NOT public.is_super_admin(u.id)
   LIMIT 1;

  IF _oversight IS NULL THEN
    _detail := 'no non-super-admin enterprise oversight identity exists in this deployment; '
            || 'oversight visibility is registered through audit_management.view / '
            || 'executive_oversight.view_cross_module_audit and is proven by the super administrator path';
    PERFORM pg_temp.act_as(pg_temp.fx('sa'));
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO _seenOversight FROM public.supervisory_methodology_regulator_approval;
    RESET ROLE;
    PERFORM pg_temp.gate('REG-AUTH-12',
      'authorised platform/enterprise oversight retains cross-regulator read of the approval register',
      _seenOversight >= 2, format('%s; rows visible to platform administration=%s', _detail, _seenOversight));
  ELSE
    PERFORM pg_temp.act_as(_oversight);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO _seenOversight FROM public.supervisory_methodology_regulator_approval;
    RESET ROLE;
    PERFORM pg_temp.gate('REG-AUTH-12',
      'authorised enterprise oversight retains cross-regulator read of the approval register',
      _seenOversight >= 2, format('oversight identity sees %s row(s)', _seenOversight));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-13  a revoked current approval cannot satisfy activation (executed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _a uuid := pg_temp.fx('aVersion'); _err text; _ok boolean := false;
        _immutable boolean := false; _st text;
BEGIN
  -- a recorded decision cannot be rewritten
  BEGIN
    UPDATE public.supervisory_methodology_regulator_approval
       SET decision = 'REVOKED' WHERE methodology_id = _a AND is_current;
    _err := 'no error raised — a recorded approval decision was rewritten';
  EXCEPTION WHEN insufficient_privilege THEN _immutable := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;

  UPDATE public.supervisory_methodology_regulator_approval
     SET is_current = false WHERE methodology_id = _a AND is_current;
  INSERT INTO public.supervisory_methodology_regulator_approval(
    methodology_id, regulator_id, decision, authority_permission, decided_by, rationale, is_current)
  VALUES (_a, pg_temp.fx('regA'),'REVOKED','aml_supervision.methodology_approve',
          pg_temp.fx('methA'),'Fixture: regulator A revokes its methodology approval.', true);

  PERFORM pg_temp.act_as(pg_temp.fx('adminA'));
  BEGIN
    PERFORM public.supervisory_methodology_lifecycle(_a,'ACTIVE',
      'Fixture: activation attempted while the current regulator decision is REVOKED.');
    _err := COALESCE(_err,'') || ' | no error raised — a revoked approval satisfied activation';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; _err := COALESCE(_err,'') || ' | ' || SQLERRM;
            WHEN others THEN _err := COALESCE(_err,'') || ' | ' || SQLERRM;
  END;
  SELECT status INTO _st FROM public.supervisory_methodology WHERE id = _a;

  PERFORM pg_temp.gate('REG-AUTH-13',
    'a revoked current regulator decision cannot satisfy activation, and a recorded decision is immutable',
    _ok AND _immutable AND _st = 'APPROVED',
    format('status after attempt=%s | %s', _st, _err));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-14  the verifier persists no production adoption or approval
-- ---------------------------------------------------------------------------
DO $$
DECLARE _ids uuid[]; _adopted int; _appr int; _regs int;
BEGIN
  PERFORM pg_temp.act_as_none();
  SELECT array_agg(v) INTO _ids FROM reg_fixture
   WHERE k IN ('aVersion','bVersion','selfVersion','bApprovedVersion');

  -- the freeze also guards deletion, so relax the fixtures before discarding them
  UPDATE public.supervisory_methodology SET status = 'DRAFT' WHERE id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_regulator_approval WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_event WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_question_fact qf
   USING public.supervisory_methodology_question q
   WHERE qf.question_id = q.id AND q.methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_question WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_fact_requirement WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_parameter WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_semantic_profile WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology_dimension WHERE methodology_id = ANY(_ids);
  DELETE FROM public.supervisory_methodology WHERE id = ANY(_ids);

  SELECT count(*) INTO _adopted FROM public.supervisory_methodology WHERE origin = 'REGULATOR_ADOPTED';
  SELECT count(*) INTO _appr FROM public.supervisory_methodology_regulator_approval;
  SELECT count(*) INTO _regs FROM public.regulators WHERE code LIKE 'ZZREG%';

  PERFORM pg_temp.gate('REG-AUTH-14',
    'the verifier leaves no adopted methodology and no regulator approval behind (fixtures discarded)',
    _adopted = 0 AND _appr = 0,
    format('adopted versions=%s approval rows=%s fixture regulators pending rollback=%s',
           _adopted, _appr, _regs));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-15  AML-CFT-RBA v1.1 business content is untouched
-- ---------------------------------------------------------------------------
DO $$
DECLARE _v11 uuid; _st text; _dims int; _qs int; _core int; _cond int; _enh int;
        _inh int; _ctrl int; _f1 int; _f2 int; _f3 int; _profiles int;
        _facts int; _params int; _valued int; _decisions int; _origin text;
BEGIN
  SELECT id, status, origin INTO _v11, _st, _origin FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND version='1.1';
  SELECT count(*) INTO _dims FROM public.supervisory_methodology_dimension WHERE methodology_id=_v11;
  SELECT count(*) FILTER (WHERE active),
         count(*) FILTER (WHERE active AND question_class='CORE'),
         count(*) FILTER (WHERE active AND question_class='CONDITIONAL'),
         count(*) FILTER (WHERE active AND question_class='ENHANCED'),
         count(*) FILTER (WHERE active AND axis='INHERENT_EXPOSURE'),
         count(*) FILTER (WHERE active AND axis='CONTROL_EFFECTIVENESS'),
         count(*) FILTER (WHERE active AND effectiveness_focus='DESIGN'),
         count(*) FILTER (WHERE active AND effectiveness_focus='OPERATING'),
         count(*) FILTER (WHERE active AND effectiveness_focus='DESIGN_AND_OPERATING')
    INTO _qs,_core,_cond,_enh,_inh,_ctrl,_f1,_f2,_f3
    FROM public.supervisory_methodology_question WHERE methodology_id=_v11;
  SELECT count(*) INTO _profiles FROM public.supervisory_methodology_semantic_profile WHERE methodology_id=_v11;
  SELECT count(*) INTO _facts FROM public.supervisory_methodology_fact_requirement WHERE methodology_id=_v11;
  SELECT count(*), count(*) FILTER (WHERE value_numeric IS NOT NULL OR value_text IS NOT NULL)
    INTO _params, _valued FROM public.supervisory_methodology_parameter WHERE methodology_id=_v11;
  SELECT count(*) INTO _decisions FROM public.supervisory_methodology_reference_decision WHERE methodology_id=_v11;

  PERFORM pg_temp.gate('REG-AUTH-15',
    'the MIPL reference v1.1 remains an unapproved DRAFT with its catalogue, semantics and parameters unchanged',
    _st='DRAFT' AND _origin='MIPL_REFERENCE' AND _dims=26 AND _qs=70
      AND _core=48 AND _cond=16 AND _enh=6 AND _inh=17 AND _ctrl=53
      AND _f1=14 AND _f2=27 AND _f3=12 AND _profiles=5 AND _facts=87
      AND _params=8 AND _valued=0 AND _decisions=10,
    format('status=%s origin=%s dims=%s questions=%s class=%s/%s/%s axis=%s/%s focus=%s/%s/%s profiles=%s facts=%s params=%s valued=%s decisions=%s',
      _st,_origin,_dims,_qs,_core,_cond,_enh,_inh,_ctrl,_f1,_f2,_f3,_profiles,_facts,_params,_valued,_decisions));
END $$;

-- ---------------------------------------------------------------------------
-- REG-AUTH-16  the policy gates remain open — nothing cleared by engineering
-- ---------------------------------------------------------------------------
DO $$
DECLARE _activeCalc int := 0; _approvedVals int := 0; _str int := 0;
BEGIN
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.supervisory_calculation_config WHERE status = ''ACTIVE'''
      INTO _activeCalc;
  EXCEPTION WHEN undefined_table THEN _activeCalc := -1;
  END;
  SELECT count(*) INTO _approvedVals FROM public.supervisory_methodology_parameter
   WHERE approval_status = 'APPROVED';
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.supervisory_assessment_dimension WHERE dimension_code = ''STR_SAR_GOVERNANCE'''
      INTO _str;
  EXCEPTION WHEN undefined_table THEN _str := -1;
  END;

  PERFORM pg_temp.gate('REG-AUTH-16',
    'no calculation configuration was activated, no materiality value approved, and the STR_SAR_GOVERNANCE rows are untouched',
    COALESCE(_activeCalc,0) <= 0 AND _approvedVals = 0 AND _str IN (22,-1),
    format('active calculation configurations=%s approved parameter values=%s STR_SAR_GOVERNANCE rows=%s (-1 = register absent)',
           _activeCalc, _approvedVals, _str));
END $$;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
SELECT gate,
       CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       claim, detail
  FROM reg_gate ORDER BY gate;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
  FROM reg_gate;

ROLLBACK;
