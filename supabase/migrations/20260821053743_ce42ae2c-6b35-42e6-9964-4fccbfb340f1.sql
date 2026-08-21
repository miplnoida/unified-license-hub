CREATE OR REPLACE FUNCTION public.sup_team_performance(_from date DEFAULT (CURRENT_DATE - 90), _to date DEFAULT CURRENT_DATE, _domain text DEFAULT NULL::text)
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
           and upper(status) in ('SUBMITTED','UNDER_REVIEW')) else null end,
      'complaints_unassigned_team', case when can_con then
        (select count(*) from public.complaints where closed_at is null and assigned_team is null) else null end
    )
  );
end;
$function$;