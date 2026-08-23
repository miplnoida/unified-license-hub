CREATE TABLE IF NOT EXISTS public.app_environment_config (
  id boolean PRIMARY KEY DEFAULT true,
  environment text NOT NULL DEFAULT 'production',
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT app_environment_config_singleton CHECK (id),
  CONSTRAINT app_environment_config_environment_chk
    CHECK (environment IN ('production', 'non_production'))
);

GRANT SELECT ON public.app_environment_config TO authenticated;
GRANT ALL ON public.app_environment_config TO service_role;

ALTER TABLE public.app_environment_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'app_environment_config'
                    AND policyname = 'app_environment_config_read_authenticated') THEN
    CREATE POLICY app_environment_config_read_authenticated
      ON public.app_environment_config FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_production_environment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.app_environment_config
     WHERE id AND environment = 'non_production'
  );
$$;

REVOKE ALL ON FUNCTION public.is_production_environment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_production_environment() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_nonproduction(_operation text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION
      'Operation % is not permitted on a production deployment', coalesce(_operation, 'unknown')
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_nonproduction(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_nonproduction(text) TO service_role;

CREATE OR REPLACE FUNCTION public.cert_v2_guard_ok()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_production_environment() THEN
    RETURN false;
  END IF;
  IF to_regclass('public.cert_nonproduction_guard') IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.cert_nonproduction_guard
     WHERE environment = 'non_production' AND reset_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_guard_ok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_guard_ok() TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind IN ('f','p')
       AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

INSERT INTO public.app_environment_config (id, environment, note)
VALUES (true, 'non_production', 'RC1 certification environment - destructive certification tooling permitted')
ON CONFLICT (id) DO UPDATE
  SET environment = EXCLUDED.environment,
      note = EXCLUDED.note,
      updated_at = now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'report_logs_report_run_id_fkey' AND NOT convalidated) THEN
    ALTER TABLE public.report_logs VALIDATE CONSTRAINT report_logs_report_run_id_fkey;
  END IF;
END $$;