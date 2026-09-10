-- The calculation engine (supervisory_calc_compute_policy) legitimately reports a
-- dimension status of NOT_APPLICABLE when the supervisor marked the dimension not
-- applicable or the approved calculation policy excludes it. The persistence
-- constraint omitted that value, so supervisory_calc_materialise aborted the whole
-- calculation. Accept the engine's own vocabulary.
ALTER TABLE public.supervisory_assessment_dimension
  DROP CONSTRAINT IF EXISTS supervisory_assessment_dimension_calc_status_chk;

ALTER TABLE public.supervisory_assessment_dimension
  ADD CONSTRAINT supervisory_assessment_dimension_calc_status_chk
  CHECK (
    calculation_status IS NULL
    OR calculation_status = ANY (ARRAY[
      'CALCULATED'::text,
      'NOT_APPLICABLE'::text,
      'NOT_CALCULABLE'::text,
      'NO_CONFIGURATION'::text,
      'NO_EFFECTIVE_DATE_RULE'::text,
      'CONFIGURATION_INCOMPLETE'::text
    ])
  );