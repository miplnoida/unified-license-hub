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

REVOKE ALL ON FUNCTION public.cert_v2_seed_returns(uuid) FROM PUBLIC, anon, authenticated;