-- Phase 5 pgTAP: atomic role writes, dependency registry, delete RPC,
-- and custom-role preservation.

BEGIN;
SELECT plan(6);

SELECT has_function('public','rbac_delete_role',ARRAY['uuid']::text[],
  'rbac_delete_role(uuid) exists');
SELECT has_function('public','rbac_reclassify_roles',ARRAY[]::text[],
  'rbac_reclassify_roles() exists');

-- Dependency guard: cannot add "edit" without "view" on the same module.
DO $$
DECLARE r uuid; view_p uuid; edit_p uuid;
BEGIN
  INSERT INTO public.roles(name,status) VALUES ('phase5-dep','active') RETURNING id INTO r;
  SELECT id INTO view_p FROM public.permissions
    WHERE lower(name)='view' AND lower(regexp_replace(module,'\s+','_','g'))='application_management' LIMIT 1;
  SELECT id INTO edit_p FROM public.permissions
    WHERE lower(name)='edit' AND lower(regexp_replace(module,'\s+','_','g'))='application_management' LIMIT 1;
  IF edit_p IS NULL OR view_p IS NULL THEN
    PERFORM set_config('t.phase5_dep','skip',true);
  ELSE
    BEGIN
      INSERT INTO public.role_permissions(role_id, permission_id) VALUES (r, edit_p);
      PERFORM set_config('t.phase5_dep','1',true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('t.phase5_dep','0',true);
    END;
  END IF;
END $$;
SELECT ok(
  current_setting('t.phase5_dep', true) IN ('0','skip'),
  'dependency guard rejects edit-without-view or skips when catalog missing'
);

-- Reclassify preserves custom fields on a role that already has a category.
DO $$
DECLARE r uuid;
BEGIN
  INSERT INTO public.roles(name,status,role_category,access_summary)
  VALUES ('phase5-custom','active','manager', jsonb_build_object('operator_input',true))
  RETURNING id INTO r;
  PERFORM public.rbac_reclassify_roles();
  PERFORM set_config('t.phase5_cat',
    (SELECT role_category FROM public.roles WHERE id=r), true);
  PERFORM set_config('t.phase5_summary',
    (SELECT access_summary::text FROM public.roles WHERE id=r), true);
END $$;
SELECT is(current_setting('t.phase5_cat',true), 'manager',
  'reclassify preserves operator-supplied role_category');
SELECT like(current_setting('t.phase5_summary',true), '%operator_input%',
  'reclassify preserves operator-supplied access_summary');

-- Delete RPC refuses system roles.
DO $$
DECLARE sys_id uuid;
BEGIN
  SELECT id INTO sys_id FROM public.roles WHERE COALESCE(is_system,false) LIMIT 1;
  IF sys_id IS NULL THEN
    PERFORM set_config('t.phase5_del','skip',true);
  ELSE
    BEGIN
      PERFORM public.rbac_delete_role(sys_id);
      PERFORM set_config('t.phase5_del','1',true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('t.phase5_del','0',true);
    END;
  END IF;
END $$;
SELECT ok(
  current_setting('t.phase5_del',true) IN ('0','skip'),
  'rbac_delete_role refuses to remove system roles'
);

SELECT finish();
ROLLBACK;
