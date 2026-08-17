DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.applications
    WHERE application_number = 'APP-2026-000136'
      AND nullif(trim(coalesce(decision_rationale, '')), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'APP-2026-000136 decision rationale was not restored';
  END IF;
END;
$$;