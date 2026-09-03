-- W3-17 defect: sup_read_guard admitted external portal users.
--
-- Internal officers may hold only granular business permissions, so the guard
-- falls back to a permission check. But licensee portal roles legitimately hold
-- 'returns_management.view' and 'license_management.view' for their OWN records,
-- so that fallback classified a licensee_primary user as internal and let them
-- read supervisory truth (entity_supervisory_360, supervisory_portfolio,
-- enterprise_supervisory_overview, sector overview, work queue).
--
-- The permission fallback now applies only to accounts that are not external
-- portal users. Role-based internal staff are unaffected.
CREATE OR REPLACE FUNCTION public.sup_read_guard()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u uuid := auth.uid();
  has_internal boolean;
  is_external boolean;
begin
  if u is null then raise exception 'authentication required'; end if;

  select exists (
    select 1 from public.user_roles
    where user_id = u
      and role in ('super_admin'::app_role,'admin'::app_role,'supervisor'::app_role,
                   'licensing_officer'::app_role,'analyst'::app_role,
                   'legal_compliance'::app_role,'developer'::app_role)
  ) into has_internal;

  -- External portal identity: mapped to a regulated entity, or holding an
  -- external portal role. Such an account is never internal, whatever
  -- self-service permissions its portal role carries.
  if not has_internal then
    select exists (select 1 from public.external_user_entity_ids(u))
        or exists (
             select 1 from public.user_roles
              where user_id = u
                and role in ('applicant'::app_role,'pre_licensee'::app_role,
                             'licensee_primary'::app_role,'licensee_secondary'::app_role)
           )
      into is_external;

    -- Business roles are granular permissions, not legacy enum roles: an internal
    -- officer authorised to view any supervisory domain is internal for the purpose
    -- of the canonical read models. External portal users are excluded above.
    if not is_external then
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
