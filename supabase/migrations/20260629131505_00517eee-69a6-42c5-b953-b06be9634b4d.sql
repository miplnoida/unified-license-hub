
ALTER TABLE public.application_ai_assessments
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analyst_decision text,
  ADD COLUMN IF NOT EXISTS analyst_decision_action text,
  ADD COLUMN IF NOT EXISTS analyst_justification text,
  ADD COLUMN IF NOT EXISTS analyst_decision_by uuid,
  ADD COLUMN IF NOT EXISTS analyst_decision_at timestamptz;
