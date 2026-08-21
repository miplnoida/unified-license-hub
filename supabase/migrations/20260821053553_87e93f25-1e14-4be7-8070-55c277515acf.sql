-- A4 certification defect fix 1: supervisor acknowledgements recorded in
-- return_threshold_breach_acknowledgements were not reflected in the canonical
-- current-breach view, so "awaiting acknowledgement" KPIs and the supervisory
-- priority queue over-counted already-acknowledged signals.
CREATE OR REPLACE VIEW public.v_prudential_current_breaches AS
 SELECT b.id,
    b.return_id,
    b.return_config_id,
    b.metric_key,
    b.level,
    b.value,
    b.threshold_value,
    b.comparator,
    b.detected_at,
    b.notified,
    b.risk_level,
    b.threshold_version,
    COALESCE(b.acknowledged_at, ack.acknowledged_at) AS acknowledged_at,
    COALESCE(b.acknowledged_by, ack.acknowledged_by) AS acknowledged_by,
    COALESCE(b.acknowledgement_note, ack.note) AS acknowledgement_note,
    b.escalated_enforcement_id,
    b.escalated_at,
    b.escalated_by,
    b.entity_id,
    b.return_filing_id,
    b.return_filing_version_id,
    b.reporting_period_id,
    b.regulatory_metric_id,
    b.detection_source,
    b.detection_run_id,
    b.evidence,
    rp.period_label,
    rp.period_end,
    f.filing_reference,
    f.status AS filing_status,
    ack.id AS acknowledgement_id,
    ack.acknowledged_by AS acknowledged_by_user,
    ack.acknowledged_at AS acknowledged_at_ts,
    ack.note AS acknowledgement_note_text
   FROM return_threshold_breaches b
     JOIN return_filings f ON f.id = b.return_filing_id
     LEFT JOIN reporting_periods rp ON rp.id = b.reporting_period_id
     LEFT JOIN LATERAL (
       SELECT a.id, a.acknowledged_by, a.acknowledged_at, a.note
       FROM return_threshold_breach_acknowledgements a
       WHERE a.breach_id = b.id
       ORDER BY a.acknowledged_at DESC NULLS LAST
       LIMIT 1
     ) ack ON true
  WHERE b.detection_source = 'CANONICAL_ENGINE'::text
    AND COALESCE(f.status, ''::text) <> 'WITHDRAWN'::text
    AND b.detection_run_id = ((
      SELECT r.id FROM prudential_detection_runs r
      WHERE r.return_filing_version_id = b.return_filing_version_id
      ORDER BY r.started_at DESC NULLS LAST LIMIT 1));

-- A4 certification defect fix 2: the entity supervisory state did not expose the
-- supervisory directive raised off a breach (prudential_actions.source_id), so
-- the breach -> consequence link (e.g. PA-2026-000009) was invisible in Entity 360.
CREATE OR REPLACE FUNCTION public.sup_entity_supervisory_state(_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  res jsonb;
begin
  if _entity_id is null then raise exception 'entity_id required'; end if;

  res := jsonb_build_object(
    'entity_id', _entity_id,
    'sections', jsonb_build_object('prudential', can_pru, 'conduct', can_con, 'licensing', can_lic),
    'generated_at', now()
  );

  res := res || jsonb_build_object('returns', jsonb_build_object(
    'obligations_active', (select count(*) from public.entity_reporting_obligations o
       where o.entity_id = _entity_id and lower(o.status) = 'active'),
    'filings_total', (select count(*) from public.return_filings f where f.entity_id = _entity_id),
    'filings_awaiting_review', (select count(*) from public.return_filings f
       where f.entity_id = _entity_id and upper(f.status) in ('SUBMITTED','UNDER_REVIEW')),
    'filings_overdue', (select count(*) from public.return_filings f
       join public.reporting_periods rp on rp.id = f.reporting_period_id
       where f.entity_id = _entity_id and f.accepted_at is null and rp.due_date < current_date),
    'next_due', (select jsonb_build_object('period_label', rp.period_label, 'due_date', rp.due_date)
       from public.reporting_periods rp
       join public.entity_reporting_obligations o on o.id = rp.entity_reporting_obligation_id
       where o.entity_id = _entity_id and rp.due_date >= current_date
       order by rp.due_date limit 1),
    'latest_accepted_filing', (select jsonb_build_object('id', f.id, 'reference', f.filing_reference,
         'accepted_at', f.accepted_at, 'version', f.current_version_number)
       from public.return_filings f
       where f.entity_id = _entity_id and f.accepted_at is not null
       order by f.accepted_at desc limit 1)
  ));

  if can_pru then
    res := res || jsonb_build_object('prudential', jsonb_build_object(
      'current_breaches', (select count(*) from public.v_prudential_current_breaches b
         where b.entity_id = _entity_id and b.level = 'breach'),
      'current_ewis', (select count(*) from public.v_prudential_current_breaches b
         where b.entity_id = _entity_id and b.level <> 'breach'),
      'unacknowledged', (select count(*) from public.v_prudential_current_breaches b
         where b.entity_id = _entity_id and b.acknowledged_at is null),
      'signals', coalesce((select jsonb_agg(s.x order by s.detected_at desc) from (
          select jsonb_build_object('id', b.id, 'metric_key', b.metric_key, 'level', b.level,
            'value', b.value, 'threshold_value', b.threshold_value, 'comparator', b.comparator,
            'detected_at', b.detected_at, 'detection_source', b.detection_source,
            'detection_run_id', b.detection_run_id, 'return_filing_id', b.return_filing_id,
            'acknowledged_at', b.acknowledged_at, 'escalated_enforcement_id', b.escalated_enforcement_id,
            'directives', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', pact.id, 'reference', pact.action_reference, 'action_type', pact.action_type,
                 'title', pact.title, 'status', pact.status, 'severity', pact.severity,
                 'due_date', pact.due_date) order by pact.created_at desc)
               from public.prudential_actions pact
               where pact.source_type = 'return_breach' and pact.source_id = b.id), '[]'::jsonb)) x,
            b.detected_at
          from public.v_prudential_current_breaches b where b.entity_id = _entity_id
          order by b.detected_at desc limit 25) s), '[]'::jsonb),
      'latest_approved_assessment', (select jsonb_build_object('id', pa.id, 'period_end', pa.period_end,
           'overall_rating', pa.overall_rating, 'status', pa.status, 'approved_at', pa.approved_at)
         from public.prudential_assessments pa
         where pa.entity_id = _entity_id and pa.approved_at is not null
         order by pa.approved_at desc limit 1),
      'open_directives', (select count(*) from public.prudential_actions pact
         where pact.entity_id = _entity_id and pact.status not in ('completed','cancelled','closed')),
      'open_plan_actions', (select count(*) from public.supervisory_plan_actions sa
         join public.supervisory_plans sp on sp.id = sa.plan_id
         where sp.entity_id = _entity_id and sa.status <> 'completed')
    ));
  end if;

  if can_con then
    res := res || jsonb_build_object('conduct', jsonb_build_object(
      'open_complaints', (select count(*) from public.complaints c
         where c.licensee_id = _entity_id and c.closed_at is null),
      'open_alerts', (select count(*) from public.conduct_alerts a
         where a.licensee_id = _entity_id and a.closed_at is null),
      'alerts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title,
           'kind', a.kind, 'severity', a.severity, 'status', a.status, 'created_at', a.created_at,
           'investigation_id', a.investigation_id))
         from public.conduct_alerts a where a.licensee_id = _entity_id
           and a.created_at >= now() - interval '365 days'), '[]'::jsonb),
      'open_investigations', (select count(*) from public.conduct_investigations i
         where i.licensee_id = _entity_id and i.closed_at is null),
      'investigations', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code,
           'status', i.status, 'severity', i.severity, 'outcome', i.outcome, 'closed_at', i.closed_at))
         from public.conduct_investigations i where i.licensee_id = _entity_id), '[]'::jsonb),
      'open_conduct_actions', (select count(*) from public.conduct_actions ca
         where ca.entity_id = _entity_id and ca.status not in ('completed','cancelled')),
      'conduct_actions', coalesce((select jsonb_agg(jsonb_build_object('id', ca.id, 'title', ca.title,
           'action_type', ca.action_type, 'status', ca.status, 'due_date', ca.due_date))
         from public.conduct_actions ca where ca.entity_id = _entity_id), '[]'::jsonb),
      'thematic_reviews_in_scope', (select count(distinct tre.review_id)
         from public.thematic_review_entities tre where tre.licensee_id = _entity_id),
      'thematic_findings', (select count(*) from public.thematic_review_findings tf
         where tf.licensee_id = _entity_id
            or tf.review_id in (select tre.review_id from public.thematic_review_entities tre
                                 where tre.licensee_id = _entity_id)),
      'open_thematic_actions', (select count(*) from public.thematic_review_actions ta
         where ta.licensee_id = _entity_id and ta.status <> 'completed'),
      'thematic', coalesce((select jsonb_agg(jsonb_build_object('review_id', tr.id, 'code', tr.code,
           'title', tr.title, 'status', tr.status, 'closure_state', tr.closure_state,
           'closed_at', tr.closed_at,
           'findings', (select count(*) from public.thematic_review_findings f where f.review_id = tr.id),
           'actions_open', (select count(*) from public.thematic_review_actions a
              where a.review_id = tr.id and a.status <> 'completed')))
         from public.thematic_reviews tr
         where tr.id in (select tre.review_id from public.thematic_review_entities tre
                          where tre.licensee_id = _entity_id)
            or tr.id in (select ta.review_id from public.thematic_review_actions ta
                          where ta.licensee_id = _entity_id)), '[]'::jsonb),
      'open_enforcement', (select count(*) from public.enforcement_actions ea
         where ea.entity_id = _entity_id and ea.closed_at is null)
    ));
  end if;

  if can_lic then
    res := res || jsonb_build_object('licensing', jsonb_build_object(
      'open_applications', (select count(*) from public.applications a
         where a.entity_id = _entity_id and a.status not in ('approved','rejected','withdrawn','closed')),
      'decision_artifacts', (select count(*) from public.decision_artifacts da
         join public.applications a on a.id = da.application_id where a.entity_id = _entity_id),
      'artifacts', coalesce((select jsonb_agg(jsonb_build_object('id', da.id, 'artifact_type', da.artifact_type,
           'version', da.version, 'decision', da.decision, 'issued_at', da.issued_at,
           'checksum', da.checksum, 'application_id', da.application_id) order by da.issued_at desc)
         from public.decision_artifacts da
         join public.applications a on a.id = da.application_id
         where a.entity_id = _entity_id), '[]'::jsonb),
      'latest_decision_artifact', (select jsonb_build_object('id', da.id, 'artifact_type', da.artifact_type,
           'version', da.version, 'decision', da.decision, 'issued_at', da.issued_at)
         from public.decision_artifacts da
         join public.applications a on a.id = da.application_id
         where a.entity_id = _entity_id order by da.issued_at desc limit 1)
    ));
  end if;

  return res;
end;
$function$;