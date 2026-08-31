UPDATE public.sec_navigation_items
   SET label = 'Licence Requests Queue',
       description = 'All licence applications awaiting review, assignment and decision.',
       show_in_sidebar = true,
       show_in_search = true,
       is_active = true,
       keywords = ARRAY['licence','license','licence queue','license queue','licence requests','license requests','application queue','review queue','applications'],
       sort_order = 10,
       updated_at = now()
 WHERE key = 'nav_license_requests_all_license_requests';