CREATE OR REPLACE FUNCTION public.resolve_complaint_entity_context(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    -- Licensed entity linked to the submitter's own profile
    SELECT l.id, l.name, li.license_number
      INTO v_lic
      FROM public.profiles p
      JOIN public.licensees l ON l.id = p.licensee_id
      LEFT JOIN public.licenses li ON li.id = l.license_id
     WHERE p.id = v_c.complainant_id
     LIMIT 1;

    IF v_lic.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'kind','licensed',
        'source','profile.licensee_id',
        'licensee_id', v_lic.id,
        'entity_name', v_lic.name,
        'license_number', v_lic.license_number
      );
    END IF;

    -- Licensed entity created from this applicant's approved application
    SELECT l.id, l.name, li.license_number
      INTO v_lic
      FROM public.licensees l
      LEFT JOIN public.licenses li ON li.id = l.license_id
     WHERE l.applicant_id = v_c.complainant_id
     ORDER BY (l.status = 'active') DESC, l.created_at DESC
     LIMIT 1;

    IF v_lic.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'kind','licensed',
        'source','licensee.applicant_id',
        'licensee_id', v_lic.id,
        'entity_name', v_lic.name,
        'license_number', v_lic.license_number
      );
    END IF;

    SELECT u.full_name, u.entity_name, u.status
      INTO v_plu
      FROM public.pre_license_users u
     WHERE u.id = v_c.complainant_id;

    IF v_plu.entity_name IS NOT NULL OR v_plu.full_name IS NOT NULL THEN
      SELECT a.application_number, a.status
        INTO v_app
        FROM public.applications a
       WHERE a.applicant_id = v_c.complainant_id
       ORDER BY (a.status = 'approved') DESC, a.created_at DESC
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
$fn$;