DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'business_calendar_profiles',
    'business_calendar_holidays',
    'business_calendar_process_assignments',
    'sla_configurations',
    'sla_escalation_tiers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN
      SELECT polname FROM pg_policy
      WHERE polrelid = ('public.'||t)::regclass
        AND polname IN (
          'Admins manage calendar profiles',
          'Admins manage holidays',
          'Admins manage SLA configs',
          'Admins manage escalation tiers',
          'Admins manage calendar assignments',
          'Admins or super_admins manage'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, t);
    END LOOP;

    EXECUTE format($f$
      CREATE POLICY "Admins or super_admins manage" ON public.%I
        FOR ALL TO authenticated
        USING  (public.has_role(auth.uid(), 'super_admin'::app_role)
             OR public.has_role(auth.uid(), 'admin'::app_role))
        WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role)
             OR public.has_role(auth.uid(), 'admin'::app_role))
    $f$, t);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.sla_process_team_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_type, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_process_team_leads TO authenticated;
GRANT ALL ON public.sla_process_team_leads TO service_role;
ALTER TABLE public.sla_process_team_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins or super_admins manage team leads" ON public.sla_process_team_leads;
CREATE POLICY "Admins or super_admins manage team leads"
  ON public.sla_process_team_leads FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'super_admin'::app_role)
       OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role)
       OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read team leads" ON public.sla_process_team_leads;
CREATE POLICY "Authenticated read team leads"
  ON public.sla_process_team_leads FOR SELECT TO authenticated USING (true);

INSERT INTO public.sla_escalation_tiers (process_type, tier, delay_days, recipients)
SELECT pt, 1, 0, 'assigned_officer, team_lead'
FROM (SELECT DISTINCT process_type AS pt FROM public.sla_configurations) s
ON CONFLICT (process_type, tier) DO NOTHING;

INSERT INTO public.sla_escalation_tiers (process_type, tier, delay_days, recipients)
SELECT pt, 2, 3, 'deputy_director'
FROM (SELECT DISTINCT process_type AS pt FROM public.sla_configurations) s
ON CONFLICT (process_type, tier) DO NOTHING;

INSERT INTO public.sla_escalation_tiers (process_type, tier, delay_days, recipients)
SELECT pt, 3, 7, 'director'
FROM (SELECT DISTINCT process_type AS pt FROM public.sla_configurations) s
ON CONFLICT (process_type, tier) DO NOTHING;

UPDATE public.notification_event_configs
SET recipient_rules = '[{"type":"sla_process_team_leads"}]'::jsonb,
    description = 'SLA / escalation configuration changed — notifies only team leads mapped to the affected process_type.'
WHERE event_key = 'sla.configuration_updated';

INSERT INTO public.business_calendar_profiles
  (name, description, working_days, working_start_time, working_end_time, timezone, is_default)
VALUES
  ('BOJ Calendar', 'Bank of Jamaica (Mon-Fri, 09:00-17:00)', ARRAY[1,2,3,4,5], '09:00', '17:00', 'America/Jamaica', false),
  ('FSC Calendar', 'Financial Services Commission (Mon-Fri, 09:00-17:00)', ARRAY[1,2,3,4,5], '09:00', '17:00', 'America/Jamaica', false)
ON CONFLICT (name) DO NOTHING;