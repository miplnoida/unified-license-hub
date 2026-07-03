-- Complaints: snapshot + override + failure tracking
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS triage_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS triage_result_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS triage_override_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS triage_last_error text;

CREATE INDEX IF NOT EXISTS idx_complaints_product_id ON public.complaints(product_id);
CREATE INDEX IF NOT EXISTS idx_complaints_channel_id ON public.complaints(channel_id);
CREATE INDEX IF NOT EXISTS idx_complaints_conduct_cat ON public.complaints(conduct_risk_category_id);
CREATE INDEX IF NOT EXISTS idx_complaints_licensee_id ON public.complaints(licensee_id);
CREATE INDEX IF NOT EXISTS idx_complaints_severity_status ON public.complaints(severity, status);
CREATE INDEX IF NOT EXISTS idx_complaints_priority_status ON public.complaints(priority, status);
CREATE INDEX IF NOT EXISTS idx_complaints_sla_due ON public.complaints(sla_due_at) WHERE resolved_at IS NULL;

-- Triage rules bookkeeping
ALTER TABLE public.conduct_triage_rules
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE INDEX IF NOT EXISTS idx_triage_rules_active_prio ON public.conduct_triage_rules(active, priority_order);

-- Alert dedupe + rule linkage
ALTER TABLE public.conduct_alerts
  ADD COLUMN IF NOT EXISTS triage_rule_id uuid REFERENCES public.conduct_triage_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Only enforce uniqueness for non-closed alerts, so once closed a re-generation is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conduct_alerts_dedupe_open
  ON public.conduct_alerts(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_conduct_alerts_status_sev ON public.conduct_alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_conduct_alerts_licensee ON public.conduct_alerts(licensee_id);
CREATE INDEX IF NOT EXISTS idx_conduct_alerts_product ON public.conduct_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_conduct_alerts_channel ON public.conduct_alerts(channel_id);
CREATE INDEX IF NOT EXISTS idx_conduct_alerts_category ON public.conduct_alerts(conduct_risk_category_id);
CREATE INDEX IF NOT EXISTS idx_conduct_alerts_rule ON public.conduct_alerts(triage_rule_id);