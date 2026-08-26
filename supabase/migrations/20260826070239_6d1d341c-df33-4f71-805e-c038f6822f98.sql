-- ============================================================
-- MC-02 finalization: configuration-driven timing, no invented policy
-- ============================================================

ALTER TABLE public.complaint_jurisdiction_rule_sets
  ADD COLUMN IF NOT EXISTS is_platform_template boolean NOT NULL DEFAULT false;

-- Publish v2 with an explicit, honest basis label (v1 is immutable).
INSERT INTO public.complaint_jurisdiction_rule_sets
  (regulator_id, code, name, version, status, sector_id, effective_from, config,
   change_rationale, supersedes_id, published_at, is_platform_template)
SELECT v1.regulator_id, v1.code,
       'Platform initial configuration - consumer complaint jurisdiction',
       v1.version + 1, 'PUBLISHED', v1.sector_id, CURRENT_DATE,
       v1.config
         || jsonb_build_object(
              'basis', jsonb_build_object(
                'kind', 'PLATFORM_OPERATIONAL_DEFAULT',
                'statutory', false,
                'approved_by_regulator', false,
                'note', 'Operational working targets supplied with the platform. Not a statutory deadline and not regulator-approved policy. Replace by publishing a regulator-approved version.'),
              'legal_reference', 'null'::jsonb,
              'policy_reference', 'null'::jsonb),
       'Relabelled the seeded timing targets as platform operational defaults; removed the unsupported policy citation.',
       v1.id, now(), true
  FROM public.complaint_jurisdiction_rule_sets v1
 WHERE v1.code = 'DEFAULT_CONSUMER_COMPLAINT'
   AND v1.status = 'PUBLISHED'
   AND v1.version = 1
   AND NOT EXISTS (
     SELECT 1 FROM public.complaint_jurisdiction_rule_sets v2
      WHERE v2.code = v1.code AND v2.version = v1.version + 1
        AND v2.regulator_id IS NOT DISTINCT FROM v1.regulator_id);

UPDATE public.complaint_jurisdiction_rule_sets
   SET status = 'RETIRED', effective_to = CURRENT_DATE,
       name = 'Superseded seeded configuration - consumer complaint jurisdiction'
 WHERE code = 'DEFAULT_CONSUMER_COMPLAINT' AND version = 1 AND status = 'PUBLISHED';

-- ------------------------------------------------------------
-- Effective timing configuration (never fabricates a deadline)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_sla(_regulator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rs public.complaint_jurisdiction_rule_sets;
BEGIN
  rs := public.complaint_jurisdiction_resolve_rule_set(_regulator_id);
  RETURN jsonb_build_object(
    'rule_set_id', rs.id,
    'rule_set_code', rs.code,
    'rule_set_version', rs.version,
    'is_platform_template', COALESCE(rs.is_platform_template, false),
    'basis_kind', COALESCE(rs.config #>> '{basis,kind}',
                           CASE WHEN rs.id IS NULL THEN NULL ELSE 'CONFIGURED' END),
    'statutory', COALESCE((rs.config #>> '{basis,statutory}')::boolean, false),
    'basis_note', rs.config #>> '{basis,note}',
    'jurisdiction_assessment_days', (rs.config #>> '{sla,jurisdiction_assessment_days}')::int,
    'information_request_days', (rs.config #>> '{sla,information_request_days}')::int,
    'triage_days', (rs.config #>> '{sla,triage_days}')::int
  );
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_sla(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_sla(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Queue counts: overdue derived from effective configuration only
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_intake_queue_counts(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v jsonb; v_configured boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.has_complaint_perm(v_uid,'view') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  WITH base AS (
    SELECT c.id, c.priority, c.created_at, c.triage_confirmation_status,
           COALESCE(a.status,'PENDING_ASSESSMENT') AS jstatus, a.decision_outcome,
           r.match_state, COALESCE(v2.support_required,false) AS support_declared,
           COALESCE(v2.staff_review_state,'pending') AS support_state,
           (public.complaint_jurisdiction_sla(c.regulator_id)
              ->> 'jurisdiction_assessment_days')::int AS target_days
    FROM public.complaints c
    LEFT JOIN public.complaint_jurisdiction_assessments a ON a.complaint_id = c.id
    LEFT JOIN LATERAL (SELECT x.* FROM public.complaint_respondents x
                        WHERE x.complaint_id = c.id ORDER BY x.is_primary DESC LIMIT 1) r ON true
    LEFT JOIN public.complaint_vulnerability_assessments v2 ON v2.complaint_id = c.id
    WHERE (public.is_super_admin(v_uid) OR public.regulatory_scope_allows(
             v_uid,'complaint_management','view', c.regulator_id, NULL, NULL, c.licensee_id, NULL))
      AND (NULLIF(_scope->>'regulator_id','') IS NULL OR c.regulator_id = (_scope->>'regulator_id')::uuid)
  )
  SELECT jsonb_build_object(
    'awaiting_jurisdiction_assessment', count(*) FILTER (WHERE jstatus IN ('PENDING_ASSESSMENT','IN_ASSESSMENT')),
    'waiting_for_information', count(*) FILTER (WHERE jstatus = 'PENDING_INFORMATION'),
    'ready_for_triage', count(*) FILTER (WHERE jstatus = 'DECIDED'
        AND decision_outcome IN ('ACCEPTED','PARTIALLY_ACCEPTED')
        AND COALESCE(triage_confirmation_status,'PENDING') NOT IN ('CONFIRMED','OVERRIDDEN')),
    'p1_complaints', count(*) FILTER (WHERE priority = 'p1'),
    'support_reviews_pending', count(*) FILTER (WHERE support_declared AND support_state = 'pending'),
    'unmatched_respondents', count(*) FILTER (WHERE match_state = 'unmatched'),
    'suspected_unauthorised', count(*) FILTER (WHERE match_state = 'suspected_unlicensed'),
    -- Overdue exists ONLY where an operational target is configured.
    'overdue_jurisdiction_assessments', count(*) FILTER (
        WHERE jstatus IN ('PENDING_ASSESSMENT','IN_ASSESSMENT')
          AND target_days IS NOT NULL
          AND created_at < now() - (target_days || ' days')::interval),
    'overdue_target_configured', COALESCE(bool_or(target_days IS NOT NULL), false)
  ) INTO v FROM base;

  v_configured := COALESCE((v->>'overdue_target_configured')::boolean, false);
  RETURN COALESCE(v, '{}'::jsonb)
         || jsonb_build_object('overdue_basis',
              CASE WHEN v_configured THEN 'CONFIGURED_OPERATIONAL_TARGET' ELSE 'NOT_CONFIGURED' END);
END;
$$;

-- ------------------------------------------------------------
-- Information request: no invented statutory due date
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_request_information(
  _complaint_id uuid, _missing_information text, _requested_from text DEFAULT 'COMPLAINANT',
  _factor_codes text[] DEFAULT '{}', _due_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints;
        a public.complaint_jurisdiction_assessments; v_sla jsonb;
        v_req uuid; v_due date; v_days int;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'assess_jurisdiction');
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  IF a.id IS NULL OR a.status = 'DECIDED' THEN
    RAISE EXCEPTION 'Jurisdiction assessment must be open to request information' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(_missing_information,''))) < 10 THEN
    RAISE EXCEPTION 'Describe the missing information (at least 10 characters)' USING ERRCODE = '22023';
  END IF;

  v_sla := public.complaint_jurisdiction_sla(c.regulator_id);
  v_days := (v_sla ->> 'information_request_days')::int;
  -- No configured target and no officer-supplied date => no due date is invented.
  v_due := COALESCE(_due_date,
             CASE WHEN v_days IS NULL THEN NULL ELSE CURRENT_DATE + v_days END);

  INSERT INTO public.complaint_jurisdiction_info_requests
    (complaint_id, assessment_id, requested_from, missing_information, factor_codes, due_date, requested_by)
  VALUES (_complaint_id, a.id, _requested_from, btrim(_missing_information),
          coalesce(_factor_codes,'{}'), v_due, v_uid)
  RETURNING id INTO v_req;

  UPDATE public.complaint_jurisdiction_assessments
     SET status = 'PENDING_INFORMATION', more_information_required = true,
         row_version = row_version + 1, updated_at = now()
   WHERE id = a.id;

  PERFORM public.notification_enqueue_event(
    'complaint_jurisdiction_more_information_required', 'complaint', _complaint_id,
    jsonb_build_object('complaint_id', _complaint_id, 'complaint_number', c.complaint_number,
                       'due_date', v_due, 'cta_url', '/complaints/' || _complaint_id,
                       'cta_label', 'Open complaint'), v_req::text);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.information_requested', 'complaint', _complaint_id,
          jsonb_build_object('request_id', v_req, 'due_date', v_due,
                             'due_date_basis', CASE WHEN _due_date IS NOT NULL THEN 'OFFICER_SET'
                                                    WHEN v_days IS NOT NULL THEN 'CONFIGURED_OPERATIONAL_TARGET'
                                                    ELSE 'NOT_CONFIGURED' END,
                             'requested_from', _requested_from));
  RETURN jsonb_build_object('request_id', v_req, 'due_date', v_due);
END;
$$;

-- ------------------------------------------------------------
-- Jurisdiction read model: capabilities, context, configured targets
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_complaint_jurisdiction(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_jurisdiction_assessments;
        rs public.complaint_jurisdiction_rule_sets; c public.complaints; v jsonb;
        v_sla jsonb; v_target_days int;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'view');
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;

  -- Never silently repin: an in-flight assessment keeps its pinned version.
  IF a.rule_set_id IS NOT NULL THEN
    SELECT * INTO rs FROM public.complaint_jurisdiction_rule_sets WHERE id = a.rule_set_id;
  ELSE
    rs := public.complaint_jurisdiction_resolve_rule_set(c.regulator_id);
  END IF;

  v_sla := public.complaint_jurisdiction_sla(c.regulator_id);
  v_target_days := (v_sla ->> 'jurisdiction_assessment_days')::int;

  SELECT jsonb_build_object(
    'complaint', jsonb_build_object('id', c.id, 'complaint_number', c.complaint_number,
        'subject', c.subject, 'description', c.description, 'status', c.status,
        'incident_date', c.incident_date, 'received_at', c.created_at,
        'complainant_name', c.complainant_name, 'customer_type', c.customer_type,
        'product_id', c.product_id, 'channel_id', c.channel_id,
        'product_name', (SELECT p.name FROM public.conduct_products p WHERE p.id = c.product_id),
        'channel_name', (SELECT ch.name FROM public.conduct_channels ch WHERE ch.id = c.channel_id),
        'regulator_id', c.regulator_id,
        'intake_source', c.intake_source),
    'intake_details', (SELECT to_jsonb(d) FROM public.complaint_intake_details d
                        WHERE d.complaint_id = _complaint_id LIMIT 1),
    'parties', COALESCE((SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.created_at)
                           FROM public.complaint_parties pt WHERE pt.complaint_id = _complaint_id), '[]'::jsonb),
    'contact_preferences', (SELECT to_jsonb(cp) FROM public.complaint_contact_preferences cp
                             WHERE cp.complaint_id = _complaint_id LIMIT 1),
    'assessment', CASE WHEN a.id IS NULL THEN NULL ELSE to_jsonb(a) END,
    'timing', jsonb_build_object(
        'config', v_sla,
        'target_days', v_target_days,
        'target_configured', v_target_days IS NOT NULL,
        'target_date', CASE WHEN v_target_days IS NULL THEN NULL
                            ELSE (c.created_at + (v_target_days || ' days')::interval)::date END,
        'overdue', CASE WHEN v_target_days IS NULL
                          OR COALESCE(a.status,'PENDING_ASSESSMENT') NOT IN ('PENDING_ASSESSMENT','IN_ASSESSMENT')
                        THEN false
                        ELSE c.created_at < now() - (v_target_days || ' days')::interval END),
    'effective_rule_set', CASE WHEN rs.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', rs.id, 'code', rs.code, 'name', rs.name, 'version', rs.version,
                           'effective_from', rs.effective_from, 'status', rs.status,
                           'sector_id', rs.sector_id,
                           'is_platform_template', COALESCE(rs.is_platform_template,false),
                           'pinned', a.rule_set_id IS NOT NULL,
                           'config', rs.config) END,
    'factors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', f.id, 'factor_code', f.factor_code, 'factor_label', f.factor_label,
                 'requirement', f.requirement, 'result', f.result, 'rationale', f.rationale,
                 'evidence_refs', f.evidence_refs, 'evaluated_at', f.evaluated_at,
                 'guidance', cat.help_text, 'sort_order', cat.sort_order)
                 ORDER BY cat.sort_order)
        FROM public.complaint_jurisdiction_factors f
        JOIN public.complaint_jurisdiction_factor_catalogue cat ON cat.code = f.factor_code
        WHERE f.assessment_id = a.id), '[]'::jsonb),
    'factor_catalogue', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('code', cat.code, 'label', cat.label,
                 'help_text', cat.help_text, 'sort_order', cat.sort_order) ORDER BY cat.sort_order)
        FROM public.complaint_jurisdiction_factor_catalogue cat WHERE cat.active), '[]'::jsonb),
    'information_requests', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.requested_at DESC)
        FROM public.complaint_jurisdiction_info_requests r WHERE r.complaint_id = _complaint_id), '[]'::jsonb),
    'referrals', COALESCE((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
        FROM public.complaint_referrals x WHERE x.complaint_id = _complaint_id), '[]'::jsonb),
    'respondents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', rr.id, 'legal_name', rr.legal_name,
                 'trading_name', rr.trading_name, 'match_state', rr.match_state,
                 'is_primary', rr.is_primary, 'licensee_id', rr.licensee_id,
                 'respondent_role', rr.respondent_role, 'country', rr.country)
                 ORDER BY rr.is_primary DESC)
        FROM public.complaint_respondents rr WHERE rr.complaint_id = _complaint_id), '[]'::jsonb),
    'support_needs', (SELECT to_jsonb(v2) FROM public.complaint_vulnerability_assessments v2
                       WHERE v2.complaint_id = _complaint_id LIMIT 1),
    'capabilities', jsonb_build_object(
        'can_assess', public.has_complaint_perm(v_uid,'assess_jurisdiction'),
        'can_decide', public.has_complaint_perm(v_uid,'decide_jurisdiction'),
        'can_reopen', public.has_complaint_perm(v_uid,'reopen_jurisdiction'),
        'can_review_support', public.has_complaint_perm(v_uid,'review_vulnerability'))
  ) INTO v;
  RETURN v;
END;
$$;

-- ------------------------------------------------------------
-- Jurisdiction -> triage gate (server enforced)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_triage_gate_ok(_complaint_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaint_jurisdiction_assessments a
     WHERE a.complaint_id = _complaint_id
       AND a.status = 'DECIDED'
       AND a.decision_outcome IN ('ACCEPTED','PARTIALLY_ACCEPTED')
  );
$$;
REVOKE ALL ON FUNCTION public.complaint_triage_gate_ok(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complaint_triage_gate_ok(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complaint_triage_confirm(
  _complaint_id uuid, _payload jsonb, _expected_updated_at timestamp with time zone DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); c public.complaints;
  v_harm text; v_priority text; v_risk text; v_sys text; v_reason text; v_sla int;
  v_auto public.complaint_triage_evaluations; v_material boolean := false;
  v_status text; v_eval uuid; v_rule_version_id uuid; v_rule_version int;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'triage');

  -- Lifecycle gate: supervisory triage may only be CONFIRMED once jurisdiction
  -- has been decided as within, or partly within, our role.
  IF NOT public.complaint_triage_gate_ok(_complaint_id) THEN
    RAISE EXCEPTION 'Triage can be confirmed only after jurisdiction is decided as within or partly within our role'
      USING ERRCODE = '22023';
  END IF;

  IF _expected_updated_at IS NOT NULL THEN
    PERFORM public._assert_complaint_fresh(_complaint_id, _expected_updated_at);
  END IF;

  v_harm     := NULLIF(upper(btrim(coalesce(_payload->>'consumer_harm',''))), '');
  v_priority := NULLIF(lower(btrim(coalesce(_payload->>'priority',''))), '');
  v_risk     := NULLIF(upper(btrim(coalesce(_payload->>'conduct_risk_level',''))), '');
  v_sys      := NULLIF(upper(btrim(coalesce(_payload->>'systemic_potential',''))), '');
  v_reason   := NULLIF(btrim(coalesce(_payload->>'override_reason','')), '');
  v_sla      := NULLIF(_payload->>'sla_days','')::int;

  IF v_harm IS NOT NULL AND v_harm NOT IN ('LOW','MODERATE','HIGH','SEVERE') THEN
    RAISE EXCEPTION 'Invalid consumer harm level' USING ERRCODE = '22023'; END IF;
  IF v_priority IS NOT NULL AND v_priority NOT IN ('p1','p2','p3','p4') THEN
    RAISE EXCEPTION 'Invalid case priority' USING ERRCODE = '22023'; END IF;
  IF v_risk IS NOT NULL AND v_risk NOT IN ('LOW','MODERATE','HIGH','CRITICAL') THEN
    RAISE EXCEPTION 'Invalid conduct risk level' USING ERRCODE = '22023'; END IF;
  IF v_sys IS NOT NULL AND v_sys NOT IN ('INDIVIDUAL','RECURRING','POTENTIAL_SYSTEMIC','CONFIRMED_SYSTEMIC') THEN
    RAISE EXCEPTION 'Invalid systemic potential' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_auto FROM public.complaint_triage_evaluations
   WHERE complaint_id = _complaint_id AND source IN ('auto','auto_retry')
   ORDER BY evaluated_at DESC LIMIT 1;

  v_material := (v_harm IS NOT NULL AND v_harm IS DISTINCT FROM COALESCE(v_auto.consumer_harm,
                    public.complaint_severity_to_harm(c.triage_original_values #>> '{values,severity}')))
             OR (v_priority IS NOT NULL AND v_priority IS DISTINCT FROM COALESCE(v_auto.priority,
                    c.triage_original_values #>> '{values,priority}'))
             OR (v_risk IS NOT NULL AND v_auto.conduct_risk_level IS NOT NULL
                    AND v_risk IS DISTINCT FROM v_auto.conduct_risk_level)
             OR (v_sys IS NOT NULL AND v_auto.systemic_potential IS NOT NULL
                    AND v_sys IS DISTINCT FROM v_auto.systemic_potential);

  IF v_material THEN
    IF NOT public.has_complaint_perm(v_uid, 'override_triage') THEN
      RAISE EXCEPTION 'not_authorized: complaint_management.override_triage' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'A reason of at least 10 characters is required to change the triage recommendation'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_sys = 'CONFIRMED_SYSTEMIC' THEN
    IF NOT public.has_complaint_perm(v_uid, 'override_triage') THEN
      RAISE EXCEPTION 'not_authorized: confirming a systemic issue requires triage override authority'
        USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'Confirming a systemic issue requires a written justification' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_status := CASE WHEN v_material THEN 'OVERRIDDEN' ELSE 'CONFIRMED' END;
  v_rule_version_id := v_auto.rule_version_id;
  v_rule_version := v_auto.rule_version;

  UPDATE public.complaints
     SET consumer_harm = COALESCE(v_harm, consumer_harm),
         priority = COALESCE(v_priority, priority),
         conduct_risk_level = COALESCE(v_risk, conduct_risk_level),
         systemic_potential = COALESCE(v_sys, systemic_potential),
         severity = COALESCE(public.complaint_harm_to_severity(v_harm), severity),
         sla_days = COALESCE(v_sla, sla_days),
         triage_confirmed_at = now(),
         triage_confirmed_by = v_uid,
         triage_confirmation_status = v_status,
         triage_override_status = CASE WHEN v_material THEN 'overridden' ELSE triage_override_status END,
         triage_override_reason = COALESCE(v_reason, triage_override_reason),
         systemic_confirmed_by = CASE WHEN v_sys = 'CONFIRMED_SYSTEMIC' THEN v_uid ELSE systemic_confirmed_by END,
         systemic_confirmed_at = CASE WHEN v_sys = 'CONFIRMED_SYSTEMIC' THEN now() ELSE systemic_confirmed_at END,
         updated_at = now()
   WHERE id = _complaint_id;

  INSERT INTO public.complaint_triage_evaluations
    (complaint_id, source, rule_id, rule_version_id, rule_version, input_snapshot, output_snapshot,
     consumer_harm, priority, conduct_risk_level, systemic_potential, sla_days, override_reason, evaluated_by)
  VALUES (_complaint_id,
          CASE WHEN v_material THEN 'manual_override' ELSE 'manual_confirm' END,
          c.triage_rule_id, v_rule_version_id, v_rule_version,
          public.complaint_triage_inputs(_complaint_id),
          jsonb_build_object('consumer_harm', v_harm, 'priority', v_priority,
                             'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
                             'sla_days', v_sla, 'decided_by_human', true,
                             'auto_recommendation', CASE WHEN v_auto.id IS NULL THEN NULL
                                                         ELSE v_auto.output_snapshot END),
          v_harm, v_priority, v_risk, v_sys, v_sla, v_reason, v_uid)
  RETURNING id INTO v_eval;

  PERFORM public.notification_enqueue_event('complaint_triage_completed','complaint',_complaint_id,
    jsonb_build_object('complaint_id', _complaint_id, 'complaint_number', c.complaint_number,
                       'priority', COALESCE(v_priority, c.priority),
                       'cta_url', '/complaints/' || _complaint_id, 'cta_label', 'Open complaint'),
    v_eval::text);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, CASE WHEN v_material THEN 'complaint.triage.overridden' ELSE 'complaint.triage.confirmed' END,
          'complaint', _complaint_id,
          jsonb_build_object('evaluation_id', v_eval, 'consumer_harm', v_harm, 'priority', v_priority,
                             'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
                             'rule_version', v_rule_version, 'reason', v_reason));

  RETURN jsonb_build_object('evaluation_id', v_eval, 'status', v_status);
END;
$$;

-- ------------------------------------------------------------
-- Triage read model: expose the lifecycle gate to the UI
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_complaint_triage(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.complaints;
  v_auto public.complaint_triage_evaluations;
  v_history jsonb;
  v_j public.complaint_jurisdiction_assessments;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'view');
  SELECT * INTO v_j FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;

  SELECT * INTO v_auto
    FROM public.complaint_triage_evaluations
   WHERE complaint_id = _complaint_id AND source IN ('auto','auto_retry')
   ORDER BY evaluated_at DESC
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'evaluated_at' DESC), '[]'::jsonb)
    INTO v_history
    FROM (
      SELECT jsonb_build_object(
               'id', e.id, 'source', e.source, 'rule_id', e.rule_id, 'rule_name', r.name,
               'rule_version', e.rule_version, 'rule_version_id', e.rule_version_id,
               'consumer_harm', e.consumer_harm, 'priority', e.priority,
               'conduct_risk_level', e.conduct_risk_level, 'systemic_potential', e.systemic_potential,
               'sla_days', e.sla_days, 'override_reason', e.override_reason,
               'evaluated_by', e.evaluated_by, 'evaluated_by_name', p.full_name,
               'evaluated_at', e.evaluated_at,
               'input_snapshot', e.input_snapshot, 'output_snapshot', e.output_snapshot
             ) AS x
        FROM public.complaint_triage_evaluations e
        LEFT JOIN public.conduct_triage_rules r ON r.id = e.rule_id
        LEFT JOIN public.profiles p ON p.id = e.evaluated_by
       WHERE e.complaint_id = _complaint_id
    ) s;

  RETURN jsonb_build_object(
    'complaint_id', c.id,
    'complaint_number', c.complaint_number,
    'updated_at', c.updated_at,
    'conduct_risk_category', (SELECT jsonb_build_object('id', k.id, 'code', k.code, 'name', k.name)
                                FROM public.conduct_risk_categories k WHERE k.id = c.conduct_risk_category_id),
    'product', (SELECT jsonb_build_object('id', p.id, 'name', p.name)
                  FROM public.conduct_products p WHERE p.id = c.product_id),
    'channel', (SELECT jsonb_build_object('id', ch.id, 'name', ch.name)
                  FROM public.conduct_channels ch WHERE ch.id = c.channel_id),
    'support_needs', (SELECT to_jsonb(v2) FROM public.complaint_vulnerability_assessments v2
                       WHERE v2.complaint_id = _complaint_id LIMIT 1),
    'jurisdiction', jsonb_build_object(
      'status', COALESCE(v_j.status,'PENDING_ASSESSMENT'),
      'decision_outcome', v_j.decision_outcome,
      'triage_allowed', public.complaint_triage_gate_ok(_complaint_id)),
    'current', jsonb_build_object(
      'consumer_harm', c.consumer_harm, 'priority', c.priority,
      'conduct_risk_level', c.conduct_risk_level, 'systemic_potential', c.systemic_potential,
      'severity', c.severity, 'sla_days', c.sla_days,
      'confirmation_status', c.triage_confirmation_status,
      'confirmed_at', c.triage_confirmed_at, 'confirmed_by', c.triage_confirmed_by,
      'confirmed_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = c.triage_confirmed_by),
      'override_status', c.triage_override_status,
      'override_reason', c.triage_override_reason,
      'systemic_confirmed_at', c.systemic_confirmed_at
    ),
    'recommendation', CASE WHEN v_auto.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_auto.id, 'source', v_auto.source, 'rule_id', v_auto.rule_id,
      'rule_version', v_auto.rule_version, 'rule_version_id', v_auto.rule_version_id,
      'rule_name', (SELECT r.name FROM public.conduct_triage_rules r WHERE r.id = v_auto.rule_id),
      'consumer_harm', v_auto.consumer_harm, 'priority', v_auto.priority,
      'conduct_risk_level', v_auto.conduct_risk_level, 'systemic_potential', v_auto.systemic_potential,
      'sla_days', v_auto.sla_days, 'evaluated_at', v_auto.evaluated_at,
      'input_snapshot', v_auto.input_snapshot, 'output_snapshot', v_auto.output_snapshot
    ) END,
    'history', v_history,
    'capabilities', jsonb_build_object(
      'can_triage', public.has_complaint_perm(v_uid, 'triage'),
      'can_override', public.has_complaint_perm(v_uid, 'override_triage'),
      'can_review_support', public.has_complaint_perm(v_uid, 'review_vulnerability')
    )
  );
END;
$$;