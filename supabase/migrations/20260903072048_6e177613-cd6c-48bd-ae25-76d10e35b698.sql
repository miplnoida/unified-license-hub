CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_completeness_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _gaps jsonb; _n integer; _detail text;
BEGIN
  IF NEW.status = 'submitted' AND COALESCE(OLD.status,'') <> 'submitted' THEN
    _gaps := public.supervisory_assessment_question_gaps(NEW.id);
    _n := public.jsonb_array_len_safe(_gaps);
    IF _n > 0 THEN
      SELECT string_agg(format('%s %s (%s)', g->>'dimension_code', g->>'question_code', g->>'reason'), '; ')
        INTO _detail
        FROM jsonb_array_elements(_gaps) g;
      RAISE EXCEPTION 'mandatory_questions_incomplete: % mandatory supervisory question(s) are outstanding — %', _n, _detail
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supervisory_assessment_question_completeness ON public.supervisory_assessment;
CREATE TRIGGER supervisory_assessment_question_completeness
  BEFORE UPDATE OF status ON public.supervisory_assessment
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_question_completeness_guard();