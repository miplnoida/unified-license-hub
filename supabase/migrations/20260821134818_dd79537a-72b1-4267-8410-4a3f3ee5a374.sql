do $$
begin
  if exists (select 1 from pg_roles where rolname='supabase_read_only_user') then
    execute 'grant execute on function public.decision_gate_status(uuid) to supabase_read_only_user';
    execute 'grant execute on function public.application_fp_gate(uuid) to supabase_read_only_user';
  end if;
end $$;