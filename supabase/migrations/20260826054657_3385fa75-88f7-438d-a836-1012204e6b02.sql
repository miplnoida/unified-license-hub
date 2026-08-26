CREATE OR REPLACE FUNCTION public.resolve_complaint_intake_regulator(
  _complaint_id uuid,
  _candidate_regulator_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT COALESCE(
    (
      SELECT r.id
      FROM public.regulators r
      WHERE r.id = _candidate_regulator_id
    ),
    (
      SELECT s.regulator_id
      FROM public.complaint_respondents cr
      JOIN public.licensees l ON l.id = cr.licensee_id
      JOIN public.sectors s ON s.id = l.sector_id
      JOIN public.regulators r ON r.id = s.regulator_id
      WHERE cr.complaint_id = _complaint_id
      ORDER BY cr.is_primary DESC, cr.created_at ASC
      LIMIT 1
    ),
    (
      SELECT cfg.default_intake_regulator_id
      FROM public.complaint_public_intake_config cfg
      JOIN public.regulators r ON r.id = cfg.default_intake_regulator_id
      WHERE cfg.regulator_id IS NULL
        AND cfg.is_active
      ORDER BY cfg.created_at
      LIMIT 1
    ),
    (
      SELECT r.id
      FROM public.regulators r
      WHERE r.status = 'active'
        AND (SELECT count(*) FROM public.regulators ar WHERE ar.status = 'active') = 1
      ORDER BY r.created_at
      LIMIT 1
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_complaint_intake_regulator(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_complaint_regulator_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.regulator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.regulators r WHERE r.id = NEW.regulator_id) THEN
    NEW.regulator_id := public.resolve_complaint_intake_regulator(NEW.id, NEW.regulator_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.normalize_complaint_regulator_route()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_complaint_regulator_route()
  TO service_role;

DROP TRIGGER IF EXISTS trg_complaints_normalize_regulator_route ON public.complaints;
CREATE TRIGGER trg_complaints_normalize_regulator_route
  BEFORE INSERT OR UPDATE OF regulator_id ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_complaint_regulator_route();

CREATE OR REPLACE FUNCTION public.normalize_complaint_jurisdiction_regulator_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.regulator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.regulators r WHERE r.id = NEW.regulator_id) THEN
    NEW.regulator_id := public.resolve_complaint_intake_regulator(NEW.complaint_id, NEW.regulator_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.normalize_complaint_jurisdiction_regulator_route()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_complaint_jurisdiction_regulator_route()
  TO service_role;

DROP TRIGGER IF EXISTS trg_complaint_jurisdiction_normalize_regulator_route
  ON public.complaint_jurisdiction_assessments;
CREATE TRIGGER trg_complaint_jurisdiction_normalize_regulator_route
  BEFORE INSERT OR UPDATE OF regulator_id ON public.complaint_jurisdiction_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_complaint_jurisdiction_regulator_route();