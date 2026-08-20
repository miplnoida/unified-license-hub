insert into public.sec_role_permissions (role_id, permission_id)
select '37f867b4-8740-4671-95bb-6fffbf529848'::uuid, p.id
from public.sec_permissions p join public.sec_modules m on m.id = p.module_id
where m.key = 'report_management' and p.key = 'create'
on conflict do nothing;