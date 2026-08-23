-- P08 conduct authority: makers must be able to record findings and run the
-- investigation workspace. Adds the missing market_conduct.edit capability and
-- projects conduct persona authority through the governed catalogue.

INSERT INTO public.sec_permissions (module_id, key, label, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, 'edit', 'Edit', false, true, true, true
FROM public.sec_modules m WHERE m.key = 'market_conduct'
ON CONFLICT DO NOTHING;

WITH target AS (
  SELECT p.id AS permission_id, r.id AS role_id, t.id AS template_id, r.key AS role_key
  FROM public.sec_roles r
  LEFT JOIN public.sec_role_templates t ON t.key = r.key
  JOIN public.sec_permissions p ON true
  JOIN public.sec_modules m ON m.id = p.module_id
  WHERE r.key IN ('conduct_analyst','conduct_supervisor')
    AND (
      (m.key = 'market_conduct' AND p.key = 'edit')
      OR (m.key = 'market_conduct_investigation'
          AND p.key IN ('view','access_investigation_workspace','conduct_interviews',
                        'manage_evidence_repository','prepare_investigation_report'))
    )
)
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT role_id, permission_id FROM target
ON CONFLICT DO NOTHING;

WITH target AS (
  SELECT p.id AS permission_id, t.id AS template_id
  FROM public.sec_role_templates t
  JOIN public.sec_permissions p ON true
  JOIN public.sec_modules m ON m.id = p.module_id
  WHERE t.key IN ('conduct_analyst','conduct_supervisor')
    AND (
      (m.key = 'market_conduct' AND p.key = 'edit')
      OR (m.key = 'market_conduct_investigation'
          AND p.key IN ('view','access_investigation_workspace','conduct_interviews',
                        'manage_evidence_repository','prepare_investigation_report'))
    )
)
INSERT INTO public.sec_role_template_permissions (template_id, permission_id)
SELECT template_id, permission_id FROM target
ON CONFLICT DO NOTHING;

-- Remove the ambiguous close_complaint overload: the concurrency-safe
-- signature (with optional expected timestamp) is the canonical one.
DROP FUNCTION IF EXISTS public.close_complaint(uuid, text, text);