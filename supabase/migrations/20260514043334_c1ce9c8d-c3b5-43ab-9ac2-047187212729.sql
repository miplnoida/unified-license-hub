create or replace function public.check_primary_user_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.registrations where lower(email) = lower(trim(p_email))
    union all
    select 1 from public.profiles where lower(email) = lower(trim(p_email))
    union all
    select 1 from auth.users where lower(email) = lower(trim(p_email))
  );
$$;

grant execute on function public.check_primary_user_email_exists(text) to anon, authenticated;