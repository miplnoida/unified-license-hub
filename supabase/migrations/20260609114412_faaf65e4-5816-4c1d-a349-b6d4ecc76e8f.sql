
-- Add report_run_id column for clearer semantics (report_id kept for backward compatibility)
ALTER TABLE public.report_logs ADD COLUMN IF NOT EXISTS report_run_id uuid;

-- Backfill from legacy report_id
UPDATE public.report_logs
SET report_run_id = report_id
WHERE report_run_id IS NULL AND report_id IS NOT NULL;

-- FK best-effort (NOT VALID so existing rows aren't blocked)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_logs_report_run_id_fkey'
  ) THEN
    ALTER TABLE public.report_logs
      ADD CONSTRAINT report_logs_report_run_id_fkey
      FOREIGN KEY (report_run_id) REFERENCES public.reports(id) ON DELETE SET NULL NOT VALID;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_report_logs_report_run_id ON public.report_logs (report_run_id);
CREATE INDEX IF NOT EXISTS idx_report_logs_report_id ON public.report_logs (report_id);

-- Ensure an insert policy exists scoped to the caller (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_logs' AND policyname = 'Insert own report logs'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "Insert own report logs"
        ON public.report_logs FOR INSERT TO authenticated
        WITH CHECK (executed_by = auth.uid())
    $POL$;
  END IF;
END$$;
