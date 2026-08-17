ALTER TABLE public.complaint_intake_rules
  ADD COLUMN IF NOT EXISTS default_severity text;

ALTER TABLE public.complaint_intake_rules
  DROP CONSTRAINT IF EXISTS complaint_intake_rules_default_severity_chk;

ALTER TABLE public.complaint_intake_rules
  ADD CONSTRAINT complaint_intake_rules_default_severity_chk
  CHECK (default_severity IS NULL OR default_severity IN ('low','medium','high','critical'));

CREATE OR REPLACE FUNCTION public.complaint_intake_decide(_variant text, _regulator_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variant text := lower(coalesce(_variant,'internal'));
  v_rules public.complaint_intake_rules%ROWTYPE;
  v_default_rules public.complaint_intake_rules%ROWTYPE;
  v_subject text := btrim(coalesce(_payload->>'subject',''));
  v_desc    text := btrim(coalesce(_payload->>'description',''));
  v_email   text := NULLIF(_payload->>'email','');
  v_anon boolean := coalesce((_payload->>'anonymous')::boolean, false);
  v_vuln boolean := coalesce((_payload->>'vulnerability_indicator')::boolean, false);
  v_vuln_notes text := NULLIF(_payload->>'vulnerability_notes','');
  v_vuln_cat text := NULLIF(_payload->>'vulnerability_category','');
  v_sev text;
  v_prio text;
  v_intake text := NULLIF(_payload->>'intake_source','');
  v_errors jsonb := '[]'::jsonb;
  v_field text;
BEGIN
  SELECT * INTO v_rules FROM public.complaint_intake_rules
   WHERE variant = v_variant
     AND (regulator_id = _regulator_id OR (regulator_id IS NULL))
   ORDER BY regulator_id NULLS LAST
   LIMIT 1;

  IF v_rules.id IS NULL THEN
    v_rules.required_fields := ARRAY['subject','description'];
    v_rules.allow_anonymous := (v_variant = 'public');
  END IF;

  -- Severity is system-assigned for EVERY variant. No caller can set it.
  -- Fallback order: variant rule default -> global default row -> 'medium'.
  v_sev := v_rules.default_severity;
  IF v_sev IS NULL THEN
    SELECT * INTO v_default_rules FROM public.complaint_intake_rules
      WHERE regulator_id IS NULL AND default_severity IS NOT NULL
      ORDER BY variant LIMIT 1;
    v_sev := v_default_rules.default_severity;
  END IF;
  v_sev := coalesce(v_sev, 'medium');

  IF v_variant IN ('public','licensee') THEN
    v_prio := 'p3';
  ELSE
    v_prio := coalesce(NULLIF(_payload->>'priority',''),'p3');
  END IF;

  IF v_subject = '' OR length(v_subject) < 3 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','subject','message','Subject is required (min 3 chars)');
  END IF;
  IF v_desc = '' OR length(v_desc) < 10 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','description','message','Description is required (min 10 chars)');
  END IF;

  FOREACH v_field IN ARRAY coalesce(v_rules.required_fields, ARRAY[]::text[]) LOOP
    IF v_field IN ('subject','description','severity') THEN CONTINUE; END IF;
    IF NULLIF(_payload->>v_field,'') IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','required','field',v_field,'message',v_field||' is required');
    END IF;
  END LOOP;

  IF v_vuln AND v_vuln_notes IS NULL AND v_vuln_cat IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','vulnerability_notes','message','Provide vulnerability notes or category when marked vulnerable');
  END IF;

  IF v_variant = 'public' AND v_anon = false AND v_email IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','email','message','Email required unless anonymous is checked');
  END IF;
  IF v_variant = 'public' AND v_anon = true AND NOT coalesce(v_rules.allow_anonymous, true) THEN
    v_errors := v_errors || jsonb_build_object('code','forbidden','field','anonymous','message','Anonymous submission is not permitted');
  END IF;

  IF v_intake IS NULL THEN
    v_intake := CASE v_variant
      WHEN 'public'   THEN 'consumer_portal'
      WHEN 'licensee' THEN 'licensee_portal'
      WHEN 'internal' THEN 'internal'
      WHEN 'staff'    THEN 'staff_intake'
    END;
  END IF;

  RETURN jsonb_build_object(
    'variant', v_variant,
    'rule_id', v_rules.id,
    'required_fields', to_jsonb(coalesce(v_rules.required_fields, ARRAY[]::text[])),
    'allow_anonymous', coalesce(v_rules.allow_anonymous, true),
    'max_attachments', v_rules.max_attachments,
    'severity', v_sev,
    'severity_source', 'intake_default',
    'priority', v_prio,
    'intake_source', v_intake,
    'errors', v_errors
  );
END;
$function$;