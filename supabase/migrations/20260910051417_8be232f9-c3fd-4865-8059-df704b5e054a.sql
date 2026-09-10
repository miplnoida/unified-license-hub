-- AML-08 defect correction (found by scripts/verify-aml-supervisory-consequence-linkage.sql):
-- supervisory_consequence_record defaulted the examination engagement type to
-- 'TARGETED_EXAMINATION'. That value belongs to the *intervention* vocabulary;
-- the canonical examination engagement vocabulary
-- (examinations_engagement_type_chk / supervisory_engagement_types) uses
-- 'TARGETED_ONSITE'. Every OPEN_EXAMINATION consequence therefore aborted.
--
-- Only the default literal is rewritten. Permission checks, prerequisites,
-- idempotency, lineage, audit logging and delegation to
-- public.supervisory_examination_open are left byte-identical, and an explicit
-- caller-supplied engagement_type continues to win.
DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_consequence_record is missing';
  END IF;

  IF position('''TARGETED_EXAMINATION''' IN _def) = 0 THEN
    RAISE NOTICE 'AML-08: the examination engagement default is already canonical';
    RETURN;
  END IF;

  EXECUTE replace(_def, '''TARGETED_EXAMINATION''', '''TARGETED_ONSITE''');
END $$;

DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def LIKE '%TARGETED_EXAMINATION%' THEN
    RAISE EXCEPTION 'AML-08: a non-canonical examination engagement type survives';
  END IF;
  IF _def NOT LIKE '%TARGETED_ONSITE%' THEN
    RAISE EXCEPTION 'AML-08: the canonical examination engagement default is absent';
  END IF;
  IF _def NOT LIKE '%supervisory_examination_open%' THEN
    RAISE EXCEPTION 'AML-08: the canonical examination operation delegation was lost';
  END IF;
END $$;