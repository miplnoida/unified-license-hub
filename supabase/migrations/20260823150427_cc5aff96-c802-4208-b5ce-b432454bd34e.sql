-- GAP-P15-001 (P1): the standard "System Administrator" role mirrored to the
-- legacy super_admin system role, which granted a blanket business bypass.
UPDATE public.sec_roles SET system_role = 'admin', updated_at = now()
WHERE key = 'system_administrator' AND system_role = 'super_admin';

-- Remove the mirrored blanket bypass from every principal that is not a
-- canonical break-glass holder.
DELETE FROM public.user_roles ur
WHERE ur.role = 'super_admin'::app_role
  AND NOT EXISTS (
    SELECT 1 FROM public.sec_user_roles sur
    JOIN public.sec_roles r ON r.id = sur.role_id
    WHERE sur.user_id = ur.user_id AND sur.status = 'active' AND r.is_break_glass
  );

-- Administration authority must be explicit, not inherited from a bypass.
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.sec_roles r
JOIN public.sec_permissions p ON TRUE
JOIN public.sec_modules m ON m.id = p.module_id
WHERE r.key = 'system_administrator' AND m.key = 'form_management' AND p.key IN ('publish','retire')
ON CONFLICT DO NOTHING;

-- GAP-P15-002 (P2): compliance audit evidence was unreachable through the API
-- because no privileges were granted; the row policy already governs access.
GRANT SELECT ON public.compliance_audit_logs TO authenticated;
GRANT ALL ON public.compliance_audit_logs TO service_role;

-- GAP-P15-003 (P1): governed role assignment failed whenever the assigned role
-- had no legacy counterpart, because the legacy profile mirror is FK-bound.
CREATE OR REPLACE FUNCTION public.sec_assign_user_roles(p_user_id uuid, p_role_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_ids uuid[] := COALESCE(p_role_ids, '{}'::uuid[]);
  v_before jsonb;
  v_after jsonb;
  v_primary uuid;
  v_system_roles text[];
  v_bad uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid, 'user_management', 'edit')
          OR public.has_permission(uid, 'role_management', 'assign')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023'; END IF;

  SELECT x INTO v_bad FROM unnest(v_ids) AS t(x)
  WHERE NOT EXISTS (SELECT 1 FROM public.sec_roles r WHERE r.id = t.x AND r.status = 'active')
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_or_inactive_role: %', v_bad USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sec_roles r
    WHERE r.is_break_glass
      AND ((r.id = ANY(v_ids)) <> EXISTS (
            SELECT 1 FROM public.sec_user_roles ur
            WHERE ur.user_id = p_user_id AND ur.role_id = r.id AND ur.status = 'active'))
  ) AND NOT public.is_super_admin(uid) THEN
    RAISE EXCEPTION 'break_glass_role_protected' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sec_user_roles ur
    JOIN public.sec_roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND ur.status = 'active' AND r.is_break_glass
      AND NOT (r.id = ANY(v_ids))
      AND (SELECT count(*) FROM public.sec_user_roles u2
           JOIN public.sec_roles r2 ON r2.id = u2.role_id
           WHERE r2.is_break_glass AND u2.status = 'active') <= 1
  ) THEN
    RAISE EXCEPTION 'last_break_glass_admin_protected' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(role_id), '[]'::jsonb) INTO v_before
  FROM public.sec_user_roles WHERE user_id = p_user_id AND status = 'active';

  DELETE FROM public.sec_user_roles
  WHERE user_id = p_user_id AND NOT (role_id = ANY(v_ids));

  INSERT INTO public.sec_user_roles (user_id, role_id, status, assigned_by)
  SELECT p_user_id, x, 'active', uid FROM unnest(v_ids) AS t(x)
  ON CONFLICT (user_id, role_id)
  DO UPDATE SET status = 'active', assigned_by = uid, updated_at = now();

  DELETE FROM public.user_dynamic_roles
  WHERE user_id = p_user_id AND NOT (role_id = ANY(v_ids));
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  SELECT p_user_id, x FROM unnest(v_ids) AS t(x)
  WHERE EXISTS (SELECT 1 FROM public.roles r WHERE r.id = t.x)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- Only mirror the primary role onto the legacy profile when a legacy
  -- counterpart exists; canonical-only roles must not break assignment.
  SELECT x INTO v_primary FROM unnest(v_ids) AS t(x)
  WHERE EXISTS (SELECT 1 FROM public.roles r WHERE r.id = t.x)
  LIMIT 1;
  IF v_primary IS NOT NULL THEN
    UPDATE public.profiles SET role_id = v_primary, updated_at = now() WHERE id = p_user_id;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT r.system_role FROM public.sec_roles r
    WHERE r.id = ANY(v_ids) AND COALESCE(r.system_role, '') <> ''
      AND r.system_role <> 'custom'
  ) INTO v_system_roles;

  IF array_length(v_system_roles, 1) > 0 THEN
    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND NOT (role::text = ANY(v_system_roles));
    INSERT INTO public.user_roles (user_id, role)
    SELECT p_user_id, x::app_role FROM unnest(v_system_roles) AS t(x)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user_id;
  END IF;

  SELECT COALESCE(jsonb_agg(role_id), '[]'::jsonb) INTO v_after
  FROM public.sec_user_roles WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (uid, 'security.assign_user_roles', 'user', p_user_id::text,
          jsonb_build_object('role_ids', v_before), jsonb_build_object('role_ids', v_after));

  RETURN jsonb_build_object('user_id', p_user_id, 'role_ids', v_after);
END;
$function$;