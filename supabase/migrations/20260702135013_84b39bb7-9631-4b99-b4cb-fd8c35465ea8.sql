
-- 4.4 Supervisory plan execution — approval flow + action audit fields
ALTER TABLE public.supervisory_plans
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_for_review_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisory_plans_approval_status_chk') THEN
    ALTER TABLE public.supervisory_plans
      ADD CONSTRAINT supervisory_plans_approval_status_chk
      CHECK (approval_status IN ('draft','pending_review','approved','rejected'));
  END IF;
END $$;

ALTER TABLE public.supervisory_plan_actions
  ADD COLUMN IF NOT EXISTS previous_due_date date,
  ADD COLUMN IF NOT EXISTS extension_reason text,
  ADD COLUMN IF NOT EXISTS reassigned_from text,
  ADD COLUMN IF NOT EXISTS reassigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS reassigned_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_supervisory_plan_actions_due ON public.supervisory_plan_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_supervisory_plan_actions_status ON public.supervisory_plan_actions(status);
CREATE INDEX IF NOT EXISTS idx_supervisory_plans_approval_status ON public.supervisory_plans(approval_status);
