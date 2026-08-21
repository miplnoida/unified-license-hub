-- EPR-02 · portfolio read model for the Prudential dashboard (read-only)
CREATE OR REPLACE FUNCTION public.prudential_dashboard_portfolio()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH q AS (
  SELECT * FROM public.prudential_work_queue(_limit => 100000)
),
ent AS (
  SELECT l.id, l.name, l.sector_id FROM public.licensees l
   WHERE public.can_read_prudential_entity(auth.uid(), l.id)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'portfolio', jsonb_build_object(
    'entities_in_scope', (SELECT count(*) FROM ent),
    'entities_with_signals', (SELECT count(DISTINCT entity_id) FROM q WHERE work_item_type IN ('BREACH','EWI','STRESS_EVENT')),
    'entities_with_breaches', (SELECT count(DISTINCT entity_id) FROM q WHERE work_item_type = 'BREACH'),
    'entities_with_ewis', (SELECT count(DISTINCT entity_id) FROM q WHERE work_item_type = 'EWI')
  ),
  'signals', jsonb_build_object(
    'current_breaches', (SELECT count(*) FROM q WHERE work_item_type = 'BREACH'),
    'unacknowledged_breaches', (SELECT count(*) FROM q WHERE work_item_type = 'BREACH' AND status = 'unacknowledged'),
    'open_ewis', (SELECT count(*) FROM q WHERE work_item_type = 'EWI'),
    'stress_events', (SELECT count(*) FROM q WHERE work_item_type = 'STRESS_EVENT')
  ),
  'work', jsonb_build_object(
    'total', (SELECT count(*) FROM q),
    'mine', (SELECT count(*) FROM q WHERE owner_user_id = auth.uid()),
    'unassigned', (SELECT count(*) FROM q WHERE owner_user_id IS NULL),
    'overdue', (SELECT count(*) FROM q WHERE sla_state = 'breached'),
    'due_soon', (SELECT count(*) FROM q WHERE sla_state = 'due_soon'),
    'open_actions', (SELECT count(*) FROM q WHERE work_item_type = 'SUPERVISORY_ACTION'),
    'overdue_actions', (SELECT count(*) FROM q WHERE work_item_type = 'SUPERVISORY_ACTION' AND sla_state = 'breached'),
    'open_escalations', (SELECT count(*) FROM q WHERE work_item_type = 'ESCALATION'),
    'assessments_in_progress', (SELECT count(*) FROM q WHERE work_item_type = 'ASSESSMENT'),
    'plan_actions', (SELECT count(*) FROM q WHERE work_item_type = 'PLAN_ACTION'),
    'examinations_active', (SELECT count(*) FROM q WHERE work_item_type = 'EXAMINATION')
  ),
  'by_type', coalesce((SELECT jsonb_object_agg(work_item_type, n) FROM
      (SELECT work_item_type, count(*) n FROM q GROUP BY 1) t), '{}'::jsonb),
  'by_priority', coalesce((SELECT jsonb_object_agg(priority, n) FROM
      (SELECT priority, count(*) n FROM q GROUP BY 1) t), '{}'::jsonb),
  'workload', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object(
               'owner_user_id', owner_user_id,
               'owner_name', coalesce(owner_name, 'Unassigned'),
               'team', team,
               'items', count(*),
               'overdue', count(*) FILTER (WHERE sla_state = 'breached')) AS x
        FROM q GROUP BY owner_user_id, owner_name, team
       ORDER BY count(*) DESC LIMIT 10) s), '[]'::jsonb),
  'deteriorating', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object(
               'entity_id', entity_id, 'entity_name', entity_name,
               'signals', count(*) FILTER (WHERE work_item_type IN ('BREACH','EWI','STRESS_EVENT')),
               'open_work', count(*),
               'worst_priority', min(CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END)) AS x
        FROM q GROUP BY entity_id, entity_name
       HAVING count(*) FILTER (WHERE work_item_type IN ('BREACH','EWI','STRESS_EVENT')) > 0
       ORDER BY min(CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END),
                count(*) DESC LIMIT 10) s), '[]'::jsonb),
  'upcoming', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('work_item_type', work_item_type, 'title', title,
               'entity_name', entity_name, 'sla_due_at', sla_due_at, 'sla_state', sla_state,
               'href', next_action_href) AS x
        FROM q WHERE sla_due_at IS NOT NULL AND sla_due_at >= now()
       ORDER BY sla_due_at LIMIT 10) s), '[]'::jsonb)
);
$fn$;

REVOKE ALL ON FUNCTION public.prudential_dashboard_portfolio() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_dashboard_portfolio() TO authenticated;

-- EPR-02 · concise prudential state for one entity (Entity 360 prudential section)
CREATE OR REPLACE FUNCTION public.prudential_entity_state(_entity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH q AS (
  SELECT * FROM public.prudential_work_queue(_entity_id => _entity_id, _limit => 100000)
),
asg AS (
  SELECT supervisor_id, supervisor_name, team, supervisory_cycle, cycle_start, cycle_end
    FROM public.entity_supervision_assignments
   WHERE entity_id = _entity_id AND status = 'active'
   ORDER BY effective_from DESC NULLS LAST LIMIT 1
),
latest_assessment AS (
  SELECT id, status, overall_rating, period_end, approved_at, updated_at
    FROM public.prudential_assessments
   WHERE entity_id = _entity_id
   ORDER BY coalesce(period_end, created_at::date) DESC, updated_at DESC LIMIT 1
),
latest_period AS (
  SELECT rp.period_label, rp.period_end, f.id AS filing_id, f.filing_reference AS reference
    FROM public.return_filings f
    JOIN public.reporting_periods rp ON rp.id = f.reporting_period_id
   WHERE f.entity_id = _entity_id AND f.status = 'accepted'
   ORDER BY rp.period_end DESC LIMIT 1
)
SELECT jsonb_build_object(
  'entity_id', _entity_id,
  'generated_at', now(),
  'allowed', public.can_read_prudential_entity(auth.uid(), _entity_id),
  'overall_rating', (SELECT overall_rating FROM latest_assessment),
  'latest_accepted_period', (SELECT jsonb_build_object('period_label', period_label, 'period_end', period_end,
                                                       'filing_id', filing_id, 'reference', reference)
                               FROM latest_period),
  'signals', jsonb_build_object(
    'breaches', (SELECT count(*) FROM q WHERE work_item_type = 'BREACH'),
    'unacknowledged_breaches', (SELECT count(*) FROM q WHERE work_item_type = 'BREACH' AND status = 'unacknowledged'),
    'ewis', (SELECT count(*) FROM q WHERE work_item_type = 'EWI'),
    'stress_events', (SELECT count(*) FROM q WHERE work_item_type = 'STRESS_EVENT')
  ),
  'actions', jsonb_build_object(
    'open', (SELECT count(*) FROM q WHERE work_item_type = 'SUPERVISORY_ACTION'),
    'overdue', (SELECT count(*) FROM q WHERE work_item_type = 'SUPERVISORY_ACTION' AND sla_state = 'breached'),
    'awaiting_review', (SELECT count(*) FROM q WHERE work_item_type = 'SUPERVISORY_ACTION' AND detail->>'review_status' = 'awaiting_review')
  ),
  'escalations_open', (SELECT count(*) FROM q WHERE work_item_type = 'ESCALATION'),
  'plan_actions_open', (SELECT count(*) FROM q WHERE work_item_type = 'PLAN_ACTION'),
  'examinations_active', (SELECT count(*) FROM q WHERE work_item_type = 'EXAMINATION'),
  'current_assessment', (SELECT jsonb_build_object('id', id, 'status', status, 'overall_rating', overall_rating,
                                                   'period_end', period_end, 'approved_at', approved_at)
                           FROM latest_assessment),
  'supervisor', (SELECT jsonb_build_object('user_id', supervisor_id, 'name', supervisor_name, 'team', team,
                                           'cycle', supervisory_cycle, 'cycle_start', cycle_start, 'cycle_end', cycle_end)
                   FROM asg),
  'next_required_action', (SELECT jsonb_build_object(
                                   'work_item_type', work_item_type, 'work_item_id', work_item_id,
                                   'label', next_action_label, 'href', next_action_href,
                                   'permission', next_action_permission, 'title', title,
                                   'sla_due_at', sla_due_at, 'sla_state', sla_state, 'priority', priority)
                             FROM q
                            ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                                     CASE sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 ELSE 2 END,
                                     sla_due_at NULLS LAST
                            LIMIT 1),
  'work_items', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'work_item_type', work_item_type, 'work_item_id', work_item_id,
                             'title', title, 'reference', reference, 'stage_label', stage_label,
                             'status_label', status_label, 'priority', priority, 'sla_due_at', sla_due_at,
                             'sla_state', sla_state, 'owner_name', owner_name,
                             'next_action_label', next_action_label, 'next_action_href', next_action_href,
                             'detail', detail))
                            FROM q), '[]'::jsonb)
);
$fn$;

REVOKE ALL ON FUNCTION public.prudential_entity_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_entity_state(uuid) TO authenticated;

-- EPR-02 · assessment case workspace model (header, blockers, governed actions, related cases)
CREATE OR REPLACE FUNCTION public.prudential_assessment_case(_assessment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH a AS (
  SELECT a.*, l.name AS entity_name, l.sector_id
    FROM public.prudential_assessments a
    JOIN public.licensees l ON l.id = a.entity_id
   WHERE a.id = _assessment_id
),
gaps AS (
  SELECT coalesce(public.prudential_assessment_finalisation_gaps(_assessment_id), ARRAY[]::text[]) AS codes
),
asg AS (
  SELECT supervisor_id, supervisor_name, team
    FROM public.entity_supervision_assignments
   WHERE entity_id = (SELECT entity_id FROM a) AND status = 'active'
   ORDER BY effective_from DESC NULLS LAST LIMIT 1
),
sla AS (
  SELECT sla_days, due_soon_days FROM public.prudential_process_sla_config WHERE work_item_type = 'ASSESSMENT'
),
hdr AS (
  SELECT
    a.*,
    coalesce(a.submitted_at, a.created_at) + make_interval(days => (SELECT sla_days FROM sla)) AS sla_due_at,
    (SELECT codes FROM gaps) AS gap_codes
  FROM a
),
blockers AS (
  SELECT coalesce(jsonb_agg(b), '[]'::jsonb) AS list FROM (
    SELECT jsonb_build_object('code','component_rating_missing',
                              'label','Record a component rating for ' || c,
                              'href','/prudential/assessments/' || _assessment_id::text || '?section=risk') AS b
      FROM unnest((SELECT gap_codes FROM hdr)) AS c
     WHERE (SELECT status FROM hdr) IN ('draft','returned_for_revision')
    UNION ALL
    SELECT jsonb_build_object('code','rationale_required','label','Record the assessment rationale',
                              'href','/prudential/assessments/' || _assessment_id::text || '?section=risk')
     WHERE (SELECT status FROM hdr) IN ('draft','returned_for_revision')
       AND coalesce(btrim((SELECT rationale FROM hdr)), '') = ''
  ) s
),
related AS (
  SELECT coalesce(jsonb_agg(r), '[]'::jsonb) AS list FROM (
    SELECT jsonb_build_object('kind','return_filing','label', coalesce(f.filing_reference, 'Return filing'),
                              'detail', rp.period_label, 'href', '/admin/returns/filings/' || f.id::text) AS r
      FROM public.return_filings f
      LEFT JOIN public.reporting_periods rp ON rp.id = f.reporting_period_id
     WHERE f.id = (SELECT return_filing_id FROM hdr)
    UNION ALL
    SELECT jsonb_build_object('kind','signal','label', 'Breach · ' || b.metric_key,
                              'detail', b.period_label, 'href', '/supervision/breaches?breach=' || b.id::text)
      FROM public.v_prudential_current_breaches b
     WHERE b.entity_id = (SELECT entity_id FROM hdr)
       AND (b.return_filing_id = (SELECT return_filing_id FROM hdr) OR (SELECT return_filing_id FROM hdr) IS NULL)
    UNION ALL
    SELECT jsonb_build_object('kind','supervisory_action','label', pa.action_reference || ' · ' || pa.title,
                              'detail', pa.status, 'href', '/prudential/actions?action=' || pa.id::text)
      FROM public.prudential_actions pa
     WHERE pa.source_type = 'assessment' AND pa.source_id = _assessment_id
    UNION ALL
    SELECT jsonb_build_object('kind','escalation','label', 'Escalation · ' || x.escalation_type,
                              'detail', x.status, 'href', '/prudential/escalations?escalation=' || x.id::text)
      FROM public.prudential_escalations x
     WHERE x.related_type = 'assessment' AND x.related_id = _assessment_id
    UNION ALL
    SELECT jsonb_build_object('kind','examination','label', ex.reference || ' · ' || ex.title,
                              'detail', ex.stage, 'href', '/prudential/examinations/' || ex.id::text)
      FROM public.examinations ex
     WHERE ex.entity_id = (SELECT entity_id FROM hdr) AND ex.closed_at IS NULL
    UNION ALL
    SELECT jsonb_build_object('kind','correspondence','label', coalesce(t.reference, t.subject),
                              'detail', t.status, 'href', '/correspondence/threads/' || t.id::text)
      FROM public.correspondence_threads t
     WHERE t.licensee_id = (SELECT entity_id FROM hdr)
       AND coalesce(t.module, '') IN ('prudential','prudential_supervision')
  ) s
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM hdr) THEN jsonb_build_object('found', false)
ELSE (
  SELECT jsonb_build_object(
    'found', true,
    'generated_at', now(),
    'header', jsonb_build_object(
      'reference', 'PA-ASMT-' || substr(h.id::text, 1, 8),
      'subject', h.entity_name,
      'entity_id', h.entity_id,
      'entity_href', '/entities/' || h.entity_id::text || '?view=prudential',
      'assessment_type', 'CAMELS prudential assessment',
      'period_start', h.period_start,
      'period_end', h.period_end,
      'stage', CASE h.status
                 WHEN 'draft' THEN 'DATA_REVIEW'
                 WHEN 'returned_for_revision' THEN 'RISK_ASSESSMENT'
                 WHEN 'submitted' THEN 'SUPERVISORY_REVIEW'
                 WHEN 'reviewed' THEN 'DECISION'
                 WHEN 'approved' THEN 'ACTION_MONITORING'
                 ELSE 'CLOSED' END,
      'stage_label', CASE h.status
                 WHEN 'draft' THEN 'Data review'
                 WHEN 'returned_for_revision' THEN 'Risk assessment (revision)'
                 WHEN 'submitted' THEN 'Supervisory review'
                 WHEN 'reviewed' THEN 'Decision'
                 WHEN 'approved' THEN 'Action monitoring'
                 ELSE 'Closed' END,
      'status', h.status,
      'status_label', initcap(replace(h.status, '_', ' ')),
      'overall_rating', h.overall_rating,
      'owner_user_id', coalesce(h.reviewed_by, h.created_by, (SELECT supervisor_id FROM asg)),
      'owner_name', coalesce((SELECT full_name FROM public.profiles WHERE id = coalesce(h.reviewed_by, h.created_by)),
                             (SELECT supervisor_name FROM asg)),
      'team', (SELECT team FROM asg),
      'priority', CASE WHEN h.overall_rating ~ '^[45]' THEN 'high'
                       WHEN h.sla_due_at < now() THEN 'high' ELSE 'medium' END,
      'sla_due_at', h.sla_due_at,
      'sla_state', CASE WHEN h.status IN ('approved','closed') THEN 'paused'
                        WHEN h.sla_due_at < now() THEN 'breached'
                        WHEN h.sla_due_at < now() + make_interval(days => (SELECT due_soon_days FROM sla)) THEN 'due_soon'
                        ELSE 'on_track' END,
      'waiting_on', 'regulator',
      'last_activity_at', h.updated_at
    ),
    'blockers', (SELECT list FROM blockers),
    'available_actions', (
      CASE h.status
        WHEN 'draft' THEN jsonb_build_array(jsonb_build_object(
          'code','submit','label','Submit for review','to_status','submitted',
          'requires_reason', false, 'permission','prudential_supervision.workflow_action',
          'enabled', jsonb_array_length((SELECT list FROM blockers)) = 0))
        WHEN 'returned_for_revision' THEN jsonb_build_array(jsonb_build_object(
          'code','resubmit','label','Resubmit for review','to_status','submitted',
          'requires_reason', false, 'permission','prudential_supervision.workflow_action',
          'enabled', jsonb_array_length((SELECT list FROM blockers)) = 0))
        WHEN 'submitted' THEN jsonb_build_array(
          jsonb_build_object('code','review','label','Mark reviewed','to_status','reviewed',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true),
          jsonb_build_object('code','return','label','Return for revision','to_status','returned_for_revision',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true))
        WHEN 'reviewed' THEN jsonb_build_array(
          jsonb_build_object('code','approve','label','Approve assessment','to_status','approved',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true),
          jsonb_build_object('code','return','label','Return for revision','to_status','returned_for_revision',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true))
        WHEN 'approved' THEN jsonb_build_array(jsonb_build_object(
          'code','close','label','Close assessment','to_status','closed',
          'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true))
        ELSE '[]'::jsonb END),
    'next_action', CASE h.status
        WHEN 'draft' THEN jsonb_build_object('code','submit','label','Complete and submit the assessment')
        WHEN 'returned_for_revision' THEN jsonb_build_object('code','resubmit','label','Address review comments and resubmit')
        WHEN 'submitted' THEN jsonb_build_object('code','review','label','Review the assessment')
        WHEN 'reviewed' THEN jsonb_build_object('code','approve','label','Take the approval decision')
        WHEN 'approved' THEN jsonb_build_object('code','monitor','label','Monitor the resulting supervisory actions')
        ELSE jsonb_build_object('code','none','label','No further action required') END,
    'review_notes', h.review_notes,
    'related_cases', (SELECT list FROM related)
  )
  FROM hdr h
) END;
$fn$;

REVOKE ALL ON FUNCTION public.prudential_assessment_case(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_assessment_case(uuid) TO authenticated;