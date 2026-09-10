-- AML-08 defect correction: REFER_TO_ENFORCEMENT was unreachable.
--
-- public.enforcement_referral_create requires an explicit remediation-bypass
-- rationale when a finding is referred with no corrective action recorded. That
-- canonical control is correct and is NOT weakened here. The defect was that
-- supervisory_consequence_record never forwarded such a rationale, so the
-- supported action could never complete.
--
-- The correction forwards the supervisor's explicit
-- 'remediation_bypass_rationale' when supplied. Nothing is defaulted or
-- synthesised: if the supervisor does not state one and no corrective action
-- exists, the canonical operation still refuses.
DO $$
DECLARE _def text; _old text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_consequence_record is missing';
  END IF;

  _old := 'public.enforcement_referral_create(jsonb_build_object(
          ''source_kind'',''SUPERVISORY_FINDING'',''source_id'', _finding, ''referral_reason'', _rationale))';
  _new := 'public.enforcement_referral_create(jsonb_strip_nulls(jsonb_build_object(
          ''source_kind'',''SUPERVISORY_FINDING'',''source_id'', _finding, ''referral_reason'', _rationale,
          ''remediation_bypass_rationale'', NULLIF(btrim(COALESCE(_payload->>''remediation_bypass_rationale'','''')),''''))))';

  IF position(_old IN _def) = 0 THEN
    RAISE EXCEPTION 'AML-08: the enforcement referral delegation does not match the expected shape';
  END IF;

  EXECUTE replace(_def, _old, _new);
END $$;

DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def NOT LIKE '%remediation_bypass_rationale%' THEN
    RAISE EXCEPTION 'AML-08: the remediation bypass rationale is not forwarded';
  END IF;
  IF _def NOT LIKE '%enforcement_referral_create%' THEN
    RAISE EXCEPTION 'AML-08: the canonical enforcement referral delegation was lost';
  END IF;
END $$;