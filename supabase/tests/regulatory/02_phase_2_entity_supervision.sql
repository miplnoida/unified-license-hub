-- REGULATORY OPERATING STRUCTURE · Phase 2 — canonical entity supervision.
-- Proves: supervision is function-specific, only the dedicated assignment
-- permission can change ownership, the actor's own authority is required,
-- regulator/function/team/mandate consistency is enforced, lead and alternate
-- must be capable active staff, history is never destroyed, and direct DML on
-- the canonical table is closed.
BEGIN;
SELECT plan(22);

-- ------------------------------------------------------------------
-- fixtures
-- ------------------------------------------------------------------
INSERT INTO public.regulators (id, name, code, status, settings) VALUES
  ('a2000000-0000-4000-8000-000000000001','P2 Regulator A','P2RA','active','{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002','P2 Regulator B','P2RB','active','{}'::jsonb);

INSERT INTO public.sectors (id, name, status, regulator_id) VALUES
  ('b2000000-0000-4000-8000-000000000001','P2 Banking','active','a2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002','P2 Insurance','active','a2000000-0000-4000-8000-000000000001');

INSERT INTO public.sub_sectors (id, sector_id, name, status) VALUES
  ('c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','P2 Commercial Banks','active');

INSERT INTO public.licensees (id, name, status, sector_id, sub_sector_id) VALUES
  ('d2000000-0000-4000-8000-000000000001','P2 Entity One','active',
     'b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002','P2 Entity Two','active',
     'b2000000-0000-4000-8000-000000000002', NULL);

-- roles: assignment manager, prudential supervisor, licensing supervisor, plain analyst
INSERT INTO public.sec_roles (id, key, name, role_type, status) VALUES
  ('e2000000-0000-4000-8000-000000000001','p2_assign_mgr','P2 Assignment Manager','internal','active'),
  ('e2000000-0000-4000-8000-000000000002','p2_prudential','P2 Prudential Supervisor','internal','active'),
  ('e2000000-0000-4000-8000-000000000003','p2_licensing','P2 Licensing Supervisor','internal','active'),
  ('e2000000-0000-4000-8000-000000000004','p2_analyst','P2 Plain Analyst','internal','active');

-- assignment manager: licensee_management view + assign_supervision
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT 'e2000000-0000-4000-8000-000000000001', p.id
FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
WHERE lower(m.key)='licensee_management' AND p.key IN ('view','assign_supervision','edit');

-- prudential + licensing supervisors get the function's canonical view permission
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.sec_permissions p
JOIN public.sec_modules m ON m.id = p.module_id
JOIN (VALUES
        ('e2000000-0000-4000-8000-000000000002'::uuid,'prudential_supervision'),
        ('e2000000-0000-4000-8000-000000000003'::uuid,'license_management')
     ) AS r(id, module) ON lower(m.key) = r.module
WHERE p.key = 'view';

-- plain analyst: licensee_management EDIT only — never enough to assign ownership
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT 'e2000000-0000-4000-8000-000000000004', p.id
FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
WHERE lower(m.key)='licensee_management' AND p.key IN ('view','edit');

INSERT INTO public.sec_role_scopes (id, role_id, module_id, scope_type_id)
SELECT gen_random_uuid(), x.role_id, m.id, st.id
FROM (VALUES
        ('e2000000-0000-4000-8000-000000000001'::uuid,'licensee_management'),
        ('e2000000-0000-4000-8000-000000000002'::uuid,'prudential_supervision'),
        ('e2000000-0000-4000-8000-000000000003'::uuid,'license_management'),
        ('e2000000-0000-4000-8000-000000000004'::uuid,'licensee_management')
     ) AS x(role_id, module)
JOIN public.sec_modules m ON lower(m.key) = x.module
JOIN public.sec_scope_types st ON st.key = 'all';

INSERT INTO public.sec_user_roles (user_id, role_id, status) VALUES
  ('22222222-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','active'), -- assignment manager
  ('22222222-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','active'), -- prudential lead
  ('22222222-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','active'), -- prudential alternate
  ('22222222-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000003','active'), -- licensing lead
  ('22222222-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000004','active'); -- plain analyst
-- '22222222-0000-4000-8000-000000000009' holds no role at all

-- mandate + enforcement: regulator A is activated for prudential over P2 Banking only
INSERT INTO public.regulator_mandates (regulator_id, regulatory_function_id, sector_id, responsibility_type, status)
SELECT 'a2000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),
       'b2000000-0000-4000-8000-000000000001','LEAD','active';
INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id, enforcement_status, activated_at)
SELECT 'a2000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'ACTIVE', now();

INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb200000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),
       'P2-PRUD','P2 Prudential Team','active';
INSERT INTO public.regulatory_team_mandates (team_id, regulator_mandate_id)
SELECT 'bb200000-0000-4000-8000-000000000001', m.id FROM public.regulator_mandates m
WHERE m.regulator_id='a2000000-0000-4000-8000-000000000001';

-- a team belonging to a DIFFERENT regulator
INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb200000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',
       public.regulatory_function_for_module('prudential_supervision'),
       'P2-OTHER','P2 Other Regulator Team','active';

CREATE OR REPLACE FUNCTION public.p2_act_as(_user uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _user::text, 'role','authenticated')::text, true);
$$;

-- ------------------------------------------------------------------
-- 1..3 · only the dedicated assignment permission can change ownership
-- ------------------------------------------------------------------
SELECT public.p2_act_as('22222222-0000-4000-8000-000000000005');
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000005',
    NULL,'self service')$$,
  NULL, NULL, 'an analyst with edit permission cannot self-assign an entity');

SELECT public.p2_act_as('22222222-0000-4000-8000-000000000009');
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002',NULL,'no authority')$$,
  NULL, NULL, 'a user with no role cannot assign supervision');

-- ------------------------------------------------------------------
-- 4..8 · governed assignment succeeds and validates its inputs
-- ------------------------------------------------------------------
SELECT public.p2_act_as('22222222-0000-4000-8000-000000000001');

SELECT isnt(public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000001',
    '22222222-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000003',
    'initial prudential ownership'), NULL,
  'the assignment manager can create a canonical prudential assignment');

SELECT is((SELECT count(*)::int FROM public.entity_supervision_assignments
            WHERE entity_id='d2000000-0000-4000-8000-000000000001'
              AND status='active' AND is_primary AND requires_admin_review = false),
  1, 'the governed assignment is complete and needs no administrator review');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000003',NULL,'duplicate')$$,
  NULL, NULL, 'a second current prudential owner for the same entity is rejected');

-- a DIFFERENT function on the SAME entity is legitimate (twin peaks)
SELECT isnt(public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('license_management'),
    NULL,'22222222-0000-4000-8000-000000000004',NULL,'licensing ownership'), NULL,
  'a second supervisory function may own the same entity concurrently');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000002','same person twice')$$,
  NULL, NULL, 'lead and alternate supervisor cannot be the same person');

-- ------------------------------------------------------------------
-- 9..13 · consistency of regulator, function, team and mandate
-- ------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002',NULL,'wrong regulator')$$,
  NULL, NULL, 'a regulator that is not the entity''s canonical regulator is rejected');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000002',NULL,'foreign team')$$,
  NULL, NULL, 'a team belonging to another regulator is rejected');

-- P2 Entity Two sits in P2 Insurance; the activated prudential mandate covers
-- P2 Banking only, so ownership there is not authorised.
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002',NULL,'uncovered sector')$$,
  NULL, NULL, 'an entity outside the activated mandate coverage is rejected');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
    NULL, NULL,'22222222-0000-4000-8000-000000000002',NULL,'no function')$$,
  NULL, NULL, 'an assignment without a regulatory function is rejected');

-- the licensing supervisor holds no prudential permission
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('license_management'),
    NULL,'22222222-0000-4000-8000-000000000009',NULL,'incapable lead')$$,
  NULL, NULL, 'a lead supervisor without the function permission is rejected');

-- ------------------------------------------------------------------
-- 14..18 · transfer and closure preserve history
-- ------------------------------------------------------------------
SELECT isnt(public.transfer_entity_supervision(
    (SELECT id FROM public.entity_supervision_assignments
      WHERE entity_id='d2000000-0000-4000-8000-000000000001'
        AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
        AND status='active'),
    'bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000003',
    NULL,'portfolio rebalance'), NULL,
  'supervision can be transferred to a new lead');

SELECT is((SELECT count(*)::int FROM public.entity_supervision_assignments
            WHERE entity_id='d2000000-0000-4000-8000-000000000001'
              AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')),
  2, 'the transfer preserved the superseded assignment as history');

SELECT is((SELECT count(*)::int FROM public.entity_supervision_assignments
            WHERE entity_id='d2000000-0000-4000-8000-000000000001'
              AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
              AND status='active'),
  1, 'exactly one prudential assignment remains active after the transfer');

SELECT isnt((SELECT previous_assignment_id FROM public.entity_supervision_assignments
              WHERE entity_id='d2000000-0000-4000-8000-000000000001'
                AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
                AND status='active'), NULL,
  'the new assignment links back to the assignment it replaced');

SELECT throws_ok($$
  SELECT public.end_entity_supervision_assignment(
    (SELECT id FROM public.entity_supervision_assignments
      WHERE entity_id='d2000000-0000-4000-8000-000000000001'
        AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
        AND status='active'), NULL)$$,
  NULL, NULL, 'ending an assignment without a reason is rejected');

-- ------------------------------------------------------------------
-- 19..20 · assignment-derived visibility follows the canonical record
-- ------------------------------------------------------------------
SELECT ok(public.user_has_entity_assignment('22222222-0000-4000-8000-000000000003',
            'd2000000-0000-4000-8000-000000000001'),
  'the current lead supervisor is recognised as assigned');
SELECT ok(NOT public.user_has_entity_assignment('22222222-0000-4000-8000-000000000009',
            'd2000000-0000-4000-8000-000000000001'),
  'an unrelated user is not recognised as assigned');

-- ------------------------------------------------------------------
-- 21..22 · canonical table is closed to direct DML
-- ------------------------------------------------------------------
SELECT ok(has_table_privilege('authenticated','public.entity_supervision_assignments','SELECT'),
  'staff retain read access to supervision assignments');
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='entity_supervision_assignments'
      AND grantee IN ('authenticated','anon')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')),
  0, 'no direct write grant on the canonical supervision table');

SELECT * FROM finish();
ROLLBACK;
