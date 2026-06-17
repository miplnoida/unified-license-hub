
-- SLA Manager Configuration tables

-- Business calendar profiles
CREATE TABLE public.business_calendar_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  working_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun..6=Sat
  working_start_time time NOT NULL DEFAULT '09:00',
  working_end_time time NOT NULL DEFAULT '17:00',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_calendar_profiles TO authenticated;
GRANT ALL ON public.business_calendar_profiles TO service_role;
ALTER TABLE public.business_calendar_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar profiles" ON public.business_calendar_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read calendar profiles" ON public.business_calendar_profiles
  FOR SELECT TO authenticated USING (true);

-- Public holidays per calendar profile
CREATE TABLE public.business_calendar_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.business_calendar_profiles(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, holiday_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_calendar_holidays TO authenticated;
GRANT ALL ON public.business_calendar_holidays TO service_role;
ALTER TABLE public.business_calendar_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage holidays" ON public.business_calendar_holidays
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read holidays" ON public.business_calendar_holidays
  FOR SELECT TO authenticated USING (true);

-- SLA configurations (per process type / stage)
CREATE TABLE public.sla_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type text NOT NULL,
  stage_name text NOT NULL,
  sla_duration int NOT NULL CHECK (sla_duration > 0),
  sla_unit text NOT NULL DEFAULT 'hours' CHECK (sla_unit IN ('hours','days')),
  warning_threshold_pct int NOT NULL DEFAULT 75 CHECK (warning_threshold_pct BETWEEN 1 AND 100),
  pause_conditions text,
  escalation_recipient text,
  calendar_profile_id uuid REFERENCES public.business_calendar_profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_type, stage_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_configurations TO authenticated;
GRANT ALL ON public.sla_configurations TO service_role;
ALTER TABLE public.sla_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage SLA configs" ON public.sla_configurations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read SLA configs" ON public.sla_configurations
  FOR SELECT TO authenticated USING (true);

-- Escalation tiers per process type
CREATE TABLE public.sla_escalation_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type text NOT NULL,
  tier int NOT NULL CHECK (tier BETWEEN 1 AND 5),
  delay_days int NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  recipients text NOT NULL,
  notify_roles text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_type, tier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_escalation_tiers TO authenticated;
GRANT ALL ON public.sla_escalation_tiers TO service_role;
ALTER TABLE public.sla_escalation_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage escalation tiers" ON public.sla_escalation_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read escalation tiers" ON public.sla_escalation_tiers
  FOR SELECT TO authenticated USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at_sla()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tg_bcp_updated BEFORE UPDATE ON public.business_calendar_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_sla();
CREATE TRIGGER tg_sla_cfg_updated BEFORE UPDATE ON public.sla_configurations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_sla();
CREATE TRIGGER tg_sla_esc_updated BEFORE UPDATE ON public.sla_escalation_tiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_sla();

-- Seed default calendar profile
INSERT INTO public.business_calendar_profiles (name, description, is_default)
VALUES ('Default Calendar', 'Default Mon-Fri 9-5 working calendar', true)
ON CONFLICT (name) DO NOTHING;
