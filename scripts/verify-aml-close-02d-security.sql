-- =====================================================================
-- AML-CLOSE-02D — AML security boundaries (least privilege, self-grant
-- refusal, anonymous boundary) and historical-record integrity.
-- =====================================================================
-- TRANSACTIONAL, ALWAYS ROLLED BACK (the DO block ends by raising).
-- Personas act through request.jwt.claims + SET LOCAL ROLE authenticated.
-- Result: final exception "CLOSE02D_RESULT pass=N fail=M ..."
-- =====================================================================
DO $close02d$
DECLARE
  _officer uuid := 'b8eaf680-fe66-4d49-b816-1c087f511235';  -- ordinary AML officer (TEST)
  _sup     uuid := '0b522724-adcb-48bf-b21d-175339479616';  -- AML supervisor (TEST)
  _sa      uuid := '4248640c-3397-4cf6-a274-fa09bad4ba64';  -- TEST super administrator
  _ext     uuid := 'cf2c227e-52fd-46ff-b751-db30ecd20ec1';  -- licensee / entity user (TEST)
  _head    uuid := (SELECT id FROM public.sec_roles WHERE key='aml_head');
  _a830 uuid := '7e0a9271-8696-4242-a905-fd8cb66c938f';
  _a836 uuid := 'd81e0a9e-f36b-456f-bdde-48611b54cab4';
  _a838 uuid := '66cc17e3-f944-4b93-be22-8857565a1213';
  _r jsonb; _ok boolean; _err text; _n int; _au0 int; _au1 int;
  _pass int := 0; _fail int := 0; _log text := '';
  _fn text;
BEGIN
  -- ---------- S1 least privilege: ordinary officer
  IF NOT public.has_permission(_officer,'aml_supervision','view_confidential')
     AND NOT public.has_permission(_officer,'aml_supervision','review')
     AND NOT public.has_permission(_officer,'aml_supervision','approve')
     AND NOT public.has_permission(_officer,'aml_supervision','policy_approve')
     AND public.has_permission(_officer,'aml_supervision','view')
     AND public.has_permission(_officer,'aml_supervision','create')
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S1:officer privileges wrong'; END IF;

  -- ---------- S2 broader roles remain where the model grants them
  IF public.has_permission(_sup,'aml_supervision','view_confidential')
     AND public.has_permission(_sup,'aml_supervision','review')
     AND public.has_permission(_sup,'aml_supervision','approve')
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S2:supervisor lost authority'; END IF;

  -- ---------- S3 external and anonymous have no AML authority
  IF NOT public.has_permission(_ext,'aml_supervision','view')
     AND NOT public.has_permission(_ext,'aml_supervision','view_confidential')
     AND NOT public.has_permission(NULL,'aml_supervision','view')
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S3:external/anon authority'; END IF;

  -- ---------- S4 no active self-granted role exists anywhere
  SELECT count(*) INTO _n FROM public.sec_user_roles ur
   WHERE ur.status='active' AND ur.assigned_by = ur.user_id AND NOT public.is_super_admin(ur.user_id);
  IF _n = 0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S4:'||_n||' active self-grants'; END IF;

  -- ---------- S5 forged RPC: officer grants itself aml_head
  SELECT count(*) INTO _au0 FROM public.audit_logs;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_officer,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  _ok := false;
  BEGIN
    PERFORM public.sec_assign_user_roles(_officer, ARRAY[
      (SELECT role_id FROM public.sec_user_roles WHERE user_id=_officer AND status='active' LIMIT 1), _head]);
  EXCEPTION WHEN OTHERS THEN _ok := SQLERRM LIKE '%not_authorized%'; _err := SQLERRM; END;
  IF _ok THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S5:'||COALESCE(_err,'accepted'); END IF;

  -- ---------- S6 forged direct write to the role table as a signed-in user
  _ok := false;
  BEGIN
    INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by) VALUES (_officer, _head, 'active', _officer);
  EXCEPTION WHEN OTHERS THEN _ok := true; _err := SQLSTATE; END;
  IF _ok THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S6:direct insert accepted'; END IF;
  _ok := false;
  BEGIN
    UPDATE public.sec_user_roles SET status='active', effective_until=NULL WHERE user_id=_officer AND role_id=_head;
    GET DIAGNOSTICS _n = ROW_COUNT; _ok := (_n = 0);
  EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF _ok THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S6b:direct reactivation accepted'; END IF;
  RESET ROLE;

  -- ---------- S7 structural guard: even a privileged path cannot self-grant
  _ok := false;
  BEGIN
    UPDATE public.sec_user_roles SET status='active', assigned_by=_officer, effective_until=NULL
     WHERE user_id=_officer AND role_id=_head;
  EXCEPTION WHEN OTHERS THEN _ok := SQLERRM LIKE '%self_role_grant_refused%'; _err := SQLERRM; END;
  IF _ok THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S7:'||COALESCE(_err,'self re-grant accepted'); END IF;

  -- ---------- S8 refusals wrote no audit row and changed nothing
  SELECT count(*) INTO _au1 FROM public.audit_logs;
  IF _au1 = _au0 AND NOT public.has_permission(_officer,'aml_supervision','view_confidential')
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S8:side effects'; END IF;

  -- ---------- S9 a governed grant by an administrator still works (rolled back)
  BEGIN
    UPDATE public.sec_user_roles SET status='active', assigned_by=_sa, effective_until=NULL
     WHERE user_id=_officer AND role_id=_head;
    IF public.has_permission(_officer,'aml_supervision','view_confidential') THEN _pass:=_pass+1;
    ELSE _fail:=_fail+1; _log:=_log||' S9:governed grant ineffective'; END IF;
    UPDATE public.sec_user_roles SET status='inactive', effective_until=now()
     WHERE user_id=_officer AND role_id=_head;
  EXCEPTION WHEN OTHERS THEN _fail:=_fail+1; _log:=_log||' S9:'||SQLERRM; END;

  -- ---------- S10 anonymous boundary: no unallowlisted project routine
  SELECT count(*) INTO _n FROM public.sec_anon_executable_functions WHERE NOT allowlisted AND NOT is_extension;
  IF _n = 0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S10:'||_n||' anon routines'; END IF;
  FOREACH _fn IN ARRAY ARRAY['public.supervisory_policy_profile_effective(text,uuid,uuid,uuid,date)',
      'public.supervisory_assessment_policy_basis(uuid)','public.supervisory_policy_vocabulary(text,uuid)',
      'public.supervisory_policy_profile_compatibility(uuid)'] LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      _fail:=_fail+1; _log:=_log||' S11:'||_fn; ELSE _pass:=_pass+1; END IF;
  END LOOP;

  -- ---------- S12 external persona cannot read AML assessments or facts
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_ext,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO _n FROM public.supervisory_assessment WHERE id IN (_a830,_a836,_a838);
    IF _n = 0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S12:external sees '||_n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN _pass:=_pass+1; END;
  BEGIN
    SELECT count(*) INTO _n FROM public.supervisory_assessment_fact WHERE assessment_id=_a838;
    IF _n = 0 THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' S12b:external sees facts'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN _pass:=_pass+1; END;
  RESET ROLE;

  -- ---------- H1 00838 historically intact
  SELECT count(*) INTO _n FROM public.supervisory_assessment_fact
   WHERE assessment_id=_a838
     AND ((fact_code='AML_TECH_CERT_STR_COUNT' AND value_numeric=12 AND source_type='RETURN')
       OR (fact_code='AML_TECH_CERT_HAS_FLAG'  AND value_boolean AND source_type='MANUAL')
       OR (fact_code='AML_TECH_CERT_TIER'      AND value_text='TIER_A' AND source_type='FORM'));
  IF _n = 3 AND (SELECT count(*) FROM public.supervisory_assessment_fact WHERE assessment_id=_a838) = 3
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' H1:838 facts '||_n; END IF;
  IF (SELECT policy_profile_code||'/'||policy_profile_version FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id=_a838)
       = 'AML_TECH_CERT_POLICY/1'
     AND (SELECT left(content_hash,12) FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id=_a838) = '7e5bed5e5233'
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' H2:838 snapshot changed'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_officer,'role','authenticated')::text, true);
  _r := public.supervisory_assessment_policy_basis_integrity(_a838);
  IF _r->>'status' = 'CONTENT_UNCHANGED' THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' H3:'||left(_r::text,300); END IF;

  -- ---------- H4 00830 / 00836 unchanged; FSRA non-impact
  IF (SELECT left(content_hash,12) FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id=_a830) = '2363b569ed05'
     AND EXISTS (SELECT 1 FROM public.supervisory_assessment WHERE id=_a836)
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_domain_perimeter p JOIN public.supervisory_assessment a ON a.entity_id=p.entity_id
                      WHERE a.id IN (_a836,_a838) AND p.domain_code='AML_CFT')
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' H4:historical records changed'; END IF;
  IF (SELECT status FROM public.supervisory_policy_profile WHERE code='FSRA-AML-CFT-POLICY' AND profile_version='1.0')='ACTIVE'
     AND (SELECT status FROM public.supervisory_methodology WHERE code='AML-CFT-RBA' AND version='1.0')='ACTIVE'
     AND (SELECT status FROM public.supervisory_methodology WHERE code='AML-CFT-RBA' AND version='1.1')='DRAFT'
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile WHERE code='AML_TECH_CERT_POLICY' AND status IN ('ACTIVE','APPROVED'))
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology WHERE code='AML_TECH_CERT_METHOD' AND status IN ('ACTIVE','APPROVED'))
  THEN _pass:=_pass+1; ELSE _fail:=_fail+1; _log:=_log||' H5:FSRA/TEST lifecycle drift'; END IF;

  RAISE EXCEPTION 'CLOSE02D_RESULT pass=% fail=% %', _pass, _fail, _log;
END $close02d$;
