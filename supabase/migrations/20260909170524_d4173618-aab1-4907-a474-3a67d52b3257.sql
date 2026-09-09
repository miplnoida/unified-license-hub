-- The question-plan reference recorded on a calculation run is the programme
-- version that materialised the plan (text, e.g. '1.0'), not an integer counter.
ALTER TABLE public.supervisory_assessment_calculation_run
  ALTER COLUMN question_plan_version TYPE text USING question_plan_version::text;