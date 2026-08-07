-- =========================================================
-- PHASE 2 — PRUDENTIAL SUPERVISORY INTELLIGENCE
-- =========================================================

-- ---------- A. Explicit ratio result states ----------
-- return_calculated_ratios is append-only (tg_prevent_audit_mutation), so the
-- state is a GENERATED column: no backfill UPDATE and no insert-time trigger.
CREATE OR REPLACE FUNCTION public.derive_ratio_result_state(_value numeric, _null_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _value IS NOT NULL THEN 'CALCULATED'
    WHEN _null_reason IN ('missing_input','missing_ratio_dependency') THEN 'INSUFFICIENT_DATA'
    WHEN _null_reason IN ('not_configured','no_ratio_config') THEN 'NOT_CONFIGURED'
    WHEN _null_reason IS NOT NULL THEN 'CALCULATION_ERROR'
    ELSE 'INSUFFICIENT_DATA'
  END;
$$;

ALTER TABLE public.return_calculated_ratios
  ADD COLUMN IF NOT EXISTS result_state text
  GENERATED ALWAYS AS (public.derive_ratio_result_state(value, null_reason)) STORED;

-- ---------- B. Peer comparison with minimum-sample gate ----------
DROP FUNCTION IF EXISTS public.peer_ratio_snapshot(date, text, uuid);

CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(
  _period_end date,
  _ratio_key text,
  _sector_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _min_peers integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sector uuid := _sector_id;
  v_category uuid := NULL;
  v_entity_value numeric := NULL;
  v_count int := 0;
  v_min int := GREATEST(COALESCE(_min_peers, 5), 1);
  v_stats jsonb;
  v_below int := 0;
  v_pct numeric := NULL;
BEGIN
  IF _entity_id IS NOT NULL THEN
    SELECT COALESCE(_sector_id, l.sector_id), l.category_id
      INTO v_sector, v_category
      FROM public.licensees l WHERE l.id = _entity_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _peer_tmp (entity_id uuid, value numeric) ON COMMIT DROP;
  DELETE FROM _peer_tmp;

  INSERT INTO _peer_tmp (entity_id, value)
  SELECT DISTINCT ON (rf.entity_id)
         rf.entity_id, rcr.value
    FROM public.return_calculated_ratios rcr
    JOIN public.returns_filed rf ON rf.id = rcr.return_id
    JOIN public.licensees l ON l.id = rf.entity_id
   WHERE rcr.ratio_key = _ratio_key
     AND rf.period_end_date = _period_end
     AND rcr.value IS NOT NULL
     AND (v_sector IS NULL OR l.sector_id = v_sector)
     AND (v_category IS NULL OR l.category_id = v_category)
   ORDER BY rf.entity_id, rcr.computed_at DESC;

  SELECT COUNT(*) INTO v_count FROM _peer_tmp;

  IF _entity_id IS NOT NULL THEN
    SELECT value INTO v_entity_value FROM _peer_tmp WHERE entity_id = _entity_id;
  END IF;

  IF v_count < v_min THEN
    RETURN jsonb_build_object(
      'ratio_key', _ratio_key, 'period_end', _period_end,
      'state', 'INSUFFICIENT_PEER_DATA', 'peer_count', v_count,
      'min_peers', v_min, 'count', v_count,
      'entity_value', v_entity_value,
      'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category)
    );
  END IF;

  SELECT jsonb_build_object(
           'min', MIN(value), 'max', MAX(value),
           'median', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value),
           'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value),
           'p90', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY value),
           'average', AVG(value))
    INTO v_stats FROM _peer_tmp;

  IF v_entity_value IS NOT NULL THEN
    SELECT COUNT(*) INTO v_below FROM _peer_tmp WHERE value < v_entity_value;
    v_pct := ROUND((v_below::numeric / v_count::numeric) * 10000) / 100;
  END IF;

  RETURN v_stats
    || jsonb_build_object(
         'ratio_key', _ratio_key, 'period_end', _period_end,
         'state', 'OK', 'peer_count', v_count, 'count', v_count,
         'min_peers', v_min, 'entity_value', v_entity_value,
         'percentile', v_pct,
         'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category));
END $$;

REVOKE ALL ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) TO authenticated, service_role;

-- ---------- C. Early Warning Indicators ----------
CREATE TABLE IF NOT EXISTS public.prudential_ewi_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  rule_type text NOT NULL CHECK (rule_type IN ('repeated_breach','multi_ratio_warning','sharp_deterioration','adverse_trend','late_return')),
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.prudential_ewi_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.prudential_ewi_rules TO authenticated;
GRANT ALL ON public.prudential_ewi_rules TO service_role;
ALTER TABLE public.prudential_ewi_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prudential_ewi_rules_read ON public.prudential_ewi_rules;
CREATE POLICY prudential_ewi_rules_read ON public.prudential_ewi_rules
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'prudential_supervision', 'view')
         OR public.has_permission(auth.uid(), 'prudential_supervision', 'view_all_entities')
         OR public.can_manage_prudential_config(auth.uid()));

DROP POLICY IF EXISTS prudential_ewi_rules_write ON public.prudential_ewi_rules;
CREATE POLICY prudential_ewi_rules_write ON public.prudential_ewi_rules
  FOR ALL TO authenticated
  USING (public.can_manage_prudential_config(auth.uid()))
  WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE TABLE IF NOT EXISTS public.prudential_ewi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.prudential_ewi_rules(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  rule_version integer NOT NULL DEFAULT 1,
  period_end date,
  metric_key text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','dismissed','resolved')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prudential_ewi_alerts_dedup UNIQUE (entity_id, rule_id, period_end, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_pewi_alerts_entity ON public.prudential_ewi_alerts (entity_id, executed_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.prudential_ewi_alerts TO authenticated;
GRANT ALL ON public.prudential_ewi_alerts TO service_role;
ALTER TABLE public.prudential_ewi_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prudential_ewi_alerts_read ON public.prudential_ewi_alerts;
CREATE POLICY prudential_ewi_alerts_read ON public.prudential_ewi_alerts
  FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));

DROP POLICY IF EXISTS prudential_ewi_alerts_insert ON public.prudential_ewi_alerts;
CREATE POLICY prudential_ewi_alerts_insert ON public.prudential_ewi_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_act_on_prudential(auth.uid())
              AND public.can_read_prudential_entity(auth.uid(), entity_id));

DROP POLICY IF EXISTS prudential_ewi_alerts_update ON public.prudential_ewi_alerts;
CREATE POLICY prudential_ewi_alerts_update ON public.prudential_ewi_alerts
  FOR UPDATE TO authenticated
  USING (public.can_act_on_prudential(auth.uid())
         AND public.can_read_prudential_entity(auth.uid(), entity_id))
  WITH CHECK (public.can_act_on_prudential(auth.uid())
              AND public.can_read_prudential_entity(auth.uid(), entity_id));

INSERT INTO public.prudential_ewi_rules (code, name, description, rule_type, params, severity)
VALUES
 ('EWI_REPEATED_BREACH','Repeated threshold breach','Same metric in breach in at least N of the last M reporting periods.','repeated_breach','{"min_breaches":2,"lookback_periods":3}','high'),
 ('EWI_MULTI_WARNING','Multiple ratios in warning','At least N ratios are in warning state for the same reporting period.','multi_ratio_warning','{"min_warnings":3}','medium'),
 ('EWI_SHARP_DETERIORATION','Sharp deterioration','A ratio moved adversely by at least the configured percentage versus the prior period.','sharp_deterioration','{"min_change_pct":20}','high'),
 ('EWI_ADVERSE_TREND','Adverse multi-period trend','A ratio declined in each of the last N consecutive periods.','adverse_trend','{"periods":3}','medium'),
 ('EWI_LATE_RETURN','Late or missing return','No submitted return for the period, or submitted after the due date.','late_return','{}','medium')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prudential_ewi_evaluate(_entity_id uuid, _period_end date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.prudential_ewi_rules;
  v_created int := 0;
  v_refreshed int := 0;
  v_alert_id uuid;
  v_existing uuid;
  rec record;
BEGIN
  IF NOT public.can_read_prudential_entity(auth.uid(), _entity_id) THEN
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
          SELECT rf.id, rf.period_end_date
            FROM public.returns_filed rf
           WHERE rf.entity_id = _entity_id AND rf.period_end_date <= _period_end
           ORDER BY rf.period_end_date DESC
           LIMIT COALESCE((r.params->>'lookback_periods')::int, 3)
        )
        SELECT b.metric_key, COUNT(*)::int AS hits,
               jsonb_agg(jsonb_build_object('return_id', b.return_id, 'value', b.value,
                                            'threshold_value', b.threshold_value,
                                            'threshold_version', b.threshold_version)) AS ev
          FROM public.return_threshold_breaches b
          JOIN periods p ON p.id = b.return_id
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
          JOIN public.returns_filed rf ON rf.id = b.return_id
         WHERE rf.entity_id = _entity_id AND rf.period_end_date = _period_end
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
          SELECT DISTINCT ON (rf.period_end_date, rcr.ratio_key)
                 rcr.ratio_key, rf.period_end_date, rcr.value
            FROM public.return_calculated_ratios rcr
            JOIN public.returns_filed rf ON rf.id = rcr.return_id
           WHERE rf.entity_id = _entity_id
             AND rf.period_end_date <= _period_end
             AND rcr.value IS NOT NULL
           ORDER BY rf.period_end_date, rcr.ratio_key, rcr.computed_at DESC
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
      SELECT id INTO v_existing FROM public.returns_filed
       WHERE entity_id = _entity_id AND period_end_date = _period_end
         AND workflow_status IN ('SUB','VAL','TBR')
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
    PERFORM public.log_compliance_audit(
      'CREATE'::public.compliance_audit_action, 'prudential_ewi_evaluation', _entity_id::text,
      NULL, jsonb_build_object('period_end', _period_end, 'alerts', v_created), NULL, NULL, NULL,
      jsonb_build_object('source', 'prudential_ewi_evaluate'));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('entity_id', _entity_id, 'period_end', _period_end,
                            'alerts_written', v_created, 'refreshed', v_refreshed,
                            'executed_at', now());
END $$;

REVOKE ALL ON FUNCTION public.prudential_ewi_evaluate(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_ewi_evaluate(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_ewi_acknowledge(_alert_id uuid, _notes text DEFAULT NULL, _status text DEFAULT 'acknowledged')
RETURNS public.prudential_ewi_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.prudential_ewi_alerts;
BEGIN
  SELECT * INTO a FROM public.prudential_ewi_alerts WHERE id = _alert_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'alert not found'; END IF;
  IF NOT (public.can_act_on_prudential(auth.uid())
          AND public.can_read_prudential_entity(auth.uid(), a.entity_id)) THEN
    RAISE EXCEPTION 'not authorised to acknowledge this alert';
  END IF;
  IF _status NOT IN ('acknowledged','dismissed','resolved') THEN
    RAISE EXCEPTION 'invalid status %', _status;
  END IF;

  UPDATE public.prudential_ewi_alerts
     SET status = _status, notes = COALESCE(_notes, notes),
         acknowledged_by = auth.uid(), acknowledged_at = now(), updated_at = now()
   WHERE id = _alert_id
  RETURNING * INTO a;

  BEGIN
    PERFORM public.log_compliance_audit(
      'UPDATE'::public.compliance_audit_action, 'prudential_ewi_alert', _alert_id::text,
      NULL, jsonb_build_object('status', _status, 'notes', _notes), _notes, NULL, NULL,
      jsonb_build_object('source', 'prudential_ewi_acknowledge'));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN a;
END $$;

REVOKE ALL ON FUNCTION public.prudential_ewi_acknowledge(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_ewi_acknowledge(uuid, text, text) TO authenticated, service_role;

-- ---------- D. CAMELS assessment structure ----------
CREATE TABLE IF NOT EXISTS public.prudential_assessment_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prudential_assessment_components_code_sector_uq
  ON public.prudential_assessment_components (code, COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_assessment_components TO authenticated;
GRANT ALL ON public.prudential_assessment_components TO service_role;
ALTER TABLE public.prudential_assessment_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prudential_assessment_components_read ON public.prudential_assessment_components;
CREATE POLICY prudential_assessment_components_read ON public.prudential_assessment_components
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'prudential_supervision', 'view')
         OR public.has_permission(auth.uid(), 'prudential_supervision', 'view_all_entities')
         OR public.can_act_on_prudential(auth.uid())
         OR public.can_manage_prudential_config(auth.uid()));

DROP POLICY IF EXISTS prudential_assessment_components_write ON public.prudential_assessment_components;
CREATE POLICY prudential_assessment_components_write ON public.prudential_assessment_components
  FOR ALL TO authenticated
  USING (public.can_manage_prudential_config(auth.uid()))
  WITH CHECK (public.can_manage_prudential_config(auth.uid()));

INSERT INTO public.prudential_assessment_components (code, label, description, sort_order)
VALUES
 ('C','Capital adequacy','Sufficiency of capital relative to risk exposures.',1),
 ('A','Asset quality','Credit quality, impairment and concentration of assets.',2),
 ('M','Management','Governance, risk management and control effectiveness.',3),
 ('E','Earnings','Quality, level and sustainability of earnings.',4),
 ('L','Liquidity','Liquidity position, funding profile and contingency.',5),
 ('S','Sensitivity to market risk','Exposure to interest rate, FX and market movements.',6)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.prudential_assessment_component_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.prudential_assessments(id) ON DELETE CASCADE,
  component_id uuid REFERENCES public.prudential_assessment_components(id) ON DELETE SET NULL,
  component_code text NOT NULL,
  rating text,
  auto_suggested_rating text,
  suggestion_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  override_justification text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prudential_assessment_component_uq UNIQUE (assessment_id, component_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_assessment_component_ratings TO authenticated;
GRANT ALL ON public.prudential_assessment_component_ratings TO service_role;
ALTER TABLE public.prudential_assessment_component_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pacr_read ON public.prudential_assessment_component_ratings;
CREATE POLICY pacr_read ON public.prudential_assessment_component_ratings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.prudential_assessments a
                  WHERE a.id = assessment_id
                    AND public.can_read_prudential_entity(auth.uid(), a.entity_id)));

DROP POLICY IF EXISTS pacr_insert ON public.prudential_assessment_component_ratings;
CREATE POLICY pacr_insert ON public.prudential_assessment_component_ratings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_act_on_prudential(auth.uid())
              AND EXISTS (SELECT 1 FROM public.prudential_assessments a
                           WHERE a.id = assessment_id
                             AND public.can_read_prudential_entity(auth.uid(), a.entity_id)));

DROP POLICY IF EXISTS pacr_update ON public.prudential_assessment_component_ratings;
CREATE POLICY pacr_update ON public.prudential_assessment_component_ratings
  FOR UPDATE TO authenticated
  USING (public.can_act_on_prudential(auth.uid())
         AND EXISTS (SELECT 1 FROM public.prudential_assessments a
                      WHERE a.id = assessment_id
                        AND public.can_read_prudential_entity(auth.uid(), a.entity_id)))
  WITH CHECK (public.can_act_on_prudential(auth.uid()));

DROP POLICY IF EXISTS pacr_delete ON public.prudential_assessment_component_ratings;
CREATE POLICY pacr_delete ON public.prudential_assessment_component_ratings
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'prudential_supervision', 'delete'));

-- returned_for_revision state
ALTER TABLE public.prudential_assessments DROP CONSTRAINT IF EXISTS prudential_assessments_status_check;
ALTER TABLE public.prudential_assessments
  ADD CONSTRAINT prudential_assessments_status_check
  CHECK (status IN ('draft','submitted','reviewed','returned_for_revision','approved','closed'));

-- Finalised assessments are immutable (applies to every role, service_role included)
CREATE OR REPLACE FUNCTION public.tg_prudential_assessment_finalised_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved','closed') THEN
      RAISE EXCEPTION 'finalised prudential assessment % cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('approved','closed') THEN
    RAISE EXCEPTION 'finalised prudential assessment % is immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prudential_assessment_finalised_guard ON public.prudential_assessments;
CREATE TRIGGER trg_prudential_assessment_finalised_guard
BEFORE UPDATE OR DELETE ON public.prudential_assessments
FOR EACH ROW EXECUTE FUNCTION public.tg_prudential_assessment_finalised_guard();

CREATE OR REPLACE FUNCTION public.tg_pacr_finalised_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.prudential_assessments
   WHERE id = COALESCE(NEW.assessment_id, OLD.assessment_id);
  IF v_status IN ('approved','closed') THEN
    RAISE EXCEPTION 'component ratings of a finalised assessment are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_pacr_finalised_guard ON public.prudential_assessment_component_ratings;
CREATE TRIGGER trg_pacr_finalised_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.prudential_assessment_component_ratings
FOR EACH ROW EXECUTE FUNCTION public.tg_pacr_finalised_guard();

-- ---------- E. Group consolidation data state ----------
ALTER TABLE public.group_consolidated_snapshots
  ADD COLUMN IF NOT EXISTS data_state text,
  ADD COLUMN IF NOT EXISTS excluded_members jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.group_consolidated_snapshots
    ADD CONSTRAINT group_consolidated_snapshots_data_state_check
    CHECK (data_state IN ('COMPLETE_GROUP_DATA','PARTIAL_GROUP_DATA','NO_GROUP_DATA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.group_data_coverage(_group_id uuid, _period_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_missing jsonb := '[]'::jsonb;
  v_missing_count int := 0;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.financial_group_members m
   WHERE m.group_id = _group_id AND m.consolidation_treatment <> 'excluded'
     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'licensee_id', m.licensee_id,
           'name', l.name,
           'reason', 'no_return_data_for_period')), '[]'::jsonb),
         COUNT(*)
    INTO v_missing, v_missing_count
    FROM public.financial_group_members m
    JOIN public.licensees l ON l.id = m.licensee_id
   WHERE m.group_id = _group_id AND m.consolidation_treatment <> 'excluded'
     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
     AND NOT EXISTS (
       SELECT 1 FROM public.returns_filed rf
        JOIN public.return_calculated_ratios rcr ON rcr.return_id = rf.id
       WHERE rf.entity_id = m.licensee_id
         AND rf.return_year = NULLIF(split_part(_period_key,'-',1),'')::int
         AND rf.return_period = split_part(_period_key,'-',2));

  RETURN jsonb_build_object(
    'members_total', v_total,
    'members_missing', v_missing_count,
    'members_with_data', GREATEST(v_total - v_missing_count, 0),
    'excluded_members', v_missing,
    'data_state', CASE
      WHEN v_total = 0 OR v_missing_count >= v_total THEN 'NO_GROUP_DATA'
      WHEN v_missing_count > 0 THEN 'PARTIAL_GROUP_DATA'
      ELSE 'COMPLETE_GROUP_DATA' END);
END $$;

REVOKE ALL ON FUNCTION public.group_data_coverage(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_data_coverage(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_group_snapshot_data_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  v := public.group_data_coverage(NEW.group_id, NEW.period_key);
  NEW.data_state := v->>'data_state';
  NEW.excluded_members := COALESCE(v->'excluded_members', '[]'::jsonb);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_group_snapshot_data_state ON public.group_consolidated_snapshots;
CREATE TRIGGER trg_group_snapshot_data_state
BEFORE INSERT OR UPDATE ON public.group_consolidated_snapshots
FOR EACH ROW EXECUTE FUNCTION public.tg_group_snapshot_data_state();
