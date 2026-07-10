
CREATE OR REPLACE FUNCTION public.get_complaint_current_assignees(_complaint_ids uuid[])
RETURNS TABLE (
  complaint_id uuid,
  step_role text,
  user_id uuid,
  full_name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_internal_role(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH inst AS (
    SELECT wi.entity_id AS complaint_id, wi.current_step_id
    FROM public.workflow_instances wi
    WHERE wi.entity_type = 'complaint'
      AND wi.entity_id = ANY(_complaint_ids)
      AND wi.status IN ('active', 'paused')
  ),
  step AS (
    SELECT i.complaint_id,
           s.id AS step_id,
           s.approver_role,
           s.approver_type,
           s.approver_config
    FROM inst i
    JOIN public.approval_steps s ON s.id = i.current_step_id
  ),
  specific_users AS (
    SELECT st.complaint_id, st.approver_role, (u::uuid) AS user_id
    FROM step st, jsonb_array_elements_text(COALESCE(st.approver_config->'user_ids', '[]'::jsonb)) AS u
    WHERE st.approver_type = 'specific_users'
  ),
  role_users AS (
    SELECT st.complaint_id, st.approver_role, ur.user_id
    FROM step st
    JOIN public.user_roles ur ON ur.role::text = st.approver_role
    WHERE st.approver_type = 'role_based_user' AND st.approver_role IS NOT NULL
  ),
  all_users AS (
    SELECT * FROM specific_users
    UNION
    SELECT * FROM role_users
  )
  SELECT au.complaint_id, au.approver_role, au.user_id, p.full_name, p.email
  FROM all_users au
  LEFT JOIN public.profiles p ON p.id = au.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_complaint_current_assignees(uuid[]) TO authenticated;
