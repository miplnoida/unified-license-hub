-- REGULATORY OPERATING STRUCTURE · Phase 2 / 2.1 — canonical entity supervision.
--
-- Proves:
--   * assignment administration (licensee_management.assign_supervision) is a
--     SEPARATE authority from the ability to perform the supervisory function,
--     but the actor's narrowing layers are evaluated against the TARGET
--     regulatory function;
--   * lead / alternate eligibility is a governed configuration, not a bare
--     `view` permission, and requires a real, active, internal staff identity;
--   * team_id is not decorative: lead and alternate must be active members;
--   * one current primary assignment per ENTITY + REGULATORY FUNCTION
--     (twin peaks preserved) with zero cross-function authority leaks;
--   * history is never destroyed and direct DML stays closed.
BEGIN;
SELECT plan(59);

-- ------------------------------------------------------------------
-- fixtures — organisation
-- ------------------------------------------------------------------
INSERT INTO public.regulators (id, name, code, status, settings) VALUES
  ('a2f00000-0000-4000-8000-000000000001','P2 Regulator A','P2RA','active','{}'::jsonb),
  ('a2f00000-0000-4000-8000-000000000002','P2 Regulator B','P2RB','active','{}'::jsonb);

INSERT INTO public.sectors (id, name, status, regulator_id) VALUES
  ('b2f00000-0000-4000-8000-000000000001','P2 Banking','active','a2f00000-0000-4000-8000-000000000001'),
  ('b2f00000-0000-4000-8000-000000000002','P2 Insurance','active','a2f00000-0000-4000-8000-000000000001');

INSERT INTO public.sub_sectors (id, sector_id, name, status) VALUES
  ('c2f00000-0000-4000-8000-000000000001','b2f00000-0000-4000-8000-000000000001','P2 Commercial Banks','active'),
  ('c2f00000-0000-4000-8000-000000000002','b2f00000-0000-4000-8000-000000000001','P2 Investment Banks','active');

INSERT INTO public.licensees (id, name, status, sector_id, sub_sector_id) VALUES
  ('d2f00000-0000-4000-8000-000000000001','P2 Entity One','active',
     'b2f00000-0000-4000-8000-000000000001','c2f00000-0000-4000-8000-000000000001'),
  ('d2f00000-0000-4000-8000-000000000002','P2 Entity Two','active',
     'b2f00000-0000-4000-8000-000000000002', NULL),
  ('d2f00000-0000-4000-8000-000000000003','P2 Entity Three','active',
     'b2f00000-0000-4000-8000-000000000001','c2f00000-0000-4000-8000-000000000002');

-- ------------------------------------------------------------------
-- fixtures — identities (auth + profiles are both required now)
-- ------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('22222222-0000-4000-8000-000000000001','p2-assign-mgr@test.local'),
  ('22222222-0000-4000-8000-000000000002','p2-prud-lead@test.local'),
  ('22222222-0000-4000-8000-000000000003','p2-prud-alt@test.local'),
  ('22222222-0000-4000-8000-000000000004','p2-lic-lead@test.local'),
  ('22222222-0000-4000-8000-000000000005','p2-analyst@test.local'),
  ('22222222-0000-4000-8000-000000000006','p2-external@test.local'),
  ('22222222-0000-4000-8000-000000000007','p2-inactive@test.local'),
  ('22222222-0000-4000-8000-000000000008','p2-viewonly@test.local'),
  ('22222222-0000-4000-8000-000000000010','p2-conduct-lead@test.local'),
  ('22222222-0000-4000-8000-000000000011','p2-mgr-subsector@test.local'),
  ('22222222-0000-4000-8000-000000000012','p2-mgr-sector@test.local'),
  ('22222222-0000-4000-8000-000000000013','p2-mgr-entity@test.local'),
  ('22222222-0000-4000-8000-000000000014','p2-enf-viewer@test.local'),
  ('22222222-0000-4000-8000-000000000015','p2-prud-lead-2@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, user_type, status, licensee_id) VALUES
  ('22222222-0000-4000-8000-000000000001','P2 Assignment Manager','p2-assign-mgr@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000002','P2 Prudential Lead','p2-prud-lead@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000003','P2 Prudential Alternate','p2-prud-alt@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000004','P2 Licensing Lead','p2-lic-lead@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000005','P2 Plain Analyst','p2-analyst@test.local','employee','active',NULL),
  -- an EXTERNAL licensee user (never eligible to own regulatory work)
  ('22222222-0000-4000-8000-000000000006','P2 External User','p2-external@test.local','primary','active',
     'd2f00000-0000-4000-8000-000000000001'),
  ('22222222-0000-4000-8000-000000000007','P2 Inactive Officer','p2-inactive@test.local','employee','inactive',NULL),
  ('22222222-0000-4000-8000-000000000008','P2 View Only Officer','p2-viewonly@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000010','P2 Conduct Lead','p2-conduct-lead@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000011','P2 Manager SubSector','p2-mgr-subsector@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000012','P2 Manager Sector','p2-mgr-sector@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000013','P2 Manager Entity','p2-mgr-entity@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000014','P2 Enforcement Viewer','p2-enf-viewer@test.local','employee','active',NULL),
  ('22222222-0000-4000-8000-000000000015','P2 Prudential Lead Two','p2-prud-lead-2@test.local','employee','active',NULL)
-- auth.users carries a profile-provisioning trigger, so the fixture completes the
-- provisioned row instead of colliding with it.
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  user_type = EXCLUDED.user_type,
  status = EXCLUDED.status,
  licensee_id = EXCLUDED.licensee_id;

-- ------------------------------------------------------------------
-- fixtures — roles
-- ------------------------------------------------------------------
INSERT INTO public.sec_roles (id, key, name, role_type, status) VALUES
  ('e2f00000-0000-4000-8000-000000000001','p2_assign_mgr','P2 Assignment Manager','internal','active'),
  ('e2f00000-0000-4000-8000-000000000002','p2_prudential','P2 Prudential Supervisor','internal','active'),
  ('e2f00000-0000-4000-8000-000000000003','p2_licensing','P2 Licensing Supervisor','internal','active'),
  ('e2f00000-0000-4000-8000-000000000004','p2_analyst','P2 Plain Analyst','internal','active'),
  ('e2f00000-0000-4000-8000-000000000005','p2_prud_viewonly','P2 Prudential View Only','internal','active'),
  ('e2f00000-0000-4000-8000-000000000006','p2_conduct','P2 Conduct Supervisor','internal','active'),
  ('e2f00000-0000-4000-8000-000000000007','p2_enforcement','P2 Enforcement Viewer','internal','active');

-- assignment manager: licensee_management view + edit + assign_supervision
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT 'e2f00000-0000-4000-8000-000000000001', p.id
FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
WHERE lower(m.key)='licensee_management' AND p.key IN ('view','assign_supervision','edit');

-- operational supervisors: canonical view + edit for their own function
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.sec_permissions p
JOIN public.sec_modules m ON m.id = p.module_id
JOIN (VALUES
        ('e2f00000-0000-4000-8000-000000000002'::uuid,'prudential_supervision'),
        ('e2f00000-0000-4000-8000-000000000003'::uuid,'license_management'),
        ('e2f00000-0000-4000-8000-000000000006'::uuid,'market_conduct')
     ) AS r(id, module) ON lower(m.key) = r.module
WHERE p.key IN ('view','edit');

-- plain analyst: licensee_management EDIT only — never enough to assign ownership
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT 'e2f00000-0000-4000-8000-000000000004', p.id
FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
WHERE lower(m.key)='licensee_management' AND p.key IN ('view','edit');

-- view-only prudential officer (no edit): eligible only while no requirement is active
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT 'e2f00000-0000-4000-8000-000000000005', p.id
FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
WHERE lower(m.key)='prudential_supervision' AND p.key = 'view';

-- enforcement viewer also carries prudential view+edit so it can own prudential work
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT 'e2f00000-0000-4000-8000-000000000007', p.id
FROM public.sec_permissions p JOIN public.sec_modules m ON m.id = p.module_id
WHERE (lower(m.key)='enforcement_management' AND p.key = 'view')
   OR (lower(m.key)='prudential_supervision' AND p.key IN ('view','edit'));

INSERT INTO public.sec_role_scopes (id, role_id, module_id, scope_type_id)
SELECT gen_random_uuid(), x.role_id, m.id, st.id
FROM (VALUES
        ('e2f00000-0000-4000-8000-000000000001'::uuid,'licensee_management'),
        ('e2f00000-0000-4000-8000-000000000002'::uuid,'prudential_supervision'),
        ('e2f00000-0000-4000-8000-000000000003'::uuid,'license_management'),
        ('e2f00000-0000-4000-8000-000000000004'::uuid,'licensee_management'),
        ('e2f00000-0000-4000-8000-000000000005'::uuid,'prudential_supervision'),
        ('e2f00000-0000-4000-8000-000000000006'::uuid,'market_conduct'),
        ('e2f00000-0000-4000-8000-000000000007'::uuid,'enforcement_management'),
        ('e2f00000-0000-4000-8000-000000000007'::uuid,'prudential_supervision')
     ) AS x(role_id, module)
JOIN public.sec_modules m ON lower(m.key) = x.module
JOIN public.sec_scope_types st ON st.key = 'all';

INSERT INTO public.sec_user_roles (user_id, role_id, status) VALUES
  ('22222222-0000-4000-8000-000000000001','e2f00000-0000-4000-8000-000000000001','active'),
  ('22222222-0000-4000-8000-000000000002','e2f00000-0000-4000-8000-000000000002','active'),
  ('22222222-0000-4000-8000-000000000003','e2f00000-0000-4000-8000-000000000002','active'),
  ('22222222-0000-4000-8000-000000000015','e2f00000-0000-4000-8000-000000000002','active'),
  ('22222222-0000-4000-8000-000000000004','e2f00000-0000-4000-8000-000000000003','active'),
  ('22222222-0000-4000-8000-000000000005','e2f00000-0000-4000-8000-000000000004','active'),
  ('22222222-0000-4000-8000-000000000006','e2f00000-0000-4000-8000-000000000002','active'),
  ('22222222-0000-4000-8000-000000000007','e2f00000-0000-4000-8000-000000000002','active'),
  ('22222222-0000-4000-8000-000000000008','e2f00000-0000-4000-8000-000000000005','active'),
  ('22222222-0000-4000-8000-000000000010','e2f00000-0000-4000-8000-000000000006','active'),
  ('22222222-0000-4000-8000-000000000011','e2f00000-0000-4000-8000-000000000001','active'),
  ('22222222-0000-4000-8000-000000000012','e2f00000-0000-4000-8000-000000000001','active'),
  ('22222222-0000-4000-8000-000000000013','e2f00000-0000-4000-8000-000000000001','active'),
  ('22222222-0000-4000-8000-000000000014','e2f00000-0000-4000-8000-000000000007','active');
-- '22222222-0000-4000-8000-000000000009' holds no role and no profile at all

-- mandate + enforcement: regulator A is activated for prudential over P2 Banking only
INSERT INTO public.regulator_mandates (regulator_id, regulatory_function_id, sector_id, responsibility_type, status)
SELECT 'a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),
       'b2f00000-0000-4000-8000-000000000001','LEAD','active';
INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id, enforcement_status, activated_at)
SELECT 'a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'ACTIVE', now();

-- teams: prudential (regulator A), conduct (regulator A), foreign (regulator B)
INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb200000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),
       'P2-PRUD','P2 Prudential Team','active';
INSERT INTO public.regulatory_team_mandates (team_id, regulator_mandate_id)
SELECT 'bb200000-0000-4000-8000-000000000001', m.id FROM public.regulator_mandates m
WHERE m.regulator_id='a2f00000-0000-4000-8000-000000000001';

INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb200000-0000-4000-8000-000000000002','a2f00000-0000-4000-8000-000000000002',
       public.regulatory_function_for_module('prudential_supervision'),
       'P2-OTHER','P2 Other Regulator Team','active';

INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb200000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('market_conduct'),
       'P2-CONDUCT','P2 Conduct Team','active';

INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status) VALUES
  ('bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002','lead','active'),
  ('bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000003','member','active'),
  ('bb200000-0000-4000-8000-000000000003','22222222-0000-4000-8000-000000000010','lead','active');
-- user 15 is deliberately NOT a member of P2-PRUD

-- actor portfolios used by the target-function awareness assertions
INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status)
SELECT 'aa200000-0000-4000-8000-000000000011','22222222-0000-4000-8000-000000000011',
       'a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'active';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sub_sector_id)
VALUES ('aa200000-0000-4000-8000-000000000011','sub_sector','c2f00000-0000-4000-8000-000000000001');

INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status)
SELECT 'aa200000-0000-4000-8000-000000000012','22222222-0000-4000-8000-000000000012',
       'a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'active';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sector_id)
VALUES ('aa200000-0000-4000-8000-000000000012','sector','b2f00000-0000-4000-8000-000000000002');

INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status)
SELECT 'aa200000-0000-4000-8000-000000000013','22222222-0000-4000-8000-000000000013',
       'a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'active';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, entity_id)
VALUES ('aa200000-0000-4000-8000-000000000013','entity','d2f00000-0000-4000-8000-000000000002');

CREATE OR REPLACE FUNCTION public.p2_act_as(_user uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _user::text, 'role','authenticated')::text, true);
$$;

-- ==================================================================
-- A · assignment-manager scope is TARGET-FUNCTION aware
-- ==================================================================
SELECT ok(public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000001','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'),
  'ASSIGN_MANAGER_CORRECT_TARGET_FUNCTION = ALLOWED');

SELECT ok(NOT public.has_permission('22222222-0000-4000-8000-000000000001',
            'prudential_supervision','view'),
  'ASSIGNMENT_PERMISSION_SEPARATE_FROM_OPERATIONAL_PERMISSION: the manager holds no prudential permission');

SELECT ok(NOT public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000005','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'),
  'ASSIGN_SUPERVISION_PERMISSION_MISSING = DENIED');

SELECT ok(public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000011','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'),
  'a manager whose target-function portfolio covers the entity sub-sector is allowed');

SELECT ok(NOT public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000011','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001'),
  'ASSIGN_MANAGER_WRONG_SUBSECTOR = DENIED');

SELECT ok(NOT public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000012','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'),
  'ASSIGN_MANAGER_WRONG_SECTOR = DENIED');

SELECT ok(NOT public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000001','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000002'),
  'ASSIGN_MANAGER_WRONG_REGULATOR = DENIED');

SELECT ok(NOT public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000013','licensee_management','assign_supervision',
            public.regulatory_function_for_module('prudential_supervision'),
            'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'),
  'ASSIGN_MANAGER_OUTSIDE_TARGET_FUNCTION_PORTFOLIO = DENIED');

-- NARROWING-ONLY: the target-function-aware assignment check is never WIDER than
-- the management-module check. (It may legitimately be stricter — that is the
-- defect it closes — so the assertion is the implication, not equality.)
SELECT ok(
  (NOT public.regulatory_assignment_scope_allows('22222222-0000-4000-8000-000000000013',
        'licensee_management','assign_supervision',
        public.regulatory_function_for_module('prudential_supervision'),
        'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'))
  OR public.regulatory_scope_allows('22222222-0000-4000-8000-000000000013',
        'licensee_management','assign_supervision',
        'a2f00000-0000-4000-8000-000000000001', NULL, NULL,
        'd2f00000-0000-4000-8000-000000000001', NULL),
  'ASSIGNMENT_ACTOR_TARGET_FUNCTION_AWARE: the target-function check never widens the module check');

SELECT ok(NOT public.regulatory_assignment_scope_allows(
            '22222222-0000-4000-8000-000000000001','licensee_management','assign_supervision',
            NULL,'d2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001'),
  'a NULL target regulatory function fails closed');

-- ==================================================================
-- B · governed assignment routine
-- ==================================================================
SELECT public.p2_act_as('22222222-0000-4000-8000-000000000005');
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000005',
    NULL,'self service')$$,
  NULL, NULL, 'an analyst with edit permission cannot self-assign an entity');

SELECT public.p2_act_as('22222222-0000-4000-8000-000000000009');
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002',NULL,'no authority')$$,
  NULL, NULL, 'a user with no role cannot assign supervision');

SELECT public.p2_act_as('22222222-0000-4000-8000-000000000001');

SELECT isnt(public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000001',
    '22222222-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000003',
    'initial prudential ownership'), NULL,
  'the assignment manager can create a canonical prudential assignment');

SELECT is((SELECT count(*)::int FROM public.entity_supervision_assignments
            WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
              AND status='active' AND is_primary AND requires_admin_review = false),
  1, 'the governed assignment is complete and needs no administrator review');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000003',NULL,'duplicate')$$,
  NULL, NULL, 'a second current prudential owner for the same entity is rejected');

-- a DIFFERENT function on the SAME entity is legitimate (twin peaks)
SELECT isnt(public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('license_management'),
    NULL,'22222222-0000-4000-8000-000000000004',NULL,'licensing ownership'), NULL,
  'a second supervisory function may own the same entity concurrently');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000002','same person twice')$$,
  NULL, NULL, 'LEAD_EQUALS_ALTERNATE = DENIED');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000002',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002',NULL,'wrong regulator')$$,
  NULL, NULL, 'a regulator that is not the entity''s canonical regulator is rejected');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000002',NULL,'foreign team')$$,
  NULL, NULL, 'a team belonging to another regulator is rejected');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000002','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002',NULL,'uncovered sector')$$,
  NULL, NULL, 'an entity outside the activated mandate coverage is rejected');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    NULL, NULL,'22222222-0000-4000-8000-000000000002',NULL,'no function')$$,
  NULL, NULL, 'an assignment without a regulatory function is rejected');

-- ==================================================================
-- C · lead / alternate eligibility is governed
-- ==================================================================
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-00000000ffff',NULL,'ghost lead')$$,
  NULL, NULL, 'NONEXISTENT_USER_AS_LEAD = DENIED');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000006',NULL,'external lead')$$,
  NULL, NULL, 'EXTERNAL_LICENSEE_USER_AS_LEAD = DENIED');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000007',NULL,'inactive lead')$$,
  NULL, NULL, 'INACTIVE_USER_AS_LEAD = DENIED');

SELECT ok(public.regulatory_staff_identity_ok('22222222-0000-4000-8000-000000000002'),
  'an active internal officer is a valid staff identity');
SELECT ok(NOT public.regulatory_staff_identity_ok('22222222-0000-4000-8000-000000000006'),
  'an external licensee user is never a valid staff identity');
SELECT ok(NOT public.regulatory_staff_identity_ok('22222222-0000-4000-8000-000000000009'),
  'a bare user id with no profile is never a valid staff identity');

-- compatibility: until a requirement is activated, current behaviour holds
SELECT ok(public.user_meets_assignment_eligibility('22222222-0000-4000-8000-000000000008',
            public.regulatory_function_for_module('prudential_supervision'),'LEAD_SUPERVISOR'),
  'no activated requirement = certified behaviour preserved (view is sufficient)');

SELECT is((SELECT count(*)::int FROM public.regulatory_function_assignment_requirements
            WHERE status = 'active'), 0,
  'no eligibility requirement is activated by the migration itself');

UPDATE public.regulatory_function_assignment_requirements
   SET status = 'active'
 WHERE regulatory_function_id = public.regulatory_function_for_module('prudential_supervision');

SELECT ok(NOT public.user_meets_assignment_eligibility('22222222-0000-4000-8000-000000000008',
            public.regulatory_function_for_module('prudential_supervision'),'LEAD_SUPERVISOR'),
  'VIEW_ONLY_USER_AS_LEAD = DENIED once the requirement is activated');
SELECT ok(public.user_meets_assignment_eligibility('22222222-0000-4000-8000-000000000002',
            public.regulatory_function_for_module('prudential_supervision'),'LEAD_SUPERVISOR'),
  'CAPABLE_USER_AS_LEAD = ALLOWED (LEAD_ELIGIBILITY_GOVERNED)');
SELECT ok(public.user_meets_assignment_eligibility('22222222-0000-4000-8000-000000000003',
            public.regulatory_function_for_module('prudential_supervision'),'ALTERNATE_SUPERVISOR'),
  'ALTERNATE_ELIGIBILITY_GOVERNED: a capable alternate remains eligible');
SELECT ok(NOT public.user_meets_assignment_eligibility('22222222-0000-4000-8000-000000000008',
            public.regulatory_function_for_module('prudential_supervision'),'ALTERNATE_SUPERVISOR'),
  'a view-only officer is not an eligible alternate once activated');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000008',NULL,'view only lead')$$,
  NULL, NULL, 'the governed routine rejects an ineligible lead once the requirement is active');

-- portfolio of the PROPOSED OWNER must cover the entity for the target function
INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status)
SELECT 'aa200000-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000015',
       'a2f00000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'active';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sub_sector_id)
VALUES ('aa200000-0000-4000-8000-000000000002','sub_sector','c2f00000-0000-4000-8000-000000000001');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000015',NULL,'lead outside portfolio')$$,
  NULL, NULL, 'LEAD_OUTSIDE_TARGET_FUNCTION_PORTFOLIO = DENIED');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000015',
    'alternate outside portfolio')$$,
  NULL, NULL, 'ALTERNATE_OUTSIDE_TARGET_FUNCTION_PORTFOLIO = DENIED');

-- ==================================================================
-- D · team membership is not decorative
-- ==================================================================
SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000014',
    NULL,'lead not a team member')$$,
  NULL, NULL, 'TEAM_ASSIGNED_LEAD_NOT_MEMBER = DENIED');

SELECT throws_ok($$
  SELECT public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    'bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002',
    '22222222-0000-4000-8000-000000000014','alternate not a team member')$$,
  NULL, NULL, 'TEAM_ASSIGNED_ALTERNATE_NOT_MEMBER = DENIED');

SELECT ok(public.regulatory_team_membership_active('22222222-0000-4000-8000-000000000002',
            'bb200000-0000-4000-8000-000000000001'),
  'an active in-date team member is recognised');
SELECT ok(NOT public.regulatory_team_membership_active('22222222-0000-4000-8000-000000000014',
            'bb200000-0000-4000-8000-000000000001'),
  'a non-member is not recognised');

-- an assignment WITHOUT team_id remains legitimate (no team constraint applies)
SELECT isnt(public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000003','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('prudential_supervision'),
    NULL,'22222222-0000-4000-8000-000000000014',NULL,'team-free assignment'), NULL,
  'an assignment without a team does not require team membership');

-- ==================================================================
-- E · transfer / closure preserve history
-- ==================================================================
SELECT isnt(public.transfer_entity_supervision(
    (SELECT id FROM public.entity_supervision_assignments
      WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
        AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
        AND status='active'),
    'bb200000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000003',
    NULL,'portfolio rebalance'), NULL,
  'supervision can be transferred to a new lead');

SELECT is((SELECT count(*)::int FROM public.entity_supervision_assignments
            WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
              AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')),
  2, 'HISTORY_PRESERVED: the transfer kept the superseded assignment');

SELECT is((SELECT count(*)::int FROM public.entity_supervision_assignments
            WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
              AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
              AND status='active'),
  1, 'exactly one prudential assignment remains active after the transfer');

SELECT isnt((SELECT previous_assignment_id FROM public.entity_supervision_assignments
              WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
                AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
                AND status='active'), NULL,
  'the new assignment links back to the assignment it replaced');

SELECT throws_ok($$
  SELECT public.end_entity_supervision_assignment(
    (SELECT id FROM public.entity_supervision_assignments
      WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
        AND regulatory_function_id = public.regulatory_function_for_module('prudential_supervision')
        AND status='active'), NULL)$$,
  NULL, NULL, 'ending an assignment without a reason is rejected');

-- ==================================================================
-- F · multi-function (twin peaks) and cross-function leaks
-- ==================================================================
SELECT isnt(public.assign_entity_supervision(
    'd2f00000-0000-4000-8000-000000000001','a2f00000-0000-4000-8000-000000000001',
    public.regulatory_function_for_module('market_conduct'),
    'bb200000-0000-4000-8000-000000000003','22222222-0000-4000-8000-000000000010',
    NULL,'conduct ownership'), NULL,
  'MULTI_FUNCTION_ASSIGNMENTS: conduct ownership co-exists with prudential and licensing');

SELECT is((SELECT count(DISTINCT regulatory_function_id)::int
             FROM public.entity_supervision_assignments
            WHERE entity_id='d2f00000-0000-4000-8000-000000000001'
              AND status='active' AND is_primary),
  3, 'three supervisory functions own the same entity simultaneously');

SELECT ok(public.user_has_entity_assignment('22222222-0000-4000-8000-000000000003',
            'd2f00000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision')),
  'the current prudential lead is assigned for PRUDENTIAL');
SELECT ok(NOT public.user_has_entity_assignment('22222222-0000-4000-8000-000000000003',
            'd2f00000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('market_conduct')),
  'CROSS_FUNCTION_ASSIGNMENT_AUTHORITY_LEAKS = 0 (prudential lead gains no conduct authority)');
SELECT ok(NOT public.user_has_entity_assignment('22222222-0000-4000-8000-000000000010',
            'd2f00000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision')),
  'the conduct lead gains no prudential authority');
SELECT ok(NOT public.user_has_entity_assignment('22222222-0000-4000-8000-000000000003',
            'd2f00000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('enforcement_management')),
  'FUNCTION_SPECIFIC_ASSIGNMENT_LEAKS = 0 (prudential lead gains no enforcement authority)');
SELECT ok(public.user_has_entity_assignment('22222222-0000-4000-8000-000000000003',
            'd2f00000-0000-4000-8000-000000000001'),
  'the legacy 2-argument helper still answers the generic relationship question');
SELECT ok(NOT public.user_has_entity_assignment('22222222-0000-4000-8000-000000000009',
            'd2f00000-0000-4000-8000-000000000001'),
  'an unrelated user is not recognised as assigned');

-- migrated callers: a prudential owner who also holds enforcement.view must not
-- reach enforcement records through the prudential assignment
SELECT ok(public.can_read_prudential_entity('22222222-0000-4000-8000-000000000014',
            'd2f00000-0000-4000-8000-000000000003'),
  'the prudential owner can read prudential records for its entity');
SELECT ok(NOT public.can_read_enforcement('22222222-0000-4000-8000-000000000014',
            'd2f00000-0000-4000-8000-000000000003'),
  'a prudential assignment does not confer enforcement authority (migrated caller)');

-- ==================================================================
-- G · canonical tables stay closed to direct DML
-- ==================================================================
SELECT ok(has_table_privilege('authenticated','public.entity_supervision_assignments','SELECT'),
  'staff retain read access to supervision assignments');
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='entity_supervision_assignments'
      AND grantee IN ('authenticated','anon')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')),
  0, 'DIRECT_ENTITY_SUPERVISION_DML = 0');
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='regulatory_function_assignment_requirements'
      AND grantee IN ('authenticated','anon')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')),
  0, 'eligibility configuration is not writable from the client');

SELECT * FROM finish();
ROLLBACK;
