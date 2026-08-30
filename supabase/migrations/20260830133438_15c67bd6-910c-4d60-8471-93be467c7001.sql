insert into public.sec_routes (key, path_pattern, match_type, audience, is_protected, is_system, is_active, priority)
values ('help_user_manual', '/help/user-manual', 'exact', 'any', false, true, true, 900)
on conflict (key) do update
  set path_pattern = excluded.path_pattern,
      match_type   = excluded.match_type,
      audience     = excluded.audience,
      is_protected = excluded.is_protected,
      is_active    = true,
      priority     = excluded.priority,
      updated_at   = now();

insert into public.sec_navigation_items (
  key, parent_id, label, description, item_type, route_id, href_override,
  icon_key, sort_order, audience, is_active, show_in_sidebar, show_in_search,
  keywords, is_system, admin_only
)
select
  'nav_help_user_manual',
  (select id from public.sec_navigation_items where key = 'grp_nav_home'),
  'Help & User Manual',
  'Role-aware user manual, process guidance and demo playbook.',
  'link',
  (select id from public.sec_routes where key = 'help_user_manual'),
  '/help/user-manual',
  'BookOpenCheck',
  30,
  'any',
  true, true, true,
  array['help','manual','guide','documentation','training','demo','how to'],
  true,
  false
on conflict (key) do update
  set parent_id       = excluded.parent_id,
      label           = excluded.label,
      description     = excluded.description,
      item_type       = excluded.item_type,
      route_id        = excluded.route_id,
      href_override   = excluded.href_override,
      icon_key        = excluded.icon_key,
      sort_order      = excluded.sort_order,
      audience        = excluded.audience,
      is_active       = true,
      show_in_sidebar = true,
      show_in_search  = true,
      keywords        = excluded.keywords,
      admin_only      = false,
      updated_at      = now();