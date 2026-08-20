insert into public.sec_role_permissions (role_id, permission_id)
select '37f867b4-8740-4671-95bb-6fffbf529848'::uuid, p.id
from public.sec_permissions p
join public.sec_modules m on m.id = p.module_id
where (m.key = 'market_conduct' and p.key in ('run_conduct_analytics','manage_monitoring_rules','initiate_investigation','initiate_thematic_review','issue_enforcement_action','manage_complaints'))
   or (m.key = 'market_conduct_investigation')
   or (m.key = 'enforcement_management' and p.key in ('view','create','edit','workflow_action'))
   or (m.key = 'escalation_management' and p.key in ('view','acknowledge','escalate','resolve'))
and not exists (
  select 1 from public.sec_role_permissions rp
  where rp.role_id = '37f867b4-8740-4671-95bb-6fffbf529848' and rp.permission_id = p.id
)
on conflict do nothing;