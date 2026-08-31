-- F8-W1D — Prudential configuration governance (GAP-F8-03)
--
-- Proves that Prudential thresholds / ratios / analytics have ONE governance
-- owner: the existing `prudential_supervision` module and its existing config
-- authority (`manage_config`, plus `run_analytics` for the analytics hub).
-- No new permission is created; nothing is granted or weakened here.
--
-- Read-only. Real certification personas. No auth.users seeding.

\set ON_ERROR_STOP on
BEGIN;

-- 1. canonical permissions already exist and are enforced
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.permissions
   WHERE module = 'prudential_supervision'
     AND name IN ('manage_config','run_analytics','view')
     AND enforced AND NOT deprecated;
  IF n <> 3 THEN
    RAISE EXCEPTION 'FAIL 1: canonical prudential config permissions missing (found %)', n;
  END IF;
  RAISE NOTICE 'PASS 1: canonical prudential_supervision config permissions exist and are enforced';
END $$;

-- 2. no new/duplicate governance permission was invented for these screens
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.permissions
   WHERE name IN ('manage_prudential_thresholds','manage_prudential_ratios',
                  'manage_prudential_analytics','prudential_config')
      OR module IN ('prudential_config','prudential_ratios','prudential_thresholds');
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL 2: a duplicate prudential-config permission/module exists (%)', n;
  END IF;
  RAISE NOTICE 'PASS 2: no duplicate prudential-config permission or module was introduced';
END $$;

-- 3. canonical config authority function still resolves through the module
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'can_manage_prudential_config';
  IF d IS NULL
     OR d NOT LIKE '%prudential_supervision%'
     OR d NOT LIKE '%manage_config%' THEN
    RAISE EXCEPTION 'FAIL 3: can_manage_prudential_config no longer resolves prudential_supervision.manage_config';
  END IF;
  RAISE NOTICE 'PASS 3: can_manage_prudential_config resolves the canonical prudential config authority';
END $$;

-- 4. authorised prudential config persona holds config authority
DO $$
DECLARE sup uuid := '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce';
BEGIN
  IF NOT public.has_permission(sup, 'prudential_supervision', 'manage_config') THEN
    RAISE EXCEPTION 'FAIL 4: prudential_supervisor cannot manage prudential configuration';
  END IF;
  IF NOT public.can_manage_prudential_config(sup) THEN
    RAISE EXCEPTION 'FAIL 4: canonical config authority denies the prudential supervisor';
  END IF;
  IF NOT public.has_permission(sup, 'prudential_supervision', 'run_analytics') THEN
    RAISE EXCEPTION 'FAIL 4: prudential_supervisor cannot reach prudential analytics';
  END IF;
  RAISE NOTICE 'PASS 4: authorised prudential config persona can manage thresholds/ratios and view analytics';
END $$;

-- 5. returns-only personas do NOT gain prudential config authority
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id, role_key FROM public.cert_certification_users
            WHERE role_key IN ('returns_officer','returns_supervisor')
  LOOP
    IF NOT public.has_permission(r.user_id, 'returns_management', 'view') THEN
      RAISE EXCEPTION 'FAIL 5: % lost returns_management access', r.role_key;
    END IF;
    IF public.has_permission(r.user_id, 'prudential_supervision', 'manage_config')
       OR public.can_manage_prudential_config(r.user_id) THEN
      RAISE EXCEPTION 'FAIL 5: returns-only persona % holds prudential config authority', r.role_key;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 5: returns-only personas keep returns authority and gain no prudential config authority';
END $$;

-- 6. prudential analyst can view/analyse but cannot manage configuration
DO $$
DECLARE ana uuid := 'ef43e80a-e17e-4f26-aa91-bcf0d99e3d89';
BEGIN
  IF NOT public.has_permission(ana, 'prudential_supervision', 'view')
     OR NOT public.has_permission(ana, 'prudential_supervision', 'run_analytics') THEN
    RAISE EXCEPTION 'FAIL 6: prudential analyst lost prudential view/analytics access';
  END IF;
  IF public.has_permission(ana, 'prudential_supervision', 'manage_config')
     OR public.can_manage_prudential_config(ana) THEN
    RAISE EXCEPTION 'FAIL 6: prudential analyst without config authority can manage configuration';
  END IF;
  RAISE NOTICE 'PASS 6: prudential analyst can analyse but cannot manage prudential configuration';
END $$;

-- 7. unrelated internal and external principals hold neither authority
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id, role_key FROM public.cert_certification_users
            WHERE role_key IN ('conduct_analyst')
  LOOP
    IF public.can_manage_prudential_config(r.user_id) THEN
      RAISE EXCEPTION 'FAIL 7: unrelated internal persona % can manage prudential configuration', r.role_key;
    END IF;
  END LOOP;
  IF public.can_manage_prudential_config(NULL) THEN
    RAISE EXCEPTION 'FAIL 7: anonymous caller can manage prudential configuration';
  END IF;
  RAISE NOTICE 'PASS 7: unrelated internal and anonymous principals cannot manage prudential configuration';
END $$;

-- 8. server-side write protection on the config stores is unchanged (RLS on,
--    writes still bound to the canonical prudential config authority)
DO $$
DECLARE t text; n int; guarded int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['prudential_thresholds','prudential_ratios'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
                    WHERE ns.nspname='public' AND c.relname=t AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'FAIL 8: RLS not enabled on public.%', t;
    END IF;
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='public' AND tablename=t
       AND cmd <> 'SELECT'
       AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%prudential_config%';
    IF n < 1 THEN
      RAISE EXCEPTION 'FAIL 8: write policies on public.% no longer bind the prudential config authority', t;
    END IF;
    guarded := guarded + n;
  END LOOP;
  RAISE NOTICE 'PASS 8: prudential config stores keep RLS and % write policies bound to the config authority', guarded;
END $$;

DO $$ BEGIN RAISE NOTICE 'F8-W1D PRUDENTIAL CONFIG GOVERNANCE: ALL DB GATES PASSED'; END $$;
ROLLBACK;
