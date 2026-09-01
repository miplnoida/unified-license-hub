-- 1. Legacy guard becomes validation-only. The child entity_licenses insert is
--    removed: during BEFORE INSERT the parent licensees row does not exist yet,
--    so the insert violated entity_licenses_entity_id_fkey. Canonical linkage is
--    performed by public.entity_link_license() after the parent exists.
CREATE OR REPLACE FUNCTION public.enforce_licensee_license_id_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.license_id IS NOT NULL AND NOT v_trusted THEN
      RAISE EXCEPTION 'LEGACY_COLUMN_READ_ONLY: licensees.license_id is deprecated; use entity_licenses.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.license_id IS DISTINCT FROM OLD.license_id THEN
    IF NEW.license_id IS NOT NULL AND NOT v_trusted THEN
      RAISE EXCEPTION 'LEGACY_COLUMN_READ_ONLY: licensees.license_id is deprecated; use entity_licenses.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validation/protection only. No child-table mirroring here.
  RETURN NEW;
END $function$;

COMMENT ON FUNCTION public.enforce_licensee_license_id_legacy() IS
  'BEFORE INSERT/UPDATE OF license_id guard on public.licensees. Validation only: blocks untrusted writes to the deprecated legacy column. Must never write public.entity_licenses (parent row does not exist during BEFORE INSERT); public.entity_link_license() is the single authoritative runtime writer.';

COMMENT ON FUNCTION public.entity_attach_license(uuid, uuid, boolean, text) IS
  'Non-runtime helper (no production callers). public.entity_link_license() is the authoritative runtime writer for public.entity_licenses.';

-- 2. Safety backfill: link any legacy licensee that carries license_id but has
--    no canonical entity_licenses row (currently zero rows).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT l.id AS entity_id, l.license_id
      FROM public.licensees l
     WHERE l.license_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.entity_licenses el
          WHERE el.entity_id = l.id AND el.license_id = l.license_id)
  LOOP
    PERFORM public.entity_link_license(r.entity_id, r.license_id, NULL);
  END LOOP;
END $$;