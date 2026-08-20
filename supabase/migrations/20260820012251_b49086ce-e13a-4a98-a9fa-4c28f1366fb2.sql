-- =====================================================================
-- PHASE A: reconciliation backfill (additive; nothing is deleted)
-- =====================================================================
INSERT INTO public.sec_user_roles (user_id, role_id, status, assigned_by)
SELECT DISTINCT udr.user_id, udr.role_id, 'active', NULL::uuid
FROM public.user_dynamic_roles udr
JOIN public.sec_roles r ON r.id = udr.role_id
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.sec_user_roles (user_id, role_id, status, assigned_by)
SELECT DISTINCT p.id, p.role_id, 'active', NULL::uuid
FROM public.profiles p
JOIN public.sec_roles r ON r.id = p.role_id
WHERE p.role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- =====================================================================
-- PHASE B: reconciliation report view (legacy vs canonical)
-- =====================================================================
CREATE OR REPLACE VIEW public.sec_assignment_parity AS
SELECT
  COALESCE(l.user_id, s.user_id) AS user_id,
  COALESCE(l.role_id, s.role_id) AS role_id,
  r.name  AS role_name,
  (l.user_id IS NOT NULL) AS in_legacy,
  (s.user_id IS NOT NULL) AS in_canonical,
  CASE
    WHEN l.user_id IS NOT NULL AND s.user_id IS NOT NULL THEN 'match'
    WHEN l.user_id IS NULL THEN 'canonical_only'
    ELSE 'legacy_only'
  END AS parity
FROM (SELECT DISTINCT user_id, role_id FROM public.user_dynamic_roles) l
FULL OUTER JOIN (SELECT DISTINCT user_id, role_id FROM public.sec_user_roles WHERE status = 'active') s
  ON s.user_id = l.user_id AND s.role_id = l.role_id
LEFT JOIN public.sec_roles r ON r.id = COALESCE(l.role_id, s.role_id);

GRANT SELECT ON public.sec_assignment_parity TO authenticated;
GRANT ALL ON public.sec_assignment_parity TO service_role;

CREATE OR REPLACE VIEW public.sec_permission_parity AS
WITH legacy AS (
  SELECT DISTINCT r.id AS role_id,
         lower(regexp_replace(p.module, '\s+', '_', 'g')) AS module_key,
         lower(p.name) AS action_key
  FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
), canonical AS (
  SELECT DISTINCT r.id AS role_id, m.key AS module_key, p.key AS action_key
  FROM public.sec_roles r
  JOIN public.sec_role_permissions rp ON rp.role_id = r.id
  JOIN public.sec_permissions p ON p.id = rp.permission_id
  JOIN public.sec_modules m ON m.id = p.module_id
)
SELECT
  COALESCE(l.role_id, c.role_id) AS role_id,
  COALESCE(l.module_key, c.module_key) AS module_key,
  COALESCE(l.action_key, c.action_key) AS action_key,
  CASE
    WHEN l.role_id IS NOT NULL AND c.role_id IS NOT NULL THEN 'match'
    WHEN l.role_id IS NULL THEN 'canonical_only'
    ELSE 'legacy_only'
  END AS parity
FROM legacy l
FULL OUTER JOIN canonical c
  ON c.role_id = l.role_id AND c.module_key = l.module_key AND c.action_key = l.action_key;

GRANT SELECT ON public.sec_permission_parity TO authenticated;
GRANT ALL ON public.sec_permission_parity TO service_role;

-- =====================================================================
-- PHASE C: cutover — has_permission / has_portal_capability read sec_*
-- Signatures unchanged, so every RLS policy, RPC, storage policy and
-- edge function keeps working untouched.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND (public.is_super_admin(_user_id) OR public.sec_has_permission(_user_id, _module, _action));
$$;

CREATE OR REPLACE FUNCTION public.has_portal_capability(
  _user_id uuid, _entity_id uuid, _area portal_area, _capability text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text;
  v_action text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;
  IF public.is_internal_staff_user(_user_id) OR public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  v_module := CASE _area
    WHEN 'licensing'        THEN 'licensing'
    WHEN 'returns'          THEN 'returns_management'
    WHEN 'complaints'       THEN 'complaint_management'
    WHEN 'fp_declarations'  THEN 'fit_and_proper'
  END;

  v_action := CASE _capability
    WHEN 'can_submit'                  THEN 'submit'
    WHEN 'can_submit_returns'          THEN 'submit'
    WHEN 'can_submit_complaints'       THEN 'submit'
    WHEN 'can_submit_fp_declarations'  THEN 'submit'
    WHEN 'can_upload_documents'        THEN 'upload_documents'
    WHEN 'can_view_status'             THEN 'view_status'
    WHEN 'can_respond_rfi'             THEN 'respond_rfi'
    ELSE _capability
  END;

  RETURN public.sec_has_permission(_user_id, v_module, v_action);
END;
$$;

-- =====================================================================
-- PHASE D: canonical write RPCs (transactional, audited, mirrored)
-- =====================================================================

-- Assign the exact set of roles a user should hold.
CREATE OR REPLACE FUNCTION public.sec_assign_user_roles(
  p_user_id uuid,
  p_role_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Every submitted role must exist and be active.
  SELECT x INTO v_bad FROM unnest(v_ids) AS t(x)
  WHERE NOT EXISTS (SELECT 1 FROM public.sec_roles r WHERE r.id = t.x AND r.status = 'active')
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_or_inactive_role: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- Break-glass protection: only a break-glass holder may grant or revoke it,
  -- and the last break-glass assignment can never be removed.
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

  -- Compatibility mirrors (legacy tables kept in sync until they are retired).
  DELETE FROM public.user_dynamic_roles
  WHERE user_id = p_user_id AND NOT (role_id = ANY(v_ids));
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  SELECT p_user_id, x FROM unnest(v_ids) AS t(x)
  WHERE EXISTS (SELECT 1 FROM public.roles r WHERE r.id = t.x)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  v_primary := v_ids[1];
  UPDATE public.profiles SET role_id = v_primary, updated_at = now() WHERE id = p_user_id;

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
  END IF;

  SELECT COALESCE(jsonb_agg(role_id), '[]'::jsonb) INTO v_after
  FROM public.sec_user_roles WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (uid, 'security.assign_user_roles', 'user', p_user_id::text,
          jsonb_build_object('role_ids', v_before), jsonb_build_object('role_ids', v_after));

  RETURN jsonb_build_object('user_id', p_user_id, 'role_ids', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.sec_assign_user_roles(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sec_assign_user_roles(uuid, uuid[]) TO authenticated, service_role;

-- Save (create or update) a role canonically and mirror into legacy.
CREATE OR REPLACE FUNCTION public.sec_save_role(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_result jsonb;
  v_role_id uuid;
  v_key text;
  v_perm_ids uuid[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid, 'role_management', 'edit')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Legacy writer performs validation (scopes, permission dependencies).
  v_result := public.rbac_save_role(_payload);
  v_role_id := (v_result ->> 'id')::uuid;

  v_key := lower(regexp_replace(trim(COALESCE(_payload ->> 'name', '')), '[^a-zA-Z0-9]+', '_', 'g'));
  v_key := NULLIF(trim(both '_' from v_key), '');

  INSERT INTO public.sec_roles (id, key, name, description, role_type, role_category,
                                dashboard_tier, status, system_role, is_system, created_by)
  SELECT r.id,
         COALESCE(v_key, 'role_' || replace(r.id::text, '-', '')),
         r.name, r.description,
         COALESCE(r.role_type, 'internal'), r.role_category,
         r.dashboard_tier, COALESCE(r.status, 'active'),
         r.system_role, COALESCE(r.is_system, false), uid
  FROM public.roles r WHERE r.id = v_role_id
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    role_type = EXCLUDED.role_type,
    role_category = EXCLUDED.role_category,
    dashboard_tier = EXCLUDED.dashboard_tier,
    status = EXCLUDED.status,
    system_role = EXCLUDED.system_role,
    updated_at = now();

  -- Mirror grants: legacy permission ids are the canonical ids' twins by
  -- (module, action), so resolve through the catalogs.
  SELECT ARRAY(
    SELECT DISTINCT sp.id
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.key = lower(regexp_replace(p.module, '\s+', '_', 'g'))
    JOIN public.sec_permissions sp ON sp.module_id = m.id AND sp.key = lower(p.name)
    WHERE rp.role_id = v_role_id
  ) INTO v_perm_ids;

  DELETE FROM public.sec_role_permissions
  WHERE role_id = v_role_id AND NOT (permission_id = ANY(v_perm_ids));

  INSERT INTO public.sec_role_permissions (role_id, permission_id)
  SELECT v_role_id, x FROM unnest(v_perm_ids) AS t(x)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (uid, 'security.save_role', 'sec_role', v_role_id::text,
          jsonb_build_object('permission_count', COALESCE(array_length(v_perm_ids, 1), 0)));

  RETURN jsonb_build_object('id', v_role_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sec_save_role(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sec_save_role(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sec_delete_role(_role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid, 'role_management', 'delete')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sec_roles WHERE id = _role_id AND (is_system OR is_break_glass)) THEN
    RAISE EXCEPTION 'system_role_not_deletable' USING ERRCODE = '22023';
  END IF;

  PERFORM public.rbac_delete_role(_role_id);
  DELETE FROM public.sec_role_permissions WHERE role_id = _role_id;
  DELETE FROM public.sec_user_roles WHERE role_id = _role_id;
  DELETE FROM public.sec_roles WHERE id = _role_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id)
  VALUES (uid, 'security.delete_role', 'sec_role', _role_id::text);

  RETURN jsonb_build_object('deleted', _role_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sec_delete_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sec_delete_role(uuid) TO authenticated, service_role;