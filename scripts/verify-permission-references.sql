-- ============================================================================
-- DEF-F3-C-01 — canonical RBAC permission-reference gate
--
-- Every literal (module, permission) pair referenced by a project-owned
-- routine in schema public through has_permission() / enforce_permission() /
-- enforce_action() must exist in the canonical catalogue
-- (public.sec_modules x public.sec_permissions).
--
-- An uncatalogued pair can never evaluate true: it is a silent-deny guard.
-- F3-B shipped `registration_review.approve`, which does not exist; this gate
-- makes that class of defect fail deterministically.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-permission-references.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = notice;

DO $verify$
DECLARE
  v_defects int;
  r record;
BEGIN
  IF to_regclass('public.sec_invalid_permission_references') IS NULL THEN
    RAISE EXCEPTION 'DEF-F3-C-01 gate: public.sec_invalid_permission_references is missing';
  END IF;

  SELECT count(*) INTO v_defects FROM public.sec_invalid_permission_references;

  IF v_defects > 0 THEN
    FOR r IN SELECT routine, module_key, permission_key
               FROM public.sec_invalid_permission_references ORDER BY 1,2,3
    LOOP
      RAISE WARNING 'DEFECT uncatalogued permission reference: % -> %.%',
        r.routine, r.module_key, r.permission_key;
    END LOOP;
    RAISE EXCEPTION 'DEF-F3-C-01 regression: % routine(s) reference a permission that is not in the canonical catalogue', v_defects;
  END IF;

  -- Registration-specific assertion: the canonical registration module and the
  -- approval permission used by the governed workflow guard must both exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.sec_permissions sp
    JOIN public.sec_modules sm ON sm.id = sp.module_id
    WHERE sm.key = 'registration_management' AND sp.key = 'approve'
  ) THEN
    RAISE EXCEPTION 'DEF-F3-C-01 regression: registration_management.approve is missing from the catalogue';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sec_modules WHERE key = 'registration_review') THEN
    RAISE EXCEPTION 'DEF-F3-C-01 regression: a registration_review module was created to satisfy the gate';
  END IF;

  IF pg_get_functiondef('public.start_registration_workflow(uuid)'::regprocedure)
       ~* 'registration_review' THEN
    RAISE EXCEPTION 'DEF-F3-C-01 regression: start_registration_workflow still references registration_review';
  END IF;

  RAISE NOTICE 'DEF-F3-C-01 permission-reference gate: PASS';
END
$verify$;
