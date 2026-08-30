update public.sec_routes
set is_protected = true, is_active = true, updated_at = now()
where key = 'help_user_manual';