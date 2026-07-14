
-- Normalize review_step_permissions: when enabled=false, force can_* to false
CREATE OR REPLACE FUNCTION public.normalize_review_step_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.enabled = false THEN
    NEW.can_view := false;
    NEW.can_comment := false;
    NEW.can_reply := false;
    NEW.can_suggest := false;
    NEW.can_accept := false;
    NEW.can_reject := false;
    NEW.can_resolve := false;
    NEW.can_mark_blocking := false;
    NEW.block_approval_on_unresolved_blocking := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_normalize_review_step_permissions ON public.review_step_permissions;
CREATE TRIGGER trg_normalize_review_step_permissions
BEFORE INSERT OR UPDATE ON public.review_step_permissions
FOR EACH ROW EXECUTE FUNCTION public.normalize_review_step_permissions();

-- Copy permissions from one step to another (admin-only)
CREATE OR REPLACE FUNCTION public.copy_review_step_permissions(_from_step uuid, _to_step uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  _wf uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'REVIEW_UNAUTHENTICATED'; END IF;
  IF NOT public.is_collab_admin(auth.uid()) THEN
    RAISE EXCEPTION 'REVIEW_FORBIDDEN_ACTION';
  END IF;
  SELECT workflow_id INTO _wf FROM public.approval_steps WHERE id = _to_step;
  IF _wf IS NULL THEN RAISE EXCEPTION 'REVIEW_UNKNOWN_STEP'; END IF;

  INSERT INTO public.review_step_permissions (
    workflow_id, step_id, role_id, enabled, can_view, can_comment, can_reply,
    can_suggest, can_accept, can_reject, can_resolve, can_mark_blocking,
    block_approval_on_unresolved_blocking
  )
  SELECT _wf, _to_step, role_id, enabled, can_view, can_comment, can_reply,
         can_suggest, can_accept, can_reject, can_resolve, can_mark_blocking,
         block_approval_on_unresolved_blocking
  FROM public.review_step_permissions
  WHERE step_id = _from_step
  ON CONFLICT (step_id, role_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    can_view = EXCLUDED.can_view,
    can_comment = EXCLUDED.can_comment,
    can_reply = EXCLUDED.can_reply,
    can_suggest = EXCLUDED.can_suggest,
    can_accept = EXCLUDED.can_accept,
    can_reject = EXCLUDED.can_reject,
    can_resolve = EXCLUDED.can_resolve,
    can_mark_blocking = EXCLUDED.can_mark_blocking,
    block_approval_on_unresolved_blocking = EXCLUDED.block_approval_on_unresolved_blocking;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.copy_review_step_permissions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_review_step_permissions(uuid, uuid) TO authenticated;
