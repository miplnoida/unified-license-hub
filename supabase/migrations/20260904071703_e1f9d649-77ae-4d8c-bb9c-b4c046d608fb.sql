CREATE OR REPLACE FUNCTION public.supervisory_calculation_recalculate(
  _domain_code text, _rationale text, _config_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid, _dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a record; _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension;
        _considered int := 0; _recalculated int := 0; _blocked int := 0;
        _not_calculable int := 0; _no_config int := 0; _no_rule int := 0; _incomplete int := 0;
        _other_config int := 0; _dims int := 0; _items jsonb := '[]'::jsonb;
        _blockers jsonb := '[]'::jsonb; _needs boolean; _module text; _status text;
BEGIN
  _module := public.supervisory_domain_module(_domain_code);
  IF _module IS NULL THEN
    RAISE EXCEPTION 'unknown_domain: % is not a governed supervisory domain',
      COALESCE(_domain_code, '(null)') USING ERRCODE = '22023';
  END IF;
  _uid := public.supervisory_spine_require(ARRAY[_module || '.manage_config']);

  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  FOR _a IN
    SELECT s.id, s.entity_id, s.status, s.methodology_id
      FROM public.supervisory_assessment s
     WHERE upper(s.domain_code) = upper(_domain_code)
       AND (_entity_id IS NULL OR s.entity_id = _entity_id)
     ORDER BY s.created_at
  LOOP
    _considered := _considered + 1;
    _r := public.supervisory_calc_compute(_a.id);
    IF _config_id IS NOT NULL AND NULLIF(_r->>'config_id','')::uuid IS DISTINCT FROM _config_id THEN
      _other_config := _other_config + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','OTHER_CONFIGURATION');
      CONTINUE;
    END IF;

    _status := _r->>'status';

    IF _status = 'NO_CONFIGURATION' THEN
      _no_config := _no_config + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','NO_CONFIGURATION','reason',_r->>'reason');
      CONTINUE;
    ELSIF _status = 'NO_EFFECTIVE_DATE_RULE' THEN
      _no_rule := _no_rule + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','NO_EFFECTIVE_DATE_RULE','reason',_r->>'reason');
      CONTINUE;
    ELSIF _status = 'CONFIGURATION_INCOMPLETE' THEN
      _incomplete := _incomplete + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','CONFIGURATION_INCOMPLETE','reason',_r->>'reason');
      CONTINUE;
    ELSIF _status = 'NOT_CALCULABLE' THEN
      _not_calculable := _not_calculable + 1;
      IF NOT _dry_run THEN
        PERFORM public.supervisory_calc_materialise(_a.id, 'GOVERNED_RECALCULATION', _uid);
      END IF;
      _items := _items || jsonb_build_object('assessment_id',_a.id,
        'result', CASE WHEN _dry_run THEN 'WOULD_RECORD_NOT_CALCULABLE' ELSE 'RECORDED_NOT_CALCULABLE' END,
        'reason',_r->>'reason','config_id',_r->>'config_id',
        'config_version',_r->>'config_version','as_of',_r->>'as_of');
      CONTINUE;
    ELSIF _status <> 'CALCULATED' THEN
      RAISE EXCEPTION 'unknown_calculation_status: % is not a recognised calculation outcome for assessment %',
        COALESCE(_status,'(null)'), _a.id USING ERRCODE = '22023';
    END IF;

    _needs := false;
    FOR _d IN SELECT * FROM jsonb_array_elements(_r->'dimensions') LOOP
      SELECT * INTO _row FROM public.supervisory_assessment_dimension
       WHERE id = (_d->>'assessment_dimension_id')::uuid;
      IF _row.id IS NULL THEN CONTINUE; END IF;
      IF _d->>'residual_rating' IS NOT NULL AND _row.residual_rating IS NOT NULL
         AND upper(_d->>'residual_rating') <> upper(_row.residual_rating)
         AND length(btrim(COALESCE(_row.override_reason,''))) < 10 THEN
        _needs := true;
        _blockers := _blockers || jsonb_build_object('assessment_id',_a.id,
          'dimension_code',_row.dimension_code,'judged',_row.residual_rating,
          'calculated',_d->>'residual_rating');
      END IF;
    END LOOP;

    IF _needs THEN
      _blocked := _blocked + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','BLOCKED_REVIEW_REQUIRED');
      CONTINUE;
    END IF;

    _dims := _dims + jsonb_array_length(_r->'dimensions');
    IF NOT _dry_run THEN
      PERFORM public.supervisory_calc_materialise(_a.id, 'GOVERNED_RECALCULATION', _uid);
    END IF;
    _recalculated := _recalculated + 1;
    _items := _items || jsonb_build_object('assessment_id',_a.id,
      'result', CASE WHEN _dry_run THEN 'WOULD_CALCULATE' ELSE 'RECALCULATED' END,
      'config_id',_r->>'config_id','config_version',_r->>'config_version','as_of',_r->>'as_of');
  END LOOP;

  IF NOT _dry_run THEN
    INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status,
      rationale, actor_id, detail)
    VALUES (_config_id, 'RECALCULATION', NULL, NULL, btrim(_rationale), _uid,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,'entity_id',_entity_id,
        'considered',_considered,'recalculated',_recalculated,'blocked',_blocked,
        'not_calculable',_not_calculable,'no_configuration',_no_config,
        'no_effective_date_rule',_no_rule,'configuration_incomplete',_incomplete,
        'dimensions',_dims));
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_calculation', NULL::uuid,
      '{}'::jsonb,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,'config_id',_config_id,
        'entity_id',_entity_id,'recalculated',_recalculated,'blocked',_blocked,
        'not_calculable',_not_calculable),
      'Governed recalculation of supervisory calculated ratings: ' || btrim(_rationale));
  END IF;

  RETURN jsonb_build_object('dry_run',_dry_run,'domain_code',upper(_domain_code),'module',_module,
    'config_id',_config_id,'entity_id',_entity_id,'considered',_considered,
    'recalculated',_recalculated,'blocked_review_required',_blocked,
    'not_calculable',_not_calculable,'no_configuration',_no_config,
    'no_effective_date_rule',_no_rule,'configuration_incomplete',_incomplete,
    'other_configuration',_other_config,
    'skipped',_no_config + _no_rule + _incomplete + _other_config,
    'dimensions_affected',_dims,'items',_items,'blockers',_blockers,
    'actor_id',_uid,'rationale',btrim(_rationale),'at',now());
END
$function$;