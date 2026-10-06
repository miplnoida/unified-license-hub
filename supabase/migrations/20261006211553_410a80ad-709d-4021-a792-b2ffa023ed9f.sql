-- AML-CLOSE-07C: forward-only guard. AML/CFT assessments may become is_current only via governed publication.
-- No historical data is updated; existing legacy is_current=true rows are untouched.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_aml_current_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.domain_code IS DISTINCT FROM 'AML_CFT' OR NOT COALESCE(NEW.is_current,false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_current,false) THEN
    RETURN NEW; -- pre-existing legacy flag: ordinary updates are not blocked
  END IF;
  IF NEW.risk_publication_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.supervisory_assessment_risk_publication p
        WHERE p.id = NEW.risk_publication_id AND p.assessment_id = NEW.id) THEN
    RAISE EXCEPTION 'governed_publication_required: an AML/CFT assessment becomes current only through governed publication'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_aml_current_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS supervisory_assessment_aml_current_guard ON public.supervisory_assessment;
CREATE TRIGGER supervisory_assessment_aml_current_guard
  BEFORE INSERT OR UPDATE OF is_current ON public.supervisory_assessment
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_aml_current_guard();