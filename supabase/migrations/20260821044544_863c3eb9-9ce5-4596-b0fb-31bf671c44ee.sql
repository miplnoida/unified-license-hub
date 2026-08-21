grant execute on function public.is_super_admin(uuid) to supabase_read_only_user;
grant execute on function public.has_external_role(uuid) to supabase_read_only_user;
do $$
declare r record;
begin
  for r in select oid::regprocedure::text sig from pg_proc where proname = 'has_permission' and pronamespace = 'public'::regnamespace loop
    execute format('grant execute on function %s to supabase_read_only_user', r.sig);
  end loop;
end $$;