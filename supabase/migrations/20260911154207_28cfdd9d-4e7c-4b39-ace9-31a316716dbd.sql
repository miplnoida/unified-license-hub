-- PCOMP-R2C (4): repair — bare text appended to a text[] raised a malformed
-- array literal instead of reporting the policy content problem.
CREATE OR REPLACE FUNCTION public.supervisory_response_policy_content_errors(_content jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE _rules jsonb; _r jsonb; _e text[] := ARRAY[]::text[]; _n int;
BEGIN
  _rules := public.supervisory_response_policy_rules(_content);

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF COALESCE(_r->>'risk_band','') = '' THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states no risk band'];
    END IF;
    IF COALESCE(_r->>'action','') = '' THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states no supervisory action'];
    END IF;
    IF _r->>'operational_action' IS NULL THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' names supervisory action '
                   || COALESCE(NULLIF(_r->>'action',''),'(blank)')
                   || ', which does not map to a canonical supervisory consequence action'];
    END IF;
    IF NOT (jsonb_build_array('REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED')
            @> to_jsonb(COALESCE(_r->>'response_level',''))) THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code') || ' states policy expectation '
                   || COALESCE(NULLIF(_r->>'response_level',''),'(blank)')
                   || '; use required, recommended, permitted or prohibited'];
    END IF;
    IF _r->>'response_level' = 'PROHIBITED' AND COALESCE((_r->>'deferral_allowed')::boolean,false) THEN
      _e := _e || ARRAY['rule ' || (_r->>'rule_code')
                   || ' prohibits an action and also allows it to be deferred, which is contradictory'];
    END IF;
  END LOOP;

  SELECT count(*) INTO _n FROM (
    SELECT r->>'rule_code' c FROM jsonb_array_elements(_rules) r
     GROUP BY 1 HAVING count(*) > 1) d;
  IF _n > 0 THEN
    _e := _e || ARRAY['two or more response rules share the same rule reference'];
  END IF;

  SELECT count(*) INTO _n FROM (
    SELECT r->>'risk_band' b, r->>'action' a FROM jsonb_array_elements(_rules) r
     GROUP BY 1,2 HAVING count(*) > 1) d;
  IF _n > 0 THEN
    _e := _e || ARRAY['the same supervisory action is stated more than once for the same risk band, so the applicable expectation is indeterminate'];
  END IF;

  SELECT count(*) INTO _n FROM (
    SELECT r->>'risk_band' b, r->>'action' a FROM jsonb_array_elements(_rules) r
     WHERE r->>'response_level' IN ('REQUIRED','PROHIBITED')
     GROUP BY 1,2 HAVING count(DISTINCT r->>'response_level') > 1) d;
  IF _n > 0 THEN
    _e := _e || ARRAY['the same supervisory action is both required and prohibited for the same risk band'];
  END IF;

  RETURN _e;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_policy_content_errors(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_content_errors(jsonb) TO authenticated, service_role;