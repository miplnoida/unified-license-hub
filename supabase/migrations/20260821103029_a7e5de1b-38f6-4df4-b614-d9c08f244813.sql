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
   WHERE f.entity_id = _entity_id AND upper(f.status) = 'ACCEPTED'
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