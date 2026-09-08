-- AML-02 — remove direct write grants on methodology content tables.
-- Authority belongs to the governed supervisory_methodology_* operations only.
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_semantic_profile FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_fact_requirement FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_question_fact FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_parameter FROM authenticated;

GRANT SELECT ON public.supervisory_methodology_semantic_profile TO authenticated;
GRANT SELECT ON public.supervisory_methodology_fact_requirement TO authenticated;
GRANT SELECT ON public.supervisory_methodology_question_fact TO authenticated;
GRANT SELECT ON public.supervisory_methodology_parameter TO authenticated;

GRANT ALL ON public.supervisory_methodology_semantic_profile TO service_role;
GRANT ALL ON public.supervisory_methodology_fact_requirement TO service_role;
GRANT ALL ON public.supervisory_methodology_question_fact TO service_role;
GRANT ALL ON public.supervisory_methodology_parameter TO service_role;