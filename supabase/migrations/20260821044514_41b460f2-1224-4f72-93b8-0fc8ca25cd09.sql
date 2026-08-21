grant execute on function public.sup_read_guard() to supabase_read_only_user;
grant execute on function public.sup_can_read_domain(uuid, text) to supabase_read_only_user;
grant execute on function public.sup_entity_supervisory_state(uuid) to supabase_read_only_user;
grant execute on function public.sup_priority_work_queue(integer, text) to supabase_read_only_user;
grant execute on function public.sup_dashboard_summary() to supabase_read_only_user;
grant execute on function public.sup_team_performance(date, date, text) to supabase_read_only_user;