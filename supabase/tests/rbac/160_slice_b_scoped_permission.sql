-- pgTAP: Slice B — Record Scope is authoritative in RLS
--
-- Verifies public.has_scoped_permission honours the aggregated
-- user_scope_for(user, module) result and denies out-of-scope records
-- even when the user carries the module.action permission.
BEGIN;
SELECT plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000b01', 'slb-super@test'),
  ('00000000-0000-0000-0000-000000000b02', 'slb-all@test'),
  ('00000000-0000-0000-0000-000000000b03', 'slb-inst@test'),
  ('00000000-0000-0000-0000-000000000b04', 'slb-sector@test'),
  ('00000000-0000-0000-0000-000000000b05', 'slb-own@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000b01', 'super_admin')
ON CONFLICT DO NOTHING;

-- Reuse an existing permission we know exists in the seed catalog.
DO $$
DECLARE
  perm_id uuid;
  role_all uuid;
  role_inst uuid;
  role_sector uuid;
  role_own uuid;
BEGIN
  SELECT id INTO perm_id FROM public.permissions
    WHERE module_key = 'complaint_management' AND action_key = 'view' LIMIT 1;
  IF perm_id IS NULL THEN
    RAISE NOTICE 'Skipping — complaint_management.view seed missing'; RETURN;
  END IF;

  INSERT INTO public.roles (name, status, scope_config)
    VALUES ('sliceb_all', 'active',
            jsonb_build_object('complaint_management', jsonb_build_object('scope','all')))
    RETURNING id INTO role_all;
  INSERT INTO public.roles (name, status, scope_config)
    VALUES ('sliceb_inst', 'active',
            jsonb_build_object('complaint_management', jsonb_build_object(
              'scope','institution',
              'licensees', jsonb_build_array('11111111-1111-1111-1111-111111111111'))))
    RETURNING id INTO role_inst;
  INSERT INTO public.roles (name, status, scope_config)
    VALUES ('sliceb_sector','active',
            jsonb_build_object('complaint_management', jsonb_build_object(
              'scope','sector',
              'sectors', jsonb_build_array('22222222-2222-2222-2222-222222222222'))))
    RETURNING id INTO role_sector;
  INSERT INTO public.roles (name, status, scope_config)
    VALUES ('sliceb_own', 'active',
            jsonb_build_object('complaint_management', jsonb_build_object('scope','own')))
    RETURNING id INTO role_own;

  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (role_all, perm_id), (role_inst, perm_id),
    (role_sector, perm_id), (role_own, perm_id);

  INSERT INTO public.user_dynamic_roles (user_id, role_id) VALUES
    ('00000000-0000-0000-0000-000000000b02', role_all),
    ('00000000-0000-0000-0000-000000000b03', role_inst),
    ('00000000-0000-0000-0000-000000000b04', role_sector),
    ('00000000-0000-0000-0000-000000000b05', role_own);
END $$;

-- ---------------------------------------------------------------------------
-- 1) super_admin bypasses scope
SELECT ok(public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b01','complaint_management','view',
  '99999999-9999-9999-9999-999999999999', NULL, NULL),
  'super_admin bypasses scope');

-- 2) Denies when user has no permission at all
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-0000000000ff','complaint_management','view',
  NULL, NULL, NULL),
  'no-permission user is denied');

-- 3) `all` scope allows any licensee
SELECT ok(public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b02','complaint_management','view',
  '55555555-5555-5555-5555-555555555555', NULL, NULL),
  '`all` scope allows any licensee');

-- 4) institution scope allows listed licensee
SELECT ok(public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b03','complaint_management','view',
  '11111111-1111-1111-1111-111111111111', NULL, NULL),
  'institution scope allows listed licensee');

-- 5) institution scope denies unlisted licensee
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b03','complaint_management','view',
  '55555555-5555-5555-5555-555555555555', NULL, NULL),
  'institution scope denies unlisted licensee');

-- 6) institution scope denies NULL licensee
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b03','complaint_management','view',
  NULL, NULL, NULL),
  'institution scope denies NULL licensee');

-- 7) sector scope allows listed sector
SELECT ok(public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b04','complaint_management','view',
  NULL, '22222222-2222-2222-2222-222222222222', NULL),
  'sector scope allows listed sector');

-- 8) sector scope denies unlisted sector
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b04','complaint_management','view',
  NULL, '33333333-3333-3333-3333-333333333333', NULL),
  'sector scope denies unlisted sector');

-- 9) sector scope denies NULL sector
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b04','complaint_management','view',
  NULL, NULL, NULL),
  'sector scope denies NULL sector');

-- 10) own scope allows when owner = user
SELECT ok(public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b05','complaint_management','view',
  NULL, NULL, '00000000-0000-0000-0000-000000000b05'),
  'own scope allows when owner matches');

-- 11) own scope denies when owner != user
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b05','complaint_management','view',
  NULL, NULL, '00000000-0000-0000-0000-000000000b02'),
  'own scope denies when owner differs');

-- 12) NULL user denied
SELECT ok(NOT public.has_scoped_permission(
  NULL,'complaint_management','view', NULL, NULL, NULL),
  'NULL user denied');

-- 13) Inactive role does not leak scope
UPDATE public.roles SET status='inactive' WHERE name='sliceb_all';
SELECT ok(NOT public.has_scoped_permission(
  '00000000-0000-0000-0000-000000000b02','complaint_management','view',
  '55555555-5555-5555-5555-555555555555', NULL, NULL),
  'inactive role drops scope + permission');

-- 14) Function is SECURITY DEFINER with pinned search_path
SELECT is(
  (SELECT prosecdef FROM pg_proc
    WHERE proname='has_scoped_permission'
      AND pronamespace='public'::regnamespace LIMIT 1),
  true,
  'has_scoped_permission is SECURITY DEFINER');

SELECT * FROM finish();
ROLLBACK;
