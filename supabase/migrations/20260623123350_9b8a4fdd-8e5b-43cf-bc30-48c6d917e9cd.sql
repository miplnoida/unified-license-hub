-- Restore Registration / New Licensee workflow matching.
--
-- Two real gaps caused submitted New Licensee applications to show
-- "Workflow not active/configured":
--
-- 1. `_resolve_application_workflow` only considered approval_workflows
--    rows whose entity_type was in ('pre_application','application',
--    'post_application'). Admin-configured Registration workflows are
--    stored with entity_type='registration' and were therefore ignored.
--
-- 2. There was no last-resort match for a regulator-scoped or global
--    active Registration / Pre-Application workflow when no license_type
--    pattern matched. The earlier synthetic 3-step fallback was removed
--    (correctly), but no real-config fallback replaced it.
--
-- This migration:
--   * Adds 'registration' to the entity-type set for new-licensee context.
--   * Adds final fallbacks (regulator-scoped, then global) that match any
--     active Registration / Pre-Application workflow without filtering on
--     license_type. These only run when no license_type-aware match was
--     found, so an admin-configured workflow always wins.
--   * Post-license context is unchanged: it only matches
--     post_application / application workflows, never Registration.

CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid,
  _is_post_license boolean DEFAULT false
)
RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
  v_entity_types text[];
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  -- New Licensee / Registration submissions can be configured under either
  -- 'registration' or 'pre_application' (legacy). Treat both as eligible.
  v_entity_types := CASE WHEN _is_post_license
                         THEN ARRAY['post_application','application']
                         ELSE ARRAY['registration','pre_application','application'] END;

  -- 1. effective regulator + category (license type match)
  IF v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.category_id=_category_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 2. effective regulator + sector (license type match)
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.sector_id=_sector_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 3. effective regulator only (license type match)
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type),
              (aw.category_id IS NULL), (aw.sector_id IS NULL),
              length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 4. original regulator (license type match)
  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL AND _regulator_id IS DISTINCT FROM v_eff_reg THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=_regulator_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 5. exact license_type (any regulator)
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.license_type=_license_type AND aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
     ORDER BY array_position(v_entity_types, aw.entity_type)
     LIMIT 1;
  END IF;

  -- 6. prefix-tolerant license_type only
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true AND aw.license_type<>''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 7. Final fallback: regulator-scoped active Registration / Pre-Application
  --    workflow, without any license_type filter. Only used for the
  --    new-licensee context (not post-license).
  IF v_wf_id IS NULL AND NOT _is_post_license AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type IN ('registration','pre_application')
       AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
     ORDER BY (aw.entity_type = 'registration') DESC,
              (aw.category_id IS NULL), (aw.sector_id IS NULL),
              aw.updated_at DESC
     LIMIT 1;
  END IF;

  -- 8. Final global fallback: any active Registration / Pre-Application
  --    workflow with no regulator binding (truly global). Still scoped to
  --    the new-licensee context.
  IF v_wf_id IS NULL AND NOT _is_post_license THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type IN ('registration','pre_application')
       AND aw.is_active=true
       AND aw.regulator_id IS NULL
     ORDER BY (aw.entity_type = 'registration') DESC,
              aw.updated_at DESC
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

-- Backfill: repair already-submitted New Licensee applications whose
-- workflow could not be matched at submission time. This is idempotent;
-- the repair function skips applications that already have an active
-- workflow instance.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.applications
     WHERE workflow_id IS NULL
       AND status IN ('submitted','in_progress','resubmission_requested',
                      'resubmission_required','returned_for_correction',
                      'info_requested','query_raised','in_review',
                      'pending_review','under_review','forwarded','awaiting_approval')
  LOOP
    PERFORM public.repair_application_workflow(r.id);
  END LOOP;
END $$;