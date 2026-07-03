
CREATE TABLE public.conduct_risk_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  description text,
  severity_hint text CHECK (severity_hint IN ('low','medium','high','critical')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_risk_categories TO authenticated;
GRANT ALL ON public.conduct_risk_categories TO service_role;
ALTER TABLE public.conduct_risk_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read conduct risk categories" ON public.conduct_risk_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage conduct risk categories" ON public.conduct_risk_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TABLE public.conduct_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  sub_sector_id uuid REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_products TO authenticated;
GRANT ALL ON public.conduct_products TO service_role;
ALTER TABLE public.conduct_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read conduct products" ON public.conduct_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage conduct products" ON public.conduct_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TABLE public.conduct_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('digital','branch','agent','call_center','broker','other')),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_channels TO authenticated;
GRANT ALL ON public.conduct_channels TO service_role;
ALTER TABLE public.conduct_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read conduct channels" ON public.conduct_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage conduct channels" ON public.conduct_channels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TABLE public.conduct_triage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  priority_order int NOT NULL DEFAULT 100,
  match_mode text NOT NULL DEFAULT 'all' CHECK (match_mode IN ('all','any')),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_triage_rules TO authenticated;
GRANT ALL ON public.conduct_triage_rules TO service_role;
ALTER TABLE public.conduct_triage_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read conduct triage rules" ON public.conduct_triage_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Manage conduct triage rules" ON public.conduct_triage_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS conduct_risk_category_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.conduct_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.conduct_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_type text CHECK (customer_type IN ('retail','sme','corporate','vulnerable','other')),
  ADD COLUMN IF NOT EXISTS vulnerability_indicator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vulnerability_notes text,
  ADD COLUMN IF NOT EXISTS repeat_complaint_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('p1','p2','p3','p4')),
  ADD COLUMN IF NOT EXISTS assigned_team text,
  ADD COLUMN IF NOT EXISTS sla_days int,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS triage_source text CHECK (triage_source IN ('manual','auto','override')),
  ADD COLUMN IF NOT EXISTS triage_rule_id uuid REFERENCES public.conduct_triage_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_product ON public.complaints(product_id);
CREATE INDEX IF NOT EXISTS idx_complaints_channel ON public.complaints(channel_id);
CREATE INDEX IF NOT EXISTS idx_complaints_conduct_cat ON public.complaints(conduct_risk_category_id);
CREATE INDEX IF NOT EXISTS idx_complaints_sla_due ON public.complaints(sla_due_at);

CREATE OR REPLACE FUNCTION public.set_complaint_repeat_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.complainant_id IS NOT NULL AND NEW.licensee_id IS NOT NULL THEN
    SELECT COUNT(*) INTO NEW.repeat_complaint_count
    FROM public.complaints
    WHERE complainant_id = NEW.complainant_id
      AND licensee_id = NEW.licensee_id
      AND created_at > (now() - interval '12 months')
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_complaint_repeat_count ON public.complaints;
CREATE TRIGGER trg_complaint_repeat_count BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_complaint_repeat_count();

CREATE TABLE public.conduct_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.conduct_products(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.conduct_channels(id) ON DELETE SET NULL,
  conduct_risk_category_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('repeat_complaint','vulnerable_customer','critical_severity','thematic_spike','sla_breach')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')),
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by text NOT NULL DEFAULT 'triage_engine' CHECK (generated_by IN ('triage_engine','thematic_sweep','manual','sla_cron')),
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conduct_alerts_status ON public.conduct_alerts(status);
CREATE INDEX idx_conduct_alerts_licensee ON public.conduct_alerts(licensee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_alerts TO authenticated;
GRANT ALL ON public.conduct_alerts TO service_role;
ALTER TABLE public.conduct_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read conduct alerts" ON public.conduct_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Manage conduct alerts" ON public.conduct_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TABLE public.conduct_alert_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('thematic_spike','repeat_complaint','vulnerable_customer','critical_severity')),
  window_days int NOT NULL DEFAULT 30,
  threshold_count int NOT NULL DEFAULT 5,
  severity text NOT NULL DEFAULT 'high' CHECK (severity IN ('low','medium','high','critical')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_alert_thresholds TO authenticated;
GRANT ALL ON public.conduct_alert_thresholds TO service_role;
ALTER TABLE public.conduct_alert_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read alert thresholds" ON public.conduct_alert_thresholds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Manage alert thresholds" ON public.conduct_alert_thresholds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public._touch_conduct_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_conduct_risk_cats_updated BEFORE UPDATE ON public.conduct_risk_categories FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
CREATE TRIGGER trg_conduct_products_updated BEFORE UPDATE ON public.conduct_products FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
CREATE TRIGGER trg_conduct_channels_updated BEFORE UPDATE ON public.conduct_channels FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
CREATE TRIGGER trg_conduct_triage_rules_updated BEFORE UPDATE ON public.conduct_triage_rules FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
CREATE TRIGGER trg_conduct_alerts_updated BEFORE UPDATE ON public.conduct_alerts FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
CREATE TRIGGER trg_conduct_thresholds_updated BEFORE UPDATE ON public.conduct_alert_thresholds FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();

INSERT INTO public.conduct_risk_categories (code, name, severity_hint) VALUES
  ('MIS_SELLING','Mis-selling','high'),
  ('UNFAIR_TERMS','Unfair Terms','medium'),
  ('DISCLOSURE','Disclosure Failure','medium'),
  ('COMPLAINT_HANDLING','Complaint Handling','medium'),
  ('DATA_PRIVACY','Data Privacy','high'),
  ('VULNERABLE_CUSTOMER','Vulnerable Customer Treatment','high'),
  ('FEES_CHARGES','Fees & Charges','medium'),
  ('ADVERTISING','Advertising & Marketing','medium'),
  ('SALES_CONDUCT','Sales Conduct','high')
ON CONFLICT DO NOTHING;

INSERT INTO public.conduct_channels (code, name, kind) VALUES
  ('BRANCH','Branch','branch'),
  ('DIGITAL_WEB','Web / Online','digital'),
  ('MOBILE_APP','Mobile App','digital'),
  ('CALL_CENTER','Call Center','call_center'),
  ('AGENT','Tied Agent','agent'),
  ('BROKER','Broker','broker')
ON CONFLICT DO NOTHING;

INSERT INTO public.conduct_alert_thresholds (kind, window_days, threshold_count, severity) VALUES
  ('thematic_spike', 30, 5, 'high'),
  ('thematic_spike', 90, 15, 'high')
ON CONFLICT DO NOTHING;
