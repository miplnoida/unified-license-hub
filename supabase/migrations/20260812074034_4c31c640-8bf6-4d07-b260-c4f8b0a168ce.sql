DO $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_app
  FROM public.applications
  WHERE application_number = 'APP-2026-000136';

  IF v_app.id IS NULL THEN v_missing := array_append(v_missing, 'application'); END IF;
  IF nullif(trim(coalesce(v_app.application_number, '')), '') IS NULL THEN v_missing := array_append(v_missing, 'application_number'); END IF;
  IF nullif(trim(coalesce(v_app.license_type, '')), '') IS NULL THEN v_missing := array_append(v_missing, 'license_type'); END IF;
  IF nullif(trim(coalesce(v_app.decision_rationale, '')), '') IS NULL THEN v_missing := array_append(v_missing, 'rationale'); END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Decision letter still has missing inputs: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;