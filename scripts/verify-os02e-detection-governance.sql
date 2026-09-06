-- ===========================================================================
-- OS-02E — Continuous Detection & Trigger Governance certification gate.
--
-- Rollback-safe: the whole script runs inside a transaction that is ROLLED
-- BACK, so it performs no persistent writes.
--
--   psql -f scripts/verify-os02e-detection-governance.sql
-- ===========================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE det_result(gate text, verdict text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.det(_gate text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO det_result VALUES (_gate, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;

-- DET-01 canonical convergence: detection has no separate signal object -------
SELECT pg_temp.det('DET-01',
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~ '^(detected_|detection_|trigger_)'
      AND table_name <> 'supervisory_detector') = 0,
  'no parallel detection/trigger business tables exist');

-- DET-02 conditions live on the canonical supervisory signal ------------------
SELECT pg_temp.det('DET-02',
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='supervisory_signal'
      AND column_name IN ('detector_code','fingerprint','state','first_detected_at',
        'last_detected_at','occurrence_count','source_table','source_id',
        'observed_value','threshold_value','materiality_reason','config_provenance')) = 12,
  'signal identity/lifecycle/provenance columns present on supervisory_signal');

-- DET-03 deterministic identity enforced by the database ---------------------
SELECT pg_temp.det('DET-03',
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
           AND indexname='uq_supervisory_signal_open_fingerprint'),
  'unique open-fingerprint index enforces one open condition per real condition');

-- DET-04 no duplicate open conditions in live data ---------------------------
SELECT pg_temp.det('DET-04',
  (SELECT count(*) FROM (
     SELECT fingerprint FROM public.supervisory_signal
      WHERE state='OPEN' AND fingerprint IS NOT NULL
      GROUP BY 1 HAVING count(*) > 1) d) = 0,
  'live data holds no duplicate open fingerprints');

-- DET-05 every detected condition names its canonical source record ----------
SELECT pg_temp.det('DET-05',
  (SELECT count(*) FROM public.supervisory_signal
    WHERE detector_code IS NOT NULL
      AND (source_table IS NULL OR source_id IS NULL)) = 0,
  'all detector-produced conditions carry source_table + source_id');

-- DET-06 configuration provenance recorded on every condition ----------------
SELECT pg_temp.det('DET-06',
  (SELECT count(*) FROM public.supervisory_signal
    WHERE detector_code IS NOT NULL
      AND (config_provenance->>'detector_code' IS NULL
           OR config_provenance->>'detector_version' IS NULL
           OR config_provenance->>'config_owner' IS NULL)) = 0,
  'detector code, version and configuration owner captured per condition');

-- DET-07 materiality is stated, never implied --------------------------------
SELECT pg_temp.det('DET-07',
  (SELECT count(*) FROM public.supervisory_signal
    WHERE detector_code IS NOT NULL AND COALESCE(materiality_reason,'') = '') = 0,
  'every detected condition states why it is material');

-- DET-08 detector register is governed and effective dated -------------------
SELECT pg_temp.det('DET-08',
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='supervisory_detector'
      AND column_name IN ('version','effective_from','effective_to','config_owner',
        'params','is_active','execution_mode')) = 7
  AND (SELECT count(*) FROM public.supervisory_detector WHERE is_active) >= 12,
  'detector register versioned, effective dated, owned; >= 12 active detectors');

-- DET-09 every active detector reads a real canonical source -----------------
SELECT pg_temp.det('DET-09',
  NOT EXISTS (
    SELECT 1 FROM public.supervisory_detector d
     WHERE d.is_active
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema='public' AND t.table_name = d.source_object)),
  'each active detector points at an existing canonical table');

-- DET-10 detection is authority separated: it never writes risk state --------
SELECT pg_temp.det('DET-10',
  (SELECT count(*) FROM pg_proc p
    WHERE p.proname IN ('supervisory_detect_run','supervisory_detect_candidates')
      AND p.pronamespace='public'::regnamespace
      AND pg_get_functiondef(p.oid) ~* '(update|insert into)\s+(public\.)?(entity_risk_state|supervisory_assessment|supervisory_attention|supervisory_plan|supervisory_intervention|supervisory_work_item)') = 0,
  'detection writes no risk rating, assessment, attention, plan, intervention or work item');

-- DET-11 candidate evaluation is read-only -----------------------------------
SELECT pg_temp.det('DET-11',
  (SELECT provolatile FROM pg_proc WHERE proname='supervisory_detect_candidates'
     AND pronamespace='public'::regnamespace) = 's',
  'candidate detection is STABLE (read-only)');

-- DET-12 unauthenticated callers cannot run detection ------------------------
SELECT pg_temp.det('DET-12',
  NOT has_function_privilege('anon', 'public.supervisory_detect_run(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.supervisory_detect_candidates(text,jsonb)', 'EXECUTE'),
  'anon cannot execute detection functions');

-- DET-13 candidate scan is internal only (definer, not client callable) ------
SELECT pg_temp.det('DET-13',
  NOT has_function_privilege('authenticated', 'public.supervisory_detect_candidates(text,jsonb)', 'EXECUTE'),
  'raw candidate scan is not exposed to signed-in clients');

-- DET-14 read models are SECURITY INVOKER (RLS still applies) ----------------
SELECT pg_temp.det('DET-14',
  (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname IN ('supervisory_detection_register','supervisory_entity_detected_conditions',
                     'supervisory_detector_assurance')
     AND prosecdef) = 0,
  'detection read models run as the caller, so RLS and permissions apply');

-- DET-15 new tables are RLS protected with policies --------------------------
SELECT pg_temp.det('DET-15',
  NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relname IN ('supervisory_detector','supervisory_detector_run','supervisory_signal_occurrence')
       AND c.relnamespace='public'::regnamespace
       AND (NOT c.relrowsecurity
            OR NOT EXISTS (SELECT 1 FROM pg_policies p
                            WHERE p.schemaname='public' AND p.tablename=c.relname))),
  'detector register, run log and occurrence history all have RLS + policies');

-- DET-16 detector configuration is writable only by configuration owners -----
SELECT pg_temp.det('DET-16',
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
            AND tablename='supervisory_detector' AND policyname='supervisory_detector_write'
            AND with_check LIKE '%system_configuration%'),
  'only configuration administrators may change detector settings');

-- DET-17 idempotency: a re-run creates nothing new ---------------------------
DO $$
DECLARE _before int; _after int; _res jsonb; _created int;
BEGIN
  SELECT count(*) INTO _before FROM public.supervisory_signal;
  _res := public.supervisory_detect_run(NULL, 'certification');
  SELECT count(*) INTO _after FROM public.supervisory_signal;
  SELECT COALESCE(sum((d->>'signals_created')::int),0) INTO _created
    FROM jsonb_array_elements(_res->'detectors') d;
  PERFORM pg_temp.det('DET-17', _created = 0 AND _after = _before,
    format('re-run created %s conditions (row delta %s)', _created, _after - _before));
END $$;

-- DET-18 repeat observation is recorded as occurrence history ----------------
DO $$
DECLARE _occ int; _sig int;
BEGIN
  SELECT count(*) INTO _occ FROM public.supervisory_signal_occurrence;
  SELECT count(*) INTO _sig FROM public.supervisory_signal WHERE detector_code IS NOT NULL;
  PERFORM pg_temp.det('DET-18', _occ >= _sig,
    format('%s occurrences recorded for %s conditions', _occ, _sig));
END $$;

-- DET-19 conditions that disappear are closed with a reason ------------------
DO $$
DECLARE _sig uuid; _state text; _reason text;
BEGIN
  INSERT INTO public.supervisory_signal (
    entity_id, domain_code, source_kind, severity, summary, detector_code, fingerprint,
    state, source_table, source_id, materiality_reason, config_provenance,
    first_detected_at, last_detected_at)
  SELECT l.id, 'PRUDENTIAL', 'RETURN_BREACH', 'high', 'certification stale condition',
         'PRU_RETURN_BREACH', 'PRU_RETURN_BREACH:' || l.id || ':PRUDENTIAL:cert_stale_condition',
         'OPEN', 'return_threshold_breaches', gen_random_uuid(),
         'certification fixture', '{"detector_code":"PRU_RETURN_BREACH","detector_version":1,"config_owner":"PRUDENTIAL_POLICY"}'::jsonb,
         now(), now()
    FROM public.licensees l LIMIT 1
  RETURNING id INTO _sig;

  PERFORM public.supervisory_detect_run('PRU_RETURN_BREACH', 'certification');

  SELECT state, resolution_reason INTO _state, _reason
    FROM public.supervisory_signal WHERE id = _sig;

  PERFORM pg_temp.det('DET-19',
    _state = 'RESOLVED' AND _reason = 'CONDITION_NO_LONGER_OBSERVED',
    format('stale condition became %s (%s)', _state, COALESCE(_reason,'no reason')));
END $$;

-- DET-20 a returning condition reuses the same condition, not a new one ------
DO $$
DECLARE _sig uuid; _fp text; _cnt int; _occ_before int; _occ_after int;
BEGIN
  SELECT id, fingerprint, occurrence_count INTO _sig, _fp, _cnt
    FROM public.supervisory_signal
   WHERE detector_code = 'PRU_EWI_ALERT' AND state = 'OPEN' LIMIT 1;

  IF _sig IS NULL THEN
    PERFORM pg_temp.det('DET-20', false, 'no open early-warning condition available to exercise');
    RETURN;
  END IF;

  SELECT count(*) INTO _occ_before FROM public.supervisory_signal_occurrence WHERE signal_id = _sig;
  PERFORM public.supervisory_detect_run('PRU_EWI_ALERT', 'certification');
  SELECT count(*) INTO _occ_after FROM public.supervisory_signal_occurrence WHERE signal_id = _sig;

  PERFORM pg_temp.det('DET-20',
    _occ_after = _occ_before + 1
    AND (SELECT occurrence_count FROM public.supervisory_signal WHERE id = _sig) = _cnt + 1
    AND (SELECT count(*) FROM public.supervisory_signal WHERE fingerprint = _fp AND state='OPEN') = 1,
    format('same condition kept identity; occurrences %s -> %s', _occ_before, _occ_after));
END $$;

-- DET-21 detection never mutates risk state (live proof) ---------------------
DO $$
DECLARE _before text; _after text;
BEGIN
  SELECT md5(string_agg(id::text || COALESCE(residual_rating,'') || COALESCE(next_review_date::text,''), '|' ORDER BY id))
    INTO _before FROM public.entity_risk_state;
  PERFORM public.supervisory_detect_run(NULL, 'certification');
  SELECT md5(string_agg(id::text || COALESCE(residual_rating,'') || COALESCE(next_review_date::text,''), '|' ORDER BY id))
    INTO _after FROM public.entity_risk_state;
  PERFORM pg_temp.det('DET-21', _before IS NOT DISTINCT FROM _after,
    'risk state unchanged by detection runs');
END $$;

-- DET-22 detection never creates supervisory action (live proof) -------------
DO $$
DECLARE _a int; _a2 int; _p int; _p2 int; _w int; _w2 int; _f int; _f2 int;
BEGIN
  SELECT count(*) INTO _a FROM public.supervisory_attention;
  SELECT count(*) INTO _p FROM public.supervisory_plan;
  SELECT count(*) INTO _w FROM public.supervisory_work_item;
  SELECT count(*) INTO _f FROM public.supervisory_finding;
  PERFORM public.supervisory_detect_run(NULL, 'certification');
  SELECT count(*) INTO _a2 FROM public.supervisory_attention;
  SELECT count(*) INTO _p2 FROM public.supervisory_plan;
  SELECT count(*) INTO _w2 FROM public.supervisory_work_item;
  SELECT count(*) INTO _f2 FROM public.supervisory_finding;
  PERFORM pg_temp.det('DET-22',
    _a = _a2 AND _p = _p2 AND _w = _w2 AND _f = _f2,
    'attention, plans, work items and findings unchanged by detection');
END $$;

-- DET-23 every run is logged with counts and configuration snapshot ----------
DO $$
DECLARE _run record;
BEGIN
  PERFORM public.supervisory_detect_run('MC_CONDUCT_SIGNAL', 'certification');
  SELECT * INTO _run FROM public.supervisory_detector_run
   WHERE detector_code = 'MC_CONDUCT_SIGNAL' ORDER BY started_at DESC LIMIT 1;
  PERFORM pg_temp.det('DET-23',
    _run.status = 'COMPLETED' AND _run.completed_at IS NOT NULL
    AND _run.config_snapshot ? 'params' AND _run.detector_version IS NOT NULL,
    format('run logged: status %s, version %s', _run.status, _run.detector_version));
END $$;

-- DET-24 every run is audited ------------------------------------------------
DO $$
DECLARE _before int; _after int;
BEGIN
  SELECT count(*) INTO _before FROM public.audit_logs WHERE action = 'SUPERVISORY_DETECTION_RUN';
  PERFORM public.supervisory_detect_run('AML_RISK_ELEVATED', 'certification');
  SELECT count(*) INTO _after FROM public.audit_logs WHERE action = 'SUPERVISORY_DETECTION_RUN';
  PERFORM pg_temp.det('DET-24', _after = _before + 1,
    format('audit entries %s -> %s', _before, _after));
END $$;

-- DET-25 inactive or not-yet-effective detectors do not run -----------------
DO $$
DECLARE _runs int;
BEGIN
  UPDATE public.supervisory_detector SET is_active = false WHERE code = 'RET_FILING_LATE';
  SELECT count(*) INTO _runs FROM jsonb_array_elements(
    (public.supervisory_detect_run(NULL,'certification'))->'detectors') d
   WHERE d->>'detector_code' = 'RET_FILING_LATE';
  PERFORM pg_temp.det('DET-25', _runs = 0, 'deactivated detector is skipped');
END $$;

-- DET-26 coverage: every supervisory area with a canonical detection source --
SELECT pg_temp.det('DET-26',
  (SELECT count(DISTINCT domain_code) FROM public.supervisory_detector WHERE is_active) >= 4,
  format('active detectors span %s supervisory areas',
    (SELECT count(DISTINCT domain_code) FROM public.supervisory_detector WHERE is_active)));

-- DET-27 detection produced real conditions from real records ----------------
SELECT pg_temp.det('DET-27',
  (SELECT count(*) FROM public.supervisory_signal
    WHERE detector_code IS NOT NULL AND state='OPEN') > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.supervisory_signal s
     WHERE s.detector_code IS NOT NULL AND s.entity_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = s.entity_id)),
  format('%s open conditions, all on real licensed entities',
    (SELECT count(*) FROM public.supervisory_signal WHERE detector_code IS NOT NULL AND state='OPEN')));

-- DET-28 threshold provenance for value-based detection ---------------------
SELECT pg_temp.det('DET-28',
  NOT EXISTS (
    SELECT 1 FROM public.supervisory_signal
     WHERE detector_code = 'PRU_RETURN_BREACH'
       AND EXISTS (SELECT 1 FROM public.return_threshold_breaches b
                    WHERE b.id = supervisory_signal.source_id)
       AND (threshold_value IS NULL OR comparator IS NULL
            OR detail->>'threshold_version_state' IS NULL
            OR (detail->>'threshold_version_state' = 'RECORDED'
                AND detail->>'threshold_version' IS NULL))),
  'threshold conditions record value, comparator and either the threshold version or that the source does not hold one');


-- ============== scheduling gates (OS-02E operationalisation) ================

-- DET-29 scheduled and manual execution converge on one runner ---------------
SELECT pg_temp.det('DET-29',
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='supervisory_detect_run_scheduled')
    LIKE '%supervisory_detect_run(NULL%'
  AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname <> 'supervisory_detect_run'
          AND pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.supervisory_detector_run%') = 0,
  'scheduled entry point delegates to supervisory_detect_run; no second runner writes run history');

-- DET-30 one nightly orchestration job in the platform overnight UTC window ---
DO $$
DECLARE _h jsonb;
BEGIN
  _h := public.supervisory_detection_health();
  PERFORM pg_temp.det('DET-30',
    _h->>'schedule' = '0 2 * * *' AND _h->>'schedule_timezone' = 'UTC'
    AND _h->>'next_scheduled_at' IS NOT NULL,
    format('schedule %s (%s), next %s', _h->>'schedule', _h->>'schedule_timezone',
      _h->>'next_scheduled_at'));
END $$;

-- DET-31 scheduled orchestration covers every active effective detector ------
DO $$
DECLARE _ran int; _active int;
BEGIN
  SELECT count(*) INTO _active FROM public.supervisory_detector
   WHERE is_active AND effective_from <= CURRENT_DATE
     AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);
  SELECT count(*) INTO _ran FROM jsonb_array_elements(
    (public.supervisory_detect_run_scheduled())->'detectors') d;
  PERFORM pg_temp.det('DET-31', _ran = _active AND _active > 0,
    format('one scheduled orchestration executed %s of %s active detectors', _ran, _active));
END $$;

-- DET-32 same-day scheduled retry is idempotent ------------------------------
DO $$
DECLARE _before int; _created int; _resolved int;
BEGIN
  SELECT count(*) INTO _before FROM public.supervisory_signal;
  SELECT COALESCE(sum((d->>'signals_created')::int),0),
         COALESCE(sum((d->>'signals_resolved')::int),0)
    INTO _created, _resolved
    FROM jsonb_array_elements((public.supervisory_detect_run_scheduled())->'detectors') d;
  PERFORM pg_temp.det('DET-32',
    _created = 0 AND _resolved = 0
    AND (SELECT count(*) FROM public.supervisory_signal) = _before,
    format('same-day retry created %s and resolved %s conditions', _created, _resolved));
END $$;

-- DET-33 overlapping invocation cannot run a competing scan ------------------
DO $$
DECLARE _held boolean; _src text;
BEGIN
  PERFORM public.supervisory_detect_run('MC_CONDUCT_SIGNAL','certification');
  SELECT EXISTS (
    SELECT 1 FROM pg_locks
     WHERE locktype = 'advisory' AND granted
       AND objid = (hashtext('public.supervisory_detect_run')::bigint & 4294967295)
       AND pid = pg_backend_pid()) INTO _held;
  SELECT pg_get_functiondef(p.oid) INTO _src FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='supervisory_detect_run';
  PERFORM pg_temp.det('DET-33',
    _held AND _src LIKE '%pg_try_advisory_xact_lock%'
    AND _src LIKE '%RUN_ALREADY_IN_PROGRESS%',
    format('run holds the single-flight lock (%s); a competing invocation is refused', _held));
END $$;

-- DET-34 a failed detector run resolves nothing ------------------------------
DO $$
DECLARE _sig uuid; _state text; _run record;
BEGIN
  INSERT INTO public.supervisory_detector (code, name, domain_code, source_object,
    source_kind, config_owner, execution_mode, params, auto_resolve, is_active)
  VALUES ('CERT_ABORT_MIDSCAN','Certification aborting detector','PRUDENTIAL',
    'return_threshold_breaches','RETURN_BREACH','PRUDENTIAL_POLICY','SCHEDULED',
    '{}'::jsonb, true, true);

  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
    summary, detector_code, fingerprint, state, source_table, source_id,
    materiality_reason, config_provenance, first_detected_at, last_detected_at)
  SELECT l.id,'PRUDENTIAL','RETURN_BREACH','high','certification open condition',
    'CERT_ABORT_MIDSCAN','CERT_ABORT_MIDSCAN:'||l.id||':PRUDENTIAL:cert_failed_run',
    'OPEN','return_threshold_breaches', gen_random_uuid(),'certification fixture',
    '{"detector_code":"CERT_ABORT_MIDSCAN","detector_version":1,"config_owner":"PRUDENTIAL_POLICY"}'::jsonb,
    now(), now() FROM public.licensees l LIMIT 1
  RETURNING id INTO _sig;

  PERFORM public.supervisory_detect_run('CERT_ABORT_MIDSCAN','scheduled');

  SELECT state INTO _state FROM public.supervisory_signal WHERE id = _sig;
  SELECT * INTO _run FROM public.supervisory_detector_run
   WHERE detector_code = 'CERT_ABORT_MIDSCAN' ORDER BY started_at DESC LIMIT 1;

  PERFORM pg_temp.det('DET-34',
    _run.status = 'FAILED' AND _run.error_text IS NOT NULL
    AND _run.signals_resolved = 0 AND _state = 'OPEN',
    format('failed run (%s) left the open condition %s', _run.status, _state));
END $$;

-- DET-35 an incomplete scan resolves nothing and says so ---------------------
DO $$
DECLARE _sig uuid; _state text; _run record;
BEGIN
  INSERT INTO public.supervisory_detector (code, name, domain_code, source_object,
    source_kind, config_owner, execution_mode, params, auto_resolve, is_active)
  VALUES ('CERT_NO_IMPLEMENTATION','Certification unimplemented detector','PRUDENTIAL',
    'return_threshold_breaches','RETURN_BREACH','PRUDENTIAL_POLICY','SCHEDULED',
    '{}'::jsonb, true, true);

  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
    summary, detector_code, fingerprint, state, source_table, source_id,
    materiality_reason, config_provenance, first_detected_at, last_detected_at)
  SELECT l.id,'PRUDENTIAL','RETURN_BREACH','high','certification open condition',
    'CERT_NO_IMPLEMENTATION','CERT_NO_IMPLEMENTATION:'||l.id||':PRUDENTIAL:cert_incomplete',
    'OPEN','return_threshold_breaches', gen_random_uuid(),'certification fixture',
    '{"detector_code":"CERT_NO_IMPLEMENTATION","detector_version":1,"config_owner":"PRUDENTIAL_POLICY"}'::jsonb,
    now(), now() FROM public.licensees l LIMIT 1
  RETURNING id INTO _sig;

  PERFORM public.supervisory_detect_run('CERT_NO_IMPLEMENTATION','scheduled');

  SELECT state INTO _state FROM public.supervisory_signal WHERE id = _sig;
  SELECT * INTO _run FROM public.supervisory_detector_run
   WHERE detector_code = 'CERT_NO_IMPLEMENTATION' ORDER BY started_at DESC LIMIT 1;

  PERFORM pg_temp.det('DET-35',
    _run.status = 'FAILED'
    AND _run.detail->>'scan_status' = 'INCOMPLETE'
    AND _run.detail->>'resolution_suppressed_reason' = 'SCAN_NOT_SUCCESSFULLY_COMPLETED'
    AND (_run.detail->>'resolution_applied')::boolean = false
    AND _state = 'OPEN',
    format('incomplete scan recorded as %s and resolved nothing', _run.detail->>'scan_status'));
END $$;

-- DET-36 a successful scheduled scan still resolves a disappeared condition --
DO $$
DECLARE _sig uuid; _state text; _reason text;
BEGIN
  INSERT INTO public.supervisory_signal (entity_id, domain_code, source_kind, severity,
    summary, detector_code, fingerprint, state, source_table, source_id,
    materiality_reason, config_provenance, first_detected_at, last_detected_at)
  SELECT l.id,'MARKET_CONDUCT','CONDUCT_SIGNAL','high','certification stale condition',
    'MC_CONDUCT_SIGNAL','MC_CONDUCT_SIGNAL:'||l.id||':MARKET_CONDUCT:cert_scheduled_stale',
    'OPEN','conduct_signals', gen_random_uuid(),'certification fixture',
    '{"detector_code":"MC_CONDUCT_SIGNAL","detector_version":1,"config_owner":"MARKET_CONDUCT_POLICY"}'::jsonb,
    now(), now() FROM public.licensees l LIMIT 1
  RETURNING id INTO _sig;

  PERFORM public.supervisory_detect_run('MC_CONDUCT_SIGNAL','scheduled');
  SELECT state, resolution_reason INTO _state, _reason
    FROM public.supervisory_signal WHERE id = _sig;
  PERFORM pg_temp.det('DET-36',
    _state = 'RESOLVED' AND _reason = 'CONDITION_NO_LONGER_OBSERVED',
    format('successful scheduled scan closed the absent condition (%s / %s)',
      _state, COALESCE(_reason,'no reason')));
END $$;

-- DET-37 scheduled runs create run and audit history --------------------------
DO $$
DECLARE _r record; _audit int;
BEGIN
  SELECT count(*) INTO _audit FROM public.audit_logs
   WHERE action = 'SUPERVISORY_DETECTION_RUN' AND metadata->>'trigger_kind' = 'scheduled';
  PERFORM public.supervisory_detect_run('AML_RISK_ELEVATED','scheduled');
  SELECT * INTO _r FROM public.supervisory_detector_run
   WHERE detector_code = 'AML_RISK_ELEVATED' AND trigger_kind = 'scheduled'
   ORDER BY started_at DESC LIMIT 1;
  PERFORM pg_temp.det('DET-37',
    _r.trigger_kind = 'scheduled' AND _r.status = 'COMPLETED'
    AND _r.started_at IS NOT NULL AND _r.completed_at IS NOT NULL
    AND _r.detector_version IS NOT NULL AND _r.config_snapshot ? 'params'
    AND (SELECT count(*) FROM public.audit_logs
          WHERE action='SUPERVISORY_DETECTION_RUN'
            AND metadata->>'trigger_kind' = 'scheduled') = _audit + 1,
    format('scheduled run logged with trigger %s, status %s and audit history',
      _r.trigger_kind, _r.status));
END $$;

-- DET-38 scheduled runs change no risk state and create no supervisory action -
DO $$
DECLARE _risk_b text; _risk_a text;
  _att int; _att2 int; _pl int; _pl2 int; _wi int; _wi2 int; _fi int; _fi2 int;
  _ex int; _ex2 int; _rem int; _rem2 int;
BEGIN
  SELECT md5(string_agg(id::text || COALESCE(residual_rating,'') || COALESCE(next_review_date::text,''), '|' ORDER BY id))
    INTO _risk_b FROM public.entity_risk_state;
  SELECT count(*) INTO _att FROM public.supervisory_attention;
  SELECT count(*) INTO _pl FROM public.supervisory_plan;
  SELECT count(*) INTO _wi FROM public.supervisory_work_item;
  SELECT count(*) INTO _fi FROM public.supervisory_finding;
  SELECT count(*) INTO _ex FROM public.examinations;
  SELECT count(*) INTO _rem FROM public.supervisory_remediation_action;

  PERFORM public.supervisory_detect_run_scheduled();

  SELECT md5(string_agg(id::text || COALESCE(residual_rating,'') || COALESCE(next_review_date::text,''), '|' ORDER BY id))
    INTO _risk_a FROM public.entity_risk_state;
  SELECT count(*) INTO _att2 FROM public.supervisory_attention;
  SELECT count(*) INTO _pl2 FROM public.supervisory_plan;
  SELECT count(*) INTO _wi2 FROM public.supervisory_work_item;
  SELECT count(*) INTO _fi2 FROM public.supervisory_finding;
  SELECT count(*) INTO _ex2 FROM public.examinations;
  SELECT count(*) INTO _rem2 FROM public.supervisory_remediation_action;

  PERFORM pg_temp.det('DET-38',
    _risk_b IS NOT DISTINCT FROM _risk_a AND _att = _att2 AND _pl = _pl2
    AND _wi = _wi2 AND _fi = _fi2 AND _ex = _ex2 AND _rem = _rem2,
    'scheduled run changed no risk state, attention, plan, work item, finding, examination or remediation');
END $$;

-- DET-39 not-yet-effective detectors stay out of the scheduled run -----------
DO $$
DECLARE _ran int;
BEGIN
  UPDATE public.supervisory_detector
     SET effective_from = CURRENT_DATE + 30 WHERE code = 'SUP_FINDING_MATERIAL';
  SELECT count(*) INTO _ran FROM jsonb_array_elements(
    (public.supervisory_detect_run_scheduled())->'detectors') d
   WHERE d->>'detector_code' = 'SUP_FINDING_MATERIAL';
  PERFORM pg_temp.det('DET-39', _ran = 0,
    'a detector that is not yet effective is skipped by the scheduled run');
END $$;

-- DET-40 the scheduled entry point holds no user-facing credential ------------
SELECT pg_temp.det('DET-40',
  NOT has_function_privilege('anon','public.supervisory_detect_run_scheduled()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.supervisory_detect_run_scheduled()','EXECUTE')
  AND has_function_privilege('service_role','public.supervisory_detect_run_scheduled()','EXECUTE')
  AND (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='supervisory_detect_run_scheduled')
       NOT LIKE '%eyJ%',
  'scheduled runner is database-invoked only and embeds no key or token');

-- DET-41 health reporting never presents an attempt as a success -------------
DO $$
DECLARE _h jsonb;
BEGIN
  PERFORM public.supervisory_detect_run('CERT_NO_IMPLEMENTATION','scheduled');
  _h := public.supervisory_detection_health();
  PERFORM pg_temp.det('DET-41',
    _h->'last_attempted_run'->>'status' = 'FAILED'
    AND (_h->'last_successful_run'->>'status' IS NULL
         OR _h->'last_successful_run'->>'status' = 'COMPLETED')
    AND _h->'last_successful_run'->>'run_id'
        IS DISTINCT FROM _h->'last_attempted_run'->>'run_id'
    AND jsonb_array_length(_h->'detectors_needing_attention') > 0,
    format('latest attempt %s reported separately from the last successful run',
      _h->'last_attempted_run'->>'status'));
END $$;

-- ---------------------------------------------------------------- report ----
SELECT gate, verdict, detail FROM det_result ORDER BY gate;
SELECT count(*) FILTER (WHERE verdict='PASS') AS pass,
       count(*) FILTER (WHERE verdict='FAIL') AS fail
  FROM det_result;

ROLLBACK;
