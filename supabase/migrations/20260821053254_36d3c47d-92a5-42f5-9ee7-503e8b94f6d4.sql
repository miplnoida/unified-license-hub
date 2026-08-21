CREATE OR REPLACE FUNCTION public.sup_read_guard()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
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

  -- Supervisory read models are internal-only. A session that holds no
  -- internal role (external user, or an authenticated account with no roles
  -- at all) must never reach supervisory truth.
  if not has_internal then
    raise exception 'not authorised: supervisory read models are internal only';
  end if;
  return u;
end;
$$;