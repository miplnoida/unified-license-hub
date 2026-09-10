-- AML-08 correction: the canonical enforcement operation reads the bypass
-- rationale from 'remediation_bypass_reason'. Align the forwarded key so the
-- supervisor's explicit rationale actually reaches
-- public.enforcement_referral_create. The AML-08 payload keeps its descriptive
-- name 'remediation_bypass_rationale' for callers, and the refusal when no
-- rationale is stated is unchanged.
DO $$
DECLARE _def text; _old text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  _old := '''remediation_bypass_rationale'', NULLIF(btrim(COALESCE(_payload->>''remediation_bypass_rationale'','''')),'''')';
  _new := '''remediation_bypass_reason'', NULLIF(btrim(COALESCE(_payload->>''remediation_bypass_rationale'','''')),'''')';

  IF position(_old IN _def) = 0 THEN
    RAISE EXCEPTION 'AML-08: the forwarded bypass rationale does not match the expected shape';
  END IF;

  EXECUTE replace(_def, _old, _new);
END $$;

DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def NOT LIKE '%''remediation_bypass_reason''%' THEN
    RAISE EXCEPTION 'AML-08: the canonical bypass key is not forwarded';
  END IF;
END $$;