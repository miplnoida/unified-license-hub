CREATE OR REPLACE FUNCTION public.cert_v2_seed_entities(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  e record;
  v_party uuid; v_entity uuid; v_license uuid;
  v_sector uuid; v_sub uuid; v_cat uuid;
  v_lifecycle uuid; v_identity uuid;
  v_regulator uuid; v_country uuid;
  v_ren uuid; v_crn uuid;
  v_sup uuid; v_officer uuid;
  v_group uuid; v_parent_member uuid; v_member uuid;
  v_entities int := 0; v_licenses int := 0; v_ids int := 0; v_appts int := 0; v_access int := 0;
  v_person_party uuid; v_role uuid;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  SELECT id INTO v_regulator FROM public.regulators WHERE name = 'ABC Prudential Authority';
  SELECT id INTO v_country   FROM public.countries  WHERE name = 'Saint Kitts and Nevis';
  SELECT id INTO v_ren FROM public.entity_identifier_types WHERE key = 'regulatory_entity_number';
  SELECT id INTO v_crn FROM public.entity_identifier_types WHERE key = 'company_registration_number';
  SELECT id INTO v_sup FROM public.profiles WHERE email = 'prudential_supervisor@mishainfotech.com';
  SELECT id INTO v_officer FROM public.profiles WHERE email = 'prudential_analyst@mishainfotech.com';

  FOR e IN SELECT * FROM public.cert_v2_entity_spec() ORDER BY code LOOP
    v_party    := public.cert_v2_uuid('party:' || e.code);
    v_entity   := public.cert_v2_uuid('entity:' || e.code);
    v_license  := public.cert_v2_uuid('license:' || e.code);

    SELECT id INTO v_sector FROM public.sectors     WHERE name = e.sector_name;
    SELECT id INTO v_sub    FROM public.sub_sectors WHERE name = e.sector_name AND sector_id = v_sector;
    SELECT id INTO v_cat    FROM public.categories  WHERE name = e.sector_name AND sub_sector_id = v_sub;
    SELECT id INTO v_lifecycle FROM public.lifecycle_stages WHERE key = e.lifecycle_key AND domain = 'entity';
    SELECT id INTO v_identity  FROM public.entity_identity_statuses WHERE key = e.identity_key;

    INSERT INTO public.parties(id, party_kind, display_name)
    VALUES (v_party, 'ORGANIZATION', e.name)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

    INSERT INTO public.organizations(party_id, legal_name, display_name, legal_name_authority)
    VALUES (v_party, e.name, e.name, 'LOCAL_PROVISIONAL')
    ON CONFLICT (party_id) DO UPDATE SET legal_name = EXCLUDED.legal_name;

    INSERT INTO public.licensees(
      id, name, sector_id, sub_sector_id, category_id, status, systemic_importance,
      party_id, lifecycle_stage_id, identity_status_id,
      assigned_supervisor_id, regulator_officer_id, lead_regulator_id)
    VALUES (v_entity, e.name, v_sector, v_sub, v_cat, e.entity_status, e.systemic,
            v_party, v_lifecycle, v_identity,
            CASE WHEN e.licensed THEN v_sup END,
            CASE WHEN e.licensed THEN v_officer END,
            CASE WHEN e.licensed THEN v_sup END)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;
    v_entities := v_entities + 1;

    PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'party', v_party, e.code || ':party');
    PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'organization', v_party, e.code || ':org');
    PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'licensee', v_entity, e.code || ' ' || e.name);

    INSERT INTO public.entity_identifiers(
      id, entity_id, identifier_type_id, identifier_value, normalized_value, uniqueness_scope,
      regulator_id, is_primary, verification_status, effective_from, source_type, source_reference)
    VALUES (public.cert_v2_uuid('ident:ren:' || e.code), v_entity, v_ren,
            'REN-CV2-' || substr(e.code, 2), 'RENCV2' || substr(e.code, 2), 'REGULATOR',
            v_regulator, true,
            CASE WHEN e.identity_key = 'verified' THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
            DATE '2024-01-01', 'MANUAL', 'CERT-SUPTECH-V2')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.entity_identifiers(
      id, entity_id, identifier_type_id, identifier_value, normalized_value, uniqueness_scope,
      jurisdiction_id, is_primary, verification_status, effective_from, source_type, source_reference)
    VALUES (public.cert_v2_uuid('ident:crn:' || e.code), v_entity, v_crn,
            'CRN-CV2-' || substr(e.code, 2), 'CRNCV2' || substr(e.code, 2), 'JURISDICTION',
            v_country, false, 'UNVERIFIED', DATE '2024-01-01', 'MANUAL', 'CERT-SUPTECH-V2')
    ON CONFLICT (id) DO NOTHING;
    v_ids := v_ids + 2;

    PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'entity_identifier',
              public.cert_v2_uuid('ident:ren:' || e.code), e.code || ':REN');
    PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'entity_identifier',
              public.cert_v2_uuid('ident:crn:' || e.code), e.code || ':CRN');

    IF e.licensed THEN
      INSERT INTO public.licenses(
        id, holder_id, license_number, license_type, sector_id, sub_sector_id, category_id,
        status, issued_at, valid_from, valid_until, regulator_id, conditions)
      VALUES (v_license, v_entity, 'CV2-' || e.code, e.sector_name, v_sector, v_sub, v_cat,
              e.license_status,
              TIMESTAMPTZ '2024-01-01 00:00+00', TIMESTAMPTZ '2024-01-01 00:00+00',
              TIMESTAMPTZ '2027-12-31 00:00+00', v_regulator,
              'Certification dataset licence [CERTIFICATION]')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
      v_licenses := v_licenses + 1;

      UPDATE public.licensees SET license_id = v_license WHERE id = v_entity;
      PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'license', v_license, 'CV2-' || e.code);
    END IF;

    IF e.licensed THEN
      FOR v_role IN SELECT id FROM public.role_types
                     WHERE key IN ('chief_executive_officer','compliance_officer') LOOP
        v_person_party := public.cert_v2_uuid('person:' || e.code || ':' || v_role::text);
        INSERT INTO public.parties(id, party_kind, display_name)
        VALUES (v_person_party, 'PERSON',
                (SELECT label FROM public.role_types WHERE id = v_role) || ' — ' || e.name)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.entity_appointments(
          id, entity_id, person_party_id, role_type_id, appointment_date,
          effective_from, is_executive, status, regulatory_approval_status)
        VALUES (public.cert_v2_uuid('appt:' || e.code || ':' || v_role::text),
                v_entity, v_person_party, v_role, DATE '2024-01-15',
                TIMESTAMPTZ '2024-01-15 00:00+00', true, 'ACTIVE', 'APPROVED')
        ON CONFLICT (id) DO NOTHING;
        v_appts := v_appts + 1;

        PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'person_party', v_person_party, e.code);
        PERFORM public.cert_v2_register_object(_run_id, e.scenario, 'entity_appointment',
                  public.cert_v2_uuid('appt:' || e.code || ':' || v_role::text), e.code);
      END LOOP;
    END IF;
  END LOOP;

  FOR e IN
    SELECT * FROM (VALUES
      ('E01','licensee_primary_user@mishainfotech.com','primary_user'),
      ('E01','licensee_secondary_user@mishainfotech.com','secondary_contact'),
      ('E10','entity_ppoc@mishainfotech.com','primary_user'),
      ('E19','entity_ppoc@mishainfotech.com','secondary_contact'),
      ('E05','applicant_user@mishainfotech.com','primary_user'),
      ('E05','pre_licensee_user@mishainfotech.com','secondary_contact')
    ) AS t(code, email, access_type)
  LOOP
    SELECT id INTO v_party FROM public.profiles WHERE email = e.email;
    CONTINUE WHEN v_party IS NULL;
    v_entity := public.cert_v2_uuid('entity:' || e.code);
    INSERT INTO public.entity_user_access(id, user_id, entity_id, access_type, is_active, start_date)
    VALUES (public.cert_v2_uuid('eua:' || e.code || ':' || e.email), v_party, v_entity,
            e.access_type::public.entity_access_type, true, TIMESTAMPTZ '2024-02-01 00:00+00')
    ON CONFLICT (id) DO NOTHING;
    v_access := v_access + 1;
    PERFORM public.cert_v2_register_object(_run_id, 'ENTITY_USERS', 'entity_user_access',
              public.cert_v2_uuid('eua:' || e.code || ':' || e.email), e.code || ' ' || e.email);
  END LOOP;

  v_group := public.cert_v2_uuid('group:VERCHILDS');
  SELECT id INTO v_sector FROM public.sectors WHERE name = 'Financial Holding Company';
  INSERT INTO public.financial_groups(id, group_code, name, holding_entity_id, sector_id,
                                      supervisory_lead_id, status, notes)
  VALUES (v_group, 'CV2-VERCHILDS', 'Verchilds Financial Group [CERTIFICATION]',
          public.cert_v2_uuid('entity:E18'), v_sector, v_sup, 'active',
          'Certification dataset consolidated group')
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.cert_v2_register_object(_run_id, 'GROUP_PARENT', 'financial_group', v_group, 'CV2-VERCHILDS');

  v_parent_member := public.cert_v2_uuid('gmember:E18');
  INSERT INTO public.financial_group_members(id, group_id, licensee_id, member_role,
                                             ownership_percentage, consolidation_treatment, effective_date)
  VALUES (v_parent_member, v_group, public.cert_v2_uuid('entity:E18'), 'ultimate_holding', 100, 'full', DATE '2024-01-01')
  ON CONFLICT (id) DO NOTHING;

  v_member := public.cert_v2_uuid('gmember:E19');
  INSERT INTO public.financial_group_members(id, group_id, licensee_id, parent_member_id, member_role,
                                             ownership_percentage, consolidation_treatment, effective_date)
  VALUES (v_member, v_group, public.cert_v2_uuid('entity:E19'), v_parent_member, 'subsidiary', 80, 'full', DATE '2024-01-01')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.cert_v2_register_object(_run_id, 'GROUP_PARENT', 'financial_group_member', v_parent_member, 'E18');
  PERFORM public.cert_v2_register_object(_run_id, 'GROUP_SUBSIDIARY', 'financial_group_member', v_member, 'E19');

  INSERT INTO public.entity_merges(id, survivor_entity_id, absorbed_entity_id, status, reason,
                                   requested_by, requested_at, approved_by, approved_at, completed_at)
  VALUES (public.cert_v2_uuid('merge:E11->E13'),
          public.cert_v2_uuid('entity:E13'), public.cert_v2_uuid('entity:E11'),
          'COMPLETED', 'Absorbed by Cayon Commercial Bank Limited [CERTIFICATION]',
          (SELECT id FROM public.profiles WHERE email = 'entity_resolution_officer@mishainfotech.com'),
          TIMESTAMPTZ '2025-06-01 00:00+00',
          (SELECT id FROM public.profiles WHERE email = 'entity_resolution_supervisor@mishainfotech.com'),
          TIMESTAMPTZ '2025-06-05 00:00+00', TIMESTAMPTZ '2025-06-05 00:00+00')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.licensees
     SET merged_into_entity_id = public.cert_v2_uuid('entity:E13')
   WHERE id = public.cert_v2_uuid('entity:E11');

  PERFORM public.cert_v2_register_object(_run_id, 'MERGED_ABSORBED', 'entity_merge',
            public.cert_v2_uuid('merge:E11->E13'), 'E11 -> E13');

  RETURN jsonb_build_object(
    'entities', v_entities, 'licenses', v_licenses, 'identifiers', v_ids,
    'appointments', v_appts, 'entity_users', v_access);
END $$;

REVOKE ALL ON FUNCTION public.cert_v2_seed_entities(uuid) FROM PUBLIC, anon, authenticated;