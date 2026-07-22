-- Batch 12 sanity: catalog contains the newly enforced pairs.
begin;
select plan(7);
select ok(exists(select 1 from public.role_permissions_catalog where module='compliance_management' and name='edit'), 'compliance_management.edit known');
select ok(exists(select 1 from public.role_permissions_catalog where module='conduct_management' and name='create'), 'conduct_management.create known');
select ok(exists(select 1 from public.role_permissions_catalog where module='conduct_management' and name='export'), 'conduct_management.export known');
select ok(exists(select 1 from public.role_permissions_catalog where module='coordination' and name='edit'), 'coordination.edit known');
select ok(exists(select 1 from public.role_permissions_catalog where module='returns_management' and name='configure'), 'returns_management.configure known');
select ok(exists(select 1 from public.role_permissions_catalog where module='settings' and name='create'), 'settings.create known');
select ok(exists(select 1 from public.role_permissions_catalog where module='settings' and name='import'), 'settings.import known');
select * from finish();
rollback;
