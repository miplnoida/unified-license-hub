CREATE OR REPLACE FUNCTION public.log_application_triage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (
      actor,
      'application.priority_changed',
      'applications',
      NEW.id::text,
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority, 'reason', NEW.priority_reason),
      jsonb_build_object('source', 'trigger', 'application_id', NEW.id, 'reason', NEW.priority_reason)
    );
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (
      actor,
      'application.assigned',
      'applications',
      NEW.id::text,
      jsonb_build_object('assigned_to', OLD.assigned_to),
      jsonb_build_object('assigned_to', NEW.assigned_to),
      jsonb_build_object('source', 'trigger', 'application_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;