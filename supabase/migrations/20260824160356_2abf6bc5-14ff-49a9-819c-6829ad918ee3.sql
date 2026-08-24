-- Phase 2.1 closure: direct DML on governed operating-structure tables must be
-- closed for both `anon` and `authenticated`. Writes only via governed
-- SECURITY DEFINER routines executing as service_role.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.entity_supervision_assignments FROM anon;
REVOKE SELECT ON public.entity_supervision_assignments FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.entity_supervision_assignments FROM authenticated;
GRANT SELECT ON public.entity_supervision_assignments TO authenticated;
GRANT ALL ON public.entity_supervision_assignments TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.regulatory_function_assignment_requirements FROM anon;
REVOKE SELECT ON public.regulatory_function_assignment_requirements FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.regulatory_function_assignment_requirements FROM authenticated;
GRANT SELECT ON public.regulatory_function_assignment_requirements TO authenticated;
GRANT ALL ON public.regulatory_function_assignment_requirements TO service_role;