-- 1) Carry the submitter's explicit licensed-entity link into the complaint at creation.
CREATE OR REPLACE FUNCTION public.complaint_autolink_licensee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.licensee_id IS NULL AND NEW.complainant_id IS NOT NULL THEN
    SELECT p.licensee_id INTO NEW.licensee_id
    FROM public.profiles p
    WHERE p.id = NEW.complainant_id
      AND p.licensee_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_autolink_licensee ON public.complaints;
CREATE TRIGGER trg_complaint_autolink_licensee
BEFORE INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.complaint_autolink_licensee();

-- 2) Read-only entity context resolver for the complaint detail screen.
CREATE OR REPLACE FUNCTION public.resolve_complaint_entity_context(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c record;
  v_lic record;
  v_plu record;
  v_app record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT id, licensee_id, complainant_id INTO v_c
  FROM public.complaints WHERE id = _complaint_id;
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('kind','none','source','not_found');
  END IF;

  IF NOT (
    public.has_complaint_perm(v_uid, 'view')
    OR public.external_can_access_complaint(v_uid, _complaint_id, 'view')
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;

  IF v_c.licensee_id IS NOT NULL THEN
    SELECT l.id, l.name, li.license_number
      INTO v_lic
      FROM public.licensees l
      LEFT JOIN public.licenses li ON li.id = l.license_id
     WHERE l.id = v_c.licensee_id;
    RETURN jsonb_build_object(
      'kind','licensed',
      'source','complaint.licensee_id',
      'licensee_id', v_c.licensee_id,
      'entity_name', v_lic.name,
      'license_number', v_lic.license_number
    );
  END IF;

  IF v_c.complainant_id IS NOT NULL THEN
    SELECT u.full_name, u.entity_name, u.status
      INTO v_plu
      FROM public.pre_license_users u
     WHERE u.id = v_c.complainant_id;

    IF v_plu.entity_name IS NOT NULL OR v_plu.full_name IS NOT NULL THEN
      SELECT a.application_number, a.status
        INTO v_app
        FROM public.applications a
       WHERE a.applicant_id = v_c.complainant_id
       ORDER BY a.created_at DESC
       LIMIT 1;

      RETURN jsonb_build_object(
        'kind','applicant',
        'source','pre_license_user',
        'entity_name', COALESCE(v_plu.entity_name, v_plu.full_name),
        'application_number', v_app.application_number,
        'application_status', v_app.status
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('kind','none','source','unresolved');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_complaint_entity_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_complaint_entity_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_complaint_entity_context(uuid) TO service_role;