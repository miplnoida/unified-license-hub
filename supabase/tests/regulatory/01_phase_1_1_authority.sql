-- REGULATORY OPERATING STRUCTURE · Phase 1.1 — authority hardening assertions.
-- Proves: RBAC is the only source of authority, the mandate/portfolio/team
-- layers only narrow, they are function-aware, NULL record dimensions fail
-- closed, entity scope is derived server-side, and enforcement is inert until
-- explicitly activated.
BEGIN;
SELECT plan(40);

-- ------------------------------------------------------------------
-- fixtures
-- ------------------------------------------------------------------
INSERT INTO public.regulators (id, name, code, status, settings) VALUES
  ('a0000000-0000-4000-8000-000000000001','ROS Test Regulator A','ROSTA','active','{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000002','ROS Test Regulator B','ROSTB','active','{}'::jsonb);

INSERT INTO public.sectors (id, name, status, regulator_id) VALUES
  ('b0000000-0000-4000-8000-000000000001','ROS Banking','active','a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002','ROS Insurance','active','a0000000-0000-4000-8000-000000000001');

INSERT INTO public.sub_sectors (id, sector_id, name, status) VALUES
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','ROS Commercial Banks','active'),
  ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','ROS Merchant Banks','active');

INSERT INTO public.licensees (id, name, status, sector_id, sub_sector_id) VALUES
  ('d0000000-0000-4000-8000-000000000001','ROS Entity One','active',
     'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002','ROS Entity Two','active',
     'b0000000-0000-4000-8000-000000000002', NULL);

-- roles: prudential view (scope all) and licensing view (scope all)
INSERT INTO public.sec_roles (id, key, name, role_type, status) VALUES
  ('e0000000-0000-4000-8000-000000000001','ros_test_prudential','ROS Test Prudential','internal','active'),
  ('e0000000-0000-4000-8000-000000000002','ros_test_licensing','ROS Test Licensing','internal','active'),
  ('e0000000-0000-4000-8000-000000000003','ros_test_prud_team','ROS Test Prudential Team Scope','internal','active'),
  ('e0000000-0000-4000-8000-000000000004','ros_test_prud_split','ROS Test Prudential Split Grants','internal','active');

INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.sec_permissions p
JOIN public.sec_modules m ON m.id = p.module_id
JOIN (VALUES
        ('e0000000-0000-4000-8000-000000000001'::uuid,'prudential_supervision'),
        ('e0000000-0000-4000-8000-000000000002'::uuid,'license_management'),
        ('e0000000-0000-4000-8000-000000000003'::uuid,'prudential_supervision'),
        ('e0000000-0000-4000-8000-000000000004'::uuid,'prudential_supervision')
     ) AS r(id, module) ON lower(m.key) = r.module
WHERE p.key = 'view';

-- scope: 'all' for the two baseline roles
INSERT INTO public.sec_role_scopes (id, role_id, module_id, scope_type_id)
SELECT gen_random_uuid(), x.role_id, m.id, st.id
FROM (VALUES
        ('e0000000-0000-4000-8000-000000000001'::uuid,'prudential_supervision','all'),
        ('e0000000-0000-4000-8000-000000000002'::uuid,'license_management','all'),
        ('e0000000-0000-4000-8000-000000000003'::uuid,'prudential_supervision','team')
     ) AS x(role_id, module, scope)
JOIN public.sec_modules m ON lower(m.key) = x.module
JOIN public.sec_scope_types st ON st.key = x.scope;

-- split grants: sector(ROS Banking) + institution(Entity Two) on one role
INSERT INTO public.sec_role_scopes (id, role_id, module_id, scope_type_id)
SELECT 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', m.id, st.id
FROM public.sec_modules m, public.sec_scope_types st
WHERE lower(m.key)='prudential_supervision' AND st.key='sector';
INSERT INTO public.sec_role_scope_values (role_scope_id, value_kind, value_id)
VALUES ('f0000000-0000-4000-8000-000000000001','sector','b0000000-0000-4000-8000-000000000001');

-- users
INSERT INTO public.sec_user_roles (user_id, role_id, status) VALUES
  ('11111111-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','active'), -- prudential all
  ('11111111-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','active'), -- licensing all
  ('11111111-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000003','active'), -- prudential team scope
  ('11111111-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000004','active'); -- prudential sector grant
-- '11111111-0000-4000-8000-000000000009' deliberately has NO role at all

-- ------------------------------------------------------------------
-- module -> regulatory function mapping
-- ------------------------------------------------------------------
SELECT isnt(public.regulatory_function_for_module('prudential_supervision'), NULL,
  'prudential module resolves to a regulatory function');
SELECT isnt(public.regulatory_function_for_module('license_management'), NULL,
  'licensing module resolves to a regulatory function');
SELECT isnt(public.regulatory_function_for_module('prudential_supervision'),
            public.regulatory_function_for_module('license_management'),
  'licensing and prudential resolve to DIFFERENT regulatory functions');
SELECT is(public.regulatory_function_for_module('not_a_real_module'), NULL,
  'an unmapped module does not invent a regulatory function');
SELECT is((public.regulatory_function_mapping_report() ->> 'unmapped_regulatory_function_modules')::int,
  0, 'every active regulatory function maps to a canonical sec_module');
SELECT is((public.regulatory_function_mapping_report() ->> 'duplicate_module_to_function_mappings')::int,
  0, 'no module maps to two regulatory functions');

-- ------------------------------------------------------------------
-- 1..3 · narrowing layers never grant authority
-- ------------------------------------------------------------------
-- valid mandate + no RBAC permission
INSERT INTO public.regulator_mandates (regulator_id, regulatory_function_id, sector_id, responsibility_type, status)
SELECT 'a0000000-0000-4000-8000-000000000001', public.regulatory_function_for_module('prudential_supervision'),
       'b0000000-0000-4000-8000-000000000001','LEAD','active';
INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id, enforcement_status, activated_at)
SELECT 'a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'), 'ACTIVE', now();

SELECT ok(NOT public.regulatory_scope_allows('11111111-0000-4000-8000-000000000009',
            'prudential_supervision','view', NULL, NULL, NULL,'d0000000-0000-4000-8000-000000000001'),
  'missing RBAC permission + valid mandate = DENIED');

INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status)
SELECT 'aa000000-0000-4000-8000-000000000009','11111111-0000-4000-8000-000000000009',
       'a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'active';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, entity_id)
VALUES ('aa000000-0000-4000-8000-000000000009','entity','d0000000-0000-4000-8000-000000000001');

SELECT ok(NOT public.regulatory_scope_allows('11111111-0000-4000-8000-000000000009',
            'prudential_supervision','view', NULL, NULL, NULL,'d0000000-0000-4000-8000-000000000001'),
  'missing RBAC permission + valid portfolio = DENIED');

INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),
       'ROS-PRUD-TEAM','ROS Prudential Team','active';
INSERT INTO public.regulatory_team_mandates (team_id, regulator_mandate_id)
SELECT 'bb000000-0000-4000-8000-000000000001', m.id FROM public.regulator_mandates m
WHERE m.regulator_id='a0000000-0000-4000-8000-000000000001';
INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status) VALUES
  ('bb000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000009','member','active'),
  ('bb000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000003','member','active');
INSERT INTO public.entity_supervision_assignments (entity_id, team, status)
VALUES ('d0000000-0000-4000-8000-000000000001','ROS-PRUD-TEAM','active');

SELECT ok(NOT public.regulatory_scope_allows('11111111-0000-4000-8000-000000000009',
            'prudential_supervision','view', NULL, NULL, NULL,'d0000000-0000-4000-8000-000000000001'),
  'missing RBAC permission + team membership = DENIED');

-- ------------------------------------------------------------------
-- 4..5 · cross-function leaks · documented mandate semantics
--
-- MANDATE_INERT_BEFORE_ACTIVATION: while the regulator + function mandate set
-- is not activated the mandate LAYER is inert and returns true. That is not a
-- grant: authority still requires the canonical RBAC permission (proved above),
-- so an inert mandate can never widen authority.
-- MANDATE_ENFORCED_AFTER_ACTIVATION: once activated for that function, the
-- absence of a covering mandate denies, and a mandate belonging to another
-- regulatory function never satisfies it.
-- ------------------------------------------------------------------
SELECT ok(public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('license_management'),
            'b0000000-0000-4000-8000-000000000001', NULL),
  'MANDATE_INERT_BEFORE_ACTIVATION: the Licensing mandate layer is inert (never a grant, never a false narrow)');

-- an ACTIVE licensing enforcement set with no licensing mandate must deny
INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id, enforcement_status, activated_at)
SELECT 'a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('license_management'), 'ACTIVE', now();
SELECT ok(NOT public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('license_management'),
            'b0000000-0000-4000-8000-000000000001', NULL),
  'MANDATE_ENFORCED_AFTER_ACTIVATION: no licensing mandate = DENIED (CROSS_FUNCTION_MANDATE_LEAK = 0)');


-- A portfolio is scoped to its own regulatory function. It is NEVER a source of
-- authority: a prudential portfolio authorises nothing under Licensing, and for
-- the Licensing function it is simply not applicable (documented inert
-- compatibility semantics) rather than silently narrowing certified behaviour.
SELECT ok(NOT public.regulatory_scope_allows('11111111-0000-4000-8000-000000000009',
            'license_management','view', NULL, NULL, NULL,
            'd0000000-0000-4000-8000-000000000001'),
  'a prudential portfolio does not satisfy a licensing action');
SELECT ok(public.staff_portfolio_allows('11111111-0000-4000-8000-000000000009',
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('license_management'),
            'b0000000-0000-4000-8000-000000000001', NULL, NULL),
  'a prudential portfolio is not applicable to the Licensing function (inert, never narrowing)');

-- ------------------------------------------------------------------
-- 6..8 · sector / sub-sector semantics
-- ------------------------------------------------------------------
SELECT ok(NOT public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000002', NULL),
  'sector mandate does not satisfy an unrelated sector');

INSERT INTO public.regulator_mandates (regulator_id, regulatory_function_id, sector_id, sub_sector_id, responsibility_type, status)
SELECT 'a0000000-0000-4000-8000-000000000002', public.regulatory_function_for_module('prudential_supervision'),
       'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','LEAD','active';
INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id, enforcement_status, activated_at)
SELECT 'a0000000-0000-4000-8000-000000000002',
       public.regulatory_function_for_module('prudential_supervision'), 'ACTIVE', now();

SELECT ok(NOT public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000002',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002'),
  'sub-sector mandate does not satisfy a sibling sub-sector');
SELECT ok(NOT public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000002',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000001', NULL),
  'sub-sector mandate FAILS CLOSED when the record sub-sector is unknown');
SELECT ok(public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000002',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001'),
  'sub-sector mandate matches its own sub-sector');

-- ------------------------------------------------------------------
-- 9..10 · server-side entity scope derivation
-- ------------------------------------------------------------------
SELECT is((public.entity_regulatory_scope('d0000000-0000-4000-8000-000000000001') ->> 'sector_id')::uuid,
  'b0000000-0000-4000-8000-000000000001'::uuid, 'entity id derives the canonical sector');
SELECT is((public.entity_regulatory_scope('d0000000-0000-4000-8000-000000000001') ->> 'sub_sector_id')::uuid,
  'c0000000-0000-4000-8000-000000000001'::uuid, 'entity id derives the canonical sub-sector');
SELECT is((public.entity_regulatory_scope('d0000000-0000-4000-8000-000000000001') ->> 'regulator_id')::uuid,
  'a0000000-0000-4000-8000-000000000001'::uuid, 'entity id derives the canonical regulator');

SELECT ok(NOT public.regulatory_scope_allows('11111111-0000-4000-8000-000000000001',
            'prudential_supervision','view', NULL,
            'b0000000-0000-4000-8000-000000000002', NULL,
            'd0000000-0000-4000-8000-000000000001'),
  'caller-supplied sector conflicting with the entity sector = DENIED');

SELECT ok(public.regulatory_scope_allows('11111111-0000-4000-8000-000000000001',
            'prudential_supervision','view', NULL, NULL, NULL,
            'd0000000-0000-4000-8000-000000000001'),
  'prudential officer with scope=all is allowed on a covered entity');

-- ------------------------------------------------------------------
-- 11..13 · mandate expiry and explicit activation
-- ------------------------------------------------------------------
SELECT ok(public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('complaint_management'),
            'b0000000-0000-4000-8000-000000000001', NULL),
  'DRAFT/absent enforcement set does not narrow certified behaviour');

INSERT INTO public.regulator_mandates (regulator_id, regulatory_function_id, sector_id, responsibility_type, status, effective_from, effective_to)
SELECT 'a0000000-0000-4000-8000-000000000001', public.regulatory_function_for_module('market_conduct'),
       'b0000000-0000-4000-8000-000000000001','LEAD','active', now() - interval '2 years', now() - interval '1 day';
INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id, enforcement_status, activated_at)
SELECT 'a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('market_conduct'), 'ACTIVE', now();
SELECT ok(NOT public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('market_conduct'),
            'b0000000-0000-4000-8000-000000000001', NULL),
  'expired mandate = DENIED once enforcement is active');

SELECT ok(public.regulator_mandate_supports(
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  'active mandate enforcement set narrows correctly (covered combination allowed)');

-- ------------------------------------------------------------------
-- 14..18 · portfolio semantics
-- ------------------------------------------------------------------
SELECT ok(public.staff_portfolio_allows('11111111-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000001', NULL, NULL),
  'no applicable portfolio = compatibility behaviour preserved (inert)');

INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status)
SELECT 'aa000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000004',
       'a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('prudential_supervision'),'active';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sub_sector_id)
VALUES ('aa000000-0000-4000-8000-000000000001','sub_sector','c0000000-0000-4000-8000-000000000001');

SELECT ok(NOT public.staff_portfolio_allows('11111111-0000-4000-8000-000000000004',
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000002', NULL, NULL),
  'applicable portfolio + wrong sector = DENIED');
SELECT ok(NOT public.staff_portfolio_allows('11111111-0000-4000-8000-000000000004',
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision'),
            'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', NULL),
  'applicable portfolio + wrong sub-sector = DENIED');
SELECT ok(NOT public.staff_portfolio_allows('11111111-0000-4000-8000-000000000009',
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision'),
            NULL, NULL,'d0000000-0000-4000-8000-000000000002'),
  'applicable portfolio + wrong entity = DENIED');

INSERT INTO public.staff_portfolios (id, user_id, regulator_id, regulatory_function_id, status, effective_from, effective_to)
SELECT 'aa000000-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000002',
       'a0000000-0000-4000-8000-000000000001',
       public.regulatory_function_for_module('license_management'),'active',
       now() - interval '2 years', now() - interval '1 day';
INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sector_id)
VALUES ('aa000000-0000-4000-8000-000000000002','sector','b0000000-0000-4000-8000-000000000001');
SELECT ok(public.staff_portfolio_allows('11111111-0000-4000-8000-000000000002',
            'a0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('license_management'),
            'b0000000-0000-4000-8000-000000000002', NULL, NULL),
  'expired portfolio does not authorise and does not narrow (treated as absent)');

-- contradictory portfolio scope rows are rejected outright
SELECT throws_ok(
  $$INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sector_id, entity_id)
    VALUES ('aa000000-0000-4000-8000-000000000001','sector','b0000000-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000001')$$,
  NULL, NULL, 'mixed sector+entity portfolio scope is rejected');

-- ------------------------------------------------------------------
-- 19..22 · team semantics
-- ------------------------------------------------------------------
SELECT ok(public.user_team_covers_entity('11111111-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision')),
  'active prudential team membership covers the assigned entity');
SELECT ok(NOT public.user_team_covers_entity('11111111-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('license_management')),
  'team from the wrong regulatory function = DENIED');
SELECT ok(NOT public.user_team_covers_entity('11111111-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000002',
            public.regulatory_function_for_module('prudential_supervision')),
  'another entity cannot be reached through this team assignment');

INSERT INTO public.regulatory_teams (id, regulator_id, regulatory_function_id, code, name, status)
SELECT 'bb000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',
       public.regulatory_function_for_module('prudential_supervision'),
       'ROS-PRUD-TEAM','ROS Prudential Team (other regulator)','active';
INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status)
VALUES ('bb000000-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000002','member','active');
SELECT ok(NOT public.user_team_covers_entity('11111111-0000-4000-8000-000000000002',
            'd0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision')),
  'team belonging to the wrong regulator = DENIED');

INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status, effective_from, effective_to)
VALUES ('bb000000-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','member','active',
        now() - interval '2 years', now() - interval '1 day');
SELECT ok(NOT public.user_team_covers_entity('11111111-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000001',
            public.regulatory_function_for_module('prudential_supervision')),
  'expired team membership is not a coverage source');

-- ------------------------------------------------------------------
-- 23..25 · independent grants, administrator, break-glass
-- ------------------------------------------------------------------
SELECT ok((public.user_scope_grants_for('11111111-0000-4000-8000-000000000004',
             'prudential_supervision','view') -> 'sectors')
          @> to_jsonb('b0000000-0000-4000-8000-000000000001'::uuid),
  'independent sector grant survives in user_scope_grants_for');
SELECT ok(NOT COALESCE((public.user_scope_grants_for('11111111-0000-4000-8000-000000000004',
             'prudential_supervision','view') ->> 'all')::boolean, false),
  'a sector-restricted grant is never reported as scope=all');

SELECT ok(NOT public.is_super_admin('11111111-0000-4000-8000-000000000001'),
  'an ordinary internal role is not a business-authority bypass');
SELECT ok(NOT public.regulatory_scope_allows('11111111-0000-4000-8000-000000000002',
            'prudential_supervision','view', NULL, NULL, NULL,
            'd0000000-0000-4000-8000-000000000001'),
  'a licensing role cannot act on a prudential record (no cross-function widening)');

SELECT * FROM finish();
ROLLBACK;
