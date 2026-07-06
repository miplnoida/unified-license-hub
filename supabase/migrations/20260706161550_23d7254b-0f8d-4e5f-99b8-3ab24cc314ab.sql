
CREATE OR REPLACE FUNCTION public.resolve_return_workflow(_return_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sector uuid;
  v_sub uuid;
  v_regulator uuid;
  v_workflow_id uuid;
BEGIN
  SELECT rf.sector_id,
         COALESCE(rf.subsector_id, rcs.subsector_id, rcn.sub_sector_id),
         COALESCE(s.regulator_id, s2.regulator_id, rcn.regulator_id)
    INTO v_sector, v_sub, v_regulator
    FROM public.returns_filed rf
    LEFT JOIN public.return_configs rcs ON rcs.id = rf.return_configuration_id
    LEFT JOIN public.return_configurations rcn ON rcn.id = rf.return_configuration_id
    LEFT JOIN public.sectors s ON s.id = rf.sector_id
    LEFT JOIN public.sectors s2 ON s2.id = rcs.sector_id
   WHERE rf.id = _return_id;

  IF v_sector IS NULL THEN
    v_sector := (SELECT rcs.sector_id FROM public.returns_filed rf
                   LEFT JOIN public.return_configs rcs ON rcs.id = rf.return_configuration_id
                  WHERE rf.id = _return_id);
  END IF;

  -- A workflow's scoped column matches when it's NULL (covers everything below
  -- it) OR equal to the return's value. When the return itself has no value
  -- for a given scope (v_* IS NULL), we accept any workflow at that scope
  -- level rather than refusing to route — the admin's scoping intent still
  -- wins via the ORDER BY below (most-specific match first).
  SELECT id INTO v_workflow_id
    FROM public.approval_workflows
   WHERE entity_type IN ('return', 'compliance')
     AND is_active = true
     AND (regulator_id IS NULL OR v_regulator IS NULL OR regulator_id = v_regulator)
     AND (sector_id IS NULL OR v_sector IS NULL OR sector_id = v_sector)
     AND (sub_sector_id IS NULL OR v_sub IS NULL OR sub_sector_id = v_sub)
     AND category_id IS NULL
   ORDER BY (sub_sector_id IS NOT NULL AND sub_sector_id = v_sub)::int DESC,
            (sector_id IS NOT NULL AND sector_id = v_sector)::int DESC,
            (regulator_id IS NOT NULL AND regulator_id = v_regulator)::int DESC,
            created_at ASC
   LIMIT 1;

  RETURN v_workflow_id;
END;
$function$;

SELECT public.start_return_workflow('f2559959-c434-4412-9f90-64c0f6aa05b4'::uuid);
