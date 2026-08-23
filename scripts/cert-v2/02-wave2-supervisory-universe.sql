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
--     with cleanup_policy = 'retain' and labelled [CERTIFICATION].
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
   ('E01','Meridian Commercial Bank Limited','Commercial Bank','HEALTHY','BANK',8,2.0,true,'active','license_active','verified','high','active'),
   ('E02','Coral Harbour Bank Limited','Commercial Bank','LIQUIDITY_STRESS','BANK',8,1.2,true,'active','license_active','verified','medium','active'),
   ('E03','Windward Trust Bank Limited','Commercial Bank','CAPITAL_WEAKNESS','BANK',8,0.9,true,'active','license_active','verified','medium','active'),
   ('E04','Basseterre Building Society','Building Society','LATE_FILER','BANK',8,0.6,true,'active','license_active','verified','low','active'),
   ('E05','Frigate Bay Capital Partners Limited','Securities Dealer','NEW_APPLICANT','NONE',0,0.3,false,NULL,'applicant','unverified','low','prospect'),
   ('E06','Sandy Point Merchant Bank Limited','Merchant Bank','LICENCE_LIFECYCLE','BANK',4,0.7,true,'active','license_active','verified','low','active'),
   ('E07','Palmetto Consumer Finance Limited','Micro-credit Institution','CONDUCT_RISK','BANK',4,0.35,true,'active','license_active','verified','low','active'),
   ('E08','Nevis Peak Insurance Company Limited','General Insurance','EXAMINATION','INS',4,0.8,true,'active','license_active','verified','medium','active'),
   ('E09','Charlestown Life Assurance Limited','Life Insurance','FP_CASES','INS',4,0.9,true,'active','license_active','verified','medium','active'),
   ('E10','Brimstone Payments Limited','Payment Service Provider','MULTI_ENTITY_USER','MSB',6,0.4,true,'active','license_active','verified','low','active'),
   ('E11','Old Road Savings and Loan Limited','Building Society','MERGED_ABSORBED','BANK',4,0.3,true,'revoked','former_licensee','merged','low','inactive'),
   ('E12','Dieppe Bay Micro Finance Limited','Micro-credit Institution','SURRENDERED','BANK',4,0.25,true,'surrendered','license_surrendered','verified','low','inactive'),
   ('E13','Cayon Commercial Bank Limited','Commercial Bank','BOUNDARY_PASS','BANK',4,1.0,true,'active','license_active','verified','medium','active'),
   ('E14','Tabernacle Commercial Bank Limited','Commercial Bank','BOUNDARY_WARN','BANK',4,1.0,true,'active','license_active','verified','medium','active'),
   ('E15','Saddlers Commercial Bank Limited','Commercial Bank','ZERO_DENOMINATOR','BANK',4,0.8,true,'active','license_active','verified','low','active'),
   ('E16','Molineux Building Society','Building Society','MISSING_INPUT','BANK',4,0.5,true,'active','license_active','verified','low','active'),
   ('E17','Conaree General Insurance Limited','General Insurance','PEER_STANDARD','INS',4,0.6,true,'active','license_active','verified','low','active'),
   ('E18','Verchilds Financial Holdings Limited','Financial Holding Company','GROUP_PARENT','NONE',0,2.5,true,'active','authorised','verified','high','active'),
   ('E19','Verchilds Securities Limited','Securities Dealer','GROUP_SUBSIDIARY','BANK',4,0.5,true,'active','license_active','verified','low','active'),
   ('E20','Half Way Tree Money Services Limited','Money Service Business','MSB_MONITORING','MSB',6,0.3,true,'active','license_active','verified','low','active')
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
            public.cert_v2_uuid('threshold:LIQUIDITY_RATIO'), 'LIQUIDITY_RATIO', 'retain',
            jsonb_build_object('reason', 'canonical grading of liquidity ratio'));
  PERFORM public.cert_v2_register_object(_run_id, 'CONFIG', 'prudential_threshold',
            public.cert_v2_uuid('threshold:COST_INCOME_RATIO'), 'COST_INCOME_RATIO', 'retain',
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
