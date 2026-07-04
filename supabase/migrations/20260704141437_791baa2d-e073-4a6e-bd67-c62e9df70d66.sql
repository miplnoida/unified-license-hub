
-- Fix enforce_application_decision_gate and enforce_license_decision_gate:
-- rule_overrides has no "context" or "expires_at" columns. Use the current
-- entity_type/entity_id columns instead.

CREATE OR REPLACE FUNCTION public.enforce_application_decision_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  blockers jsonb;
  override_exists boolean;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.rule_overrides
      WHERE rule_key = 'decision.gate.override'
        AND entity_type = 'application'
        AND entity_id = NEW.id::text
    ) INTO override_exists;

    IF NOT override_exists THEN
      blockers := public.check_decision_gates(NEW.id, NULL);
      IF jsonb_array_length(blockers) > 0 THEN
        RAISE EXCEPTION 'Decision blocked by unresolved gates: %', blockers::text
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_license_decision_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  blockers jsonb;
  override_exists boolean;
  new_status text;
  old_status text;
BEGIN
  new_status := NEW.status;
  old_status := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;

  IF new_status IN ('active','issued') AND (old_status IS NULL OR old_status IS DISTINCT FROM new_status) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.rule_overrides
      WHERE rule_key = 'decision.gate.override'
        AND (
          (entity_type = 'license'     AND entity_id = NEW.id::text)
          OR (entity_type = 'application' AND entity_id = NEW.application_id::text)
        )
    ) INTO override_exists;

    IF NOT override_exists THEN
      blockers := public.check_decision_gates(NEW.application_id, NEW.id);
      IF jsonb_array_length(blockers) > 0 THEN
        RAISE EXCEPTION 'License activation blocked by unresolved gates: %', blockers::text
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
