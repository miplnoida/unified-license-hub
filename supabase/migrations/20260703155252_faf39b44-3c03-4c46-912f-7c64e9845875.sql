
-- Phase 5E: extend audit_export_jobs for centralized export tracking (Gap 18)
ALTER TABLE public.audit_export_jobs
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS filters JSONB,
  ADD COLUMN IF NOT EXISTS export_format TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_requested_by
  ON public.audit_export_jobs(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_source
  ON public.audit_export_jobs(source, created_at DESC);

-- Allow any authenticated user to log their own export event so the central
-- helper works everywhere; keep read/admin manage scoped to staff.
DROP POLICY IF EXISTS "Users log their own exports" ON public.audit_export_jobs;
CREATE POLICY "Users log their own exports"
ON public.audit_export_jobs FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "Users see their own exports" ON public.audit_export_jobs;
CREATE POLICY "Users see their own exports"
ON public.audit_export_jobs FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'supervisor')
);
