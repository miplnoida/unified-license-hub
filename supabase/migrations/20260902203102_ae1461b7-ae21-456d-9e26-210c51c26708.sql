REVOKE ALL ON FUNCTION public.supervisory_assessment_dimension_upsert(
  uuid, text, text, text, text, text, numeric, numeric, text, uuid, jsonb,
  text, text, text, text, text, text, boolean, text, text, text, numeric, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_dimension_upsert(
  uuid, text, text, text, text, text, numeric, numeric, text, uuid, jsonb,
  text, text, text, text, text, text, boolean, text, text, text, numeric, text, boolean
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.supervisory_assessment_dimension_upsert(
  uuid, text, text, text, text, text, numeric, numeric, text, uuid, jsonb);