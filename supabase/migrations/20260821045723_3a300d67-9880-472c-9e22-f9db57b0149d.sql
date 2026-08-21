-- A4 fix: supervisory read guard must not lock out internal staff who also
-- hold an external role (e.g. break-glass super admin with an applicant role).
create or replace function public.sup_read_guard()
returns uuid
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  has_internal boolean;
begin
  if u is null then raise exception 'authentication required'; end if;

  select exists (
    select 1 from public.user_roles
    where user_id = u
      and role in ('super_admin'::app_role,'admin'::app_role,'supervisor'::app_role,
                   'licensing_officer'::app_role,'analyst'::app_role,
                   'legal_compliance'::app_role,'developer'::app_role)
  ) into has_internal;

  if not has_internal and public.has_external_role(u) then
    raise exception 'not authorised: supervisory read models are internal only';
  end if;
  return u;
end;
$function$;