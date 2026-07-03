
-- =========================================================
-- Phase 6 Gap 1: multi-regulator F&P determinations
-- =========================================================
ALTER TABLE public.fp_determinations
  ADD COLUMN IF NOT EXISTS regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fp_det_regulator
  ON public.fp_determinations(regulator_id, individual_id, is_current);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_det_current_per_regulator
  ON public.fp_determinations(individual_id, assessment_id, regulator_id)
  WHERE is_current = true;

-- =========================================================
-- Phase 6 Gap 2: sector-specific F&P decision rule sets
-- =========================================================
CREATE TABLE IF NOT EXISTS public.fp_sector_decision_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  sub_sector_id UUID REFERENCES public.sub_sectors(id) ON DELETE CASCADE,
  role_type TEXT,
  name TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale_template_id UUID REFERENCES public.decision_rationale_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_sector_decision_rules TO authenticated;
GRANT ALL ON public.fp_sector_decision_rules TO service_role;
ALTER TABLE public.fp_sector_decision_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fp_sdr_sector
  ON public.fp_sector_decision_rules(sector_id, sub_sector_id, role_type)
  WHERE is_active = true;

DROP POLICY IF EXISTS "authenticated read fp sector rules" ON public.fp_sector_decision_rules;
CREATE POLICY "authenticated read fp sector rules"
  ON public.fp_sector_decision_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff manage fp sector rules" ON public.fp_sector_decision_rules;
CREATE POLICY "staff manage fp sector rules"
  ON public.fp_sector_decision_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE OR REPLACE FUNCTION public._fp_sdr_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_fp_sdr_touch ON public.fp_sector_decision_rules;
CREATE TRIGGER trg_fp_sdr_touch BEFORE UPDATE ON public.fp_sector_decision_rules
  FOR EACH ROW EXECUTE FUNCTION public._fp_sdr_touch();

-- =========================================================
-- Phase 6 Gap 4: prudential early-warning view
-- =========================================================
CREATE OR REPLACE VIEW public.v_prudential_early_warnings
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    rcr.ratio_key,
    rcr.value,
    rcr.computed_at,
    rf.entity_id AS licensee_id,
    rf.sector_id,
    s.regulator_id,
    ROW_NUMBER() OVER (
      PARTITION BY rf.entity_id, rcr.ratio_key
      ORDER BY rcr.computed_at DESC
    ) AS rn
  FROM public.return_calculated_ratios rcr
  JOIN public.returns_filed rf ON rf.id = rcr.return_id
  LEFT JOIN public.sectors s ON s.id = rf.sector_id
  WHERE rcr.value IS NOT NULL
    AND rf.entity_id IS NOT NULL
),
latest_ratios AS (SELECT * FROM ranked WHERE rn = 1),
prev_ratios   AS (SELECT * FROM ranked WHERE rn = 2),
breach_counts AS (
  SELECT rf.entity_id AS licensee_id, rtb.metric_key AS ratio_key, COUNT(*)::int AS breach_count
  FROM public.return_threshold_breaches rtb
  JOIN public.returns_filed rf ON rf.id = rtb.return_id
  WHERE rtb.detected_at > now() - interval '180 days'
    AND rf.entity_id IS NOT NULL
  GROUP BY rf.entity_id, rtb.metric_key
)
SELECT
  l.id AS licensee_id,
  l.name AS licensee_name,
  latest.regulator_id,
  latest.sector_id,
  latest.ratio_key,
  latest.value AS current_value,
  prev.value AS previous_value,
  CASE
    WHEN prev.value IS NULL OR prev.value = 0 THEN NULL
    ELSE ROUND(((latest.value - prev.value) / ABS(prev.value)) * 100, 2)
  END AS delta_pct,
  COALESCE(bc.breach_count, 0) AS recent_breach_count,
  CASE
    WHEN COALESCE(bc.breach_count, 0) >= 2 THEN 'critical'
    WHEN prev.value IS NOT NULL AND prev.value <> 0
         AND ABS((latest.value - prev.value) / prev.value) > 0.20 THEN 'warning'
    WHEN prev.value IS NOT NULL AND prev.value <> 0
         AND ABS((latest.value - prev.value) / prev.value) > 0.10 THEN 'watch'
    ELSE 'ok'
  END AS warning_level,
  latest.computed_at AS last_seen
FROM latest_ratios latest
JOIN public.licensees l ON l.id = latest.licensee_id
LEFT JOIN prev_ratios prev
  ON prev.licensee_id = latest.licensee_id
 AND prev.ratio_key = latest.ratio_key
LEFT JOIN breach_counts bc
  ON bc.licensee_id = latest.licensee_id
 AND bc.ratio_key = latest.ratio_key;

GRANT SELECT ON public.v_prudential_early_warnings TO authenticated;
GRANT ALL  ON public.v_prudential_early_warnings TO service_role;
