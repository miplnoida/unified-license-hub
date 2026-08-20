insert into public.sec_modules (key, label, description)
values ('correspondence_management', 'Correspondence Management', 'Governed regulatory correspondence and dispatch')
on conflict (key) do nothing;

insert into public.sec_permissions (module_id, key, label, description, is_enforced, is_active)
select m.id, 'dispatch', 'Dispatch Correspondence', 'Dispatch governed correspondence to regulated entities', true, true
from public.sec_modules m where m.key = 'correspondence_management'
on conflict do nothing;

insert into public.sec_role_permissions (role_id, permission_id)
select r.id, p.id
from public.sec_roles r
join public.sec_permissions p on p.key = 'dispatch'
join public.sec_modules m on m.id = p.module_id and m.key = 'correspondence_management'
where r.key in ('licensing_officer', 'licensing_supervisor')
on conflict do nothing;