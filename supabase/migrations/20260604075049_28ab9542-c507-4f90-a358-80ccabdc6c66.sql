
-- Centralized access check: Primary User OR active PPOC mapping (with optional sector scope)
CREATE OR REPLACE FUNCTION public.can_user_access_licensee(
  _user_id uuid,
  _target_licensee_id uuid,
  _target_sector_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _target_licensee_id IS NOT NULL
    AND (
      -- Primary User: profile directly linked to the licensee
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id
          AND p.licensee_id = _target_licensee_id
      )
      OR
      -- PPOC: active mapping, sector match when target sector is provided
      EXISTS (
        SELECT 1
        FROM public.ppoc_entity_mappings m
        JOIN public.licensees l ON l.id = m.licensee_id
        WHERE m.ppoc_user_id = _user_id
          AND m.is_active = true
          AND m.licensee_id = _target_licensee_id
          AND (
            _target_sector_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.ppoc_mapping_sectors s
              WHERE s.mapping_id = m.id
                AND s.sector_id = _target_sector_id
            )
          )
          AND (
            -- If the licensee itself has a sector, the mapping must include it
            l.sector_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.ppoc_mapping_sectors s
              WHERE s.mapping_id = m.id
                AND s.sector_id = l.sector_id
            )
          )
      )
    )
$$;

REVOKE ALL ON FUNCTION public.can_user_access_licensee(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_access_licensee(uuid, uuid, uuid) TO authenticated, service_role;

-- Convenience wrapper that uses auth.uid()
CREATE OR REPLACE FUNCTION public.can_current_user_access_licensee(
  target_licensee_id uuid,
  target_sector_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_user_access_licensee(auth.uid(), target_licensee_id, target_sector_id)
$$;

REVOKE ALL ON FUNCTION public.can_current_user_access_licensee(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_user_access_licensee(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_user_access_licensee(uuid, uuid, uuid) IS
  'Returns true iff the user is the Primary User of the target licensee (profiles.licensee_id match) OR has an active PPOC mapping for it (with sector match when a sector is provided or when the licensee itself is sector-scoped).';
COMMENT ON FUNCTION public.can_current_user_access_licensee(uuid, uuid) IS
  'auth.uid() wrapper around can_user_access_licensee.';
