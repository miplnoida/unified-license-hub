-- RBAC Slice 3 — Returns data RLS helpers
-- pgTAP suite for can_read_return_filed / can_read_return_filed_row /
-- can_mutate_return_filed across five personas.
--
-- Runs against an ephemeral supabase db instance via `supabase db test`.

BEGIN;

SELECT plan(30);

-- ---------------------------------------------------------------------
-- Fixtures — five personas:
--   u_super    : super_admin
--   u_viewall  : dynamic role with returns_management.view_all_entities
--   u_assign   : mapped as lead_regulator on licensee A only
--   u_licensee : profiles.licensee_id = licensee A
--   u_none     : unassociated
--
-- Two licensees (A, B). One config, four returns for A across editable and
-- locked lifecycles, one return for B.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u_super    uuid := '00000000-0000-0000-0000-00000000c001';
  u_viewall  uuid := '00000000-0000-0000-0000-00000000c002';
  u_assign   uuid := '00000000-0000-0000-0000-00000000c003';
  u_licensee uuid := '00000000-0000-0000-0000-00000000c004';
  u_none     uuid := '00000000-0000-0000-0000-00000000c005';
  lic_a      uuid := '00000000-0000-0000-0000-0000000d0001';
  lic_b      uuid := '00000000-0000-0000-0000-0000000d0002';
  cfg_id     uuid := '00000000-0000-0000-0000-0000000e0001';
  r_wip_a    uuid := '00000000-0000-0000-0000-0000000f0001';
  r_sub_a    uuid := '00000000-0000-0000-0000-0000000f0002';
  r_apr_a    uuid := '00000000-0000-0000-0000-0000000f0003';
  r_wip_b    uuid := '00000000-0000-0000-0000-0000000f0004';
  role_id    uuid;
  perm_id    uuid;
BEGIN
  -- super_admin
  INSERT INTO public.user_roles (user_id, role) VALUES (u_super, 'super_admin')
    ON CONFLICT DO NOTHING;

  -- dynamic role granting returns_management.view_all_entities
  INSERT INTO public.roles (name, description)
    VALUES ('rbac_slice3_viewall', 'Slice 3 view-all')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO role_id;

  INSERT INTO public.permissions (module, name)
    VALUES ('returns_management', 'view_all_entities')
    ON CONFLICT (module, name) DO UPDATE SET module = EXCLUDED.module
    RETURNING id INTO perm_id;

  INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (role_id, perm_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_dynamic_roles (user_id, role_id)
    VALUES (u_viewall, role_id) ON CONFLICT DO NOTHING;

  -- licensees with assignment for u_assign on licensee A only
  INSERT INTO public.licensees (id, name, lead_regulator_id)
    VALUES (lic_a, 'Slice3 Bank A', u_assign)
    ON CONFLICT (id) DO UPDATE SET lead_regulator_id = EXCLUDED.lead_regulator_id;
  INSERT INTO public.licensees (id, name)
    VALUES (lic_b, 'Slice3 Bank B')
    ON CONFLICT (id) DO NOTHING;

  -- profile linking u_licensee to licensee A
  INSERT INTO public.profiles (id, licensee_id)
    VALUES (u_licensee, lic_a)
    ON CONFLICT (id) DO UPDATE SET licensee_id = EXCLUDED.licensee_id;

  -- minimal return_configuration (may already exist; skip if FK cascade complexity)
  INSERT INTO public.return_configurations (id, name)
    VALUES (cfg_id, 'Slice3 Config')
    ON CONFLICT (id) DO NOTHING;

  -- returns
  INSERT INTO public.returns_filed
    (id, unique_id, return_configuration_id, return_year, return_period,
     period_start_date, period_end_date, workflow_status, status,
     entity_id, created_by)
  VALUES
    (r_wip_a, 'SLICE3-A-WIP', cfg_id, 2025, 'Q1',
     '2025-01-01', '2025-03-31', 'WIP', 'draft', lic_a, u_licensee),
    (r_sub_a, 'SLICE3-A-SUB', cfg_id, 2025, 'Q2',
     '2025-04-01', '2025-06-30', 'SUB', 'submitted', lic_a, u_licensee),
    (r_apr_a, 'SLICE3-A-APR', cfg_id, 2025, 'Q3',
     '2025-07-01', '2025-09-30', 'APR', 'approved', lic_a, u_licensee),
    (r_wip_b, 'SLICE3-B-WIP', cfg_id, 2025, 'Q1',
     '2025-01-01', '2025-03-31', 'WIP', 'draft', lic_b, u_super)
  ON CONFLICT (id) DO UPDATE SET
    entity_id       = EXCLUDED.entity_id,
    workflow_status = EXCLUDED.workflow_status,
    status          = EXCLUDED.status,
    created_by      = EXCLUDED.created_by;
END $$;

-- Local shortcuts
CREATE TEMP TABLE _s3 (k text primary key, v uuid);
INSERT INTO _s3 VALUES
  ('u_super','00000000-0000-0000-0000-00000000c001'),
  ('u_viewall','00000000-0000-0000-0000-00000000c002'),
  ('u_assign','00000000-0000-0000-0000-00000000c003'),
  ('u_licensee','00000000-0000-0000-0000-00000000c004'),
  ('u_none','00000000-0000-0000-0000-00000000c005'),
  ('r_wip_a','00000000-0000-0000-0000-0000000f0001'),
  ('r_sub_a','00000000-0000-0000-0000-0000000f0002'),
  ('r_apr_a','00000000-0000-0000-0000-0000000f0003'),
  ('r_wip_b','00000000-0000-0000-0000-0000000f0004');

-- ---------------------------------------------------------------------
-- can_read_return_filed — READ access
-- ---------------------------------------------------------------------

-- super_admin sees every return
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_super'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'super_admin reads WIP on A');
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_super'), (SELECT v FROM _s3 WHERE k='r_wip_b')),
  'super_admin reads WIP on B');

-- view_all_entities user sees every return
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_viewall'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'view_all_entities reads A WIP');
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_viewall'), (SELECT v FROM _s3 WHERE k='r_wip_b')),
  'view_all_entities reads B WIP');

-- assignment-only regulator: sees ALL statuses on A, none on B
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_assign'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'assignment-only reads WIP on mapped A (draft-status included)');
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_assign'), (SELECT v FROM _s3 WHERE k='r_sub_a')),
  'assignment-only reads SUB on mapped A');
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_assign'), (SELECT v FROM _s3 WHERE k='r_apr_a')),
  'assignment-only reads APR on mapped A');
SELECT ok(NOT public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_assign'), (SELECT v FROM _s3 WHERE k='r_wip_b')),
  'assignment-only denied on unmapped B');

-- licensee primary user: sees own licensee, not another
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'licensee reads own WIP');
SELECT ok(public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_sub_a')),
  'licensee reads own SUB');
SELECT ok(NOT public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_wip_b')),
  'licensee denied on other licensee return');

-- unassociated user: no access
SELECT ok(NOT public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_none'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'unassociated user denied on A');
SELECT ok(NOT public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_none'), (SELECT v FROM _s3 WHERE k='r_wip_b')),
  'unassociated user denied on B');

-- null/missing arguments
SELECT ok(NOT public.can_read_return_filed(NULL, (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'null uid → false');
SELECT ok(NOT public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_super'), NULL),
  'null return_id → false');
SELECT ok(NOT public.can_read_return_filed((SELECT v FROM _s3 WHERE k='u_super'), '00000000-0000-0000-0000-000000000000'::uuid),
  'unknown return_id → false');

-- ---------------------------------------------------------------------
-- can_read_return_filed_row — value-form used inside returns_filed policy
-- ---------------------------------------------------------------------
SELECT ok(public.can_read_return_filed_row(
    (SELECT v FROM _s3 WHERE k='u_assign'),
    (SELECT v FROM _s3 WHERE k='r_wip_a'),  -- entity_id doubles as lic_a here for the row form
    NULL,
    (SELECT v FROM _s3 WHERE k='u_none'),
    (SELECT v FROM _s3 WHERE k='r_wip_a')
  ) IS NOT NULL,
  'can_read_return_filed_row: returns boolean, no crash on nulls');

SELECT ok(public.can_read_return_filed_row(
    (SELECT v FROM _s3 WHERE k='u_licensee'),
    '00000000-0000-0000-0000-0000000d0001'::uuid,  -- lic_a
    NULL,
    (SELECT v FROM _s3 WHERE k='u_none'),
    NULL),
  'row-form: profiles licensee membership grants read');

SELECT ok(NOT public.can_read_return_filed_row(
    (SELECT v FROM _s3 WHERE k='u_none'),
    '00000000-0000-0000-0000-0000000d0001'::uuid,
    NULL,
    (SELECT v FROM _s3 WHERE k='u_licensee'),  -- not the caller
    NULL),
  'row-form: unassociated user denied even with created_by populated');

-- ---------------------------------------------------------------------
-- can_mutate_return_filed
-- ---------------------------------------------------------------------

-- super_admin can mutate anything
SELECT ok(public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_super'), (SELECT v FROM _s3 WHERE k='r_apr_a')),
  'super_admin can mutate APR (locked) status');

-- assignment-only regulator CANNOT mutate anything, even mapped WIP
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_assign'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'assignment-only denied mutate on mapped WIP');
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_assign'), (SELECT v FROM _s3 WHERE k='r_sub_a')),
  'assignment-only denied mutate on mapped SUB');

-- licensee primary user CAN mutate own WIP but NOT own SUB/APR
SELECT ok(public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'licensee can mutate own WIP');
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_sub_a')),
  'licensee cannot mutate own SUB (post-submission locked)');
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_apr_a')),
  'licensee cannot mutate own APR (approved locked)');

-- Licensee A user cannot mutate licensee B return
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_licensee'), (SELECT v FROM _s3 WHERE k='r_wip_b')),
  'licensee cannot mutate other licensee WIP');

-- Unassociated user
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_none'), (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'unassociated user cannot mutate WIP');

-- Nulls
SELECT ok(NOT public.can_mutate_return_filed(NULL, (SELECT v FROM _s3 WHERE k='r_wip_a')),
  'mutate: null uid denied');
SELECT ok(NOT public.can_mutate_return_filed((SELECT v FROM _s3 WHERE k='u_super'), NULL),
  'mutate: null return_id denied');

-- ---------------------------------------------------------------------
-- Policy presence checks — ensures Slice 3 rewrites are live
-- ---------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='returns_filed' AND policyname='returns_filed_read'),
  'policy returns_filed_read exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='return_form_data' AND policyname='return_form_data_read'),
  'policy return_form_data_read exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='return_uploads_read'),
  'storage policy return_uploads_read exists');

SELECT * FROM finish();
ROLLBACK;
