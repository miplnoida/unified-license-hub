
ALTER TABLE public.approval_workflow_types
  ADD COLUMN IF NOT EXISTS bulk_intake_enabled BOOLEAN NOT NULL DEFAULT false;
