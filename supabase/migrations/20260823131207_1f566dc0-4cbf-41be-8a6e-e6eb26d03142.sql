-- GAP-3D-003 (P1, authorisation): returns_can_file accepted
-- returns_management.create — a PREPARATION permission held by external
-- secondary/preparer users — as submission authority, letting a prepare-only
-- entity user make the final regulatory submission. External users must now
-- hold an entity submit capability; the create/edit permission only carries
-- filing authority for internal staff filing on an entity's behalf.
CREATE OR REPLACE FUNCTION public.returns_can_file(_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_super_admin(auth.uid())
    OR (
      public.sec_is_internal_user(auth.uid())
      AND NOT public.has_external_role(auth.uid())
      AND public.has_permission(auth.uid(), 'returns_management', 'create')
    )
    OR public.entity_membership_capability(auth.uid(), _entity_id, 'returns.submit')
  );
$function$;