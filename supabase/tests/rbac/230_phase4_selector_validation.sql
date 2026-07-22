-- Phase 4 pgTAP: selector validation, unsupported scopes, inactive-role
-- enforcement. Verifies that role saves and role assignments cannot bypass
-- server-side guards.

BEGIN;
SELECT plan(8);

SELECT has_function('public','validate_scope_config',ARRAY['jsonb']::text[],
  'validate_scope_config(jsonb) exists');

-- Valid config for a supported module returns no rows.
SELECT is(
  (SELECT count(*)::int FROM public.validate_scope_config(
    jsonb_build_object('complaint_management', jsonb_build_object('scope','all'))
  )),
  0,
  'scope=all on a registered module validates clean'
);

-- Unsupported scope kind for module is rejected.
SELECT isnt(
  (SELECT count(*)::int FROM public.validate_scope_config(
    jsonb_build_object('complaint_management', jsonb_build_object('scope','team'))
  )),
  0,
  'unregistered scope kind is rejected'
);

-- Institution scope with an unknown licensee id is rejected.
SELECT isnt(
  (SELECT count(*)::int FROM public.validate_scope_config(
    jsonb_build_object(
      'licensee_management',
      jsonb_build_object(
        'scope','institution',
        'licensees', jsonb_build_array('00000000-0000-0000-0000-000000000000')
      )
    )
  )),
  0,
  'institution scope with unknown licensee id is rejected'
);

-- Institution scope with empty selector array is rejected.
SELECT isnt(
  (SELECT count(*)::int FROM public.validate_scope_config(
    jsonb_build_object(
      'licensee_management',
      jsonb_build_object('scope','institution','licensees', '[]'::jsonb)
    )
  )),
  0,
  'institution scope with empty licensee array is rejected'
);

-- Trigger: saving a role with an invalid scope_config throws.
DO $$
DECLARE role_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.roles (name, status, scope_config)
    VALUES ('phase4-invalid', 'active',
            jsonb_build_object('complaint_management', jsonb_build_object('scope','team')))
    RETURNING id INTO role_id;
    PERFORM set_config('t.phase4_role_saved','1',true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('t.phase4_role_saved','0',true);
  END;
END $$;
SELECT is(current_setting('t.phase4_role_saved',true), '0',
  'trigger rejects role insert with unregistered scope kind');

-- Trigger: assigning an inactive role throws.
DO $$
DECLARE r uuid; u uuid := '66666666-6666-6666-6666-666666666666';
BEGIN
  INSERT INTO auth.users(id,email) VALUES (u,'phase4-inactive@test.local') ON CONFLICT DO NOTHING;
  INSERT INTO public.roles(name,status) VALUES ('phase4-inactive-role','inactive') RETURNING id INTO r;
  BEGIN
    INSERT INTO public.user_dynamic_roles(user_id, role_id) VALUES (u, r);
    PERFORM set_config('t.phase4_assigned','1',true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('t.phase4_assigned','0',true);
  END;
END $$;
SELECT is(current_setting('t.phase4_assigned',true), '0',
  'trigger rejects assignment of an inactive role');

-- Reactivating a role whose scope_config no longer validates should throw.
-- We simulate by inserting a role with a valid scope, deleting the referenced
-- licensee, then flipping status back to active.
DO $$
DECLARE r uuid; lic uuid := '77777777-7777-7777-7777-77777777lic1';
BEGIN
  INSERT INTO public.licensees(id,name,status) VALUES (lic,'phase4-lic','active') ON CONFLICT DO NOTHING;
  INSERT INTO public.roles(name,status,scope_config)
  VALUES('phase4-reactivate','inactive',
    jsonb_build_object('licensee_management', jsonb_build_object(
      'scope','institution','licensees', jsonb_build_array(lic::text))))
  RETURNING id INTO r;
  DELETE FROM public.licensees WHERE id = lic;
  BEGIN
    UPDATE public.roles SET status='active' WHERE id=r;
    PERFORM set_config('t.phase4_reactivated','1',true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('t.phase4_reactivated','0',true);
  END;
END $$;
SELECT is(current_setting('t.phase4_reactivated',true), '0',
  'trigger blocks reactivation when scope_config references deleted rows');

SELECT finish();
ROLLBACK;
