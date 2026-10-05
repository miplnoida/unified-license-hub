-- SEC-CRIT-01B: registration-bound upload capability.
-- Journey identity = the verified registration email OTP (existing intake object);
-- final identity = registrations.id, bound once, server-side, at submission.
ALTER TABLE public.registration_upload_capabilities
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN IF NOT EXISTS journey_email text,
  ADD COLUMN IF NOT EXISTS otp_verification_id uuid REFERENCES public.otp_verifications(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS registration_id uuid REFERENCES public.registrations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS journey_bound_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_bound_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.registration_upload_capabilities ADD CONSTRAINT ruc_status_chk
    CHECK (status IN ('ISSUED','BOUND_JOURNEY','BOUND_REGISTRATION','REVOKED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ruc_registration_unique ON public.registration_upload_capabilities(registration_id) WHERE registration_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ruc_guard_binding() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.registration_id IS NOT NULL AND NEW.registration_id IS DISTINCT FROM OLD.registration_id THEN
    RAISE EXCEPTION 'CAPABILITY_ALREADY_BOUND' USING ERRCODE = '42501'; END IF;
  IF OLD.otp_verification_id IS NOT NULL AND NEW.otp_verification_id IS DISTINCT FROM OLD.otp_verification_id THEN
    RAISE EXCEPTION 'CAPABILITY_JOURNEY_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  IF OLD.journey_email IS NOT NULL AND NEW.journey_email IS DISTINCT FROM OLD.journey_email THEN
    RAISE EXCEPTION 'CAPABILITY_JOURNEY_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  IF NEW.secret_hash IS DISTINCT FROM OLD.secret_hash THEN
    RAISE EXCEPTION 'CAPABILITY_SECRET_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  IF OLD.status = 'REVOKED' AND NEW.status <> 'REVOKED' THEN
    RAISE EXCEPTION 'CAPABILITY_REVOKED' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ruc_guard_binding ON public.registration_upload_capabilities;
CREATE TRIGGER trg_ruc_guard_binding BEFORE UPDATE ON public.registration_upload_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.ruc_guard_binding();

-- Durable file ownership (authoritative; the storage path is not trusted alone).
CREATE TABLE IF NOT EXISTS public.registration_upload_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid NOT NULL REFERENCES public.registration_upload_capabilities(id) ON DELETE RESTRICT,
  object_path text NOT NULL UNIQUE,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.registration_upload_files TO authenticated;
GRANT ALL ON public.registration_upload_files TO service_role;
ALTER TABLE public.registration_upload_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ruf_internal_read ON public.registration_upload_files;
CREATE POLICY ruf_internal_read ON public.registration_upload_files FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.ruf_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _cap_reg uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.capability_id <> OLD.capability_id OR NEW.object_path <> OLD.object_path THEN
      RAISE EXCEPTION 'FILE_OWNERSHIP_IMMUTABLE' USING ERRCODE = '42501'; END IF;
    IF OLD.registration_id IS NOT NULL AND NEW.registration_id IS DISTINCT FROM OLD.registration_id THEN
      RAISE EXCEPTION 'FILE_ALREADY_BOUND' USING ERRCODE = '42501'; END IF;
  END IF;
  IF NEW.object_path NOT LIKE 'registrations/' || NEW.capability_id::text || '/%' THEN
    RAISE EXCEPTION 'FILE_PATH_NOT_OWNED' USING ERRCODE = '42501'; END IF;
  IF NEW.registration_id IS NOT NULL THEN
    SELECT registration_id INTO _cap_reg FROM public.registration_upload_capabilities WHERE id = NEW.capability_id;
    IF _cap_reg IS DISTINCT FROM NEW.registration_id THEN
      RAISE EXCEPTION 'FILE_REGISTRATION_MISMATCH' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ruf_guard ON public.registration_upload_files;
CREATE TRIGGER trg_ruf_guard BEFORE INSERT OR UPDATE ON public.registration_upload_files
  FOR EACH ROW EXECUTE FUNCTION public.ruf_guard();

-- Atomic, server-only binding at submission.
CREATE OR REPLACE FUNCTION public.registration_upload_capability_bind(
  _capability_id uuid, _secret_hash text, _registration_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.registration_upload_capabilities; r_email text;
BEGIN
  SELECT * INTO c FROM public.registration_upload_capabilities WHERE id = _capability_id FOR UPDATE;
  IF NOT FOUND OR c.secret_hash <> _secret_hash THEN RETURN 'CAPABILITY_INVALID'; END IF;
  IF c.status = 'REVOKED' OR c.revoked_at IS NOT NULL OR c.expires_at < now() THEN RETURN 'CAPABILITY_INVALID'; END IF;
  IF c.registration_id IS NOT NULL THEN
    RETURN CASE WHEN c.registration_id = _registration_id THEN 'ALREADY_BOUND' ELSE 'CAPABILITY_ALREADY_BOUND' END;
  END IF;
  IF c.status <> 'BOUND_JOURNEY' THEN RETURN 'CAPABILITY_NOT_JOURNEY_BOUND'; END IF;
  SELECT lower(email) INTO r_email FROM public.registrations WHERE id = _registration_id;
  IF r_email IS NULL OR r_email <> lower(c.journey_email) THEN RETURN 'JOURNEY_MISMATCH'; END IF;
  UPDATE public.registration_upload_capabilities
     SET registration_id = _registration_id, status = 'BOUND_REGISTRATION', registration_bound_at = now()
   WHERE id = _capability_id;
  UPDATE public.registration_upload_files SET registration_id = _registration_id
   WHERE capability_id = _capability_id AND registration_id IS NULL;
  RETURN 'BOUND';
END $$;
REVOKE EXECUTE ON FUNCTION public.registration_upload_capability_bind(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registration_upload_capability_bind(uuid, text, uuid) TO service_role;

-- Signed-in applicant (owner of the bound registration) can read own registration files.
CREATE OR REPLACE FUNCTION public.sec_registration_file_owned(_object_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.registration_upload_files f
    JOIN public.registrations r ON r.id = f.registration_id
    WHERE f.object_path = _object_path AND r.user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.sec_registration_file_owned(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sec_registration_file_owned(text) TO authenticated;

DROP POLICY IF EXISTS "Registration owner reads bound registration uploads" ON storage.objects;
CREATE POLICY "Registration owner reads bound registration uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'secure-documents' AND (storage.foldername(name))[1] = 'registrations'
         AND public.sec_registration_file_owned(name));