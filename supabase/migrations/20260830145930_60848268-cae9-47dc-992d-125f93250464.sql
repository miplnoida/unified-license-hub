UPDATE public.sec_navigation_items
   SET icon_key = 'UserCheck'
 WHERE key = 'nav_person_identity_queue'
   AND icon_key IS DISTINCT FROM 'UserCheck';