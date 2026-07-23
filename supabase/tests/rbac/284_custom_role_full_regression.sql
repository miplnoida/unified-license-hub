-- Extended custom-role preservation: covers no-op, scope-only, permission
-- reordering, and re-classification. Reinforces 283_custom_role_noop.sql
-- with the additional cases in the closure brief.
begin;
select plan(8);

insert into public.user_roles(user_id, role)
  values ('00000000-0000-0000-0000-00000000c002', 'super_admin')
  on conflict do nothing;

insert into public.permissions(module, name) values
  ('returns_management','view'),
  ('returns_management','edit'),
  ('returns_management','review')
  on conflict (module, name) do nothing;

do $$
declare
  _uid uuid := '00000000-0000-0000-0000-00000000c002';
  _role_id uuid;
  _view uuid; _edit uuid; _rev uuid;
  _perms jsonb;
  _before uuid[]; _after uuid[];
begin
  select id into _view from public.permissions where module='returns_management' and name='view';
  select id into _edit from public.permissions where module='returns_management' and name='edit';
  select id into _rev  from public.permissions where module='returns_management' and name='review';
  _perms := jsonb_build_array(_view::text, _edit::text, _rev::text);

  perform set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true);

  _role_id := (public.rbac_save_role(jsonb_build_object(
    'name','pgtap_custom_role_full',
    'description','baseline',
    'permission_ids', _perms,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  )) ->> 'id')::uuid;

  select array_agg(permission_id order by permission_id) into _before
  from public.role_permissions where role_id = _role_id;

  perform ok(array_length(_before,1) = 3, 'baseline: 3 permissions');

  -- No-op save (identical payload)
  perform public.rbac_save_role(jsonb_build_object(
    'id', _role_id::text,
    'name','pgtap_custom_role_full',
    'description','baseline',
    'permission_ids', _perms,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  ));
  select array_agg(permission_id order by permission_id) into _after
  from public.role_permissions where role_id = _role_id;
  perform ok(_after = _before, 'no-op save preserves permissions');

  -- No-op save with a view + dependent set must not delete `view` first and
  -- trip the view-retention trigger.
  perform lives_ok(
    format(
      'select public.rbac_save_role(%L::jsonb)',
      jsonb_build_object(
        'id', _role_id::text,
        'name','pgtap_custom_role_full',
        'description','baseline',
        'permission_ids', _perms,
        'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
      )::text
    ),
    'dependency-safe save: no-op view + dependent set succeeds'
  );

  -- Reordered permission_ids
  perform public.rbac_save_role(jsonb_build_object(
    'id', _role_id::text,
    'name','pgtap_custom_role_full',
    'permission_ids', jsonb_build_array(_rev::text, _view::text, _edit::text),
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  ));
  select array_agg(permission_id order by permission_id) into _after
  from public.role_permissions where role_id = _role_id;
  perform ok(_after = _before, 'reordered permission_ids preserve set');

  perform throws_ok(
    format(
      'select public.rbac_save_role(%L::jsonb)',
      jsonb_build_object(
        'id', _role_id::text,
        'name','pgtap_custom_role_full',
        'permission_ids', jsonb_build_array(_edit::text, _rev::text),
        'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
      )::text
    ),
    NULL,
    NULL,
    'dependency invariant: removing view while keeping dependents is rejected'
  );

  -- Scope-only change (permission_ids identical)
  perform public.rbac_save_role(jsonb_build_object(
    'id', _role_id::text,
    'name','pgtap_custom_role_full',
    'permission_ids', _perms,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','assigned'))
  ));
  select array_agg(permission_id order by permission_id) into _after
  from public.role_permissions where role_id = _role_id;
  perform ok(_after = _before, 'scope-only save preserves permission rows');

  -- Description + status + scope changed together (metadata-only)
  perform public.rbac_save_role(jsonb_build_object(
    'id', _role_id::text,
    'name','pgtap_custom_role_full',
    'description','revised',
    'status','inactive',
    'permission_ids', _perms,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','own'))
  ));
  select array_agg(permission_id order by permission_id) into _after
  from public.role_permissions where role_id = _role_id;
  perform ok(_after = _before, 'combined metadata-only save preserves permission rows');

  -- Only intentional permission edit changes role_permissions
  perform public.rbac_save_role(jsonb_build_object(
    'id', _role_id::text,
    'name','pgtap_custom_role_full',
    'permission_ids', jsonb_build_array(_view::text, _edit::text), -- drop review
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  ));
  select array_agg(permission_id order by permission_id) into _after
  from public.role_permissions where role_id = _role_id;
  perform ok(_after <> _before and array_length(_after,1) = 2,
    'intentional permission drop reflected');
end$$;

select * from finish();
rollback;
