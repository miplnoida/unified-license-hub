CREATE OR REPLACE FUNCTION public.sup_team_performance(
  _from date DEFAULT (CURRENT_DATE - 90),
  _to date DEFAULT CURRENT_DATE,
  _domain text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  u uuid := public.sup_read_guard();
  allowed boolean := public.is_super_admin(u)
    or public.has_permission(u,'admin_dashboard','view')
    or public.has_permission(u,'report_management','view')
    or public.has_permission(u,'employee_management','view');
  dom text := nullif(upper(coalesce(_domain,'')), '');
  result jsonb;
begin
  if not allowed then
    raise exception 'not authorised to view team performance';
  end if;

  with w as (
    select i.*
    from public.supervisory_work_item i
    where dom is null or upper(coalesce(i.domain_code,'CROSS_DOMAIN')) = dom
  ), od as (
    select w.effective_owner_id as officer_id,
           coalesce(w.domain_code,'CROSS_DOMAIN') as domain_code,
           count(*) as cnt
    from w where w.effective_owner_id is not null
    group by 1,2
  ), officer as (
    select w.effective_owner_id as officer_id,
      min(w.effective_team_id::text)::uuid as team_id,
      count(*) as open_items,
      count(*) filter (where w.priority in ('CRITICAL','HIGH')) as high_priority_items,
      count(*) filter (where w.is_overdue) as overdue_items,
      count(*) filter (where w.is_due_soon) as due_soon_items,
      count(*) filter (where w.decision_point or w.work_state = 'AWAITING_DECISION') as awaiting_decision_items,
      count(*) filter (where w.work_type like 'EXAMINATION%') as examination_items,
      count(*) filter (where w.work_type like 'FINDING%' or w.work_type like 'REMEDIATION%') as finding_remediation_items,
      min(w.due_date) as earliest_due_date
    from w where w.effective_owner_id is not null
    group by 1
  ), team as (
    select w.effective_team_id as team_id,
      count(distinct w.effective_owner_id) as officers,
      count(*) as open_items,
      count(*) filter (where w.priority in ('CRITICAL','HIGH')) as high_priority_items,
      count(*) filter (where w.is_overdue) as overdue_items,
      count(*) filter (where w.is_due_soon) as due_soon_items,
      count(*) filter (where w.decision_point or w.work_state='AWAITING_DECISION') as awaiting_decision_items
    from w where w.effective_team_id is not null
    group by 1
  ), unassigned_domain as (
    select coalesce(w.domain_code,'CROSS_DOMAIN') as domain_code, count(*) as cnt
    from w where w.is_unassigned group by 1
  )
  select jsonb_build_object(
    'generated_at', now(),
    'source', 'supervisory_work_item',
    'period', jsonb_build_object('from', _from, 'to', _to),
    'capacity_methodology', 'NONE_APPROVED',
    'domain_filter', dom,
    'officers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'officer_id', o.officer_id,
        'officer_name', coalesce(p.full_name, 'Unnamed officer'),
        'department', p.department,
        'team_id', o.team_id,
        'team_name', t.name,
        'open_items', o.open_items,
        'high_priority_items', o.high_priority_items,
        'overdue_items', o.overdue_items,
        'due_soon_items', o.due_soon_items,
        'awaiting_decision_items', o.awaiting_decision_items,
        'examination_items', o.examination_items,
        'finding_remediation_items', o.finding_remediation_items,
        'earliest_due_date', o.earliest_due_date,
        'by_domain', coalesce((
          select jsonb_object_agg(d.domain_code, d.cnt)
          from od d where d.officer_id = o.officer_id), '{}'::jsonb)
      ) order by o.overdue_items desc, o.high_priority_items desc, o.open_items desc)
      from officer o
      left join public.profiles p on p.id = o.officer_id
      left join public.regulatory_teams t on t.id = o.team_id
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', x.team_id,
        'team_name', coalesce(t.name, 'Unnamed team'),
        'officers', x.officers,
        'open_items', x.open_items,
        'high_priority_items', x.high_priority_items,
        'overdue_items', x.overdue_items,
        'due_soon_items', x.due_soon_items,
        'awaiting_decision_items', x.awaiting_decision_items
      ) order by x.open_items desc)
      from team x left join public.regulatory_teams t on t.id = x.team_id
    ), '[]'::jsonb),
    'unassigned', (
      select jsonb_build_object(
        'items', count(*),
        'high_priority_items', count(*) filter (where w.priority in ('CRITICAL','HIGH')),
        'overdue_items', count(*) filter (where w.is_overdue),
        'due_soon_items', count(*) filter (where w.is_due_soon),
        'awaiting_decision_items', count(*) filter (where w.decision_point or w.work_state='AWAITING_DECISION'),
        'by_domain', coalesce((select jsonb_object_agg(ud.domain_code, ud.cnt) from unassigned_domain ud), '{}'::jsonb)
      ) from w where w.is_unassigned
    ),
    'totals', (
      select jsonb_build_object(
        'open_items', count(*),
        'high_priority_items', count(*) filter (where w.priority in ('CRITICAL','HIGH')),
        'overdue_items', count(*) filter (where w.is_overdue),
        'due_soon_items', count(*) filter (where w.is_due_soon),
        'awaiting_decision_items', count(*) filter (where w.decision_point or w.work_state='AWAITING_DECISION'),
        'unassigned_items', count(*) filter (where w.is_unassigned)
      ) from w
    )
  ) into result;

  return result;
end;
$function$;

REVOKE ALL ON FUNCTION public.sup_team_performance(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sup_team_performance(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sup_team_performance(date, date, text) TO service_role;