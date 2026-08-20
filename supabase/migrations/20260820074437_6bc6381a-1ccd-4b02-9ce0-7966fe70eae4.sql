-- Wave A — Part 2: entity membership model
CREATE TABLE IF NOT EXISTS public.entity_membership_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_primary_representative boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entity_membership_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_role_id uuid NOT NULL REFERENCES public.entity_membership_roles(id) ON DELETE CASCADE,
  capability text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_role_id, capability),
  CONSTRAINT entity_membership_capability_vocab CHECK (
    capability IN ('view_status','submit','upload_documents','respond_rfi','pay','manage_users')
  )
);

CREATE TABLE IF NOT EXISTS public.entity_user_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  membership_role_id uuid NOT NULL REFERENCES public.entity_membership_roles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'REQUESTED',
  effective_from timestamptz,
  effective_to timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  verified_at timestamptz,
  verified_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  authority_evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_user_memberships_status_chk CHECK (
    status IN ('REQUESTED','PENDING_VERIFICATION','APPROVED','REJECTED','REVOKED','EXPIRED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_user_memberships_active_uniq
  ON public.entity_user_memberships (user_id, entity_id, membership_role_id)
  WHERE status IN ('REQUESTED','PENDING_VERIFICATION','APPROVED');
CREATE INDEX IF NOT EXISTS entity_user_memberships_entity_idx ON public.entity_user_memberships (entity_id, status);
CREATE INDEX IF NOT EXISTS entity_user_memberships_user_idx ON public.entity_user_memberships (user_id, status);

GRANT SELECT ON public.entity_membership_roles TO authenticated, anon;
GRANT SELECT ON public.entity_membership_role_permissions TO authenticated;
GRANT SELECT ON public.entity_user_memberships TO authenticated;
GRANT ALL ON public.entity_membership_roles TO service_role;
GRANT ALL ON public.entity_membership_role_permissions TO service_role;
GRANT ALL ON public.entity_user_memberships TO service_role;

ALTER TABLE public.entity_membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_membership_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_user_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emr_read ON public.entity_membership_roles;
CREATE POLICY emr_read ON public.entity_membership_roles
  FOR SELECT TO authenticated, anon USING (is_active);

DROP POLICY IF EXISTS emrp_read ON public.entity_membership_role_permissions;
CREATE POLICY emrp_read ON public.entity_membership_role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eum_read_own_or_internal ON public.entity_user_memberships;
CREATE POLICY eum_read_own_or_internal ON public.entity_user_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.sec_has_permission(auth.uid(), 'entity_membership', 'view')
  );

DROP POLICY IF EXISTS eum_manage ON public.entity_user_memberships;
CREATE POLICY eum_manage ON public.entity_user_memberships
  FOR ALL TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'entity_membership', 'manage'))
  WITH CHECK (public.sec_has_permission(auth.uid(), 'entity_membership', 'manage'));

CREATE OR REPLACE FUNCTION public.entity_membership_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS eum_touch ON public.entity_user_memberships;
CREATE TRIGGER eum_touch BEFORE UPDATE ON public.entity_user_memberships
  FOR EACH ROW EXECUTE FUNCTION public.entity_membership_touch();

-- System membership roles ------------------------------------------------
INSERT INTO public.entity_membership_roles (key, label, description, is_primary_representative, sort_order)
VALUES
  ('PRIMARY_REPRESENTATIVE','Primary Representative','Principal point of contact; may manage other entity users.', true, 10),
  ('AUTHORIZED_REPRESENTATIVE','Authorized Representative','May act for the entity across submissions and correspondence.', false, 20),
  ('FILING_USER','Filing User','May prepare and submit filings for the entity.', false, 30),
  ('VIEWER','Viewer','Read-only visibility of the entity''s regulatory record.', false, 40)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description,
  is_primary_representative = EXCLUDED.is_primary_representative, updated_at = now();

INSERT INTO public.entity_membership_role_permissions (membership_role_id, capability)
SELECT r.id, c.capability
FROM (VALUES
  ('PRIMARY_REPRESENTATIVE','view_status'),('PRIMARY_REPRESENTATIVE','submit'),
  ('PRIMARY_REPRESENTATIVE','upload_documents'),('PRIMARY_REPRESENTATIVE','respond_rfi'),
  ('PRIMARY_REPRESENTATIVE','pay'),('PRIMARY_REPRESENTATIVE','manage_users'),
  ('AUTHORIZED_REPRESENTATIVE','view_status'),('AUTHORIZED_REPRESENTATIVE','submit'),
  ('AUTHORIZED_REPRESENTATIVE','upload_documents'),('AUTHORIZED_REPRESENTATIVE','respond_rfi'),
  ('AUTHORIZED_REPRESENTATIVE','pay'),
  ('FILING_USER','view_status'),('FILING_USER','submit'),
  ('FILING_USER','upload_documents'),('FILING_USER','respond_rfi'),
  ('VIEWER','view_status')
) AS c(role_key, capability)
JOIN public.entity_membership_roles r ON r.key = c.role_key
ON CONFLICT DO NOTHING;

-- Governed membership lifecycle -----------------------------------------
CREATE OR REPLACE FUNCTION public.entity_membership_request(
  _entity_id uuid,
  _membership_role_key text,
  _authority_evidence_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_role uuid; v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_role FROM public.entity_membership_roles WHERE key = _membership_role_key AND is_active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Unknown membership role %', _membership_role_key USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'Unknown entity %', _entity_id USING ERRCODE='23503';
  END IF;

  INSERT INTO public.entity_user_memberships (user_id, entity_id, membership_role_id, status, requested_by, requested_at)
  VALUES (uid, _entity_id, v_role, 'PENDING_VERIFICATION', uid, now())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.entity_user_memberships
    WHERE user_id = uid AND entity_id = _entity_id AND membership_role_id = v_role
      AND status IN ('REQUESTED','PENDING_VERIFICATION','APPROVED');
  ELSE
    UPDATE public.entity_user_memberships
      SET authority_evidence_reference = _authority_evidence_reference WHERE id = v_id;
    PERFORM public.create_audit_log(uid, 'entity.membership.requested', 'entity_user_membership', v_id::text,
      NULL, jsonb_build_object('entity_id', _entity_id, 'membership_role', _membership_role_key), '{}'::jsonb);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.entity_membership_verify(_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'verify') THEN
    RAISE EXCEPTION 'entity_membership.verify required' USING ERRCODE='42501';
  END IF;
  UPDATE public.entity_user_memberships
     SET verified_at = now(), verified_by = uid, status = 'PENDING_VERIFICATION'
   WHERE id = _id AND status IN ('REQUESTED','PENDING_VERIFICATION');
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership not open for verification' USING ERRCODE='22023'; END IF;
  PERFORM public.create_audit_log(uid, 'entity.identity.verified', 'entity_user_membership', _id::text,
    NULL, jsonb_build_object('notes', _notes), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.entity_membership_approve(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_row public.entity_user_memberships;
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'approve') THEN
    RAISE EXCEPTION 'entity_membership.approve required' USING ERRCODE='42501';
  END IF;
  UPDATE public.entity_user_memberships
     SET status = 'APPROVED', approved_at = now(), approved_by = uid,
         effective_from = COALESCE(effective_from, now())
   WHERE id = _id AND status IN ('REQUESTED','PENDING_VERIFICATION')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Membership not pending approval' USING ERRCODE='22023'; END IF;
  PERFORM public.create_audit_log(uid, 'entity.membership.approved', 'entity_user_membership', _id::text,
    NULL, jsonb_build_object('entity_id', v_row.entity_id, 'user_id', v_row.user_id), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.entity_membership_reject(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'approve') THEN
    RAISE EXCEPTION 'entity_membership.approve required' USING ERRCODE='42501';
  END IF;
  UPDATE public.entity_user_memberships
     SET status='REJECTED', rejected_at = now(), rejected_by = uid, revocation_reason = _reason
   WHERE id = _id AND status IN ('REQUESTED','PENDING_VERIFICATION');
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership not pending' USING ERRCODE='22023'; END IF;
  PERFORM public.create_audit_log(uid, 'entity.membership.rejected', 'entity_user_membership', _id::text,
    NULL, jsonb_build_object('reason', _reason), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.entity_membership_revoke(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'revoke') THEN
    RAISE EXCEPTION 'entity_membership.revoke required' USING ERRCODE='42501';
  END IF;
  UPDATE public.entity_user_memberships
     SET status='REVOKED', revoked_at = now(), revoked_by = uid,
         revocation_reason = _reason, effective_to = now()
   WHERE id = _id AND status = 'APPROVED';
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership is not approved' USING ERRCODE='22023'; END IF;
  PERFORM public.create_audit_log(uid, 'entity.membership.revoked', 'entity_user_membership', _id::text,
    NULL, jsonb_build_object('reason', _reason), '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.entity_membership_request(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_membership_verify(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_membership_approve(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_membership_reject(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_membership_revoke(uuid, text) FROM anon;

-- Effective memberships for the canonical context ------------------------
CREATE OR REPLACE FUNCTION public.sec_user_memberships(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity_id', m.entity_id,
    'entity_name', l.name,
    'membership_role', r.key,
    'membership_role_label', r.label,
    'is_primary_rep', r.is_primary_representative,
    'effective_from', m.effective_from,
    'capabilities', COALESCE((
      SELECT jsonb_agg(p.capability ORDER BY p.capability)
      FROM public.entity_membership_role_permissions p
      WHERE p.membership_role_id = r.id
    ), '[]'::jsonb)
  ) ORDER BY l.name), '[]'::jsonb)
  FROM public.entity_user_memberships m
  JOIN public.entity_membership_roles r ON r.id = m.membership_role_id
  JOIN public.licensees l ON l.id = m.entity_id
  WHERE m.user_id = _user_id
    AND m.status = 'APPROVED'
    AND (m.effective_from IS NULL OR m.effective_from <= now())
    AND (m.effective_to IS NULL OR m.effective_to > now());
$$;

REVOKE EXECUTE ON FUNCTION public.sec_user_memberships(uuid) FROM anon, authenticated;

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
    'memberships', public.sec_user_memberships(uid),
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