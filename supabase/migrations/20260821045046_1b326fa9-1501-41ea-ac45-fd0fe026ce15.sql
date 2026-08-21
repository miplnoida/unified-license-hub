-- A4 fix: thematic_review_entities scopes by licensee_id
create or replace function public.sup_entity_supervisory_state(_entity_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
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
            'acknowledged_at', b.acknowledged_at, 'escalated_enforcement_id', b.escalated_enforcement_id) x,
            b.detected_at
          from public.v_prudential_current_breaches b where b.entity_id = _entity_id
          order by b.detected_at desc limit 25) s), '[]'::jsonb),
      'latest_approved_assessment', (select jsonb_build_object('id', pa.id, 'period_end', pa.period_end,
           'overall_rating', pa.overall_rating, 'status', pa.status, 'approved_at', pa.approved_at)
         from public.prudential_assessments pa
         where pa.entity_id = _entity_id and pa.approved_at is not null
         order by pa.approved_at desc limit 1),
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
$$;

create or replace function public.sup_priority_work_queue(_limit integer default 50, _domain text default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  lim integer := least(greatest(coalesce(_limit,50),1),200);
begin
  return coalesce((
    select jsonb_agg(z.x order by z.rank_order, z.due_at nulls last)
    from (
      select q.x, q.rank_order, q.due_at
      from (
        select jsonb_build_object('kind','prudential_signal','domain','prudential',
          'id', b.id, 'entity_id', b.entity_id, 'title', b.metric_key || ' ' || b.level,
          'severity', case when b.level = 'breach' then 'critical' else 'high' end,
          'status', case when b.acknowledged_at is null then 'awaiting_acknowledgement' else 'acknowledged' end,
          'due_at', b.detected_at, 'href', '/supervision/breaches') x,
          case when b.level = 'breach' then 1 else 2 end rank_order, b.detected_at due_at
        from public.v_prudential_current_breaches b
        where can_pru and (_domain is null or _domain = 'prudential') and b.acknowledged_at is null
        union all
        select jsonb_build_object('kind','return_filing','domain','returns',
          'id', f.id, 'entity_id', f.entity_id, 'title', coalesce(f.filing_reference,'Filing') || ' — ' || f.status,
          'severity', case when rp.due_date < current_date and f.accepted_at is null then 'high' else 'medium' end,
          'status', f.status, 'due_at', rp.due_date::timestamptz,
          'href', '/returns/filings/' || f.id),
          case when rp.due_date < current_date and f.accepted_at is null then 2 else 4 end, rp.due_date::timestamptz
        from public.return_filings f
        left join public.reporting_periods rp on rp.id = f.reporting_period_id
        where can_pru and (_domain is null or _domain = 'returns')
          and (upper(f.status) in ('SUBMITTED','UNDER_REVIEW')
               or (f.accepted_at is null and rp.due_date < current_date))
        union all
        select jsonb_build_object('kind','conduct_investigation','domain','conduct',
          'id', i.id, 'entity_id', i.licensee_id, 'title', coalesce(i.code,'Investigation'),
          'severity', coalesce(i.severity,'medium'), 'status', i.status, 'due_at', null,
          'href', '/conduct/investigations/' || i.id),
          3, i.created_at
        from public.conduct_investigations i
        where can_con and (_domain is null or _domain = 'conduct') and i.closed_at is null
        union all
        select jsonb_build_object('kind','conduct_action','domain','conduct',
          'id', ca.id, 'entity_id', ca.entity_id, 'title', ca.title,
          'severity', case when ca.due_date < current_date then 'high' else 'medium' end,
          'status', ca.status, 'due_at', ca.due_date::timestamptz,
          'href', '/conduct/actions'),
          case when ca.due_date < current_date then 2 else 4 end, ca.due_date::timestamptz
        from public.conduct_actions ca
        where can_con and (_domain is null or _domain = 'conduct') and ca.status not in ('completed','cancelled')
        union all
        select jsonb_build_object('kind','thematic_action','domain','conduct',
          'id', ta.id, 'entity_id', ta.licensee_id, 'title', ta.title,
          'severity', case when ta.due_date < current_date then 'high' else 'medium' end,
          'status', ta.status, 'due_at', ta.due_date::timestamptz,
          'href', '/supervision/thematic-reviews/' || ta.review_id),
          case when ta.due_date < current_date then 2 else 4 end, ta.due_date::timestamptz
        from public.thematic_review_actions ta
        where can_con and (_domain is null or _domain = 'conduct') and ta.status <> 'completed'
        union all
        select jsonb_build_object('kind','application','domain','licensing',
          'id', a.id, 'entity_id', a.entity_id, 'title', coalesce(a.application_number,'Application') || ' — ' || a.status,
          'severity','medium', 'status', a.status, 'due_at', a.created_at,
          'href', '/applications/' || a.id),
          4, a.created_at
        from public.applications a
        where can_lic and (_domain is null or _domain = 'licensing')
          and a.status in ('submitted','under_review','in_progress','pending_approval')
      ) q
      order by q.rank_order, q.due_at nulls last
      limit lim
    ) z
  ), '[]'::jsonb);
end;
$$;