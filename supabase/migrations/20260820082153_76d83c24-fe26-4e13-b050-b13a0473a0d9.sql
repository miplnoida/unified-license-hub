
-- Wave B preflight A: canonical entity resolution for a licence.
CREATE OR REPLACE FUNCTION public.entity_follow_merge(_entity_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid := _entity_id; v_next uuid; v_guard int := 0;
BEGIN
  WHILE v_id IS NOT NULL AND v_guard < 20 LOOP
    SELECT merged_into_entity_id INTO v_next FROM public.licensees WHERE id = v_id;
    IF v_next IS NULL THEN RETURN v_id; END IF;
    v_id := v_next; v_guard := v_guard + 1;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.entity_for_license(_license_id uuid, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_entity_id uuid;
BEGIN
  -- 1. Canonical: the application is already bound to an entity.
  IF _application_id IS NOT NULL THEN
    SELECT entity_id INTO v_entity_id FROM public.applications WHERE id = _application_id;
  END IF;

  -- 2. Canonical multi-licence link table.
  IF v_entity_id IS NULL AND _license_id IS NOT NULL THEN
    SELECT el.entity_id INTO v_entity_id
      FROM public.entity_licenses el
      JOIN public.licensees l ON l.id = el.entity_id
     WHERE el.license_id = _license_id
     ORDER BY (l.merged_into_entity_id IS NULL) DESC,
              COALESCE(el.is_primary, false) DESC, el.effective_from
     LIMIT 1;
  END IF;

  -- 3. Documented legacy compatibility fallback only (licensees.license_id is
  --    compatibility-only; an entity may own many licences).
  IF v_entity_id IS NULL AND _license_id IS NOT NULL THEN
    SELECT id INTO v_entity_id FROM public.licensees
     WHERE license_id = _license_id ORDER BY created_at LIMIT 1;
  END IF;

  RETURN public.entity_follow_merge(v_entity_id);
END $$;

GRANT EXECUTE ON FUNCTION public.entity_for_license(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_follow_merge(uuid) TO authenticated, service_role;

-- Replace every "entity == holder of this licence row" lookup inside
-- provision_application_entity with the canonical resolver.
DO $patch$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE proname = 'provision_application_entity' AND pronamespace = 'public'::regnamespace;
  IF d IS NULL THEN RAISE EXCEPTION 'provision_application_entity not found'; END IF;

  d2 := regexp_replace(
    d,
    'SELECT\s+id\s+INTO\s+v_licensee_id\s+FROM\s+public\.licensees\s+WHERE\s+license_id\s*=\s*v_license\.id\s+LIMIT\s+1\s*;',
    'v_licensee_id := public.entity_for_license(v_license.id, _application_id);',
    'g');

  IF d2 = d THEN
    RAISE EXCEPTION 'Wave B preflight A: no legacy licence->entity lookup matched; aborting rather than silently skipping';
  END IF;

  EXECUTE d2;
END $patch$;
