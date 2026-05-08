-- PHASE 5: Normalized form version assignment table

CREATE TABLE IF NOT EXISTS public.application_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  assigned_reason text NOT NULL CHECK (assigned_reason IN (
    'latest_at_start','resumed_existing','migrated_from_json','admin_override','legacy_backfill'
  )),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  locked_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','migrated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS application_form_versions_active_uniq
  ON public.application_form_versions (application_id, template_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS application_form_versions_app_idx
  ON public.application_form_versions (application_id);
CREATE INDEX IF NOT EXISTS application_form_versions_version_idx
  ON public.application_form_versions (version_id);

-- Local updated_at trigger (no dependency on shared helper that may not exist)
CREATE OR REPLACE FUNCTION public._touch_application_form_versions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_form_versions_updated_at ON public.application_form_versions;
CREATE TRIGGER trg_app_form_versions_updated_at
  BEFORE UPDATE ON public.application_form_versions
  FOR EACH ROW EXECUTE FUNCTION public._touch_application_form_versions_updated_at();

ALTER TABLE public.application_form_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App owners and internal staff can view assignments" ON public.application_form_versions;
CREATE POLICY "App owners and internal staff can view assignments"
  ON public.application_form_versions
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
    OR public.has_role(auth.uid(), 'analyst'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_form_versions.application_id
         AND a.applicant_id = auth.uid()
    )
  );

-- Backfill from legacy JSON
INSERT INTO public.application_form_versions
  (application_id, template_id, version_id, assigned_reason, status, assigned_at)
SELECT a.id, kv.k::uuid, kv.val::uuid, 'migrated_from_json', 'active',
       COALESCE(a.submitted_at, a.created_at, now())
  FROM public.applications a
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(a.data->'form_version_ids','{}'::jsonb)) kv(k, val)
 WHERE kv.val IS NOT NULL AND kv.val <> ''
   AND EXISTS (
     SELECT 1 FROM public.form_versions fv
      WHERE fv.id = kv.val::uuid AND fv.template_id = kv.k::uuid
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.application_form_versions afv
      WHERE afv.application_id = a.id
        AND afv.template_id = kv.k::uuid
        AND afv.status = 'active'
   );

-- Updated resolver
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
  v_existing_map jsonb;
  v_new_map jsonb;
  v_assigned_reason text;
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

  -- 1) Normalized table = source of truth
  SELECT afv.version_id, afv.assigned_reason, fv.version, fv.semantic_version
    INTO v_assignment
    FROM public.application_form_versions afv
    JOIN public.form_versions fv ON fv.id = afv.version_id
   WHERE afv.application_id = _application_id
     AND afv.template_id = _template_id
     AND afv.status = 'active'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'http', 200,
      'application_id', _application_id, 'template_id', _template_id,
      'version_id', v_assignment.version_id,
      'version_number', v_assignment.version,
      'semantic_version', v_assignment.semantic_version,
      'assigned_reason', v_assignment.assigned_reason,
      'was_existing_assignment', true
    );
  END IF;

  -- 2) Legacy JSON
  v_existing_map := COALESCE(v_app.data->'form_version_ids', '{}'::jsonb);
  v_legacy_id := NULLIF(v_existing_map->>(_template_id::text), '')::uuid;

  IF v_legacy_id IS NOT NULL THEN
    SELECT id, version, semantic_version INTO v_chosen
      FROM public.form_versions
     WHERE id = v_legacy_id AND template_id = _template_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error','The assigned form version could not be found. Please contact support.',
        'code','PINNED_VERSION_MISSING','http',404,
        'application_id', _application_id, 'template_id', _template_id, 'version_id', v_legacy_id
      );
    END IF;
    v_assigned_reason := 'migrated_from_json';
  ELSE
    -- 3) Latest effective published version, fallback to latest published
    SELECT id, version, semantic_version INTO v_chosen
      FROM public.form_versions
     WHERE template_id = _template_id
       AND status = 'published'
       AND (effective_from IS NULL OR effective_from <= v_now)
       AND (
         effective_until IS NULL
         OR (date_trunc('day', effective_until) + interval '1 day' - interval '1 microsecond') >= v_now
       )
     ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN
      SELECT id, version, semantic_version INTO v_chosen
        FROM public.form_versions
       WHERE template_id = _template_id AND status = 'published'
       ORDER BY version DESC LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error','No active form version is available for this form. Please contact support.',
        'code','NO_ACTIVE_VERSION','http',409,
        'application_id', _application_id, 'template_id', _template_id
      );
    END IF;
    v_assigned_reason := 'latest_at_start';
  END IF;

  INSERT INTO public.application_form_versions
    (application_id, template_id, version_id, assigned_reason, assigned_by, locked_at, status)
  VALUES
    (_application_id, _template_id, v_chosen.id, v_assigned_reason, v_uid, v_now, 'active')
  ON CONFLICT DO NOTHING;

  -- Mirror to legacy JSON for back-compat
  v_new_map := v_existing_map || jsonb_build_object(_template_id::text, v_chosen.id::text);
  UPDATE public.applications
     SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('form_version_ids', v_new_map),
         updated_at = v_now
   WHERE id = _application_id;

  PERFORM public.create_audit_log(
    v_uid, 'application_form_version_assigned', 'application',
    _application_id::text, NULL,
    jsonb_build_object(
      'template_id', _template_id,
      'version_id', v_chosen.id,
      'version_number', v_chosen.version,
      'assigned_reason', v_assigned_reason
    ), NULL
  );

  RETURN jsonb_build_object(
    'success', true, 'http', 200,
    'application_id', _application_id, 'template_id', _template_id,
    'version_id', v_chosen.id,
    'version_number', v_chosen.version,
    'semantic_version', v_chosen.semantic_version,
    'assigned_reason', v_assigned_reason,
    'was_existing_assignment', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_application_form_version(uuid, uuid) TO authenticated;