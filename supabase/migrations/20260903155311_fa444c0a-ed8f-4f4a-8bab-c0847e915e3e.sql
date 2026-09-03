insert into public.sec_routes (key, path_pattern, match_type, required_permission_id, audience, is_protected, is_system, is_active, priority)
select 'route_supervision_portfolio', '/supervision/portfolio', 'exact', p.id, 'internal', true, true, true, 100
from public.sec_permissions p
join public.sec_modules m on m.id = p.module_id
where m.key = 'supervisory_spine' and p.key = 'view'
  and not exists (select 1 from public.sec_routes where path_pattern = '/supervision/portfolio');