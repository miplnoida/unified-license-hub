-- Batch 10: prudential_supervision.create/edit and market_conduct.create/edit
-- are gated by enforce_permission() via authorizedAction/enforce_action RPC.
begin;
select plan(4);

select ok(
  exists(select 1 from public.role_permissions_catalog
         where module='prudential_supervision' and name='create'),
  'prudential_supervision.create is a known permission');
select ok(
  exists(select 1 from public.role_permissions_catalog
         where module='prudential_supervision' and name='edit'),
  'prudential_supervision.edit is a known permission');
select ok(
  exists(select 1 from public.role_permissions_catalog
         where module='market_conduct' and name='create'),
  'market_conduct.create is a known permission');
select ok(
  exists(select 1 from public.role_permissions_catalog
         where module='market_conduct' and name='edit'),
  'market_conduct.edit is a known permission');

select * from finish();
rollback;
