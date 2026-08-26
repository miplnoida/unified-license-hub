-- MC-04 needs an explicit "approve" authority in complaint management: the
-- quality-review and closure operations ask for it, but the permission never
-- existed in the catalogue, so no role could hold it.
INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, 'approve', 'Approve Quality Review & Closure',
       'Record the quality-review decision and approve closure of a complaint.',
       55, true, true, true, true
FROM public.sec_modules m WHERE m.key = 'complaint_management'
ON CONFLICT DO NOTHING;

-- Grant it to every role already trusted to close complaints.
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT rp.role_id, pa.id
FROM public.sec_role_permissions rp
JOIN public.sec_permissions pc ON pc.id = rp.permission_id AND pc.key = 'close'
JOIN public.sec_modules m ON m.id = pc.module_id AND m.key = 'complaint_management'
JOIN public.sec_permissions pa ON pa.module_id = m.id AND pa.key = 'approve'
ON CONFLICT DO NOTHING;

-- Restore the alias table to its canonical form now that "approve" is a real
-- permission (the scope check uses has_permission, so aliasing would diverge).
CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH aliased AS (
    SELECT CASE
             WHEN _action = 'view_all' THEN ARRAY['view']
             WHEN _action = 'triage'   THEN ARRAY['triage','assign','edit','investigate']
             ELSE ARRAY[_action]
           END AS actions
  )
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM aliased a, unnest(a.actions) AS act(action_key)
      WHERE public.sec_has_permission(_user_id, 'complaint_management', act.action_key)
    )
  );
$function$;