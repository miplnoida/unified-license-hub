-- FINAL CERTIFICATION DEFECT FIX: audit principal attribution (forward-only; history stays immutable)
CREATE OR REPLACE FUNCTION public.tg_cal_enforce_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  NEW."timestamp" := now();
  NEW.created_at  := now();

  IF NEW.action_type = 'OVERRIDE'::public.compliance_audit_action
     AND (NEW.justification IS NULL OR length(btrim(NEW.justification)) < 10) THEN
    RAISE EXCEPTION 'Justification (min 10 chars) is mandatory for OVERRIDE actions';
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.user_role IS NULL OR btrim(NEW.user_role) = '' THEN
    IF NEW.user_id IS NOT NULL THEN
      SELECT r.key
        INTO v_role
      FROM public.sec_user_roles ur
      JOIN public.sec_roles r ON r.id = ur.role_id
      WHERE ur.user_id = NEW.user_id
      ORDER BY r.key
      LIMIT 1;
    END IF;

    NEW.user_role := COALESCE(
      v_role,
      CASE WHEN NEW.user_id IS NULL THEN 'SYSTEM' ELSE 'AUTHENTICATED' END
    );
  END IF;

  RETURN NEW;
END;
$function$;