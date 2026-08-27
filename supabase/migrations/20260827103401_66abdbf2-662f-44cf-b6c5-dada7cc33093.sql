-- =========================================================
-- Post-Licensing Workflow Consolidation: Phase 1 & 2
-- Idempotent. No deletions, no deactivations.
-- =========================================================

-- ---------------------------------------------------------
-- PHASE 1: designate 4 canonical reusable post-license workflows
-- (reuse existing verified representatives; steps untouched)
-- ---------------------------------------------------------
UPDATE public.approval_workflows
   SET name = 'Standard Post-License Approval',
       description = 'Canonical reusable post-license workflow: Licensing Analyst Review -> Licensing Officer -> Final Approval (Licensing Supervisor).',
       entity_type = 'post_application',
       is_active = true
 WHERE id = '7e9e0fc2-2961-42c2-a2fd-a0d6601707dc';

UPDATE public.approval_workflows
   SET name = 'Enhanced Post-License Approval',
       description = 'Canonical reusable post-license workflow: Licensing Analyst Review -> Specialist Review (Prudential Supervisor) -> Final Approval (Licensing Supervisor).',
       entity_type = 'post_application',
       is_active = true
 WHERE id = '2b5fdc86-bf8a-4c96-9620-54585f5332e7';

UPDATE public.approval_workflows
   SET name = 'Fit & Proper Post-License Approval',
       description = 'Canonical reusable post-license workflow: Licensing Analyst Review -> Fit & Proper Assessment -> Licensing Officer -> Final Approval (Licensing Supervisor).',
       entity_type = 'post_application',
       is_active = true
 WHERE id = '24d71346-6214-49ed-8250-1cf09b9a7492';

UPDATE public.approval_workflows
   SET name = 'Post-License Notification',
       description = 'Canonical reusable post-license notification workflow: Regulatory Review -> Acknowledge & Close.',
       entity_type = 'post_application',
       is_active = true
 WHERE id = 'd2590edc-fa3a-421b-866d-905ebfee40d6';

-- ---------------------------------------------------------
-- PHASE 2: map all 120 post-license services to canonical workflows
-- Rule: requires_fit_and_proper = true  -> Fit & Proper pattern
--       decision_type = 'notification'  -> Notification pattern
--       otherwise service-group mapping (Standard / Enhanced)
-- ---------------------------------------------------------

-- Fit & Proper (F&P flag wins over the service group)
UPDATE public.services s
   SET workflow_id = '24d71346-6214-49ed-8250-1cf09b9a7492',
       updated_at = now()
 WHERE s.lifecycle_stage = 'post_license'
   AND s.requires_fit_and_proper = true
   AND s.workflow_id IS DISTINCT FROM '24d71346-6214-49ed-8250-1cf09b9a7492';

-- Notification
UPDATE public.services s
   SET workflow_id = 'd2590edc-fa3a-421b-866d-905ebfee40d6',
       updated_at = now()
 WHERE s.lifecycle_stage = 'post_license'
   AND s.requires_fit_and_proper = false
   AND s.decision_type = 'notification'
   AND s.workflow_id IS DISTINCT FROM 'd2590edc-fa3a-421b-866d-905ebfee40d6';

-- Enhanced
UPDATE public.services s
   SET workflow_id = '2b5fdc86-bf8a-4c96-9620-54585f5332e7',
       updated_at = now()
 WHERE s.lifecycle_stage = 'post_license'
   AND s.requires_fit_and_proper = false
   AND s.decision_type <> 'notification'
   AND s.name IN ('Group Restructure', 'Entity Deregistration / Relationship Closure')
   AND s.workflow_id IS DISTINCT FROM '2b5fdc86-bf8a-4c96-9620-54585f5332e7';

-- Standard
UPDATE public.services s
   SET workflow_id = '7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',
       updated_at = now()
 WHERE s.lifecycle_stage = 'post_license'
   AND s.requires_fit_and_proper = false
   AND s.decision_type <> 'notification'
   AND s.name IN ('Change of Legal Name', 'Change of Address', 'New Branch', 'Branch Closure', 'External Auditor Change')
   AND s.workflow_id IS DISTINCT FROM '7e9e0fc2-2961-42c2-a2fd-a0d6601707dc';

-- Guard: every post-license service must be mapped to one of the 4 canonical workflows
DO $guard$
DECLARE v_unmapped integer;
BEGIN
  SELECT count(*) INTO v_unmapped
    FROM public.services
   WHERE lifecycle_stage = 'post_license'
     AND (workflow_id IS NULL
          OR workflow_id NOT IN ('7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',
                                 '2b5fdc86-bf8a-4c96-9620-54585f5332e7',
                                 '24d71346-6214-49ed-8250-1cf09b9a7492',
                                 'd2590edc-fa3a-421b-866d-905ebfee40d6'));
  IF v_unmapped > 0 THEN
    RAISE EXCEPTION 'Post-license service mapping incomplete: % service row(s) not mapped to a canonical workflow', v_unmapped;
  END IF;
END
$guard$;

-- ---------------------------------------------------------
-- RESOLVER: prefer explicit services.workflow_id, then existing taxonomy chain
-- (additive tier only; all existing fallback behaviour preserved verbatim)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid,
  _is_post_license boolean,
  _service_id uuid,
  _sub_sector_id uuid
)
RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
  v_entity_types text[];
  v_is_post boolean := COALESCE(_is_post_license, false);
  v_sub_sector_id uuid := _sub_sector_id;
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  v_entity_types := CASE WHEN v_is_post
                         THEN ARRAY['post_application','application']
                         ELSE ARRAY['pre_application','application'] END;

  -- Derive sub_sector from category when not passed in.
  IF v_sub_sector_id IS NULL AND _category_id IS NOT NULL THEN
    SELECT sub_sector_id INTO v_sub_sector_id FROM public.categories WHERE id = _category_id;
  END IF;

  -- 0. EXPLICIT SERVICE MAPPING (highest precedence): services.workflow_id
  IF _service_id IS NOT NULL THEN
    SELECT aw.id INTO v_wf_id
      FROM public.services sv
      JOIN public.approval_workflows aw ON aw.id = sv.workflow_id
     WHERE sv.id = _service_id
       AND aw.is_active = true
       AND aw.entity_type = ANY(v_entity_types)
     LIMIT 1;
  END IF;

  -- TAXONOMY MATCH (license_type ignored): most specific wins.
  -- service > category > sub_sector > sector > regulator-only.

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _service_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.service_id = _service_id
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.category_id = _category_id
       AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND v_sub_sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.sub_sector_id = v_sub_sector_id
       AND aw.category_id IS NULL AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.sector_id = _sector_id
       AND aw.sub_sector_id IS NULL AND aw.category_id IS NULL AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg
       AND aw.sector_id IS NULL AND aw.sub_sector_id IS NULL
       AND aw.category_id IS NULL AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  -- LEGACY license_type prefix match (back-compat for older configs).
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg
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
   WHERE s.workflow_id = v_wf_id ORDER BY s.step_order ASC LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public._resolve_application_workflow(text, uuid, uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._resolve_application_workflow(text, uuid, uuid, uuid, boolean, uuid, uuid) TO authenticated, service_role;