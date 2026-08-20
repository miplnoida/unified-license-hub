-- A2 canonical detection engine
ALTER TABLE public.return_threshold_breaches
  ALTER COLUMN return_id DROP NOT NULL;

ALTER TABLE public.return_threshold_breaches
  ADD COLUMN IF NOT EXISTS detection_source text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS detection_run_id uuid,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.return_threshold_breaches'::regclass
       AND conname = 'return_threshold_breaches_source_present'
  ) THEN
    ALTER TABLE public.return_threshold_breaches
      ADD CONSTRAINT return_threshold_breaches_source_present
      CHECK (return_id IS NOT NULL OR return_filing_version_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_return_threshold_breaches_canonical
  ON public.return_threshold_breaches (return_filing_version_id, regulatory_metric_id, level)
  WHERE return_filing_version_id IS NOT NULL AND regulatory_metric_id IS NOT NULL;

ALTER TABLE public.prudential_ewi_alerts
  ADD COLUMN IF NOT EXISTS detection_source text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS detection_run_id uuid,
  ADD COLUMN IF NOT EXISTS return_filing_id uuid REFERENCES public.return_filings(id),
  ADD COLUMN IF NOT EXISTS return_filing_version_id uuid REFERENCES public.return_filing_versions(id),
  ADD COLUMN IF NOT EXISTS reporting_period_id uuid REFERENCES public.reporting_periods(id),
  ADD COLUMN IF NOT EXISTS regulatory_metric_id uuid REFERENCES public.regulatory_metrics(id);

CREATE TABLE IF NOT EXISTS public.prudential_detection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id),
  return_filing_id uuid REFERENCES public.return_filings(id),
  return_filing_version_id uuid REFERENCES public.return_filing_versions(id),
  reporting_period_id uuid REFERENCES public.reporting_periods(id),
  period_end date,
  engine_version text NOT NULL DEFAULT 'a2.canonical.v1',
  trigger_kind text NOT NULL DEFAULT 'manual',
  triggered_by uuid,
  status text NOT NULL DEFAULT 'RUNNING',
  metrics_evaluated integer NOT NULL DEFAULT 0,
  thresholds_resolved integer NOT NULL DEFAULT 0,
  breaches_created integer NOT NULL DEFAULT 0,
  warnings_created integer NOT NULL DEFAULT 0,
  ewi_created integer NOT NULL DEFAULT 0,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.prudential_detection_runs TO authenticated;
GRANT ALL ON public.prudential_detection_runs TO service_role;
ALTER TABLE public.prudential_detection_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "detection runs readable by supervisors" ON public.prudential_detection_runs;
CREATE POLICY "detection runs readable by supervisors"
  ON public.prudential_detection_runs FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));

CREATE INDEX IF NOT EXISTS idx_prudential_detection_runs_entity
  ON public.prudential_detection_runs (entity_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_prudential_detection_runs_version
  ON public.prudential_detection_runs (return_filing_version_id);

DO $$
DECLARE
  r record;
  v_id uuid;
BEGIN
  ALTER TABLE public.prudential_thresholds ALTER COLUMN return_config_id DROP NOT NULL;
  FOR r IN
    SELECT * FROM (VALUES
      ('CAPITAL_ADEQUACY_RATIO', 'Capital Adequacy Ratio (min 10%)', '>=', 12.0, 10.0, '%'),
      ('NPL_RATIO',              'NPL Ratio (max 10%)',              '<=',  5.0, 10.0, '%')
    ) AS t(metric_key, label, comparator, warn_value, breach_value, unit)
  LOOP
    v_id := NULL;
    SELECT id INTO v_id FROM public.prudential_thresholds
     WHERE metric_key = r.metric_key AND sector_id IS NULL;

    IF v_id IS NULL THEN
      INSERT INTO public.prudential_thresholds
        (metric_key, label, comparator, warn_value, breach_value, unit,
         is_active, current_version, effective_from)
      VALUES (r.metric_key, r.label, r.comparator, r.warn_value, r.breach_value, r.unit,
              true, 1, DATE '2020-01-01')
      RETURNING id INTO v_id;

      INSERT INTO public.prudential_threshold_versions
        (threshold_id, version, warn_value, breach_value, comparator, unit, effective_from, published_at)
      VALUES (v_id, 1, r.warn_value, r.breach_value, r.comparator, r.unit, DATE '2020-01-01', now())
      ON CONFLICT (threshold_id, version) DO NOTHING;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.prudential_ewi_rules (code, name, description, rule_type, params, severity, version, is_active)
SELECT * FROM (VALUES ('__noop__','','','__noop__','{}'::jsonb,'low',1,false)) AS t(a,b,c,d,e,f,g,h) WHERE false;

ALTER TABLE public.prudential_ewi_rules DROP CONSTRAINT IF EXISTS prudential_ewi_rules_rule_type_check;
ALTER TABLE public.prudential_ewi_rules
  ADD CONSTRAINT prudential_ewi_rules_rule_type_check
  CHECK (rule_type IN ('repeated_breach','multi_ratio_warning','sharp_deterioration','adverse_trend','late_return',
                       'canonical_threshold_approach','canonical_repeated_breach','canonical_deterioration'));

INSERT INTO public.prudential_ewi_rules (code, name, description, rule_type, params, severity, version, is_active)
VALUES
  ('EWI_CANONICAL_THRESHOLD_APPROACH',
   'Approaching regulatory threshold',
   'Canonical metric has not breached but sits within the configured buffer of the breach threshold.',
   'canonical_threshold_approach',
   '{"buffer_pct": 20}'::jsonb, 'medium', 1, true),
  ('EWI_CANONICAL_REPEATED_BREACH',
   'Repeated canonical breach',
   'Same canonical metric breached in at least N accepted filing periods.',
   'canonical_repeated_breach',
   '{"min_breaches": 2, "lookback_periods": 4}'::jsonb, 'high', 1, true),
  ('EWI_CANONICAL_DETERIORATION',
   'Adverse canonical movement',
   'Canonical metric moved adversely by at least the configured percentage against the prior period.',
   'canonical_deterioration',
   '{"min_change_pct": 15}'::jsonb, 'high', 1, true)
ON CONFLICT (code) DO UPDATE
  SET rule_type = EXCLUDED.rule_type,
      description = EXCLUDED.description,
      params = EXCLUDED.params,
      severity = EXCLUDED.severity,
      is_active = EXCLUDED.is_active,
      updated_at = now();

CREATE OR REPLACE FUNCTION public.prudential_resolve_threshold(
  _metric_code text,
  _sector_id uuid,
  _as_of date
) RETURNS TABLE (
  threshold_id uuid,
  label text,
  comparator text,
  warn_value numeric,
  breach_value numeric,
  unit text,
  threshold_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT t.id,
         t.label,
         COALESCE(tv.comparator, t.comparator),
         COALESCE(tv.warn_value, t.warn_value),
         COALESCE(tv.breach_value, t.breach_value),
         COALESCE(tv.unit, t.unit),
         COALESCE(tv.version, t.current_version, 1)
    FROM public.prudential_thresholds t
    LEFT JOIN public.prudential_threshold_versions tv
           ON tv.threshold_id = t.id
          AND (tv.effective_from IS NULL OR tv.effective_from <= _as_of)
          AND (tv.effective_to IS NULL OR tv.effective_to >= _as_of)
   WHERE t.is_active
     AND upper(t.metric_key) = upper(_metric_code)
     AND (t.sector_id IS NULL OR t.sector_id = _sector_id)
     AND (t.effective_from IS NULL OR t.effective_from <= _as_of)
     AND (t.effective_to IS NULL OR t.effective_to >= _as_of)
   ORDER BY (t.sector_id IS NULL), tv.effective_from DESC NULLS LAST, tv.version DESC NULLS LAST
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.prudential_resolve_threshold(text, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prudential_resolve_threshold(text, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.prudential_resolve_threshold(text, uuid, date) TO authenticated, service_role;

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
BEGIN
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
          COALESCE(_trigger_kind, 'manual'), COALESCE(_actor, auth.uid()), 'RUNNING', v_config)
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
              th.threshold_version::text, v.entity_id, v.filing_id, v.version_id,
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

  PERFORM public.log_compliance_audit_as_actor(
    COALESCE(_actor, auth.uid()),
    'INTEGRATION_EVENT'::public.compliance_audit_action,
    'prudential_detection_run',
    v_run_id::text,
    NULL,
    jsonb_build_object('entity_id', v.entity_id, 'filing_reference', v.filing_reference,
                       'period_end', v_period_end, 'metrics_evaluated', v_metrics,
                       'breaches', v_breaches, 'warnings', v_warnings, 'ewi', v_ewi),
    'A2 canonical prudential detection run',
    NULL, NULL, NULL,
    jsonb_build_object('trigger_kind', COALESCE(_trigger_kind, 'manual'),
                       'engine_version', 'a2.canonical.v1'));

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

REVOKE ALL ON FUNCTION public._prudential_canonical_detect_run(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._prudential_canonical_detect_run(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._prudential_canonical_detect_run(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._prudential_canonical_detect_run(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prudential_canonical_detect(
  _return_filing_version_id uuid,
  _trigger_kind text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_entity uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT rf.entity_id INTO v_entity
    FROM public.return_filing_versions rfv
    JOIN public.return_filings rf ON rf.id = rfv.return_filing_id
   WHERE rfv.id = _return_filing_version_id;

  IF v_entity IS NULL THEN
    RAISE EXCEPTION 'A2: canonical filing version % not found', _return_filing_version_id;
  END IF;

  IF NOT public.can_read_prudential_entity(auth.uid(), v_entity) THEN
    RAISE EXCEPTION 'Not authorised to run prudential detection for this entity';
  END IF;

  RETURN public._prudential_canonical_detect_run(
    _return_filing_version_id,
    COALESCE(_trigger_kind, 'manual'),
    auth.uid());
END $fn$;

REVOKE ALL ON FUNCTION public.prudential_canonical_detect(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prudential_canonical_detect(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.prudential_canonical_detect(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_prudential_detect_on_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.status = 'ACCEPTED' AND COALESCE(OLD.status, '') <> 'ACCEPTED' THEN
    BEGIN
      PERFORM public._prudential_canonical_detect_run(NEW.id, 'filing_accepted', auth.uid());
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.prudential_detection_runs
        (entity_id, return_filing_version_id, status, trigger_kind, error_detail, completed_at)
      SELECT rf.entity_id, NEW.id, 'FAILED', 'filing_accepted', SQLERRM, now()
        FROM public.return_filings rf WHERE rf.id = NEW.return_filing_id;
    END;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_prudential_detect_on_acceptance ON public.return_filing_versions;
CREATE TRIGGER trg_prudential_detect_on_acceptance
  AFTER UPDATE OF status ON public.return_filing_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_prudential_detect_on_acceptance();

CREATE OR REPLACE FUNCTION public.a2_detection_reset_nonproduction()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_enabled boolean;
  v_b int; v_a int; v_r int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a super administrator may reset detection outcomes';
  END IF;

  SELECT reset_enabled INTO v_enabled FROM public.cert_nonproduction_guard LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION 'Non-production reset is disabled for this environment';
  END IF;

  DELETE FROM public.return_threshold_breaches WHERE detection_source = 'CANONICAL_ENGINE';
  GET DIAGNOSTICS v_b = ROW_COUNT;
  DELETE FROM public.prudential_ewi_alerts WHERE detection_source = 'CANONICAL_ENGINE';
  GET DIAGNOSTICS v_a = ROW_COUNT;
  DELETE FROM public.prudential_detection_runs;
  GET DIAGNOSTICS v_r = ROW_COUNT;

  RETURN jsonb_build_object('breaches_deleted', v_b, 'alerts_deleted', v_a, 'runs_deleted', v_r);
END $fn$;

REVOKE ALL ON FUNCTION public.a2_detection_reset_nonproduction() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.a2_detection_reset_nonproduction() FROM anon;
GRANT EXECUTE ON FUNCTION public.a2_detection_reset_nonproduction() TO authenticated, service_role;