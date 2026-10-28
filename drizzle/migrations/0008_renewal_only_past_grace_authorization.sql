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
      IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL)
         AND NOT COALESCE((
           v_data->>'is_renewal' = 'true'
           AND v_data->>'renewal_of_license_id' = v_license_id::text
           AND public.post_license_service_applicability(v_service_id::uuid, v_license_id) = 'OK'
           AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = v_service_id::uuid AND s.name = 'Renew')
           AND EXISTS (
             SELECT 1 FROM public.licensees e
             WHERE e.id = v_license_holder AND e.merged_into_entity_id IS NULL
               AND (e.applicant_id = v_uid
                    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.licensee_id = e.id)
                    OR EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.user_id = v_uid AND m.entity_id = e.id AND m.status = 'APPROVED')
                    OR public.can_current_user_access_licensee(e.id, v_ctx.sector_id))
           )
           AND EXISTS (
             SELECT 1 FROM public.licenses l WHERE l.id = v_license_id
               AND lower(trim(l.status)) IN ('active','approved','issued','valid','in_good_standing','expired')
               AND l.valid_until IS NOT NULL
               AND CURRENT_DATE > l.valid_until::date + public.license_grace_days(l.sector_id,l.sub_sector_id,l.category_id)
           )
         ), false) THEN
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
END $function$