-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE (superseded diagnosis): this migration was originally written believing
-- log_application_triage_change() still inserted into audit_logs using
-- nonexistent columns (table_name, record_id, old_values, new_values). That
-- bug was already fixed by 20260704130514_5e9ef990-...sql, which corrected the
-- columns AND added a `metadata` (source/application_id/reason) payload to
-- both inserts. This migration's original body used the right column names
-- but omitted that `metadata` column, which would have silently regressed it
-- on deploy. Rewritten below to be a no-op re-application of the already-
-- correct 20260704130514 version — nothing to fix here, kept only so the
-- migration history stays consistent.
-- ─────────────────────────────────────────────────────────────────────────────

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
