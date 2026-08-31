CREATE OR REPLACE FUNCTION public.prudential_ewi_evaluate(_entity_id uuid, _period_end date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r public.prudential_ewi_rules;
  v_created int := 0;
  v_refreshed int := 0;
  v_alert_id uuid;
  v_existing uuid;
  rec record;
BEGIN
  IF NOT (public.is_trusted_service_request() OR public.can_read_prudential_entity(auth.uid(), _entity_id)) THEN
    RAISE EXCEPTION 'not authorised to evaluate early warning indicators for this entity';
  END IF;

  FOR r IN
    SELECT * FROM public.prudential_ewi_rules
     WHERE is_active
       AND (sector_id IS NULL
            OR sector_id = (SELECT sector_id FROM public.licensees WHERE id = _entity_id))
  LOOP
    IF r.rule_type = 'repeated_breach' THEN
      FOR rec IN
        WITH periods AS (
          SELECT w.filing_id AS id, w.period_end
            FROM public.v_return_filing_workflow_state w
           WHERE w.entity_id = _entity_id
             AND w.period_end <= _period_end
             AND w.status <> 'WITHDRAWN'
           ORDER BY w.period_end DESC
           LIMIT COALESCE((r.params->>'lookback_periods')::int, 3)
        )
        SELECT b.metric_key, COUNT(*)::int AS hits,
               jsonb_agg(jsonb_build_object('return_id', b.return_filing_id, 'value', b.value,
                                            'threshold_value', b.threshold_value,
                                            'threshold_version', b.threshold_version)) AS ev
          FROM public.return_threshold_breaches b
          JOIN periods p ON p.id = b.return_filing_id
         WHERE b.level = 'breach'
         GROUP BY b.metric_key
        HAVING COUNT(*) >= COALESCE((r.params->>'min_breaches')::int, 2)
      LOOP
        INSERT INTO public.prudential_ewi_alerts
          (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at)
        VALUES (_entity_id, r.id, r.code, r.version, _period_end, rec.metric_key, r.severity,
                jsonb_build_object('rule_type', r.rule_type, 'breaches', rec.hits, 'detail', rec.ev), now())
        ON CONFLICT (entity_id, rule_id, period_end, metric_key)
          DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(),
                        rule_version = EXCLUDED.rule_version, updated_at = now()
        RETURNING id INTO v_alert_id;
        v_created := v_created + 1;
      END LOOP;

    ELSIF r.rule_type = 'multi_ratio_warning' THEN
      FOR rec IN
        SELECT COUNT(*)::int AS warnings,
               jsonb_agg(jsonb_build_object('metric_key', b.metric_key, 'value', b.value)) AS ev
          FROM public.return_threshold_breaches b
          JOIN public.v_return_filing_workflow_state w ON w.filing_id = b.return_filing_id
         WHERE w.entity_id = _entity_id AND w.period_end = _period_end
           AND w.status <> 'WITHDRAWN'
           AND b.level = 'warn'
        HAVING COUNT(*) >= COALESCE((r.params->>'min_warnings')::int, 3)
      LOOP
        INSERT INTO public.prudential_ewi_alerts
          (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at)
        VALUES (_entity_id, r.id, r.code, r.version, _period_end, '', r.severity,
                jsonb_build_object('rule_type', r.rule_type, 'warnings', rec.warnings, 'detail', rec.ev), now())
        ON CONFLICT (entity_id, rule_id, period_end, metric_key)
          DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(), updated_at = now()
        RETURNING id INTO v_alert_id;
        v_created := v_created + 1;
      END LOOP;

    ELSIF r.rule_type IN ('sharp_deterioration','adverse_trend') THEN
      FOR rec IN
        WITH vals AS (
          SELECT DISTINCT ON (w.period_end, m.code)
                 upper(m.code) AS ratio_key, w.period_end AS period_end_date, mv.value_numeric AS value
            FROM public.v_return_filing_workflow_state w
            JOIN public.return_metric_values mv
              ON mv.return_filing_version_id = COALESCE(w.accepted_version_id, w.current_version_id)
            JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
           WHERE w.entity_id = _entity_id
             AND w.period_end <= _period_end
             AND w.status <> 'WITHDRAWN'
             AND mv.value_numeric IS NOT NULL
           ORDER BY w.period_end, m.code, mv.calculated_at DESC NULLS LAST, mv.recorded_at DESC
        ), ranked AS (
          SELECT ratio_key, period_end_date, value,
                 ROW_NUMBER() OVER (PARTITION BY ratio_key ORDER BY period_end_date DESC) AS rn
            FROM vals
        )
        SELECT ratio_key,
               MAX(value) FILTER (WHERE rn = 1) AS v1,
               MAX(value) FILTER (WHERE rn = 2) AS v2,
               MAX(value) FILTER (WHERE rn = 3) AS v3,
               MAX(value) FILTER (WHERE rn = 4) AS v4
          FROM ranked WHERE rn <= 4
         GROUP BY ratio_key
      LOOP
        IF r.rule_type = 'sharp_deterioration' THEN
          IF rec.v1 IS NOT NULL AND rec.v2 IS NOT NULL AND rec.v2 <> 0
             AND ((rec.v2 - rec.v1) / ABS(rec.v2)) * 100 >= COALESCE((r.params->>'min_change_pct')::numeric, 20) THEN
            INSERT INTO public.prudential_ewi_alerts
              (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at)
            VALUES (_entity_id, r.id, r.code, r.version, _period_end, rec.ratio_key, r.severity,
                    jsonb_build_object('rule_type', r.rule_type, 'current', rec.v1, 'previous', rec.v2,
                                       'change_pct', ROUND(((rec.v2 - rec.v1) / ABS(rec.v2)) * 10000) / 100), now())
            ON CONFLICT (entity_id, rule_id, period_end, metric_key)
              DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(), updated_at = now();
            v_created := v_created + 1;
          END IF;
        ELSE
          IF rec.v1 IS NOT NULL AND rec.v2 IS NOT NULL AND rec.v3 IS NOT NULL AND rec.v4 IS NOT NULL
             AND rec.v1 < rec.v2 AND rec.v2 < rec.v3 AND rec.v3 < rec.v4 THEN
            INSERT INTO public.prudential_ewi_alerts
              (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at)
            VALUES (_entity_id, r.id, r.code, r.version, _period_end, rec.ratio_key, r.severity,
                    jsonb_build_object('rule_type', r.rule_type, 'series',
                                       jsonb_build_array(rec.v4, rec.v3, rec.v2, rec.v1)), now())
            ON CONFLICT (entity_id, rule_id, period_end, metric_key)
              DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(), updated_at = now();
            v_created := v_created + 1;
          END IF;
        END IF;
      END LOOP;

    ELSIF r.rule_type = 'late_return' THEN
      SELECT w.filing_id INTO v_existing
        FROM public.v_return_filing_workflow_state w
       WHERE w.entity_id = _entity_id AND w.period_end = _period_end
         AND w.status IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED')
       LIMIT 1;
      IF v_existing IS NULL THEN
        INSERT INTO public.prudential_ewi_alerts
          (entity_id, rule_id, rule_code, rule_version, period_end, metric_key, severity, evidence, executed_at)
        VALUES (_entity_id, r.id, r.code, r.version, _period_end, '', r.severity,
                jsonb_build_object('rule_type', r.rule_type, 'reason', 'no_submitted_return'), now())
        ON CONFLICT (entity_id, rule_id, period_end, metric_key)
          DO UPDATE SET evidence = EXCLUDED.evidence, executed_at = now(), updated_at = now();
        v_created := v_created + 1;
      END IF;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.prudential_audit_event('PRUDENTIAL_EWI_EVALUATED','prudential_ewi_evaluation',_entity_id,
      NULL, jsonb_build_object('period_end', _period_end, 'alerts', v_created),
      jsonb_build_object('source','prudential_ewi_evaluate','period_end',_period_end),
      NULL, 'CREATE'::public.compliance_audit_action);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('entity_id', _entity_id, 'period_end', _period_end,
                            'alerts_written', v_created, 'refreshed', v_refreshed,
                            'executed_at', now());
END $function$;
