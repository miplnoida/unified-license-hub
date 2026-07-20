
-- Enforce base `returns_management.view` permission for the assignment branch.
-- Super admin and `returns_management.view_all_entities` continue to bypass.
-- Function signatures unchanged so every existing caller inherits the fix.

CREATE OR REPLACE FUNCTION public.can_view_entity_returns(
  _user_id uuid,
  _licensee_id uuid,
  _workflow_status text,
  _status text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned boolean;
  v_submitted boolean;
BEGIN
  IF _user_id IS NULL OR _licensee_id IS NULL THEN
    RETURN false;
  END IF;

  -- Bypass 1: super admin
  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Bypass 2: explicit "view all entities" permission
  IF public.user_has_permission(_user_id, 'returns_management', 'view_all_entities') THEN
    RETURN true;
  END IF;

  -- Assignment branch requires the base "view returns" permission
  IF NOT public.user_has_permission(_user_id, 'returns_management', 'view') THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.id = _licensee_id
      AND (
        l.lead_regulator_id = _user_id
        OR l.regulator_officer_id = _user_id
        OR l.alternate_regulator_id = _user_id
      )
  ) INTO v_assigned;

  IF NOT v_assigned THEN
    RETURN false;
  END IF;

  v_submitted := (
    lower(coalesce(_status, '')) IN (
      'submitted','accepted','rejected','resubmission_requested',
      'under_review','resubmitted','resubmit_requested'
    )
    OR upper(coalesce(_workflow_status, '')) IN (
      'SUB','REV','ACC','REJ','SIGN_OFF','SUBMITTED','UNDER_REVIEW',
      'ACCEPTED','REJECTED','RESUBMISSION_REQUESTED','RESUBMITTED'
    )
  );

  RETURN v_submitted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid, text, text) TO authenticated;

-- 2-arg overload used by non-return / licensee-level checks. Same rules minus
-- the submitted-status gate (callers don't have a return row in scope).
CREATE OR REPLACE FUNCTION public.can_view_entity_returns(
  _user_id uuid,
  _licensee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _licensee_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  IF public.user_has_permission(_user_id, 'returns_management', 'view_all_entities') THEN
    RETURN true;
  END IF;

  IF NOT public.user_has_permission(_user_id, 'returns_management', 'view') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.id = _licensee_id
      AND (
        l.lead_regulator_id = _user_id
        OR l.regulator_officer_id = _user_id
        OR l.alternate_regulator_id = _user_id
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_entity_returns(uuid, uuid) TO authenticated;
