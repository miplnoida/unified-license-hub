CREATE OR REPLACE FUNCTION public.supervisory_assessment_configuration_authority(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _ov jsonb; _fc jsonb; _sb jsonb; _facts jsonb; _sector text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  _ov := public.supervisory_assessment_sector_overlay_internal(_assessment_id);
  _fc := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'FACT_CONFIG');
  _sb := public.supervisory_assessment_pinned_component_internal(_assessment_id, 'SOURCE_BINDING');
  _sector := upper(NULLIF(_ov->>'sector_code',''));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fact_code', q.fact_code, 'label', q.label, 'data_type', q.data_type,
      'definition_status', q.definition_status,
      'permitted', q.not_permitted_reason IS NULL,
      'not_permitted_reason', q.not_permitted_reason,
      'required', q.required,
      'sector_codes', q.sector_codes,
      'allowed_sources', q.allowed_sources,
      'recorded', q.recorded, 'source_type', q.source_type,
      'governance', q.governance) ORDER BY q.fact_code), '[]'::jsonb) INTO _facts
  FROM (
    SELECT fr.fact_code, fr.label, fr.data_type, fr.definition_status,
      CASE
        WHEN upper(COALESCE(fr.definition_status,'')) = 'RETIRED' THEN 'RETIRED_DEFINITION'
        WHEN _fc->>'status' = 'UNAVAILABLE' THEN 'FACT_CONFIG_UNAVAILABLE'
        WHEN _fc->>'status' = 'GOVERNED' AND cfg.item IS NULL THEN 'NOT_IN_FACT_CONFIG'
        WHEN _fc->>'status' = 'GOVERNED'
             AND jsonb_typeof(cfg.item->'sector_codes') = 'array'
             AND jsonb_array_length(cfg.item->'sector_codes') > 0
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(cfg.item->'sector_codes') s
                              WHERE upper(btrim(s)) = _sector) THEN 'OTHER_SECTOR'
        ELSE NULL END AS not_permitted_reason,
      COALESCE(fr.is_required,false) OR COALESCE((cfg.item->>'is_required')::boolean,false) AS required,
      cfg.item->'sector_codes' AS sector_codes,
      (SELECT jsonb_agg(jsonb_build_object('source_kind', upper(b->>'source_kind'),
                                   'source_reference', b->>'source_reference'))
         FROM jsonb_array_elements(COALESCE(_sb->'content'->'bindings','[]'::jsonb)) b
        WHERE _sb->>'status' = 'GOVERNED'
          AND upper(btrim(b->>'fact_code')) = upper(fr.fact_code)) AS allowed_sources,
      f.id IS NOT NULL AS recorded, f.source_type, f.provenance->'governance' AS governance
    FROM public.supervisory_methodology_fact_requirement fr
    LEFT JOIN LATERAL (SELECT x AS item FROM jsonb_array_elements(COALESCE(_fc->'content'->'facts','[]'::jsonb)) x
                        WHERE _fc->>'status' = 'GOVERNED' AND upper(btrim(x->>'fact_code')) = upper(fr.fact_code)
                        LIMIT 1) cfg ON true
    LEFT JOIN public.supervisory_assessment_fact f ON f.assessment_id = _assessment_id AND f.fact_code = fr.fact_code
   WHERE fr.methodology_id = _a.methodology_id) q;

  RETURN jsonb_build_object('assessment_id', _assessment_id, 'generated_at', now(),
    'sector_overlay', _ov,
    'fact_config', _fc - 'content',
    'source_binding', _sb - 'content',
    'methodology_fact_count', (SELECT count(*) FROM public.supervisory_methodology_fact_requirement WHERE methodology_id = _a.methodology_id),
    'facts', _facts);
END $function$;