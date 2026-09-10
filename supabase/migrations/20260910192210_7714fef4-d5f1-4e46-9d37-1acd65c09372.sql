-- The dimension completeness rule (DEC-04) was structurally undecidable: the
-- column carried a silent default of MIN_ANSWERED and no governed operation
-- could change it, while validation refuses MIN_ANSWERED for a methodology whose
-- dimensions publish differing mandatory-question counts. A calculation policy
-- therefore could never be completed through the product. The rule becomes an
-- explicit, undecided-by-default supervisory decision, settable only through the
-- governed upsert.
ALTER TABLE public.supervisory_calculation_config
  ALTER COLUMN completeness_mode DROP DEFAULT,
  ALTER COLUMN completeness_mode DROP NOT NULL;

ALTER TABLE public.supervisory_calculation_config
  DROP CONSTRAINT IF EXISTS supervisory_calculation_config_completeness_chk;

ALTER TABLE public.supervisory_calculation_config
  ADD CONSTRAINT supervisory_calculation_config_completeness_chk
  CHECK (completeness_mode IS NULL
         OR completeness_mode = ANY (ARRAY['MIN_ANSWERED'::text, 'ALL_MANDATORY_APPLICABLE'::text]));

CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_upsert(_methodology_id uuid, _payload jsonb, _config_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _status text; _next integer; _completeness text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023';
  END IF;

  -- The completeness rule is a supervisory decision like any other: accepted only
  -- as one of the two published rules, never inferred.
  _completeness := NULLIF(upper(btrim(COALESCE(_payload->>'completeness_mode',''))), '');
  IF _completeness IS NOT NULL AND _completeness NOT IN ('MIN_ANSWERED','ALL_MANDATORY_APPLICABLE') THEN
    RAISE EXCEPTION 'the dimension completeness rule must be MIN_ANSWERED or ALL_MANDATORY_APPLICABLE'
      USING ERRCODE = '22023';
  END IF;

  IF _config_id IS NOT NULL THEN
    SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
    IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
    IF _status <> 'DRAFT' THEN
      RAISE EXCEPTION 'a calculation configuration may only be edited while it is a draft' USING ERRCODE = '22023';
    END IF;
    _id := _config_id;
  ELSE
    SELECT COALESCE(max(config_version),0)+1 INTO _next
      FROM public.supervisory_calculation_config WHERE methodology_id = _methodology_id;
    INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, created_by, completeness_mode)
    VALUES (_methodology_id, _next, _uid, NULL) RETURNING id INTO _id;
    INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, rationale)
    VALUES (_id, 'DRAFT_CREATED', 'DRAFT', _uid, 'draft calculation configuration created');
  END IF;
  UPDATE public.supervisory_calculation_config c SET
    effective_from = COALESCE((_payload->>'effective_from')::date, c.effective_from),
    effective_to   = CASE WHEN _payload ? 'effective_to' THEN NULLIF(_payload->>'effective_to','')::date ELSE c.effective_to END,
    aggregation_method = COALESCE(_payload->>'aggregation_method', c.aggregation_method),
    completeness_mode = COALESCE(_completeness, c.completeness_mode),
    min_answered_questions = COALESCE((_payload->>'min_answered_questions')::int, c.min_answered_questions),
    na_denominator_handling = COALESCE(_payload->>'na_denominator_handling', c.na_denominator_handling),
    evidence_insufficiency_handling = COALESCE(_payload->>'evidence_insufficiency_handling', c.evidence_insufficiency_handling),
    critical_question_handling = COALESCE(_payload->>'critical_question_handling', c.critical_question_handling),
    rounding_mode = COALESCE(_payload->>'rounding_mode', c.rounding_mode),
    rounding_decimals = COALESCE((_payload->>'rounding_decimals')::int, c.rounding_decimals),
    inherent_direction = COALESCE(_payload->>'inherent_direction', c.inherent_direction),
    recommendation_policy = COALESCE(_payload->>'recommendation_policy', c.recommendation_policy),
    recommendation_threshold = CASE WHEN _payload ? 'recommendation_threshold' THEN NULLIF(_payload->>'recommendation_threshold','') ELSE c.recommendation_threshold END,
    override_threshold = CASE WHEN _payload ? 'override_threshold' THEN NULLIF(_payload->>'override_threshold','') ELSE c.override_threshold END,
    notes = CASE WHEN _payload ? 'notes' THEN NULLIF(_payload->>'notes','') ELSE c.notes END
  WHERE c.id = _id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_id, 'PARAMETERS_SAVED', 'DRAFT', _uid, _payload);
  RETURN _id;
END $function$;