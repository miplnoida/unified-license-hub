-- EPIC 4 / W6 — authorization closure (executive read authority, navigation parity, backend guard parity)

do $$
declare v_perm uuid; v_tpl uuid; v_role uuid;
begin
  select p.id into v_perm from public.sec_permissions p
    join public.sec_modules m on m.id = p.module_id
   where m.key = 'supervisory_spine' and p.key = 'view';
  if v_perm is null then raise exception 'supervisory_spine.view missing'; end if;

  select id into v_tpl from public.sec_role_templates where key = 'executive_management';
  if v_tpl is not null then
    insert into public.sec_role_template_permissions (template_id, permission_id)
    select v_tpl, v_perm
    where not exists (select 1 from public.sec_role_template_permissions
                       where template_id = v_tpl and permission_id = v_perm);
  end if;

  select id into v_role from public.sec_roles where key = 'executive_management';
  if v_role is not null then
    insert into public.sec_role_permissions (role_id, permission_id)
    select v_role, v_perm
    where not exists (select 1 from public.sec_role_permissions
                       where role_id = v_role and permission_id = v_perm);
  end if;

  update public.sec_navigation_items
     set required_permission_id = v_perm
   where key in ('nav_sup_portfolio', 'nav_supervision_team_performance');

  update public.sec_routes
     set required_permission_id = v_perm
   where path_pattern in ('/supervision/portfolio', '/supervision/team-performance');
end $$;

-- Re-guard public.sup_team_performance in place: the enterprise workload read
-- model must require supervisory authority, not generic reporting access.
do $$
declare def text; old_guard text; new_guard text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sup_team_performance';

  old_guard := 'allowed boolean := public.is_super_admin(u)
    or public.has_permission(u,''admin_dashboard'',''view'')
    or public.has_permission(u,''report_management'',''view'')
    or public.has_permission(u,''employee_management'',''view'');';

  new_guard := 'allowed boolean := public.is_super_admin(u)
    or public.has_permission(u,''supervisory_spine'',''view'')
    or public.has_permission(u,''prudential_supervision'',''view'')
    or public.has_permission(u,''aml_supervision'',''view'')
    or public.has_permission(u,''market_conduct'',''view'')
    or public.has_permission(u,''fit_and_proper'',''view'');';

  if position(old_guard in def) = 0 then
    raise exception 'sup_team_performance guard text not found — aborting';
  end if;

  execute replace(def, old_guard, new_guard);
end $$;