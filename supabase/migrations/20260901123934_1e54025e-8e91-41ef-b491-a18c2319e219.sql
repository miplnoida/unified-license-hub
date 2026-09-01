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
  v_is_renewal boolean;
  v_renewal_license_id uuid;
  v_existing_license record;
  v_prev_valid_until timestamptz;
  v_new_valid_until timestamptz;
  v_computed_text text;
  v_rule jsonb;
  v_best_rule jsonb;
  v_best_score int;
  v_score int;
  v_lic_sector uuid;
  v_lic_sub uuid;
  v_lic_cat uuid;
  v_policy jsonb;
  v_marker_license_id uuid;
  v_entity_id uuid;
  v_party_id uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, data, entity_id
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

  v_is_renewal := (v_app_data->>'is_renewal') = 'true'
              AND NULLIF(v_app_data->>'renewal_of_license_id','') IS NOT NULL;

  IF v_is_renewal THEN
    BEGIN
      v_renewal_license_id := (v_app_data->>'renewal_of_license_id')::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('error','Invalid renewal_of_license_id','code','RENEWAL_LICENSE_INVALID','http',409);
    END;

    IF v_app_data ? 'renewal_processed_at' THEN
      v_marker_license_id := COALESCE(
        NULLIF(v_app_data->>'renewed_license_id','')::uuid,
        v_renewal_license_id);
      SELECT id, license_number, valid_from, valid_until,
             sector_id, sub_sector_id, category_id
        INTO v_license
        FROM public.licenses WHERE id = v_marker_license_id;
      IF FOUND THEN
        v_licensee_id := public.entity_for_license(v_license.id, _application_id);
        RETURN jsonb_build_object('success', true, 'http', 200,
          'renewal', true,
          'idempotent', true,
          'application_id', _application_id,
          'license_id', v_license.id,
          'license_number', v_license.license_number,
          'valid_from', v_license.valid_from,
          'valid_until', v_license.valid_until,
          'new_valid_until', v_license.valid_until,
          'licensee_id', v_licensee_id,
          'applicant_id', v_app.applicant_id);
      END IF;
    END IF;

    SELECT id, license_number, valid_from, valid_until, status,
           sector_id, sub_sector_id, category_id
      INTO v_existing_license
      FROM public.licenses
     WHERE id = v_renewal_license_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error','Original license not found','code','RENEWAL_LICENSE_NOT_FOUND','http',404);
    END IF;

    v_prev_valid_until := v_existing_license.valid_until;

    v_computed_text := NULLIF(v_app_data->>'computed_new_valid_until','');
    v_new_valid_until := NULL;
    IF v_computed_text IS NOT NULL THEN
      BEGIN
        v_new_valid_until := v_computed_text::timestamptz;
        IF v_new_valid_until <= now() THEN
          v_new_valid_until := NULL;
        END IF;
      EXCEPTION WHEN others THEN
        v_new_valid_until := NULL;
      END;
    END IF;

    IF v_new_valid_until IS NULL THEN
      v_cfg := COALESCE(
        (SELECT value FROM public.site_settings WHERE key = 'license_expiry'),
        '{}'::jsonb);

      v_lic_sector := v_existing_license.sector_id;
      v_lic_sub := v_existing_license.sub_sector_id;
      v_lic_cat := v_existing_license.category_id;

      v_best_rule := NULL;
      v_best_score := -1;
      IF jsonb_typeof(v_cfg->'rules') = 'array' THEN
        FOR v_rule IN SELECT * FROM jsonb_array_elements(v_cfg->'rules') LOOP
          IF NULLIF(v_rule->>'sector_id','') IS NOT NULL
             AND (v_lic_sector IS NULL OR (v_rule->>'sector_id')::uuid <> v_lic_sector) THEN
            CONTINUE;
          END IF;
          IF NULLIF(v_rule->>'sub_sector_id','') IS NOT NULL
             AND (v_lic_sub IS NULL OR (v_rule->>'sub_sector_id')::uuid <> v_lic_sub) THEN
            CONTINUE;
          END IF;
          IF NULLIF(v_rule->>'category_id','') IS NOT NULL
             AND (v_lic_cat IS NULL OR (v_rule->>'category_id')::uuid <> v_lic_cat) THEN
            CONTINUE;
          END IF;
          v_score :=
            (CASE WHEN NULLIF(v_rule->>'category_id','') IS NOT NULL THEN 4 ELSE 0 END)
          + (CASE WHEN NULLIF(v_rule->>'sub_sector_id','') IS NOT NULL THEN 2 ELSE 0 END)
          + (CASE WHEN NULLIF(v_rule->>'sector_id','') IS NOT NULL THEN 1 ELSE 0 END);
          IF v_score > v_best_score THEN
            v_best_score := v_score;
            v_best_rule := v_rule;
          END IF;
        END LOOP;
      END IF;

      v_policy := COALESCE(v_best_rule, v_cfg->'default', v_cfg);
      v_period_days := GREATEST(1, COALESCE(NULLIF(v_policy->>'period_days','')::int, 365));

      v_new_valid_until := GREATEST(COALESCE(v_existing_license.valid_until, now()), now())
                            + make_interval(days => v_period_days);
    END IF;

    UPDATE public.licenses
       SET valid_until = v_new_valid_until,
           status = 'active',
           updated_at = now()
     WHERE id = v_existing_license.id
     RETURNING id, license_number, valid_from, valid_until,
               sector_id, sub_sector_id, category_id
      INTO v_license;

    v_licensee_id := public.entity_for_license(v_license.id, _application_id);

    IF v_licensee_id IS NOT NULL THEN
      UPDATE public.licensees
         SET sector_id     = COALESCE(sector_id,     v_license.sector_id,
                                       NULLIF(v_app_data->>'sector_id','')::uuid),
             sub_sector_id = COALESCE(sub_sector_id, v_license.sub_sector_id,
                                       NULLIF(v_app_data->>'sub_sector_id','')::uuid),
             category_id   = COALESCE(category_id,   v_license.category_id,
                                       NULLIF(v_app_data->>'category_id','')::uuid),
             updated_at    = now()
       WHERE id = v_licensee_id
         AND (sector_id IS NULL OR sub_sector_id IS NULL OR category_id IS NULL);
    END IF;

    PERFORM public.entity_link_license(v_licensee_id, v_license.id, _application_id);

    UPDATE public.applications
       SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
             'renewal_processed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'renewed_license_id', v_license.id::text,
             'renewed_valid_until', to_char(v_license.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
           ),
           updated_at = now()
     WHERE id = _application_id;

    PERFORM public.create_audit_log(v_app.applicant_id, 'license_renewed', 'license',
      v_license.id::text, NULL,
      jsonb_build_object(
        'application_id', _application_id,
        'license_id', v_license.id,
        'license_number', v_license.license_number,
        'previous_valid_until', v_prev_valid_until,
        'new_valid_until', v_license.valid_until,
        'licensee_id', v_licensee_id
      ), NULL);

    RETURN jsonb_build_object('success', true, 'http', 200,
      'renewal', true,
      'application_id', _application_id,
      'license_id', v_license.id,
      'license_number', v_license.license_number,
      'valid_from', v_license.valid_from,
      'valid_until', v_license.valid_until,
      'new_valid_until', v_license.valid_until,
      'previous_valid_until', v_prev_valid_until,
      'licensee_id', v_licensee_id,
      'applicant_id', v_app.applicant_id);
  END IF;

  -- Non-renewal path
  v_cfg := COALESCE(
    (SELECT value FROM public.site_settings WHERE key = 'license_expiry'),
    '{}'::jsonb);
  v_period_days := GREATEST(1, COALESCE(NULLIF(v_cfg->>'period_days','')::int, 365));
  v_valid_from := now();
  v_valid_until := v_valid_from + make_interval(days => v_period_days);

  SELECT id, license_number, valid_from, valid_until,
         sector_id, sub_sector_id, category_id
    INTO v_license
    FROM public.licenses WHERE application_id = _application_id LIMIT 1;
  IF v_license.id IS NULL THEN
    INSERT INTO public.licenses (application_id, holder_id, license_type, regulator_id,
      sector_id, sub_sector_id, category_id, valid_from, valid_until)
    VALUES (_application_id, v_app.applicant_id, v_app.license_type, v_app.regulator_id,
      NULLIF(v_app_data->>'sector_id','')::uuid,
      NULLIF(v_app_data->>'sub_sector_id','')::uuid,
      NULLIF(v_app_data->>'category_id','')::uuid,
      v_valid_from, v_valid_until)
    RETURNING id, license_number, valid_from, valid_until,
              sector_id, sub_sector_id, category_id INTO v_license;
  END IF;

  -- Entity-first issuance: the canonical entity is resolved (or created once)
  -- BEFORE the licence is linked. A licence is never the entity's identity.
  v_licensee_id := public.entity_for_license(v_license.id, _application_id);

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
      NULLIF(v_plu.entity_name,''),
      NULLIF(v_plu.full_name,''),
      NULLIF(v_prof.entity_name,''),
      NULLIF(v_prof.full_name,''),
      NULLIF(v_reg.applicant_name,''),
      'Unnamed Licensee'
    );

    -- 1. Application already bound to a canonical entity -> always reuse it.
    v_entity_id := v_app.entity_id;

    -- 2. Deterministic reuse on exact normalized legal name (EXACT_MATCH never
    --    creates a duplicate). Same-applicant rows win the tie-break.
    IF v_entity_id IS NULL THEN
      SELECT l.id INTO v_entity_id
        FROM public.licensees l
        LEFT JOIN public.organizations o ON o.party_id = l.party_id
       WHERE l.merged_into_entity_id IS NULL
         AND upper(regexp_replace(COALESCE(o.legal_name, l.name), '[^A-Za-z0-9]', '', 'g'))
             = upper(regexp_replace(v_entity_name, '[^A-Za-z0-9]', '', 'g'))
       ORDER BY (l.applicant_id = v_app.applicant_id) DESC, l.created_at
       LIMIT 1;
    END IF;

    WHILE v_entity_id IS NOT NULL
      AND (SELECT merged_into_entity_id FROM public.licensees WHERE id = v_entity_id) IS NOT NULL LOOP
      SELECT merged_into_entity_id INTO v_entity_id FROM public.licensees WHERE id = v_entity_id;
    END LOOP;

    IF v_entity_id IS NULL THEN
      INSERT INTO public.parties (party_kind, display_name)
      VALUES ('ORGANIZATION', v_entity_name)
      RETURNING id INTO v_party_id;

      -- The parties projection trigger already creates a provisional
      -- organizations row; promote it instead of inserting a duplicate.
      INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
      VALUES (v_party_id, v_entity_name, v_entity_name, 'LOCAL_VERIFIED')
      ON CONFLICT (party_id) DO UPDATE
        SET legal_name = EXCLUDED.legal_name,
            display_name = EXCLUDED.display_name,
            legal_name_authority = EXCLUDED.legal_name_authority;

      INSERT INTO public.licensees (
        license_id, name, applicant_id,
        sector_id, sub_sector_id, category_id,
        party_id, lifecycle_stage_id, identity_status_id
      )
      VALUES (
        v_license.id, v_entity_name, v_app.applicant_id,
        COALESCE(v_license.sector_id,     NULLIF(v_app_data->>'sector_id','')::uuid),
        COALESCE(v_license.sub_sector_id, NULLIF(v_app_data->>'sub_sector_id','')::uuid),
        COALESCE(v_license.category_id,   NULLIF(v_app_data->>'category_id','')::uuid),
        v_party_id,
        (SELECT id FROM public.lifecycle_stages WHERE key = 'authorised' AND domain = 'entity'),
        (SELECT id FROM public.entity_identity_statuses WHERE key = 'verified')
      )
      RETURNING id INTO v_licensee_id;
      v_entity_id := v_licensee_id;
    ELSE
      v_licensee_id := v_entity_id;
      UPDATE public.licensees
         SET license_id    = COALESCE(license_id, v_license.id),
             applicant_id  = COALESCE(applicant_id, v_app.applicant_id),
             sector_id     = COALESCE(sector_id,     v_license.sector_id,
                                       NULLIF(v_app_data->>'sector_id','')::uuid),
             sub_sector_id = COALESCE(sub_sector_id, v_license.sub_sector_id,
                                       NULLIF(v_app_data->>'sub_sector_id','')::uuid),
             category_id   = COALESCE(category_id,   v_license.category_id,
                                       NULLIF(v_app_data->>'category_id','')::uuid),
             lifecycle_stage_id = COALESCE(lifecycle_stage_id,
                                       (SELECT id FROM public.lifecycle_stages WHERE key = 'authorised' AND domain = 'entity')),
             identity_status_id = COALESCE(identity_status_id,
                                       (SELECT id FROM public.entity_identity_statuses WHERE key = 'verified')),
             updated_at    = now()
       WHERE id = v_licensee_id;
    END IF;
  ELSE
    v_entity_id := v_licensee_id;
    UPDATE public.licensees
       SET sector_id     = COALESCE(sector_id,     v_license.sector_id,
                                     NULLIF(v_app_data->>'sector_id','')::uuid),
           sub_sector_id = COALESCE(sub_sector_id, v_license.sub_sector_id,
                                     NULLIF(v_app_data->>'sub_sector_id','')::uuid),
           category_id   = COALESCE(category_id,   v_license.category_id,
                                     NULLIF(v_app_data->>'category_id','')::uuid),
           updated_at    = now()
     WHERE id = v_licensee_id
       AND (sector_id IS NULL OR sub_sector_id IS NULL OR category_id IS NULL);
  END IF;

  PERFORM public.entity_link_license(v_entity_id, v_license.id, _application_id);

  PERFORM public.create_audit_log(v_app.applicant_id, 'entity_provisioned', 'license',
    v_license.id::text, NULL,
    jsonb_build_object(
      'application_id', _application_id,
      'license_number', v_license.license_number,
      'licensee_id', v_licensee_id
    ), NULL);

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