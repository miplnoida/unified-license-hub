-- AML-08 correction refinement: the previous rewrite of the examination
-- engagement default also rewrote the *intervention* type default, which was
-- already canonical ('TARGETED_EXAMINATION' is a valid supervisory intervention
-- type; 'TARGETED_ONSITE' is not). Restore the intervention default and keep the
-- corrected examination engagement default, targeting each line precisely.
DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_consequence_record is missing';
  END IF;

  _def := replace(_def,
    'COALESCE(NULLIF(_payload->>''intervention_type'',''''),''TARGETED_ONSITE'')',
    'COALESCE(NULLIF(_payload->>''intervention_type'',''''),''TARGETED_EXAMINATION'')');

  EXECUTE _def;
END $$;

DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def NOT LIKE '%TARGETED_EXAMINATION%' THEN
    RAISE EXCEPTION 'AML-08: the canonical intervention type default was not restored';
  END IF;
  IF _def NOT LIKE '%TARGETED_ONSITE%' THEN
    RAISE EXCEPTION 'AML-08: the canonical examination engagement default is absent';
  END IF;
END $$;