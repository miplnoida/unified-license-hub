-- Refusal contract defect: the two early refusals put the refusal code in
-- `status`, leaving `reason_code` empty, while every other refusal path uses
-- status='NOT_CALCULABLE' with a machine-readable `reason_code`. Callers and
-- screens therefore could not read the blocker uniformly. Normalise both paths,
-- and give the wrapper's "no calculable dimension" refusal a reason code too.
CREATE OR REPLACE FUNCTION public.supervisory_calc_compute_core(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _cfg uuid; _c public.supervisory_calculation_config;
        _as_of date; _policy jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  _as_of := public.supervisory_calc_as_of_for(_assessment_id);
  IF _as_of IS NULL THEN
    RETURN jsonb_build_object('status','NOT_CALCULABLE','reason_code','NO_EFFECTIVE_DATE_RULE',
      'assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'dimensions','[]'::jsonb,
      'reason', format('domain %s has no recorded effective-date rule, so no authoritative as-of date exists', _a.domain_code));
  END IF;

  _cfg := public.supervisory_calc_config_for(_assessment_id);
  IF _cfg IS NULL THEN
    RETURN jsonb_build_object('status','NOT_CALCULABLE','reason_code','NO_CONFIGURATION',
      'assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'as_of',_as_of,'dimensions','[]'::jsonb,
      'reason','no approved calculation configuration was in force on the authoritative as-of date');
  END IF;

  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _cfg;
  _policy := public.supervisory_calc_policy_from_config(_cfg);
  RETURN public.supervisory_calc_compute_policy(_assessment_id, _policy, _as_of, _cfg, _c.config_version);
END
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_calc_compute(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r jsonb; _any boolean;
BEGIN
  _r := public.supervisory_calc_compute_core(_assessment_id);
  IF _r->>'status' <> 'CALCULATED' THEN RETURN _r; END IF;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_r->'dimensions','[]'::jsonb)) d
                  WHERE d->>'status' = 'CALCULATED') INTO _any;
  IF _any THEN RETURN _r; END IF;
  RETURN _r || jsonb_build_object('status','NOT_CALCULABLE','reason_code','NO_CALCULABLE_DIMENSION',
    'reason','no assessment dimension satisfies the configured calculation rules, so no rating is produced');
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_calc_compute_core(uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_compute_core(uuid) TO service_role;