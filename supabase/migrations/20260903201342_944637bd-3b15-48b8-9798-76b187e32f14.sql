CREATE OR REPLACE FUNCTION public.supervisory_assessment_methodology_freeze()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IN ('approved','closed','superseded')
     AND (NEW.methodology_id IS DISTINCT FROM OLD.methodology_id
          OR NEW.methodology_version IS DISTINCT FROM OLD.methodology_version) THEN
    RAISE EXCEPTION 'methodology_frozen: the methodology version of an approved assessment cannot be changed'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS supervisory_assessment_methodology_freeze_trg ON public.supervisory_assessment;
CREATE TRIGGER supervisory_assessment_methodology_freeze_trg
  BEFORE UPDATE ON public.supervisory_assessment
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_methodology_freeze();