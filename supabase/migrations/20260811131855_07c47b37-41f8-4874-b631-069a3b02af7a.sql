-- Helper: full set of workflow role slugs for a user (legacy + dynamic + compatibility)
CREATE OR REPLACE FUNCTION public.user_workflow_role_slugs(_user uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH legacy AS (
    SELECT ur.role::text AS slug FROM public.user_roles ur WHERE ur.user_id = _user
  ), dyn AS (
    SELECT regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g') AS slug, r.name AS rname
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    WHERE udr.user_id = _user
  ), base AS (
    SELECT slug FROM legacy
    UNION SELECT slug FROM dyn
  ), flags AS (
    SELECT
      EXISTS (SELECT 1 FROM legacy WHERE slug IN ('super_admin','admin'))
      OR EXISTS (SELECT 1 FROM dyn WHERE rname IN ('System Administrator','Legacy Admin','Super Admin')) AS is_admin,
      EXISTS (SELECT 1 FROM legacy WHERE slug NOT IN ('applicant','pre_licensee','licensee_primary','licensee_secondary'))
      OR EXISTS (SELECT 1 FROM dyn WHERE rname NOT IN ('Applicant','Regulated Entity User','Consumer / Complainant')) AS is_internal
  )
  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::text[]) FROM (
    SELECT slug AS s FROM base
    UNION SELECT 'admin' WHERE (SELECT is_admin FROM flags)
    UNION SELECT 'regulator' WHERE (SELECT is_internal FROM flags)
  ) x WHERE s IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.user_workflow_role_slugs(uuid) TO authenticated, service_role;

-- Rewrite the two complaint RPCs' role checks in place, preserving all other logic byte-for-byte.
DO $do$
DECLARE
  v_src text;
  v_new text;
BEGIN
  -- get_complaint_available_actions
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_complaint_available_actions';
  IF v_src IS NULL THEN RAISE EXCEPTION 'get_complaint_available_actions not found'; END IF;
  v_new := replace(v_src,
    'OR v_user_role = ANY(a.allowed_role_slugs)',
    'OR a.allowed_role_slugs && public.user_workflow_role_slugs(v_user)');
  IF v_new = v_src THEN RAISE EXCEPTION 'role check pattern not found in get_complaint_available_actions'; END IF;
  EXECUTE v_new;

  -- execute_complaint_workflow_action
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'execute_complaint_workflow_action';
  IF v_src IS NULL THEN RAISE EXCEPTION 'execute_complaint_workflow_action not found'; END IF;
  v_new := replace(v_src,
    'AND NOT (v_user_role = ANY(v_action.allowed_role_slugs))',
    'AND NOT (v_action.allowed_role_slugs && public.user_workflow_role_slugs(v_user))');
  IF v_new = v_src THEN RAISE EXCEPTION 'role check pattern not found in execute_complaint_workflow_action'; END IF;
  EXECUTE v_new;
END
$do$;