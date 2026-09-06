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
             || CASE WHEN b.threshold_version IS NULL
                     THEN ' (threshold version not recorded in the source record)'
                     ELSE ' (threshold version ' || b.threshold_version::text || ')' END,
           NULL::date, NULL::date,
           jsonb_build_object('metric_key', b.metric_key, 'level', b.level,
             'threshold_version', b.threshold_version,
             'threshold_version_state',
               CASE WHEN b.threshold_version IS NULL THEN 'NOT_RECORDED_IN_SOURCE' ELSE 'RECORDED' END,
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
