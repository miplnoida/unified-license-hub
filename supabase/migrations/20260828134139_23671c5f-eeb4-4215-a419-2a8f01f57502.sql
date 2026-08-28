-- F3-B2 / DEF-F3-C-01: replace the uncatalogued 'registration_review','approve'
-- authorization reference with the canonical catalogued permission
-- 'registration_management','approve'. Maker-checker semantics unchanged.
CREATE OR REPLACE FUNCTION public.start_registration_workflow(_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_reg record; v_workflow_id uuid; v_first_step uuid; v_existing uuid; v_instance_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  SELECT id, sector_id, user_id INTO v_reg FROM public.registrations WHERE id = _registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT (
    public.is_trusted_service_request()
    OR public.request_role() NOT IN ('anon','authenticated')
    OR (v_uid IS NOT NULL AND v_reg.user_id = v_uid)
    OR (v_uid IS NOT NULL AND (
          public.has_permission(v_uid, 'registration_management', 'approve')
          OR public.has_permission(v_uid, 'registration_management', 'workflow_action')))
  ) THEN
    RAISE EXCEPTION 'not authorised to start a registration workflow' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id INTO v_existing FROM public.workflow_instances
   WHERE entity_id = _registration_id AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_workflow_id := public.resolve_registration_workflow(v_reg.sector_id);
  IF v_workflow_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_first_step FROM public.approval_steps
   WHERE workflow_id = v_workflow_id ORDER BY step_order ASC LIMIT 1;
  IF v_first_step IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
  VALUES (v_workflow_id, 'registration', _registration_id, v_first_step, 'active', now())
  RETURNING id INTO v_instance_id;

  RETURN v_instance_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.start_registration_workflow(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_registration_workflow(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_registration_workflow(uuid) TO authenticated, service_role;

-- Permanent verification surface: every has_permission()/enforce_permission()
-- literal pair referenced by a public routine must exist in the canonical
-- RBAC catalogue (sec_modules x sec_permissions).
CREATE OR REPLACE VIEW public.sec_invalid_permission_references AS
WITH refs AS (
  SELECT p.oid::regprocedure::text AS routine,
         (regexp_matches(pg_get_functiondef(p.oid),
            '(?:has_permission|enforce_permission|enforce_action)\s*\(\s*(?:[^,()]*,\s*)?''([a-z0-9_]+)''\s*,\s*''([a-z0-9_]+)''',
            'g'))[1] AS module_key,
         (regexp_matches(pg_get_functiondef(p.oid),
            '(?:has_permission|enforce_permission|enforce_action)\s*\(\s*(?:[^,()]*,\s*)?''([a-z0-9_]+)''\s*,\s*''([a-z0-9_]+)''',
            'g'))[2] AS permission_key
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
)
SELECT DISTINCT r.routine, r.module_key, r.permission_key
FROM refs r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sec_permissions sp
  JOIN public.sec_modules sm ON sm.id = sp.module_id
  WHERE sm.key = r.module_key AND sp.key = r.permission_key
);

REVOKE ALL ON public.sec_invalid_permission_references FROM PUBLIC;
REVOKE ALL ON public.sec_invalid_permission_references FROM anon;
GRANT SELECT ON public.sec_invalid_permission_references TO service_role;