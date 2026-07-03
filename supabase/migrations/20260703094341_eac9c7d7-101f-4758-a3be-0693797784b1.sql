
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS triage_original_values jsonb;

ALTER TABLE public.conduct_alerts
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS window_start timestamptz,
  ADD COLUMN IF NOT EXISTS window_end timestamptz;

ALTER TABLE public.conduct_alerts DROP CONSTRAINT IF EXISTS conduct_alerts_kind_check;
ALTER TABLE public.conduct_alerts
  ADD CONSTRAINT conduct_alerts_kind_check CHECK (kind = ANY (ARRAY[
    'repeat_complaint','vulnerable_customer','critical_severity',
    'thematic_spike','sla_breach','sla_at_risk',
    'rule_triggered','high_risk_category'
  ]));

CREATE TABLE IF NOT EXISTS public.conduct_triage_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE CASCADE,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  triggered_by text,
  dry_run boolean NOT NULL DEFAULT false,
  outcome text NOT NULL,
  matched_rule_id uuid,
  matched_rule_name text,
  rules_evaluated integer NOT NULL DEFAULT 0,
  evaluated_summary jsonb,
  input_snapshot jsonb,
  old_values jsonb,
  new_values jsonb,
  applied_outputs jsonb,
  alerts_generated jsonb,
  error_message text,
  function_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conduct_triage_audit_events TO authenticated;
GRANT ALL   ON public.conduct_triage_audit_events TO service_role;

ALTER TABLE public.conduct_triage_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read triage audit" ON public.conduct_triage_audit_events;
CREATE POLICY "Staff read triage audit"
  ON public.conduct_triage_audit_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'legal_compliance')
  );

CREATE INDEX IF NOT EXISTS idx_triage_audit_complaint ON public.conduct_triage_audit_events(complaint_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_audit_outcome   ON public.conduct_triage_audit_events(outcome, evaluated_at DESC);
