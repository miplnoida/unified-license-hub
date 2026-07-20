
CREATE OR REPLACE FUNCTION public.can_view_return_filed(_user_id uuid, _return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = _user_id
    WHERE r.id = _return_id
      AND (
        r.created_by = _user_id
        OR public.can_view_entity_returns(_user_id, r.entity_id)
        OR public.can_view_entity_returns(_user_id, r.on_behalf_of_licensee_id)
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
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(s.approver_config->'user_ids', '[]'::jsonb)) AS assigned(user_id)
                  WHERE assigned.user_id = _user_id::text
                )
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
$function$;

DROP POLICY IF EXISTS "read return analysis" ON public.return_consolidated_analysis;
CREATE POLICY "read return analysis" ON public.return_consolidated_analysis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns_filed rf
      WHERE rf.id = return_consolidated_analysis.return_id
        AND (
          public.can_view_entity_returns(auth.uid(), rf.entity_id)
          OR public.can_view_entity_returns(auth.uid(), rf.on_behalf_of_licensee_id)
          OR rf.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.entity_user_access eua
            WHERE eua.user_id = auth.uid()
              AND eua.is_active = true
              AND eua.entity_id = COALESCE(rf.on_behalf_of_licensee_id, rf.entity_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS "rua_select_owner_or_staff" ON public.return_upload_attempts;
CREATE POLICY "rua_select_owner_or_staff" ON public.return_upload_attempts
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      licensee_id IS NOT NULL
      AND (
        public.can_view_entity_returns(auth.uid(), licensee_id)
        OR public.can_current_user_access_licensee(licensee_id, NULL::uuid)
      )
    )
  );
