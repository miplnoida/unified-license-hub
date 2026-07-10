CREATE OR REPLACE FUNCTION public.can_view_return_filed(_user_id uuid, _return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = _user_id
    WHERE r.id = _return_id
      AND (
        r.created_by = _user_id
        OR public.has_role(_user_id, 'super_admin'::public.app_role)
        OR public.has_role(_user_id, 'admin'::public.app_role)
        OR public.has_role(_user_id, 'supervisor'::public.app_role)
        OR public.has_role(_user_id, 'analyst'::public.app_role)
        OR public.has_role(_user_id, 'licensing_officer'::public.app_role)
        OR p.role::text IN ('super_admin', 'admin', 'supervisor', 'analyst', 'licensing_officer', 'legal_compliance')
        OR (
          p.licensee_id IS NOT NULL
          AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id)
        )
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(_user_id))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(_user_id))
        OR public.external_can_access_return_filed(_user_id, r.id, 'can_submit_returns'::text)
        OR public.external_can_access_return_filed(_user_id, r.id, 'can_view_status'::text)
        OR EXISTS (
          SELECT 1
          FROM public.workflow_instances wi
          JOIN public.approval_steps s ON s.id = wi.current_step_id
          WHERE wi.entity_type IN ('return', 'returns_filed', 'return_filed')
            AND wi.entity_id = r.id
            AND wi.status = 'active'
            AND (
              (
                s.approver_type = 'specific_users'
                AND COALESCE(s.approver_config->'user_ids', '[]'::jsonb) ? _user_id::text
              )
              OR (
                s.approver_type = 'role_based_user'
                AND s.approver_role_id IN (
                  SELECT udr.role_id
                  FROM public.user_dynamic_roles udr
                  WHERE udr.user_id = _user_id
                )
              )
              OR (
                s.approver_role IS NOT NULL
                AND p.role::text = s.approver_role::text
              )
            )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_return_filed(uuid, uuid) TO authenticated, service_role;