CREATE OR REPLACE FUNCTION public._prudential_canonical_detect_run(
  _return_filing_version_id uuid,
  _trigger_kind text DEFAULT 'manual',
  _actor uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v record;
  v_run_id uuid;
  v_sector uuid;
  v_period_end date;
  v_actor uuid;
  m record;
  th record;
  rule record;
  v_level text;
  v_metrics int := 0;
  v_thresholds int := 0;
  v_breaches int := 0;
  v_warnings int := 0;
  v_ewi int := 0;
  v_distance numeric;
  v_prev numeric;
  v_change numeric;
  v_breach_periods int;
  v_evaluations jsonb := '[]'::jsonb;
  v_config jsonb;
  v_summary jsonb;
BEGIN
  v_actor := COALESCE(_actor, auth.uid());

  SELECT rfv.id AS version_id,
         rfv.version_number,
         rfv.status AS version_status,
         rf.id AS filing_id,
         rf.filing_reference,
         rf.status AS filing_status,
         rf.entity_id,
         rf.reporting_period_id,
         rp.period_end,
         rp.period_label
    INTO v
    FROM public.return_filing_versions rfv
    JOIN public.return_filings rf ON rf.id = rfv.return_filing_id
    LEFT JOIN public.reporting_periods rp ON rp.id = rf.reporting_period_id
   WHERE rfv.id = _return_filing_version_id;

  IF v.version_id IS NULL THEN
    RAISE EXCEPTION 'A2: canonical filing version % not found', _return_filing_version_id;
  END IF;

  IF COALESCE(v.version_status, '') NOT IN ('ACCEPTED', 'SUBMITTED', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'A2: detection requires a submitted or accepted filing version (found %)', v.version_status;
  END IF;

  SELECT sector_id INTO v_sector FROM public.licensees WHERE id = v.entity_id;
  v_period_end := COALESCE(v.period_end, CURRENT_DATE);

  SELECT jsonb_build_object(
           'thresholds', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('metric_key', t.metric_key, 'comparator', t.comparator,
                                                 'warn_value', t.warn_value, 'breach_value', t.breach_value,
                                                 'version', t.current_version))
               FROM public.prudential_thresholds t WHERE t.is_active
           ), '[]'::jsonb),
           'ewi_rules', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('code', r.code, 'rule_type', r.rule_type,
                                                 'params', r.params, 'version', r.version, 'severity', r.severity))
               FROM public.prudential_ewi_rules r
              WHERE r.is_active AND r.rule_type IN ('canonical_threshold_approach','canonical_repeated_breach','canonical_deterioration')
           ), '[]'::jsonb)
         ) INTO v_config;

  INSERT INTO public.prudential_detection_runs
    (entity_id, return_filing_id, return_filing_version_id, reporting_period_id, period_end,
     trigger_kind, triggered_by, status, config_snapshot)
  VALUES (v.entity_id, v.filing_id, v.version_id, v.reporting_period_id, v_period_end,
          COALESCE(_trigger_kind, 'manual'), v_actor, 'RUNNING', v_config)
  RETURNING id INTO v_run_id;

  FOR m IN
    SELECT mv.id AS metric_value_id,
           mv.regulatory_metric_id,
           mv.value_numeric,
           mv.source_kind,
           rm.code AS metric_code,
           rm.name AS metric_name,
           rm.unit AS metric_unit
      FROM public.return_metric_values mv
      JOIN public.regulatory_metrics rm ON rm.id = mv.regulatory_metric_id
     WHERE mv.return_filing_version_id = v.version_id
       AND COALESCE(mv.availability, 'AVAILABLE') = 'AVAILABLE'
       AND mv.value_numeric IS NOT NULL
     ORDER BY rm.code
  LOOP
    v_metrics := v_metrics + 1;

    SELECT * INTO th FROM public.prudential_resolve_threshold(m.metric_code, v_sector, v_period_end);

    IF th.threshold_id IS NULL THEN
      v_evaluations := v_evaluations || jsonb_build_object(
        'metric', m.metric_code, 'value', m.value_numeric, 'outcome', 'no_threshold_configured');
      CONTINUE;
    END IF;

    v_thresholds := v_thresholds + 1;
    v_level := NULL;

    IF th.comparator = '>=' THEN
      IF th.breach_value IS NOT NULL AND m.value_numeric < th.breach_value THEN
        v_level := 'breach';
      ELSIF th.warn_value IS NOT NULL AND m.value_numeric < th.warn_value THEN
        v_level := 'warn';
      END IF;
    ELSIF th.comparator = '<=' THEN
      IF th.breach_value IS NOT NULL AND m.value_numeric > th.breach_value THEN
        v_level := 'breach';
      ELSIF th.warn_value IS NOT NULL AND m.value_numeric > th.warn_value THEN
        v_level := 'warn';
      END IF;
    END IF;

    v_evaluations := v_evaluations || jsonb_build_object(
      'metric', m.metric_code,
      'value', m.value_numeric,
      'comparator', th.comparator,
      'warn_value', th.warn_value,
      'breach_value', th.breach_value,
      'threshold_version', th.threshold_version,
      'outcome', COALESCE(v_level, 'within_tolerance'));

    IF v_level IS NOT NULL THEN
      INSERT INTO public.return_threshold_breaches
        (return_id, metric_key, level, value, threshold_value, comparator, detected_at, notified,
         risk_level, threshold_version, entity_id, return_filing_id, return_filing_version_id,
         reporting_period_id, regulatory_metric_id, detection_source, detection_run_id, evidence)
      VALUES (NULL, m.metric_code, v_level, m.value_numeric, th.breach_value, th.comparator, now(), false,
              CASE WHEN v_level = 'breach' THEN 'red' ELSE 'amber' END,
              th.threshold_version, v.entity_id, v.filing_id, v.version_id,
              v.reporting_period_id, m.regulatory_metric_id, 'CANONICAL_ENGINE', v_run_id,
              jsonb_build_object(
                'engine_version', 'a2.canonical.v1',
                'metric_code', m.metric_code,
                'metric_name', m.metric_name,
                'metric_value_id', m.metric_value_id,
                'value', m.value_numeric,
                'unit', COALESCE(th.unit, m.metric_unit),
                'comparator', th.comparator,
                'warn_value', th.warn_value,
                'breach_value', th.breach_value,
                'threshold_id', th.threshold_id,
                'threshold_label', th.label,
                'threshold_version', th.threshold_version,
                'filing_reference', v.filing_reference,
                'period_label', v.period_label,
                'period_end', v_period_end,
                'source_kind', m.source_kind))
      ON CONFLICT (return_filing_version_id, regulatory_metric_id, level)
        WHERE return_filing_version_id IS NOT NULL AND regulatory_metric_id IS NOT NULL
      DO UPDATE SET value = EXCLUDED.value,
                    threshold_value = EXCLUDED.threshold_value,
                    comparator = EXCLUDED.comparator,
                    risk_level = EXCLUDED.risk_level,
                    threshold_version = EXCLUDED.threshold_version,
                    evidence = EXCLUDED.evidence,
                    detection_run_id = EXCLUDED.detection_run_id,
                    detected_at = now();

      IF v_level = 'breach' THEN
        v_breaches := v_breaches + 1;
      ELSE
        v_warnings := v_warnings + 1;
      END IF;
    END IF;

    FOR rule IN
      SELECT * FROM public.prudential_ewi_rules
       WHERE is_active
         AND rule_type IN ('canonical_threshold_approach', 'canonical_repeated_breach', 'canonical_deterioration')
         AND (sector_id IS NULL OR sector_id = v_sector)
    LOOP
      IF rule.rule_type = 'canonical_threshold_approach' THEN
        CONTINUE WHEN v_level = 'breach' OR th.breach_value IS NULL OR th.breach_value = 0;
        v_distance := ABS(m.value_numeric - th.breach_value) / ABS(th.breach_value) * 100;
        IF v_distance <= COALESCE((rule.params->>'buffer_pct')::numeric, 20) THEN
          INSERT INTO public.prudential_ewi_alerts
            (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at,
             detection_source, detection_run_id, return_filing_id, return_filing_version_id,
             reporting_period_id, regulatory_metric_id)
          VALUES (v.entity_id, rule.id, rule.code, rule.version, v_period_end, m.metric_code, rule.severity,
                  jsonb_build_object('rule_type', rule.rule_type, 'params', rule.params,
                                     'value', m.value_numeric, 'breach_value', th.breach_value,
                                     'comparator', th.comparator,
                                     'distance_to_breach_pct', ROUND(v_distance * 100) / 100,
                                     'threshold_version', th.threshold_version,
                                     'filing_reference', v.filing_reference,
                                     'period_label', v.period_label,
                                     'engine_version', 'a2.canonical.v1'), now(),
                  'CANONICAL_ENGINE', v_run_id, v.filing_id, v.version_id,
                  v.reporting_period_id, m.regulatory_metric_id)
          ON CONFLICT (entity_id, rule_id, period_end, metric_key)
          DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(),
                        detection_run_id = EXCLUDED.detection_run_id,
                        return_filing_version_id = EXCLUDED.return_filing_version_id,
                        updated_at = now();
          v_ewi := v_ewi + 1;
        END IF;

      ELSIF rule.rule_type = 'canonical_deterioration' THEN
        SELECT mv.value_numeric INTO v_prev
          FROM public.return_metric_values mv
          JOIN public.reporting_periods rp2 ON rp2.id = mv.reporting_period_id
         WHERE mv.entity_id = v.entity_id
           AND mv.regulatory_metric_id = m.regulatory_metric_id
           AND mv.value_numeric IS NOT NULL
           AND rp2.period_end < v_period_end
         ORDER BY rp2.period_end DESC, mv.recorded_at DESC
         LIMIT 1;

        IF v_prev IS NOT NULL AND v_prev <> 0 THEN
          v_change := CASE WHEN th.comparator = '>='
                           THEN (v_prev - m.value_numeric) / ABS(v_prev) * 100
                           ELSE (m.value_numeric - v_prev) / ABS(v_prev) * 100 END;
          IF v_change >= COALESCE((rule.params->>'min_change_pct')::numeric, 15) THEN
            INSERT INTO public.prudential_ewi_alerts
              (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at,
               detection_source, detection_run_id, return_filing_id, return_filing_version_id,
               reporting_period_id, regulatory_metric_id)
            VALUES (v.entity_id, rule.id, rule.code, rule.version, v_period_end, m.metric_code, rule.severity,
                    jsonb_build_object('rule_type', rule.rule_type, 'params', rule.params,
                                       'current', m.value_numeric, 'previous', v_prev,
                                       'adverse_change_pct', ROUND(v_change * 100) / 100,
                                       'comparator', th.comparator,
                                       'filing_reference', v.filing_reference,
                                       'engine_version', 'a2.canonical.v1'), now(),
                    'CANONICAL_ENGINE', v_run_id, v.filing_id, v.version_id,
                    v.reporting_period_id, m.regulatory_metric_id)
            ON CONFLICT (entity_id, rule_id, period_end, metric_key)
            DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(),
                          detection_run_id = EXCLUDED.detection_run_id,
                          return_filing_version_id = EXCLUDED.return_filing_version_id,
                          updated_at = now();
            v_ewi := v_ewi + 1;
          END IF;
        END IF;

      ELSIF rule.rule_type = 'canonical_repeated_breach' THEN
        SELECT COUNT(DISTINCT b.reporting_period_id) INTO v_breach_periods
          FROM public.return_threshold_breaches b
          JOIN public.reporting_periods rp3 ON rp3.id = b.reporting_period_id
         WHERE b.entity_id = v.entity_id
           AND b.regulatory_metric_id = m.regulatory_metric_id
           AND b.level = 'breach'
           AND rp3.period_end <= v_period_end;

        IF v_breach_periods >= COALESCE((rule.params->>'min_breaches')::int, 2) THEN
          INSERT INTO public.prudential_ewi_alerts
            (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at,
             detection_source, detection_run_id, return_filing_id, return_filing_version_id,
             reporting_period_id, regulatory_metric_id)
          VALUES (v.entity_id, rule.id, rule.code, rule.version, v_period_end, m.metric_code, rule.severity,
                  jsonb_build_object('rule_type', rule.rule_type, 'params', rule.params,
                                     'breach_periods', v_breach_periods,
                                     'filing_reference', v.filing_reference,
                                     'engine_version', 'a2.canonical.v1'), now(),
                  'CANONICAL_ENGINE', v_run_id, v.filing_id, v.version_id,
                  v.reporting_period_id, m.regulatory_metric_id)
          ON CONFLICT (entity_id, rule_id, period_end, metric_key)
          DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(),
                        detection_run_id = EXCLUDED.detection_run_id,
                        updated_at = now();
          v_ewi := v_ewi + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.prudential_detection_runs
     SET status = 'COMPLETED',
         metrics_evaluated = v_metrics,
         thresholds_resolved = v_thresholds,
         breaches_created = v_breaches,
         warnings_created = v_warnings,
         ewi_created = v_ewi,
         result = jsonb_build_object('evaluations', v_evaluations),
         completed_at = now()
   WHERE id = v_run_id;

  v_summary := jsonb_build_object('entity_id', v.entity_id, 'filing_reference', v.filing_reference,
                                  'period_end', v_period_end, 'metrics_evaluated', v_metrics,
                                  'breaches', v_breaches, 'warnings', v_warnings, 'ewi', v_ewi,
                                  'trigger_kind', COALESCE(_trigger_kind, 'manual'),
                                  'engine_version', 'a2.canonical.v1');

  IF v_actor IS NOT NULL THEN
    PERFORM public.log_compliance_audit_as_actor(
      v_actor,
      'INTEGRATION_EVENT'::public.compliance_audit_action,
      'prudential_detection_run',
      v_run_id::text,
      NULL,
      v_summary,
      'A2 canonical prudential detection run',
      NULL, NULL, NULL,
      jsonb_build_object('trigger_kind', COALESCE(_trigger_kind, 'manual')));
  ELSE
    INSERT INTO public.compliance_audit_logs
      (user_id, user_role, action_type, object_type, object_id, after_value, justification, metadata)
    VALUES (NULL, 'SYSTEM', 'INTEGRATION_EVENT'::public.compliance_audit_action,
            'prudential_detection_run', v_run_id::text, v_summary,
            'A2 canonical prudential detection run (system trigger)',
            jsonb_build_object('trigger_kind', COALESCE(_trigger_kind, 'manual'),
                               'engine_version', 'a2.canonical.v1'));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'entity_id', v.entity_id,
    'filing_reference', v.filing_reference,
    'period_end', v_period_end,
    'metrics_evaluated', v_metrics,
    'thresholds_resolved', v_thresholds,
    'breaches_created', v_breaches,
    'warnings_created', v_warnings,
    'ewi_created', v_ewi,
    'evaluations', v_evaluations);
END $fn$;

DELETE FROM public.prudential_detection_runs WHERE status = 'FAILED';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT v.id
      FROM public.return_filing_versions v
      JOIN public.return_filings f ON f.id = v.return_filing_id
      JOIN public.reporting_periods rp ON rp.id = f.reporting_period_id
     WHERE rp.period_label LIKE 'A2-S%'
       AND v.status = 'ACCEPTED'
     ORDER BY rp.period_end
  LOOP
    PERFORM public._prudential_canonical_detect_run(r.id, 'filing_accepted', NULL);
  END LOOP;
END $$;