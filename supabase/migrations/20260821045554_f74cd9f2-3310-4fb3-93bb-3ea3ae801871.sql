-- A4: canonical navigation for supervisory team performance
insert into public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
select 'route_supervision_team_performance', '/supervision/team-performance', 'exact', '35301441-468b-42b1-a392-200f31d45ba8', 'internal', true, true, true, 100
where not exists (select 1 from public.sec_routes where path_pattern = '/supervision/team-performance');

insert into public.sec_navigation_items (key, parent_id, label, description, item_type, route_id, icon_key, sort_order, audience, is_active, show_in_sidebar, show_in_search, keywords, is_system, admin_only, required_permission_id)
select 'nav_supervision_team_performance', 'aa7a70db-c87f-4297-bc66-dbc09d8fa51a',
  'Team Performance', 'Supervisory workload, timeliness and completed work per officer.',
  'link', (select id from public.sec_routes where path_pattern = '/supervision/team-performance'),
  'Users', 95, 'internal', true, true, true,
  array['team','performance','workload','supervisor','sla'], true, false,
  '35301441-468b-42b1-a392-200f31d45ba8'
where not exists (select 1 from public.sec_navigation_items where key = 'nav_supervision_team_performance');