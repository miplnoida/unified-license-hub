-- Internal trigger function must not be callable from the API.
REVOKE ALL ON FUNCTION public.prevent_duplicate_post_license_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_duplicate_post_license_request() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_duplicate_post_license_request() FROM authenticated;

-- Friendly, machine-readable duplicate pre-check inside the governed draft RPC.
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
  v_existing uuid;
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

  -- Post-licence services are entitlements of an existing, eligible licence.
  v_is_post := (v_service_id IS NOT NULL)
               OR lower(COALESCE(_data->>'type','')) = 'post_license'
               OR v_license_id IS NOT NULL;

  IF v_is_post THEN
    -- Ownership is derived from the selected licence, never from a membership guess.
    IF v_license_id IS NULL THEN
      IF NOT v_is_staff THEN
        RAISE EXCEPTION 'LICENSE_REQUIRED: Select the licence this post-licence service relates to.'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT holder_id INTO v_license_holder FROM public.licenses WHERE id = v_license_id;
      IF v_license_holder IS NULL THEN
        RAISE EXCEPTION 'LICENSE_NOT_FOUND: The selected licence could not be found.'
          USING ERRCODE = '22023';
      END IF;
      IF v_claimed_entity IS NOT NULL AND v_claimed_entity IS DISTINCT FROM v_license_holder THEN
        RAISE EXCEPTION 'LICENSE_ENTITY_MISMATCH: The selected licence does not belong to the selected entity.'
          USING ERRCODE = '42501';
      END IF;
      v_entity_id := v_license_holder;

      IF NOT v_is_staff THEN
        IF NOT public.can_act_on_specific_license(
             v_license_id,
             v_license_holder,
             NULLIF(_data->>'sector_id','')::uuid,
             NULLIF(_data->>'sub_sector_id','')::uuid,
             NULLIF(_data->>'category_id','')::uuid
           ) THEN
          RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;

    IF v_license_id IS NULL AND NOT v_is_staff THEN
      IF NOT public.can_act_on_license(
           COALESCE(v_claimed_entity, v_entity_id),
           NULLIF(_data->>'sector_id','')::uuid,
           NULLIF(_data->>'sub_sector_id','')::uuid,
           NULLIF(_data->>'category_id','')::uuid
         ) THEN
        RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Duplicate protection: same licence + same service + open request.
    -- The BEFORE INSERT trigger stays authoritative (and takes the same
    -- advisory lock); this pre-check only produces a clean, machine-readable
    -- error carrying the existing request id.
    IF v_license_id IS NOT NULL AND v_service_id IS NOT NULL THEN
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
    END IF;
  END IF;

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    COALESCE(_data, '{}'::jsonb),
    _regulator_id,
    v_entity_id
  )
  RETURNING * INTO v_application;

  RETURN v_application;
END $function$;
