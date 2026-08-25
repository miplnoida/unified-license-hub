CREATE TABLE IF NOT EXISTS public.public_intake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'complaint',
  email text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.public_intake_events TO service_role;
ALTER TABLE public.public_intake_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public intake events readable by staff" ON public.public_intake_events;
CREATE POLICY "public intake events readable by staff"
  ON public.public_intake_events FOR SELECT TO authenticated
  USING (public.sec_is_internal_user(auth.uid()));

CREATE INDEX IF NOT EXISTS public_intake_events_email_idx
  ON public.public_intake_events(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS public_intake_events_ip_idx
  ON public.public_intake_events(ip_hash, created_at DESC);
