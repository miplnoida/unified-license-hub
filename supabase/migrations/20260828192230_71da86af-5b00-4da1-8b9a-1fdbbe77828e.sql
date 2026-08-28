-- =====================================================================
-- F5-B2 — POST-LICENSING INTAKE AUTHORITY & CANONICAL LICENCE/SERVICE BINDING
-- GAP-F5-01  submission trusted client-written taxonomy
-- GAP-F5-02  submission wrongly restricted to the application creator
-- GAP-F5-15  service <-> licence compatibility enforced only in the UI
-- =====================================================================

CREATE OR REPLACE FUNCTION public.service_license_compatible(
  _service_id uuid,
  _license_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_svc public.services;
  v_lic public.licenses;
BEGIN
  IF _service_id IS NULL OR _license_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = _service_id;
  IF v_svc.id IS NULL OR lower(COALESCE(v_svc.status,'')) <> 'active' THEN
    RETURN false;
  END IF;
  IF v_svc.effective_to IS NOT NULL AND v_svc.effective_to <= now() THEN
    RETURN false;
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = _license_id;
  IF v_lic.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_lic.sub_sector_id IS NOT NULL THEN
    RETURN v_svc.sub_sector_id = v_lic.sub_sector_id;
  END IF;

  RETURN public.sector_effective_id(v_svc.sector_id)
         = public.sector_effective_id(v_lic.sector_id);
END $$;

REVOKE ALL ON FUNCTION public.service_license_compatible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_license_compatible(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_post_license_intake_context(
  _license_id uuid,
  _service_id uuid DEFAULT NULL
) RETURNS TABLE(
  entity_id uuid,
  license_id uuid,
  service_id uuid,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  regulator_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lic.holder_id,
         lic.id,
         _service_id,
         lic.sector_id,
         lic.sub_sector_id,
         lic.category_id,
         COALESCE(svc.regulator_id, lic.regulator_id)
    FROM public.licenses lic
    LEFT JOIN public.services svc ON svc.id = _service_id
   WHERE lic.id = _license_id;
$$;

REVOKE ALL ON FUNCTION public.resolve_post_license_intake_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_post_license_intake_context(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_submit_application(_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
BEGIN
  IF v_uid IS NULL OR _application_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id, applicant_id, entity_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_app.applicant_id = v_uid THEN
    RETURN true;
  END IF;

  IF v_app.entity_id IS NOT NULL
     AND public.entity_membership_capability(v_uid, v_app.entity_id, 'submit') THEN
    RETURN true;
  END IF;

  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.can_submit_application(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_application(uuid) TO authenticated, service_role;

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
  v_reg_id uuid := NULLIF(_data->>'registration_id','')::uuid;
  v_handoff record;
  v_ctx record;
  v_data jsonb := COALESCE(_data, '{}'::jsonb);
  v_regulator uuid := _regulator_id;
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
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
    IF v_license_id IS NULL THEN
      IF NOT v_is_staff THEN
        RAISE EXCEPTION 'LICENSE_REQUIRED: Select the licence this post-licence service relates to.'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT * INTO v_ctx
        FROM public.resolve_post_license_intake_context(v_license_id, NULLIF(v_service_id,'')::uuid);
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

      IF v_service_id IS NOT NULL
         AND NOT public.service_license_compatible(v_service_id::uuid, v_license_id) THEN
        RAISE EXCEPTION 'SERVICE_LICENSE_INCOMPATIBLE: The selected service is not available for the scope of this licence.'
          USING ERRCODE = '42501';
      END IF;

      v_data := v_data || jsonb_build_object(
        'type', 'post_license',
        'license_id', v_license_id,
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
       WHERE h.registration_id = v_reg_id;

      IF NOT FOUND OR lower(COALESCE(v_handoff.reg_status,'')) <> 'approved' THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_is_staff AND v_handoff.reg_user IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_FORBIDDEN: This registration handoff does not belong to you.'
          USING ERRCODE = '42501';
      END IF;

      IF v_handoff.application_id IS NOT NULL THEN
        SELECT * INTO v_application FROM public.applications WHERE id = v_handoff.application_id;
        IF FOUND THEN
          RETURN v_application;
        END IF;
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
    UPDATE public.registration_licensing_handoffs
       SET application_id = v_application.id, updated_at = now()
     WHERE registration_id = v_reg_id AND application_id IS NULL;
  END IF;

  RETURN v_application;
END $function$;