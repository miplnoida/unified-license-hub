CREATE TABLE IF NOT EXISTS public.return_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  assigned_reason text NOT NULL DEFAULT 'latest_at_start',
  assigned_by uuid,
  locked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS return_form_versions_active_uniq
  ON public.return_form_versions (return_id, template_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS return_form_versions_return_idx
  ON public.return_form_versions (return_id);

CREATE INDEX IF NOT EXISTS return_form_versions_version_idx
  ON public.return_form_versions (version_id);

CREATE OR REPLACE FUNCTION public._touch_return_form_versions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_form_versions_updated_at ON public.return_form_versions;
CREATE TRIGGER trg_return_form_versions_updated_at
  BEFORE UPDATE ON public.return_form_versions
  FOR EACH ROW EXECUTE FUNCTION public._touch_return_form_versions_updated_at();

ALTER TABLE public.return_form_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Return owners and internal staff can view version assignments" ON public.return_form_versions;
CREATE POLICY "Return owners and internal staff can view version assignments"
  ON public.return_form_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.returns_filed r
      WHERE r.id = return_form_versions.return_id
        AND (
          r.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'supervisor'::app_role)
          OR public.has_role(auth.uid(), 'analyst'::app_role)
          OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
          OR EXISTS (
            SELECT 1
            FROM public.ppoc_entity_mappings pem
            WHERE pem.ppoc_user_id = auth.uid()
              AND pem.licensee_id = r.entity_id
              AND pem.is_active = true
          )
        )
    )
  );

INSERT INTO public.return_form_versions (
  return_id,
  template_id,
  version_id,
  assigned_reason,
  assigned_by,
  locked_at,
  status
)
SELECT DISTINCT ON (rfd.return_id, rfd.form_id)
  rfd.return_id,
  rfd.form_id,
  rfd.form_version_id,
  'migrated_from_return_form_data',
  rf.created_by,
  COALESCE(rfd.updated_at, rfd.created_at, now()),
  'active'
FROM public.return_form_data rfd
JOIN public.returns_filed rf ON rf.id = rfd.return_id
WHERE rfd.form_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.return_form_versions rfv
    WHERE rfv.return_id = rfd.return_id
      AND rfv.template_id = rfd.form_id
      AND rfv.status = 'active'
  )
ORDER BY rfd.return_id, rfd.form_id, rfd.updated_at DESC, rfd.created_at DESC;

CREATE OR REPLACE FUNCTION public.resolve_application_form_version(
  _application_id uuid,
  _template_id uuid
)
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

  SELECT id, applicant_id, data
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

  SELECT afv.id,
         afv.version_id,
         afv.assigned_reason,
         fv.id AS form_version_id,
         fv.template_id AS form_version_template_id,
         fv.version,
         fv.semantic_version
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
    SELECT id, template_id, version, semantic_version
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

    INSERT INTO public.application_form_versions (
      application_id,
      template_id,
      version_id,
      assigned_reason,
      assigned_by,
      locked_at,
      status
    )
    VALUES (
      _application_id,
      _template_id,
      v_chosen.id,
      'migrated_from_json',
      v_uid,
      v_now,
      'active'
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
    application_id,
    template_id,
    version_id,
    assigned_reason,
    assigned_by,
    locked_at,
    status
  )
  VALUES (
    _application_id,
    _template_id,
    v_chosen.id,
    'latest_at_start',
    v_uid,
    v_now,
    'active'
  )
  ON CONFLICT DO NOTHING;

  v_updated_data := jsonb_set(
    COALESCE(v_app.data, '{}'::jsonb),
    '{form_version_ids}',
    COALESCE(v_app.data->'form_version_ids', '{}'::jsonb) || jsonb_build_object(_template_id::text, v_chosen.id::text),
    true
  );

  UPDATE public.applications
     SET data = v_updated_data,
         updated_at = v_now
   WHERE id = _application_id;

  PERFORM public.create_audit_log(
    v_uid,
    'form_version_assigned',
    'application',
    _application_id::text,
    NULL,
    jsonb_build_object(
      'template_id', _template_id,
      'version_id', v_chosen.id,
      'version_number', v_chosen.version,
      'assigned_reason', 'latest_at_start'
    ),
    NULL
  );

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

GRANT EXECUTE ON FUNCTION public.resolve_application_form_version(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_return_form_version(
  _return_submission_id uuid,
  _template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_return record;
  v_is_internal boolean;
  v_has_ppoc_access boolean := false;
  v_assignment record;
  v_legacy_id uuid;
  v_chosen record;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  IF _return_submission_id IS NULL OR _template_id IS NULL THEN
    RETURN jsonb_build_object('error','return_submission_id and template_id are required','code','BAD_REQUEST','http',400);
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  SELECT id, created_by, entity_id, workflow_status
    INTO v_return
    FROM public.returns_filed
   WHERE id = _return_submission_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_return.entity_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.ppoc_entity_mappings pem
      WHERE pem.ppoc_user_id = v_uid
        AND pem.licensee_id = v_return.entity_id
        AND pem.is_active = true
    ) INTO v_has_ppoc_access;
  END IF;

  IF NOT v_is_internal AND v_return.created_by <> v_uid AND NOT v_has_ppoc_access THEN
    RETURN jsonb_build_object('error','You do not have access to this return','code','FORBIDDEN','http',403);
  END IF;

  SELECT rfv.id,
         rfv.version_id,
         fv.id AS form_version_id,
         fv.template_id AS form_version_template_id,
         fv.version,
         fv.semantic_version
    INTO v_assignment
    FROM public.return_form_versions rfv
    LEFT JOIN public.form_versions fv ON fv.id = rfv.version_id
   WHERE rfv.return_id = _return_submission_id
     AND rfv.template_id = _template_id
     AND rfv.status = 'active'
   ORDER BY rfv.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_assignment.form_version_id IS NULL OR v_assignment.form_version_template_id IS DISTINCT FROM _template_id THEN
      RETURN jsonb_build_object(
        'error','The assigned form version could not be found. Please contact support.',
        'code','PINNED_VERSION_MISSING','http',404,
        'return_submission_id', _return_submission_id,
        'template_id', _template_id,
        'version_id', v_assignment.version_id
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'return_submission_id', _return_submission_id,
      'template_id', _template_id,
      'version_id', v_assignment.version_id,
      'version_number', v_assignment.version,
      'semantic_version', v_assignment.semantic_version,
      'assigned_reason', 'resumed_existing',
      'was_existing_assignment', true
    );
  END IF;

  SELECT rfd.form_version_id AS version_id,
         fv.template_id,
         fv.version,
         fv.semantic_version
    INTO v_chosen
    FROM public.return_form_data rfd
    LEFT JOIN public.form_versions fv ON fv.id = rfd.form_version_id
   WHERE rfd.return_id = _return_submission_id
     AND rfd.form_id = _template_id
     AND rfd.form_version_id IS NOT NULL
   ORDER BY rfd.updated_at DESC, rfd.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_chosen.version_id IS NULL OR v_chosen.template_id IS DISTINCT FROM _template_id THEN
      RETURN jsonb_build_object(
        'error','The assigned form version could not be found. Please contact support.',
        'code','PINNED_VERSION_MISSING','http',404,
        'return_submission_id', _return_submission_id,
        'template_id', _template_id,
        'version_id', v_chosen.version_id
      );
    END IF;

    INSERT INTO public.return_form_versions (
      return_id,
      template_id,
      version_id,
      assigned_reason,
      assigned_by,
      locked_at,
      status
    )
    VALUES (
      _return_submission_id,
      _template_id,
      v_chosen.version_id,
      'migrated_from_return_form_data',
      v_uid,
      v_now,
      'active'
    )
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'return_submission_id', _return_submission_id,
      'template_id', _template_id,
      'version_id', v_chosen.version_id,
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
      'return_submission_id', _return_submission_id,
      'template_id', _template_id
    );
  END IF;

  INSERT INTO public.return_form_versions (
    return_id,
    template_id,
    version_id,
    assigned_reason,
    assigned_by,
    locked_at,
    status
  )
  VALUES (
    _return_submission_id,
    _template_id,
    v_chosen.id,
    'latest_at_start',
    v_uid,
    v_now,
    'active'
  )
  ON CONFLICT DO NOTHING;

  PERFORM public.create_audit_log(
    v_uid,
    'form_version_assigned',
    'return',
    _return_submission_id::text,
    NULL,
    jsonb_build_object(
      'template_id', _template_id,
      'version_id', v_chosen.id,
      'version_number', v_chosen.version,
      'assigned_reason', 'latest_at_start'
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'return_submission_id', _return_submission_id,
    'template_id', _template_id,
    'version_id', v_chosen.id,
    'version_number', v_chosen.version,
    'semantic_version', v_chosen.semantic_version,
    'assigned_reason', 'latest_at_start',
    'was_existing_assignment', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_return_form_version(uuid, uuid) TO authenticated;