CREATE OR REPLACE FUNCTION public.supervisory_calc_round_ordinal(_v numeric, _mode text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  -- A recommendation ordinal must be a whole scale step: apply the governed rounding
  -- mode at 0 decimals; NONE cannot yield a step, so it resolves half-up (documented).
  SELECT public.supervisory_calc_round(_v, CASE WHEN _mode IN ('HALF_UP','HALF_DOWN','FLOOR','CEILING') THEN _mode ELSE 'HALF_UP' END, 0)::int
$$;
REVOKE ALL ON FUNCTION public.supervisory_calc_round_ordinal(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_round_ordinal(numeric, text) TO authenticated, service_role;

DO $mig$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef('public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer)'::regprocedure) INTO _def;
  IF position('round(_ord_num/_ord_den)::int' IN _def) = 0 THEN
    RAISE EXCEPTION 'expected recommendation rounding expression not found';
  END IF;
  _def := replace(_def, 'round(_ord_num/_ord_den)::int', 'public.supervisory_calc_round_ordinal(_ord_num/_ord_den, _rmode)');
  EXECUTE _def;
END $mig$;