-- ============================================================================
-- AML CALCULATION PRE-POLICY — FINAL AUTHORIZATION & SEMANTICS CLOSURE
-- 1. domain-coupled assessment calculation authorization
-- 2. domain-coupled governed recalculation
-- 3. internal engine primitives (no direct authenticated execute)
-- 4. HIGHEST_MATERIAL_DIMENSION -> HIGHEST_DIMENSION (truthful name)
-- No AML/CFT policy content is authored, approved or activated here.
-- ============================================================================

-- ---------------------------------------------------------------- 4. semantics
ALTER TABLE public.supervisory_calculation_config
  DROP CONSTRAINT IF EXISTS supervisory_calculation_config_policy_chk;

UPDATE public.supervisory_calculation_config
   SET recommendation_policy = 'HIGHEST_DIMENSION'
 WHERE recommendation_policy = 'HIGHEST_MATERIAL_DIMENSION';

ALTER TABLE public.supervisory_calculation_config
  ADD CONSTRAINT supervisory_calculation_config_policy_chk
  CHECK (recommendation_policy IS NULL OR recommendation_policy = ANY (ARRAY[
    'WEIGHTED_SCORE',      -- weighted mean of dimension residual ordinals
    'HIGHEST_DIMENSION',   -- worst (highest ordinal) residual dimension
    'WEIGHTED_WITH_THRESHOLD'
  ]));

-- rename the policy inside the engine and the validator, without any other
-- change of behaviour and without a compatibility alias.
DO $rn$
DECLARE _p text; _d text;
BEGIN
  FOREACH _p IN ARRAY ARRAY[
    'public.supervisory_calc_compute_core(uuid)',
    'public.supervisory_calc_compute(uuid)',
    'public.supervisory_calculation_config_validate_core(uuid)',
    'public.supervisory_calculation_config_validate(uuid)'
  ] LOOP
    _d := pg_get_functiondef(_p::regprocedure);
    IF _d LIKE '%HIGHEST_MATERIAL_DIMENSION%' THEN
      EXECUTE replace(_d, 'HIGHEST_MATERIAL_DIMENSION', 'HIGHEST_DIMENSION');
    END IF;
  END LOOP;
END $rn$;

-- ------------------------------------------- 1. domain-coupled calculation auth
CREATE OR REPLACE FUNCTION public.supervisory_assessment_calculate(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _module text; _actions text[];
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  -- authority is resolved from the domain of THIS assessment. A permission held
  -- in one supervisory domain never authorises calculation in another.
  _module := public.supervisory_domain_module(_a.domain_code);
  IF _module IS NULL THEN
    RAISE EXCEPTION 'unknown_domain: % is not a governed supervisory domain, calculation authority cannot be resolved',
      COALESCE(_a.domain_code, '(null)') USING ERRCODE = '22023';
  END IF;
  _actions := COALESCE(public.supervisory_domain_actions(_a.domain_code, 'edit'), ARRAY[]::text[])
              || ARRAY[_module || '.manage_config'];

  _uid := public.supervisory_spine_require(_actions);
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment_not_editable: an approved or closed assessment is recalculated only through the governed recalculation operation'
      USING ERRCODE = '55000';
  END IF;
  RETURN public.supervisory_calc_materialise(_assessment_id, 'ASSESSMENT_EDIT', _uid);
END
$function$;

-- ----------------------------------------- 2. domain-coupled governed recalc
CREATE OR REPLACE FUNCTION public.supervisory_calculation_recalculate(
  _domain_code text, _rationale text, _config_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid, _dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a record; _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension;
        _considered int := 0; _recalculated int := 0; _blocked int := 0; _skipped int := 0;
        _dims int := 0; _items jsonb := '[]'::jsonb; _blockers jsonb := '[]'::jsonb; _needs boolean;
        _module text;
BEGIN
  -- configuration/recalculation authority is required for EXACTLY the supplied
  -- domain; unknown or unmapped domains are refused outright.
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
      _skipped := _skipped + 1; CONTINUE;
    END IF;
    IF _r->>'status' <> 'CALCULATED' THEN
      _skipped := _skipped + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result',_r->>'status','reason',_r->>'reason');
      CONTINUE;
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
      'result', CASE WHEN _dry_run THEN 'WOULD_RECALCULATE' ELSE 'RECALCULATED' END,
      'config_id',_r->>'config_id','config_version',_r->>'config_version','as_of',_r->>'as_of');
  END LOOP;

  IF NOT _dry_run THEN
    INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status,
      rationale, actor_id, detail)
    VALUES (_config_id, 'RECALCULATION', NULL, NULL, btrim(_rationale), _uid,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,'entity_id',_entity_id,
        'considered',_considered,'recalculated',_recalculated,'blocked',_blocked,'skipped',_skipped,
        'dimensions',_dims));
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_calculation', NULL,
      '{}'::jsonb,
      jsonb_build_object('domain_code',upper(_domain_code),'module',_module,'config_id',_config_id,
        'entity_id',_entity_id,'recalculated',_recalculated,'blocked',_blocked),
      'Governed recalculation of supervisory calculated ratings: ' || btrim(_rationale));
  END IF;

  RETURN jsonb_build_object('dry_run',_dry_run,'domain_code',upper(_domain_code),'module',_module,
    'config_id',_config_id,'entity_id',_entity_id,'considered',_considered,
    'recalculated',_recalculated,'blocked_review_required',_blocked,'skipped',_skipped,
    'dimensions_affected',_dims,'items',_items,'blockers',_blockers,
    'actor_id',_uid,'rationale',btrim(_rationale),'at',now());
END
$function$;

-- --------------------------------------------- 3. internal engine primitives
-- These are deterministic primitives / readers that do NOT perform their own
-- permission, domain and entity-scope checks. They are reachable only through
-- the governed operations above (which are SECURITY DEFINER and therefore may
-- call them internally). Nothing in the client calls them directly.
DO $g$
DECLARE _p text;
BEGIN
  FOREACH _p IN ARRAY ARRAY[
    'public.supervisory_calc_compute(uuid)',
    'public.supervisory_calc_compute_core(uuid)',
    'public.supervisory_calc_config_for(uuid)',
    'public.supervisory_calc_as_of_for(uuid)',
    'public.supervisory_calc_band_of(uuid,text,numeric)',
    'public.supervisory_calculation_config_validate_core(uuid)',
    'public.supervisory_calculation_config_score_problems(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', _p);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', _p);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', _p);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _p);
  END LOOP;
END $g$;

COMMENT ON FUNCTION public.supervisory_calc_compute(uuid) IS
  'Internal deterministic calculation engine. Performs no authorization: reachable only from supervisory_assessment_calculate / supervisory_calculation_recalculate / supervisory_calc_materialise. Not executable by anon or authenticated.';
COMMENT ON FUNCTION public.supervisory_assessment_calculate(uuid) IS
  'Governed calculation operation. Resolves the required permission from the domain of the assessment itself (canonical supervisory_domain_module / supervisory_domain_actions mapping), enforces entity scope, then materialises via supervisory_calc_materialise.';
COMMENT ON FUNCTION public.supervisory_calculation_recalculate(text,text,uuid,uuid,boolean) IS
  'Governed audited recalculation. Requires <module>.manage_config for exactly the supplied domain; unknown domains are refused.';