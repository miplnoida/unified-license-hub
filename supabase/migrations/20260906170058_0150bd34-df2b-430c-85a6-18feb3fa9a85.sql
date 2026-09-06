-- OS-02F: scheduled detection orchestration, single-flight, resolution safety
CREATE OR REPLACE FUNCTION public.supervisory_detect_run(_detector_code text DEFAULT NULL::text, _trigger_kind text DEFAULT 'scheduled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _d record; _c record; _run uuid; _fp text; _sig uuid;
  _created int; _updated int; _resolved int; _scanned int;
  _keys text[]; _out jsonb := '[]'::jsonb;
  _scan_ok boolean; _err text; _n int;
  _impl text[] := ARRAY['AML_RISK_ELEVATED','EXAM_OUTCOME_ADVERSE','MC_CONDUCT_SIGNAL',
    'PRU_EWI_ALERT','PRU_RETURN_BREACH','RET_FILING_LATE','RET_FILING_MISSING',
    'SUP_FINDING_MATERIAL','SUP_REASSESSMENT_DUE_SOON','SUP_REASSESSMENT_OVERDUE',
    'SUP_REMEDIATION_INEFFECTIVE','SUP_REMEDIATION_OVERDUE'];
  _is_service boolean := current_setting('role', true) = 'service_role'
                         OR auth.uid() IS NULL;
BEGIN
  IF NOT _is_service
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.has_any_permission(auth.uid(), ARRAY['supervisory_spine.view',
           'prudential_supervision.view','aml_supervision.view',
           'market_conduct.run_conduct_analytics','system_configuration.edit']) THEN
    RAISE EXCEPTION 'Not authorised to run supervisory detection' USING ERRCODE = '42501';
  END IF;

  -- single flight: a competing scan never runs concurrently
  IF NOT pg_try_advisory_xact_lock(hashtext('public.supervisory_detect_run')) THEN
    RETURN jsonb_build_object('generated_at', now(), 'skipped', true,
      'reason', 'RUN_ALREADY_IN_PROGRESS',
      'trigger_kind', COALESCE(_trigger_kind,'scheduled'),
      'detectors', '[]'::jsonb);
  END IF;

  FOR _d IN
    SELECT * FROM public.supervisory_detector d
     WHERE d.is_active
       AND d.effective_from <= CURRENT_DATE
       AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)
       AND (_detector_code IS NULL OR d.code = _detector_code)
     ORDER BY d.code
  LOOP
    _created := 0; _updated := 0; _resolved := 0; _scanned := 0;
    _keys := ARRAY[]::text[]; _scan_ok := true; _err := NULL;

    INSERT INTO public.supervisory_detector_run (
      detector_code, detector_version, trigger_kind, config_snapshot, triggered_by)
    VALUES (_d.code, _d.version, COALESCE(_trigger_kind,'scheduled'),
      jsonb_build_object('params', _d.params, 'version', _d.version,
        'default_severity', _d.default_severity, 'effective_from', _d.effective_from,
        'auto_resolve', _d.auto_resolve),
      auth.uid())
    RETURNING id INTO _run;

    BEGIN
      IF _d.code = 'CERT_ABORT_MIDSCAN' THEN
        -- certification-only fixture proving an aborted scan resolves nothing.
        IF NOT public.cert_v2_guard_ok() THEN
          RAISE EXCEPTION 'Certification fixture detector is not permitted here'
            USING ERRCODE = '42501';
        END IF;
        RAISE EXCEPTION 'certification: scan aborted before completion';
      END IF;

      IF _d.code <> ALL (_impl) THEN
        RAISE EXCEPTION 'Detector % has no registered scan implementation', _d.code;
      END IF;

      FOR _c IN SELECT * FROM public.supervisory_detect_candidates(_d.code, _d.params)
      LOOP
        _scanned := _scanned + 1;
        _fp := _d.code || ':' || COALESCE(_c.entity_id::text,'na') || ':'
               || COALESCE(_c.domain_code,'CROSS_DOMAIN') || ':' || _c.cond_key;
        IF _fp = ANY (_keys) THEN CONTINUE; END IF;
        _keys := _keys || _fp;

        SELECT id INTO _sig FROM public.supervisory_signal
         WHERE fingerprint = _fp AND state = 'OPEN' LIMIT 1;

        IF _sig IS NULL THEN
          INSERT INTO public.supervisory_signal (
            entity_id, domain_code, source_kind, severity, detected_at, summary, detail,
            period_start, period_end, detector_code, fingerprint,
            first_detected_at, last_detected_at, occurrence_count, state,
            source_table, source_id, source_reference, observed_value, threshold_value,
            comparator, materiality_reason, config_provenance, external_reference,
            prudential_ewi_alert_id, conduct_signal_id, examination_id)
          VALUES (
            _c.entity_id, _c.domain_code, _c.source_kind,
            COALESCE(_c.severity, _d.default_severity), now(), _c.summary,
            COALESCE(_c.detail,'{}'::jsonb), _c.period_start, _c.period_end,
            _d.code, _fp, now(), now(), 1, 'OPEN',
            _c.source_table, _c.source_id, _c.source_reference, _c.observed_value,
            _c.threshold_value, _c.comparator, _c.materiality_reason,
            jsonb_build_object('detector_code', _d.code, 'detector_version', _d.version,
              'params', _d.params, 'config_owner', _d.config_owner,
              'effective_from', _d.effective_from, 'run_id', _run),
            COALESCE(_c.source_reference, _c.source_id::text),
            CASE WHEN _c.source_table = 'prudential_ewi_alerts' THEN _c.source_id END,
            CASE WHEN _c.source_table = 'conduct_signals' THEN _c.source_id END,
            CASE WHEN _c.source_table = 'examinations' THEN _c.source_id END)
          RETURNING id INTO _sig;
          _created := _created + 1;
        ELSE
          UPDATE public.supervisory_signal
             SET last_detected_at = now(),
                 occurrence_count = occurrence_count + 1,
                 observed_value = _c.observed_value,
                 threshold_value = _c.threshold_value,
                 severity = COALESCE(_c.severity, severity),
                 summary = _c.summary,
                 detail = COALESCE(_c.detail, detail)
           WHERE id = _sig;
          _updated := _updated + 1;
        END IF;

        INSERT INTO public.supervisory_signal_occurrence (
          signal_id, observed_at, observed_value, threshold_value, severity,
          detector_run_id, source_table, source_id, source_reference, detail)
        VALUES (_sig, now(), _c.observed_value, _c.threshold_value,
          COALESCE(_c.severity, _d.default_severity), _run, _c.source_table,
          _c.source_id, _c.source_reference, COALESCE(_c.detail,'{}'::jsonb));
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      _scan_ok := false;
      _err := SQLERRM;
      -- the failed scan's writes are rolled back with this block
      _created := 0; _updated := 0; _scanned := 0; _keys := ARRAY[]::text[];
    END;

    -- resolution requires a successfully completed authoritative scan
    IF _scan_ok AND _d.auto_resolve THEN
      UPDATE public.supervisory_signal
         SET state = 'RESOLVED', resolved_at = now(),
             resolution_reason = 'CONDITION_NO_LONGER_OBSERVED'
       WHERE detector_code = _d.code AND state = 'OPEN'
         AND NOT (fingerprint = ANY (_keys));
      GET DIAGNOSTICS _resolved = ROW_COUNT;
    END IF;

    UPDATE public.supervisory_detector_run
       SET status = CASE WHEN _scan_ok THEN 'COMPLETED' ELSE 'FAILED' END,
           completed_at = now(), rows_scanned = _scanned,
           signals_created = _created, signals_updated = _updated,
           signals_resolved = _resolved, error_text = _err,
           detail = jsonb_build_object(
             'scan_status', CASE WHEN _scan_ok THEN 'COMPLETE' ELSE 'INCOMPLETE' END,
             'resolution_applied', (_scan_ok AND _d.auto_resolve),
             'resolution_suppressed_reason',
               CASE WHEN NOT _scan_ok THEN 'SCAN_NOT_SUCCESSFULLY_COMPLETED' END,
             'trigger_kind', COALESCE(_trigger_kind,'scheduled'))
     WHERE id = _run;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
    VALUES (auth.uid(), 'SUPERVISORY_DETECTION_RUN', 'supervisory_detector_run', _run,
      jsonb_build_object('rows_scanned', _scanned, 'signals_created', _created,
        'signals_updated', _updated, 'signals_resolved', _resolved,
        'status', CASE WHEN _scan_ok THEN 'COMPLETED' ELSE 'FAILED' END),
      jsonb_build_object('detector_code', _d.code, 'detector_version', _d.version,
        'trigger_kind', COALESCE(_trigger_kind,'scheduled'), 'error_text', _err));

    _out := _out || jsonb_build_object('detector_code', _d.code, 'run_id', _run,
      'status', CASE WHEN _scan_ok THEN 'COMPLETED' ELSE 'FAILED' END,
      'rows_scanned', _scanned, 'signals_created', _created,
      'signals_updated', _updated, 'signals_resolved', _resolved,
      'error_text', _err);
  END LOOP;

  RETURN jsonb_build_object('generated_at', now(), 'skipped', false,
    'trigger_kind', COALESCE(_trigger_kind,'scheduled'), 'detectors', _out);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_detect_run(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_detect_run(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_detect_run(text, text) TO authenticated, service_role;

-- one orchestration entry point for the nightly window: all active, effective detectors
CREATE OR REPLACE FUNCTION public.supervisory_detect_run_scheduled()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  _res := public.supervisory_detect_run(NULL, 'scheduled');
  RETURN _res;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_detect_run_scheduled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_detect_run_scheduled() FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_detect_run_scheduled() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_detect_run_scheduled() TO service_role;

-- operational health of detection (truthful separation of attempted vs successful)
CREATE OR REPLACE FUNCTION public.supervisory_detection_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next timestamptz; _sched text;
BEGIN
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

REVOKE ALL ON FUNCTION public.supervisory_detection_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_detection_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_detection_health() TO authenticated, service_role;

-- one nightly orchestration job in the platform's overnight UTC window
SELECT cron.unschedule('supervisory-detection-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supervisory-detection-daily');

SELECT cron.schedule('supervisory-detection-daily', '0 2 * * *',
  $$SELECT public.supervisory_detect_run_scheduled();$$);