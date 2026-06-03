
-- =========================================================================
-- AUDIT COVERAGE: approval_actions + payment_receipts
-- =========================================================================

-- Workflow / approval_actions trigger.
-- Maps action_type → canonical audit action; falls back to workflow.action_taken.
CREATE OR REPLACE FUNCTION public.tg_approval_actions_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_app RECORD;
  v_meta jsonb;
BEGIN
  SELECT id, application_number, applicant_id, status
    INTO v_app
    FROM public.applications
   WHERE id = NEW.application_id
   LIMIT 1;

  v_action := CASE lower(coalesce(NEW.action, NEW.action_type, ''))
    WHEN 'edit_requested'    THEN 'application.edit_requested'
    WHEN 'edit_approved'     THEN 'application.edit_approved'
    WHEN 'edit_denied'       THEN 'application.edit_denied'
    WHEN 'resubmitted'       THEN 'application.resubmitted'
    WHEN 'forward'           THEN 'workflow.action_taken'
    WHEN 'return'            THEN 'workflow.action_taken'
    WHEN 'review'            THEN 'workflow.action_taken'
    WHEN 'approve'           THEN 'workflow.action_taken'
    WHEN 'approve_final'     THEN 'workflow.step_completed'
    WHEN 'reject'            THEN 'workflow.action_taken'
    WHEN 'delegate'          THEN 'workflow.reassigned'
    WHEN 'assign'            THEN 'workflow.assigned'
    ELSE 'workflow.action_taken'
  END;

  v_meta := jsonb_build_object(
    'source', 'trigger',
    'application_id', NEW.application_id,
    'application_number', v_app.application_number,
    'applicant_id', v_app.applicant_id,
    'approval_action_id', NEW.id,
    'workflow_instance_id', NEW.workflow_instance_id,
    'step_id', NEW.step_id,
    'action', NEW.action,
    'action_type', NEW.action_type,
    'actor_id', NEW.actor_id,
    'delegated_to', NEW.delegated_to,
    'delegated_from', NEW.delegated_from,
    'comments', NEW.comments
  );

  PERFORM public.write_audit(
    v_action,
    'application',
    NEW.application_id::text,
    COALESCE(NEW.actor_id, auth.uid()),
    NULL,
    to_jsonb(NEW),
    v_meta
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_actions_audit_trg ON public.approval_actions;
CREATE TRIGGER approval_actions_audit_trg
AFTER INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_approval_actions_audit();

-- =========================================================================
-- Payment receipts trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_payment_receipts_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_id uuid;
  v_app_number text;
  v_actor uuid := auth.uid();
BEGIN
  SELECT p.application_id, a.application_number
    INTO v_app_id, v_app_number
    FROM public.payments p
    LEFT JOIN public.applications a ON a.id = p.application_id
   WHERE p.id = NEW.payment_id
   LIMIT 1;

  PERFORM public.write_audit(
    'payment.receipt_generated',
    'payment',
    NEW.payment_id::text,
    v_actor,
    NULL,
    to_jsonb(NEW),
    jsonb_build_object(
      'source', 'trigger',
      'receipt_id', NEW.id,
      'receipt_number', NEW.receipt_number,
      'payment_id', NEW.payment_id,
      'application_id', v_app_id,
      'application_number', v_app_number,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'issued_to_email', NEW.issued_to_email,
      'issued_to_name', NEW.issued_to_name
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_receipts_audit_trg ON public.payment_receipts;
CREATE TRIGGER payment_receipts_audit_trg
AFTER INSERT ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_receipts_audit();
