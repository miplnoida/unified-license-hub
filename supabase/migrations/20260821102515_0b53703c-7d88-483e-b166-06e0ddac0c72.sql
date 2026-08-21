-- EPR-02 · P07 Prudential process rationalisation
-- 1. Server-owned SLA policy (configuration, not business state)
CREATE TABLE IF NOT EXISTS public.prudential_process_sla_config (
  work_item_type text PRIMARY KEY,
  label text NOT NULL,
  sla_days integer NOT NULL,
  due_soon_days integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.prudential_process_sla_config TO authenticated;
GRANT ALL ON public.prudential_process_sla_config TO service_role;
ALTER TABLE public.prudential_process_sla_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prudential_sla_config_read ON public.prudential_process_sla_config;
CREATE POLICY prudential_sla_config_read ON public.prudential_process_sla_config
  FOR SELECT TO authenticated
  USING (public.sup_can_read_domain(auth.uid(), 'prudential'));

DROP POLICY IF EXISTS prudential_sla_config_write ON public.prudential_process_sla_config;
CREATE POLICY prudential_sla_config_write ON public.prudential_process_sla_config
  FOR ALL TO authenticated
  USING (public.can_manage_prudential_config(auth.uid()))
  WITH CHECK (public.can_manage_prudential_config(auth.uid()));

INSERT INTO public.prudential_process_sla_config (work_item_type, label, sla_days, due_soon_days) VALUES
  ('BREACH',            'Threshold breach acknowledgement / response', 5,  2),
  ('EWI',               'Early warning indicator review',              10, 3),
  ('ASSESSMENT',        'Prudential assessment completion',            15, 5),
  ('SUPERVISORY_ACTION','Supervisory action follow-up',                 7, 3),
  ('ESCALATION',        'Escalation decision',                          7, 2),
  ('STRESS_EVENT',      'Stress event review',                          7, 2),
  ('PLAN_ACTION',       'Supervisory plan action',                     14, 5),
  ('EXAMINATION',       'Examination stage progression',               30, 7)
ON CONFLICT (work_item_type) DO NOTHING;

-- 2. Canonical prudential work queue (read model over existing truth)
CREATE OR REPLACE FUNCTION public.prudential_work_queue(
  _types text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _owner uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _sla text DEFAULT NULL,
  _severity text[] DEFAULT NULL,
  _stage text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  work_item_type text,
  work_item_id uuid,
  entity_id uuid,
  entity_name text,
  reference text,
  title text,
  stage text,
  stage_label text,
  status text,
  status_label text,
  owner_user_id uuid,
  owner_name text,
  team text,
  priority text,
  priority_reason text,
  sla_due_at timestamptz,
  sla_state text,
  waiting_on text,
  blocker_count integer,
  blockers jsonb,
  next_action_code text,
  next_action_label text,
  next_action_href text,
  next_action_permission text,
  source_type text,
  source_id uuid,
  last_activity_at timestamptz,
  canonical_href text,
  detail jsonb,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH cfg AS (
  SELECT work_item_type, sla_days, due_soon_days FROM public.prudential_process_sla_config
),
assign AS (
  SELECT a.entity_id, a.supervisor_id, a.supervisor_name, a.team
    FROM public.entity_supervision_assignments a
   WHERE a.status = 'active'
),
raw AS (
  /* ---------------- breaches (A2 canonical detection, unchanged) --------- */
  SELECT
    'BREACH'::text AS work_item_type,
    b.id AS work_item_id,
    b.entity_id,
    b.metric_key AS reference,
    'Threshold breach · ' || coalesce(b.metric_key, 'metric') AS title,
    CASE WHEN b.acknowledged_at IS NULL THEN 'DETECTION'
         WHEN EXISTS (SELECT 1 FROM public.prudential_actions pa
                       WHERE pa.source_type = 'return_breach' AND pa.source_id = b.id
                         AND pa.status NOT IN ('completed','waived','cancelled')) THEN 'ACTION_MONITORING'
         ELSE 'SUPERVISORY_REVIEW' END AS stage,
    CASE WHEN b.acknowledged_at IS NULL THEN 'unacknowledged' ELSE 'acknowledged' END AS status,
    NULL::uuid AS owner_user_id,
    coalesce(lower(b.risk_level), lower(b.level), 'high') AS severity,
    'Breach of a configured prudential threshold' AS priority_reason,
    b.detected_at + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'BREACH') AS sla_due_at,
    'regulator'::text AS waiting_on,
    'return_filing'::text AS source_type,
    b.return_filing_id AS source_id,
    greatest(b.detected_at, coalesce(b.acknowledged_at, b.detected_at)) AS last_activity_at,
    jsonb_build_object(
      'metric_key', b.metric_key,
      'period_label', b.period_label,
      'period_end', b.period_end,
      'observed_value', b.value,
      'threshold_value', b.threshold_value,
      'comparator', b.comparator,
      'acknowledged_at', b.acknowledged_at,
      'return_filing_id', b.return_filing_id,
      'filing_reference', b.filing_reference,
      'linked_actions', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'reference', pa.action_reference,
                                            'title', pa.title, 'status', pa.status, 'due_date', pa.due_date))
          FROM public.prudential_actions pa
         WHERE pa.source_type = 'return_breach' AND pa.source_id = b.id), '[]'::jsonb)
    ) AS detail
  FROM public.v_prudential_current_breaches b

  UNION ALL
  /* ---------------- early warning indicators ----------------------------- */
  SELECT
    'EWI', e.id, e.entity_id, e.rule_code,
    'Early warning · ' || coalesce(nullif(e.metric_key, ''), e.rule_code),
    CASE WHEN e.status = 'open' THEN 'DETECTION' ELSE 'SUPERVISORY_REVIEW' END,
    e.status, e.acknowledged_by, lower(e.severity),
    'Early warning rule ' || e.rule_code || ' triggered',
    e.executed_at + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'EWI'),
    'regulator', 'ewi_rule', e.rule_id,
    greatest(e.executed_at, coalesce(e.acknowledged_at, e.executed_at)),
    jsonb_build_object('metric_key', e.metric_key, 'period_end', e.period_end,
                       'rule_code', e.rule_code, 'rule_version', e.rule_version,
                       'evidence', e.evidence, 'acknowledged_at', e.acknowledged_at,
                       'return_filing_id', e.return_filing_id)
  FROM public.prudential_ewi_alerts e
  WHERE e.status NOT IN ('closed','dismissed','resolved')

  UNION ALL
  /* ---------------- prudential assessments ------------------------------- */
  SELECT
    'ASSESSMENT', a.id, a.entity_id, 'PA-ASMT-' || substr(a.id::text, 1, 8),
    'Prudential assessment' || coalesce(' · ' || to_char(a.period_end, 'DD Mon YYYY'), ''),
    CASE a.status
      WHEN 'draft' THEN 'DATA_REVIEW'
      WHEN 'returned_for_revision' THEN 'RISK_ASSESSMENT'
      WHEN 'submitted' THEN 'SUPERVISORY_REVIEW'
      WHEN 'reviewed' THEN 'DECISION'
      WHEN 'approved' THEN 'ACTION_MONITORING'
      ELSE 'CLOSED' END,
    a.status, coalesce(a.reviewed_by, a.created_by),
    CASE WHEN a.overall_rating ~ '^[45]' THEN 'high' ELSE 'medium' END,
    'Assessment in progress for the reporting period',
    coalesce(a.submitted_at, a.created_at) + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'ASSESSMENT'),
    'regulator', 'return_filing', a.return_filing_id,
    a.updated_at,
    jsonb_build_object('overall_rating', a.overall_rating, 'period_start', a.period_start,
                       'period_end', a.period_end, 'return_filing_id', a.return_filing_id,
                       'has_rationale', (a.rationale IS NOT NULL AND length(trim(a.rationale)) > 0),
                       'has_conclusion', (a.conclusion IS NOT NULL AND length(trim(a.conclusion)) > 0))
  FROM public.prudential_assessments a
  WHERE a.status NOT IN ('closed')

  UNION ALL
  /* ---------------- supervisory actions ---------------------------------- */
  SELECT
    'SUPERVISORY_ACTION', p.id, p.entity_id, p.action_reference, p.title,
    CASE WHEN p.review_status = 'awaiting_review' THEN 'SUPERVISORY_REVIEW' ELSE 'ACTION_MONITORING' END,
    p.status, p.assigned_to, lower(p.severity),
    CASE WHEN p.status IN ('overdue','breached') THEN 'Action is past its due date'
         ELSE 'Open supervisory action requiring follow-up' END,
    coalesce(p.response_due_at, (p.due_date + time '23:59')::timestamptz,
             p.created_at + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'SUPERVISORY_ACTION')),
    CASE WHEN p.review_status = 'awaiting_review' THEN 'regulator'
         WHEN p.evidence_required AND p.status IN ('open','in_progress','awaiting_evidence','overdue','breached') THEN 'entity'
         ELSE 'regulator' END,
    p.source_type, p.source_id, p.updated_at,
    jsonb_build_object('action_type', p.action_type, 'due_date', p.due_date,
                       'response_due_at', p.response_due_at, 'evidence_required', p.evidence_required,
                       'review_status', p.review_status, 'progress_percent', p.progress_percent,
                       'breached_at', p.breached_at, 'description', p.description)
  FROM public.prudential_actions p
  WHERE p.status NOT IN ('completed','waived','cancelled')

  UNION ALL
  /* ---------------- escalations ------------------------------------------ */
  SELECT
    'ESCALATION', x.id, x.entity_id, 'ESC-' || substr(x.id::text, 1, 8),
    'Escalation · ' || x.escalation_type,
    CASE WHEN x.status = 'open' THEN 'SUPERVISORY_REVIEW' ELSE 'DECISION' END,
    x.status, x.decision_by, coalesce(lower(x.priority), 'high'),
    'Escalated matter awaiting a supervisory decision',
    x.created_at + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'ESCALATION'),
    'regulator', x.related_type, x.related_id, x.updated_at,
    jsonb_build_object('escalation_type', x.escalation_type, 'reason', x.reason,
                       'related_type', x.related_type, 'related_id', x.related_id,
                       'initiated_by', x.created_by, 'raised_at', x.created_at,
                       'decision', x.decision, 'outcome', x.outcome, 'evidence', x.evidence)
  FROM public.prudential_escalations x
  WHERE x.status IN ('open','under_review')

  UNION ALL
  /* ---------------- stress events ---------------------------------------- */
  SELECT
    'STRESS_EVENT', s.id, s.entity_id, coalesce(i.taxonomy_code, i.metric_key, 'STRESS'),
    'Stress indicator · ' || coalesce(i.label, i.metric_key, 'indicator'),
    'DETECTION', 'open', NULL::uuid, coalesce(lower(i.severity), 'medium'),
    'Stress indicator triggered by canonical filing facts',
    s.triggered_at + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'STRESS_EVENT'),
    'regulator', 'return_filing', s.return_filing_id, s.triggered_at,
    jsonb_build_object('indicator_label', i.label, 'indicator_code', i.taxonomy_code,
                       'metric_key', i.metric_key,
                       'observed_value', s.observed_value, 'triggered_at', s.triggered_at,
                       'return_filing_id', s.return_filing_id,
                       'return_filing_version_id', s.return_filing_version_id)
  FROM public.prudential_stress_events s
  LEFT JOIN public.prudential_stress_indicators i ON i.id = s.indicator_id
  WHERE s.resolved_at IS NULL AND s.entity_id IS NOT NULL

  UNION ALL
  /* ---------------- supervisory plan actions ----------------------------- */
  SELECT
    'PLAN_ACTION', pa.id, sp.entity_id, 'PLAN-' || substr(pa.id::text, 1, 8), pa.title,
    'ACTION_MONITORING', pa.status, NULL::uuid,
    CASE WHEN pa.due_date < current_date THEN 'high' ELSE 'medium' END,
    'Supervisory plan commitment',
    (pa.due_date + time '23:59')::timestamptz,
    'regulator', 'supervisory_plan', pa.plan_id, pa.updated_at,
    jsonb_build_object('owner_role', pa.owner_role, 'due_date', pa.due_date,
                       'plan_id', pa.plan_id, 'source', pa.source, 'description', pa.description)
  FROM public.supervisory_plan_actions pa
  JOIN public.supervisory_plans sp ON sp.id = pa.plan_id
  WHERE pa.status NOT IN ('completed','cancelled')

  UNION ALL
  /* ---------------- examinations (reference workspace) ------------------- */
  SELECT
    'EXAMINATION', ex.id, ex.entity_id, ex.reference, ex.title,
    upper(ex.stage), ex.stage, ex.lead_examiner_id,
    coalesce(lower(ex.risk_rating), 'medium'),
    'Active onsite examination',
    ex.created_at + (SELECT make_interval(days => sla_days) FROM cfg WHERE work_item_type = 'EXAMINATION'),
    'regulator', 'examination', ex.id, ex.updated_at,
    jsonb_build_object('examination_type', ex.examination_type, 'stage', ex.stage,
                       'fieldwork_start', ex.fieldwork_start, 'fieldwork_end', ex.fieldwork_end,
                       'period_start', ex.period_under_review_start, 'period_end', ex.period_under_review_end)
  FROM public.examinations ex
  WHERE ex.closed_at IS NULL AND ex.cancellation_reason IS NULL
),
enriched AS (
  SELECT
    r.*,
    l.name AS entity_name,
    l.sector_id,
    coalesce(r.owner_user_id, asg.supervisor_id) AS eff_owner,
    coalesce(pr.full_name, asg.supervisor_name) AS owner_name,
    asg.team,
    CASE
      WHEN r.sla_due_at IS NULL THEN NULL
      WHEN r.sla_due_at < now() THEN 'breached'
      WHEN r.sla_due_at < now() + make_interval(days => coalesce((SELECT due_soon_days FROM cfg WHERE cfg.work_item_type = r.work_item_type), 3)) THEN 'due_soon'
      ELSE 'on_track'
    END AS sla_state
  FROM raw r
  JOIN public.licensees l ON l.id = r.entity_id
  LEFT JOIN assign asg ON asg.entity_id = r.entity_id
  LEFT JOIN public.profiles pr ON pr.id = r.owner_user_id
),
shaped AS (
  SELECT
    e.work_item_type,
    e.work_item_id,
    e.entity_id,
    e.entity_name,
    e.reference,
    e.title,
    e.stage,
    initcap(replace(lower(e.stage), '_', ' ')) AS stage_label,
    e.status,
    initcap(replace(lower(e.status), '_', ' ')) AS status_label,
    e.eff_owner AS owner_user_id,
    e.owner_name,
    e.team,
    CASE
      WHEN e.sla_state = 'breached' AND e.severity IN ('critical','high') THEN 'critical'
      WHEN e.severity = 'critical' THEN 'critical'
      WHEN e.sla_state = 'breached' OR e.severity = 'high' THEN 'high'
      WHEN e.severity = 'medium' THEN 'medium'
      ELSE 'low' END AS priority,
    CASE WHEN e.sla_state = 'breached' THEN e.priority_reason || ' · SLA breached'
         ELSE e.priority_reason END AS priority_reason,
    e.sla_due_at,
    e.sla_state,
    e.waiting_on,
    e.severity,
    e.sector_id,
    /* blockers: mandatory prerequisites before the next action can be taken */
    CASE e.work_item_type
      WHEN 'ASSESSMENT' THEN (
        CASE WHEN e.status IN ('draft','returned_for_revision') AND NOT (e.detail->>'has_rationale')::boolean
             THEN jsonb_build_array(jsonb_build_object('code','rationale_required','label','Record the assessment rationale'))
             ELSE '[]'::jsonb END)
      WHEN 'SUPERVISORY_ACTION' THEN (
        CASE WHEN (e.detail->>'evidence_required')::boolean AND e.detail->>'review_status' = 'not_required'
             THEN jsonb_build_array(jsonb_build_object('code','evidence_outstanding','label','Remediation evidence not yet received from the entity'))
             ELSE '[]'::jsonb END)
      ELSE '[]'::jsonb
    END AS blockers,
    CASE e.work_item_type
      WHEN 'BREACH' THEN CASE WHEN e.status = 'unacknowledged' THEN 'acknowledge_breach'
                              WHEN jsonb_array_length(e.detail->'linked_actions') = 0 THEN 'open_supervisory_response'
                              ELSE 'monitor_directive' END
      WHEN 'EWI' THEN CASE WHEN e.status = 'open' THEN 'acknowledge_ewi' ELSE 'review_deterioration' END
      WHEN 'ASSESSMENT' THEN CASE e.status
                               WHEN 'draft' THEN 'complete_assessment'
                               WHEN 'returned_for_revision' THEN 'revise_assessment'
                               WHEN 'submitted' THEN 'review_assessment'
                               WHEN 'reviewed' THEN 'approve_assessment'
                               ELSE 'monitor_assessment_actions' END
      WHEN 'SUPERVISORY_ACTION' THEN CASE WHEN e.detail->>'review_status' = 'awaiting_review' THEN 'review_evidence'
                                          ELSE 'progress_action' END
      WHEN 'ESCALATION' THEN CASE WHEN e.status = 'open' THEN 'take_escalation_decision' ELSE 'record_escalation_outcome' END
      WHEN 'STRESS_EVENT' THEN 'review_stress_event'
      WHEN 'PLAN_ACTION' THEN 'progress_plan_action'
      ELSE 'open_examination_step'
    END AS next_action_code,
    CASE e.work_item_type
      WHEN 'BREACH' THEN CASE WHEN e.status = 'unacknowledged' THEN 'Acknowledge signal'
                              WHEN jsonb_array_length(e.detail->'linked_actions') = 0 THEN 'Open a supervisory response'
                              ELSE 'Monitor existing directive' END
      WHEN 'EWI' THEN CASE WHEN e.status = 'open' THEN 'Acknowledge early warning' ELSE 'Review deterioration' END
      WHEN 'ASSESSMENT' THEN CASE e.status
                               WHEN 'draft' THEN 'Complete and submit assessment'
                               WHEN 'returned_for_revision' THEN 'Revise and resubmit assessment'
                               WHEN 'submitted' THEN 'Review assessment'
                               WHEN 'reviewed' THEN 'Approve assessment'
                               ELSE 'Monitor resulting actions' END
      WHEN 'SUPERVISORY_ACTION' THEN CASE WHEN e.detail->>'review_status' = 'awaiting_review' THEN 'Review submitted evidence'
                                          ELSE 'Progress supervisory action' END
      WHEN 'ESCALATION' THEN CASE WHEN e.status = 'open' THEN 'Take escalation decision' ELSE 'Record escalation outcome' END
      WHEN 'STRESS_EVENT' THEN 'Review stress event'
      WHEN 'PLAN_ACTION' THEN 'Progress plan action'
      ELSE 'Open current examination step'
    END AS next_action_label,
    CASE e.work_item_type
      WHEN 'BREACH' THEN '/supervision/breaches?breach=' || e.work_item_id::text
      WHEN 'EWI' THEN '/supervision/early-warnings?alert=' || e.work_item_id::text
      WHEN 'ASSESSMENT' THEN '/prudential/assessments/' || e.work_item_id::text || '?section=current'
      WHEN 'SUPERVISORY_ACTION' THEN '/prudential/actions?action=' || e.work_item_id::text
      WHEN 'ESCALATION' THEN '/prudential/escalations?escalation=' || e.work_item_id::text
      WHEN 'STRESS_EVENT' THEN '/prudential/stress-indicators?event=' || e.work_item_id::text
      WHEN 'PLAN_ACTION' THEN '/supervision/plans?action=' || e.work_item_id::text
      ELSE '/prudential/examinations/' || e.work_item_id::text || '?section=current'
    END AS next_action_href,
    CASE e.work_item_type
      WHEN 'BREACH' THEN 'prudential_supervision.workflow_action'
      WHEN 'EWI' THEN 'prudential_supervision.workflow_action'
      WHEN 'ASSESSMENT' THEN 'prudential_supervision.workflow_action'
      WHEN 'SUPERVISORY_ACTION' THEN 'prudential_supervision.edit'
      WHEN 'ESCALATION' THEN 'prudential_supervision.workflow_action'
      ELSE 'prudential_supervision.view'
    END AS next_action_permission,
    e.source_type,
    e.source_id,
    e.last_activity_at,
    CASE e.work_item_type
      WHEN 'ASSESSMENT' THEN '/prudential/assessments/' || e.work_item_id::text
      WHEN 'EXAMINATION' THEN '/prudential/examinations/' || e.work_item_id::text
      ELSE '/entities/' || e.entity_id::text || '?view=prudential'
    END AS canonical_href,
    e.detail
  FROM enriched e
),
filtered AS (
  SELECT s.* FROM shaped s
  WHERE (_types IS NULL OR s.work_item_type = ANY (_types))
    AND (_entity_id IS NULL OR s.entity_id = _entity_id)
    AND (_sector_id IS NULL OR s.sector_id = _sector_id)
    AND (_owner IS NULL OR s.owner_user_id = _owner)
    AND (_unassigned IS NOT TRUE OR s.owner_user_id IS NULL)
    AND (_sla IS NULL OR s.sla_state = _sla)
    AND (_severity IS NULL OR s.priority = ANY (_severity))
    AND (_stage IS NULL OR s.stage = _stage)
    AND (_search IS NULL OR _search = '' OR
         s.entity_name ILIKE '%' || _search || '%' OR
         s.title ILIKE '%' || _search || '%' OR
         coalesce(s.reference, '') ILIKE '%' || _search || '%')
)
SELECT
  f.work_item_type, f.work_item_id, f.entity_id, f.entity_name, f.reference, f.title,
  f.stage, f.stage_label, f.status, f.status_label, f.owner_user_id, f.owner_name, f.team,
  f.priority, f.priority_reason, f.sla_due_at, f.sla_state, f.waiting_on,
  jsonb_array_length(f.blockers)::integer AS blocker_count, f.blockers,
  f.next_action_code, f.next_action_label, f.next_action_href, f.next_action_permission,
  f.source_type, f.source_id, f.last_activity_at, f.canonical_href,
  f.detail || jsonb_build_object('severity', f.severity),
  count(*) OVER () AS total_count
FROM filtered f
ORDER BY
  CASE f.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  CASE f.sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 ELSE 2 END,
  f.sla_due_at NULLS LAST,
  f.last_activity_at DESC
LIMIT greatest(coalesce(_limit, 50), 1) OFFSET greatest(coalesce(_offset, 0), 0);
$fn$;

REVOKE ALL ON FUNCTION public.prudential_work_queue(text[],uuid,uuid,uuid,boolean,text,text[],text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_work_queue(text[],uuid,uuid,uuid,boolean,text,text[],text,text,integer,integer) TO authenticated;

-- 3. Counts from exactly the same scoped source
CREATE OR REPLACE FUNCTION public.prudential_work_queue_counts(
  _types text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _owner uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _sla text DEFAULT NULL,
  _severity text[] DEFAULT NULL,
  _stage text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH q AS (
  SELECT * FROM public.prudential_work_queue(
    _types, _entity_id, _sector_id, _owner, _unassigned, _sla, _severity, _stage, _search, 100000, 0)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'total', (SELECT count(*) FROM q),
  'mine', (SELECT count(*) FROM q WHERE owner_user_id = auth.uid()),
  'unassigned', (SELECT count(*) FROM q WHERE owner_user_id IS NULL),
  'overdue', (SELECT count(*) FROM q WHERE sla_state = 'breached'),
  'due_soon', (SELECT count(*) FROM q WHERE sla_state = 'due_soon'),
  'critical', (SELECT count(*) FROM q WHERE priority = 'critical'),
  'by_type', coalesce((SELECT jsonb_object_agg(work_item_type, n) FROM (
      SELECT work_item_type, count(*) AS n FROM q GROUP BY 1) t), '{}'::jsonb),
  'by_stage', coalesce((SELECT jsonb_object_agg(stage, n) FROM (
      SELECT stage, count(*) AS n FROM q GROUP BY 1) t), '{}'::jsonb),
  'by_priority', coalesce((SELECT jsonb_object_agg(priority, n) FROM (
      SELECT priority, count(*) AS n FROM q GROUP BY 1) t), '{}'::jsonb)
);
$fn$;

REVOKE ALL ON FUNCTION public.prudential_work_queue_counts(text[],uuid,uuid,uuid,boolean,text,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_work_queue_counts(text[],uuid,uuid,uuid,boolean,text,text[],text,text) TO authenticated;