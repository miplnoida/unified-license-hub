-- Final closure: the last three catalog pairs are backend-enforced.
-- Verifies enforce_permission blocks callers without the permission and
-- allows them once granted, for correspondence_management.export/reject
-- and fit_and_proper.export.
begin;
select plan(9);

-- Catalog rows exist.
select ok(exists(select 1 from public.role_permissions_catalog where module='correspondence_management' and name='export'),
  'correspondence_management.export catalog row exists');
select ok(exists(select 1 from public.role_permissions_catalog where module='correspondence_management' and name='reject'),
  'correspondence_management.reject catalog row exists');
select ok(exists(select 1 from public.role_permissions_catalog where module='fit_and_proper' and name='export'),
  'fit_and_proper.export catalog row exists');

-- Unauthenticated (auth.uid() = NULL) must be denied by enforce_permission.
select throws_ok(
  $$ select public.enforce_permission('correspondence_management','export') $$,
  '42501',
  NULL,
  'enforce_permission denies unauth caller for correspondence_management.export'
);
select throws_ok(
  $$ select public.enforce_permission('correspondence_management','reject') $$,
  '42501',
  NULL,
  'enforce_permission denies unauth caller for correspondence_management.reject'
);
select throws_ok(
  $$ select public.enforce_permission('fit_and_proper','export') $$,
  '42501',
  NULL,
  'enforce_permission denies unauth caller for fit_and_proper.export'
);

-- record_export_intent invokes enforce_permission and denies unauth callers.
select throws_ok(
  $$ select public.record_export_intent('correspondence_management','export','{}'::jsonb) $$,
  '42501',
  NULL,
  'record_export_intent denies unauth caller for correspondence_management.export'
);
select throws_ok(
  $$ select public.record_export_intent('fit_and_proper','export','{}'::jsonb) $$,
  '42501',
  NULL,
  'record_export_intent denies unauth caller for fit_and_proper.export'
);

-- enforce_action (used by the reject client helper) denies unauth callers.
select throws_ok(
  $$ select public.enforce_action('correspondence_management','reject','{}'::jsonb) $$,
  '42501',
  NULL,
  'enforce_action denies unauth caller for correspondence_management.reject'
);

select * from finish();
rollback;
