
-- Align the returns capability check with the established membership capability vocabulary
CREATE OR REPLACE FUNCTION public.entity_membership_capability(
  _user_id uuid, _entity_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH normalized AS (
    SELECT CASE _capability
             WHEN 'returns.view' THEN 'view_status'
             WHEN 'returns.submit' THEN 'submit'
             WHEN 'returns.respond' THEN 'respond_rfi'
             ELSE _capability
           END AS cap
  )
  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
      JOIN public.entity_membership_roles r ON r.id = m.membership_role_id
      LEFT JOIN public.entity_membership_role_permissions p ON p.membership_role_id = r.id
      CROSS JOIN normalized n
     WHERE m.user_id = _user_id
       AND m.entity_id = _entity_id
       AND m.status = 'APPROVED'
       AND (m.effective_to IS NULL OR m.effective_to > now())
       AND (p.capability = n.cap OR r.is_primary_representative)
  );
$$;
