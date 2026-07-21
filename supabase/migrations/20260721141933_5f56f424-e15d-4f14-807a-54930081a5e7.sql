
-- Slice 13: Remove assignment-alone read branches. Required rule:
--   super_admin OR view_all_entities OR (view AND entity assignment)

CREATE OR REPLACE FUNCTION public.can_read_enforcement(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'enforcement_management', 'view_all_entities')
    OR (
      public.has_permission(_user_id, 'enforcement_management', 'view')
      AND (_entity_id IS NULL OR public.user_has_entity_assignment(_user_id, _entity_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_inspection(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'inspection_management', 'view_all_entities')
    OR (
      public.has_permission(_user_id, 'inspection_management', 'view')
      AND (_entity_id IS NULL OR public.user_has_entity_assignment(_user_id, _entity_id))
    );
$$;

-- Re-assert least-privilege grants (idempotent).
REVOKE ALL ON FUNCTION public.can_read_enforcement(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_inspection(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_enforcement(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_inspection(uuid,uuid) TO authenticated, service_role;
