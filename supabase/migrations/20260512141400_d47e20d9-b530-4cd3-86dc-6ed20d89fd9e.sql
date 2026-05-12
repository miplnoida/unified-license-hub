CREATE OR REPLACE FUNCTION public.validate_form_version_effective_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.effective_from IS NOT NULL
     AND NEW.effective_until IS NOT NULL
     AND NEW.effective_until < NEW.effective_from THEN
    RAISE EXCEPTION 'FORM_VERSION_INVALID_EFFECTIVE_RANGE'
      USING MESSAGE = 'effective_until cannot be before effective_from';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_form_version_effective_dates ON public.form_versions;

CREATE TRIGGER validate_form_version_effective_dates
BEFORE INSERT OR UPDATE ON public.form_versions
FOR EACH ROW
EXECUTE FUNCTION public.validate_form_version_effective_dates();