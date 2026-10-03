-- =====================================================================
-- AML-CLOSE-02B — final closure gates (negative cases, parity, fingerprint)
-- =====================================================================
-- Classification: TRANSACTIONAL, ALWAYS ROLLED BACK. One DO block that ends
-- by RAISING, so every fixture, lifecycle transition and binding is undone.
-- Governed commands are exercised as real personas (request.jwt.claims +
-- SET LOCAL ROLE authenticated). No assessment row is inserted.
-- SUP-AML_CFT-2026-00838 is only READ (authority, integrity, refused writes).
-- SUP-AML_CFT-2026-00830 is never touched.
-- Result: final exception "CLOSE02B_RESULT pass=N fail=M ..."
-- =====================================================================
DO $close02b$
DECLARE
  _maker uuid := 'b8eaf680-fe66-4d49-b816-1c087f511235';   -- aml_supervision_officer
  _chk   uuid := '0b522724-adcb-48bf-b21d-175339479616';   -- aml_supervision_supervisor
  _reg   uuid := '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';   -- FSRA
  _a838  uuid := '66cc17e3-f944-4b93-be22-8857565a1213';   -- SUP-AML_CFT-2026-00838 (read only)
  _a_cu  uuid := '093b4f2b-5017-49fc-aa9f-026f21d15a0f';   -- draft TEST, CREDIT_UNIONS, no snapshot
  _a_msb uuid := '219e68df-f799-4cc6-9004-f07a94a8621c';   -- draft TEST, MSB, no snapshot
  _a_ib  uuid := '74b24d46-bbc4-41ab-8b1d-df91f8e1c496';   -- draft TEST 00131, no snapshot
  _a_drf uuid := '3709eb06-31d1-4efd-be6c-fad3dbf73111';   -- draft TEST 00735, no snapshot
  _a_x1  uuid := '5934f1c5-59bd-444c-929d-209212c79292';   -- 00353 (non-draft; read-path checks only)
  _a_x2  uuid := 'b5436967-82e9-42d4-aa5a-b349c1e899d7';   -- 00354 (non-draft; read-path checks only)
  _a_x3  uuid := 'b3905c17-b8ab-4709-8531-a4356c60fe7a';   -- 00738 (non-draft; read-path checks only)
  _a_ng  uuid := '054b536a-2219-405a-bcc0-a8be1a3d1ebd';   -- real FSRA snapshot (template only)
  _pkg_src uuid := 'd7427fe1-7f13-42d2-816c-0c187798224e'; -- retired TEST package v2 (template only)
  _meth uuid; _base jsonb; _prof public.supervisory_assessment_policy_snapshot;
  _pkg uuid; _ov_sub uuid; _ov_ret uuid; _ov_fut uuid; _ov_exp uuid; _ov_ok uuid; _fc uuid;
  _sb_draft uuid; _sb_ret uuid; _sb_sub uuid; _fp_c uuid;
  _r jsonb; _fp1 text; _fp2 text; _lh1 text; _lh2 text; _n0 int; _n1 int;
  _pass int := 0; _fail int := 0; _log text := ''; _f record; _ok boolean;
BEGIN
  SELECT methodology_id INTO _meth FROM public.supervisory_assessment WHERE id = _a_cu;
  SELECT * INTO _prof FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _a_ng;
  _base := _prof.components;

  INSERT INTO public.supervisory_methodology_fact_requirement(methodology_id, fact_code, label, data_type, is_required, definition_status)
  SELECT DISTINCT methodology_id,'CLOSE02B_STR_COUNT','CLOSE02B STR count','numeric',false,'ATTRIBUTES_PENDING'
    FROM public.supervisory_assessment WHERE id = ANY(ARRAY[_a_cu,_a_msb,_a_ib,_a_drf,_a_x1,_a_x2,_a_x3]) AND methodology_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- Draft TEST package fixture (copied from the retired TEST package, new version, DRAFT)
  INSERT INTO public.supervisory_policy_profile
  SELECT (jsonb_populate_record(NULL::public.supervisory_policy_profile, to_jsonb(p)
          || jsonb_build_object('id', gen_random_uuid(), 'profile_version','02B-fixture','status','DRAFT',
                                'approved_by',NULL,'approved_at',NULL,'activated_at',NULL,'retired_at',NULL,
                                'created_by', _maker))).*
    FROM public.supervisory_policy_profile p WHERE p.id = _pkg_src
  RETURNING id INTO _pkg;

  -- Effective-dated / retired fixtures that represent states reached earlier in time
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at, retired_at)
  VALUES ('SECTOR_OVERLAY','CLOSE02B-OV-RET','1','AML_CFT',_reg,'CLOSE02B retired overlay','RETIRED',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"},{"sector_code":"MONEY_SERVICES_BUSINESS","applicability":"APPLICABLE"},{"sector_code":"INTERNATIONAL_BANKING","applicability":"APPLICABLE"},{"sector_code":"VIRTUAL_ASSET_BUSINESS","applicability":"APPLICABLE"}]}','2026-01-01',now(),_chk,now(),now())
  RETURNING id INTO _ov_ret;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('SECTOR_OVERLAY','CLOSE02B-OV-FUT','1','AML_CFT',_reg,'CLOSE02B not-yet-effective overlay','ACTIVE',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"},{"sector_code":"MONEY_SERVICES_BUSINESS","applicability":"APPLICABLE"},{"sector_code":"INTERNATIONAL_BANKING","applicability":"APPLICABLE"},{"sector_code":"VIRTUAL_ASSET_BUSINESS","applicability":"APPLICABLE"}]}','2099-01-01',now(),_chk,now())
  RETURNING id INTO _ov_fut;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, effective_to, approved_at, approved_by, activated_at)
  VALUES ('SECTOR_OVERLAY','CLOSE02B-OV-EXP','1','AML_CFT',_reg,'CLOSE02B expired overlay','ACTIVE',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"},{"sector_code":"MONEY_SERVICES_BUSINESS","applicability":"APPLICABLE"},{"sector_code":"INTERNATIONAL_BANKING","applicability":"APPLICABLE"},{"sector_code":"VIRTUAL_ASSET_BUSINESS","applicability":"APPLICABLE"}]}','2020-01-01','2020-12-31',now(),_chk,now())
  RETURNING id INTO _ov_exp;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('SECTOR_OVERLAY','CLOSE02B-OV-OK','1','AML_CFT',_reg,'CLOSE02B active overlay','ACTIVE',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"},{"sector_code":"MONEY_SERVICES_BUSINESS","applicability":"APPLICABLE"},{"sector_code":"INTERNATIONAL_BANKING","applicability":"APPLICABLE"},{"sector_code":"VIRTUAL_ASSET_BUSINESS","applicability":"APPLICABLE"}]}','2026-01-01',now(),_chk,now())
  RETURNING id INTO _ov_ok;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('FACT_CONFIG','CLOSE02B-FC','1','AML_CFT',_reg,'CLOSE02B facts','ACTIVE',
          '{"facts":[{"fact_code":"CLOSE02B_STR_COUNT","data_type":"NUMBER","is_required":true}]}','2026-01-01',now(),_chk,now())
  RETURNING id INTO _fc;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at, retired_at)
  VALUES ('SOURCE_BINDING','CLOSE02B-SB-RET','1','AML_CFT',_reg,'CLOSE02B retired sources','RETIRED',
          '{"bindings":[{"fact_code":"CLOSE02B_STR_COUNT","source_kind":"RETURN","source_reference":"R"}]}','2026-01-01',now(),_chk,now(),now())
  RETURNING id INTO _sb_ret;

  -- ================= governed personas: maker
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- B setup: overlay created and SUBMITTED through the normal state machine (not approved)
  _r := public.supervisory_policy_component_create(jsonb_build_object('component_type','SECTOR_OVERLAY','domain_code','AML_CFT',
          'regulator_id',_reg,'code','CLOSE02B-OV-SUB','component_version','1','name','CLOSE02B submitted overlay',
          'content', '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"},{"sector_code":"MONEY_SERVICES_BUSINESS","applicability":"APPLICABLE"},{"sector_code":"INTERNATIONAL_BANKING","applicability":"APPLICABLE"},{"sector_code":"VIRTUAL_ASSET_BUSINESS","applicability":"APPLICABLE"}]}'::jsonb));
  _ov_sub := COALESCE(NULLIF(_r->>'id',''), NULLIF(_r->>'component_id',''))::uuid;
  PERFORM public.supervisory_policy_component_lifecycle(_ov_sub, 'SUBMITTED', 'CLOSE02B negative-case fixture submission');
  -- D setup: draft and submitted source settings through the governed commands
  _r := public.supervisory_policy_component_create(jsonb_build_object('component_type','SOURCE_BINDING','domain_code','AML_CFT',
          'regulator_id',_reg,'code','CLOSE02B-SB-DRAFT','component_version','1','name','CLOSE02B draft sources',
          'content', '{"bindings":[{"fact_code":"CLOSE02B_STR_COUNT","source_kind":"EXTERNAL","source_reference":"X"}]}'::jsonb));
  _sb_draft := COALESCE(NULLIF(_r->>'id',''), NULLIF(_r->>'component_id',''))::uuid;
  _r := public.supervisory_policy_component_create(jsonb_build_object('component_type','SOURCE_BINDING','domain_code','AML_CFT',
          'regulator_id',_reg,'code','CLOSE02B-SB-SUB','component_version','1','name','CLOSE02B submitted sources',
          'content', '{"bindings":[{"fact_code":"CLOSE02B_STR_COUNT","source_kind":"EXTERNAL","source_reference":"X"}]}'::jsonb));
  _sb_sub := COALESCE(NULLIF(_r->>'id',''), NULLIF(_r->>'component_id',''))::uuid;
  PERFORM public.supervisory_policy_component_lifecycle(_sb_sub, 'SUBMITTED', 'CLOSE02B negative-case fixture submission');

  -- N01..N05 binding refusals into the draft package (component_not_approved)
  SELECT count(*) INTO _n0 FROM public.supervisory_policy_profile_binding WHERE profile_id = _pkg;
  FOR _f IN SELECT * FROM (VALUES
      ('N01 A inactive(retired) overlay bind', 'SECTOR_OVERLAY', _ov_ret),
      ('N02 B submitted overlay bind',         'SECTOR_OVERLAY', _ov_sub),
      ('N03 D draft source bind',              'SOURCE_BINDING', _sb_draft),
      ('N04 D submitted source bind',          'SOURCE_BINDING', _sb_sub),
      ('N05 D retired source bind',            'SOURCE_BINDING', _sb_ret)) t(name, ct, cid) LOOP
    BEGIN
      PERFORM public.supervisory_policy_profile_binding_set(_pkg, jsonb_build_object('component_type',_f.ct,'component_id',_f.cid,'rationale','CLOSE02B negative'));
      _fail:=_fail+1; _log:=_log||' '||_f.name||':ACCEPTED';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM LIKE 'component_not_approved%' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' '||_f.name||':'||SQLERRM; END IF;
    WHEN OTHERS THEN _fail:=_fail+1; _log:=_log||' '||_f.name||':'||SQLSTATE||' '||SQLERRM;
    END;
  END LOOP;
  SELECT count(*) INTO _n1 FROM public.supervisory_policy_profile_binding WHERE profile_id = _pkg;
  IF _n1 = _n0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N06 binding rows written'; END IF;

  -- ================= runtime: pin each invalid state onto a fixture snapshot (simulates tamper/drift)
  RESET ROLE;
  FOR _f IN SELECT * FROM (VALUES
      ('A',  _a_x1,  _ov_ret, NULL::uuid, 'RETIRED_HISTORICAL',          false),
      ('B',  _a_ib,  _ov_sub, NULL::uuid, 'PINNED_POLICY_NOT_APPROVED',  true),
      ('C1', _a_msb, _ov_fut, NULL::uuid, 'PINNED_POLICY_NOT_EFFECTIVE', true),
      ('C2', _a_x2,  _ov_exp, NULL::uuid, 'PINNED_POLICY_NOT_EFFECTIVE', false),
      ('D1', _a_drf, _ov_ok,  _sb_draft,  'source binding cannot be used', true),
      ('D2', _a_x3,  _ov_ok,  _sb_sub,    'source binding cannot be used', false)) t(k, aid, ov, sb, expect, use_set) LOOP
    INSERT INTO public.supervisory_assessment_policy_snapshot(assessment_id, domain_code, policy_profile_id, policy_profile_code, policy_profile_version, policy_profile_origin, regulator_id, resolved_as_of, components, resolution, content_hash)
    VALUES (_f.aid,'AML_CFT',_prof.policy_profile_id,_prof.policy_profile_code,_prof.policy_profile_version,_prof.policy_profile_origin,_reg,current_date,
            _base || jsonb_build_array(jsonb_build_object('component_type','SECTOR_OVERLAY','component_id',_f.ov),
                                       jsonb_build_object('component_type','FACT_CONFIG','component_id',_fc))
                  || CASE WHEN _f.sb IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('component_type','SOURCE_BINDING','component_id',_f.sb)) END,
            '{}'::jsonb,'close02b-fixture');
    IF _f.k IN ('B','C1','C2') THEN
      _r := public.supervisory_assessment_sector_overlay_internal(_f.aid);
      IF NOT (_r->>'applies')::boolean AND _r->>'reason_code' = _f.expect
        THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' R'||_f.k||':'||_r::text; END IF;
    END IF;
    IF _f.k = 'A' THEN
      -- A retired-but-approved overlay is still readable as HISTORY for assessments that pinned it
      -- (reproducibility); it can never govern new work because binding refuses it (N01).
      _r := public.supervisory_assessment_sector_overlay_internal(_f.aid);
      _log := _log||' (A history-read status='||COALESCE(_r->>'status','?')||')'; _pass:=_pass+1;
      CONTINUE;
    END IF;
    -- governing check (no status gate) — must refuse for every invalid state
    BEGIN
      PERFORM public.supervisory_assessment_fact_governance_internal(_f.aid, 'CLOSE02B_STR_COUNT', 'numeric', 'EXTERNAL');
      _fail:=_fail+1; _log:=_log||' G'||_f.k||':ACCEPTED';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF _f.k LIKE 'D%' AND SQLERRM NOT LIKE '%'||_f.expect||'%' THEN _fail:=_fail+1; _log:=_log||' G'||_f.k||':'||SQLERRM;
      ELSE _pass:=_pass+1; END IF;
    END;
    IF _f.use_set THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO _n0 FROM public.supervisory_assessment_fact WHERE assessment_id = _f.aid;
      BEGIN
        PERFORM public.supervisory_assessment_fact_set(_f.aid, '{"fact_code":"CLOSE02B_STR_COUNT","value":"5","source_type":"EXTERNAL"}');
        _fail:=_fail+1; _log:=_log||' F'||_f.k||':ACCEPTED';
      EXCEPTION WHEN SQLSTATE '22023' THEN _pass:=_pass+1; _log:=_log||' (F'||_f.k||': '||left(SQLERRM,110)||')';
      WHEN SQLSTATE '42501' THEN _fail:=_fail+1; _log:=_log||' F'||_f.k||':not-authorized(persona) '||SQLERRM;
      END;
      SELECT count(*) INTO _n1 FROM public.supervisory_assessment_fact WHERE assessment_id = _f.aid;
      IF _n1 = _n0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' W'||_f.k||':row written'; END IF;
      RESET ROLE;
    END IF;
  END LOOP;

  -- ================= UI/backend parity on SUP-AML_CFT-2026-00838 (read + refused writes only)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  _r := public.supervisory_assessment_configuration_authority(_a838);
  FOR _f IN SELECT * FROM (VALUES ('AML_TECH_CERT_RETIRED', false), ('AML_TECH_CERT_OTHER_SECTOR', false),
                                  ('AML_TECH_CERT_STR_COUNT', true), ('AML_TECH_CERT_HAS_FLAG', true)) t(code, permitted) LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'facts') x WHERE x->>'fact_code'=_f.code
                AND (x->>'permitted')::boolean = _f.permitted
                AND (_f.permitted OR COALESCE(x->>'not_permitted_reason','') <> ''))
      THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' P:'||_f.code; END IF;
  END LOOP;
  SELECT count(*) INTO _n0 FROM public.supervisory_assessment_fact WHERE assessment_id = _a838;
  FOR _f IN SELECT * FROM (VALUES ('AML_TECH_CERT_RETIRED'), ('AML_TECH_CERT_OTHER_SECTOR')) t(code) LOOP
    BEGIN
      PERFORM public.supervisory_assessment_fact_set(_a838, jsonb_build_object('fact_code',_f.code,'value','1','source_type','MANUAL'));
      _fail:=_fail+1; _log:=_log||' S:'||_f.code||':ACCEPTED';
    EXCEPTION WHEN SQLSTATE '22023' THEN _pass:=_pass+1; END;
  END LOOP;
  SELECT count(*) INTO _n1 FROM public.supervisory_assessment_fact WHERE assessment_id = _a838;
  IF _n1 = _n0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S:rows written'; END IF;

  -- valid governed fact stays recordable (fixture assessment, active overlay+fact+no source family)
  RESET ROLE;
  INSERT INTO public.supervisory_assessment_policy_snapshot(assessment_id, domain_code, policy_profile_id, policy_profile_code, policy_profile_version, policy_profile_origin, regulator_id, resolved_as_of, components, resolution, content_hash)
  VALUES (_a_cu,'AML_CFT',_prof.policy_profile_id,_prof.policy_profile_code,_prof.policy_profile_version,_prof.policy_profile_origin,_reg,current_date,
          _base || jsonb_build_array(jsonb_build_object('component_type','SECTOR_OVERLAY','component_id',_ov_ok),
                                     jsonb_build_object('component_type','FACT_CONFIG','component_id',_fc)), '{}'::jsonb,'close02b-fixture');
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.supervisory_assessment_fact_set(_a_cu, '{"fact_code":"CLOSE02B_STR_COUNT","value":"7","source_type":"RETURN"}');
    IF (SELECT value_numeric FROM public.supervisory_assessment_fact WHERE assessment_id=_a_cu AND fact_code='CLOSE02B_STR_COUNT') = 7
      THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' V:not persisted'; END IF;
  EXCEPTION WHEN OTHERS THEN _fail:=_fail+1; _log:=_log||' V:'||SQLSTATE||' '||SQLERRM; END;

  -- ================= fingerprint semantics (cfp1 = substantive content only)
  _r := public.supervisory_assessment_policy_basis_integrity(_a838);
  IF _r->>'status' = 'CONTENT_UNCHANGED' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' I838:'||left(_r::text,600); END IF;
  _r := public.supervisory_policy_component_create(jsonb_build_object('component_type','SECTOR_OVERLAY','domain_code','AML_CFT',
          'regulator_id',_reg,'code','CLOSE02B-FP','component_version','1','name','CLOSE02B fingerprint fixture',
          'content', '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"}]}'::jsonb));
  _fp_c := COALESCE(NULLIF(_r->>'id',''), NULLIF(_r->>'component_id',''))::uuid;
  RESET ROLE;
  _fp1 := public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c);
  _lh1 := public.supervisory_policy_component_content_hash('SECTOR_OVERLAY', _fp_c);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.supervisory_policy_component_lifecycle(_fp_c, 'SUBMITTED', 'CLOSE02B fingerprint submit step');
  RESET ROLE;
  IF public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c) = _fp1 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' FP-status'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_chk,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.supervisory_policy_component_lifecycle(_fp_c, 'APPROVED', 'CLOSE02B fingerprint approve step');
  RESET ROLE;
  IF public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c) = _fp1 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' FP-approve'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.supervisory_policy_component_lifecycle(_fp_c, 'ACTIVE', 'CLOSE02B fingerprint activate step');
  EXCEPTION WHEN OTHERS THEN _log:=_log||' (activate via lifecycle: '||SQLERRM||')';
    RESET ROLE; UPDATE public.supervisory_policy_component SET status='ACTIVE', activated_at=now() WHERE id=_fp_c;
  END;
  RESET ROLE;
  _fp2 := public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c);
  _lh2 := public.supervisory_policy_component_content_hash('SECTOR_OVERLAY', _fp_c);
  IF _fp2 = _fp1 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' FP-activate'; END IF;
  IF _lh2 <> _lh1 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' LEGACY-not-status-sensitive'; END IF;
  -- content edits are only possible on a DRAFT version: use a separate draft fixture
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content)
  VALUES ('SECTOR_OVERLAY','CLOSE02B-FP-D','1','AML_CFT',_reg,'CLOSE02B fp draft','DRAFT',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"}]}') RETURNING id INTO _fp_c;
  _fp1 := public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c);
  UPDATE public.supervisory_policy_component SET content='{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"NOT_APPLICABLE"}]}' WHERE id=_fp_c;
  IF public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c) <> _fp1 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' FP-content'; END IF;
  UPDATE public.supervisory_policy_component SET content='{"sectors":[{"applicability":"APPLICABLE","sector_code":"CREDIT_UNIONS"}]}' WHERE id=_fp_c;
  IF public.supervisory_policy_component_content_fingerprint('SECTOR_OVERLAY', _fp_c) = _fp1 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' FP-keyorder'; END IF;
  -- historical stored hashes are not rewritten
  IF (SELECT content_hash FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id=_a838) = '7e5bed5e523315dec267329dbca344c2'
     AND (SELECT x->>'content_hash' FROM public.supervisory_assessment_policy_snapshot s, jsonb_array_elements(s.components) x
           WHERE s.assessment_id=_a838 AND x->>'component_type'='SECTOR_OVERLAY') = '2a8d2ad5c8533ed2b9e45d6bb8f4baeb'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' HIST-rewritten'; END IF;

  RAISE EXCEPTION 'CLOSE02B_RESULT pass=% fail=% %', _pass, _fail, CASE WHEN _log='' THEN '' ELSE ' notes:'||_log END;
END
$close02b$;
