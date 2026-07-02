
-- Phase 2.3: SLA-age & priority queue support for applications

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS priority_set_by uuid,
  ADD COLUMN IF NOT EXISTS priority_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Priority scale documentation:
--   1 = Critical, 2 = High, 3 = Normal (default), 4 = Low, 5 = Deferred
ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_priority_check;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_priority_check CHECK (priority BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS applications_priority_status_idx
  ON public.applications (priority, status)
  WHERE status IN ('submitted', 'in_progress', 'resubmission_requested', 'query_raised');

CREATE INDEX IF NOT EXISTS applications_assigned_to_idx
  ON public.applications (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Audit trigger: log priority + assignment changes into audit_logs so they
-- appear on the unified EntityTimeline (Phase 1 primitive).
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
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
      actor,
      'application.priority_changed',
      'applications',
      NEW.id::text,
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority, 'reason', NEW.priority_reason)
    );
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
      actor,
      'application.assigned',
      'applications',
      NEW.id::text,
      jsonb_build_object('assigned_to', OLD.assigned_to),
      jsonb_build_object('assigned_to', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_triage_audit ON public.applications;
CREATE TRIGGER applications_triage_audit
AFTER UPDATE OF priority, assigned_to ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.log_application_triage_change();
