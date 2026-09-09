-- AML-05 SEC: the governed stores must be read-only to signed-in staff and
-- closed to anonymous callers. Project defaults grant ALL on new public
-- tables, so the write privileges are revoked explicitly here; every change
-- goes through the governed SECURITY DEFINER operations.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.supervisory_assessment_evidence_basis,
     public.supervisory_assessment_question_evidence,
     public.supervisory_assessment_dimension_evidence,
     public.supervisory_assessment_fact,
     public.supervisory_evidence_basis_type
  FROM authenticated;

REVOKE ALL
  ON public.supervisory_assessment_evidence_basis,
     public.supervisory_assessment_question_evidence,
     public.supervisory_assessment_dimension_evidence,
     public.supervisory_assessment_fact,
     public.supervisory_evidence_basis_type
  FROM anon;

GRANT SELECT
  ON public.supervisory_assessment_evidence_basis,
     public.supervisory_assessment_question_evidence,
     public.supervisory_assessment_dimension_evidence,
     public.supervisory_assessment_fact,
     public.supervisory_evidence_basis_type
  TO authenticated;

GRANT ALL
  ON public.supervisory_assessment_evidence_basis,
     public.supervisory_assessment_question_evidence,
     public.supervisory_assessment_dimension_evidence,
     public.supervisory_assessment_fact,
     public.supervisory_evidence_basis_type
  TO service_role;