DO $$
DECLARE
  v_module_id uuid;
  v_action record;
  v_action_id uuid;
  v_perm_id uuid;
  v_role_id uuid;
BEGIN
  SELECT id INTO v_module_id FROM public.permission_modules WHERE key = 'document_management';
  IF v_module_id IS NULL THEN
    INSERT INTO public.permission_modules (key, label, description, audience, sort_order, is_system, is_active)
    VALUES ('document_management', 'Document Management',
            'Central regulatory document register: classification, assurance, retention and linkage.',
            'internal', 320, true, true)
    RETURNING id INTO v_module_id;
  END IF;

  FOR v_action IN
    SELECT * FROM (VALUES
      ('view',            'View Documents',                 10),
      ('download',        'Download Documents',             20),
      ('upload',          'Upload Documents',               30),
      ('create_version',  'Create Document Version',        40),
      ('edit_metadata',   'Edit Document Details',          50),
      ('classify',        'Classify Documents',             60),
      ('verify',          'Verify Documents',               70),
      ('accept',          'Accept Documents',               80),
      ('reject',          'Reject Documents',               90),
      ('archive',         'Archive Documents',             100),
      ('restore',         'Restore Documents',             110),
      ('soft_delete',     'Delete Documents',              120),
      ('link_record',     'Link Documents to Records',     130),
      ('bulk_manage',     'Bulk Document Operations',      140),
      ('view_internal',   'View Internal Documents',       150),
      ('view_restricted', 'View Restricted Documents',     160),
      ('manage_holds',    'Manage Legal Holds',            170),
      ('manage_retention','Manage Retention',              180),
      ('manage_taxonomy', 'Manage Document Taxonomy',      190),
      ('view_audit',      'View Document History',         200),
      ('export',          'Export Document Register',      210),
      ('manage_config',   'Configure Document Management', 220)
    ) AS t(action_key, action_label, ord)
  LOOP
    SELECT id INTO v_action_id FROM public.permission_actions
     WHERE module_id = v_module_id AND key = v_action.action_key;
    IF v_action_id IS NULL THEN
      INSERT INTO public.permission_actions (module_id, key, label, audience, sort_order, is_system, is_active)
      VALUES (v_module_id, v_action.action_key, v_action.action_label, 'internal', v_action.ord, true, true)
      RETURNING id INTO v_action_id;
    END IF;

    SELECT id INTO v_perm_id FROM public.permissions
     WHERE module = 'document_management' AND name = v_action.action_key;
    IF v_perm_id IS NULL THEN
      INSERT INTO public.permissions (module, name, description, action_id, enforced, deprecated)
      VALUES ('document_management', v_action.action_key,
              v_action.action_label || ' (Document Management)', v_action_id, true, false)
      RETURNING id INTO v_perm_id;
    ELSE
      UPDATE public.permissions SET action_id = v_action_id WHERE id = v_perm_id;
    END IF;
  END LOOP;

  -- Super admin: full document authority.
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'super_admin';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id FROM public.permissions p
     WHERE p.module = 'document_management'
       AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                        WHERE rp.role_id = v_role_id AND rp.permission_id = p.id);
  END IF;

  -- Admin: operational authority, excluding restricted-confidentiality reads.
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'admin';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id FROM public.permissions p
     WHERE p.module = 'document_management'
       AND p.name NOT IN ('view_restricted', 'manage_config')
       AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                        WHERE rp.role_id = v_role_id AND rp.permission_id = p.id);
  END IF;
END $$;