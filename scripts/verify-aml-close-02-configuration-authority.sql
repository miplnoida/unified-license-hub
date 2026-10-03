-- =====================================================================
-- AML-CLOSE-02 — Sector Overlay + Facts + Sources runtime authority
-- =====================================================================
-- One DO block. Every fixture (fact requirements, policy components,
-- policy snapshots, facts) is created inside it and the block ends by
-- RAISING, so the whole transaction is rolled back: nothing persists.
-- No assessment row is inserted (avoids assessment notification triggers);
-- the harness pins fixture snapshots onto existing draft TEST assessments
-- that have no policy basis yet. SUP-AML_CFT-2026-00830 is never touched.
-- Authorisation is exercised as real personas via request.jwt.claims +
-- SET LOCAL ROLE authenticated.
--
-- Result: the final exception message "CLOSE02_RESULT pass=N fail=M ..."
-- =====================================================================
DO $close02$
DECLARE
  _admin  uuid := '4248640c-3397-4cf6-a274-fa09bad4ba64';
  _ro     uuid := 'e4a78cbe-912f-4e7e-94eb-c00f4adb1148';
  _lic    uuid := 'cf2c227e-52fd-46ff-b751-db30ecd20ec1';
  _reg    uuid := '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';
  _a_cu   uuid := '093b4f2b-5017-49fc-aa9f-026f21d15a0f'; -- 00739 CREDIT_UNIONS
  _a_msb  uuid := '219e68df-f799-4cc6-9004-f07a94a8621c'; -- 00351 MSB
  _a_drf  uuid := '3709eb06-31d1-4efd-be6c-fad3dbf73111'; -- 00735 MSB
  _a_eff  uuid := '74b24d46-bbc4-41ab-8b1d-df91f8e1c496'; -- 00131
  _a_ng   uuid := '054b536a-2219-405a-bcc0-a8be1a3d1ebd'; -- 00837 real FSRA snapshot
  _meth uuid; _base jsonb; _prof public.supervisory_assessment_policy_snapshot;
  _ov1 uuid; _ov2 uuid; _ovd uuid; _ovf uuid; _fc uuid; _sb uuid;
  _r jsonb; _pass int := 0; _fail int := 0; _log text := '';
  _f record;
BEGIN
  SELECT methodology_id INTO _meth FROM public.supervisory_assessment WHERE id = _a_cu;
  SELECT * INTO _prof FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _a_ng;
  _base := _prof.components;

  -- fixture methodology facts (rolled back)
  INSERT INTO public.supervisory_methodology_fact_requirement(methodology_id, fact_code, label, data_type, is_required, definition_status)
  VALUES (_meth,'CLOSE02_STR_COUNT','CLOSE02 STR count','numeric',false,'ATTRIBUTES_PENDING'),
         (_meth,'CLOSE02_UNLISTED','CLOSE02 unlisted','text',false,'ATTRIBUTES_PENDING'),
         (_meth,'CLOSE02_IB_ONLY','CLOSE02 IB only','numeric',false,'ATTRIBUTES_PENDING'),
         (_meth,'CLOSE02_TYPE_CONFLICT','CLOSE02 type conflict','numeric',false,'ATTRIBUTES_PENDING');

  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('SECTOR_OVERLAY','CLOSE02-OV','1.0','AML_CFT',_reg,'CLOSE02 overlay','ACTIVE',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"}]}','2026-01-01',now(),_admin,now())
  RETURNING id INTO _ov1;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content)
  VALUES ('SECTOR_OVERLAY','CLOSE02-OV-DRAFT','1.0','AML_CFT',_reg,'CLOSE02 draft overlay','DRAFT',
          '{"sectors":[{"sector_code":"MONEY_SERVICES_BUSINESS","applicability":"APPLICABLE"}]}')
  RETURNING id INTO _ovd;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('SECTOR_OVERLAY','CLOSE02-OV-FUTURE','1.0','AML_CFT',_reg,'CLOSE02 future overlay','ACTIVE',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"APPLICABLE"}]}','2099-01-01',now(),_admin,now())
  RETURNING id INTO _ovf;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('FACT_CONFIG','CLOSE02-FC','1.0','AML_CFT',_reg,'CLOSE02 facts','ACTIVE',
          jsonb_build_object('facts', jsonb_build_array(
            jsonb_build_object('fact_code','CLOSE02_STR_COUNT','data_type','NUMBER','is_required',true,'sector_codes',jsonb_build_array('CREDIT_UNIONS')),
            jsonb_build_object('fact_code','CLOSE02_IB_ONLY','data_type','NUMBER','sector_codes',jsonb_build_array('INTERNATIONAL_BANKING')),
            jsonb_build_object('fact_code','CLOSE02_TYPE_CONFLICT','data_type','DATE'))),
          '2026-01-01',now(),_admin,now())
  RETURNING id INTO _fc;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at)
  VALUES ('SOURCE_BINDING','CLOSE02-SB','1.0','AML_CFT',_reg,'CLOSE02 sources','ACTIVE',
          '{"bindings":[{"fact_code":"CLOSE02_STR_COUNT","source_kind":"RETURN","source_reference":"AML-RET-Q"}]}','2026-01-01',now(),_admin,now())
  RETURNING id INTO _sb;

  -- pin fixture snapshots
  INSERT INTO public.supervisory_assessment_policy_snapshot(assessment_id, domain_code, policy_profile_id, policy_profile_code, policy_profile_version, policy_profile_origin, regulator_id, resolved_as_of, components, resolution, content_hash)
  SELECT x.aid, 'AML_CFT', _prof.policy_profile_id, _prof.policy_profile_code, _prof.policy_profile_version, _prof.policy_profile_origin, _reg, current_date,
         _base || x.extra, '{}'::jsonb, 'close02-fixture'
    FROM (VALUES
      (_a_cu,  jsonb_build_array(jsonb_build_object('component_type','SECTOR_OVERLAY','component_id',_ov1),
                                 jsonb_build_object('component_type','FACT_CONFIG','component_id',_fc),
                                 jsonb_build_object('component_type','SOURCE_BINDING','component_id',_sb))),
      (_a_msb, jsonb_build_array(jsonb_build_object('component_type','SECTOR_OVERLAY','component_id',_ov1))),
      (_a_drf, jsonb_build_array(jsonb_build_object('component_type','SECTOR_OVERLAY','component_id',_ovd))),
      (_a_eff, jsonb_build_array(jsonb_build_object('component_type','SECTOR_OVERLAY','component_id',_ovf)))) x(aid, extra);

  -- ---------------------------------------------------------------- gates
  -- G01 correct overlay selected for the entity's sector
  _r := public.supervisory_assessment_sector_overlay_internal(_a_cu);
  IF _r->>'status'='GOVERNED' AND (_r->>'applies')::boolean AND _r->>'sector_code'='CREDIT_UNIONS' AND _r->>'code'='CLOSE02-OV'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G01:'||_r::text; END IF;
  -- G02 sector outside overlay rejected
  _r := public.supervisory_assessment_sector_overlay_internal(_a_msb);
  IF NOT (_r->>'applies')::boolean AND _r->>'reason_code'='SECTOR_NOT_IN_OVERLAY'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G02:'||_r::text; END IF;
  -- G03 draft overlay not used
  _r := public.supervisory_assessment_sector_overlay_internal(_a_drf);
  IF NOT (_r->>'applies')::boolean AND _r->>'reason_code'='PINNED_POLICY_NOT_APPROVED'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G03:'||_r::text; END IF;
  -- G04 overlay outside effective period not used
  _r := public.supervisory_assessment_sector_overlay_internal(_a_eff);
  IF NOT (_r->>'applies')::boolean AND _r->>'reason_code'='PINNED_POLICY_NOT_EFFECTIVE'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G04:'||_r::text; END IF;
  -- G05 assessment without these families keeps prior behaviour
  _r := public.supervisory_assessment_sector_overlay_internal(_a_ng);
  IF _r->>'status'='NOT_GOVERNED' AND (_r->>'applies')::boolean
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G05:'||_r::text; END IF;
  -- G06 mandatory fact from FACT_CONFIG reported missing
  _r := public.supervisory_assessment_fact_gaps_internal(_a_cu);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_r) g WHERE g->>'fact_code'='CLOSE02_STR_COUNT')
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G06:'||_r::text; END IF;

  -- act as the super administrator through the governed command
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_admin,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- G07 applicable fact + bound source accepted, provenance persisted
  _r := public.supervisory_assessment_fact_set(_a_cu, '{"fact_code":"CLOSE02_STR_COUNT","value":"12","source_type":"RETURN","source_reference":"AML-RET-Q 2026Q2"}');
  SELECT * INTO _f FROM public.supervisory_assessment_fact WHERE assessment_id=_a_cu AND fact_code='CLOSE02_STR_COUNT';
  IF _f.value_numeric = 12 AND _f.provenance->'governance'->'fact_config'->>'code'='CLOSE02-FC'
     AND _f.provenance->'governance'->'source_binding'->>'source_reference'='AML-RET-Q'
     AND _f.provenance->'governance'->'sector_overlay'->>'component_version'='1.0'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G07:'||COALESCE(_f.provenance::text,'none'); END IF;
  -- G08 mandatory gap closes once recorded
  RESET ROLE;
  _r := public.supervisory_assessment_fact_gaps_internal(_a_cu);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r) g WHERE g->>'fact_code'='CLOSE02_STR_COUNT')
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G08'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- G09..G14 refusals (each must raise 22023 and write nothing)
  FOR _f IN SELECT * FROM (VALUES
     ('G09 source not bound',      _a_cu,  '{"fact_code":"CLOSE02_STR_COUNT","value":"3","source_type":"MANUAL"}'::jsonb),
     ('G10 fact not configured',   _a_cu,  '{"fact_code":"CLOSE02_UNLISTED","value":"x","source_type":"MANUAL"}'::jsonb),
     ('G11 fact of other sector',  _a_cu,  '{"fact_code":"CLOSE02_IB_ONLY","value":"1","source_type":"MANUAL"}'::jsonb),
     ('G12 type conflict',         _a_cu,  '{"fact_code":"CLOSE02_TYPE_CONFLICT","value":"1","source_type":"MANUAL"}'::jsonb),
     ('G13 unknown source kind',   _a_cu,  '{"fact_code":"CLOSE02_TYPE_CONFLICT","value":"1","source_type":"GOSSIP"}'::jsonb),
     ('G14 draft overlay pinned',  _a_drf, '{"fact_code":"CLOSE02_STR_COUNT","value":"1","source_type":"RETURN"}'::jsonb),
     ('G15 sector outside overlay',_a_msb, '{"fact_code":"CLOSE02_STR_COUNT","value":"1","source_type":"RETURN"}'::jsonb),
     ('G16 overlay not effective', _a_eff, '{"fact_code":"CLOSE02_STR_COUNT","value":"1","source_type":"RETURN"}'::jsonb)
   ) t(name, aid, payload) LOOP
    BEGIN
      PERFORM public.supervisory_assessment_fact_set(_f.aid, _f.payload);
      _fail:=_fail+1; _log:=_log||' '||_f.name||':ACCEPTED';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF _f.name LIKE 'G09%' AND (SELECT value_numeric FROM public.supervisory_assessment_fact WHERE assessment_id=_a_cu AND fact_code='CLOSE02_STR_COUNT') <> 12 THEN
        _fail:=_fail+1; _log:=_log||' G09:mutated';
      ELSE _pass:=_pass+1; END IF;
    WHEN OTHERS THEN _fail:=_fail+1; _log:=_log||' '||_f.name||':'||SQLSTATE||' '||SQLERRM;
    END;
  END LOOP;

  -- G17 frontend-bypass: payload naming a fact_requirement_id of the other-sector fact still refused
  BEGIN
    PERFORM public.supervisory_assessment_fact_set(_a_cu, jsonb_build_object(
      'fact_requirement_id', (SELECT id FROM public.supervisory_methodology_fact_requirement WHERE methodology_id=_meth AND fact_code='CLOSE02_IB_ONLY'),
      'value','1','source_type','RETURN'));
    _fail:=_fail+1; _log:=_log||' G17:ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN _pass:=_pass+1; END;

  -- G18 correction path honours the same source binding
  BEGIN
    PERFORM public.supervisory_assessment_fact_override(
      (SELECT id FROM public.supervisory_assessment_fact WHERE assessment_id=_a_cu AND fact_code='CLOSE02_STR_COUNT'),
      '{"value":"13","source_type":"MANUAL"}', 'Officer correction attempt via manual source');
    _fail:=_fail+1; _log:=_log||' G18:ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN _pass:=_pass+1; END;

  -- G19/G20 persona boundary: read-only and licensee cannot record facts
  FOR _f IN SELECT * FROM (VALUES ('G19 read_only', _ro), ('G20 licensee', _lic)) t(name, uid) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',_f.uid,'role','authenticated')::text, true);
    BEGIN
      PERFORM public.supervisory_assessment_fact_set(_a_cu, '{"fact_code":"CLOSE02_STR_COUNT","value":"99","source_type":"RETURN"}');
      _fail:=_fail+1; _log:=_log||' '||_f.name||':ACCEPTED';
    EXCEPTION WHEN SQLSTATE '42501' THEN _pass:=_pass+1;
    WHEN OTHERS THEN _fail:=_fail+1; _log:=_log||' '||_f.name||':'||SQLSTATE||' '||SQLERRM;
    END;
  END LOOP;

  -- G21 read model reflects backend truth
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_admin,'role','authenticated')::text, true);
  _r := public.supervisory_assessment_configuration_authority(_a_cu);
  IF _r->'sector_overlay'->>'code'='CLOSE02-OV'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'facts') x WHERE x->>'fact_code'='CLOSE02_UNLISTED' AND NOT (x->>'permitted')::boolean)
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'facts') x WHERE x->>'fact_code'='CLOSE02_STR_COUNT' AND (x->>'required')::boolean
                  AND x->'allowed_sources'->0->>'source_kind'='RETURN')
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G21:'||left(_r::text,400); END IF;
  -- G22 read model refused to the licensee
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_lic,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.supervisory_assessment_configuration_authority(_a_cu);
    _fail:=_fail+1; _log:=_log||' G22:ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN _pass:=_pass+1; END;
  RESET ROLE;

  -- G23 version integrity: a later overlay version excluding the sector does not change the pinned assessment
  UPDATE public.supervisory_policy_component SET status='SUPERSEDED', superseded_at=now() WHERE id=_ov1;
  INSERT INTO public.supervisory_policy_component(component_type, code, component_version, domain_code, regulator_id, name, status, content, effective_from, approved_at, approved_by, activated_at, supersedes_id)
  VALUES ('SECTOR_OVERLAY','CLOSE02-OV','2.0','AML_CFT',_reg,'CLOSE02 overlay v2','ACTIVE',
          '{"sectors":[{"sector_code":"CREDIT_UNIONS","applicability":"NOT_APPLICABLE"}]}','2026-01-01',now(),_admin,now(),_ov1)
  RETURNING id INTO _ov2;
  _r := public.supervisory_assessment_sector_overlay_internal(_a_cu);
  IF (_r->>'applies')::boolean AND _r->>'component_version'='1.0'
    THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' G23:'||_r::text; END IF;

  RAISE EXCEPTION 'CLOSE02_RESULT pass=% fail=%%', _pass, _fail, CASE WHEN _log='' THEN '' ELSE ' failures:'||_log END;
END
$close02$;
