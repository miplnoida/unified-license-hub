CREATE OR REPLACE FUNCTION public.supervisory_detect_run(
  _detector_code text DEFAULT NULL, _trigger_kind text DEFAULT 'scheduled')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _d record; _c record; _run uuid; _fp text; _sig uuid;
  _created int; _updated int; _resolved int; _scanned int;
  _keys text[]; _out jsonb := '[]'::jsonb;
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

  FOR _d IN
    SELECT * FROM public.supervisory_detector d
     WHERE d.is_active
       AND d.effective_from <= CURRENT_DATE
       AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)
       AND (_detector_code IS NULL OR d.code = _detector_code)
     ORDER BY d.code
  LOOP
    _created := 0; _updated := 0; _resolved := 0; _scanned := 0; _keys := ARRAY[]::text[];

    INSERT INTO public.supervisory_detector_run (
      detector_code, detector_version, trigger_kind, config_snapshot, triggered_by)
    VALUES (_d.code, _d.version, COALESCE(_trigger_kind,'scheduled'),
      jsonb_build_object('params', _d.params, 'version', _d.version,
        'default_severity', _d.default_severity, 'effective_from', _d.effective_from),
      auth.uid())
    RETURNING id INTO _run;

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

    IF _d.auto_resolve THEN
      UPDATE public.supervisory_signal
         SET state = 'RESOLVED', resolved_at = now(),
             resolution_reason = 'CONDITION_NO_LONGER_OBSERVED'
       WHERE detector_code = _d.code AND state = 'OPEN'
         AND NOT (fingerprint = ANY (_keys));
      GET DIAGNOSTICS _resolved = ROW_COUNT;
    END IF;

    UPDATE public.supervisory_detector_run
       SET status = 'COMPLETED', completed_at = now(), rows_scanned = _scanned,
           signals_created = _created, signals_updated = _updated,
           signals_resolved = _resolved
     WHERE id = _run;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
    VALUES (auth.uid(), 'SUPERVISORY_DETECTION_RUN', 'supervisory_detector_run', _run,
      jsonb_build_object('rows_scanned', _scanned, 'signals_created', _created,
        'signals_updated', _updated, 'signals_resolved', _resolved),
      jsonb_build_object('detector_code', _d.code, 'detector_version', _d.version,
        'trigger_kind', COALESCE(_trigger_kind,'scheduled')));

    _out := _out || jsonb_build_object('detector_code', _d.code, 'run_id', _run,
      'rows_scanned', _scanned, 'signals_created', _created,
      'signals_updated', _updated, 'signals_resolved', _resolved);
  END LOOP;

  RETURN jsonb_build_object('generated_at', now(), 'detectors', _out);
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_detect_run(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_detect_run(text, text) TO authenticated, service_role;
