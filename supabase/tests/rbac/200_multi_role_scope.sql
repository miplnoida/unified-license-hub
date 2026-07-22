-- =====================================================================
-- Phase 1 pgTAP: multi-role scope merge — user_scope_for(uuid,text,text).
-- Covers item #1 required matrix + item #4 removed-scope regression.
-- =====================================================================
BEGIN;
-- Bypass FK triggers on user_dynamic_roles → auth.users so we can pin
-- synthetic user IDs. This is a pgTAP-only concession; roll back at end.
SET LOCAL session_replication_role = 'replica';
SELECT plan(9);

-- Fixtures ------------------------------------------------------------
-- Two view permissions we can grant.
INSERT INTO public.permissions (name, module, description)
VALUES ('view','Complaint Management','pgtap'),
       ('view','Licensee Management','pgtap')
ON CONFLICT DO NOTHING;

-- Four roles: assigned-scoped complaints, all-scoped complaints,
-- unrelated all-scoped licensee, inactive all-scoped complaints.
INSERT INTO public.roles (name, system_role, is_system, role_type, status, scope_config)
VALUES
  ('_pgtap_R','custom',false,'internal','active',   '{"complaint_management":{"scope":"assigned"}}'::jsonb),
  ('_pgtap_A','custom',false,'internal','active',   '{"complaint_management":{"scope":"all"}}'::jsonb),
  ('_pgtap_G','custom',false,'internal','active',   '{"licensee_management":{"scope":"all"}}'::jsonb),
  ('_pgtap_I','custom',false,'internal','inactive', '{"complaint_management":{"scope":"all"}}'::jsonb),
  ('_pgtap_S1','custom',false,'internal','active',  '{"complaint_management":{"scope":"sector","sectors":["00000000-0000-0000-0000-000000000aaa"]}}'::jsonb),
  ('_pgtap_S2','custom',false,'internal','active',  '{"complaint_management":{"scope":"sector","sectors":["00000000-0000-0000-0000-000000000bbb"]}}'::jsonb),
  ('_pgtap_L1','custom',false,'internal','active',  '{"licensee_management":{"scope":"institution","licensees":["00000000-0000-0000-0000-0000000000a1"]}}'::jsonb),
  ('_pgtap_L2','custom',false,'internal','active',  '{"licensee_management":{"scope":"institution","licensees":["00000000-0000-0000-0000-0000000000a2"]}}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Wire complaints.view to _pgtap_R, _pgtap_A, _pgtap_I, _pgtap_S1, _pgtap_S2.
-- Wire licensee.view  to _pgtap_G, _pgtap_L1, _pgtap_L2.
WITH cp AS (
  SELECT id FROM public.permissions
  WHERE lower(name)='view'
    AND lower(regexp_replace(module,'\s+','_','g'))='complaint_management' LIMIT 1
), lp AS (
  SELECT id FROM public.permissions
  WHERE lower(name)='view'
    AND lower(regexp_replace(module,'\s+','_','g'))='licensee_management' LIMIT 1
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, cp.id FROM public.roles r, cp
  WHERE r.name IN ('_pgtap_R','_pgtap_A','_pgtap_I','_pgtap_S1','_pgtap_S2')
UNION ALL
SELECT r.id, lp.id FROM public.roles r, lp
  WHERE r.name IN ('_pgtap_G','_pgtap_L1','_pgtap_L2')
ON CONFLICT DO NOTHING;

-- Assign users.
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT u, r.id FROM (VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, '_pgtap_R'),
  ('11111111-1111-1111-1111-111111111111'::uuid, '_pgtap_G'),   -- U1
  ('22222222-2222-2222-2222-222222222222'::uuid, '_pgtap_R'),
  ('22222222-2222-2222-2222-222222222222'::uuid, '_pgtap_A'),   -- U2
  ('33333333-3333-3333-3333-333333333333'::uuid, '_pgtap_I'),   -- U3
  ('44444444-4444-4444-4444-444444444444'::uuid, '_pgtap_G'),   -- U4
  ('55555555-5555-5555-5555-555555555555'::uuid, '_pgtap_I'),
  ('55555555-5555-5555-5555-555555555555'::uuid, '_pgtap_R'),   -- U5
  ('66666666-6666-6666-6666-666666666666'::uuid, '_pgtap_S1'),
  ('66666666-6666-6666-6666-666666666666'::uuid, '_pgtap_S2'),  -- U6
  ('77777777-7777-7777-7777-777777777777'::uuid, '_pgtap_L1'),
  ('77777777-7777-7777-7777-777777777777'::uuid, '_pgtap_L2')   -- U7
) AS x(u, rn)
JOIN public.roles r ON r.name = x.rn;

-- Assertions ----------------------------------------------------------
-- 1. Assigned + unrelated all-scoped role => Assigned (not All).
SELECT is(
  public.user_scope_for('11111111-1111-1111-1111-111111111111','complaint_management','view') ->> 'scope',
  'assigned',
  'assigned + unrelated global role stays assigned'
);

-- 2. Assigned + same-module All => All.
SELECT is(
  public.user_scope_for('22222222-2222-2222-2222-222222222222','complaint_management','view') ->> 'scope',
  'all',
  'same-module all widens correctly'
);

-- 3. Inactive-only role grants no scope.
SELECT is(
  public.user_scope_for('33333333-3333-3333-3333-333333333333','complaint_management','view') ->> 'scope',
  'none',
  'inactive role contributes nothing'
);

-- 4. Unrelated role only => no qualifying role => none.
SELECT is(
  public.user_scope_for('44444444-4444-4444-4444-444444444444','complaint_management','view') ->> 'scope',
  'none',
  'unrelated role does not grant complaints scope'
);

-- 5. Inactive All + Active Assigned => Assigned.
SELECT is(
  public.user_scope_for('55555555-5555-5555-5555-555555555555','complaint_management','view') ->> 'scope',
  'assigned',
  'inactive all + active assigned = assigned'
);

-- 6. Sector A + Sector B => union {A,B}.
SELECT ok(
  (public.user_scope_for('66666666-6666-6666-6666-666666666666','complaint_management','view') -> 'sectors')
    @> '["00000000-0000-0000-0000-000000000aaa","00000000-0000-0000-0000-000000000bbb"]'::jsonb,
  'sector A + sector B merged into union'
);

-- 7. Institution A + Institution B => union.
SELECT ok(
  (public.user_scope_for('77777777-7777-7777-7777-777777777777','licensee_management','view') -> 'licensees')
    @> '["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a2"]'::jsonb,
  'institution A + institution B merged into union'
);

-- 8. Anonymous user => none.
SELECT is(
  public.user_scope_for(NULL,'complaint_management','view') ->> 'scope',
  'none',
  'null user id resolves to none, not all'
);

-- 9. Team/department scopes removed from resolver: passing a role with a
--    (hypothetical) team scope must produce 'none' rather than widening.
--    We simulate this by inserting a role with an unrecognized scope kind.
DO $$
DECLARE r uuid; cp uuid;
BEGIN
  INSERT INTO public.roles (name, system_role, is_system, role_type, status, scope_config)
  VALUES ('_pgtap_TEAM','custom',false,'internal','active',
    '{"complaint_management":{"scope":"team","teams":["x"]}}'::jsonb)
  RETURNING id INTO r;
  SELECT id INTO cp FROM public.permissions
  WHERE lower(name)='view'
    AND lower(regexp_replace(module,'\s+','_','g'))='complaint_management' LIMIT 1;
  INSERT INTO public.role_permissions (role_id, permission_id) VALUES (r, cp);
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  VALUES ('88888888-8888-8888-8888-888888888888', r);
END $$;

SELECT is(
  public.user_scope_for('88888888-8888-8888-8888-888888888888','complaint_management','view') ->> 'scope',
  'none',
  'unbacked team scope contributes nothing (no silent widening)'
);

SELECT * FROM finish();
ROLLBACK;
