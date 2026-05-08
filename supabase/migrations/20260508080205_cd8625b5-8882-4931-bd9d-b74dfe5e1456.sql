-- Sector restriction for PPOC mappings
CREATE TABLE IF NOT EXISTS public.ppoc_mapping_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL REFERENCES public.ppoc_entity_mappings(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mapping_id, sector_id)
);

CREATE INDEX IF NOT EXISTS idx_ppoc_mapping_sectors_mapping ON public.ppoc_mapping_sectors(mapping_id);
CREATE INDEX IF NOT EXISTS idx_ppoc_mapping_sectors_sector ON public.ppoc_mapping_sectors(sector_id);

ALTER TABLE public.ppoc_mapping_sectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ppoc mapping sectors" ON public.ppoc_mapping_sectors;
CREATE POLICY "Admins manage ppoc mapping sectors"
  ON public.ppoc_mapping_sectors
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "PPOC views own mapping sectors" ON public.ppoc_mapping_sectors;
CREATE POLICY "PPOC views own mapping sectors"
  ON public.ppoc_mapping_sectors
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ppoc_entity_mappings m
    WHERE m.id = ppoc_mapping_sectors.mapping_id
      AND m.ppoc_user_id = auth.uid()
  ));

-- Update mapped licensee resolution to honor sector restrictions.
-- A mapping with NO rows in ppoc_mapping_sectors is treated as "all sectors"
-- to preserve backward compatibility.
CREATE OR REPLACE FUNCTION public.ppoc_mapped_licensee_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.licensee_id
  FROM public.ppoc_entity_mappings m
  LEFT JOIN public.licensees l ON l.id = m.licensee_id
  WHERE m.ppoc_user_id = _user_id
    AND m.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.ppoc_mapping_sectors s WHERE s.mapping_id = m.id)
      OR (l.sector_id IS NOT NULL AND l.sector_id IN (
        SELECT sector_id FROM public.ppoc_mapping_sectors WHERE mapping_id = m.id
      ))
    )
$function$;

CREATE OR REPLACE FUNCTION public.ppoc_accessible_license_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.id
  FROM public.licenses l
  JOIN public.profiles p ON p.id = l.holder_id
  WHERE p.licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(_user_id))
$function$;