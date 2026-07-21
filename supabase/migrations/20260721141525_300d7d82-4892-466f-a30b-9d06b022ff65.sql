-- Slice 12: Return Queue assignment-only lifecycle lockdown.
--
-- Prior state: the 4-arg can_view_entity_returns delegated to the 2-arg
-- overload, which granted assignment-only users ANY status for mapped
-- entities. That contradicts the documented rule that assignment-only
-- regulators must only see post-submission returns.
--
-- New rule for the 4-arg overload:
--   super_admin                                      -> true
--   has_permission(returns_management.view_all_entities) -> true
--   has_permission(returns_management.view)          -> assignment-agnostic, any status
--   assignment-only user                             -> assignment AND submitted lifecycle
--
-- The 2-arg overload is preserved for callers that already filter status
-- elsewhere (e.g. storage helpers that resolve status separately). It keeps
-- assignment-based visibility without a status gate.

CREATE OR REPLACE FUNCTION public.can_view_entity_returns(
  _user_id uuid,
  _licensee_id uuid,
  _workflow_status text,
  _status text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _licensee_id IS NULL THEN false
    WHEN public.is_super_admin(_user_id) THEN true
    WHEN public.has_permission(_user_id, 'returns_management', 'view_all_entities') THEN true
    -- Users holding the standard view permission: assignment gates entity
    -- scope, but no lifecycle gate is applied (they legitimately review
    -- drafts they own or WIP records inside their queue).
    WHEN public.has_permission(_user_id, 'returns_management', 'view')
      AND public.user_has_entity_assignment(_user_id, _licensee_id) THEN true
    -- Assignment-only regulators: entity must match AND record must be in
    -- the submitted lifecycle. Prefer workflow_status when present, fall
    -- back to status.
    WHEN public.user_has_entity_assignment(_user_id, _licensee_id)
      AND public.is_assignment_only_regulator(_user_id)
      AND public.return_status_is_submitted_lifecycle(
        COALESCE(NULLIF(_workflow_status, ''), _status)
      ) THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text) IS
  'Slice 12 lockdown: assignment-only regulators see mapped returns only in the submitted lifecycle. Super_admin, view_all_entities, and returns_management.view are unaffected.';
