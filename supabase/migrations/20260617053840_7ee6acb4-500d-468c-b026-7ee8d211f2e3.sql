
CREATE TABLE IF NOT EXISTS public.business_calendar_process_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.business_calendar_profiles(id) ON DELETE CASCADE,
  process_type text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_calendar_process_assignments TO authenticated;
GRANT ALL ON public.business_calendar_process_assignments TO service_role;
ALTER TABLE public.business_calendar_process_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage calendar assignments" ON public.business_calendar_process_assignments;
CREATE POLICY "Admins manage calendar assignments"
  ON public.business_calendar_process_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read calendar assignments" ON public.business_calendar_process_assignments;
CREATE POLICY "Authenticated read calendar assignments"
  ON public.business_calendar_process_assignments FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS tg_bcpa_updated ON public.business_calendar_process_assignments;
CREATE TRIGGER tg_bcpa_updated BEFORE UPDATE ON public.business_calendar_process_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_sla();

ALTER TABLE public.business_calendar_profiles ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.business_calendar_holidays
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.sla_escalation_tiers
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

DROP TRIGGER IF EXISTS tg_bch_updated ON public.business_calendar_holidays;
CREATE TRIGGER tg_bch_updated BEFORE UPDATE ON public.business_calendar_holidays
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_sla();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bcp_working_hours_valid') THEN
    ALTER TABLE public.business_calendar_profiles
      ADD CONSTRAINT bcp_working_hours_valid CHECK (working_start_time < working_end_time);
  END IF;
END $$;

-- Validate working_days via trigger (CHECK can't contain subqueries)
CREATE OR REPLACE FUNCTION public.tg_validate_working_days()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d int;
BEGIN
  IF NEW.working_days IS NULL OR array_length(NEW.working_days,1) IS NULL THEN
    RAISE EXCEPTION 'working_days must contain at least one day (0=Sun..6=Sat)';
  END IF;
  IF array_length(NEW.working_days,1) > 7 THEN
    RAISE EXCEPTION 'working_days cannot exceed 7 entries';
  END IF;
  FOREACH d IN ARRAY NEW.working_days LOOP
    IF d < 0 OR d > 6 THEN
      RAISE EXCEPTION 'working_days entries must be between 0 (Sun) and 6 (Sat); got %', d;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_bcp_validate_working_days ON public.business_calendar_profiles;
CREATE TRIGGER tg_bcp_validate_working_days
  BEFORE INSERT OR UPDATE ON public.business_calendar_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_working_days();

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.sla_escalation_tiers'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tier%BETWEEN%'
  LOOP
    EXECUTE format('ALTER TABLE public.sla_escalation_tiers DROP CONSTRAINT %I', c);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sla_escalation_tier_range') THEN
    ALTER TABLE public.sla_escalation_tiers
      ADD CONSTRAINT sla_escalation_tier_range CHECK (tier BETWEEN 1 AND 3);
  END IF;
END $$;

INSERT INTO public.business_calendar_profiles (name, description, working_days, working_start_time, working_end_time, timezone, is_default)
VALUES
  ('BOJ Calendar', 'Bank of Jamaica default working calendar (Mon-Fri, 09:00-17:00)', ARRAY[1,2,3,4,5], '09:00', '17:00', 'America/Jamaica', false),
  ('FSC Calendar', 'Financial Services Commission default working calendar (Mon-Fri, 09:00-17:00)', ARRAY[1,2,3,4,5], '09:00', '17:00', 'America/Jamaica', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template,
   email_subject_template, email_body_template, channels, recipient_rules,
   notification_type, dedupe_window_seconds)
VALUES
  (
    'sla.configuration_updated',
    'SLA configuration was updated by an admin. Notify team leads, supervisors and admins.',
    'SLA updated: {{process_type}}',
    'SLA for "{{process_type}}" was updated by {{updated_by_email}}. {{change_summary}}',
    'SLA updated: {{process_type}}',
    E'Hi,\n\nThe SLA configuration for "{{process_type}}" was updated by {{updated_by_email}}.\n\nChange: {{change_summary}}\n\nNote: New SLA values apply only to new cases or newly entered workflow stages. In-progress timers are not recalculated.\n\nOpen the SLA Manager to review: {{app_url}}/admin/sla-manager',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"team_lead"},{"type":"role","role":"supervisor"},{"type":"role","role":"admin"},{"type":"role","role":"super_admin"}]'::jsonb,
    'info',
    60
  )
ON CONFLICT (event_key) DO UPDATE SET
  description            = EXCLUDED.description,
  title_template         = EXCLUDED.title_template,
  message_template       = EXCLUDED.message_template,
  email_subject_template = EXCLUDED.email_subject_template,
  email_body_template    = EXCLUDED.email_body_template,
  channels               = EXCLUDED.channels,
  recipient_rules        = EXCLUDED.recipient_rules,
  notification_type      = EXCLUDED.notification_type,
  dedupe_window_seconds  = EXCLUDED.dedupe_window_seconds,
  is_active              = true,
  updated_at             = now();
