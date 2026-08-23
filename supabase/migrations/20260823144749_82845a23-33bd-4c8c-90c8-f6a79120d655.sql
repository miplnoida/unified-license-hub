-- GAP: an enforcement officer holding scoped `view` could not read the case
-- they themselves referred/opened or are assigned to, because entity-level
-- supervisory assignment is not how enforcement work is allocated.
CREATE OR REPLACE FUNCTION public.can_read_enforcement(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'enforcement_management', 'view_all_entities')
    OR (
      public.has_permission(_user_id, 'enforcement_management', 'view')
      AND (
        _entity_id IS NULL
        OR public.user_has_entity_assignment(_user_id, _entity_id)
        OR EXISTS (
          SELECT 1 FROM public.enforcement_actions ea
          WHERE ea.entity_id = _entity_id
            AND _user_id IN (ea.referred_by, ea.opened_by, ea.assigned_to)
        )
      )
    );
$function$;