-- 1) Re-map external built-in roles to the correct system_role
UPDATE public.roles SET system_role = 'applicant'
 WHERE name IN ('Applicant', 'Consumer / Complainant');

-- 2) Remove the wrongly-granted 'analyst' static role from users whose
--    only source of analyst was an external dynamic role.
DELETE FROM public.user_roles ur
 WHERE ur.role = 'analyst'::app_role
   AND NOT EXISTS (
     SELECT 1
     FROM public.user_dynamic_roles udr
     JOIN public.roles r ON r.id = udr.role_id
     WHERE udr.user_id = ur.user_id
       AND r.system_role = 'analyst'
   );

-- 3) Re-fire the sync trigger so the correct 'applicant' static role gets
--    inserted for users whose Applicant dynamic role row already exists.
UPDATE public.user_dynamic_roles
   SET role_id = role_id
 WHERE role_id IN (
   SELECT id FROM public.roles WHERE name IN ('Applicant', 'Consumer / Complainant')
 );