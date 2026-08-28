-- F4-B3 — DEF-F4-C-02 and category-wide audit writer contract repair.
--
-- Canonical public.audit_logs contract:
--   user_id, action, entity_type, entity_id (text), old_value, new_value, metadata
-- Canonical public.compliance_audit_logs contract:
--   user_id, action_type, object_type, object_id, before_value, after_value,
--   justification, metadata
--
-- Nine active project-owned writers referenced non-existent columns
-- (actor_id, details, table_name, record_id, new_values, changes,
--  resource_type, resource_id, action/entity_type/entity_id on
--  compliance_audit_logs) and therefore aborted with SQLSTATE 42703 at runtime.
-- Bodies below are otherwise byte-equivalent: no signature, permission, action
-- key, or behavioural change.

-- 1. DEF-F4-C-02 — coordination case status audit trigger.
CREATE OR REPLACE FUNCTION public.log_coordination_case_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (
      auth.uid(),
      'coordination.case.' || NEW.status,
      'coordination_case',
      NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object(
        'from_status', OLD.status,
        'to_status', NEW.status,
        'subject_type', NEW.subject_type,
        'subject_id', NEW.subject_id,
        'primary_regulator_id', NEW.primary_regulator_id
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. DEF-F4-C-02 — coordination flag raise/resolve/withdraw audit trigger.
CREATE OR REPLACE FUNCTION public.log_coordination_flag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (
      auth.uid(),
      'coordination.flag.raised',
      'coordination_flag',
      NEW.id::text,
      NULL,
      jsonb_build_object('status', NEW.status, 'flag_type', NEW.flag_type),
      jsonb_build_object(
        'case_id', NEW.case_id,
        'flag_type', NEW.flag_type,
        'linked_application_id', NEW.linked_application_id,
        'linked_license_id', NEW.linked_license_id
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status IN ('resolved','withdrawn') THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (
      auth.uid(),
      'coordination.flag.' || NEW.status,
      'coordination_flag',
      NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object(
        'case_id', NEW.case_id,
        'flag_type', NEW.flag_type,
        'linked_application_id', NEW.linked_application_id,
        'linked_license_id', NEW.linked_license_id
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Complaint escalation dismissal.
CREATE OR REPLACE FUNCTION public.dismiss_complaint_escalation(_case_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'escalate')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaint_escalation_cases
     SET status = 'dismissed',
         decided_at = now(),
         decided_by = auth.uid(),
         notes = COALESCE(_reason, notes),
         updated_at = now()
   WHERE id = _case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'escalation_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'dismiss_escalation', 'complaint_escalation_cases', _case_id::text,
          jsonb_build_object('status', 'dismissed'),
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('case_id', _case_id, 'status', 'dismissed');
END;
$function$;

-- 4. Automatic complaint escalation evaluation.
CREATE OR REPLACE FUNCTION public.evaluate_complaint_escalations(_complaint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
    VALUES (NULL, 'auto_escalate', 'complaint_escalation_cases', v_case_id::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('complaint_id', _complaint_id, 'rule_key', r.key,
                               'target_tier', r.target_tier, 'reason', reason));

    fired := fired + 1;
  END LOOP;

  RETURN fired;
END;
$function$;

-- 5. Complaint duplicate dismissal.
CREATE OR REPLACE FUNCTION public.dismiss_complaint_duplicate(_pair_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaint_duplicate_pairs
     SET status = 'dismissed',
         decided_at = now(),
         decided_by = auth.uid(),
         updated_at = now()
   WHERE id = _pair_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pair_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'dismiss_duplicate', 'complaint_duplicate_pairs', _pair_id::text,
          jsonb_build_object('status', 'dismissed'),
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('pair_id', _pair_id, 'status', 'dismissed');
END;
$function$;

-- 6. Manual complaint escalation.
CREATE OR REPLACE FUNCTION public.manual_escalate_complaint(_complaint_id uuid, _rule_key text, _target_tier text DEFAULT 'supervisor'::text, _severity text DEFAULT 'medium'::text, _notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_case_id uuid;
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'escalate')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = _complaint_id) THEN
    RAISE EXCEPTION 'complaint_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.complaint_escalation_cases
    (complaint_id, rule_key, rule_label, target_tier, severity, trigger_reason, status)
  VALUES
    (_complaint_id, _rule_key, initcap(replace(_rule_key,'_',' ')), _target_tier, _severity,
     COALESCE(_notes, 'Manual escalation'), 'pending')
  ON CONFLICT (complaint_id, rule_key)
  WHERE status IN ('pending','acknowledged','escalated')
  DO UPDATE SET updated_at = now(), notes = COALESCE(EXCLUDED.trigger_reason, complaint_escalation_cases.notes)
  RETURNING id INTO v_case_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'manual_escalate', 'complaint_escalation_cases', v_case_id::text,
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('complaint_id', _complaint_id, 'rule_key', _rule_key, 'target_tier', _target_tier));

  RETURN v_case_id;
END;
$function$;

-- 7. Complaint duplicate confirmation.
CREATE OR REPLACE FUNCTION public.confirm_complaint_duplicate(_pair_id uuid, _parent_id uuid, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pair record;
  v_child_regulator uuid;
  v_parent_regulator uuid;
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pair FROM public.complaint_duplicate_pairs WHERE id = _pair_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pair_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _parent_id NOT IN (v_pair.primary_complaint_id, v_pair.candidate_complaint_id) THEN
    RAISE EXCEPTION 'parent_must_be_in_pair' USING ERRCODE = '22023';
  END IF;

  SELECT regulator_id INTO v_child_regulator FROM public.complaints
    WHERE id = CASE WHEN _parent_id = v_pair.primary_complaint_id THEN v_pair.candidate_complaint_id ELSE v_pair.primary_complaint_id END;
  SELECT regulator_id INTO v_parent_regulator FROM public.complaints WHERE id = _parent_id;

  IF v_child_regulator IS DISTINCT FROM v_parent_regulator THEN
    RAISE EXCEPTION 'regulator_mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaints
     SET parent_complaint_id = _parent_id,
         status = 'duplicate',
         updated_at = now()
   WHERE id = CASE WHEN _parent_id = v_pair.primary_complaint_id THEN v_pair.candidate_complaint_id ELSE v_pair.primary_complaint_id END;

  UPDATE public.complaint_duplicate_pairs
     SET status = 'confirmed',
         decided_at = now(),
         decided_by = auth.uid(),
         updated_at = now()
   WHERE id = _pair_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'confirm_duplicate', 'complaint_duplicate_pairs', _pair_id::text,
          jsonb_build_object('status', 'confirmed'),
          jsonb_build_object('parent_complaint_id', _parent_id, 'notes', _notes));

  RETURN jsonb_build_object('pair_id', _pair_id, 'parent_complaint_id', _parent_id, 'status', 'confirmed');
END;
$function$;

-- 8. Complaint vulnerability escalation evaluation.
CREATE OR REPLACE FUNCTION public.evaluate_complaint_vulnerability_escalations(_complaint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_c public.complaints%ROWTYPE;
  v_rule public.complaint_escalation_rules%ROWTYPE;
  v_opened integer := 0;
  v_thresholds jsonb;
  v_required_state text;
  v_required_cats text[];
BEGIN
  SELECT * INTO v_c FROM public.complaints WHERE id = _complaint_id;
  IF NOT FOUND OR v_c.status IN ('closed','withdrawn','rejected') THEN
    RETURN 0;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.complaint_escalation_rules
     WHERE criterion = 'vulnerability'
       AND coalesce(enabled, true)
       AND (regulator_id IS NULL OR regulator_id = v_c.regulator_id)
  LOOP
    v_thresholds := coalesce(v_rule.thresholds, '{}'::jsonb);
    v_required_state := NULLIF(v_thresholds->>'review_state','');
    v_required_cats := CASE
      WHEN jsonb_typeof(v_thresholds->'categories') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_thresholds->'categories'))
      ELSE NULL
    END;

    IF v_c.vulnerability_indicator
       AND (v_required_state IS NULL OR v_c.vulnerability_review_state::text = v_required_state)
       AND (v_required_cats IS NULL OR v_c.vulnerability_category = ANY(v_required_cats))
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.complaint_escalation_cases ec
         WHERE ec.complaint_id = _complaint_id
           AND ec.rule_key = v_rule.key
           AND ec.status = 'open'
      ) THEN
        INSERT INTO public.complaint_escalation_cases (
          complaint_id, rule_key, criterion, target_tier, status,
          triggered_at, regulator_id
        ) VALUES (
          _complaint_id, v_rule.key, 'vulnerability',
          coalesce(v_rule.target_tier, 'head_of_unit'), 'open',
          now(), v_c.regulator_id
        );
        v_opened := v_opened + 1;

        INSERT INTO public.audit_logs (entity_type, entity_id, action, new_value, metadata, user_id)
        VALUES ('complaint', _complaint_id::text, 'escalation.vulnerability.opened',
                jsonb_build_object('status', 'open'),
                jsonb_build_object('rule_key', v_rule.key), NULL);
      END IF;
    END IF;
  END LOOP;

  RETURN v_opened;
END;
$function$;

-- 9. Return rejection audit.
CREATE OR REPLACE FUNCTION public.reject_return(_return_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _return_id IS NULL THEN
    RAISE EXCEPTION 'return_id required' USING ERRCODE = '22023';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.enforce_permission('returns_management', 'reject');

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    _uid,
    'reject_return',
    'returns_filed',
    _return_id::text,
    jsonb_build_object('reason', _reason, 'module', 'returns_management', 'permission_action', 'reject')
  );
END;
$function$;

-- 10. Fit & proper PQ amendment request (compliance_audit_logs contract).
CREATE OR REPLACE FUNCTION public.fp_request_pq_amendment(_assessment_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev text;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'fit_and_proper', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to request a PQ amendment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Amendment reason (min 10 chars) is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pq_state INTO v_prev FROM public.fp_assessments WHERE id = _assessment_id;
  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'Assessment % not found', _assessment_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Prior submitted response and its pinned form version are deliberately
  -- left untouched: an amendment request never destroys the original answers.
  UPDATE public.fp_assessments
  SET pq_state = 'amendment_required',
      pq_amendment_reason = trim(_reason),
      pq_state_changed_at = now(),
      updated_at = now()
  WHERE id = _assessment_id;

  INSERT INTO public.compliance_audit_logs (
    user_id, action_type, object_type, object_id,
    before_value, after_value, justification, metadata
  ) VALUES (
    auth.uid(), 'UPDATE'::public.compliance_audit_action, 'fp_assessment', _assessment_id::text,
    jsonb_build_object('pq_state', v_prev),
    jsonb_build_object('pq_state', 'amendment_required'),
    trim(_reason),
    jsonb_build_object('event','fp.pq.amendment_requested',
                       'from_state', v_prev,
                       'to_state','amendment_required',
                       'reason', trim(_reason))
  );
END;
$function$;