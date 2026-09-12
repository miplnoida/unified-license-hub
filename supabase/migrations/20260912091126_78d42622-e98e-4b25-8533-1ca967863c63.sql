DO $mig$
DECLARE
  _def text;
  _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_consequence_record not found';
  END IF;

  IF position('WHERE x->>''action'' = _action;' IN _def) = 0 THEN
    RAISE EXCEPTION 'expected response expectation match not found: contract changed';
  END IF;

  _new := replace(_def,
    'WHERE x->>''action'' = _action;',
    'WHERE x->>''action'' = public.supervisory_response_policy_policy_action(_action)'
    || ' OR x->>''operational_action'' = public.supervisory_response_policy_operational_action(_action);');

  EXECUTE _new;
END
$mig$;