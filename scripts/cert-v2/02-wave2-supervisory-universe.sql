-- ============================================================================
-- Certification V2 — Wave 2: Supervisory Universe (CERT-SUPTECH-V2)
--
-- Deterministic, reproducible seed of the supervisory data universe that
-- Wave 3 will use to execute role-based workflows end to end.
--
-- Design rules:
--   * Every identifier is derived from a stable business key (cert_v2_uuid),
--     so re-seeding after cert_v2_reset() reproduces byte-identical IDs.
--   * Every seeded root business object is registered in the fixture ledger
--     (cert_fixture_objects) so cert_v2_reset() can remove it again. Derived
--     children (reporting periods, metric values, breaches, detection runs)
--     are reached through the FK-aware cascade deleter.
--   * Configuration rows created for certification purposes are registered
--     with cleanup_policy = 'retain_config' and labelled [CERTIFICATION].
--   * No product/business logic is duplicated here: ratios, threshold
--     evaluation and early-warning detection are produced by the SERVER
--     functions (returns_calculate_metrics, _prudential_canonical_detect_run).
--     The seed only writes REPORTED inputs.
--   * All functions are SECURITY DEFINER, fail closed through
--     cert_v2_assert_allowed(), and are executable by service_role only.
-- ============================================================================

-- --------------------------------------------------------------- deterministic ids
CREATE OR REPLACE FUNCTION public.cert_v2_uuid(_key text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    substr(md5('CERT-SUPTECH-V2:' || _key), 1, 8) || '-' ||
    substr(md5('CERT-SUPTECH-V2:' || _key), 9, 4) || '-4' ||
    substr(md5('CERT-SUPTECH-V2:' || _key), 14, 3) || '-a' ||
    substr(md5('CERT-SUPTECH-V2:' || _key), 18, 3) || '-' ||
    substr(md5('CERT-SUPTECH-V2:' || _key), 21, 12)
  )::uuid;
$$;

-- ------------------------------------------------------------------ entity spec
-- The complete supervisory universe, one row per entity.
CREATE OR REPLACE FUNCTION public.cert_v2_entity_spec()
RETURNS TABLE(
  code text, name text, sector_name text, scenario text, ret_kind text,
  periods integer, size_factor numeric, licensed boolean, license_status text,
  lifecycle_key text, identity_key text, systemic text, entity_status text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
   ('E01','Meridian Commercial Bank Limited','Commercial Bank','HEALTHY','BANK',8,2.0,true,'active','authorised','verified','high','active'),
   ('E02','Coral Harbour Bank Limited','Commercial Bank','LIQUIDITY_STRESS','BANK',8,1.2,true,'active','authorised','verified','medium','active'),
   ('E03','Windward Trust Bank Limited','Commercial Bank','CAPITAL_WEAKNESS','BANK',8,0.9,true,'active','authorised','verified','medium','active'),
   ('E04','Basseterre Building Society','Building Society','LATE_FILER','BANK',8,0.6,true,'active','authorised','verified','low','active'),
   ('E05','Frigate Bay Capital Partners Limited','Securities Dealer','NEW_APPLICANT','NONE',0,0.3,false,NULL,'applicant','unverified','low','prospect'),
   ('E06','Sandy Point Merchant Bank Limited','Merchant Bank','LICENCE_LIFECYCLE','BANK',4,0.7,true,'active','authorised','verified','low','active'),
   ('E07','Palmetto Consumer Finance Limited','Micro-credit Institution','CONDUCT_RISK','BANK',4,0.35,true,'active','authorised','verified','low','active'),
   ('E08','Nevis Peak Insurance Company Limited','General Insurance','EXAMINATION','INS',4,0.8,true,'active','authorised','verified','medium','active'),
   ('E09','Charlestown Life Assurance Limited','Life Insurance','FP_CASES','INS',4,0.9,true,'active','authorised','verified','medium','active'),
   ('E10','Brimstone Payments Limited','Payment Service Provider','MULTI_ENTITY_USER','MSB',6,0.4,true,'active','authorised','verified','low','active'),
   ('E11','Old Road Savings and Loan Limited','Building Society','MERGED_ABSORBED','BANK',4,0.3,true,'revoked','closed','merged','low','inactive'),
   ('E12','Dieppe Bay Micro Finance Limited','Micro-credit Institution','SURRENDERED','BANK',4,0.25,true,'surrendered','former_licensee','verified','low','inactive'),
   ('E13','Cayon Commercial Bank Limited','Commercial Bank','BOUNDARY_PASS','BANK',4,1.0,true,'active','authorised','verified','medium','active'),
   ('E14','Tabernacle Commercial Bank Limited','Commercial Bank','BOUNDARY_WARN','BANK',4,1.0,true,'active','authorised','verified','medium','active'),
   ('E15','Saddlers Commercial Bank Limited','Commercial Bank','ZERO_DENOMINATOR','BANK',4,0.8,true,'active','authorised','verified','low','active'),
   ('E16','Molineux Building Society','Building Society','MISSING_INPUT','BANK',4,0.5,true,'active','authorised','verified','low','active'),
   ('E17','Conaree General Insurance Limited','General Insurance','PEER_STANDARD','INS',4,0.6,true,'active','authorised','verified','low','active'),
   ('E18','Verchilds Financial Holdings Limited','Financial Holding Company','GROUP_PARENT','NONE',0,2.5,true,'active','authorised','verified','high','active'),
   ('E19','Verchilds Securities Limited','Securities Dealer','GROUP_SUBSIDIARY','BANK',4,0.5,true,'active','authorised','verified','low','active'),
   ('E20','Half Way Tree Money Services Limited','Money Service Business','MSB_MONITORING','MSB',6,0.3,true,'active','authorised','verified','low','active')
  ) AS t(code,name,sector_name,scenario,ret_kind,periods,size_factor,licensed,license_status,
         lifecycle_key,identity_key,systemic,entity_status);
$$;

-- --------------------------------------------------------------- ratio series
-- Target ratios (oldest -> newest, 8 quarters). Reported inputs are derived
-- from these so the expected server-calculated ratio is exact.
CREATE OR REPLACE FUNCTION public.cert_v2_ratio_series(_scenario text, _key text)
RETURNS numeric[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _scenario
    WHEN 'HEALTHY' THEN CASE _key
      WHEN 'CAR' THEN ARRAY[16.4,16.3,16.2,16.1,16.0,15.9,15.8,15.7]
      WHEN 'NPL' THEN ARRAY[2.8,2.9,3.0,3.0,3.1,3.2,3.2,3.3]
      WHEN 'LIQ' THEN ARRAY[34.0,33.5,33.0,32.5,32.0,31.5,31.0,30.5]
      ELSE ARRAY[58.0,58.5,58.0,59.0,59.5,59.0,60.0,60.5] END
    WHEN 'LIQUIDITY_STRESS' THEN CASE _key
      WHEN 'CAR' THEN ARRAY[14.0,13.8,13.5,13.2,13.0,12.8,12.5,12.2]
      WHEN 'NPL' THEN ARRAY[4.0,4.2,4.5,4.8,5.2,5.5,5.8,6.0]
      WHEN 'LIQ' THEN ARRAY[30.0,27.0,24.0,21.0,18.0,16.0,14.5,13.0]
      ELSE ARRAY[62.0,64.0,66.0,68.0,70.0,72.0,74.0,76.0] END
    WHEN 'CAPITAL_WEAKNESS' THEN CASE _key
      WHEN 'CAR' THEN ARRAY[13.0,12.4,11.8,11.2,10.6,10.0,9.6,9.2]
      WHEN 'NPL' THEN ARRAY[6.0,7.0,8.0,9.0,10.5,11.0,12.0,13.0]
      WHEN 'LIQ' THEN ARRAY[25.0,24.0,23.0,22.0,21.0,20.0,19.0,18.0]
      ELSE ARRAY[70.0,72.0,74.0,76.0,78.0,80.0,82.0,84.0] END
    WHEN 'LATE_FILER' THEN CASE _key
      WHEN 'CAR' THEN ARRAY[15.0,15.0,14.9,14.8,14.7,14.6,14.5,14.4]
      WHEN 'NPL' THEN ARRAY[3.5,3.6,3.7,3.8,3.9,4.0,4.1,4.2]
      WHEN 'LIQ' THEN ARRAY[28.0,28.0,27.5,27.0,26.5,26.0,25.5,25.0]
      ELSE ARRAY[61.0,61.5,62.0,62.5,63.0,63.5,64.0,64.5] END
    WHEN 'BOUNDARY_PASS' THEN CASE _key
      WHEN 'CAR' THEN ARRAY[12.0,12.0,12.0,12.0,12.0,12.0,12.0,12.0]
      WHEN 'NPL' THEN ARRAY[5.0,5.0,5.0,5.0,5.0,5.0,5.0,5.0]
      WHEN 'LIQ' THEN ARRAY[20.0,20.0,20.0,20.0,20.0,20.0,20.0,20.0]
      ELSE ARRAY[65.0,65.0,65.0,65.0,65.0,65.0,65.0,65.0] END
    WHEN 'BOUNDARY_WARN' THEN CASE _key
      WHEN 'CAR' THEN ARRAY[11.9,11.9,11.9,11.9,11.9,11.9,11.9,11.9]
      WHEN 'NPL' THEN ARRAY[5.1,5.1,5.1,5.1,5.1,5.1,5.1,5.1]
      WHEN 'LIQ' THEN ARRAY[19.9,19.9,19.9,19.9,19.9,19.9,19.9,19.9]
      ELSE ARRAY[65.1,65.1,65.1,65.1,65.1,65.1,65.1,65.1] END
    ELSE CASE _key   -- STANDARD peer profile
      WHEN 'CAR' THEN ARRAY[15.5,15.5,15.4,15.4,15.3,15.3,15.2,15.2]
      WHEN 'NPL' THEN ARRAY[3.5,3.5,3.6,3.6,3.7,3.7,3.8,3.8]
      WHEN 'LIQ' THEN ARRAY[26.0,26.0,25.8,25.8,25.6,25.6,25.4,25.4]
      ELSE ARRAY[62.0,62.0,62.2,62.2,62.4,62.4,62.6,62.6] END
  END;
$$;

CREATE OR REPLACE FUNCTION public.cert_v2_loss_ratio_series(_code text)
RETURNS numeric[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _code
    WHEN 'E08' THEN ARRAY[62.0,66.0,70.0,74.0]
    WHEN 'E09' THEN ARRAY[58.0,59.0,60.0,61.0]
    ELSE ARRAY[64.0,65.0,66.0,67.0] END;
$$;

-- ------------------------------------------------------- reference / config seed
CREATE OR REPLACE FUNCTION public.cert_v2_seed_reference(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_th uuid; v_added int := 0;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  -- fixture object types required by Wave 2
  INSERT INTO public.cert_fixture_object_types(object_type, table_name, delete_order, description)
  VALUES
    ('entity_identifier','entity_identifiers',21,'Canonical entity identifiers'),
    ('entity_appointment','entity_appointments',22,'Board / control function appointments'),
    ('person_party','parties',23,'Natural person parties'),
    ('financial_group_member','financial_group_members',26,'Financial group membership'),
    ('financial_group','financial_groups',27,'Financial groups'),
    ('entity_merge','entity_merges',28,'Entity merge lineage'),
    ('document','documents',29,'Document metadata'),
    ('prudential_threshold','prudential_thresholds',200,'Certification threshold configuration')
  ON CONFLICT (object_type) DO NOTHING;

  -- Canonical thresholds required so the canonical detection engine can grade
  -- LIQUIDITY_RATIO and COST_INCOME_RATIO. Labelled [CERTIFICATION] and retained.
  FOR v_th IN
    SELECT public.cert_v2_uuid('threshold:LIQUIDITY_RATIO') UNION ALL
    SELECT public.cert_v2_uuid('threshold:COST_INCOME_RATIO')
  LOOP NULL; END LOOP;

  INSERT INTO public.prudential_thresholds
    (id, metric_key, label, comparator, warn_value, breach_value, unit, is_active, effective_from)
  VALUES
    (public.cert_v2_uuid('threshold:LIQUIDITY_RATIO'), 'LIQUIDITY_RATIO',
     'Liquidity Ratio (min 15%) [CERTIFICATION]', '>=', 20.0, 15.0, '%', true, DATE '2024-01-01'),
    (public.cert_v2_uuid('threshold:COST_INCOME_RATIO'), 'COST_INCOME_RATIO',
     'Cost to Income Ratio (max 75%) [CERTIFICATION]', '<=', 65.0, 75.0, '%', true, DATE '2024-01-01')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  PERFORM public.cert_v2_register_object(_run_id, 'CONFIG', 'prudential_threshold',
            public.cert_v2_uuid('threshold:LIQUIDITY_RATIO'), 'LIQUIDITY_RATIO', 'retain_config',
            jsonb_build_object('reason', 'canonical grading of liquidity ratio'));
  PERFORM public.cert_v2_register_object(_run_id, 'CONFIG', 'prudential_threshold',
            public.cert_v2_uuid('threshold:COST_INCOME_RATIO'), 'COST_INCOME_RATIO', 'retain_config',
            jsonb_build_object('reason', 'canonical grading of cost/income ratio'));

  RETURN jsonb_build_object('thresholds_added', v_added);
END $$;

-- ------------------------------------------------------------- metric helper
CREATE OR REPLACE FUNCTION public.cert_v2_put_metric(
  _version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_metric uuid;
BEGIN
  SELECT id INTO v_metric FROM public.regulatory_metrics WHERE code = _code AND is_active;
  IF v_metric IS NULL THEN
    RAISE EXCEPTION 'cert_v2: regulatory metric % not found', _code USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.return_metric_values
    (return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
     value_numeric, availability, source_kind, recorded_at)
  VALUES (_version_id, _entity_id, v_metric, _period_id, _value, 'AVAILABLE', 'REPORTED', now())
  ON CONFLICT (return_filing_version_id, regulatory_metric_id) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric,
        availability = 'AVAILABLE', source_kind = 'REPORTED';
END $$;

-- ------------------------------------------------------------- filing plan
-- One row per (entity, period). Declares which period is filed, which series
-- index the reported inputs come from, whether the filing was late, and the
-- terminal version status the scenario requires.
CREATE OR REPLACE FUNCTION public.cert_v2_filing_plan()
RETURNS TABLE(
  code text, scenario text, ret_kind text, size_factor numeric,
  seq integer, series_idx integer,
  period_start date, period_end date, period_label text,
  due_days integer, due_date date, submitted_at timestamptz,
  is_late boolean, outcome text)
LANGUAGE sql STABLE AS $$
  WITH spec AS (SELECT * FROM public.cert_v2_entity_spec() WHERE periods > 0),
  base AS (
    SELECT s.code, s.scenario, s.ret_kind, s.size_factor, s.periods, g.seq,
           (8 - s.periods + g.seq)::int AS series_idx,
           CASE WHEN s.ret_kind = 'MSB'
                THEN (date_trunc('month', DATE '2025-12-01' - ((s.periods - g.seq) * INTERVAL '1 month')))::date
                ELSE (date_trunc('quarter', DATE '2025-10-01' - ((s.periods - g.seq) * INTERVAL '3 months')))::date
           END AS period_start,
           CASE WHEN s.ret_kind = 'MSB' THEN 15
                WHEN s.ret_kind = 'INS' THEN 45
                ELSE 45 END AS due_days
      FROM spec s
      CROSS JOIN LATERAL generate_series(1, s.periods) AS g(seq)
  ), dated AS (
    SELECT b.*,
           CASE WHEN b.ret_kind = 'MSB'
                THEN (b.period_start + INTERVAL '1 month - 1 day')::date
                ELSE (b.period_start + INTERVAL '3 months - 1 day')::date
           END AS period_end
      FROM base b
  )
  SELECT d.code, d.scenario, d.ret_kind, d.size_factor, d.seq, d.series_idx,
         d.period_start, d.period_end,
         CASE WHEN d.ret_kind = 'MSB' THEN to_char(d.period_start, 'YYYY-MM')
              ELSE to_char(d.period_start, 'YYYY') || '-Q' || to_char(d.period_start, 'Q') END AS period_label,
         d.due_days,
         (d.period_end + d.due_days)::date AS due_date,
         CASE
           WHEN d.scenario = 'LATE_FILER' AND d.seq >= d.periods - 2
             THEN ((d.period_end + d.due_days)::date + 12)::timestamptz + TIME '10:15'
           ELSE ((d.period_end + d.due_days)::date - 6)::timestamptz + TIME '09:30'
         END AS submitted_at,
         (d.scenario = 'LATE_FILER' AND d.seq >= d.periods - 2) AS is_late,
         CASE
           -- newest period deliberately unfiled for the late/outstanding scenario
           WHEN d.scenario = 'LATE_FILER' AND d.seq = d.periods THEN 'MISSING'
           -- newest period left with the returns reviewer for real queue work
           WHEN d.seq = d.periods AND d.scenario IN ('LIQUIDITY_STRESS','CAPITAL_WEAKNESS','BOUNDARY_PASS')
             THEN 'SUBMITTED'
           ELSE 'ACCEPTED'
         END AS outcome
    FROM dated d;
$$;

-- --------------------------------------------------- reported inputs per filing
-- Derived from the target ratio series so the SERVER-calculated ratio equals the
-- target exactly (all denominators are powers of ten scaled by size_factor).
CREATE OR REPLACE FUNCTION public.cert_v2_reported_inputs(
  _code text, _scenario text, _ret_kind text, _size numeric, _series_idx int, _is_newest boolean)
RETURNS TABLE(metric_code text, value numeric)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  car numeric; npl numeric; liq numeric; ci numeric; lr numeric;
  rwa numeric; gl numeric; stl numeric; nii numeric; ta numeric; gwp numeric;
BEGIN
  IF _ret_kind = 'BANK' THEN
    car := (public.cert_v2_ratio_series(_scenario,'CAR'))[_series_idx];
    npl := (public.cert_v2_ratio_series(_scenario,'NPL'))[_series_idx];
    liq := (public.cert_v2_ratio_series(_scenario,'LIQ'))[_series_idx];
    ci  := (public.cert_v2_ratio_series(_scenario,'CI'))[_series_idx];
    rwa := 1000000000 * _size;
    gl  := rwa * 0.8;
    stl := rwa * 0.5;
    nii := rwa * 0.05;
    ta  := rwa * 1.25;

    -- ZERO_DENOMINATOR: newest period reports a zero loan book (NPL ratio -> ERROR)
    IF _scenario = 'ZERO_DENOMINATOR' AND _is_newest THEN gl := 0; END IF;

    RETURN QUERY
    SELECT * FROM (VALUES
      ('RWA', rwa),
      ('TOTAL_CAPITAL', rwa * car / 100),
      ('GROSS_LOANS', gl),
      ('NON_PERFORMING_LOANS', gl * npl / 100),
      ('SHORT_TERM_LIABILITIES', stl),
      ('LIQUID_ASSETS', stl * liq / 100),
      ('NET_INTEREST_INCOME', nii),
      ('OPERATING_EXPENSES', nii * ci / 100),
      ('TOTAL_ASSETS', ta),
      ('TOTAL_LIABILITIES', ta * 0.88),
      ('TOTAL_EQUITY', ta * 0.12),
      ('CUSTOMER_DEPOSITS', ta * 0.7),
      ('NET_PROFIT', nii * 0.25),
      ('STAFF_COUNT', round(120 * _size)),
      ('BRANCH_COUNT', greatest(1, round(6 * _size)))
    ) AS t(metric_code, value)
    -- MISSING_INPUT: newest period omits the liquidity denominator entirely
    WHERE NOT (_scenario = 'MISSING_INPUT' AND _is_newest
               AND t.metric_code IN ('SHORT_TERM_LIABILITIES','LIQUID_ASSETS'));

  ELSIF _ret_kind = 'INS' THEN
    lr  := (public.cert_v2_loss_ratio_series(_code))[greatest(1, _series_idx - 4)];
    gwp := 100000000 * _size;
    ta  := gwp * 3;
    RETURN QUERY SELECT * FROM (VALUES
      ('GROSS_WRITTEN_PREMIUM', gwp),
      ('CLAIMS_INCURRED', gwp * lr / 100),
      ('TECHNICAL_PROVISIONS', gwp * 1.5),
      ('TOTAL_ASSETS', ta),
      ('TOTAL_LIABILITIES', ta * 0.75),
      ('TOTAL_EQUITY', ta * 0.25),
      ('NET_PROFIT', gwp * 0.06),
      ('STAFF_COUNT', round(80 * _size)),
      ('BRANCH_COUNT', greatest(1, round(3 * _size)))
    ) AS t(metric_code, value);

  ELSE -- MSB / payments monthly transaction monitoring
    ta := 100000000 * _size;
    RETURN QUERY SELECT * FROM (VALUES
      ('TRANSACTION_COUNT', round(50000 * _size) + (_series_idx * 250)),
      ('TRANSACTION_VALUE', ta * (1 + _series_idx::numeric / 100)),
      ('TOTAL_ASSETS', ta),
      ('TOTAL_LIABILITIES', ta * 0.6),
      ('TOTAL_EQUITY', ta * 0.4),
      ('NET_PROFIT', ta * 0.02),
      ('STAFF_COUNT', round(40 * _size)),
      ('BRANCH_COUNT', greatest(1, round(4 * _size)))
    ) AS t(metric_code, value);
  END IF;
END $$;

-- ================================================================ entity seed
-- Parties, organizations, entities, identifiers, licences, entity users,
-- appointments, group structure and merge lineage.
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

    -- party + organization (canonical legal person)
    INSERT INTO public.parties(id, party_kind, display_name)
    VALUES (v_party, 'ORGANIZATION', e.name)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

    INSERT INTO public.organizations(party_id, legal_name, display_name, legal_name_authority)
    VALUES (v_party, e.name, e.name, 'LOCAL_PROVISIONAL')
    ON CONFLICT (party_id) DO UPDATE SET legal_name = EXCLUDED.legal_name;

    -- entity
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

    -- identifiers
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

    -- licence
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

    -- governance appointments (CEO + compliance officer) for licensed entities
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

  -- ------------------------------------------------------------ entity web users
  -- E01: primary + secondary. E10/E19: the same PPOC identity across two entities
  -- (MULTI_ENTITY_USER scenario).
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

  -- ------------------------------------------------------------ group structure
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

  -- ------------------------------------------------------------ merge lineage
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

-- ============================================================ returns universe
-- Obligations, reporting periods, filings, filing versions, REPORTED metric
-- values. Ratios and breaches are NOT written here: they are produced by the
-- server engines in cert_v2_seed_calculate().
CREATE OR REPLACE FUNCTION public.cert_v2_seed_returns(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p record; m record;
  v_def uuid; v_ob uuid; v_period uuid; v_filing uuid; v_version uuid; v_entity uuid;
  v_filer uuid; v_periods int := 0; v_filings int := 0; v_values int := 0;
  v_max_seq int;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  SELECT id INTO v_filer FROM public.profiles WHERE email = 'licensee_primary_user@mishainfotech.com';

  -- obligations (one canonical return definition per reporting kind)
  FOR p IN
    SELECT DISTINCT s.code, s.scenario, s.ret_kind,
           CASE s.ret_kind WHEN 'BANK' THEN 'PRUD_CAP_Q'
                           WHEN 'INS'  THEN 'INS_TECH_Q'
                           ELSE 'MSB_TXN_M' END AS def_code,
           CASE s.ret_kind WHEN 'MSB' THEN 'MONTHLY' ELSE 'QUARTERLY' END AS freq,
           CASE s.ret_kind WHEN 'MSB' THEN 15 ELSE 45 END AS due_days
      FROM public.cert_v2_entity_spec() s WHERE s.periods > 0
  LOOP
    SELECT id INTO v_def FROM public.return_definitions WHERE code = p.def_code;
    v_entity := public.cert_v2_uuid('entity:' || p.code);
    v_ob := public.cert_v2_uuid('obligation:' || p.code);
    INSERT INTO public.entity_reporting_obligations(
      id, entity_id, return_definition_id, origin, frequency,
      due_days_after_period_end, effective_from, status)
    VALUES (v_ob, v_entity, v_def, 'RULE', p.freq, p.due_days, DATE '2024-01-01', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;
    PERFORM public.cert_v2_register_object(_run_id, p.scenario, 'entity_reporting_obligation',
              v_ob, p.code || ':' || p.def_code);
  END LOOP;

  -- periods + filings + reported values
  FOR p IN SELECT * FROM public.cert_v2_filing_plan() ORDER BY code, seq LOOP
    v_entity := public.cert_v2_uuid('entity:' || p.code);
    v_ob     := public.cert_v2_uuid('obligation:' || p.code);
    v_period := public.cert_v2_uuid('period:' || p.code || ':' || p.period_label);

    SELECT max(seq) INTO v_max_seq FROM public.cert_v2_filing_plan() f WHERE f.code = p.code;

    INSERT INTO public.reporting_periods(
      id, entity_reporting_obligation_id, period_label, period_start, period_end,
      due_date, status, opened_at, closed_at)
    VALUES (v_period, v_ob, p.period_label, p.period_start, p.period_end, p.due_date,
            CASE WHEN p.outcome = 'MISSING' THEN 'OPEN'
                 WHEN p.outcome = 'SUBMITTED' THEN 'OPEN'
                 ELSE 'CLOSED' END,
            (p.period_end + 1)::timestamptz,
            CASE WHEN p.outcome = 'ACCEPTED' THEN (p.due_date + 1)::timestamptz END)
    ON CONFLICT (id) DO NOTHING;
    v_periods := v_periods + 1;

    CONTINUE WHEN p.outcome = 'MISSING';

    v_filing  := public.cert_v2_uuid('filing:' || p.code || ':' || p.period_label);
    v_version := public.cert_v2_uuid('version:' || p.code || ':' || p.period_label);

    -- filing starts SUBMITTED so the reported values and the server calculation
    -- can be written before the immutability guard engages on acceptance.
    INSERT INTO public.return_filings(
      id, filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
      return_definition_id, status, current_version_number, submitted_at, created_by,
      assigned_reviewer_id)
    SELECT v_filing, 'CV2-' || p.code || '-' || p.period_label, v_entity, v_ob, v_period,
           o.return_definition_id, 'SUBMITTED', 1, p.submitted_at, v_filer,
           (SELECT id FROM public.profiles WHERE email = 'returns_officer@mishainfotech.com')
      FROM public.entity_reporting_obligations o WHERE o.id = v_ob
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.return_filing_versions(
      id, return_filing_id, version_number, status, is_immutable,
      submitted_at, submitted_by, declaration_accepted_at, declaration_accepted_by)
    VALUES (v_version, v_filing, 1, 'SUBMITTED', false,
            p.submitted_at, v_filer, p.submitted_at, v_filer)
    ON CONFLICT (id) DO NOTHING;
    v_filings := v_filings + 1;

    FOR m IN
      SELECT * FROM public.cert_v2_reported_inputs(
        p.code, p.scenario, p.ret_kind, p.size_factor, p.series_idx, p.seq = v_max_seq)
    LOOP
      PERFORM public.cert_v2_put_metric(v_version, v_entity, v_period, m.metric_code, m.value);
      v_values := v_values + 1;
    END LOOP;

    PERFORM public.cert_v2_register_object(_run_id, p.scenario, 'return_filing', v_filing,
              'CV2-' || p.code || '-' || p.period_label,
              'purge', jsonb_build_object('outcome', p.outcome, 'late', p.is_late));
    PERFORM public.cert_v2_register_object(_run_id, p.scenario, 'return_filing_version', v_version,
              'CV2-' || p.code || '-' || p.period_label || ' v1');
  END LOOP;

  RETURN jsonb_build_object('periods', v_periods, 'filings', v_filings, 'reported_values', v_values);
END $$;

-- ================================================== server-side calculation pass
-- Runs the PRODUCT engines: metric calculation, then acceptance (which fires the
-- canonical prudential detection trigger). Nothing is computed by the seed.
CREATE OR REPLACE FUNCTION public.cert_v2_seed_calculate(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p record; v_version uuid; v_filing uuid;
  v_calc int := 0; v_accepted int := 0; v_left_for_review int := 0;
  v_reviewer uuid;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  SELECT id INTO v_reviewer FROM public.profiles WHERE email = 'returns_supervisor@mishainfotech.com';

  FOR p IN SELECT * FROM public.cert_v2_filing_plan() WHERE outcome <> 'MISSING' ORDER BY code, seq LOOP
    v_filing  := public.cert_v2_uuid('filing:' || p.code || ':' || p.period_label);
    v_version := public.cert_v2_uuid('version:' || p.code || ':' || p.period_label);

    -- product calculation engine (derives all ratio metrics)
    PERFORM public.returns_calculate_metrics(v_version);
    v_calc := v_calc + 1;

    IF p.outcome = 'ACCEPTED' THEN
      -- acceptance fires tg_prudential_detect_on_acceptance -> canonical detection
      UPDATE public.return_filing_versions
         SET status = 'ACCEPTED', is_immutable = true,
             accepted_at = p.submitted_at + INTERVAL '3 days', accepted_by = v_reviewer
       WHERE id = v_version AND status <> 'ACCEPTED';

      UPDATE public.return_filings
         SET status = 'ACCEPTED', accepted_version_id = v_version,
             accepted_at = p.submitted_at + INTERVAL '3 days'
       WHERE id = v_filing;
      v_accepted := v_accepted + 1;
    ELSE
      v_left_for_review := v_left_for_review + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'calculation_runs', v_calc, 'accepted', v_accepted, 'awaiting_review', v_left_for_review);
END $$;

-- ==================================================================== orchestrator
-- Message runtime must be empty after seeding so notification E2E waves start
-- from a clean delivery baseline. Configuration (templates, event configs,
-- routing rules, preferences) is retained.
CREATE OR REPLACE FUNCTION public.cert_v2_clear_message_runtime()
RETURNS TABLE(table_name text, rows_deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t text;
  n bigint;
  v_tables text[] := ARRAY[
    'notification_digest_items','notification_digest_log','notification_digest_runs',
    'notification_dispatch_log','notification_event_queue','notification_outbox','notifications',
    'correspondence_attachments','correspondence_events','correspondence_dispatches',
    'correspondence_messages','correspondence_thread_participants','correspondence_threads'
  ];
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables it
                WHERE it.table_schema = 'public' AND it.table_name = t) THEN
      n := public.cert_v2_exec_unguarded(
             t,
             format('DELETE FROM public.%I WHERE ($1 IS NULL OR id = ANY($1))', t),
             NULL::uuid[]);
      RETURN QUERY SELECT t, n;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.cert_v2_seed_universe(_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_run uuid; v_ref jsonb; v_ent jsonb; v_ret jsonb; v_calc jsonb; v_msg bigint;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  v_run := public.cert_v2_begin_run('WAVE2-UNIVERSE-1.0',
             COALESCE(_notes, 'Wave 2 supervisory universe (20 entities)'));
  v_ref  := public.cert_v2_seed_reference(v_run);
  v_ent  := public.cert_v2_seed_entities(v_run);
  v_ret  := public.cert_v2_seed_returns(v_run);
  v_calc := public.cert_v2_seed_calculate(v_run);
  SELECT coalesce(sum(rows_deleted),0) INTO v_msg FROM public.cert_v2_clear_message_runtime();
  PERFORM public.cert_v2_complete_run(v_run, 'completed');
  RETURN jsonb_build_object('run_id', v_run, 'reference', v_ref, 'entities', v_ent,
                            'returns', v_ret, 'calculation', v_calc,
                            'message_runtime_rows_remaining', v_msg);
END $$;

-- ======================================================== golden verification
-- Expected ratio per entity/period straight from the design series; compared to
-- what the server engine actually stored.
CREATE OR REPLACE FUNCTION public.cert_v2_golden_ratios()
RETURNS TABLE(entity_code text, period_label text, metric_code text,
              expected numeric, actual numeric, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH plan AS (SELECT * FROM public.cert_v2_filing_plan() WHERE outcome <> 'MISSING'),
  expect AS (
    SELECT p.code, p.period_label, x.metric_code, x.expected
      FROM plan p
      CROSS JOIN LATERAL (VALUES
        ('CAPITAL_ADEQUACY_RATIO', (public.cert_v2_ratio_series(p.scenario,'CAR'))[p.series_idx]),
        ('NPL_RATIO',              (public.cert_v2_ratio_series(p.scenario,'NPL'))[p.series_idx]),
        ('LIQUIDITY_RATIO',        (public.cert_v2_ratio_series(p.scenario,'LIQ'))[p.series_idx]),
        ('COST_INCOME_RATIO',      (public.cert_v2_ratio_series(p.scenario,'CI'))[p.series_idx])
      ) AS x(metric_code, expected)
     WHERE p.ret_kind = 'BANK'
       AND NOT (p.scenario = 'ZERO_DENOMINATOR' AND p.seq = 4 AND x.metric_code = 'NPL_RATIO')
       AND NOT (p.scenario = 'MISSING_INPUT'    AND p.seq = 4 AND x.metric_code = 'LIQUIDITY_RATIO')
    UNION ALL
    SELECT p.code, p.period_label, 'LOSS_RATIO',
           (public.cert_v2_loss_ratio_series(p.code))[greatest(1, p.series_idx - 4)]
      FROM plan p WHERE p.ret_kind = 'INS'
  )
  SELECT ex.code, ex.period_label, ex.metric_code, ex.expected, mv.value_numeric,
         CASE WHEN mv.value_numeric IS NULL THEN 'MISSING'
              WHEN round(mv.value_numeric, 6) = round(ex.expected, 6) THEN 'PASS'
              ELSE 'FAIL' END
    FROM expect ex
    LEFT JOIN public.return_metric_values mv
      ON mv.return_filing_version_id = public.cert_v2_uuid('version:' || ex.code || ':' || ex.period_label)
     AND mv.regulatory_metric_id = (SELECT id FROM public.regulatory_metrics WHERE code = ex.metric_code)
   ORDER BY ex.code, ex.period_label, ex.metric_code;
$$;

-- ---------------------------------------------------------------- universe gate
CREATE OR REPLACE FUNCTION public.cert_v2_universe_gate()
RETURNS TABLE(check_key text, expected text, actual text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT
      (SELECT count(*) FROM public.licensees) AS entities,
      (SELECT count(*) FROM public.licenses) AS licenses,
      (SELECT count(*) FROM public.entity_identifiers) AS identifiers,
      (SELECT count(*) FROM public.entity_reporting_obligations) AS obligations,
      (SELECT count(*) FROM public.reporting_periods) AS periods,
      (SELECT count(*) FROM public.return_filings) AS filings,
      (SELECT count(*) FROM public.return_filings rf WHERE rf.status = 'ACCEPTED') AS accepted,
      (SELECT count(*) FROM public.return_metric_values rmv WHERE rmv.source_kind = 'CALCULATED'
                                                          AND rmv.availability = 'AVAILABLE') AS calculated,
      (SELECT count(*) FROM public.prudential_detection_runs pdr WHERE pdr.status = 'FAILED') AS failed_runs,
      (SELECT count(*) FROM public.prudential_detection_runs) AS runs,
      (SELECT count(*) FROM public.return_threshold_breaches) AS breaches,
      (SELECT count(*) FROM public.cert_v2_golden_ratios() g WHERE g.status <> 'PASS') AS golden_fail,
      (SELECT count(*) FROM public.cert_fixture_objects) AS ledger
  )
  SELECT * FROM (VALUES
    ('ENTITIES',            '20',  (SELECT entities::text FROM c),    (SELECT CASE WHEN entities = 20 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('LICENCES',            '19',  (SELECT licenses::text FROM c),    (SELECT CASE WHEN licenses = 19 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('IDENTIFIERS',         '40',  (SELECT identifiers::text FROM c), (SELECT CASE WHEN identifiers = 40 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('OBLIGATIONS',         '18',  (SELECT obligations::text FROM c), (SELECT CASE WHEN obligations = 18 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('REPORTING_PERIODS',   '>0',  (SELECT periods::text FROM c),     (SELECT CASE WHEN periods > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('FILINGS',             '>0',  (SELECT filings::text FROM c),     (SELECT CASE WHEN filings > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('FILINGS_ACCEPTED',    '>0',  (SELECT accepted::text FROM c),    (SELECT CASE WHEN accepted > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('SERVER_CALCULATED',   '>0',  (SELECT calculated::text FROM c),  (SELECT CASE WHEN calculated > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('DETECTION_RUNS',      '>0',  (SELECT runs::text FROM c),        (SELECT CASE WHEN runs > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('DETECTION_FAILURES',  '0',   (SELECT failed_runs::text FROM c), (SELECT CASE WHEN failed_runs = 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('THRESHOLD_BREACHES',  '>0',  (SELECT breaches::text FROM c),    (SELECT CASE WHEN breaches > 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('GOLDEN_RATIOS',       '0 fail', (SELECT golden_fail::text FROM c), (SELECT CASE WHEN golden_fail = 0 THEN 'PASS' ELSE 'FAIL' END FROM c)),
    ('FIXTURE_LEDGER',      '>0',  (SELECT ledger::text FROM c),      (SELECT CASE WHEN ledger > 0 THEN 'PASS' ELSE 'FAIL' END FROM c))
  ) AS t(check_key, expected, actual, status);
END $$;

REVOKE ALL ON FUNCTION public.cert_v2_seed_entities(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_seed_returns(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_seed_calculate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_seed_universe(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_seed_reference(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_put_metric(uuid,uuid,uuid,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_v2_clear_message_runtime() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_clear_message_runtime() TO service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_universe(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_golden_ratios() TO service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_universe_gate() TO service_role;
