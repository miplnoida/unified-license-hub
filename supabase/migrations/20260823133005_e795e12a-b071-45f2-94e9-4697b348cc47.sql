insert into public.sec_role_permissions (role_id, permission_id)
select r.id, p.id
from public.sec_roles r
join public.sec_permissions p on p.key in ('record_camels_assessment', 'initiate_supervisory_action')
join public.sec_modules m on m.id = p.module_id and m.key = 'prudential_supervision'
where r.key = 'prudential_analyst'
on conflict do nothing;