alter function public.sup_read_guard() set search_path = public;
alter function public.sup_can_read_domain(uuid, text) set search_path = public;
alter function public.sup_entity_supervisory_state(uuid) set search_path = public;
alter function public.sup_priority_work_queue(integer, text) set search_path = public;
alter function public.sup_dashboard_summary() set search_path = public;
alter function public.sup_team_performance(date, date, text) set search_path = public;