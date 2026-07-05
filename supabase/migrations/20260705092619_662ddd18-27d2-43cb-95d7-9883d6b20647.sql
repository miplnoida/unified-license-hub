
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1) Risk taxonomy
CREATE TABLE IF NOT EXISTS public.prudential_risk_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.prudential_risk_taxonomy(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_risk_taxonomy TO authenticated;
GRANT ALL ON public.prudential_risk_taxonomy TO service_role;
ALTER TABLE public.prudential_risk_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxonomy_read_all_auth" ON public.prudential_risk_taxonomy FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxonomy_write_admin" ON public.prudential_risk_taxonomy FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_ptaxonomy_updated BEFORE UPDATE ON public.prudential_risk_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.prudential_risk_taxonomy (code, label, description, sort_order) VALUES
  ('capital','Capital','Capital adequacy and solvency',10),
  ('liquidity','Liquidity','Liquidity and funding',20),
  ('asset_quality','Asset Quality','Asset quality and impairments',30),
  ('profitability','Profitability','Earnings and profitability',40),
  ('concentration','Concentration','Concentration and large exposures',50),
  ('governance','Governance','Governance and controls',60),
  ('operational_resilience','Operational Resilience','Operational and tech resilience',70),
  ('other','Other','Other configurable prudential risks',80)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.prudential_ratios ADD COLUMN IF NOT EXISTS taxonomy_code TEXT;
ALTER TABLE public.prudential_thresholds ADD COLUMN IF NOT EXISTS taxonomy_code TEXT;

-- 2) Assessments
CREATE TABLE IF NOT EXISTS public.prudential_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  return_id UUID REFERENCES public.returns_filed(id) ON DELETE SET NULL,
  period_start DATE,
  period_end DATE,
  overall_rating TEXT,
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  conclusion TEXT,
  recommended_response TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed','approved','closed')),
  override_reason TEXT,
  auto_suggested_rating TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_assessments TO authenticated;
GRANT ALL ON public.prudential_assessments TO service_role;
ALTER TABLE public.prudential_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assess_internal_all" ON public.prudential_assessments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'));
CREATE POLICY "assess_licensee_read" ON public.prudential_assessments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entity_user_access eua
    WHERE eua.entity_id = prudential_assessments.entity_id AND eua.user_id = auth.uid()));
CREATE TRIGGER trg_passess_updated BEFORE UPDATE ON public.prudential_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_passess_entity ON public.prudential_assessments(entity_id);
CREATE INDEX IF NOT EXISTS idx_passess_return ON public.prudential_assessments(return_id);
CREATE INDEX IF NOT EXISTS idx_passess_status ON public.prudential_assessments(status);

-- 3) Actions ledger
CREATE TABLE IF NOT EXISTS public.prudential_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('return_breach','assessment','manual','escalation','stress_indicator')),
  source_id UUID,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  due_date DATE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_contact TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','overdue','completed','waived','cancelled')),
  completion_notes TEXT,
  waiver_reason TEXT,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_actions TO authenticated;
GRANT ALL ON public.prudential_actions TO service_role;
ALTER TABLE public.prudential_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pactions_internal_all" ON public.prudential_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'));
CREATE POLICY "pactions_licensee_read" ON public.prudential_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entity_user_access eua
    WHERE eua.entity_id = prudential_actions.entity_id AND eua.user_id = auth.uid()));
CREATE TRIGGER trg_pactions_updated BEFORE UPDATE ON public.prudential_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_pactions_entity ON public.prudential_actions(entity_id);
CREATE INDEX IF NOT EXISTS idx_pactions_status ON public.prudential_actions(status);
CREATE INDEX IF NOT EXISTS idx_pactions_due ON public.prudential_actions(due_date);

-- 4) Escalations
CREATE TABLE IF NOT EXISTS public.prudential_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  related_type TEXT NOT NULL CHECK (related_type IN ('entity','return','assessment','action')),
  related_id UUID,
  escalation_type TEXT NOT NULL,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','withdrawn')),
  decision TEXT,
  outcome TEXT,
  decision_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_escalations TO authenticated;
GRANT ALL ON public.prudential_escalations TO service_role;
ALTER TABLE public.prudential_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pesc_internal_all" ON public.prudential_escalations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'));
CREATE TRIGGER trg_pesc_updated BEFORE UPDATE ON public.prudential_escalations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_pesc_entity ON public.prudential_escalations(entity_id);
CREATE INDEX IF NOT EXISTS idx_pesc_status ON public.prudential_escalations(status);

-- 5) Stress indicators + events
CREATE TABLE IF NOT EXISTS public.prudential_stress_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL,
  label TEXT NOT NULL,
  taxonomy_code TEXT,
  threshold_value NUMERIC NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('gt','lt','gte','lte','eq')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  sub_sector_id UUID REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notify_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalate BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_stress_indicators TO authenticated;
GRANT ALL ON public.prudential_stress_indicators TO service_role;
ALTER TABLE public.prudential_stress_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stress_read_auth" ON public.prudential_stress_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "stress_write_admin" ON public.prudential_stress_indicators FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_stress_updated BEFORE UPDATE ON public.prudential_stress_indicators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.prudential_stress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES public.prudential_stress_indicators(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.licensees(id) ON DELETE CASCADE,
  return_id UUID REFERENCES public.returns_filed(id) ON DELETE SET NULL,
  observed_value NUMERIC,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, return_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_stress_events TO authenticated;
GRANT ALL ON public.prudential_stress_events TO service_role;
ALTER TABLE public.prudential_stress_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stress_evt_internal" ON public.prudential_stress_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'));
CREATE INDEX IF NOT EXISTS idx_stress_evt_entity ON public.prudential_stress_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_stress_evt_return ON public.prudential_stress_events(return_id);

-- 6) Data feed logs
CREATE TABLE IF NOT EXISTS public.prudential_data_feed_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  feed_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','success','failed','retried')),
  row_count INT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  related_return_id UUID REFERENCES public.returns_filed(id) ON DELETE SET NULL,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prudential_data_feed_logs TO authenticated;
GRANT ALL ON public.prudential_data_feed_logs TO service_role;
ALTER TABLE public.prudential_data_feed_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_logs_internal" ON public.prudential_data_feed_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst'));
CREATE INDEX IF NOT EXISTS idx_feed_logs_started ON public.prudential_data_feed_logs(started_at DESC);

-- 7) RPCs
CREATE OR REPLACE FUNCTION public.mark_prudential_actions_overdue()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  UPDATE public.prudential_actions
     SET status = 'overdue', updated_at = now()
   WHERE status IN ('open','in_progress')
     AND due_date IS NOT NULL AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_prudential_actions_overdue() TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_stress_indicators_for_return(_return_id UUID)
RETURNS SETOF public.prudential_stress_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; ind RECORD; ent UUID; match BOOLEAN;
BEGIN
  SELECT rf.entity_id INTO ent FROM public.returns_filed rf WHERE rf.id = _return_id;
  FOR ind IN SELECT * FROM public.prudential_stress_indicators WHERE is_active LOOP
    FOR r IN SELECT * FROM public.return_calculated_ratios
              WHERE return_id = _return_id AND ratio_key = ind.metric_key LOOP
      match := CASE ind.direction
        WHEN 'gt' THEN r.value > ind.threshold_value
        WHEN 'lt' THEN r.value < ind.threshold_value
        WHEN 'gte' THEN r.value >= ind.threshold_value
        WHEN 'lte' THEN r.value <= ind.threshold_value
        WHEN 'eq' THEN r.value = ind.threshold_value
        ELSE false END;
      IF match THEN
        INSERT INTO public.prudential_stress_events (indicator_id, entity_id, return_id, observed_value)
        VALUES (ind.id, ent, _return_id, r.value)
        ON CONFLICT (indicator_id, return_id) DO UPDATE SET observed_value = EXCLUDED.observed_value;
      END IF;
    END LOOP;
  END LOOP;
  RETURN QUERY SELECT * FROM public.prudential_stress_events WHERE return_id = _return_id;
END $$;
GRANT EXECUTE ON FUNCTION public.evaluate_stress_indicators_for_return(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.prudential_dashboard_metrics()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_entities', (SELECT count(*) FROM public.licensees),
    'open_actions', (SELECT count(*) FROM public.prudential_actions WHERE status IN ('open','in_progress')),
    'overdue_actions', (SELECT count(*) FROM public.prudential_actions WHERE status = 'overdue'),
    'recent_breaches', (SELECT count(*) FROM public.return_threshold_breaches WHERE detected_at > now() - interval '30 days'),
    'stress_events_30d', (SELECT count(*) FROM public.prudential_stress_events WHERE triggered_at > now() - interval '30 days'),
    'open_escalations', (SELECT count(*) FROM public.prudential_escalations WHERE status IN ('open','under_review')),
    'assessments_draft', (SELECT count(*) FROM public.prudential_assessments WHERE status = 'draft'),
    'assessments_approved_30d', (SELECT count(*) FROM public.prudential_assessments WHERE status = 'approved' AND approved_at > now() - interval '30 days')
  )
$$;
GRANT EXECUTE ON FUNCTION public.prudential_dashboard_metrics() TO authenticated;
