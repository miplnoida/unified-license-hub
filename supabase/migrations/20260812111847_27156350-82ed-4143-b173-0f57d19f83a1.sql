create or replace function public.resolve_user_display_names(_ids uuid[])
returns table (id uuid, display_name text, email text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select auth.uid() as uid,
           exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()) as is_staff
  )
  select p.id,
         coalesce(nullif(p.full_name, ''), p.email, '') as display_name,
         p.email,
         'staff'::text as kind
  from public.profiles p, caller c
  where p.id = any(_ids)
    and c.uid is not null
    and (c.is_staff or p.id = c.uid)
  union all
  select u.id,
         coalesce(nullif(u.full_name, ''), u.email, '') as display_name,
         u.email,
         'external'::text as kind
  from public.pre_license_users u, caller c
  where u.id = any(_ids)
    and c.uid is not null
    and (c.is_staff or u.id = c.uid)
$$;

revoke all on function public.resolve_user_display_names(uuid[]) from public;
grant execute on function public.resolve_user_display_names(uuid[]) to authenticated;
grant execute on function public.resolve_user_display_names(uuid[]) to service_role;