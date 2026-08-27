-- =====================================================================
-- GAP-F0-08 : Anonymous EXECUTE hardening
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sec_anon_execute_allowlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name text NOT NULL UNIQUE,
  classification text NOT NULL DEFAULT 'PUBLIC_RPC_REQUIRED',
  justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sec_anon_execute_allowlist TO authenticated;
GRANT ALL ON public.sec_anon_execute_allowlist TO service_role;

ALTER TABLE public.sec_anon_execute_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sec_anon_execute_allowlist_read" ON public.sec_anon_execute_allowlist;
CREATE POLICY "sec_anon_execute_allowlist_read"
  ON public.sec_anon_execute_allowlist
  FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_sec_anon_execute_allowlist_touch ON public.sec_anon_execute_allowlist;
CREATE TRIGGER trg_sec_anon_execute_allowlist_touch
  BEFORE UPDATE ON public.sec_anon_execute_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sec_anon_execute_allowlist (function_name, classification, justification) VALUES
  ('get_active_captcha', 'PUBLIC_RPC_REQUIRED', 'Login/registration captcha configuration is fetched before authentication (useCaptchaConfig).'),
  ('check_applicant_name_exists', 'PUBLIC_RPC_REQUIRED', 'Duplicate-applicant guard on the unauthenticated registration journey.'),
  ('check_primary_user_email_exists', 'PUBLIC_RPC_REQUIRED', 'Duplicate primary-user guard on the unauthenticated registration journey.'),
  ('get_declaration_invitation_public', 'PUBLIC_RPC_REQUIRED', 'Token-scoped fit-and-proper declaration landing page (no account).'),
  ('verify_declaration_identity', 'PUBLIC_RPC_REQUIRED', 'Token + identity verification step of the public declaration journey.'),
  ('get_fp_declaration_form_public', 'PUBLIC_RPC_REQUIRED', 'Renders the token-scoped declaration questionnaire for the invited person.'),
  ('submit_declaration_form', 'PUBLIC_RPC_REQUIRED', 'Submission endpoint of the token-scoped public declaration journey.'),
  ('get_public_complaint_tracking_v2', 'PUBLIC_RPC_REQUIRED', 'Reference + email complaint tracking is deliberately account-free.')
ON CONFLICT (function_name) DO UPDATE
  SET classification = EXCLUDED.classification,
      justification = EXCLUDED.justification,
      updated_at = now();

-- ---------------------------------------------------------------------
-- Revoke anonymous EXECUTE on every non-allowlisted routine in public
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  r record;
  allow text[];
BEGIN
  SELECT array_agg(function_name) INTO allow FROM public.sec_anon_execute_allowlist;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           p.proname,
           (d.objid IS NOT NULL) AS is_extension,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           coalesce(array_to_string(p.proacl, ' '), '') LIKE '%=X/%' AS public_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
  LOOP
    IF r.proname = ANY(allow) THEN
      CONTINUE;
    END IF;

    BEGIN
      IF r.public_exec THEN
        -- keep the roles that legitimately need it, then drop the blanket grant
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role, postgres', r.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
      END IF;
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'skipped (insufficient privilege): %', r.sig;
    END;
  END LOOP;
END
$do$;

-- Ensure the allowlisted routines really are anon-executable
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN public.sec_anon_execute_allowlist a ON a.function_name = p.proname
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------
-- Make the closure durable for future routines
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'default privileges (postgres) not adjustable here';
  END;
  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'default privileges (supabase_admin) not adjustable here';
  END;
END
$do$;

-- ---------------------------------------------------------------------
-- Certification surface
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.sec_anon_executable_functions AS
SELECT p.oid::regprocedure::text AS signature,
       p.proname AS function_name,
       p.prosecdef AS security_definer,
       (d.objid IS NOT NULL) AS is_extension,
       (a.function_name IS NOT NULL) AS allowlisted,
       a.classification,
       a.justification
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
LEFT JOIN public.sec_anon_execute_allowlist a ON a.function_name = p.proname
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

GRANT SELECT ON public.sec_anon_executable_functions TO authenticated, service_role;

COMMENT ON VIEW public.sec_anon_executable_functions IS
  'GAP-F0-08 certification surface: every public-schema routine still executable by the anon role. Rows with allowlisted = false are defects.';