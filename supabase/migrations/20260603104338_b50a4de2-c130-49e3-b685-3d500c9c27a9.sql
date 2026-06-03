CREATE OR REPLACE FUNCTION public.resolve_application_form_version(_application_id uuid, _template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_is_internal boolean;
  v_assignment record;
  v_legacy_id uuid;
  v_chosen record;
  v_now timestamptz := now();
  v_existing_map jsonb := '{}'::jsonb;
  v_updated_data jsonb := '{}'::jsonb;
  v_pinned_status text;
  v_pinned_effective_until timestamptz;
  v_pinned_effective_from timestamptz;
  v_pinned_is_usable boolean;
  v_is_draft boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  IF _application_id IS NULL OR _template_id IS NULL THEN
    RETURN jsonb_build_object('error','application_id and template_id are required','code','BAD_REQUEST','http',400);
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  SELECT id, applicant_id, data, status
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF NOT v_is_internal AND v_app.applicant_id <> v_uid THEN
    RETURN jsonb_build_object('error','You do not have access to this application','code','FORBIDDEN','http',403);
  END IF;

  v_is_draft := COALESCE(v_app.status, 'draft') = 'draft';

  SELECT afv.id,
         afv.version_id,
         afv.assigned_reason,
         fv.id AS form_version_id,
         fv.template_id AS form_version_template_id,
         fv.version,
         fv.semantic_version,
         fv.status AS fv_status,
         fv.effective_from AS fv_effective_from,
         fv.effective_until AS fv_effective_until
    INTO v_assignment
    FROM public.application_form_versions afv
    LEFT JOIN public.form_versions fv ON fv.id = afv.version_id
   WHERE afv.application_id = _application_id
     AND afv.template_id = _template_id
     AND afv.status = 'active'
   ORDER BY afv.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_assignment.form_version_id IS NULL OR v_assignment.form_version_template_id IS DISTINCT FROM _template_id THEN
      RETURN jsonb_build_object(
        'error','The assigned form version could not be found. Please contact support.',
        'code','PINNED_VERSION_MISSING','http',404,
        'application_id', _application_id,
        'template_id', _template_id,
        'version_id', v_assignment.version_id
      );
    END IF;

    -- Determine if the pinned version is still usable (published & within effective window).
    v_pinned_is_usable := v_assignment.fv_status = 'published'
      AND (v_assignment.fv_effective_from IS NULL OR v_assignment.fv_effective_from <= v_now)
      AND (
        v_assignment.fv_effective_until IS NULL
        OR (date_trunc('day', v_assignment.fv_effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
      );

    -- For drafts, if the pinned version is archived or out-of-window, re-pin to latest effective version.
    IF v_is_draft AND NOT v_pinned_is_usable THEN
      SELECT fv.id, fv.version, fv.semantic_version
        INTO v_chosen
        FROM public.form_versions fv
       WHERE fv.template_id = _template_id
         AND fv.status = 'published'
         AND (fv.effective_from IS NULL OR fv.effective_from <= v_now)
         AND (
           fv.effective_until IS NULL
           OR (date_trunc('day', fv.effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
         )
       ORDER BY fv.version DESC, COALESCE(fv.published_at, fv.created_at) DESC, fv.id DESC
       LIMIT 1;

      IF FOUND AND v_chosen.id IS DISTINCT FROM v_assignment.version_id THEN
        -- Mark the previous assignment as superseded, then insert a fresh active one.
        UPDATE public.application_form_versions
           SET status = 'superseded'
         WHERE id = v_assignment.id;

        INSERT INTO public.application_form_versions (
          application_id, template_id, version_id, assigned_reason, assigned_by, locked_at, status
        ) VALUES (
          _application_id, _template_id, v_chosen.id, 'repinned_after_archive', v_uid, v_now, 'active'
        )
        ON CONFLICT DO NOTHING;

        -- Mirror into legacy form_version_ids map for backward compatibility.
        v_updated_data := jsonb_set(
          COALESCE(v_app.data, '{}'::jsonb),
          '{form_version_ids}',
          COALESCE(v_app.data->'form_version_ids', '{}'::jsonb) || jsonb_build_object(_template_id::text, v_chosen.id::text),
          true
        );
        UPDATE public.applications SET data = v_updated_data WHERE id = _application_id;

        RETURN jsonb_build_object(
          'success', true,
          'http', 200,
          'application_id', _application_id,
          'template_id', _template_id,
          'version_id', v_chosen.id,
          'version_number', v_chosen.version,
          'semantic_version', v_chosen.semantic_version,
          'assigned_reason', 'repinned_after_archive',
          'was_existing_assignment', false
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'application_id', _application_id,
      'template_id', _template_id,
      'version_id', v_assignment.version_id,
      'version_number', v_assignment.version,
      'semantic_version', v_assignment.semantic_version,
      'assigned_reason', 'resumed_existing',
      'was_existing_assignment', true
    );
  END IF;

  v_existing_map := COALESCE(v_app.data->'form_version_ids', '{}'::jsonb);
  v_legacy_id := NULLIF(v_existing_map->>(_template_id::text), '')::uuid;

  IF v_legacy_id IS NOT NULL THEN
    SELECT id, template_id, version, semantic_version, status, effective_from, effective_until
      INTO v_chosen
      FROM public.form_versions
     WHERE id = v_legacy_id;

    IF NOT FOUND OR v_chosen.template_id IS DISTINCT FROM _template_id THEN
      RETURN jsonb_build_object(
        'error','The assigned form version could not be found. Please contact support.',
        'code','PINNED_VERSION_MISSING','http',404,
        'application_id', _application_id,
        'template_id', _template_id,
        'version_id', v_legacy_id
      );
    END IF;

    -- For drafts, if the legacy version is archived/out-of-window, prefer the latest effective version.
    v_pinned_is_usable := v_chosen.status = 'published'
      AND (v_chosen.effective_from IS NULL OR v_chosen.effective_from <= v_now)
      AND (
        v_chosen.effective_until IS NULL
        OR (date_trunc('day', v_chosen.effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
      );

    IF v_is_draft AND NOT v_pinned_is_usable THEN
      SELECT fv.id, fv.version, fv.semantic_version
        INTO v_chosen
        FROM public.form_versions fv
       WHERE fv.template_id = _template_id
         AND fv.status = 'published'
         AND (fv.effective_from IS NULL OR fv.effective_from <= v_now)
         AND (
           fv.effective_until IS NULL
           OR (date_trunc('day', fv.effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
         )
       ORDER BY fv.version DESC, COALESCE(fv.published_at, fv.created_at) DESC, fv.id DESC
       LIMIT 1;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'error','No active form version is available for this form. Please contact support.',
          'code','NO_ACTIVE_VERSION','http',409,
          'application_id', _application_id,
          'template_id', _template_id
        );
      END IF;

      INSERT INTO public.application_form_versions (
        application_id, template_id, version_id, assigned_reason, assigned_by, locked_at, status
      ) VALUES (
        _application_id, _template_id, v_chosen.id, 'repinned_after_archive', v_uid, v_now, 'active'
      )
      ON CONFLICT DO NOTHING;

      v_updated_data := jsonb_set(
        COALESCE(v_app.data, '{}'::jsonb),
        '{form_version_ids}',
        COALESCE(v_app.data->'form_version_ids', '{}'::jsonb) || jsonb_build_object(_template_id::text, v_chosen.id::text),
        true
      );
      UPDATE public.applications SET data = v_updated_data WHERE id = _application_id;

      RETURN jsonb_build_object(
        'success', true,
        'http', 200,
        'application_id', _application_id,
        'template_id', _template_id,
        'version_id', v_chosen.id,
        'version_number', v_chosen.version,
        'semantic_version', v_chosen.semantic_version,
        'assigned_reason', 'repinned_after_archive',
        'was_existing_assignment', false
      );
    END IF;

    INSERT INTO public.application_form_versions (
      application_id, template_id, version_id, assigned_reason, assigned_by, locked_at, status
    ) VALUES (
      _application_id, _template_id, v_chosen.id, 'migrated_from_json', v_uid, v_now, 'active'
    )
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'application_id', _application_id,
      'template_id', _template_id,
      'version_id', v_chosen.id,
      'version_number', v_chosen.version,
      'semantic_version', v_chosen.semantic_version,
      'assigned_reason', 'resumed_existing',
      'was_existing_assignment', true
    );
  END IF;

  SELECT fv.id, fv.version, fv.semantic_version
    INTO v_chosen
    FROM public.form_versions fv
   WHERE fv.template_id = _template_id
     AND fv.status = 'published'
     AND (fv.effective_from IS NULL OR fv.effective_from <= v_now)
     AND (
       fv.effective_until IS NULL
       OR (date_trunc('day', fv.effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
     )
   ORDER BY fv.version DESC, COALESCE(fv.published_at, fv.created_at) DESC, fv.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error','No active form version is available for this form. Please contact support.',
      'code','NO_ACTIVE_VERSION','http',409,
      'application_id', _application_id,
      'template_id', _template_id
    );
  END IF;

  INSERT INTO public.application_form_versions (
    application_id, template_id, version_id, assigned_reason, assigned_by, locked_at, status
  ) VALUES (
    _application_id, _template_id, v_chosen.id, 'latest_at_start', v_uid, v_now, 'active'
  )
  ON CONFLICT DO NOTHING;

  v_updated_data := jsonb_set(
    COALESCE(v_app.data, '{}'::jsonb),
    '{form_version_ids}',
    COALESCE(v_app.data->'form_version_ids', '{}'::jsonb) || jsonb_build_object(_template_id::text, v_chosen.id::text),
    true
  );
  UPDATE public.applications SET data = v_updated_data WHERE id = _application_id;

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'application_id', _application_id,
    'template_id', _template_id,
    'version_id', v_chosen.id,
    'version_number', v_chosen.version,
    'semantic_version', v_chosen.semantic_version,
    'assigned_reason', 'latest_at_start',
    'was_existing_assignment', false
  );
END;
$function$;