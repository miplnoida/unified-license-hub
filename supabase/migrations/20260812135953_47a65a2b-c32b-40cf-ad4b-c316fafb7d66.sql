create or replace function public.can_view_advisory_ai(_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case _module
    when 'examination' then
      public.has_permission(auth.uid(), 'prudential_supervision', 'view')
      or public.has_permission(auth.uid(), 'inspection_management', 'view')
    when 'enforcement' then
      public.has_permission(auth.uid(), 'enforcement_management', 'view')
    when 'complaints' then
      public.has_permission(auth.uid(), 'complaint_management', 'view')
    when 'conduct' then
      public.has_permission(auth.uid(), 'market_conduct', 'view')
    when 'cross_module' then
      public.has_permission(auth.uid(), 'prudential_supervision', 'view')
    when 'executive' then
      public.has_permission(auth.uid(), 'executive_oversight', 'view_all_dashboards')
      or public.has_permission(auth.uid(), 'admin_dashboard', 'view')
    else false
  end;
$$;

grant execute on function public.can_view_advisory_ai(text) to authenticated;

drop policy if exists ai_insights_read_supervisory on public.ai_insights;
create policy ai_insights_read_supervisory
on public.ai_insights
for select
to authenticated
using (public.can_view_advisory_ai(module));

drop policy if exists ai_insights_feedback_update_supervisory on public.ai_insights;
create policy ai_insights_feedback_update_supervisory
on public.ai_insights
for update
to authenticated
using (public.can_view_advisory_ai(module))
with check (public.can_view_advisory_ai(module));