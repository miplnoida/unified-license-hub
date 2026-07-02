
-- 4.2 Prudential breach inbox: extend breaches with acknowledgement + escalation columns
ALTER TABLE public.return_threshold_breaches
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS acknowledgement_note text,
  ADD COLUMN IF NOT EXISTS escalated_enforcement_id uuid REFERENCES public.enforcement_actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_by uuid REFERENCES auth.users(id);

-- Allow authenticated staff to update acknowledgement/escalation fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'return_threshold_breaches'
      AND policyname = 'Staff can update breaches'
  ) THEN
    EXECUTE 'CREATE POLICY "Staff can update breaches" ON public.return_threshold_breaches FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

GRANT SELECT, UPDATE ON public.return_threshold_breaches TO authenticated;
GRANT ALL ON public.return_threshold_breaches TO service_role;

CREATE INDEX IF NOT EXISTS idx_return_threshold_breaches_open
  ON public.return_threshold_breaches(detected_at DESC)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_return_threshold_breaches_return_id
  ON public.return_threshold_breaches(return_id);
