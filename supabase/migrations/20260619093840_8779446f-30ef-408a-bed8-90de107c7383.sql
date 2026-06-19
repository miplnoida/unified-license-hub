CREATE OR REPLACE FUNCTION public.provision_application_entity(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_app_data jsonb;
  v_license record;
  v_licensee_id uuid;
  v_entity_name text;
  v_paid boolean;
  v_cfg jsonb;
  v_period_days int;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'code','AWAITING_APPROVAL','http',200,
                              'application_id', _application_id);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payments
     WHERE application_id = _application_id
       AND status IN ('success','completed','paid','verified')
  ) INTO v_paid;

  IF NOT v_paid THEN
    RETURN jsonb_build_object('success', false, 'code','AWAITING_PAYMENT','http',200,
                              'application_id', _application_id);
  END IF;

  v_app_data := COALESCE(v_app.data, '{}'::jsonb);

  -- Resolve configured license validity period (global site setting, fallback 365 days)
  v_cfg := COALESCE(
    (SELECT value FROM public.site_settings WHERE key = 'license_expiry'),
    '{}'::jsonb);
  v_period_days := GREATEST(1, COALESCE(NULLIF(v_cfg->>'period_days','')::int, 365));
  v_valid_from := now();
  v_valid_until := v_valid_from + make_interval(days => v_period_days);

  -- License (idempotent)
  SELECT id, license_number, valid_from, valid_until INTO v_license
    FROM public.licenses WHERE application_id = _application_id LIMIT 1;
  IF v_license.id IS NULL THEN
    INSERT INTO public.licenses (application_id, holder_id, license_type, regulator_id,
      sector_id, sub_sector_id, category_id, valid_from, valid_until)
    VALUES (_application_id, v_app.applicant_id, v_app.license_type, v_app.regulator_id,
      NULLIF(v_app_data->>'sector_id','')::uuid,
      NULLIF(v_app_data->>'sub_sector_id','')::uuid,
      NULLIF(v_app_data->>'category_id','')::uuid,
      v_valid_from, v_valid_until)
    RETURNING id, license_number, valid_from, valid_until INTO v_license;
  END IF;

  -- Licensee / Entity (idempotent)
  SELECT id INTO v_licensee_id
    FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
  IF v_licensee_id IS NULL THEN
    v_entity_name := COALESCE(NULLIF(v_app_data->>'entity_name',''),
                              NULLIF(v_app_data->>'applicant_name',''),
                              v_app.license_type);
    INSERT INTO public.licensees (name, license_id, sector_id, sub_sector_id, category_id, status)
    VALUES (v_entity_name, v_license.id,
      NULLIF(v_app_data->>'sector_id','')::uuid,
      NULLIF(v_app_data->>'sub_sector_id','')::uuid,
      NULLIF(v_app_data->>'category_id','')::uuid, 'active')
    RETURNING id INTO v_licensee_id;
  END IF;

  PERFORM public.create_audit_log(v_app.applicant_id, 'entity_provisioned', 'licensee',
    v_licensee_id::text, NULL,
    jsonb_build_object('license_id',v_license.id,'license_number',v_license.license_number,
                       'application_id',_application_id,
                       'valid_from',v_license.valid_from,
                       'valid_until',v_license.valid_until), NULL);

  RETURN jsonb_build_object('success', true, 'http', 200,
    'application_id', _application_id,
    'license_id', v_license.id,
    'license_number', v_license.license_number,
    'valid_from', v_license.valid_from,
    'valid_until', v_license.valid_until,
    'licensee_id', v_licensee_id,
    'applicant_id', v_app.applicant_id);
END;
$function$;