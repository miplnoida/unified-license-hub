
-- Reset approver_role_id where the legacy approver_role maps to multiple roles
UPDATE public.approval_steps s
   SET approver_role_id = NULL
 WHERE s.approver_role_id IS NOT NULL
   AND (
     SELECT count(*) FROM public.roles r
      WHERE r.system_role = s.approver_role::text
   ) > 1
   AND NOT EXISTS (
     -- Don't unset if user appears to have intentionally configured (role's name doesn't match the bare system role)
     SELECT 1 FROM public.roles r
      WHERE r.id = s.approver_role_id
        AND lower(r.name) LIKE '%' || lower(s.approver_role::text) || '%'
   );
