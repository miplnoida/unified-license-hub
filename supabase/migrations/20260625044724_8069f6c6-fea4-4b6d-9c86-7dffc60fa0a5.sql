
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
  -- Pull scope from returns_filed; fall back to the return configuration for
  -- category_id (returns_filed does not store it directly).
  SELECT rf.sector_id,
         rf.subsector_id,
         rc.category_id,
         s.regulator_id
    INTO v_sector, v_sub, v_category, v_regulator
    FROM public.returns_filed rf
    LEFT JOIN public.return_configurations rc ON rc.id = rf.return_configuration_id
    LEFT JOIN public.sectors s ON s.id = rf.sector_id
   WHERE rf.id = _return_id;

  -- Strict scope match. Each scoped column on the workflow must EITHER be NULL
  -- (covers everything below it) OR equal the return's value. Most-specific
  -- match wins. We do NOT accept a fully-unscoped workflow (all NULL) — that
  -- would be a static catch-all and mask routing misconfiguration.
  SELECT id INTO v_workflow_id
    FROM public.approval_workflows
   WHERE entity_type IN ('return', 'compliance')
     AND is_active = true
     AND (regulator_id = v_regulator OR regulator_id IS NULL)
     AND (sector_id IS NULL OR sector_id = v_sector)
     AND (sub_sector_id IS NULL OR sub_sector_id = v_sub)
     AND (category_id IS NULL OR category_id = v_category)
     AND (
       regulator_id IS NOT NULL
       OR sector_id IS NOT NULL
       OR sub_sector_id IS NOT NULL
       OR category_id IS NOT NULL
     )
   ORDER BY (category_id = v_category)::int DESC,
            (sub_sector_id = v_sub)::int DESC,
            (sector_id = v_sector)::int DESC,
            (regulator_id = v_regulator)::int DESC,
            created_at ASC
   LIMIT 1;

  RETURN v_workflow_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_return_workflow(uuid) TO authenticated, service_role;
