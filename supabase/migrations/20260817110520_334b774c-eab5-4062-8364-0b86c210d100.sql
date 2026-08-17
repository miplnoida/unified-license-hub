ALTER TABLE public.application_ai_assessments
  ADD COLUMN IF NOT EXISTS business_assessment jsonb,
  ADD COLUMN IF NOT EXISTS data_integrity jsonb;