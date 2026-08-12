ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS analysis_type text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS scope_id uuid,
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS input_fingerprint text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS feedback text,
  ADD COLUMN IF NOT EXISTS feedback_by uuid,
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ai_insights_scope
  ON public.ai_insights(module, analysis_type, scope, scope_id, generated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_insights_feedback_chk'
  ) THEN
    ALTER TABLE public.ai_insights
      ADD CONSTRAINT ai_insights_feedback_chk
      CHECK (feedback IS NULL OR feedback IN ('helpful','not_helpful','flagged'));
  END IF;
END $$;

DROP POLICY IF EXISTS ai_insights_read_prudential ON public.ai_insights;
CREATE POLICY ai_insights_read_prudential ON public.ai_insights
  FOR SELECT TO authenticated
  USING (
    module = 'prudential'
    AND public.has_permission(auth.uid(), 'prudential_supervision', 'view')
  );

DROP POLICY IF EXISTS ai_insights_insert_prudential ON public.ai_insights;
CREATE POLICY ai_insights_insert_prudential ON public.ai_insights
  FOR INSERT TO authenticated
  WITH CHECK (
    module = 'prudential'
    AND public.has_permission(auth.uid(), 'prudential_supervision', 'view')
  );

DROP POLICY IF EXISTS ai_insights_feedback_update ON public.ai_insights;
CREATE POLICY ai_insights_feedback_update ON public.ai_insights
  FOR UPDATE TO authenticated
  USING (
    module = 'prudential'
    AND public.has_permission(auth.uid(), 'prudential_supervision', 'view')
  )
  WITH CHECK (
    module = 'prudential'
    AND public.has_permission(auth.uid(), 'prudential_supervision', 'view')
  );

GRANT SELECT, INSERT, UPDATE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;