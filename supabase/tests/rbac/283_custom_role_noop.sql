-- Custom Role regression: metadata-only saves preserve permission rows.
-- Reproduces the "open, tweak description, save" flow and asserts the
-- role_permissions set for the target role is byte-identical before and
-- after when permission_ids is unchanged.
begin;
select plan(4);

-- Seed a super_admin user so rbac_save_role passes the authz gate.
insert into public.user_roles(user_id, role)
  values ('00000000-0000-0000-0000-00000000c001', 'super_admin')
  on conflict do nothing;

-- Two permissions on returns_management (view + edit; edit requires view).
insert into public.permissions (module, name)
  values ('returns_management','view'),('returns_management','edit')
  on conflict (module, name) do nothing;

do $$
declare
  v_uid uuid := '00000000-0000-0000-0000-00000000c001';
  v_role_id uuid;
  v_view uuid;
  v_edit uuid;
  v_perm_ids jsonb;
  v_before uuid[];
  v_after_meta uuid[];
  v_after_desc uuid[];
  v_after_status uuid[];
begin
  select id into v_view from public.permissions where module='returns_management' and name='view';
  select id into v_edit from public.permissions where module='returns_management' and name='edit';
  v_perm_ids := jsonb_build_array(v_view::text, v_edit::text);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role','authenticated')::text, true);

  -- Create role with 2 permissions.
  v_role_id := (public.rbac_save_role(jsonb_build_object(
    'name','pgtap_custom_role_regression',
    'description','initial',
    'permission_ids', v_perm_ids,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  )) ->> 'id')::uuid;

  select array_agg(permission_id order by permission_id) into v_before
  from public.role_permissions where role_id = v_role_id;

  perform ok(array_length(v_before,1) = 2, 'baseline: role has 2 permission rows');

  -- Save with only description changed, same permission_ids.
  perform public.rbac_save_role(jsonb_build_object(
    'id', v_role_id::text,
    'name','pgtap_custom_role_regression',
    'description','edited description only',
    'permission_ids', v_perm_ids,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  ));
  select array_agg(permission_id order by permission_id) into v_after_desc
  from public.role_permissions where role_id = v_role_id;
  perform ok(v_after_desc = v_before, 'description-only save preserves permission rows');

  -- Save with only status changed.
  perform public.rbac_save_role(jsonb_build_object(
    'id', v_role_id::text,
    'name','pgtap_custom_role_regression',
    'description','edited description only',
    'status','inactive',
    'permission_ids', v_perm_ids,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  ));
  select array_agg(permission_id order by permission_id) into v_after_status
  from public.role_permissions where role_id = v_role_id;
  perform ok(v_after_status = v_before, 'status-only save preserves permission rows');

  -- Save with only name/metadata changed.
  perform public.rbac_save_role(jsonb_build_object(
    'id', v_role_id::text,
    'name','pgtap_custom_role_regression_renamed',
    'description','edited description only',
    'status','inactive',
    'permission_ids', v_perm_ids,
    'scope_config', jsonb_build_object('returns_management', jsonb_build_object('scope','all'))
  ));
  select array_agg(permission_id order by permission_id) into v_after_meta
  from public.role_permissions where role_id = v_role_id;
  perform ok(v_after_meta = v_before, 'name/metadata-only save preserves permission rows');
end$$;

select * from finish();
rollback;
