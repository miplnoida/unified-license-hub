WITH pick AS (
  SELECT DISTINCT ON (s.id)
    s.id AS step_id, r.id AS role_id
  FROM public.approval_steps s
  JOIN public.roles r
    ON r.system_role::text = s.approver_role::text
  WHERE s.approver_role_id IS NULL
    AND COALESCE(s.approver_type, 'role_based_user') = 'role_based_user'
  ORDER BY s.id, r.is_system DESC, r.created_at ASC
)
UPDATE public.approval_steps s
SET approver_role_id = pick.role_id,
    approver_config = CASE
      WHEN s.approver_config IS NULL OR s.approver_config = '{}'::jsonb
        THEN jsonb_build_object('role_ids', jsonb_build_array(pick.role_id::text))
      ELSE s.approver_config
    END
FROM pick
WHERE s.id = pick.step_id;