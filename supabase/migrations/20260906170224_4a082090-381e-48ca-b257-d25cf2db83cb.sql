CREATE OR REPLACE FUNCTION public.supervisory_detection_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next timestamptz; _sched text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
           'prudential_supervision.view','aml_supervision.view',
           'market_conduct.run_conduct_analytics','system_configuration.edit']) THEN
    RAISE EXCEPTION 'Not authorised to view supervisory detection health' USING ERRCODE = '42501';
  END IF;

  BEGIN
    SELECT j.schedule INTO _sched FROM cron.job j
     WHERE j.jobname = 'supervisory-detection-daily' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _sched := NULL;
  END;
  IF _sched IS NOT NULL THEN
    _next := (date_trunc('day', now() at time zone 'UTC')
              + interval '2 hours') at time zone 'UTC';
    IF _next <= now() THEN _next := _next + interval '1 day'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'schedule', _sched,
    'schedule_timezone', 'UTC',
    'next_scheduled_at', _next,
    'last_successful_scheduled_run', (
      SELECT jsonb_build_object('run_id', r.id, 'detector_code', r.detector_code,
        'started_at', r.started_at, 'completed_at', r.completed_at)
        FROM public.supervisory_detector_run r
       WHERE r.trigger_kind = 'scheduled' AND r.status = 'COMPLETED'
       ORDER BY r.completed_at DESC NULLS LAST LIMIT 1),
    'last_attempted_run', (
      SELECT jsonb_build_object('run_id', r.id, 'detector_code', r.detector_code,
        'trigger_kind', r.trigger_kind, 'status', r.status,
        'started_at', r.started_at, 'completed_at', r.completed_at,
        'error_text', r.error_text)
        FROM public.supervisory_detector_run r
       ORDER BY r.started_at DESC LIMIT 1),
    'last_successful_run', (
      SELECT jsonb_build_object('run_id', r.id, 'detector_code', r.detector_code,
        'trigger_kind', r.trigger_kind, 'completed_at', r.completed_at)
        FROM public.supervisory_detector_run r
       WHERE r.status = 'COMPLETED'
       ORDER BY r.completed_at DESC NULLS LAST LIMIT 1),
    'runs_in_progress', (
      SELECT count(*) FROM public.supervisory_detector_run r WHERE r.status = 'RUNNING'),
    'detectors_needing_attention', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'detector_code')
        FROM (
          SELECT jsonb_build_object('detector_code', d.code, 'name', d.name,
            'status', lr.status, 'started_at', lr.started_at,
            'error_text', lr.error_text,
            'reason', CASE WHEN lr.id IS NULL THEN 'NEVER_RUN'
                           WHEN lr.status = 'FAILED' THEN 'LAST_RUN_FAILED'
                           ELSE 'LAST_RUN_INCOMPLETE' END) AS x
            FROM public.supervisory_detector d
            LEFT JOIN LATERAL (
              SELECT r.* FROM public.supervisory_detector_run r
               WHERE r.detector_code = d.code
               ORDER BY r.started_at DESC LIMIT 1) lr ON true
           WHERE d.is_active
             AND (lr.id IS NULL OR lr.status <> 'COMPLETED')
        ) q), '[]'::jsonb));
END $function$;