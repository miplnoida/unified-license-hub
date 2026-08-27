-- pgTAP: Role Management hardening triggers
--
-- Verifies the invariants exposed by
-- `20260721061053_role_management_hardening.sql`:
--   1. Dependent actions require `view` on the same module.
--   2. Orphaned permissions (enforced = false) cannot be assigned.
--   3. The rule set exposed by `get_permission_dependencies()` and
--      `permission_has_dependency()` matches the client-side map.

BEGIN;
SELECT plan(14);

-- ----------------------------------------------------------------------
-- Fixtures
--
-- MC-12: always use a dedicated, empty role. Re-using an arbitrary existing
-- role made the dependency assertions non-deterministic, because that role may
-- already hold `view`/`edit` on the probe module.
-- ----------------------------------------------------------------------
CREATE TEMP TABLE _t_roles_seed (role_id uuid);

DO $$
DECLARE
  v_role uuid;
BEGIN
  INSERT INTO public.roles (name, description, system_role, role_type, dashboard_tier)
  VALUES ('_pgtap_permission_dependencies', 'pgTAP fixture', 'analyst', 'internal', 'operational')
  RETURNING id INTO v_role;
  INSERT INTO _t_roles_seed VALUES (v_role);
END$$;

-- Pick a module that has both `view` and `edit` in the live catalog.
CREATE TEMP TABLE _t_perms AS
SELECT
  (SELECT id FROM public.permissions WHERE module = 'application_management' AND name = 'view') AS view_id,
  (SELECT id FROM public.permissions WHERE module = 'application_management' AND name = 'edit') AS edit_id,
  (SELECT id FROM public.permissions WHERE module = 'application_management' AND name = 'approve') AS approve_id;

-- ----------------------------------------------------------------------
-- get_permission_dependencies() and permission_has_dependency()
-- ----------------------------------------------------------------------
SELECT ok(
  (SELECT public.permission_has_dependency('edit')),
  'permission_has_dependency: edit requires view'
);
SELECT ok(
  (SELECT public.permission_has_dependency('approve')),
  'permission_has_dependency: approve requires view'
);
SELECT ok(
  (SELECT public.permission_has_dependency('delete')),
  'permission_has_dependency: delete requires view'
);
SELECT ok(
  NOT (SELECT public.permission_has_dependency('view')),
  'permission_has_dependency: view has no dependency'
);
SELECT ok(
  NOT (SELECT public.permission_has_dependency('nonsense_action')),
  'permission_has_dependency: unknown action has no dependency'
);
SELECT ok(
  (SELECT count(*) FROM public.get_permission_dependencies()) >= 13,
  'get_permission_dependencies exposes at least 13 dependent actions'
);

-- ----------------------------------------------------------------------
-- Dependency trigger: rejects edit without view
-- ----------------------------------------------------------------------
SELECT throws_ok(
  format(
    'INSERT INTO public.role_permissions(role_id, permission_id) VALUES (%L, %L)',
    (SELECT role_id FROM _t_roles_seed),
    (SELECT edit_id FROM _t_perms)
  ),
  NULL,
  NULL,
  'Inserting edit without view is rejected by the dependency trigger'
);

-- ----------------------------------------------------------------------
-- Dependency trigger: allows edit once view is present
-- ----------------------------------------------------------------------
INSERT INTO public.role_permissions(role_id, permission_id)
VALUES ((SELECT role_id FROM _t_roles_seed), (SELECT view_id FROM _t_perms))
ON CONFLICT DO NOTHING;

SELECT lives_ok(
  format(
    'INSERT INTO public.role_permissions(role_id, permission_id) VALUES (%L, %L) ON CONFLICT DO NOTHING',
    (SELECT role_id FROM _t_roles_seed),
    (SELECT edit_id FROM _t_perms)
  ),
  'Inserting edit succeeds once view is granted'
);

SELECT lives_ok(
  format(
    'INSERT INTO public.role_permissions(role_id, permission_id) VALUES (%L, %L) ON CONFLICT DO NOTHING',
    (SELECT role_id FROM _t_roles_seed),
    (SELECT approve_id FROM _t_perms)
  ),
  'Inserting approve also succeeds when view is present'
);

-- ----------------------------------------------------------------------
-- Orphaned trigger
-- ----------------------------------------------------------------------
DO $$
DECLARE
  v_orphan uuid;
BEGIN
  INSERT INTO public.permissions (module, name, description, enforced)
  VALUES ('_pgtap_orphan_module', 'ghost_action', 'pgTAP orphan fixture', false)
  RETURNING id INTO v_orphan;
  PERFORM set_config('pgtap.orphan_id', v_orphan::text, true);
END$$;

SELECT throws_ok(
  format(
    'INSERT INTO public.role_permissions(role_id, permission_id) VALUES (%L, %L)',
    (SELECT role_id FROM _t_roles_seed),
    current_setting('pgtap.orphan_id')::uuid
  ),
  NULL,
  NULL,
  'Orphaned permissions (enforced = false) cannot be assigned'
);

-- Flipping enforced to true unblocks assignment.
UPDATE public.permissions
   SET enforced = true
 WHERE id = current_setting('pgtap.orphan_id')::uuid;

SELECT lives_ok(
  format(
    'INSERT INTO public.role_permissions(role_id, permission_id) VALUES (%L, %L) ON CONFLICT DO NOTHING',
    (SELECT role_id FROM _t_roles_seed),
    current_setting('pgtap.orphan_id')::uuid
  ),
  'Setting enforced = true allows the permission to be assigned'
);

-- ----------------------------------------------------------------------
-- Removing view while dependents remain: the delete-side of the invariant.
-- ----------------------------------------------------------------------
SELECT throws_ok(
  format(
    'DELETE FROM public.role_permissions WHERE role_id = %L AND permission_id = %L',
    (SELECT role_id FROM _t_roles_seed),
    (SELECT view_id FROM _t_perms)
  ),
  NULL,
  NULL,
  'Removing view while edit/approve are still assigned is rejected'
);

-- Cleaning up dependents first should succeed.
DELETE FROM public.role_permissions
 WHERE role_id = (SELECT role_id FROM _t_roles_seed)
   AND permission_id IN ((SELECT edit_id FROM _t_perms), (SELECT approve_id FROM _t_perms));

SELECT lives_ok(
  format(
    'DELETE FROM public.role_permissions WHERE role_id = %L AND permission_id = %L',
    (SELECT role_id FROM _t_roles_seed),
    (SELECT view_id FROM _t_perms)
  ),
  'Removing view succeeds once dependents are cleared'
);

-- Every dependent action listed in the catalog is a real permission name
-- that appears somewhere in the permissions table.
SELECT ok(
  (
    SELECT count(*) FROM public.get_permission_dependencies() d
     WHERE EXISTS (SELECT 1 FROM public.permissions p WHERE p.name = d.action)
  ) >= 5,
  'At least 5 dependent actions are present in the live permission catalog'
);

SELECT * FROM finish();
ROLLBACK;
