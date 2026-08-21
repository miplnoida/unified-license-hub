-- A4 fix: drop the invalid entity-name join (no canonical entity table keyed
-- by return_filings.entity_id); titles stay reference-based and the UI resolves
-- entity names separately.
create or replace function public.sup_priority_work_queue(_limit integer default 50, _domain text default null)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
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
          'id', b.id, 'entity_id', b.entity_id,
          'title', initcap(replace(lower(b.metric_key),'_',' ')) || ' ' || lower(b.level),
          'severity', case when b.level = 'breach' then 'critical' else 'high' end,
          'status', case when b.acknowledged_at is null then 'awaiting_acknowledgement' else 'acknowledged' end,
          'due_at', b.detected_at, 'href', '/supervision/breaches') x,
          case when b.level = 'breach' then 1 else 2 end rank_order, b.detected_at due_at
        from public.v_prudential_current_breaches b
        where can_pru and (_domain is null or _domain = 'prudential') and b.acknowledged_at is null
        union all
        select jsonb_build_object('kind','return_filing','domain','returns',
          'id', f.id, 'entity_id', f.entity_id,
          'title', coalesce(f.filing_reference,'Return filing'),
          'severity', case when rp.due_date < current_date and f.accepted_at is null then 'high' else 'medium' end,
          'status', f.status, 'due_at', rp.due_date::timestamptz,
          'href', '/returns/filings/' || f.id),
          case when rp.due_date < current_date and f.accepted_at is null then 2 else 4 end, rp.due_date::timestamptz
        from public.return_filings f
        left join public.reporting_periods rp on rp.id = f.reporting_period_id
        where can_pru and (_domain is null or _domain = 'returns')
          and (upper(f.status) in ('SUBMITTED','UNDER_REVIEW','CORRECTION_REQUESTED')
               or (f.accepted_at is null and rp.due_date < current_date))
        union all
        select jsonb_build_object('kind','conduct_investigation','domain','conduct',
          'id', i.id, 'entity_id', i.licensee_id,
          'title', coalesce(i.code,'Conduct investigation'),
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
          'id', a.id, 'entity_id', a.entity_id,
          'title', coalesce(a.application_number,'Licence application'),
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
$function$;