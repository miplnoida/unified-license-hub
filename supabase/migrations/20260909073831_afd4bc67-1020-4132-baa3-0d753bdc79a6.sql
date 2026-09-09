CREATE OR REPLACE FUNCTION public.supervisory_authorised_regulator_options_any(_capability text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d record; _o jsonb;
        _seen jsonb := '{}'::jsonb; _rows jsonb := '[]'::jsonb;
        _n int; _active jsonb := NULL; _cross boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  FOR _d IN SELECT domain_code FROM public.supervisory_domain_authority ORDER BY domain_code LOOP
    IF NOT public.supervisory_domain_valid(_d.domain_code) THEN CONTINUE; END IF;
    _o := public.supervisory_authorised_regulator_options(_d.domain_code, _capability);
    _cross := _cross OR COALESCE((_o->>'cross_regulator_allowed')::boolean, false);
    SELECT COALESCE(jsonb_object_agg(r->>'id', r), '{}'::jsonb) INTO _seen
      FROM (SELECT e.value AS r FROM jsonb_each(_seen) AS e
            UNION ALL
            SELECT b.value AS r FROM jsonb_array_elements(COALESCE(_o->'regulators','[]'::jsonb)) AS b(value)) u(r);
  END LOOP;

  SELECT COALESCE(jsonb_agg(e.value ORDER BY e.value->>'name'), '[]'::jsonb) INTO _rows
    FROM jsonb_each(_seen) AS e;

  _n := jsonb_array_length(_rows);
  IF _n = 1 THEN _active := _rows->0; END IF;

  RETURN jsonb_build_object(
    'selectable_count', _n,
    'cross_regulator_allowed', (_n > 1 AND _cross),
    'active_regulator', _active,
    'regulators', _rows,
    'reason', CASE WHEN _n = 0
                   THEN 'No active regulator is available in your authorised scope.'
                   ELSE NULL END);
END $function$;