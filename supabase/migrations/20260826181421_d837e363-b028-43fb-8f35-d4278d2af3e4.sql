-- 1. Canonical permission record: market_conduct.approve
INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, 'approve', 'Approve',
       'Approve or endorse market conduct supervisory decisions (supervisory plans, interventions) within the holder''s authorised regulatory scope.',
       80, true, true, true, true
  FROM public.sec_modules m
 WHERE m.key = 'market_conduct'
   AND NOT EXISTS (
     SELECT 1 FROM public.sec_permissions p
      WHERE p.module_id = m.id AND p.key = 'approve');

-- 2. Grant to the Conduct Supervisor role only
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.sec_roles r
  JOIN public.sec_modules m ON m.key = 'market_conduct'
  JOIN public.sec_permissions p ON p.module_id = m.id AND p.key = 'approve'
 WHERE r.key = 'conduct_supervisor'
   AND NOT EXISTS (
     SELECT 1 FROM public.sec_role_permissions x
      WHERE x.role_id = r.id AND x.permission_id = p.id);