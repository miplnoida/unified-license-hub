CREATE OR REPLACE FUNCTION public.set_application_rejected_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'rejected' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'rejected') AND NEW.rejected_at IS NULL THEN
    NEW.rejected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_application_rejected_at ON public.applications;
CREATE TRIGGER trg_set_application_rejected_at
BEFORE INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.set_application_rejected_at();