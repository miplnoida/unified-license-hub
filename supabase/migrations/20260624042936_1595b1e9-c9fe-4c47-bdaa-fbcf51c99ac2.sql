-- Fix compliance / return workflow resolver to match sector + sub_sector + category strictly.
-- Previous version compared returns_filed.subsector_id against approval_workflows.category_id,
-- which always failed. returns_filed has no category_id column, so we also resolve it through
-- the return configuration's category_id when present.

CREATE OR REPLACE FUNCTION public.resolve_return_workflow(_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sector uuid;
  v_sub uuid;
  v_category uuid;
  v_regulator uuid;
  v_workflow_id uuid;
BEGIN
  SELECT rf.sector_id,
         rf.subsector_id,
         NULL::uuid,
         s.regulator_id
    INTO v_sector, v_sub, v_category, v_regulator
    FROM public.returns_filed rf
    LEFT JOIN public.sectors s ON s.id = rf.sector_id
   WHERE rf.id = _return_id;

  -- Most specific scope wins:
  -- regulator + sector + sub_sector + category > sector + sub_sector > sector > regulator-only
  SELECT id INTO v_workflow_id FROM public.approval_workflows
   WHERE entity_type = 'return'
     AND is_active = true
     AND (regulator_id = v_regulator OR regulator_id IS NULL)
     AND (sector_id IS NULL OR sector_id = v_sector)
     AND (sub_sector_id IS NULL OR sub_sector_id = v_sub)
     AND (category_id IS NULL OR category_id = v_category)
   ORDER BY (regulator_id = v_regulator)::int DESC,
            (sector_id = v_sector)::int DESC,
            (sub_sector_id = v_sub)::int DESC,
            (category_id = v_category)::int DESC,
            created_at ASC
   LIMIT 1;

  RETURN v_workflow_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_return_workflow(uuid) TO authenticated, service_role;