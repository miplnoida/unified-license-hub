-- PHASE 4: Form version lifecycle date policy
-- 1) Activate a form version as the current default for new applications.
--    - Sets the chosen version: effective_from = activation date (default today), effective_until = NULL
--    - For all OTHER published versions of the same template that are currently
--      "open ended" (effective_until IS NULL) or whose window ends after the
--      retirement date, sets effective_until to the LAST DAY of the current
--      month so they remain available for in-progress applications until then.
--    - Never deletes/archives prior versions.
CREATE OR REPLACE FUNCTION public.activate_form_version_as_current(
  _version_id uuid,
  _activation_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_v record;
  v_now timestamptz := now();
  v_activation timestamptz;
  v_month_end timestamptz;
  v_retired_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, template_id, version, semantic_version, status
    INTO v_v
    FROM public.form_versions
   WHERE id = _version_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Version not found','code','NOT_FOUND','http',404);
  END IF;
  IF v_v.status <> 'published' THEN
    RETURN jsonb_build_object('error','Only published versions can be activated','code','INVALID_STATUS','http',409);
  END IF;

  v_activation := COALESCE(_activation_date::timestamptz, date_trunc('day', v_now));
  -- Last day of current month at 23:59:59.999999
  v_month_end := date_trunc('month', v_now) + interval '1 month' - interval '1 microsecond';

  -- Promote chosen version
  UPDATE public.form_versions
     SET effective_from = v_activation,
         effective_until = NULL
   WHERE id = _version_id;

  -- Retire other open-ended or future-ending published versions of same template
  UPDATE public.form_versions
     SET effective_until = v_month_end
   WHERE template_id = v_v.template_id
     AND id <> _version_id
     AND status = 'published'
     AND (effective_until IS NULL OR effective_until > v_month_end);
  GET DIAGNOSTICS v_retired_count = ROW_COUNT;

  PERFORM public.create_audit_log(
    v_uid,
    'form_version_activated_as_current',
    'form_version',
    _version_id::text,
    NULL,
    jsonb_build_object(
      'template_id', v_v.template_id,
      'activation_date', v_activation,
      'retired_other_until', v_month_end,
      'retired_count', v_retired_count
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'version_id', _version_id,
    'template_id', v_v.template_id,
    'activation_date', v_activation,
    'retired_other_until', v_month_end,
    'retired_count', v_retired_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.activate_form_version_as_current(uuid, date) TO authenticated;

-- 2) Per-template usage counts for the version timeline UI.
--    Returns one row per published version with the number of in-progress
--    applications and submitted form_responses that reference each version.
CREATE OR REPLACE FUNCTION public.get_form_version_usage_counts(_template_id uuid)
RETURNS TABLE(
  version_id uuid,
  in_progress_count bigint,
  submitted_response_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role)
       OR public.has_role(v_uid,'admin'::app_role)
       OR public.has_role(v_uid,'supervisor'::app_role)
       OR public.has_role(v_uid,'licensing_officer'::app_role)
       OR public.has_role(v_uid,'analyst'::app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH vs AS (
    SELECT id FROM public.form_versions WHERE template_id = _template_id
  ),
  app_counts AS (
    SELECT
      COALESCE(NULLIF(v.k,'')::uuid, a.form_version_id) AS vid,
      count(*)::bigint AS cnt
    FROM public.applications a
    LEFT JOIN LATERAL jsonb_each_text(COALESCE(a.data->'form_version_ids','{}'::jsonb)) v(k, val)
      ON val::uuid IN (SELECT id FROM vs)
    WHERE a.status IN ('draft','in_progress','resubmission_requested','query_raised','submitted')
      AND (
        a.form_version_id IN (SELECT id FROM vs)
        OR val::uuid IN (SELECT id FROM vs)
      )
    GROUP BY 1
  ),
  resp_counts AS (
    SELECT version_id AS vid, count(*)::bigint AS cnt
    FROM public.form_responses
    WHERE version_id IN (SELECT id FROM vs)
      AND status = 'submitted'
    GROUP BY 1
  )
  SELECT
    vs.id,
    COALESCE((SELECT cnt FROM app_counts WHERE vid = vs.id), 0),
    COALESCE((SELECT cnt FROM resp_counts WHERE vid = vs.id), 0)
  FROM vs;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_form_version_usage_counts(uuid) TO authenticated;