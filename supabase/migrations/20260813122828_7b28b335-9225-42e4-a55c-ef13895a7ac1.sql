create or replace function public.supervisory_ai_report_entity_options()
returns table(entity_id uuid, entity_name text, n bigint)
language sql
stable
set search_path to 'public'
as $$
  with counts as (
    select i.entity_id, count(*)::bigint as n
    from public.supervisory_ai_reports_index(
      null, null, null, null, null, null, true, null, null, 100000, 0) i
    where i.entity_id is not null
    group by 1
  )
  select l.id, l.name, coalesce(c.n, 0)
  from public.licensees l
  left join counts c on c.entity_id = l.id
  order by l.name
$$;

grant execute on function public.supervisory_ai_report_entity_options() to authenticated;