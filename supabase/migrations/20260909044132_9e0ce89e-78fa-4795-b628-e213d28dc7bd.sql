-- AML-02 finalisation: dimension register reports state and change timestamp.
-- Additive only: the existing one-argument call keeps its exact previous shape
-- (active dimensions only), with two extra reported fields.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_list(
  _methodology_id uuid,
  _include_retired boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'dimension_code', d.dimension_code,
           'label', d.label,
           'description', d.description,
           'dimension_kind', d.dimension_kind,
           'dimension_group', d.dimension_group,
           'weight', d.weight,
           'evidence_required', d.evidence_required,
           'sort_order', d.sort_order,
           'active', d.active,
           'updated_at', d.updated_at,
           'question_count', (SELECT count(*) FROM supervisory_methodology_question q
                                WHERE q.methodology_dimension_id = d.id AND q.active)
         ) ORDER BY d.dimension_kind DESC, d.sort_order, d.dimension_code), '[]'::jsonb)
    INTO _out
    FROM supervisory_methodology_dimension d
   WHERE d.methodology_id = _methodology_id
     AND (d.active OR _include_retired);

  RETURN _out;
END
$function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_dimension_list(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_dimension_list(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_dimension_list(uuid, boolean) TO service_role;