-- ============================================================
-- PHASE 10: DATA LINEAGE + EXPORT GOVERNANCE
-- ============================================================

-- 1. Field-level diff helper -----------------------------------
CREATE OR REPLACE FUNCTION public.jsonb_changed_fields(_before jsonb, _after jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[])
  FROM (
    SELECT k
    FROM jsonb_object_keys(COALESCE(_before, '{}'::jsonb) || COALESCE(_after, '{}'::jsonb)) AS k
    WHERE COALESCE(_before -> k, 'null'::jsonb) IS DISTINCT FROM COALESCE(_after -> k, 'null'::jsonb)
  ) s;
$$;

-- 2. Lineage authorization ------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_lineage(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND (
       public.has_role(_user_id, 'super_admin'::app_role)
       OR public.has_role(_user_id, 'admin'::app_role)
       OR (public.is_internal_staff(_user_id)
           AND (public.has_permission(_user_id, 'audit_management', 'view')
                OR public.has_permission(_user_id, 'audit_management', 'export')))
     );
$$;

-- 3. Record lineage --------------------------------------------
CREATE OR REPLACE FUNCTION public.record_lineage(
  _object_type text,
  _object_id text,
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  source text,
  event_at timestamptz,
  actor_id uuid,
  actor_role text,
  action text,
  before_value jsonb,
  after_value jsonb,
  changed_fields text[],
  justification text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_lineage(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view data lineage';
  END IF;
  IF _object_type IS NULL OR _object_id IS NULL THEN
    RAISE EXCEPTION 'object_type and object_id are required';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT 'compliance_audit_logs'::text AS source,
           COALESCE(cal.timestamp, cal.created_at) AS event_at,
           cal.user_id AS actor_id,
           cal.user_role AS actor_role,
           cal.action_type::text AS action,
           cal.before_value,
           cal.after_value,
           public.jsonb_changed_fields(cal.before_value, cal.after_value) AS changed_fields,
           cal.justification,
           cal.metadata
    FROM public.compliance_audit_logs cal
    WHERE cal.object_type = _object_type AND cal.object_id = _object_id
    UNION ALL
    SELECT 'audit_logs'::text,
           al.created_at,
           al.user_id,
           al.user_role,
           al.action,
           al.old_value,
           al.new_value,
           public.jsonb_changed_fields(al.old_value, al.new_value),
           NULL::text,
           al.metadata
    FROM public.audit_logs al
    WHERE al.entity_type = _object_type AND al.entity_id = _object_id
  ) merged
  ORDER BY merged.event_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 200), 1000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_lineage(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_lineage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_changed_fields(jsonb, jsonb) TO authenticated;

-- 4. Export governance columns ---------------------------------
ALTER TABLE public.audit_export_jobs
  ADD COLUMN IF NOT EXISTS justification text,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_downloaded_at timestamptz;

-- 5. Download register -----------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_export_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.audit_export_jobs(id) ON DELETE CASCADE,
  downloaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_export_downloads TO authenticated;
GRANT ALL ON public.audit_export_downloads TO service_role;
ALTER TABLE public.audit_export_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Export downloads visible to owner or audit admin" ON public.audit_export_downloads;
CREATE POLICY "Export downloads visible to owner or audit admin"
ON public.audit_export_downloads FOR SELECT TO authenticated
USING (downloaded_by = auth.uid() OR public.can_view_lineage(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_audit_export_downloads_job
  ON public.audit_export_downloads(job_id, downloaded_at DESC);

-- 6. Governed export creation ----------------------------------
CREATE OR REPLACE FUNCTION public.request_export_job(
  _source text,
  _justification text,
  _from_date timestamptz DEFAULT NULL,
  _to_date timestamptz DEFAULT NULL,
  _module_filter text DEFAULT NULL,
  _export_format text DEFAULT 'csv',
  _filters jsonb DEFAULT NULL,
  _row_count integer DEFAULT NULL,
  _file_path text DEFAULT NULL,
  _file_hash text DEFAULT NULL,
  _retention_days integer DEFAULT 90
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _source IS NULL OR btrim(_source) = '' THEN
    RAISE EXCEPTION 'Export source is required';
  END IF;
  IF _justification IS NULL OR length(btrim(_justification)) < 10 THEN
    RAISE EXCEPTION 'A justification of at least 10 characters is required for regulated data exports';
  END IF;

  INSERT INTO public.audit_export_jobs (
    requested_by, source, from_date, to_date, module_filter, status,
    row_count, file_path, file_hash, filters, export_format,
    justification, retention_expires_at, completed_at
  ) VALUES (
    v_uid, _source, _from_date, _to_date, _module_filter,
    CASE WHEN _row_count IS NULL THEN 'pending' ELSE 'completed' END,
    _row_count, _file_path, _file_hash, _filters, COALESCE(_export_format, 'csv'),
    btrim(_justification),
    now() + (GREATEST(1, LEAST(COALESCE(_retention_days, 90), 3650)) || ' days')::interval,
    CASE WHEN _row_count IS NULL THEN NULL ELSE now() END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_export_job(text, text, timestamptz, timestamptz, text, text, jsonb, integer, text, text, integer) TO authenticated;

-- 7. Download logging -----------------------------------------
CREATE OR REPLACE FUNCTION public.log_export_download(_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT requested_by INTO v_owner FROM public.audit_export_jobs WHERE id = _job_id;
  IF v_owner IS NULL AND NOT EXISTS (SELECT 1 FROM public.audit_export_jobs WHERE id = _job_id) THEN
    RAISE EXCEPTION 'Export job not found';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid AND NOT public.can_view_lineage(v_uid) THEN
    RAISE EXCEPTION 'Not authorized to download this export';
  END IF;

  INSERT INTO public.audit_export_downloads (job_id, downloaded_by)
  VALUES (_job_id, v_uid)
  RETURNING id INTO v_id;

  UPDATE public.audit_export_jobs
     SET download_count = COALESCE(download_count, 0) + 1,
         last_downloaded_at = now()
   WHERE id = _job_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_export_download(uuid) TO authenticated;

-- 8. Retention housekeeping ------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_audit_exports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH del AS (
    DELETE FROM public.audit_export_jobs
    WHERE retention_expires_at IS NOT NULL AND retention_expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM del;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_audit_exports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_exports() TO service_role;

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_retention
  ON public.audit_export_jobs(retention_expires_at);
