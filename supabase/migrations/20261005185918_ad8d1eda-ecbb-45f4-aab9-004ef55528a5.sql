CREATE TABLE public.sec_credential_sanitisation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_table text NOT NULL,
  record_id uuid NOT NULL,
  record_reference text,
  action text NOT NULL DEFAULT 'credential_sanitisation',
  fields_removed text[] NOT NULL,
  actor text NOT NULL DEFAULT 'system:SEC-CRIT-01D',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sec_credential_sanitisation_log TO authenticated;
GRANT ALL ON public.sec_credential_sanitisation_log TO service_role;
ALTER TABLE public.sec_credential_sanitisation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read credential sanitisation log" ON public.sec_credential_sanitisation_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.sec_credential_sanitisation_log (record_table, record_id, record_reference, fields_removed, reason)
SELECT 'registrations', r.id, r.registration_reference,
  ARRAY(SELECT k FROM jsonb_object_keys(r.entity_specific_data) k WHERE k IN ('password','confirm_password','confirmPassword') ORDER BY k),
  'Legacy plaintext registration credential removed (SEC-CRIT-01D)'
FROM public.registrations r
WHERE r.entity_specific_data ?| ARRAY['password','confirm_password','confirmPassword'];

ALTER TABLE public.registrations DISABLE TRIGGER USER;
UPDATE public.registrations
SET entity_specific_data = entity_specific_data - 'password' - 'confirm_password' - 'confirmPassword'
WHERE entity_specific_data ?| ARRAY['password','confirm_password','confirmPassword'];
ALTER TABLE public.registrations ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.registrations_no_credentials()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.entity_specific_data IS NOT NULL
     AND jsonb_typeof(NEW.entity_specific_data) = 'object'
     AND NEW.entity_specific_data ?| ARRAY['password','confirm_password','confirmPassword'] THEN
    RAISE EXCEPTION 'CREDENTIAL_FIELD_FORBIDDEN' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.registrations_no_credentials() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER registrations_no_credentials
BEFORE INSERT OR UPDATE OF entity_specific_data ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.registrations_no_credentials();