-- ============================================================
-- F0 PASS B6 — certification runner, upload scan lifecycle, cert diagnostics
-- ============================================================

-- ------------------------------------------------------------------
-- 1. GAP-F0-07 — dedicated certification execution role
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_certification_runner') THEN
    CREATE ROLE app_certification_runner NOLOGIN INHERIT;
  END IF;
END$$;

COMMENT ON ROLE app_certification_runner IS
  'F0 certification execution role. NOLOGIN. Used only by pgTAP/certification runs to build controlled fixtures, SET ROLE for persona simulation and EXECUTE certification routines. Never granted to application runtime roles (anon/authenticated/service_role).';

-- persona simulation (SET ROLE anon / authenticated inside pgTAP suites)
GRANT anon, authenticated TO app_certification_runner;

-- certification inspection + fixture construction
GRANT USAGE ON SCHEMA public TO app_certification_runner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_certification_runner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_certification_runner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_certification_runner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_certification_runner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_certification_runner;

-- only the non-browser sandbox/migration identities may assume it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT app_certification_runner TO sandbox_exec';
  END IF;
  EXECUTE 'GRANT app_certification_runner TO postgres';
END$$;

-- ------------------------------------------------------------------
-- 2. GAP-F0-14 — cert_v2_diag: explicit certification-only semantics
-- ------------------------------------------------------------------
REVOKE ALL ON public.cert_v2_diag FROM anon;
REVOKE ALL ON public.cert_v2_diag FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cert_v2_diag TO app_certification_runner;

DROP POLICY IF EXISTS "cert_v2_diag deny by default" ON public.cert_v2_diag;
CREATE POLICY "cert_v2_diag deny by default"
  ON public.cert_v2_diag FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public.cert_v2_diag IS
  'Certification-only diagnostic scratch table (GAP-F0-14). RLS is enabled with an explicit deny-by-default policy: no browser role may read or write it. Written only by privileged certification runs (app_certification_runner / service_role).';

-- ------------------------------------------------------------------
-- 3. GAP-F0-15 — upload malware-scan lifecycle (fail closed)
-- ------------------------------------------------------------------
ALTER TABLE public.file_uploads
  ADD COLUMN IF NOT EXISTS scan_provider text,
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_detail text;

-- legacy rows were asserted clean by the client without inspection: keep them
-- readable but mark their provenance truthfully.
UPDATE public.file_uploads
   SET scan_status = 'legacy_unverified',
       scan_detail = COALESCE(scan_detail, 'legacy row: marked clean by client without malware inspection')
 WHERE scan_status = 'clean' AND scan_provider IS NULL;

UPDATE public.file_uploads SET scan_status = 'pending_scan'
 WHERE scan_status IN ('pending', 'PENDING', '') OR scan_status IS NULL;

ALTER TABLE public.file_uploads ALTER COLUMN scan_status SET DEFAULT 'pending_scan';

ALTER TABLE public.file_uploads DROP CONSTRAINT IF EXISTS file_uploads_scan_status_chk;
ALTER TABLE public.file_uploads ADD CONSTRAINT file_uploads_scan_status_chk
  CHECK (scan_status IN ('pending_scan','scanning','clean','suspicious','infected','scan_error','quarantined','legacy_unverified'));

COMMENT ON COLUMN public.file_uploads.scan_status IS
  'Canonical scan lifecycle: pending_scan -> scanning -> clean | suspicious | infected | scan_error | quarantined. Clients may only ever write pending_scan; verdicts are recorded exclusively by public.file_upload_record_scan(). legacy_unverified marks pre-B6 rows that were never inspected.';

-- scan event ledger
CREATE TABLE IF NOT EXISTS public.file_upload_scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_upload_id uuid NOT NULL REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  provider text,
  detail text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.file_upload_scan_events TO authenticated;
GRANT ALL ON public.file_upload_scan_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_upload_scan_events TO app_certification_runner;
ALTER TABLE public.file_upload_scan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan events readable by owner or internal staff" ON public.file_upload_scan_events;
CREATE POLICY "scan events readable by owner or internal staff"
  ON public.file_upload_scan_events FOR SELECT TO authenticated
  USING (
    public.is_internal_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.file_uploads fu
       WHERE fu.id = file_upload_scan_events.file_upload_id
         AND fu.uploaded_by = auth.uid()
    )
  );

-- clients can never self-certify a file as clean
CREATE OR REPLACE FUNCTION public.file_uploads_scan_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin','app_certification_runner','sandbox_exec') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.scan_status IS DISTINCT FROM 'pending_scan' THEN
      NEW.scan_status := 'pending_scan';
      NEW.scan_provider := NULL;
      NEW.scanned_at := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.scan_status IS DISTINCT FROM OLD.scan_status THEN
    RAISE EXCEPTION 'scan_status may only be changed by the scanning worker'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_file_uploads_scan_status_guard ON public.file_uploads;
CREATE TRIGGER trg_file_uploads_scan_status_guard
  BEFORE INSERT OR UPDATE ON public.file_uploads
  FOR EACH ROW EXECUTE FUNCTION public.file_uploads_scan_status_guard();

-- verdict recorder (worker / privileged only)
CREATE OR REPLACE FUNCTION public.file_upload_record_scan(
  _file_upload_id uuid,
  _verdict text,
  _provider text DEFAULT NULL,
  _detail text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _from text; _uid uuid := auth.uid();
BEGIN
  IF NOT (current_user IN ('service_role','postgres','supabase_admin','app_certification_runner','sandbox_exec')
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'not_authorized: scan verdicts are recorded by the scanning worker only'
      USING ERRCODE = '42501';
  END IF;
  IF _verdict NOT IN ('scanning','clean','suspicious','infected','scan_error','quarantined') THEN
    RAISE EXCEPTION 'unsupported_verdict: %', _verdict USING ERRCODE = '22023';
  END IF;
  IF _verdict = 'clean' AND COALESCE(btrim(_provider),'') = '' THEN
    RAISE EXCEPTION 'provider_required: a file cannot be released clean without an inspecting provider'
      USING ERRCODE = '22023';
  END IF;

  SELECT scan_status INTO _from FROM public.file_uploads WHERE id = _file_upload_id FOR UPDATE;
  IF _from IS NULL THEN
    RAISE EXCEPTION 'file_upload_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.file_uploads
     SET scan_status = _verdict,
         scan_provider = _provider,
         scan_detail = _detail,
         scanned_at = now(),
         is_quarantined = (_verdict IN ('infected','suspicious','quarantined')),
         updated_at = now()
   WHERE id = _file_upload_id;

  INSERT INTO public.file_upload_scan_events (file_upload_id, from_status, to_status, provider, detail, actor_id)
  VALUES (_file_upload_id, _from, _verdict, _provider, _detail, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (_uid, 'file_scan_verdict', 'file_upload', _file_upload_id::text,
          jsonb_build_object('scan_status', _from),
          jsonb_build_object('scan_status', _verdict),
          jsonb_build_object('provider', _provider, 'detail', _detail));

  RETURN jsonb_build_object('file_upload_id', _file_upload_id, 'from', _from, 'to', _verdict);
END$$;

REVOKE ALL ON FUNCTION public.file_upload_record_scan(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.file_upload_record_scan(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.file_upload_record_scan(uuid, text, text, text) TO service_role, app_certification_runner;

-- release check used before any signed URL is issued
CREATE OR REPLACE FUNCTION public.file_upload_release_state(_file_upload_id uuid DEFAULT NULL, _file_path text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'file_upload_id', fu.id,
           'scan_status', fu.scan_status,
           'released', fu.scan_status IN ('clean','legacy_unverified') AND NOT fu.is_quarantined
         )
    FROM public.file_uploads fu
   WHERE (_file_upload_id IS NOT NULL AND fu.id = _file_upload_id)
      OR (_file_upload_id IS NULL AND _file_path IS NOT NULL AND fu.file_path = _file_path)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.file_upload_release_state(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.file_upload_release_state(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.file_upload_release_state(uuid, text) TO authenticated, service_role, app_certification_runner;

CREATE OR REPLACE VIEW public.sec_file_scan_posture AS
  SELECT scan_status, count(*)::bigint AS files, count(*) FILTER (WHERE is_quarantined)::bigint AS quarantined
    FROM public.file_uploads GROUP BY scan_status;

REVOKE ALL ON public.sec_file_scan_posture FROM anon;
GRANT SELECT ON public.sec_file_scan_posture TO authenticated, service_role, app_certification_runner;