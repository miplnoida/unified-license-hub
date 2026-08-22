update sec_navigation_items n
set show_in_sidebar = true, updated_at = now()
where n.is_active
  and n.parent_id = (select id from sec_navigation_items where key = 'nav_lic_fitproper')
  and coalesce(n.show_in_sidebar, true) = false;

do $$
declare
  v_parent uuid;
  v_route uuid;
begin
  select id into v_parent from sec_navigation_items where key = 'grp_nav_returns';
  select id into v_route from sec_routes where path_pattern = '/entity/returns/dashboard';
  if v_route is null then
    insert into sec_routes (key, path_pattern, match_type, audience, is_protected, is_active, priority)
    values ('entity_returns_dashboard', '/entity/returns/dashboard', 'exact', 'external', true, true, 100)
    returning id into v_route;
  end if;
  insert into sec_navigation_items (key, parent_id, label, item_type, route_id, icon_key, sort_order, audience, is_active, show_in_sidebar, show_in_search, admin_only)
  values ('nav_returns_entity_dashboard', v_parent, 'Reporting Dashboard', 'link', v_route, 'LayoutDashboard', 5, 'external', true, true, true, false)
  on conflict (key) do update set parent_id = excluded.parent_id, route_id = excluded.route_id,
    label = excluded.label, icon_key = excluded.icon_key, sort_order = excluded.sort_order,
    audience = excluded.audience, is_active = true, show_in_sidebar = true, updated_at = now();
end;
$$;