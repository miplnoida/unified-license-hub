
-- Phase 1 platform primitives:
-- 1) integration_logs table for inbound/outbound integration observability (DPA-009)
-- 2) notification_dispatch_log.acknowledged_at + acknowledged_by for PRUD-009 acknowledgements
-- 3) sla_escalation_dispatches ledger so the SLA escalation sweep is idempotent

-- 1. INTEGRATION LOGS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction       text NOT NULL CHECK (direction IN ('inbound','outbound')),
  integration_key text NOT NULL,
  endpoint        text,
  method          text,
  status          text NOT NULL CHECK (status IN ('success','failure','pending')),
  http_status     integer,
  actor_id        uuid,
  entity_type     text,
  entity_id       uuid,
  request_summary text,
  response_summary text,
  error           text,
  duration_ms     integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_logs TO authenticated;
GRANT ALL    ON public.integration_logs TO service_role;

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin / admin can read the log; edge functions write via service_role.
CREATE POLICY "integration_logs admin read"
  ON public.integration_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at
  ON public.integration_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration_key
  ON public.integration_logs (integration_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_entity
  ON public.integration_logs (entity_type, entity_id);

-- 2. NOTIFICATION ACKNOWLEDGEMENT --------------------------------------------
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

-- 3. SLA ESCALATION DISPATCH LEDGER ------------------------------------------
-- Prevents the SLA sweep from re-dispatching the same tier repeatedly.
CREATE TABLE IF NOT EXISTS public.sla_escalation_dispatches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id  uuid NOT NULL,
  entity_type           text NOT NULL,
  entity_id             uuid NOT NULL,
  process_type          text NOT NULL,
  tier                  integer NOT NULL,
  dispatched_at         timestamptz NOT NULL DEFAULT now(),
  recipients            text,
  sla_deadline          timestamptz,
  overdue_by_seconds    integer,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_instance_id, tier)
);

GRANT SELECT ON public.sla_escalation_dispatches TO authenticated;
GRANT ALL    ON public.sla_escalation_dispatches TO service_role;

ALTER TABLE public.sla_escalation_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla escalation dispatches admin read"
  ON public.sla_escalation_dispatches
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_sla_esc_dispatch_wf
  ON public.sla_escalation_dispatches (workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_sla_esc_dispatch_recent
  ON public.sla_escalation_dispatches (dispatched_at DESC);
