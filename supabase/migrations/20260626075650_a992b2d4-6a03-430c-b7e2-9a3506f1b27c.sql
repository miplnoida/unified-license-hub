
-- Fix pre/post-license workflow routing: taxonomy-first matching.
-- Bug: apps with license_type="Building Society - …" never matched pre_application
-- workflows configured with license_type="general", and final fallback then
-- bound them to an unrelated "registration" workflow.

CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text, _regulator_id uuid, _sector_id uuid, _category_id uuid,
  _is_post_license boolean DEFAULT false
)
RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
  v_entity_types text[];
  v_is_post boolean := COALESCE(_is_post_license, false);
  v_sub_sector_id uuid;
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  -- Pre-license applications never resolve to a 'registration' workflow.
  v_entity_types := CASE WHEN v_is_post
                         THEN ARRAY['post_application','application']
                         ELSE ARRAY['pre_application','application'] END;

  -- Derive sub_sector from category when not passed in.
  IF _category_id IS NOT NULL THEN
    SELECT sub_sector_id INTO v_sub_sector_id FROM public.categories WHERE id=_category_id;
  END IF;

  -- TAXONOMY-FIRST MATCH (license_type ignored): most specific wins.
  -- service > category > sub_sector > sector > regulator-only.

  IF v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.category_id=_category_id
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND v_sub_sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.sub_sector_id=v_sub_sector_id
       AND aw.category_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.sector_id=_sector_id
       AND aw.sub_sector_id IS NULL AND aw.category_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.sector_id IS NULL AND aw.sub_sector_id IS NULL AND aw.category_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  -- LEGACY license_type prefix match (back-compat for older configs).
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.license_type <> '' AND lower(aw.license_type) <> 'general'
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type),
              (aw.category_id IS NULL), (aw.sub_sector_id IS NULL), (aw.sector_id IS NULL),
              length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_step_id FROM public.approval_steps s
   WHERE s.workflow_id=v_wf_id ORDER BY s.step_order ASC LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$function$;

-- Data repair: detach the wrong 'registration' workflow that was previously
-- attached to pre/post-license applications; cancel orphan instances; then
-- let repair_application_workflow rebind via the new resolver.
DO $$
DECLARE
  r record;
  v_res jsonb;
BEGIN
  FOR r IN
    SELECT a.id
      FROM public.applications a
      JOIN public.approval_workflows w ON w.id = a.workflow_id
     WHERE w.entity_type = 'registration'
       AND a.status NOT IN ('draft','approved','rejected','cancelled','withdrawn')
  LOOP
    PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

    UPDATE public.workflow_instances
       SET status = 'cancelled', updated_at = now()
     WHERE entity_id = r.id AND entity_type = 'application'
       AND status IN ('active','paused');

    UPDATE public.applications
       SET workflow_id = NULL, current_step_id = NULL, updated_at = now()
     WHERE id = r.id;

    BEGIN
      SELECT public.repair_application_workflow(r.id) INTO v_res;
      RAISE NOTICE 'repaired % => %', r.id, v_res;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'repair failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
