-- SEC-CRIT-01C: atomic registration evidence binding, 24h verification freshness,
-- resource-scoped secure-document reads.

-- 1. 24-hour verification freshness for NEW capabilities (DB-enforced).
CREATE OR REPLACE FUNCTION public.ruc_guard_issue()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE o public.otp_verifications;
BEGIN
  IF NEW.otp_verification_id IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_NOT_VERIFIED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.otp_verifications WHERE id = NEW.otp_verification_id;
  IF NOT FOUND OR o.verified_at IS NULL OR o.purpose <> 'registration' OR o.channel <> 'email'
     OR lower(o.user_email) <> lower(NEW.journey_email) THEN
    RAISE EXCEPTION 'JOURNEY_NOT_VERIFIED' USING ERRCODE = '42501'; END IF;
  IF o.verified_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'VERIFICATION_EXPIRED' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ruc_guard_issue ON public.registration_upload_capabilities;
CREATE TRIGGER ruc_guard_issue BEFORE INSERT ON public.registration_upload_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.ruc_guard_issue();

-- 2. Atomic evidence binding on registration insert.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS upload_capability_id uuid REFERENCES public.registration_upload_capabilities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS upload_capability_proof text;

CREATE OR REPLACE FUNCTION public.registration_evidence_check(
  _capability_id uuid, _secret_hash text, _email text, _docs jsonb, _esd jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.registration_upload_capabilities; p text; n int := 0;
BEGIN
  FOR p IN SELECT DISTINCT m[1] FROM regexp_matches(coalesce(_docs::text,'') || ' ' || coalesce(_esd::text,''),
           '(registrations/[0-9A-Za-z._/-]+)', 'g') AS m LOOP
    n := n + 1;
    IF _capability_id IS NULL THEN RETURN 'EVIDENCE_CAPABILITY_REQUIRED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.registration_upload_files f
                   WHERE f.object_path = p AND f.capability_id = _capability_id AND f.registration_id IS NULL) THEN
      RETURN 'EVIDENCE_NOT_OWNED'; END IF;
  END LOOP;
  IF _capability_id IS NULL THEN RETURN 'OK_NO_EVIDENCE'; END IF;
  SELECT * INTO c FROM public.registration_upload_capabilities WHERE id = _capability_id FOR UPDATE;
  IF NOT FOUND OR _secret_hash IS NULL OR c.secret_hash <> _secret_hash THEN RETURN 'CAPABILITY_INVALID'; END IF;
  IF c.status = 'REVOKED' OR c.revoked_at IS NOT NULL OR c.expires_at < now() THEN RETURN 'CAPABILITY_INVALID'; END IF;
  IF c.registration_id IS NOT NULL THEN RETURN 'CAPABILITY_ALREADY_BOUND'; END IF;
  IF c.status <> 'BOUND_JOURNEY' THEN RETURN 'CAPABILITY_NOT_JOURNEY_BOUND'; END IF;
  IF lower(c.journey_email) <> lower(coalesce(_email,'')) THEN RETURN 'JOURNEY_MISMATCH'; END IF;
  RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION public.registration_evidence_check(uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registration_evidence_check(uuid,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.registrations_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  r := public.registration_evidence_check(NEW.upload_capability_id, NEW.upload_capability_proof,
                                          NEW.email, NEW.documents_metadata, NEW.entity_specific_data);
  IF r NOT IN ('OK','OK_NO_EVIDENCE') THEN
    RAISE EXCEPTION 'REGISTRATION_EVIDENCE_%', r USING ERRCODE = '42501'; END IF;
  NEW.upload_capability_proof := NULL;  -- never persisted
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS registrations_evidence_guard ON public.registrations;
CREATE TRIGGER registrations_evidence_guard BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_evidence_guard();

CREATE OR REPLACE FUNCTION public.registrations_evidence_bind()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.upload_capability_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.registration_upload_capabilities
     SET registration_id = NEW.id, status = 'BOUND_REGISTRATION', registration_bound_at = now()
   WHERE id = NEW.upload_capability_id AND registration_id IS NULL AND status = 'BOUND_JOURNEY';
  IF NOT FOUND THEN RAISE EXCEPTION 'REGISTRATION_EVIDENCE_BIND_FAILED' USING ERRCODE = '42501'; END IF;
  UPDATE public.registration_upload_files SET registration_id = NEW.id
   WHERE capability_id = NEW.upload_capability_id AND registration_id IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS registrations_evidence_bind ON public.registrations;
CREATE TRIGGER registrations_evidence_bind AFTER INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_evidence_bind();

CREATE OR REPLACE FUNCTION public.registrations_capability_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.upload_capability_id IS DISTINCT FROM OLD.upload_capability_id THEN
    RAISE EXCEPTION 'CAPABILITY_ALREADY_BOUND' USING ERRCODE = '42501'; END IF;
  NEW.upload_capability_proof := NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS registrations_capability_immutable ON public.registrations;
CREATE TRIGGER registrations_capability_immutable BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_capability_immutable();

-- 3. Resource-scoped secure-document read authority.
CREATE OR REPLACE FUNCTION public.sec_secure_document_readable(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); top text; owner uuid; fu record;
BEGIN
  IF uid IS NULL OR _name IS NULL THEN RETURN false; END IF;
  top := split_part(_name, '/', 1);
  IF public.is_super_admin(uid) THEN RETURN true; END IF;
  IF top = uid::text THEN RETURN true; END IF;                 -- uploader
  IF public.is_internal_staff(uid) THEN                        -- staff by module authority
    RETURN public.has_permission(uid,'licensee_management','view_all_entities')
        OR public.has_permission(uid,'audit_management','view')
        OR public.has_permission(uid,'application_management','view')
        OR public.has_permission(uid,'complaint_management','view')
        OR public.has_permission(uid,'returns_management','view');
  END IF;
  IF top = 'registrations' THEN RETURN false; END IF;          -- registrants: separate owner policy
  -- External: metadata authority first.
  SELECT entity_type, entity_id INTO fu FROM public.file_uploads WHERE file_path = _name LIMIT 1;
  IF FOUND AND fu.entity_type = 'application' AND fu.entity_id ~ '^[0-9a-f-]{36}$' THEN
    RETURN public.external_can_access_application(uid, fu.entity_id::uuid, 'can_view');
  END IF;
  -- External: same organisation as the uploader (canonical entity membership).
  IF top !~ '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  owner := top::uuid;
  RETURN EXISTS (SELECT 1 FROM public.external_user_entity_ids(uid) a
                 JOIN public.external_user_entity_ids(owner) b ON a = b);
END $$;
REVOKE ALL ON FUNCTION public.sec_secure_document_readable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sec_secure_document_readable(text) TO authenticated, service_role;

DROP POLICY IF EXISTS secure_documents_read ON storage.objects;
CREATE POLICY secure_documents_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'secure-documents' AND public.sec_secure_document_readable(name));