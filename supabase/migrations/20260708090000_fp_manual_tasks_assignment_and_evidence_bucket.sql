-- ─────────────────────────────────────────────────────────────────────────────
-- Manual Review Queue (/fpa/manual-tasks) fixes:
--
-- 1. Assignment: fp_findings had no assigned_to column, so the manual review
--    queue could only ever record who last "claimed" a task via reviewed_by
--    (hardcoded to the current user). Add a real assigned_to column so any
--    internal staff member can assign a task to any other internal staff
--    member.
--
-- 2. Evidence upload: FpaManualTaskDetail.tsx has always uploaded to a
--    'fp-evidence' storage bucket that was never created by any migration,
--    so every upload attempt fails with "Bucket not found". Create it as a
--    private bucket (this is FP screening evidence — sanctions/criminal
--    history documents — not something to expose via public URLs) with RLS
--    scoped to internal FP staff roles, mirroring the review queue's
--    shared-team access pattern rather than the per-user-folder pattern used
--    by the general-purpose secure-documents bucket.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fp_findings ADD COLUMN IF NOT EXISTS assigned_to UUID;
CREATE INDEX IF NOT EXISTS idx_fp_findings_assigned_to ON public.fp_findings(assigned_to);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fp-evidence', 'fp-evidence', false, 20971520,
  ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Internal FP staff upload fp-evidence" ON storage.objects;
CREATE POLICY "Internal FP staff upload fp-evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fp-evidence' AND (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'licensing_officer') OR
    public.has_role(auth.uid(), 'analyst')
  )
);

DROP POLICY IF EXISTS "Internal FP staff read fp-evidence" ON storage.objects;
CREATE POLICY "Internal FP staff read fp-evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fp-evidence' AND (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'licensing_officer') OR
    public.has_role(auth.uid(), 'analyst')
  )
);

DROP POLICY IF EXISTS "Internal FP staff delete fp-evidence" ON storage.objects;
CREATE POLICY "Internal FP staff delete fp-evidence"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'fp-evidence' AND (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor')
  )
);
