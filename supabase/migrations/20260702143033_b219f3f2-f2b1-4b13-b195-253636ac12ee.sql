
CREATE TABLE IF NOT EXISTS public.entity_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  period_key TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  band TEXT NOT NULL DEFAULT 'low',
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  computed_by UUID,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ers_entity ON public.entity_risk_scores(entity_id);
CREATE INDEX IF NOT EXISTS idx_ers_period ON public.entity_risk_scores(period_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ers_entity_period ON public.entity_risk_scores(entity_id, period_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_risk_scores TO authenticated;
GRANT ALL ON public.entity_risk_scores TO service_role;

ALTER TABLE public.entity_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can read risk scores"
  ON public.entity_risk_scores FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'analyst'::app_role)
    OR public.has_role(auth.uid(), 'legal_compliance'::app_role)
  );

CREATE POLICY "Internal can write risk scores"
  ON public.entity_risk_scores FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE TRIGGER trg_ers_updated_at BEFORE UPDATE ON public.entity_risk_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.risk_score_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  weights JSONB NOT NULL DEFAULT jsonb_build_object(
    'prudential_breaches', 25,
    'open_complaints', 15,
    'overdue_returns', 15,
    'open_enforcement', 20,
    'inspection_findings', 15,
    'fp_alerts', 10
  ),
  band_thresholds JSONB NOT NULL DEFAULT jsonb_build_object(
    'medium', 25,
    'high', 50,
    'critical', 75
  ),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_score_weights TO authenticated;
GRANT ALL ON public.risk_score_weights TO service_role;
ALTER TABLE public.risk_score_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read weights" ON public.risk_score_weights FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'analyst'::app_role)
    OR public.has_role(auth.uid(), 'legal_compliance'::app_role)
  );
CREATE POLICY "Admins manage weights" ON public.risk_score_weights FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_rsw_updated_at BEFORE UPDATE ON public.risk_score_weights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.risk_score_weights (name) VALUES ('default') ON CONFLICT DO NOTHING;
