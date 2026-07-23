
-- Add workflow_management.publish and canonicalize publish_workflow_version gate
INSERT INTO public.permissions (module, name, description, enforced) VALUES
  ('workflow_management','publish','Publish a new version of an approval workflow', true)
ON CONFLICT (module, name) DO UPDATE
SET description = EXCLUDED.description, enforced = EXCLUDED.enforced;

-- Grant the new publish action to every role that already carries workflow_management.edit
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_pub.id
FROM public.role_permissions rp
JOIN public.permissions p_edit
  ON p_edit.id = rp.permission_id
 AND p_edit.module = 'workflow_management'
 AND p_edit.name = 'edit'
CROSS JOIN LATERAL (
  SELECT id FROM public.permissions
   WHERE module = 'workflow_management' AND name = 'publish'
) p_pub
ON CONFLICT DO NOTHING;

-- Rewrite the publish RPC to use canonical RBAC helpers instead of legacy has_role('admin')
CREATE OR REPLACE FUNCTION public.publish_workflow_version(_workflow_id uuid, _notes text DEFAULT NULL)
RETURNS public.approval_workflow_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_num integer;
  _snapshot jsonb;
  _row public.approval_workflow_versions;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'workflow_management', 'publish')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX(version_number),0) + 1 INTO _next_num
    FROM public.approval_workflow_versions WHERE workflow_id = _workflow_id;

  _snapshot := public.build_workflow_snapshot(_workflow_id);

  INSERT INTO public.approval_workflow_versions
    (workflow_id, version_number, status, snapshot, notes, created_by, published_at)
  VALUES
    (_workflow_id, _next_num, 'published', _snapshot, _notes, auth.uid(), now())
  RETURNING * INTO _row;

  UPDATE public.approval_workflows
     SET current_published_version_id = _row.id,
         draft_version_id = NULL,
         updated_at = now()
   WHERE id = _workflow_id;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_workflow_version(uuid, text) TO authenticated;
