ALTER TABLE public.enforcement_actions
  ADD COLUMN IF NOT EXISTS notice_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_summary TEXT,
  ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_outcome TEXT,
  ADD COLUMN IF NOT EXISTS decision_rationale TEXT,
  ADD COLUMN IF NOT EXISTS appeal_deadline DATE,
  ADD COLUMN IF NOT EXISTS penalty_currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS penalty_paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_document_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opened_by UUID,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_reference_id UUID;

CREATE TABLE IF NOT EXISTS public.enforcement_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.enforcement_actions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  note TEXT,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enforcement_case_events TO authenticated;
GRANT ALL ON public.enforcement_case_events TO service_role;

ALTER TABLE public.enforcement_case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read enforcement case events"
  ON public.enforcement_case_events
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff manage enforcement case events"
  ON public.enforcement_case_events
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'analyst')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'analyst')
  );

CREATE INDEX IF NOT EXISTS enforcement_case_events_case_idx ON public.enforcement_case_events(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enforcement_actions_status_idx ON public.enforcement_actions(status, date_opened DESC);