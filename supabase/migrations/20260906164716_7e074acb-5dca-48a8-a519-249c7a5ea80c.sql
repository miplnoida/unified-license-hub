-- ===========================================================================
-- OS-02E.1 — candidate detection (canonical sources only, read-only)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.supervisory_detect_candidates(
  _detector_code text, _params jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  entity_id uuid, domain_code text, source_kind text, cond_key text,
  summary text, severity text, source_table text, source_id uuid,
  source_reference text, observed_value numeric, threshold_value numeric,
  comparator text, materiality_reason text, period_start date, period_end date,
  detail jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _due_soon int := COALESCE((_params->>'due_soon_days')::int, 30);
  _sev text[] := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(_params->'severities')),
    ARRAY['high','critical']);
BEGIN
  IF _detector_code = 'PRU_RETURN_BREACH' THEN
    RETURN QUERY
    SELECT b.entity_id, 'PRUDENTIAL', 'RETURN_BREACH',
           b.metric_key || ':' || COALESCE(b.reporting_period_id::text, b.id::text),
           'Prudential metric ' || b.metric_key || ' ' || COALESCE(b.level,'breach')
             || ' (' || COALESCE(b.value::text,'n/a') || ' vs ' || COALESCE(b.threshold_value::text,'n/a') || ')',
           CASE WHEN lower(COALESCE(b.level,'')) LIKE 'breach%' THEN 'high' ELSE 'medium' END,
           'return_threshold_breaches', b.id, b.metric_key,
           b.value, b.threshold_value, b.comparator,
           'Calibrated prudential threshold ' || COALESCE(b.level,'breach')
             || ' (threshold version ' || COALESCE(b.threshold_version::text,'n/a') || ')',
           NULL::date, NULL::date,
           jsonb_build_object('metric_key', b.metric_key, 'level', b.level,
             'threshold_version', b.threshold_version,
             'return_filing_id', b.return_filing_id,
             'reporting_period_id', b.reporting_period_id,
             'detection_source', b.detection_source)
      FROM public.return_threshold_breaches b
     WHERE b.entity_id IS NOT NULL AND b.escalated_enforcement_id IS NULL;

  ELSIF _detector_code = 'PRU_EWI_ALERT' THEN
    RETURN QUERY
    SELECT a.entity_id, 'PRUDENTIAL', 'EWI_SIGNAL',
           COALESCE(a.rule_code, a.rule_id::text) || ':' || COALESCE(a.period_end::text,'na'),
           'Early warning indicator ' || COALESCE(a.rule_code,'rule') || ' triggered on ' || COALESCE(a.metric_key,'metric'),
           COALESCE(lower(a.severity),'medium'),
           'prudential_ewi_alerts', a.id, a.rule_code,
           NULL::numeric, NULL::numeric, NULL::text,
           'Approved early warning rule ' || COALESCE(a.rule_code,'') || ' v' || COALESCE(a.rule_version::text,'1'),
           NULL::date, a.period_end,
           jsonb_build_object('rule_code', a.rule_code, 'rule_version', a.rule_version,
             'metric_key', a.metric_key, 'status', a.status,
             'reporting_period_id', a.reporting_period_id)
      FROM public.prudential_ewi_alerts a
     WHERE a.entity_id IS NOT NULL
       AND upper(COALESCE(a.status,'OPEN')) NOT IN ('CLOSED','RESOLVED','DISMISSED','WITHDRAWN');

  ELSIF _detector_code = 'RET_FILING_MISSING' THEN
    RETURN QUERY
    SELECT o.entity_id, 'CROSS_DOMAIN', 'OTHER_GOVERNED_SOURCE',
           'period:' || rp.id::text,
           'Regulatory filing not received for ' || COALESCE(rp.period_label, rp.period_end::text)
             || ' (due ' || rp.due_date::text || ')',
           CASE WHEN rp.due_date < CURRENT_DATE - 30 THEN 'high' ELSE 'medium' END,
           'reporting_periods', rp.id, rp.period_label,
           (CURRENT_DATE - rp.due_date)::numeric, 0::numeric, '>',
           'Statutory filing deadline passed with no submission',
           rp.period_start, rp.period_end,
           jsonb_build_object('obligation_id', o.id, 'due_date', rp.due_date,
             'days_overdue', CURRENT_DATE - rp.due_date)
      FROM public.reporting_periods rp
      JOIN public.entity_reporting_obligations o ON o.id = rp.entity_reporting_obligation_id
      LEFT JOIN public.return_filings f ON f.reporting_period_id = rp.id
     WHERE f.id IS NULL AND rp.due_date < CURRENT_DATE AND o.entity_id IS NOT NULL;

  ELSIF _detector_code = 'RET_FILING_LATE' THEN
    RETURN QUERY
    SELECT o.entity_id, 'CROSS_DOMAIN', 'OTHER_GOVERNED_SOURCE',
           'late:' || rp.id::text,
           'Regulatory filing for ' || COALESCE(rp.period_label, rp.period_end::text) || ' was late or rejected',
           'medium',
           'return_filings', f.id, f.filing_reference,
           (COALESCE(f.submitted_at::date, CURRENT_DATE) - rp.due_date)::numeric, 0::numeric, '>',
           'Submission received after the statutory deadline or not accepted',
           rp.period_start, rp.period_end,
           jsonb_build_object('due_date', rp.due_date, 'status', f.status,
             'submitted_at', f.submitted_at, 'reporting_period_id', rp.id)
      FROM public.return_filings f
      JOIN public.reporting_periods rp ON rp.id = f.reporting_period_id
      JOIN public.entity_reporting_obligations o ON o.id = rp.entity_reporting_obligation_id
     WHERE rp.due_date < CURRENT_DATE
       AND (f.submitted_at::date > rp.due_date OR upper(COALESCE(f.status,'')) NOT IN ('ACCEPTED','VAL'))
       AND o.entity_id IS NOT NULL;

  ELSIF _detector_code = 'MC_CONDUCT_SIGNAL' THEN
    RETURN QUERY
    SELECT s.licensee_id, 'MARKET_CONDUCT', 'CONDUCT_SIGNAL',
           'signal:' || s.id::text,
           'Market conduct signal: ' || COALESCE(s.title,'untitled'),
           COALESCE(lower(s.severity),'medium'),
           'conduct_signals', s.id, s.reference,
           s.risk_score::numeric, NULL::numeric, NULL::text,
           'Validated conduct signal from governed conduct monitoring',
           NULL::date, NULL::date,
           jsonb_build_object('status', s.status, 'signal_category', s.signal_category,
             'source_type', s.source_type, 'systemic_potential', s.systemic_potential)
      FROM public.conduct_signals s
     WHERE s.licensee_id IS NOT NULL AND s.closed_at IS NULL AND s.dismissed_at IS NULL;

  ELSIF _detector_code = 'SUP_REMEDIATION_OVERDUE' THEN
    RETURN QUERY
    SELECT r.entity_id, COALESCE(r.domain_code,'CROSS_DOMAIN'), 'OTHER_GOVERNED_SOURCE',
           'remediation_overdue:' || r.id::text,
           'Remediation action ' || COALESCE(r.reference,'') || ' is past its target date',
           'high',
           'supervisory_remediation_action', r.id, r.reference,
           (CURRENT_DATE - r.target_date)::numeric, 0::numeric, '>',
           'Agreed remediation target date passed without closure',
           NULL::date, NULL::date,
           jsonb_build_object('status', r.status, 'target_date', r.target_date,
             'finding_id', r.finding_id)
      FROM public.supervisory_remediation_action r
     WHERE r.entity_id IS NOT NULL AND r.closed_at IS NULL
       AND r.target_date IS NOT NULL AND r.target_date < CURRENT_DATE;

  ELSIF _detector_code = 'SUP_REMEDIATION_INEFFECTIVE' THEN
    RETURN QUERY
    SELECT r.entity_id, COALESCE(r.domain_code,'CROSS_DOMAIN'), 'OTHER_GOVERNED_SOURCE',
           'remediation_ineffective:' || r.id::text,
           'Remediation action ' || COALESCE(r.reference,'') || ' assessed as ineffective',
           'high',
           'supervisory_remediation_action', r.id, r.reference,
           NULL::numeric, NULL::numeric, NULL::text,
           'Supervisor validation concluded the remediation was ineffective',
           NULL::date, NULL::date,
           jsonb_build_object('status', r.status, 'effectiveness', r.effectiveness,
             'finding_id', r.finding_id)
      FROM public.supervisory_remediation_action r
     WHERE r.entity_id IS NOT NULL
       AND (upper(COALESCE(r.status,'')) = 'INEFFECTIVE'
            OR upper(COALESCE(r.effectiveness,'')) = 'INEFFECTIVE');

  ELSIF _detector_code = 'SUP_FINDING_MATERIAL' THEN
    RETURN QUERY
    SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN'), 'OTHER_GOVERNED_SOURCE',
           'finding:' || f.id::text,
           'Material supervisory finding ' || COALESCE(f.reference,'') || ': ' || COALESCE(f.title,''),
           lower(COALESCE(f.severity,'high')),
           'supervisory_finding', f.id, f.reference,
           NULL::numeric, NULL::numeric, NULL::text,
           'Finding severity is within the materiality set configured for detection',
           NULL::date, NULL::date,
           jsonb_build_object('status', f.status, 'severity', f.severity,
             'due_date', f.due_date, 'finding_category', f.finding_category)
      FROM public.supervisory_finding f
     WHERE f.entity_id IS NOT NULL
       AND lower(COALESCE(f.severity,'')) = ANY (_sev)
       AND upper(COALESCE(f.status,'')) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED');

  ELSIF _detector_code = 'SUP_REASSESSMENT_OVERDUE' THEN
    RETURN QUERY
    SELECT s.entity_id, COALESCE(s.domain_code,'CROSS_DOMAIN'), 'OTHER_GOVERNED_SOURCE',
           'reassessment_overdue:' || s.id::text,
           'Risk reassessment overdue (planned ' || s.next_review_date::text || ')',
           'high',
           'entity_risk_state', s.id, NULL::text,
           (CURRENT_DATE - s.next_review_date)::numeric, 0::numeric, '>',
           'Planned reassessment date passed without an approved reassessment',
           NULL::date, NULL::date,
           jsonb_build_object('next_review_date', s.next_review_date,
             'residual_rating', s.residual_rating, 'last_review_date', s.last_review_date)
      FROM public.entity_risk_state s
     WHERE s.entity_id IS NOT NULL AND s.next_review_date IS NOT NULL
       AND s.next_review_date < CURRENT_DATE;

  ELSIF _detector_code = 'SUP_REASSESSMENT_DUE_SOON' THEN
    RETURN QUERY
    SELECT s.entity_id, COALESCE(s.domain_code,'CROSS_DOMAIN'), 'OTHER_GOVERNED_SOURCE',
           'reassessment_due:' || s.id::text,
           'Risk reassessment due by ' || s.next_review_date::text,
           'low',
           'entity_risk_state', s.id, NULL::text,
           (s.next_review_date - CURRENT_DATE)::numeric, _due_soon::numeric, '<=',
           'Planned reassessment falls inside the configured look-ahead window',
           NULL::date, NULL::date,
           jsonb_build_object('next_review_date', s.next_review_date,
             'residual_rating', s.residual_rating, 'due_soon_days', _due_soon)
      FROM public.entity_risk_state s
     WHERE s.entity_id IS NOT NULL AND s.next_review_date IS NOT NULL
       AND s.next_review_date >= CURRENT_DATE
       AND s.next_review_date <= CURRENT_DATE + _due_soon;

  ELSIF _detector_code = 'EXAM_OUTCOME_ADVERSE' THEN
    RETURN QUERY
    SELECT e.entity_id, COALESCE(e.domain_code,'CROSS_DOMAIN'), 'EXAMINATION_OUTCOME',
           'exam:' || e.id::text,
           'Adverse examination outcome for ' || COALESCE(e.reference, e.title,''),
           'high',
           'examinations', e.id, e.reference,
           NULL::numeric, NULL::numeric, NULL::text,
           'Closed examination concluded with an adverse or unsatisfactory rating',
           e.period_under_review_start, e.period_under_review_end,
           jsonb_build_object('stage', e.stage, 'risk_rating', e.risk_rating,
             'overall_conclusion', e.overall_conclusion, 'closed_at', e.closed_at)
      FROM public.examinations e
     WHERE e.entity_id IS NOT NULL AND e.closed_at IS NOT NULL
       AND (lower(COALESCE(e.risk_rating,'')) IN ('high','critical','unsatisfactory','adverse')
            OR lower(COALESCE(e.overall_conclusion,'')) ~ '(adverse|unsatisfactory|material weakness|non-complian)');

  ELSIF _detector_code = 'AML_RISK_ELEVATED' THEN
    RETURN QUERY
    SELECT s.entity_id, 'AML_CFT', 'AML_RISK',
           'aml_risk:' || s.id::text,
           'AML/CFT residual risk assessed as ' || COALESCE(s.residual_rating,'elevated'),
           CASE WHEN upper(COALESCE(s.residual_rating,'')) IN ('CRITICAL','SEVERE') THEN 'critical' ELSE 'high' END,
           'entity_risk_state', s.id, NULL::text,
           NULL::numeric, NULL::numeric, NULL::text,
           'Approved AML/CFT residual rating is in the elevated band',
           NULL::date, NULL::date,
           jsonb_build_object('residual_rating', s.residual_rating,
             'inherent_rating', s.inherent_rating, 'control_rating', s.control_rating,
             'driving_assessment_id', s.driving_assessment_id)
      FROM public.entity_risk_state s
     WHERE s.entity_id IS NOT NULL AND upper(COALESCE(s.domain_code,'')) = 'AML_CFT'
       AND upper(COALESCE(s.residual_rating,'')) IN ('HIGH','CRITICAL','SEVERE');
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_detect_candidates(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_detect_candidates(text, jsonb) TO service_role;

-- ===========================================================================
-- OS-02E.2 — detection runtime: deduplicating observe + auto resolve
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.supervisory_detect_run(
  _detector_code text DEFAULT NULL, _trigger_kind text DEFAULT 'scheduled')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _d record; _c record; _run uuid; _fp text; _sig uuid;
  _created int; _updated int; _resolved int; _scanned int;
  _keys text[]; _out jsonb := '[]'::jsonb;
  _is_service boolean := current_setting('role', true) = 'service_role'
                         OR auth.uid() IS NULL;
BEGIN
  IF NOT _is_service
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
           'prudential_supervision.view','aml_supervision.view',
           'market_conduct.run_conduct_analytics','system_configuration.edit']) THEN
    RAISE EXCEPTION 'Not authorised to run supervisory detection' USING ERRCODE = '42501';
  END IF;

  FOR _d IN
    SELECT * FROM public.supervisory_detector d
     WHERE d.is_active
       AND d.effective_from <= CURRENT_DATE
       AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)
       AND (_detector_code IS NULL OR d.code = _detector_code)
     ORDER BY d.code
  LOOP
    _created := 0; _updated := 0; _resolved := 0; _scanned := 0; _keys := ARRAY[]::text[];

    INSERT INTO public.supervisory_detector_run (
      detector_code, detector_version, trigger_kind, config_snapshot, triggered_by)
    VALUES (_d.code, _d.version, COALESCE(_trigger_kind,'scheduled'),
      jsonb_build_object('params', _d.params, 'version', _d.version,
        'default_severity', _d.default_severity, 'effective_from', _d.effective_from),
      auth.uid())
    RETURNING id INTO _run;

    FOR _c IN SELECT * FROM public.supervisory_detect_candidates(_d.code, _d.params)
    LOOP
      _scanned := _scanned + 1;
      _fp := _d.code || ':' || COALESCE(_c.entity_id::text,'na') || ':'
             || COALESCE(_c.domain_code,'CROSS_DOMAIN') || ':' || _c.cond_key;
      _keys := _keys || _fp;

      SELECT id INTO _sig FROM public.supervisory_signal
       WHERE fingerprint = _fp AND state = 'OPEN' LIMIT 1;

      IF _sig IS NULL THEN
        INSERT INTO public.supervisory_signal (
          entity_id, domain_code, source_kind, severity, detected_at, summary, detail,
          period_start, period_end, detector_code, fingerprint,
          first_detected_at, last_detected_at, occurrence_count, state,
          source_table, source_id, source_reference, observed_value, threshold_value,
          comparator, materiality_reason, config_provenance, external_reference,
          prudential_ewi_alert_id, conduct_signal_id, examination_id)
        VALUES (
          _c.entity_id, _c.domain_code, _c.source_kind,
          COALESCE(_c.severity, _d.default_severity), now(), _c.summary,
          COALESCE(_c.detail,'{}'::jsonb), _c.period_start, _c.period_end,
          _d.code, _fp, now(), now(), 1, 'OPEN',
          _c.source_table, _c.source_id, _c.source_reference, _c.observed_value,
          _c.threshold_value, _c.comparator, _c.materiality_reason,
          jsonb_build_object('detector_code', _d.code, 'detector_version', _d.version,
            'params', _d.params, 'config_owner', _d.config_owner,
            'effective_from', _d.effective_from, 'run_id', _run),
          COALESCE(_c.source_reference, _c.source_id::text),
          CASE WHEN _c.source_table = 'prudential_ewi_alerts' THEN _c.source_id END,
          CASE WHEN _c.source_table = 'conduct_signals' THEN _c.source_id END,
          CASE WHEN _c.source_table = 'examinations' THEN _c.source_id END)
        RETURNING id INTO _sig;
        _created := _created + 1;
      ELSE
        UPDATE public.supervisory_signal
           SET last_detected_at = now(),
               occurrence_count = occurrence_count + 1,
               observed_value = _c.observed_value,
               threshold_value = _c.threshold_value,
               severity = COALESCE(_c.severity, severity),
               summary = _c.summary,
               detail = COALESCE(_c.detail, detail)
         WHERE id = _sig;
        _updated := _updated + 1;
      END IF;

      INSERT INTO public.supervisory_signal_occurrence (
        signal_id, observed_at, observed_value, threshold_value, severity,
        detector_run_id, source_table, source_id, source_reference, detail)
      VALUES (_sig, now(), _c.observed_value, _c.threshold_value,
        COALESCE(_c.severity, _d.default_severity), _run, _c.source_table,
        _c.source_id, _c.source_reference, COALESCE(_c.detail,'{}'::jsonb));
    END LOOP;

    IF _d.auto_resolve THEN
      UPDATE public.supervisory_signal
         SET state = 'RESOLVED', resolved_at = now(),
             resolution_reason = 'CONDITION_NO_LONGER_OBSERVED'
       WHERE detector_code = _d.code AND state = 'OPEN'
         AND NOT (fingerprint = ANY (_keys));
      GET DIAGNOSTICS _resolved = ROW_COUNT;
    END IF;

    UPDATE public.supervisory_detector_run
       SET status = 'COMPLETED', completed_at = now(), rows_scanned = _scanned,
           signals_created = _created, signals_updated = _updated,
           signals_resolved = _resolved
     WHERE id = _run;

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
    VALUES (auth.uid(), 'SUPERVISORY_DETECTION_RUN', 'supervisory_detector_run', _run,
      jsonb_build_object('detector_code', _d.code, 'detector_version', _d.version,
        'rows_scanned', _scanned, 'signals_created', _created,
        'signals_updated', _updated, 'signals_resolved', _resolved,
        'trigger_kind', COALESCE(_trigger_kind,'scheduled')));

    _out := _out || jsonb_build_object('detector_code', _d.code, 'run_id', _run,
      'rows_scanned', _scanned, 'signals_created', _created,
      'signals_updated', _updated, 'signals_resolved', _resolved);
  END LOOP;

  RETURN jsonb_build_object('generated_at', now(), 'detectors', _out);
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_detect_run(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_detect_run(text, text) TO authenticated, service_role;

-- ===========================================================================
-- OS-02E.3 — read models
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.supervisory_detection_register(
  _domain text DEFAULT NULL, _state text DEFAULT 'OPEN', _limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'state', COALESCE(_state,'OPEN'),
    'rows', COALESCE(jsonb_agg(r ORDER BY r->>'severity', r->>'last_detected_at' DESC), '[]'::jsonb))
  FROM (
    SELECT jsonb_build_object(
      'signal_id', s.id, 'entity_id', s.entity_id, 'entity_name', l.name,
      'domain_code', s.domain_code, 'detector_code', s.detector_code,
      'source_kind', s.source_kind, 'severity', s.severity, 'summary', s.summary,
      'state', s.state, 'first_detected_at', s.first_detected_at,
      'last_detected_at', s.last_detected_at, 'occurrence_count', s.occurrence_count,
      'observed_value', s.observed_value, 'threshold_value', s.threshold_value,
      'comparator', s.comparator, 'materiality_reason', s.materiality_reason,
      'source_table', s.source_table, 'source_id', s.source_id,
      'source_reference', s.source_reference,
      'config_provenance', s.config_provenance,
      'resolved_at', s.resolved_at, 'resolution_reason', s.resolution_reason,
      'reviewed', EXISTS (
        SELECT 1 FROM public.supervisory_attention a
         WHERE s.entity_id = ANY (COALESCE(a.entity_ids, ARRAY[]::uuid[]))
           AND COALESCE(a.domain_code,'CROSS_DOMAIN') = s.domain_code
           AND a.created_at >= s.first_detected_at)
    ) AS r
      FROM public.supervisory_signal s
      LEFT JOIN public.licensees l ON l.id = s.entity_id
     WHERE (_domain IS NULL OR s.domain_code = _domain)
       AND (COALESCE(_state,'OPEN') = 'ALL' OR s.state = COALESCE(_state,'OPEN'))
       AND s.detector_code IS NOT NULL
     ORDER BY s.last_detected_at DESC
     LIMIT GREATEST(COALESCE(_limit,200), 1)
  ) q;
$fn$;

CREATE OR REPLACE FUNCTION public.supervisory_entity_detected_conditions(
  _entity_id uuid, _domain text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'entity_id', _entity_id, 'generated_at', now(),
    'open_conditions', COALESCE(jsonb_agg(jsonb_build_object(
        'signal_id', s.id, 'domain_code', s.domain_code,
        'detector_code', s.detector_code, 'severity', s.severity,
        'summary', s.summary, 'first_detected_at', s.first_detected_at,
        'last_detected_at', s.last_detected_at,
        'occurrence_count', s.occurrence_count,
        'observed_value', s.observed_value, 'threshold_value', s.threshold_value,
        'materiality_reason', s.materiality_reason,
        'source_table', s.source_table, 'source_id', s.source_id
      ) ORDER BY s.last_detected_at DESC), '[]'::jsonb))
    FROM public.supervisory_signal s
   WHERE s.entity_id = _entity_id AND s.state = 'OPEN'
     AND s.detector_code IS NOT NULL
     AND (_domain IS NULL OR s.domain_code = _domain);
$fn$;

CREATE OR REPLACE FUNCTION public.supervisory_detector_assurance()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'detectors', COALESCE(jsonb_agg(jsonb_build_object(
      'code', d.code, 'name', d.name, 'domain_code', d.domain_code,
      'source_object', d.source_object, 'execution_mode', d.execution_mode,
      'config_owner', d.config_owner, 'params', d.params,
      'version', d.version, 'is_active', d.is_active,
      'effective_from', d.effective_from, 'effective_to', d.effective_to,
      'open_signals', (SELECT count(*) FROM public.supervisory_signal s
                        WHERE s.detector_code = d.code AND s.state = 'OPEN'),
      'resolved_signals', (SELECT count(*) FROM public.supervisory_signal s
                        WHERE s.detector_code = d.code AND s.state = 'RESOLVED'),
      'last_run', (SELECT jsonb_build_object('run_id', r.id, 'status', r.status,
                     'started_at', r.started_at, 'completed_at', r.completed_at,
                     'rows_scanned', r.rows_scanned, 'signals_created', r.signals_created,
                     'signals_updated', r.signals_updated, 'signals_resolved', r.signals_resolved,
                     'error_text', r.error_text)
                     FROM public.supervisory_detector_run r
                    WHERE r.detector_code = d.code
                    ORDER BY r.started_at DESC LIMIT 1)
    ) ORDER BY d.domain_code, d.code), '[]'::jsonb))
    FROM public.supervisory_detector d;
$fn$;
