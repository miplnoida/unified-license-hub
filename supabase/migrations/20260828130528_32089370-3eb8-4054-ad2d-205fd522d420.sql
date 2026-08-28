-- 1. Handoff register: read-only for browser roles, writes only via governed server path.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.registration_licensing_handoffs FROM anon, authenticated;
REVOKE SELECT ON public.registration_licensing_handoffs FROM anon;
GRANT SELECT ON public.registration_licensing_handoffs TO authenticated;
GRANT ALL ON public.registration_licensing_handoffs TO service_role;

-- 2. Single source of truth for the status vocabulary.
ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_status_chk;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_status_chk
  CHECK (status = ANY (public.registration_status_vocabulary()));

-- 3. Data remediation: bind the approved registration that has no canonical entity binding.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT reg.id, reg.registration_reference
      FROM public.registrations reg
     WHERE reg.status <> 'withdrawn'
       AND NOT EXISTS (SELECT 1 FROM public.registration_entity_bindings b WHERE b.registration_id = reg.id)
  LOOP
    BEGIN
      PERFORM public.onboarding_form_first_resolve_service(r.id);
      RAISE NOTICE 'bound registration %', r.registration_reference;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'binding backfill failed for %: %', r.registration_reference, SQLERRM;
    END;
  END LOOP;
END $$;