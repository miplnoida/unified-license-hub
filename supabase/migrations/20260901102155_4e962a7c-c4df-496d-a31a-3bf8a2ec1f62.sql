-- 1. Handoff linkage supports multiple licence attempts per registration.
ALTER TABLE public.registration_licensing_handoffs
  DROP CONSTRAINT IF EXISTS registration_licensing_handoffs_registration_id_key;

ALTER TABLE public.registration_licensing_handoffs
  ADD CONSTRAINT registration_licensing_handoffs_registration_application_key
  UNIQUE (registration_id, application_id);

-- 2. Handoff creator: conflict target follows the new uniqueness, and the
--    idempotency probe picks the most recent link.
CREATE OR REPLACE FUNCTION public.registration_licensing_handoff(_registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_existing record;
  v_sector record;
  v_sub_name text;
  v_cat_name text;
  v_license_type text;
  v_template_ids uuid[];
  v_application_id uuid;
  v_data jsonb;
BEGIN
  SELECT id, user_id, status, registration_reference, sector_id, sub_sector_id, category_id
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_reg.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_APPROVED', 'status', v_reg.status);
  END IF;

  SELECT * INTO v_existing FROM public.registration_licensing_handoffs
   WHERE registration_id = _registration_id
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND AND v_existing.application_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
                              'application_id', v_existing.application_id);
  END IF;

  SELECT s.name, s.regulator_id INTO v_sector
    FROM public.sectors s WHERE s.id = v_reg.sector_id;
  SELECT name INTO v_sub_name FROM public.sub_sectors WHERE id = v_reg.sub_sector_id;
  SELECT name INTO v_cat_name FROM public.categories WHERE id = v_reg.category_id;

  v_license_type := NULLIF(
    array_to_string(ARRAY(SELECT x FROM unnest(ARRAY[v_sector.name, v_sub_name, v_cat_name]) x
                           WHERE NULLIF(btrim(coalesce(x,'')),'') IS NOT NULL), ' - '), '');

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_template_ids FROM (
    SELECT id FROM public.form_templates
     WHERE status = 'published' AND form_type IN ('pre_license','application')
       AND category_id = v_reg.category_id
    UNION ALL
    SELECT id FROM public.form_templates
     WHERE status = 'published' AND form_type IN ('pre_license','application')
       AND sub_sector_id = v_reg.sub_sector_id AND category_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.form_templates t2
                        WHERE t2.status='published' AND t2.form_type IN ('pre_license','application')
                          AND t2.category_id = v_reg.category_id)
    UNION ALL
    SELECT id FROM public.form_templates
     WHERE status = 'published' AND form_type IN ('pre_license','application')
       AND sector_id = v_reg.sector_id AND sub_sector_id IS NULL AND category_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.form_templates t3
                        WHERE t3.status='published' AND t3.form_type IN ('pre_license','application')
                          AND (t3.category_id = v_reg.category_id
                               OR (t3.sub_sector_id = v_reg.sub_sector_id AND t3.category_id IS NULL)))
  ) matched;

  -- Reuse an existing draft for the same registration reference (idempotent).
  SELECT id INTO v_application_id FROM public.applications
   WHERE applicant_id = v_reg.user_id
     AND status = 'draft'
     AND data->>'registration_reference' = v_reg.registration_reference
   ORDER BY created_at DESC LIMIT 1;

  v_data := jsonb_build_object(
    'sector_id', v_reg.sector_id,
    'sub_sector_id', v_reg.sub_sector_id,
    'category_id', v_reg.category_id,
    'sector_name', coalesce(v_sector.name, ''),
    'sub_sector_name', coalesce(v_sub_name, ''),
    'category_name', coalesce(v_cat_name, ''),
    'registration_id', v_reg.id,
    'registration_reference', v_reg.registration_reference,
    'source', 'registration_approval_handoff',
    'form_template_ids', to_jsonb(v_template_ids),
    'forms_data', '{}'::jsonb,
    'form_version_ids', '{}'::jsonb);

  IF v_application_id IS NULL THEN
    INSERT INTO public.applications (applicant_id, license_type, status, regulator_id, data)
    VALUES (v_reg.user_id, coalesce(v_license_type, 'Licence application'), 'draft',
            v_sector.regulator_id, v_data)
    RETURNING id INTO v_application_id;
  ELSE
    UPDATE public.applications
       SET license_type = coalesce(v_license_type, license_type),
           regulator_id = coalesce(v_sector.regulator_id, regulator_id),
           data = data || v_data
     WHERE id = v_application_id;
  END IF;

  INSERT INTO public.registration_licensing_handoffs
    (registration_id, application_id, registration_reference, detail)
  VALUES (_registration_id, v_application_id, v_reg.registration_reference,
          jsonb_build_object('license_type', v_license_type,
                             'form_template_ids', to_jsonb(v_template_ids)))
  ON CONFLICT (registration_id, application_id) DO UPDATE
     SET registration_reference = EXCLUDED.registration_reference,
         detail = EXCLUDED.detail,
         updated_at = now();

  PERFORM public.onboarding_record_journey_event(
    v_reg.user_id, 'registration_licensing_handoff', NULL, NULL, _registration_id, NULL,
    jsonb_build_object('application_id', v_application_id));

  RETURN jsonb_build_object('success', true, 'idempotent', false,
                            'application_id', v_application_id,
                            'registration_id', _registration_id);
END $function$;

-- 3. Draft creation is status-aware: resume only an application that is still
--    open for editing; otherwise create and link a new attempt.
CREATE OR REPLACE FUNCTION public.create_application_draft(_license_type text, _data jsonb DEFAULT '{}'::jsonb, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_application public.applications;
  v_entity_id uuid;
  v_is_post boolean;
  v_is_staff boolean;
  v_license_id uuid := NULLIF(_data->>'license_id','')::uuid;
  v_claimed_entity uuid := NULLIF(_data->>'licensee_id','')::uuid;
  v_license_holder uuid;
  v_service_id text := NULLIF(_data->>'service_id','');
  v_applicability text;
  v_existing uuid;
  v_reg_id uuid := NULLIF(_data->>'registration_id','')::uuid;
  v_handoff record;
  v_ctx record;
  v_data jsonb := COALESCE(_data, '{}'::jsonb);
  v_regulator uuid := _regulator_id;
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
  v_open_statuses text[] := ARRAY[
    'draft','in_progress','resubmission_requested','resubmission_required',
    'query_raised','returned_for_correction','info_requested'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  v_is_staff := public.is_super_admin(v_uid)
                OR public.has_permission(v_uid, 'application_management', 'create');

  IF NOT (
    v_is_staff
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'APPLICATION_CREATE_FORBIDDEN: You do not have permission to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.entity_id INTO v_entity_id
    FROM public.entity_user_memberships m
    JOIN public.licensees l ON l.id = m.entity_id
   WHERE m.user_id = v_uid AND m.status = 'APPROVED' AND l.merged_into_entity_id IS NULL
   ORDER BY m.approved_at DESC NULLS LAST
   LIMIT 1;

  IF v_entity_id IS NULL THEN
    SELECT p.licensee_id INTO v_entity_id
      FROM public.profiles p JOIN public.licensees l ON l.id = p.licensee_id
     WHERE p.id = v_uid AND l.merged_into_entity_id IS NULL;
  END IF;

  IF v_entity_id IS NULL THEN
    SELECT l.id INTO v_entity_id
      FROM public.licensees l
     WHERE l.applicant_id = v_uid AND l.merged_into_entity_id IS NULL
     ORDER BY l.created_at
     LIMIT 1;
  END IF;

  v_is_post := (v_service_id IS NOT NULL)
               OR lower(COALESCE(_data->>'type','')) = 'post_license'
               OR v_license_id IS NOT NULL;

  IF v_is_post THEN
    v_applicability := public.post_license_service_applicability(
      NULLIF(v_service_id,'')::uuid, v_license_id
    );

    IF v_applicability <> 'OK' THEN
      RAISE EXCEPTION '%: %',
        v_applicability, public.post_license_applicability_message(v_applicability)
        USING ERRCODE = CASE
          WHEN v_applicability IN ('LICENSE_REQUIRED','LICENSE_NOT_FOUND',
                                   'POST_LICENSE_SERVICE_REQUIRED',
                                   'POST_LICENSE_SERVICE_NOT_FOUND') THEN '22023'
          ELSE '42501'
        END;
    END IF;

    SELECT * INTO v_ctx
      FROM public.resolve_post_license_intake_context(v_license_id, v_service_id::uuid);
    IF v_ctx.entity_id IS NULL THEN
      RAISE EXCEPTION 'LICENSE_NOT_FOUND: The selected licence could not be found.'
        USING ERRCODE = '22023';
    END IF;
    v_license_holder := v_ctx.entity_id;

    IF v_claimed_entity IS NOT NULL AND v_claimed_entity IS DISTINCT FROM v_license_holder THEN
      RAISE EXCEPTION 'LICENSE_ENTITY_MISMATCH: The selected licence does not belong to the selected entity.'
        USING ERRCODE = '42501';
    END IF;
    v_entity_id := v_license_holder;

    v_data := v_data || jsonb_build_object(
      'type', 'post_license',
      'license_id', v_license_id,
      'service_id', v_service_id,
      'licensee_id', v_entity_id,
      'sector_id', v_ctx.sector_id,
      'sub_sector_id', v_ctx.sub_sector_id,
      'category_id', v_ctx.category_id
    );
    v_regulator := COALESCE(v_regulator, v_ctx.regulator_id);

    IF NOT v_is_staff THEN
      IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL) THEN
        RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('post_license_request:' || v_license_id::text || ':' || v_service_id, 0)
    );

    SELECT a.id INTO v_existing
      FROM public.applications a
     WHERE COALESCE(a.data->>'license_id','') = v_license_id::text
       AND COALESCE(a.data->>'service_id','') = v_service_id
       AND a.status = ANY (public.post_license_open_statuses())
     ORDER BY a.created_at
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_POST_LICENSE_REQUEST: %', v_existing
        USING ERRCODE = 'unique_violation',
              HINT = v_existing::text;
    END IF;
  ELSE
    IF NOT v_trusted THEN
      IF v_reg_id IS NULL THEN
        SELECT h.registration_id INTO v_reg_id
          FROM public.registration_licensing_handoffs h
          JOIN public.registrations r ON r.id = h.registration_id
         WHERE r.user_id = v_uid AND lower(r.status) = 'approved'
         ORDER BY h.created_at DESC
         LIMIT 1;
      END IF;

      IF v_reg_id IS NULL THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      SELECT h.*, r.status AS reg_status, r.user_id AS reg_user
        INTO v_handoff
        FROM public.registration_licensing_handoffs h
        JOIN public.registrations r ON r.id = h.registration_id
       WHERE h.registration_id = v_reg_id
       ORDER BY h.created_at DESC
       LIMIT 1;

      IF NOT FOUND OR lower(COALESCE(v_handoff.reg_status,'')) <> 'approved' THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_is_staff AND v_handoff.reg_user IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_FORBIDDEN: This registration handoff does not belong to you.'
          USING ERRCODE = '42501';
      END IF;

      -- Resume ONLY an application that is still open for editing. A withdrawn,
      -- rejected, cancelled, approved or already-submitted attempt is left
      -- untouched and a new attempt is created and linked below.
      SELECT a.* INTO v_application
        FROM public.registration_licensing_handoffs h
        JOIN public.applications a ON a.id = h.application_id
       WHERE h.registration_id = v_reg_id
         AND lower(COALESCE(a.status,'draft')) = ANY (v_open_statuses)
       ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
       LIMIT 1;

      IF FOUND THEN
        RETURN v_application;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    v_data || CASE WHEN v_reg_id IS NOT NULL
      THEN jsonb_build_object('registration_id', v_reg_id) ELSE '{}'::jsonb END,
    v_regulator,
    v_entity_id
  )
  RETURNING * INTO v_application;

  IF NOT v_is_post AND v_reg_id IS NOT NULL THEN
    INSERT INTO public.registration_licensing_handoffs
      (registration_id, application_id, registration_reference, detail)
    SELECT v_reg_id, v_application.id, r.registration_reference,
           jsonb_build_object('license_type', v_application.license_type,
                              'source', 'create_application_draft')
      FROM public.registrations r
     WHERE r.id = v_reg_id
    ON CONFLICT (registration_id, application_id) DO NOTHING;
  END IF;

  RETURN v_application;
END $function$;