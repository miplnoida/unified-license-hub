
CREATE OR REPLACE FUNCTION public.log_coordination_case_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'coordination.case.' || NEW.status,
      'coordination_case',
      NEW.id,
      jsonb_build_object(
        'from_status', OLD.status,
        'to_status', NEW.status,
        'subject_type', NEW.subject_type,
        'subject_id', NEW.subject_id,
        'primary_regulator_id', NEW.primary_regulator_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_coordination_case_change ON public.coordination_cases;
CREATE TRIGGER trg_log_coordination_case_change
AFTER UPDATE ON public.coordination_cases
FOR EACH ROW EXECUTE FUNCTION public.log_coordination_case_change();

CREATE OR REPLACE FUNCTION public.log_coordination_flag_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'coordination.flag.raised',
      'coordination_flag',
      NEW.id,
      jsonb_build_object(
        'case_id', NEW.case_id,
        'flag_type', NEW.flag_type,
        'linked_application_id', NEW.linked_application_id,
        'linked_license_id', NEW.linked_license_id
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status IN ('resolved','withdrawn') THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'coordination.flag.' || NEW.status,
      'coordination_flag',
      NEW.id,
      jsonb_build_object(
        'case_id', NEW.case_id,
        'flag_type', NEW.flag_type,
        'linked_application_id', NEW.linked_application_id,
        'linked_license_id', NEW.linked_license_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_coordination_flag_ins ON public.coordination_flags;
DROP TRIGGER IF EXISTS trg_log_coordination_flag_upd ON public.coordination_flags;
CREATE TRIGGER trg_log_coordination_flag_ins
AFTER INSERT ON public.coordination_flags
FOR EACH ROW EXECUTE FUNCTION public.log_coordination_flag_change();
CREATE TRIGGER trg_log_coordination_flag_upd
AFTER UPDATE ON public.coordination_flags
FOR EACH ROW EXECUTE FUNCTION public.log_coordination_flag_change();
