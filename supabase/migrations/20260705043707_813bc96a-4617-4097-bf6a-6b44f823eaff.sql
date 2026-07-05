
-- Extend allowed assessment types
ALTER TABLE public.fp_assessments DROP CONSTRAINT IF EXISTS fp_assessments_assessment_type_check;
ALTER TABLE public.fp_assessments ADD CONSTRAINT fp_assessments_assessment_type_check
  CHECK (assessment_type = ANY (ARRAY[
    'initial','renewal','change_of_role','triggered','ongoing_monitoring',
    'material_change','adverse_event','cycle'
  ]));

-- Unique national_id
CREATE UNIQUE INDEX IF NOT EXISTS fp_individuals_national_id_uniq
  ON public.fp_individuals (national_id)
  WHERE national_id IS NOT NULL;

-- Evidence urls on findings
ALTER TABLE public.fp_findings ADD COLUMN IF NOT EXISTS evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Reminder tracking on conditions
ALTER TABLE public.fp_conditions ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- License link on appeals
ALTER TABLE public.fp_appeals ADD COLUMN IF NOT EXISTS license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fp_appeals_license ON public.fp_appeals (license_id) WHERE license_id IS NOT NULL;
