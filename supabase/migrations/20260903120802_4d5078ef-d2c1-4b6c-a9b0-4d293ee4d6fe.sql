CREATE OR REPLACE FUNCTION public.sup_read_guard()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Business roles are granular permissions, not legacy enum roles: an internal
  -- officer authorised to view any supervisory domain is internal for the purpose
  -- of the canonical read models. External portal users hold none of these.
  if not has_internal then
    has_internal := public.has_any_permission(u, ARRAY[
      'supervisory_spine.view',
      'aml_supervision.view',
      'prudential_supervision.view',
      'market_conduct.view',
      'license_management.view',
      'returns_management.view',
      'inspection_management.view',
      'enforcement_management.view'
    ]);
  end if;

  -- Supervisory read models are internal-only. A session that holds no
  -- internal role or permission (external user, or an authenticated account
  -- with no roles at all) must never reach supervisory truth.
  if not has_internal then
    raise exception 'not authorised: supervisory read models are internal only';
  end if;
  return u;
end;
$function$;