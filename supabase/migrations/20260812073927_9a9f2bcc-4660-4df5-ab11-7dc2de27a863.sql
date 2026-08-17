CREATE OR REPLACE FUNCTION public.sync_application_decision_rationale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text := lower(trim(coalesce(NEW.action_type, NEW.action, '')));
BEGIN
  IF v_action IN (
    'approve', 'approved', 'conditional_approve', 'conditionally_approved',
    'reject', 'rejected', 'return', 'resubmission_requested', 'defer', 'deferred'
  ) AND nullif(trim(coalesce(NEW.comments, '')), '') IS NOT NULL THEN
    UPDATE public.applications
       SET decision_rationale = trim(NEW.comments),
           updated_at = greatest(coalesce(updated_at, NEW.created_at), NEW.created_at)
     WHERE id = NEW.application_id
       AND decision_rationale IS DISTINCT FROM trim(NEW.comments);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_application_decision_rationale ON public.approval_actions;
CREATE TRIGGER trg_sync_application_decision_rationale
AFTER INSERT ON public.approval_actions
FOR EACH ROW
EXECUTE FUNCTION public.sync_application_decision_rationale();

REVOKE ALL ON FUNCTION public.sync_application_decision_rationale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_application_decision_rationale() TO service_role;

COMMENT ON FUNCTION public.sync_application_decision_rationale() IS
  'Synchronizes final approval action remarks to applications.decision_rationale for decision document issuance.';