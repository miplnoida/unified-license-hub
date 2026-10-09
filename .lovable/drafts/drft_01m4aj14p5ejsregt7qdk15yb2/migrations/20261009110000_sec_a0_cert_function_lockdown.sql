-- SEC-A0: Wave A0 — certification function lockdown (SEC-003, SEC-004)
-- STATUS: STAGED ONLY. Ready for Deployment — Blocked (no staging, backup unverified).
-- Scope: public.cert_* and public.rc1_* functions only. No default-privilege change.

-- 1. Private evidence + arming tables (no API exposure)
CREATE TABLE IF NOT EXISTS public.sec_a0_grant_snapshot (
  id bigserial PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('before','after')),
  signature text NOT NULL,
  role_name text NOT NULL,
  can_execute boolean NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.sec_a0_grant_snapshot FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sec_a0_grant_snapshot TO service_role;
ALTER TABLE public.sec_a0_grant_snapshot ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sec_a0_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'sec_a0_grant_snapshot is append-only' USING ERRCODE = '42501'; END $$;
REVOKE EXECUTE ON FUNCTION public.sec_a0_snapshot_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sec_a0_snapshot_immutable ON public.sec_a0_grant_snapshot;
CREATE TRIGGER trg_sec_a0_snapshot_immutable BEFORE UPDATE OR DELETE ON public.sec_a0_grant_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.sec_a0_snapshot_immutable();

CREATE TABLE IF NOT EXISTS public.sec_a0_destructive_arming (
  id bigserial PRIMARY KEY,
  project_ref text NOT NULL,
  armed_by text NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.sec_a0_destructive_arming FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.sec_a0_destructive_arming ENABLE ROW LEVEL SECURITY;
-- Ships EMPTY: destructive functions stay disarmed on the shared backend.

-- 2. Arming check (owner-only helper)
CREATE OR REPLACE FUNCTION public.sec_a0_require_armed(_op text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'SEC-A0: % denied for caller', _op USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_nonproduction(_op);
  IF NOT EXISTS (
    SELECT 1 FROM public.sec_a0_destructive_arming
    WHERE project_ref = current_setting('app.project_ref', true)
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'SEC-A0: % is disarmed (no valid arming record)', _op USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.sec_a0_require_armed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sec_a0_require_armed(text) TO service_role;

-- 3. Before snapshot, revoke, guard, after snapshot, self-check
DO $a0$
DECLARE f record; r text; def text; guarded text; n int;
  roles text[] := ARRAY['public','anon','authenticated','service_role','app_certification_runner'];
BEGIN
  FOR f IN SELECT p.oid, p.oid::regprocedure::text AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
  LOOP
    FOREACH r IN ARRAY roles LOOP
      IF r = 'public' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        INSERT INTO public.sec_a0_grant_snapshot(phase, signature, role_name, can_execute)
        VALUES ('before', f.sig, r, CASE WHEN r='public'
          THEN EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid), acldefault('f', (SELECT proowner FROM pg_proc WHERE oid=f.oid)))) a WHERE a.grantee = 0 AND a.privilege_type='EXECUTE')
          ELSE has_function_privilege(r, f.oid, 'EXECUTE') END);
      END IF;
    END LOOP;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_certification_runner') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM app_certification_runner', f.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;

  -- Guard destructive functions (plpgsql only; abort otherwise)
  FOR f IN SELECT p.oid, p.oid::regprocedure::text AS sig, p.proname, l.lanname FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
           WHERE p.pronamespace='public'::regnamespace
             AND (p.proname IN ('cert_reset_force_delete','cert_reset_nonproduction_business_data_v1','cert_v2_put_metric') OR p.proname LIKE 'cert\_seed\_%')
  LOOP
    IF f.lanname <> 'plpgsql' THEN RAISE EXCEPTION 'SEC-A0: % is not plpgsql; manual guard required', f.sig; END IF;
    def := pg_get_functiondef(f.oid);
    CONTINUE WHEN def LIKE '%sec_a0_require_armed%';
    guarded := regexp_replace(def, '(\$function\$.*?\mBEGIN\M)',
      E'\\1\n  PERFORM public.sec_a0_require_armed(' || quote_literal(f.proname) || E');', 's');
    IF guarded = def THEN RAISE EXCEPTION 'SEC-A0: could not inject guard into %', f.sig; END IF;
    EXECUTE guarded;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid, p.oid::regprocedure::text AS sig FROM pg_proc p
           WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
  LOOP
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      INSERT INTO public.sec_a0_grant_snapshot(phase, signature, role_name, can_execute)
      VALUES ('after', f.sig, r, has_function_privilege(r, f.oid, 'EXECUTE'));
    END LOOP;
  END LOOP;

  SELECT count(*) INTO n FROM public.sec_a0_grant_snapshot
   WHERE phase='after' AND role_name IN ('anon','authenticated') AND can_execute;
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check failed: % cert/rc1 grants remain for anon/authenticated', n; END IF;
END $a0$;
