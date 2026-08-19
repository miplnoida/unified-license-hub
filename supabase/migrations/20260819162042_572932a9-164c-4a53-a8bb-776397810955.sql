CREATE OR REPLACE FUNCTION public.sec_get_user_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_bypass boolean;
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sec_user_roles ur
    JOIN public.sec_roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid AND ur.status = 'active' AND r.is_break_glass
  ) INTO is_bypass;

  SELECT jsonb_build_object(
    'authenticated', true,
    'user_id', uid,
    'is_bypass', is_bypass,
    'roles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'key', r.key, 'name', r.name,
        'role_type', r.role_type, 'dashboard_tier', r.dashboard_tier)
        ORDER BY r.name)
      FROM public.sec_user_roles ur
      JOIN public.sec_roles r ON r.id = ur.role_id AND r.status = 'active'
      WHERE ur.user_id = uid AND ur.status = 'active'
    ), '[]'::jsonb),
    'permissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('module', up.module_key, 'action', up.action_key))
      FROM public.sec_user_permissions(uid) up
    ), '[]'::jsonb),
    'scopes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'module', m.key,
        'scope', st.key,
        'values', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('kind', v.value_kind, 'id', v.value_id))
          FROM public.sec_role_scope_values v WHERE v.role_scope_id = rs.id
        ), '[]'::jsonb)))
      FROM public.sec_user_roles ur
      JOIN public.sec_role_scopes rs ON rs.role_id = ur.role_id
      JOIN public.sec_modules m ON m.id = rs.module_id
      JOIN public.sec_scope_types st ON st.id = rs.scope_type_id
      WHERE ur.user_id = uid AND ur.status = 'active'
    ), '[]'::jsonb),
    'routes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', rt.key, 'path', rt.path_pattern, 'match_type', rt.match_type,
        'audience', rt.audience, 'is_protected', rt.is_protected,
        'module', m.key, 'action', p.key, 'priority', rt.priority)
        ORDER BY rt.priority)
      FROM public.sec_routes rt
      LEFT JOIN public.sec_permissions p ON p.id = rt.required_permission_id
      LEFT JOIN public.sec_modules m ON m.id = p.module_id
      WHERE rt.is_active
    ), '[]'::jsonb),
    'navigation', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', n.key, 'parent_key', pn.key, 'label', n.label,
        'item_type', n.item_type,
        'href', COALESCE(n.href_override, rt.path_pattern),
        'icon', n.icon_key, 'sort_order', n.sort_order,
        'audience', n.audience, 'admin_only', n.admin_only,
        'module', m.key, 'action', p.key,
        'show_in_sidebar', n.show_in_sidebar,
        'show_in_search', n.show_in_search,
        'keywords', COALESCE(to_jsonb(n.keywords), '[]'::jsonb),
        'allowed', (
          n.required_permission_id IS NULL
          OR is_bypass
          OR public.sec_has_permission(uid, m.key, p.key)
        ))
        ORDER BY n.sort_order)
      FROM public.sec_navigation_items n
      LEFT JOIN public.sec_navigation_items pn ON pn.id = n.parent_id
      LEFT JOIN public.sec_routes rt ON rt.id = n.route_id
      LEFT JOIN public.sec_permissions p ON p.id = n.required_permission_id
      LEFT JOIN public.sec_modules m ON m.id = p.module_id
      WHERE n.is_active AND (n.show_in_sidebar OR n.show_in_search)
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;