-- Batch 11: fit_and_proper edit/configure, fit_and_proper_committee create/edit,
-- fit_and_proper_screening create/edit, correspondence_management approve gated
-- via authorizedAction / enforce_action RPC.
begin;
select plan(7);
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper' and name='edit'), 'fit_and_proper.edit is known');
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper' and name='configure'), 'fit_and_proper.configure is known');
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper_committee' and name='create'), 'fit_and_proper_committee.create is known');
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper_committee' and name='edit'), 'fit_and_proper_committee.edit is known');
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper_screening' and name='create'), 'fit_and_proper_screening.create is known');
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper_screening' and name='edit'), 'fit_and_proper_screening.edit is known');
select ok(exists(select 1 from public.role_permissions_catalog where module='correspondence_management' and name='approve'), 'correspondence_management.approve is known');
select * from finish();
rollback;
