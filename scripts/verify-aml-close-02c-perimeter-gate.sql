-- =====================================================================
-- AML-CLOSE-02C — creation-time AML/CFT supervisory perimeter gate
-- =====================================================================
-- TRANSACTIONAL, ALWAYS ROLLED BACK (the DO block ends by raising).
-- Personas act through request.jwt.claims + SET LOCAL ROLE authenticated.
-- The perimeter model (supervisory_domain_perimeter) is one row per
-- (entity, domain) with is_applicable boolean; it has no draft / submitted /
-- effective-date / retired states, so only states the model supports are tested.
-- SUP-AML_CFT-2026-00838 and -00830 are only READ.
-- Result: final exception "CLOSE02C_RESULT pass=N fail=M ..."
-- =====================================================================
DO $close02c$
DECLARE
  _maker uuid := 'b8eaf680-fe66-4d49-b816-1c087f511235';   -- aml_supervision_officer
  _chk   uuid := '4248640c-3397-4cf6-a274-fa09bad4ba64';   -- super administrator (holds approve; supervisor persona lacks Helen in portfolio)
  _helen uuid := 'fdf5c81f-9aa8-40da-9df0-781f3c2e7adc';   -- TEST entity, no perimeter record
  _other uuid;                                             -- entity with applicable perimeter
  _excl  uuid;                                             -- entity determined NOT applicable
  _a838  uuid := '66cc17e3-f944-4b93-be22-8857565a1213';
  _r jsonb; _err text; _n0 int; _n1 int; _e0 int; _e1 int; _au0 int; _au1 int; _no0 int; _no1 int;
  _q0 int; _q1 int; _h838 text; _h838b text; _f838 int;
  _pass int := 0; _fail int := 0; _log text := '';
BEGIN
  SELECT entity_id INTO _other FROM public.supervisory_domain_perimeter WHERE domain_code='AML_CFT' AND is_applicable LIMIT 1;
  SELECT entity_id INTO _excl  FROM public.supervisory_domain_perimeter WHERE domain_code='AML_CFT' AND NOT is_applicable LIMIT 1;
  SELECT md5(to_jsonb(s)::text) INTO _h838 FROM public.supervisory_assessment_policy_snapshot s WHERE assessment_id=_a838;

  -- helper macro (inline): record a gate result
  -- ---------- P0 shared rule is internal-only (not callable by authenticated)
  IF has_function_privilege('authenticated','public.supervisory_assessment_creation_perimeter(uuid,text)','EXECUTE') THEN
    _fail:=_fail+1; _log:=_log||' P0:FAIL'; ELSE _pass:=_pass+1; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='supervisory_assessment_perimeter_guard' AND NOT tgisinternal AND tgenabled<>'D') THEN
    _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' P0b:FAIL'; END IF;

  SELECT count(*) INTO _n0 FROM public.supervisory_assessment;
  SELECT count(*) INTO _e0 FROM public.supervisory_assessment_event;
  SELECT count(*) INTO _au0 FROM public.compliance_audit_logs WHERE object_type='supervisory_assessment';
  SELECT count(*) INTO _no0 FROM public.notifications;
  SELECT count(*) INTO _q0 FROM public.supervisory_assessment_fact;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ---------- N1 no determination: read model and forged direct create both refuse
  _r := public.supervisory_assessment_creation_eligibility(_helen,'AML_CFT');
  IF (_r->>'allowed')::boolean = false AND _r->>'state'='PERIMETER_NOT_ESTABLISHED' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N1a:'||_r::text; END IF;
  BEGIN
    PERFORM public.supervisory_assessment_create(_helen,'AML_CFT');
    _fail:=_fail+1; _log:=_log||' N1b:created';
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE 'perimeter_not_established:%' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N1b:'||SQLERRM; END IF;
  END;
  -- forged programme-route create (any programme id) must also stop
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(_helen,'AML_CFT',
      (SELECT id FROM public.supervisory_assessment_programme LIMIT 1),'PERIODIC',NULL,NULL,'forged',NULL);
    _fail:=_fail+1; _log:=_log||' N1c:created';
  EXCEPTION WHEN others THEN _pass:=_pass+1; END;
  _r := public.supervisory_assessment_programme_options_for_entity(_helen,'AML_CFT',NULL);
  -- options model still resolves programmes; the create command is the boundary

  -- ---------- N2 explicit NOT applicable
  IF _excl IS NOT NULL THEN
    BEGIN
      PERFORM public.supervisory_assessment_create(_excl,'AML_CFT');
      _fail:=_fail+1; _log:=_log||' N2:created';
    EXCEPTION WHEN others THEN
      IF SQLERRM ILIKE 'domain_not_applicable:%' OR SQLERRM ILIKE '%scope%' OR SQLERRM ILIKE '%not_authori%' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N2:'||SQLERRM; END IF;
    END;
  END IF;

  -- ---------- N3 determination of ANOTHER entity / another domain does not help
  EXECUTE 'RESET ROLE';
  INSERT INTO public.supervisory_domain_perimeter(entity_id,domain_code,is_applicable,basis,determined_by)
  VALUES (_helen,'PRUDENTIAL',true,'CLOSE02C fixture: other-domain determination',_chk);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  _r := public.supervisory_assessment_creation_eligibility(_helen,'AML_CFT');
  IF (_r->>'allowed')::boolean = false THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N3a'; END IF;
  IF _other IS NOT NULL AND _other <> _helen THEN
    BEGIN PERFORM public.supervisory_assessment_create(_helen,'AML_CFT'); _fail:=_fail+1; _log:=_log||' N3b:created';
    EXCEPTION WHEN others THEN _pass:=_pass+1; END;
  END IF;

  -- ---------- N4 raw insert bypassing the command is refused by the guard
  EXECUTE 'RESET ROLE';
  BEGIN
    INSERT INTO public.supervisory_assessment(reference,entity_id,domain_code,assessment_type,trigger_type,origin_provenance,created_by)
    VALUES ('CLOSE02C-RAW',_helen,'AML_CFT','PERIODIC','PERIODIC','GOVERNED',_maker);
    _fail:=_fail+1; _log:=_log||' N4:inserted';
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE 'perimeter_not_established:%' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N4:'||SQLERRM; END IF;
  END;

  -- ---------- N5 no side effects from any refusal
  SELECT count(*) INTO _n1 FROM public.supervisory_assessment;
  SELECT count(*) INTO _e1 FROM public.supervisory_assessment_event;
  SELECT count(*) INTO _au1 FROM public.compliance_audit_logs WHERE object_type='supervisory_assessment';
  SELECT count(*) INTO _no1 FROM public.notifications;
  SELECT count(*) INTO _q1 FROM public.supervisory_assessment_fact;
  IF _n1=_n0 AND _e1=_e0 AND _au1=_au0 AND _no1=_no0 AND _q1=_q0 THEN _pass:=_pass+1;
  ELSE _fail:=_fail+1; _log:=_log||format(' N5:%s/%s %s/%s %s/%s %s/%s %s/%s',_n0,_n1,_e0,_e1,_au0,_au1,_no0,_no1,_q0,_q1); END IF;

  -- ---------- P1 governed determination by supervisor -> creation allowed
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_chk,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.supervisory_domain_perimeter_set(_helen,'AML_CFT',true,'CLOSE02C rolled-back fixture: TEST ONLY - NOT FSRA REGULATORY DETERMINATION');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  _r := public.supervisory_assessment_creation_eligibility(_helen,'AML_CFT');
  IF (_r->>'allowed')::boolean AND _r->>'state'='PERIMETER_ESTABLISHED' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' P1a:'||_r::text; END IF;
  BEGIN
    _r := public.supervisory_assessment_create(_helen,'AML_CFT');
    IF _r ? 'id' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' P1b'; END IF;
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE 'perimeter%' OR SQLERRM ILIKE 'domain_not_applicable%' THEN _fail:=_fail+1; _log:=_log||' P1b:'||SQLERRM;
    ELSE _pass:=_pass+1; _log:=_log||' P1b(passed perimeter, later gate: '||left(SQLERRM,80)||')'; END IF;
  END;

  -- ---------- N6 determination later revoked (is_applicable=false) -> refused again
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_chk,'role','authenticated')::text, true);
  PERFORM public.supervisory_domain_perimeter_set(_helen,'AML_CFT',false,'CLOSE02C rolled-back fixture: revoked');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_maker,'role','authenticated')::text, true);
  BEGIN PERFORM public.supervisory_assessment_create(_helen,'AML_CFT'); _fail:=_fail+1; _log:=_log||' N6:created';
  EXCEPTION WHEN others THEN IF SQLERRM ILIKE 'domain_not_applicable:%' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' N6:'||SQLERRM; END IF; END;

  -- ---------- H1 historical 00838 remains readable and unchanged
  EXECUTE 'RESET ROLE';
  SELECT md5(to_jsonb(s)::text) INTO _h838b FROM public.supervisory_assessment_policy_snapshot s WHERE assessment_id=_a838;
  SELECT count(*) INTO _f838 FROM public.supervisory_assessment_fact WHERE assessment_id=_a838;
  IF _h838=_h838b AND _f838=3 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||format(' H1:%s facts',_f838); END IF;

  RAISE EXCEPTION 'CLOSE02C_RESULT pass=% fail=% %', _pass, _fail, _log;
END $close02c$;
