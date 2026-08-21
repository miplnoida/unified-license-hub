do $$
begin
  if exists (select 1 from pg_roles where rolname='supabase_read_only_user') then
    execute 'grant execute on function public.application_resolve_form_set(uuid,uuid,uuid,uuid,text,text) to supabase_read_only_user';
  end if;
end $$;