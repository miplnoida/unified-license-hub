
DROP FUNCTION IF EXISTS public.cleanup_orphaned_complaint_evidence(interval);

CREATE FUNCTION public.cleanup_orphaned_complaint_evidence(_older_than interval DEFAULT '24:00:00'::interval)
RETURNS TABLE(deleted_evidence_id uuid, file_upload_id uuid, bucket_name text, file_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'super_admin')
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH del AS (
    DELETE FROM public.complaint_evidence e
     WHERE e.finalized_at IS NULL
       AND e.staged_at < now() - _older_than
     RETURNING e.id, e.file_upload_id
  )
  SELECT del.id, del.file_upload_id, fu.bucket_name, fu.file_path
    FROM del
    LEFT JOIN public.file_uploads fu ON fu.id = del.file_upload_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.complaint_storage_cleanup_deadletter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid,
  file_upload_id uuid,
  bucket_name text,
  file_path text,
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.complaint_storage_cleanup_deadletter TO service_role;
GRANT SELECT ON public.complaint_storage_cleanup_deadletter TO authenticated;

ALTER TABLE public.complaint_storage_cleanup_deadletter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read deadletter" ON public.complaint_storage_cleanup_deadletter
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_deadletter_updated_at ON public.complaint_storage_cleanup_deadletter;
CREATE TRIGGER trg_deadletter_updated_at
  BEFORE UPDATE ON public.complaint_storage_cleanup_deadletter
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
