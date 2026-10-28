-- All test service/licence/draft records are rolled back; no real licence dates change.
BEGIN;
DO $test$
DECLARE
  v_uid uuid := '3ef826f2-bc92-45f2-a6d7-fe8c29bacf74';
  v_lic uuid := gen_random_uuid(); v_svc uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_data jsonb; v_app public.applications; v_status text; v_denied boolean;
BEGIN
  INSERT INTO public.licenses(holder_id,license_number,license_type,sector_id,sub_sector_id,category_id,status,valid_until,regulator_id)
  SELECT holder_id,'ROLLBACK-RENEW-'||v_lic,license_type,sector_id,sub_sector_id,category_id,'expired',now()-interval '10 years',regulator_id
  FROM public.licenses WHERE license_number='LIC-2026-000166' RETURNING id INTO v_lic;
  IF v_lic IS NULL THEN RAISE EXCEPTION 'missing test context'; END IF;
  INSERT INTO public.services(id,sector_id,sub_sector_id,name,lifecycle_stage,regulator_id)
  SELECT v_svc,sector_id,sub_sector_id,'Renew','post_license',regulator_id FROM public.licenses WHERE id=v_lic;
  INSERT INTO public.services(id,sector_id,sub_sector_id,name,lifecycle_stage,regulator_id)
  SELECT v_other,sector_id,sub_sector_id,'ROLLBACK Non-renewal','post_license',regulator_id FROM public.licenses WHERE id=v_lic;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  IF public.is_super_admin(v_uid) OR public.has_permission(v_uid,'application_management','create') THEN
    RAISE EXCEPTION 'fixture must not use staff bypass';
  END IF;
  v_data := jsonb_build_object('type','post_license','license_id',v_lic,'service_id',v_svc,'is_renewal',true,'renewal_of_license_id',v_lic);
  -- Subtransactions roll back each successful draft to keep duplicate checks independent.
  BEGIN
    v_app := public.create_application_draft('Rollback renewal',v_data,NULL);
    IF v_app.applicant_id <> v_uid OR v_app.status <> 'draft' THEN RAISE EXCEPTION 'wrong draft ownership/status'; END IF;
    RAISE EXCEPTION 'rollback positive' USING ERRCODE='Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
  FOREACH v_status IN ARRAY ARRAY['suspended','revoked','cancelled','inactive','pending'] LOOP
    UPDATE public.licenses SET status=v_status WHERE id=v_lic;
    v_denied := false;
    BEGIN PERFORM public.create_application_draft('Denied',v_data,NULL);
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'status % incorrectly allowed',v_status; END IF;
  END LOOP;
  UPDATE public.licenses SET status='expired' WHERE id=v_lic;
  v_denied := false;
  BEGIN PERFORM public.create_application_draft('Denied',v_data-'is_renewal',NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'null flag allowed'; END IF;
  v_denied := false;
  BEGIN PERFORM public.create_application_draft('Denied',v_data||jsonb_build_object('service_id',v_other),NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'nonrenewal service allowed'; END IF;
  v_denied := false;
  BEGIN PERFORM public.create_application_draft('Denied',v_data||jsonb_build_object('licensee_id',gen_random_uuid()),NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'cross entity allowed'; END IF;
END $test$;
ROLLBACK;