-- Backend resolver for the form version an application should use.
-- Pins the resolved version into applications.data.form_version_ids
-- so future calls (and any newly-activated versions) cannot change it.
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
  v_pinned_id uuid;
  v_pinned record;
  v_chosen record;
  v_now timestamptz := now();
  v_existing_map jsonb;
  v_new_map jsonb;
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

  -- Lock the application row to make assignment race-safe.
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

  v_existing_map := COALESCE(v_app.data->'form_version_ids', '{}'::jsonb);
  v_pinned_id := NULLIF(v_existing_map->>(_template_id::text), '')::uuid;

  -- 1) Already pinned → validate and return.
  IF v_pinned_id IS NOT NULL THEN
    SELECT id, template_id, version, semantic_version, status,
           effective_from, effective_until
      INTO v_pinned
      FROM public.form_versions
     WHERE id = v_pinned_id
       AND template_id = _template_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error','The assigned form version could not be found. Please contact support.',
        'code','PINNED_VERSION_MISSING','http',404,
        'application_id', _application_id,
        'template_id', _template_id,
        'version_id', v_pinned_id
      );
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'application_id', _application_id,
      'template_id', _template_id,
      'version_id', v_pinned.id,
      'version_number', v_pinned.version,
      'semantic_version', v_pinned.semantic_version,
      'assigned_reason', 'existing_pin',
      'was_existing_assignment', true
    );
  END IF;

  -- 2) Not pinned → pick latest effective published version.
  --    `effective_until` is treated as inclusive end-of-day to match the UI
  --    semantics used by useLatestPublishedVersion / useActiveVersions.
  SELECT id, template_id, version, semantic_version, status,
         effective_from, effective_until
    INTO v_chosen
    FROM public.form_versions
   WHERE template_id = _template_id
     AND status = 'published'
     AND (effective_from IS NULL OR effective_from <= v_now)
     AND (
       effective_until IS NULL
       OR (date_trunc('day', effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
     )
   ORDER BY version DESC
   LIMIT 1;

  -- Fallback: any published version (back-compat with legacy rows
  -- that do not have effective_from / effective_until set).
  IF NOT FOUND THEN
    SELECT id, template_id, version, semantic_version, status,
           effective_from, effective_until
      INTO v_chosen
      FROM public.form_versions
     WHERE template_id = _template_id
       AND status = 'published'
     ORDER BY version DESC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error','No active form version is available for this form. Please contact support.',
      'code','NO_ACTIVE_VERSION','http',409,
      'application_id', _application_id,
      'template_id', _template_id
    );
  END IF;

  -- 3) Persist the new pin via a safe JSON merge so unrelated data is preserved.
  v_new_map := v_existing_map || jsonb_build_object(_template_id::text, v_chosen.id::text);

  UPDATE public.applications
     SET data = COALESCE(data, '{}'::jsonb)
                || jsonb_build_object('form_version_ids', v_new_map),
         updated_at = v_now
   WHERE id = _application_id;

  PERFORM public.create_audit_log(
    v_uid,
    'application_form_version_assigned',
    'application',
    _application_id::text,
    NULL,
    jsonb_build_object(
      'template_id', _template_id,
      'version_id', v_chosen.id,
      'version_number', v_chosen.version,
      'assigned_reason', 'latest_effective'
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
    'assigned_reason', 'latest_effective',
    'was_existing_assignment', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_application_form_version(uuid, uuid) TO authenticated;
