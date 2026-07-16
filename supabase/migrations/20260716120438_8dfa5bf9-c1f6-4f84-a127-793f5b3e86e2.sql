
-- Seed default review_step_permissions for complaint workflow steps that have none.
-- Grants view/comment/reply/suggest/resolve to key regulator roles; full rights to Super Admin & System Administrator.

WITH complaint_steps AS (
  SELECT s.id AS step_id, s.workflow_id
  FROM public.approval_steps s
  JOIN public.approval_workflows w ON w.id = s.workflow_id
  WHERE w.entity_type = 'complaint'
    AND NOT EXISTS (
      SELECT 1 FROM public.review_step_permissions p WHERE p.step_id = s.id
    )
),
role_defaults AS (
  SELECT id AS role_id, name,
    CASE WHEN name IN ('Super Admin','System Administrator') THEN true ELSE false END AS is_admin
  FROM public.roles
  WHERE name IN (
    'Super Admin','System Administrator',
    'Legal/Compliance Reviewer','Analyst','Investigator',
    'Market Conduct Supervisor','Licensing Officer','Licensing Supervisor',
    'Executive Supervisor','Approver / Decision-Maker','Approver/Decision-Maker'
  )
)
INSERT INTO public.review_step_permissions (
  workflow_id, step_id, role_id, enabled,
  can_view, can_comment, can_reply, can_suggest,
  can_accept, can_reject, can_resolve, can_mark_blocking,
  block_approval_on_unresolved_blocking
)
SELECT cs.workflow_id, cs.step_id, rd.role_id, true,
  true, true, true, true,
  rd.is_admin, rd.is_admin, true, rd.is_admin,
  rd.is_admin
FROM complaint_steps cs
CROSS JOIN role_defaults rd;
