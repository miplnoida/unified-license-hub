-- Phase 6 — Sensitive privilege proofs (pgTAP).
--
-- Guarantees that has_permission does NOT implicitly grant sensitive
-- privileges when a role holds only base actions on the same module.
-- Sensitive actions must be granted explicitly through role_permissions.

BEGIN;
SELECT plan(6);

-- Fixtures ------------------------------------------------------------
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_role uuid;
  v_mod  uuid;
  v_view uuid;
  v_edit uuid;
  v_delete uuid;
  v_export uuid;
BEGIN
  -- ensure a module + actions exist
  INSERT INTO public.permission_modules (id, name, label, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), 'phase6_probe', 'Phase6 Probe', true, now(), now())
  RETURNING id INTO v_mod;

  INSERT INTO public.permission_actions (id, module_id, name, label, is_active, enforced, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_mod, 'view',   'View',   true, true, now(), now()),
    (gen_random_uuid(), v_mod, 'edit',   'Edit',   true, true, now(), now()),
    (gen_random_uuid(), v_mod, 'delete', 'Delete', true, true, now(), now()),
    (gen_random_uuid(), v_mod, 'export', 'Export', true, true, now(), now())
  RETURNING id INTO v_view;

  SELECT id INTO v_view   FROM public.permission_actions WHERE module_id=v_mod AND name='view';
  SELECT id INTO v_edit   FROM public.permission_actions WHERE module_id=v_mod AND name='edit';
  SELECT id INTO v_delete FROM public.permission_actions WHERE module_id=v_mod AND name='delete';
  SELECT id INTO v_export FROM public.permission_actions WHERE module_id=v_mod AND name='export';

  -- Role: only View + Edit (no sensitive actions)
  INSERT INTO public.roles (id, name, description, is_system, status, role_category, created_at, updated_at)
  VALUES (gen_random_uuid(), 'phase6_probe_role', 'probe', false, 'active', 'operational', now(), now())
  RETURNING id INTO v_role;

  -- Insert permissions via server-side path (bypasses dependency guard: view first)
  INSERT INTO public.role_permissions (role_id, module_id, action_id)
  VALUES (v_role, v_mod, v_view), (v_role, v_mod, v_edit);

  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  VALUES (v_user, v_role);

  PERFORM set_config('phase6.user',   v_user::text, false);
  PERFORM set_config('phase6.role',   v_role::text, false);
  PERFORM set_config('phase6.mod',    v_mod::text,  false);
  PERFORM set_config('phase6.delete', v_delete::text, false);
  PERFORM set_config('phase6.export', v_export::text, false);
END $$;

-- 1. View permission is honoured
SELECT ok(
  public.has_permission(current_setting('phase6.user')::uuid, 'phase6_probe', 'view'),
  'view permission is granted'
);

-- 2. Edit permission is honoured
SELECT ok(
  public.has_permission(current_setting('phase6.user')::uuid, 'phase6_probe', 'edit'),
  'edit permission is granted'
);

-- 3. Delete is NOT implicit — must be explicit
SELECT ok(
  NOT public.has_permission(current_setting('phase6.user')::uuid, 'phase6_probe', 'delete'),
  'delete is NOT implicitly granted by view+edit'
);

-- 4. Export is NOT implicit — must be explicit
SELECT ok(
  NOT public.has_permission(current_setting('phase6.user')::uuid, 'phase6_probe', 'export'),
  'export is NOT implicitly granted by view+edit'
);

-- 5. After explicit grant, delete is honoured
INSERT INTO public.role_permissions (role_id, module_id, action_id)
VALUES (
  current_setting('phase6.role')::uuid,
  current_setting('phase6.mod')::uuid,
  current_setting('phase6.delete')::uuid
);
SELECT ok(
  public.has_permission(current_setting('phase6.user')::uuid, 'phase6_probe', 'delete'),
  'delete granted only after explicit role_permissions row'
);

-- 6. Inactivating the role revokes the sensitive privilege immediately
UPDATE public.roles SET status = 'inactive' WHERE id = current_setting('phase6.role')::uuid;
SELECT ok(
  NOT public.has_permission(current_setting('phase6.user')::uuid, 'phase6_probe', 'delete'),
  'inactive role revokes sensitive privilege'
);

SELECT * FROM finish();
ROLLBACK;
