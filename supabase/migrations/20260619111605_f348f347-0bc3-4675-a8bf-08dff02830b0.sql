
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
  v_reg record;
  v_plu record;
  v_prof record;
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

  v_cfg := COALESCE(
    (SELECT value FROM public.site_settings WHERE key = 'license_expiry'),
    '{}'::jsonb);
  v_period_days := GREATEST(1, COALESCE(NULLIF(v_cfg->>'period_days','')::int, 365));
  v_valid_from := now();
  v_valid_until := v_valid_from + make_interval(days => v_period_days);

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

  SELECT id INTO v_licensee_id
    FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
  IF v_licensee_id IS NULL THEN
    SELECT applicant_name INTO v_reg
      FROM public.registrations WHERE user_id = v_app.applicant_id
      ORDER BY created_at DESC LIMIT 1;
    SELECT entity_name, full_name INTO v_plu
      FROM public.pre_license_users WHERE id = v_app.applicant_id LIMIT 1;
    SELECT entity_name, full_name INTO v_prof
      FROM public.profiles WHERE id = v_app.applicant_id LIMIT 1;

    v_entity_name := COALESCE(
      NULLIF(v_app_data->>'entity_name',''),
      NULLIF(v_app_data->>'applicant_name',''),
      NULLIF(v_app_data->>'organization_name',''),
      NULLIF(v_app_data->>'company_name',''),
      NULLIF(v_app_data->>'business_name',''),
      NULLIF(v_reg.applicant_name,''),
      NULLIF(v_plu.entity_name,''),
      NULLIF(v_plu.full_name,''),
      NULLIF(v_prof.entity_name,''),
      NULLIF(v_prof.full_name,''),
      v_app.license_type
    );
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

-- Backfill licensees whose name fell through to the license_type string
UPDATE public.licensees lic
SET name = COALESCE(
    NULLIF(a.data->>'entity_name',''),
    NULLIF(a.data->>'applicant_name',''),
    NULLIF(a.data->>'organization_name',''),
    NULLIF(a.data->>'company_name',''),
    NULLIF(a.data->>'business_name',''),
    NULLIF(r.applicant_name,''),
    NULLIF(plu.entity_name,''),
    NULLIF(plu.full_name,''),
    NULLIF(p.entity_name,''),
    NULLIF(p.full_name,''),
    lic.name
)
FROM public.licenses l
JOIN public.applications a ON a.id = l.application_id
LEFT JOIN LATERAL (
  SELECT applicant_name FROM public.registrations
   WHERE user_id = a.applicant_id ORDER BY created_at DESC LIMIT 1
) r ON true
LEFT JOIN public.pre_license_users plu ON plu.id = a.applicant_id
LEFT JOIN public.profiles p ON p.id = a.applicant_id
WHERE lic.license_id = l.id
  AND lic.name = a.license_type;
