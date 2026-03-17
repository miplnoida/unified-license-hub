
-- Extend approval_workflows to support multiple entity types and category scoping
ALTER TABLE public.approval_workflows 
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- Create index for entity_type lookups
CREATE INDEX IF NOT EXISTS idx_approval_workflows_entity_type ON public.approval_workflows(entity_type);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_sector_id ON public.approval_workflows(sector_id);

-- Extend approval_steps with allowed actions and escalation
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS allowed_actions jsonb NOT NULL DEFAULT '["approve", "reject", "send_back"]'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_role text,
  ADD COLUMN IF NOT EXISTS escalation_after_hours integer;

-- Create workflow_instances table to track active workflow executions per entity
CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  current_step_id uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON public.workflow_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON public.workflow_instances(status);

ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;

-- Admins manage workflow instances
CREATE POLICY "Admins manage workflow instances"
  ON public.workflow_instances FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'licensing_officer'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'licensing_officer'));

-- Anyone authenticated can read workflow instances (for viewing their own application status)
CREATE POLICY "Auth users read workflow instances"
  ON public.workflow_instances FOR SELECT TO authenticated
  USING (true);

-- Extend approval_actions to support entity-level tracking
ALTER TABLE public.approval_actions
  ADD COLUMN IF NOT EXISTS workflow_instance_id uuid REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'approve',
  ADD COLUMN IF NOT EXISTS sla_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;
