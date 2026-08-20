-- A4: canonical supervisory read models (derived query surfaces only, no new business state).
-- SECURITY INVOKER: underlying RLS and scope rules apply unchanged; an explicit
-- internal-only guard plus per-domain permission gating is applied on top.

create or replace function public.sup_read_guard()
returns uuid
language plpgsql
stable
as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'authentication required'; end if;
  if public.has_external_role(u) then raise exception 'not authorised: supervisory read models are internal only'; end if;
  return u;
end;
$$;

create or replace function public.sup_can_read_domain(_user uuid, _domain text)
returns boolean
language sql
stable
as $$
  select case
    when _user is null then false
    when public.is_super_admin(_user) then true
    when _domain = 'prudential' then public.has_permission(_user,'prudential_supervision','view')
      or public.has_permission(_user,'returns_management','view')
    when _domain = 'conduct' then public.has_permission(_user,'market_conduct','view')
      or public.has_permission(_user,'complaint_management','view')
    when _domain = 'licensing' then public.has_permission(_user,'application_management','view')
      or public.has_permission(_user,'license_management','view')
    when _domain = 'returns' then public.has_permission(_user,'returns_management','view')
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- 1. Entity current supervisory state
-- ---------------------------------------------------------------------------
create or replace function public.sup_entity_supervisory_state(_entity_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  res jsonb := '{}'::jsonb;
begin
  if _entity_id is null then raise exception 'entity_id required'; end if;

  res := jsonb_build_object(
    'entity_id', _entity_id,
    'sections', jsonb_build_object('prudential', can_pru, 'conduct', can_con, 'licensing', can_lic),
    'generated_at', now()
  );

  -- canonical returns / obligations
  res := res || jsonb_build_object('returns', jsonb_build_object(
    'obligations_active', (select count(*) from public.entity_reporting_obligations o
       where o.entity_id = _entity_id and o.status = 'active'),
    'filings_total', (select count(*) from public.return_filings f where f.entity_id = _entity_id),
    'filings_awaiting_review', (select count(*) from public.return_filings f
       where f.entity_id = _entity_id and f.status in ('submitted','under_review')),
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
      'signals', coalesce((select jsonb_agg(x order by x->>'detected_at' desc) from (
          select jsonb_build_object('id', b.id, 'metric_key', b.metric_key, 'level', b.level,
            'value', b.value, 'threshold_value', b.threshold_value, 'comparator', b.comparator,
            'detected_at', b.detected_at, 'detection_source', b.detection_source,
            'detection_run_id', b.detection_run_id, 'return_filing_id', b.return_filing_id,
            'acknowledged_at', b.acknowledged_at, 'escalated_enforcement_id', b.escalated_enforcement_id) x
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
      'open_investigations', (select count(*) from public.conduct_investigations i
         where i.licensee_id = _entity_id and i.closed_at is null),
      'open_conduct_actions', (select count(*) from public.conduct_actions ca
         where ca.entity_id = _entity_id and ca.status not in ('completed','cancelled')),
      'thematic_findings', (select count(*) from public.thematic_review_findings tf
         where tf.licensee_id = _entity_id),
      'open_thematic_actions', (select count(*) from public.thematic_review_actions ta
         where ta.licensee_id = _entity_id and ta.status <> 'completed'),
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

-- ---------------------------------------------------------------------------
-- 2. Priority supervisory work queue
-- ---------------------------------------------------------------------------
create or replace function public.sup_priority_work_queue(_limit integer default 50, _domain text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  lim integer := least(greatest(coalesce(_limit,50),1),200);
begin
  return coalesce((
    select jsonb_agg(x order by rank_order, due_at nulls last)
    from (
      -- unacknowledged prudential breaches / EWIs
      select jsonb_build_object('kind','prudential_signal','domain','prudential',
        'id', b.id, 'entity_id', b.entity_id, 'title', b.metric_key || ' ' || b.level,
        'severity', case when b.level = 'breach' then 'critical' else 'high' end,
        'status', case when b.acknowledged_at is null then 'awaiting_acknowledgement' else 'acknowledged' end,
        'due_at', b.detected_at, 'href', '/supervision/prudential/breach-inbox') x,
        case when b.level = 'breach' then 1 else 2 end rank_order, b.detected_at due_at
      from public.v_prudential_current_breaches b
      where can_pru and (_domain is null or _domain = 'prudential') and b.acknowledged_at is null
      union all
      -- canonical filings awaiting review / overdue
      select jsonb_build_object('kind','return_filing','domain','returns',
        'id', f.id, 'entity_id', f.entity_id, 'title', coalesce(f.filing_reference,'Filing') || ' — ' || f.status,
        'severity', case when rp.due_date < current_date and f.accepted_at is null then 'high' else 'medium' end,
        'status', f.status, 'due_at', rp.due_date::timestamptz,
        'href', '/returns/filings/' || f.id),
        case when rp.due_date < current_date and f.accepted_at is null then 2 else 4 end, rp.due_date::timestamptz
      from public.return_filings f
      left join public.reporting_periods rp on rp.id = f.reporting_period_id
      where can_pru and (_domain is null or _domain = 'returns')
        and (f.status in ('submitted','under_review') or (f.accepted_at is null and rp.due_date < current_date))
      union all
      -- open conduct investigations
      select jsonb_build_object('kind','conduct_investigation','domain','conduct',
        'id', i.id, 'entity_id', i.licensee_id, 'title', coalesce(i.code,'Investigation') || ' — ' || coalesce(i.allegation,''),
        'severity', coalesce(i.severity,'medium'), 'status', i.status, 'due_at', i.due_date::timestamptz,
        'href', '/supervision/conduct/investigations/' || i.id),
        case when i.due_date is not null and i.due_date < current_date then 2 else 3 end, i.due_date::timestamptz
      from public.conduct_investigations i
      where can_con and (_domain is null or _domain = 'conduct') and i.closed_at is null
      union all
      -- open conduct actions / directives
      select jsonb_build_object('kind','conduct_action','domain','conduct',
        'id', ca.id, 'entity_id', ca.entity_id, 'title', ca.title,
        'severity', case when ca.due_date < current_date then 'high' else 'medium' end,
        'status', ca.status, 'due_at', ca.due_date::timestamptz,
        'href', '/supervision/conduct/actions'),
        case when ca.due_date < current_date then 2 else 4 end, ca.due_date::timestamptz
      from public.conduct_actions ca
      where can_con and (_domain is null or _domain = 'conduct') and ca.status not in ('completed','cancelled')
      union all
      -- open thematic remediation actions
      select jsonb_build_object('kind','thematic_action','domain','conduct',
        'id', ta.id, 'entity_id', ta.licensee_id, 'title', ta.title,
        'severity', case when ta.due_date < current_date then 'high' else 'medium' end,
        'status', ta.status, 'due_at', ta.due_date::timestamptz,
        'href', '/supervision/conduct/thematic-reviews/' || ta.review_id),
        case when ta.due_date < current_date then 2 else 4 end, ta.due_date::timestamptz
      from public.thematic_review_actions ta
      where can_con and (_domain is null or _domain = 'conduct') and ta.status <> 'completed'
      union all
      -- licensing applications awaiting decision
      select jsonb_build_object('kind','application','domain','licensing',
        'id', a.id, 'entity_id', a.entity_id, 'title', coalesce(a.application_number,'Application') || ' — ' || a.status,
        'severity','medium', 'status', a.status, 'due_at', a.created_at,
        'href', '/applications/' || a.id),
        4, a.created_at
      from public.applications a
      where can_lic and (_domain is null or _domain = 'licensing')
        and a.status in ('submitted','under_review','pending_approval')
    ) q
    limit lim
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Supervisor dashboard summary (aggregates follow the same boundary as rows)
-- ---------------------------------------------------------------------------
create or replace function public.sup_dashboard_summary()
returns jsonb
language plpgsql
stable
as $$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  res jsonb := jsonb_build_object('generated_at', now(),
    'domains', jsonb_build_object('prudential', can_pru, 'conduct', can_con, 'licensing', can_lic));
begin
  if can_pru then
    res := res || jsonb_build_object('prudential', jsonb_build_object(
      'current_breaches', (select count(*) from public.v_prudential_current_breaches where level = 'breach'),
      'current_ewis', (select count(*) from public.v_prudential_current_breaches where level <> 'breach'),
      'awaiting_acknowledgement', (select count(*) from public.v_prudential_current_breaches where acknowledged_at is null),
      'entities_with_signals', (select count(distinct entity_id) from public.v_prudential_current_breaches),
      'open_plan_actions', (select count(*) from public.supervisory_plan_actions where status <> 'completed')
    ), 'returns', jsonb_build_object(
      'awaiting_review', (select count(*) from public.return_filings where status in ('submitted','under_review')),
      'overdue', (select count(*) from public.return_filings f
         join public.reporting_periods rp on rp.id = f.reporting_period_id
         where f.accepted_at is null and rp.due_date < current_date),
      'due_next_30_days', (select count(*) from public.reporting_periods rp
         where rp.due_date between current_date and current_date + 30 and rp.closed_at is null),
      'accepted_last_30_days', (select count(*) from public.return_filings
         where accepted_at >= now() - interval '30 days')
    ));
  end if;

  if can_con then
    res := res || jsonb_build_object('conduct', jsonb_build_object(
      'open_complaints', (select count(*) from public.complaints where closed_at is null),
      'complaints_sla_breached', (select count(*) from public.complaints
         where closed_at is null and sla_due_at is not null and sla_due_at < now()),
      'open_alerts', (select count(*) from public.conduct_alerts where closed_at is null),
      'open_investigations', (select count(*) from public.conduct_investigations where closed_at is null),
      'overdue_conduct_actions', (select count(*) from public.conduct_actions
         where status not in ('completed','cancelled') and due_date < current_date),
      'open_thematic_reviews', (select count(*) from public.thematic_reviews where closed_at is null),
      'open_thematic_actions', (select count(*) from public.thematic_review_actions where status <> 'completed'),
      'open_enforcement', (select count(*) from public.enforcement_actions where closed_at is null)
    ));
  end if;

  if can_lic then
    res := res || jsonb_build_object('licensing', jsonb_build_object(
      'in_flight_applications', (select count(*) from public.applications
         where status in ('submitted','under_review','pending_approval')),
      'decided_last_30_days', (select count(*) from public.decision_artifacts
         where issued_at >= now() - interval '30 days'),
      'artifacts_total', (select count(*) from public.decision_artifacts)
    ));
  end if;

  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Team performance — factual workload only, no scoring or ranking
-- ---------------------------------------------------------------------------
create or replace function public.sup_team_performance(
  _from date default (current_date - 90),
  _to date default current_date,
  _domain text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  allowed boolean := public.is_super_admin(u)
    or public.has_permission(u,'admin_dashboard','view')
    or public.has_permission(u,'report_management','view')
    or public.has_permission(u,'employee_management','view');
  d_from timestamptz := coalesce(_from, current_date - 90)::timestamptz;
  d_to timestamptz := (coalesce(_to, current_date) + 1)::timestamptz;
begin
  if not allowed then
    raise exception 'not authorised to view team performance';
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'domains', jsonb_build_object('prudential', can_pru, 'conduct', can_con, 'licensing', can_lic),
    'officers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'officer_id', o.officer_id,
        'officer_name', coalesce(p.full_name, 'Unassigned'),
        'department', p.department,
        'open_items', o.open_items,
        'overdue_items', o.overdue_items,
        'due_soon_items', o.due_soon_items,
        'completed_in_period', o.completed_in_period,
        'by_domain', o.by_domain) order by o.open_items desc)
      from (
        select officer_id,
          count(*) filter (where state = 'open') open_items,
          count(*) filter (where state = 'open' and due_date is not null and due_date < current_date) overdue_items,
          count(*) filter (where state = 'open' and due_date between current_date and current_date + 14) due_soon_items,
          count(*) filter (where state = 'completed') completed_in_period,
          jsonb_object_agg(domain, cnt) by_domain
        from (
          select officer_id, domain, state, min(due_date) due_date, count(*) cnt
          from (
            select f.assigned_reviewer_id officer_id, 'returns'::text domain,
              case when f.accepted_at is null and f.rejected_at is null then 'open' else 'completed' end state,
              rp.due_date
            from public.return_filings f
            left join public.reporting_periods rp on rp.id = f.reporting_period_id
            where can_pru and (_domain is null or _domain = 'returns')
              and (f.accepted_at is null or f.accepted_at between d_from and d_to)
            union all
            select i.assigned_investigator, 'conduct', case when i.closed_at is null then 'open' else 'completed' end, i.due_date
            from public.conduct_investigations i
            where can_con and (_domain is null or _domain = 'conduct')
              and (i.closed_at is null or i.closed_at between d_from and d_to)
            union all
            select ca.assigned_to, 'conduct', case when ca.status in ('completed','cancelled') then 'completed' else 'open' end, ca.due_date
            from public.conduct_actions ca
            where can_con and (_domain is null or _domain = 'conduct')
              and (ca.status not in ('completed','cancelled') or ca.closed_at between d_from and d_to)
            union all
            select ta.assigned_to, 'conduct', case when ta.status = 'completed' then 'completed' else 'open' end, ta.due_date
            from public.thematic_review_actions ta
            where can_con and (_domain is null or _domain = 'conduct')
              and (ta.status <> 'completed' or ta.completed_at between d_from and d_to)
            union all
            select a.assigned_to, 'licensing',
              case when a.status in ('approved','rejected','withdrawn','closed') then 'completed' else 'open' end, null::date
            from public.applications a
            where can_lic and (_domain is null or _domain = 'licensing')
              and (a.status not in ('approved','rejected','withdrawn','closed') or a.created_at between d_from and d_to)
          ) items
          group by officer_id, domain, state
        ) g
        group by officer_id
      ) o
      left join public.profiles p on p.id = o.officer_id
    ), '[]'::jsonb),
    'unassigned', jsonb_build_object(
      'breaches_awaiting_acknowledgement', case when can_pru then
        (select count(*) from public.v_prudential_current_breaches where acknowledged_at is null) else null end,
      'filings_unassigned', case when can_pru then
        (select count(*) from public.return_filings where assigned_reviewer_id is null
           and status in ('submitted','under_review')) else null end,
      'complaints_unassigned_team', case when can_con then
        (select count(*) from public.complaints where closed_at is null and assigned_team is null) else null end
    )
  );
end;
$$;

revoke all on function public.sup_read_guard() from public, anon;
revoke all on function public.sup_can_read_domain(uuid, text) from public, anon;
revoke all on function public.sup_entity_supervisory_state(uuid) from public, anon;
revoke all on function public.sup_priority_work_queue(integer, text) from public, anon;
revoke all on function public.sup_dashboard_summary() from public, anon;
revoke all on function public.sup_team_performance(date, date, text) from public, anon;
grant execute on function public.sup_read_guard() to authenticated, service_role;
grant execute on function public.sup_can_read_domain(uuid, text) to authenticated, service_role;
grant execute on function public.sup_entity_supervisory_state(uuid) to authenticated, service_role;
grant execute on function public.sup_priority_work_queue(integer, text) to authenticated, service_role;
grant execute on function public.sup_dashboard_summary() to authenticated, service_role;
grant execute on function public.sup_team_performance(date, date, text) to authenticated, service_role;