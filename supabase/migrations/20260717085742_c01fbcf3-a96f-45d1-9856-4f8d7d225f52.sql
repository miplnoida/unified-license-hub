
CREATE OR REPLACE FUNCTION public.evaluate_complaint_escalations(_complaint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  r RECORD;
  age_days integer;
  volume_count integer;
  should_fire boolean;
  reason text;
  fired integer := 0;
  v_case_id uuid;
BEGIN
  SELECT id, subject, licensee_id, severity, created_at, resolved_at, closed_at, status
    INTO c FROM public.complaints WHERE id = _complaint_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Skip terminal complaints
  IF c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL
     OR c.status IN ('resolved','closed','withdrawn','dismissed') THEN
    RETURN 0;
  END IF;

  age_days := GREATEST(0, EXTRACT(day FROM (now() - c.created_at))::int);

  FOR r IN SELECT * FROM public.complaint_escalation_rules WHERE enabled = true
  LOOP
    should_fire := false;
    reason := NULL;

    IF r.criterion = 'age' THEN
      IF age_days >= COALESCE((r.thresholds->>'maxAgeDays')::int, 999999) THEN
        should_fire := true;
        reason := format('Open for %s days (threshold %s)', age_days, r.thresholds->>'maxAgeDays');
      END IF;

    ELSIF r.criterion = 'harm' OR r.criterion = 'risk_rating' THEN
      -- Both use complaint severity as proxy
      IF c.severity IS NOT NULL AND
         (SELECT CASE c.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
         >=
         (SELECT CASE COALESCE(r.thresholds->>'minSeverity', r.thresholds->>'minRisk','high')
                 WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
      THEN
        should_fire := true;
        reason := format('Severity %s meets threshold %s', c.severity,
                         COALESCE(r.thresholds->>'minSeverity', r.thresholds->>'minRisk'));
      END IF;

    ELSIF r.criterion = 'volume' THEN
      IF c.licensee_id IS NOT NULL THEN
        SELECT count(*) INTO volume_count FROM public.complaints
         WHERE licensee_id = c.licensee_id
           AND created_at >= now() - (COALESCE((r.thresholds->>'windowDays')::int, 30) || ' days')::interval;
        IF volume_count >= COALESCE((r.thresholds->>'minCount')::int, 999999) THEN
          should_fire := true;
          reason := format('%s complaints on same licensee in %s days', volume_count, r.thresholds->>'windowDays');
        END IF;
      END IF;
    END IF;

    IF NOT should_fire THEN CONTINUE; END IF;

    -- Skip if active case already exists for this kind
    IF EXISTS (
      SELECT 1 FROM public.complaint_escalation_cases
       WHERE complaint_id = _complaint_id
         AND rule_key = r.key
         AND status IN ('pending','acknowledged','escalated','snoozed')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.complaint_escalation_cases
      (complaint_id, rule_id, rule_key, rule_label, target_tier, severity, trigger_reason, status)
    VALUES
      (_complaint_id, r.id, r.key, r.label, r.target_tier,
       COALESCE(c.severity,'medium'), reason, 'pending')
    RETURNING id INTO v_case_id;

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
    VALUES (NULL, 'auto_escalate', 'complaint_escalation_cases', v_case_id,
            jsonb_build_object('complaint_id', _complaint_id, 'rule_key', r.key,
                               'target_tier', r.target_tier, 'reason', reason));

    fired := fired + 1;
  END LOOP;

  RETURN fired;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_all_complaint_escalations()
RETURNS TABLE(scanned integer, escalated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  s integer := 0;
  e integer := 0;
  n integer;
BEGIN
  FOR cid IN
    SELECT id FROM public.complaints
     WHERE resolved_at IS NULL AND closed_at IS NULL
       AND status NOT IN ('resolved','closed','withdrawn','dismissed')
  LOOP
    s := s + 1;
    n := public.evaluate_complaint_escalations(cid);
    e := e + COALESCE(n,0);
  END LOOP;
  scanned := s; escalated := e;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_all_complaint_escalations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_all_complaint_escalations() TO service_role;
