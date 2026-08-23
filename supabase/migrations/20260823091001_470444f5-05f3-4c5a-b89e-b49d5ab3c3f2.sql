CREATE OR REPLACE FUNCTION public.cert_v2_seed_reference(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_added int := 0;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  INSERT INTO public.cert_fixture_object_types(object_type, table_name, delete_order, description)
  VALUES
    ('entity_identifier','entity_identifiers',21,'Canonical entity identifiers'),
    ('entity_appointment','entity_appointments',22,'Board / control function appointments'),
    ('person_party','parties',23,'Natural person parties'),
    ('financial_group_member','financial_group_members',26,'Financial group membership'),
    ('financial_group','financial_groups',27,'Financial groups'),
    ('entity_merge','entity_merges',28,'Entity merge lineage'),
    ('document','documents',29,'Document metadata'),
    ('reporting_period','reporting_periods',92,'Certification reporting periods'),
    ('prudential_threshold','prudential_thresholds',200,'Certification threshold configuration')
  ON CONFLICT (object_type) DO NOTHING;

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

REVOKE ALL ON FUNCTION public.cert_v2_seed_reference(uuid) FROM PUBLIC, anon, authenticated;