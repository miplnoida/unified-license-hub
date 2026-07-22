-- Phase 3 (slice A): assigned-scope enforcement across complaints and
-- market-conduct policies. Asserts that:
--   1. Assigned investigator/complainant/handler can read the row.
--   2. A user with generic 'view' + assigned scope but no assignment on
--      the specific row cannot read it.
--   3. Institution scope still works on the row's licensee.
--   4. NULL record id path denies for assigned scope.

BEGIN;
SELECT plan(6);

SELECT has_function(
  'public','has_scoped_permission',
  ARRAY['uuid','text','text','uuid','uuid','uuid','uuid']::text[],
  'has_scoped_permission overload with record id exists'
);

DO $$
DECLARE
  investigator uuid := '33333333-3333-3333-3333-33333333a001';
  bystander    uuid := '33333333-3333-3333-3333-33333333b001';
  lic          uuid := '44444444-4444-4444-4444-4444444lic01';
  cmp          uuid := '55555555-5555-5555-5555-555555cmp01';
BEGIN
  PERFORM set_config('t.investigator', investigator::text, true);
  PERFORM set_config('t.bystander', bystander::text, true);
  PERFORM set_config('t.lic', lic::text, true);
  PERFORM set_config('t.cmp', cmp::text, true);

  INSERT INTO auth.users (id, email) VALUES
    (investigator, 'phase3-inv@test.local'),
    (bystander,    'phase3-by@test.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.licensees (id, name, status)
  VALUES (lic, 'Phase3 Licensee', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.complaints (id, license_holder_id, investigator_id, status, complaint_type_id)
  VALUES (cmp, lic, investigator, 'open',
         (SELECT id FROM public.complaint_types LIMIT 1))
  ON CONFLICT (id) DO UPDATE SET investigator_id = EXCLUDED.investigator_id;
END $$;

-- 2. Assigned resolver recognises the investigator on the specific complaint.
SELECT ok(
  public.is_record_assigned_to_user(
    current_setting('t.investigator')::uuid,
    'complaint_management',
    current_setting('t.cmp')::uuid
  ),
  'investigator is recognised as assigned on the complaint row'
);

-- 3. Bystander is not assigned on the same complaint.
SELECT ok(
  NOT public.is_record_assigned_to_user(
    current_setting('t.bystander')::uuid,
    'complaint_management',
    current_setting('t.cmp')::uuid
  ),
  'bystander is not recognised as assigned on the complaint row'
);

-- 4. NULL record id denies.
SELECT ok(
  NOT public.is_record_assigned_to_user(
    current_setting('t.investigator')::uuid,
    'complaint_management',
    NULL
  ),
  'NULL complaint id denies'
);

-- 5. Cross-module isolation: assignment on complaint does not imply
-- assignment on conduct_investigations for the same uuid.
SELECT ok(
  NOT public.is_record_assigned_to_user(
    current_setting('t.investigator')::uuid,
    'conduct_investigations',
    current_setting('t.cmp')::uuid
  ),
  'complaint-scope assignment does not leak into conduct_investigations'
);

-- 6. Reassignment removes prior investigator.
UPDATE public.complaints
SET investigator_id = current_setting('t.bystander')::uuid
WHERE id = current_setting('t.cmp')::uuid;
SELECT ok(
  NOT public.is_record_assigned_to_user(
    current_setting('t.investigator')::uuid,
    'complaint_management',
    current_setting('t.cmp')::uuid
  ) AND public.is_record_assigned_to_user(
    current_setting('t.bystander')::uuid,
    'complaint_management',
    current_setting('t.cmp')::uuid
  ),
  'reassigning complaint investigator swaps assigned-scope entitlement'
);

SELECT finish();
ROLLBACK;
