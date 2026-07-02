
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  channels jsonb NOT NULL DEFAULT '{"email":true,"sms":false,"in_app":true}'::jsonb,
  categories jsonb NOT NULL DEFAULT '{"breaches":true,"enforcement":true,"complaints":true,"returns":true,"fit_and_proper":true,"correspondence":true,"system":true}'::jsonb,
  digest_enabled boolean NOT NULL DEFAULT false,
  digest_time time NOT NULL DEFAULT '08:00',
  digest_timezone text NOT NULL DEFAULT 'UTC',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification prefs" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.notification_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  item_count integer NOT NULL DEFAULT 0,
  categories_included text[] NOT NULL DEFAULT '{}',
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_digest_log_user ON public.notification_digest_log(user_id, sent_at DESC);
GRANT SELECT, INSERT ON public.notification_digest_log TO authenticated;
GRANT ALL ON public.notification_digest_log TO service_role;
ALTER TABLE public.notification_digest_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own digest log" ON public.notification_digest_log
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service inserts digest log" ON public.notification_digest_log
  FOR INSERT WITH CHECK (true);
