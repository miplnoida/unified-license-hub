-- Grant read-only entity population visibility to Inspection Supervisor (governed, no mutation)
insert into public.sec_role_permissions (role_id, permission_id)
select r.id, p.id
from public.sec_roles r
join public.sec_permissions p on p.key = 'view'
join public.sec_modules m on m.id = p.module_id and m.key = 'licensee_management'
where r.key = 'inspection_supervisor'
on conflict do nothing;

insert into public.sec_role_template_permissions (template_id, permission_id)
select t.id, p.id
from public.sec_role_templates t
join public.sec_permissions p on p.key = 'view'
join public.sec_modules m on m.id = p.module_id and m.key = 'licensee_management'
where t.key = 'inspection_supervisor'
on conflict do nothing;