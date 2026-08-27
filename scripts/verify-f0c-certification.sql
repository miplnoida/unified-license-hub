-- ============================================================================
-- F0-C RETRY — final product certification evidence gate
--
-- Re-tests the three defects that stopped the first F0-C attempt, executes the
-- deferred server-side certification matrix (persona / authority / RLS / audit
-- boundaries) and certifies the secure-upload PRODUCT CONTROL without mocking
-- a malware provider.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f0c-certification.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = warning;

DROP TABLE IF EXISTS f0c_results;
DROP TABLE IF EXISTS f0c_ctx;

CREATE TEMP TABLE f0c_results (
  seq serial,
  stage text,
  id text,
  descr text,
  passed boolean,
  detail text
);

CREATE TEMP TABLE f0c_ctx (k text primary key, v text);

DO $ctx$
BEGIN
  INSERT INTO f0c_ctx VALUES
    ('applicant', (SELECT id::text FROM auth.users WHERE email = 'applicant_user@mishainfotech.com')),
    ('other_applicant', (SELECT id::text FROM auth.users WHERE email = 'daniel@yopmail.com')),
    ('super_admin', (SELECT id::text FROM auth.users WHERE email = 'super_admin@mishainfotech.com')),
    ('multi_role', (SELECT id::text FROM auth.users WHERE email = 'anisha.k@mishainfotech.com')),
    ('multi_role_internal', (SELECT id::text FROM auth.users WHERE email = 'rohit@mishainfotech.com'));
  IF (SELECT count(*) FROM f0c_ctx WHERE v IS NULL) > 0 THEN
    RAISE EXCEPTION 'F0-C harness: required persona fixture missing';
  END IF;
END
$ctx$;

CREATE OR REPLACE FUNCTION pg_temp.uid(_k text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT v::uuid FROM f0c_ctx WHERE k = _k $$;

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f0c_results (stage, id, descr, passed, detail) VALUES (_stage, _id, _d, _ok, _detail);
END $$;

-- Runs `_sql` as the `authenticated` API role impersonating `_uid`.
-- Returns SQLSTATE ('00000' when the statement succeeded).
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- Runs a jsonb-returning governed RPC as `_uid` and returns the JSON payload
-- (governed RPCs answer with an error envelope instead of raising).
CREATE OR REPLACE FUNCTION pg_temp.rpc_as_user(_uid uuid, _sql text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _out jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql INTO _out;
  EXCEPTION WHEN others THEN
    _out := jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- Counts rows visible to `_uid` under RLS for the given single-column query.
CREATE OR REPLACE FUNCTION pg_temp.count_as_user(_uid uuid, _sql text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE _sql INTO _n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _n;
EXCEPTION WHEN others THEN
  RESET ROLE;
  RETURN -1;
END $$;

-- ===========================================================================
-- STAGE 2 — re-test of the defects that stopped the previous F0-C
-- ===========================================================================

-- Scratch upload owned by the applicant persona (client-side insert path).
DO $seed$
DECLARE _st text;
BEGIN
  DELETE FROM public.file_uploads WHERE file_name = 'F0C_PROBE.bin';
  _st := pg_temp.as_user(pg_temp.uid('applicant'), format($q$
    INSERT INTO public.file_uploads
      (file_name, file_path, file_size, mime_type, file_extension, uploaded_by,
       entity_type, scan_status, scan_provider, scanned_at)
    VALUES ('F0C_PROBE.bin', 'f0c/probe.bin', 12, 'application/octet-stream', 'bin',
            %L, 'general', 'clean', 'ForgedAV/1.0', now())
  $q$, pg_temp.uid('applicant')));
  PERFORM pg_temp.rec('S4', 'U-01',
    'Client insert claiming scan_status=clean is forced to pending_scan',
    _st = '00000'
      AND (SELECT scan_status = 'pending_scan' AND scan_provider IS NULL AND scanned_at IS NULL
             FROM public.file_uploads WHERE file_name = 'F0C_PROBE.bin'),
    'insert=' || _st || ' stored=' || COALESCE((SELECT scan_status FROM public.file_uploads WHERE file_name='F0C_PROBE.bin'),'<none>'));
END
$seed$;

DO $d1$
DECLARE _fid uuid; _st text;
BEGIN
  SELECT id INTO _fid FROM public.file_uploads WHERE file_name = 'F0C_PROBE.bin';

  -- DEF-F0-C-01: applicant forges a malware-clean verdict through the RPC.
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    format('SELECT public.file_upload_record_scan(%L::uuid, %L, %L, %L)',
           _fid, 'clean', 'ForgedAV/1.0', 'f0c forged verdict'));
  PERFORM pg_temp.rec('S2', 'D-01',
    'DEF-F0-C-01 applicant forged malware-clean verdict is DENIED',
    _st LIKE '42501%', _st);

  -- The file must remain unreleased after the forgery attempt.
  PERFORM pg_temp.rec('S2', 'D-02',
    'File remains unreleased after forged verdict attempt',
    (SELECT scan_status = 'pending_scan' FROM public.file_uploads WHERE id = _fid)
      AND (public.file_upload_release_state(_fid) ->> 'released') = 'false',
    'release_state=' || public.file_upload_release_state(_fid)::text);

  -- Direct DML on the owner's own row must not move scan_status.
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    format('UPDATE public.file_uploads SET scan_status = %L WHERE id = %L::uuid', 'clean', _fid));
  PERFORM pg_temp.rec('S2', 'D-03',
    'Owner direct UPDATE of scan_status is DENIED by the guard trigger',
    _st LIKE '42501%'
      AND (SELECT scan_status = 'pending_scan' FROM public.file_uploads WHERE id = _fid),
    _st);
END
$d1$;

DO $d2$
DECLARE _st text; _ok boolean; _lic uuid;
BEGIN
  -- DEF-F0-C-02: applicant calls the prudential EWI evaluator.
  SELECT id INTO _lic FROM public.licensees ORDER BY created_at LIMIT 1;
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    format('SELECT public.prudential_ewi_evaluate(%L::uuid, current_date)', _lic));
  PERFORM pg_temp.rec('S2', 'D-04',
    'DEF-F0-C-02 applicant prudential EWI evaluation is DENIED',
    _st <> '00000', _st);

  -- Authorized (trusted service) caller must still be ALLOWED.
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.prudential_ewi_evaluate(_lic, current_date);
    _ok := true; _st := 'allowed';
  EXCEPTION WHEN others THEN
    _ok := false; _st := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM pg_temp.rec('S2', 'D-05',
    'Authorized prudential caller (trusted service) is ALLOWED', _ok, _st);
END
$d2$;

DO $d3$
DECLARE _n int;
BEGIN
  -- DEF-F0-C-03: trigger functions must be unavailable to the API roles.
  SELECT count(*) INTO _n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prorettype = 'trigger'::regtype
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  PERFORM pg_temp.rec('S2', 'D-06',
    'DEF-F0-C-03 no trigger function is executable by anon/authenticated',
    _n = 0, 'executable trigger functions=' || _n);

  -- Conduct authority helpers must fail closed for a non-conduct persona.
  PERFORM pg_temp.rec('S2', 'D-07',
    'Conduct authority helper fails closed for applicant persona',
    COALESCE(public.can_approve_conduct_closure(pg_temp.uid('applicant')), false) = false,
    'can_approve_conduct_closure=' || COALESCE(public.can_approve_conduct_closure(pg_temp.uid('applicant'))::text, 'null'));

  -- Vacuous-guard census (mirrors scripts/verify-definer-guards.sql).
  SELECT count(*) INTO _n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND pg_get_functiondef(p.oid) ~* '(^|[^_[:alnum:]])current_user([^_[:alnum:]]|$)'
    AND p.oid::regprocedure::text NOT LIKE 'workflow_resolve_actor(%';
  PERFORM pg_temp.rec('S2', 'D-08',
    'No SECURITY DEFINER routine authorizes on current_user',
    _n = 0, 'vacuous guards=' || _n);
END
$d3$;

DO $d4$
DECLARE _st text; _tbl text;
BEGIN
  SELECT c.relname INTO _tbl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'entity_identity_snapshot%'
  ORDER BY 1 LIMIT 1;
  IF _tbl IS NULL THEN
    PERFORM pg_temp.rec('S2', 'D-09', 'Entity identity snapshot append-only protection', NULL, 'N/A — table absent');
  ELSE
    _st := pg_temp.as_user(pg_temp.uid('applicant'),
      format('INSERT INTO public.%I DEFAULT VALUES', _tbl));
    PERFORM pg_temp.rec('S2', 'D-09',
      'Entity identity snapshot append-only: client INSERT is DENIED',
      _st <> '00000', _tbl || ' -> ' || _st);
  END IF;
END
$d4$;

-- ===========================================================================
-- STAGE 3 — deferred certification matrix (server-enforced boundaries)
-- ===========================================================================

DO $a$
DECLARE _st text; _n bigint; _lic uuid; _js jsonb;
BEGIN
  -- Anonymous boundary.
  _st := pg_temp.as_anon(
    'DO $x$ BEGIN IF (SELECT count(*) FROM public.licensees) > 0 THEN RAISE EXCEPTION ''leak''; END IF; END $x$');
  PERFORM pg_temp.rec('S3', 'A-01',
    'anon cannot read the licensee register',
    _st = '00000' OR _st LIKE '42501%',
    'anon register access -> ' || _st);


  -- Role escalation.
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    format('INSERT INTO public.user_roles (user_id, role) VALUES (%L::uuid, %L)',
           pg_temp.uid('applicant'), 'super_admin'));
  PERFORM pg_temp.rec('S3', 'A-02',
    'Applicant self-grant of super_admin is DENIED', _st <> '00000', _st);

  -- Governed role add/remove path is not client-callable by an external user.
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    format('SELECT public.sec_assign_user_roles(%L::uuid, ARRAY[]::uuid[])', pg_temp.uid('applicant')));
  PERFORM pg_temp.rec('S3', 'A-03',
    'Governed role assignment RPC refuses an unprivileged caller', _st <> '00000', _st);

  -- Audit immutability.
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    'INSERT INTO public.audit_logs (action, entity_type) VALUES (''F0C_TAMPER'', ''probe'')');
  PERFORM pg_temp.rec('S3', 'A-04', 'Client INSERT into audit_logs is DENIED', _st <> '00000', _st);

  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    'UPDATE public.audit_logs SET action = ''F0C_TAMPER'' WHERE id = (SELECT id FROM public.audit_logs LIMIT 1)');
  PERFORM pg_temp.rec('S3', 'A-05', 'Client UPDATE of audit_logs is DENIED', _st <> '00000', _st);

  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    'DELETE FROM public.audit_logs WHERE id = (SELECT id FROM public.audit_logs LIMIT 1)');
  PERFORM pg_temp.rec('S3', 'A-06', 'Client DELETE of audit_logs is DENIED', _st <> '00000', _st);

  -- Security-event evidence exists and is not client-writable.
  _st := pg_temp.as_user(pg_temp.uid('applicant'),
    'INSERT INTO public.security_event_logs (event_type) VALUES (''F0C_TAMPER'')');
  PERFORM pg_temp.rec('S3', 'A-07',
    'Client INSERT into security_event_logs is DENIED', _st <> '00000', _st);

  -- RLS isolation: external applicant must not see the full licensee register.
  SELECT count(*) INTO _n FROM public.licensees;
  PERFORM pg_temp.rec('S3', 'A-08',
    'Applicant is RLS-isolated from the full licensee register',
    pg_temp.count_as_user(pg_temp.uid('applicant'), 'SELECT count(*) FROM public.licensees') < _n,
    'visible=' || pg_temp.count_as_user(pg_temp.uid('applicant'), 'SELECT count(*) FROM public.licensees')
      || ' of ' || _n);

  PERFORM pg_temp.rec('S3', 'A-09',
    'Applicant is RLS-isolated from the full return filing set',
    pg_temp.count_as_user(pg_temp.uid('applicant'), 'SELECT count(*) FROM public.return_filings')
      < (SELECT count(*) FROM public.return_filings),
    'visible=' || pg_temp.count_as_user(pg_temp.uid('applicant'), 'SELECT count(*) FROM public.return_filings')
      || ' of ' || (SELECT count(*) FROM public.return_filings));

  -- Workflow step authority.
  PERFORM pg_temp.rec('S3', 'A-10',
    'Workflow step guard denies a persona not assigned to the step',
    (public.user_can_act_on_workflow_step(
      pg_temp.uid('applicant'),
      (SELECT id FROM public.approval_steps ORDER BY created_at LIMIT 1)) ->> 'can_act') = 'false',
    'guard=' || (public.user_can_act_on_workflow_step(
      pg_temp.uid('applicant'),
      (SELECT id FROM public.approval_steps ORDER BY created_at LIMIT 1)) ->> 'deny_reason'));

  -- Actor spoofing on the governed final-approval RPC.
  _js := pg_temp.rpc_as_user(pg_temp.uid('applicant'), format(
    'SELECT public.perform_final_workflow_approval(%L::uuid, %L::uuid, %L::uuid, %L, %L::uuid)',
    (SELECT id FROM public.applications ORDER BY created_at LIMIT 1),
    (SELECT id FROM public.workflow_instances ORDER BY created_at LIMIT 1),
    (SELECT id FROM public.approval_steps ORDER BY created_at LIMIT 1),
    'f0c spoof probe', pg_temp.uid('super_admin')));
  PERFORM pg_temp.rec('S3', 'A-11',
    'Actor spoofing on perform_final_workflow_approval is DENIED',
    COALESCE(_js ->> 'success', 'false') <> 'true' AND (_js ? 'error'),
    'envelope=' || left(_js::text, 160));

  -- Multi-role resolution (union of permissions).
  PERFORM pg_temp.rec('S3', 'A-12',
    'Multi-role user resolves a non-empty permission union',
    (SELECT count(*) FROM public.user_roles WHERE user_id = pg_temp.uid('multi_role')) >= 2
      AND (SELECT count(*) FROM public.user_roles WHERE user_id = pg_temp.uid('multi_role_internal')) >= 2
      AND (SELECT count(*) FROM public.sec_user_permissions(pg_temp.uid('multi_role_internal'))) > 0,
    'external roles=' || (SELECT count(*) FROM public.user_roles WHERE user_id = pg_temp.uid('multi_role'))
      || ' internal roles=' || (SELECT count(*) FROM public.user_roles WHERE user_id = pg_temp.uid('multi_role_internal'))
      || ' internal perms=' || (SELECT count(*) FROM public.sec_user_permissions(pg_temp.uid('multi_role_internal'))));

  -- Delegation expiry / revocation.
  PERFORM pg_temp.rec('S3', 'A-13',
    'Delegation rules carry an expiry sweep and no expired rule stays active',
    to_regprocedure('public.expire_delegation_rules()') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.delegation_rules
        WHERE is_active AND effective_until IS NOT NULL AND effective_until < now()),
    'sweep present; stale-active='
      || (SELECT count(*) FROM public.delegation_rules
          WHERE is_active AND effective_until IS NOT NULL AND effective_until < now()));

  -- Decision authority resolution is configured and governed.
  PERFORM pg_temp.rec('S3', 'A-14',
    'Decision authority resolver is present and fails closed with no matching rule',
    to_regprocedure('public.resolve_decision_authority(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,boolean)') IS NOT NULL
      AND COALESCE(
        (public.resolve_decision_authority(pg_temp.uid('applicant'), 'F0C_PROBE_DECISION',
          NULL, NULL, NULL, NULL, NULL, NULL, 'f0c', false) ->> 'authorised'),
        (public.resolve_decision_authority(pg_temp.uid('applicant'), 'F0C_PROBE_DECISION',
          NULL, NULL, NULL, NULL, NULL, NULL, 'f0c', false) ->> 'authorized'),
        'false') = 'false',
    'configured rules=' || (SELECT count(*) FROM public.decision_authority_rules)
      || ' unprivileged resolve='
      || left(public.resolve_decision_authority(pg_temp.uid('applicant'), 'F0C_PROBE_DECISION',
           NULL, NULL, NULL, NULL, NULL, NULL, 'f0c', false)::text, 120));

  -- RLS enabled everywhere in public.
  SELECT count(*) INTO _n
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  PERFORM pg_temp.rec('S3', 'A-15',
    'Every public table has row level security enabled', _n = 0, 'tables without RLS=' || _n);

  -- Anonymous RPC boundary.
  SELECT count(*) INTO _n FROM public.sec_anon_executable_functions
  WHERE NOT allowlisted AND NOT is_extension;
  PERFORM pg_temp.rec('S3', 'A-16',
    'Anonymous RPC boundary holds (only allowlisted routines)', _n = 0,
    'defects=' || _n || ' allowlisted='
      || (SELECT count(*) FROM public.sec_anon_executable_functions WHERE allowlisted));

  -- Machine / worker boundary: the scan writer is not reachable by anon.
  PERFORM pg_temp.rec('S3', 'A-17',
    'Scan-verdict writer is not anon-executable',
    NOT has_function_privilege('anon', 'public.file_upload_record_scan(uuid,text,text,text)', 'EXECUTE'),
    'anon EXECUTE=' || has_function_privilege('anon', 'public.file_upload_record_scan(uuid,text,text,text)', 'EXECUTE')::text);
END
$a$;

-- ===========================================================================
-- STAGE 4 — secure-upload PRODUCT CONTROL certification (no scanner mocked)
-- ===========================================================================

DO $u$
DECLARE _fid uuid; _st text; _ok boolean := true; _v text; _detail text := '';
  _events_before int; _audit_before int;
BEGIN
  SELECT id INTO _fid FROM public.file_uploads WHERE file_name = 'F0C_PROBE.bin';

  -- U-02: clean verdict without a named provider must be refused even for the
  -- trusted worker identity.
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.file_upload_record_scan(_fid, 'clean', NULL, 'no provider');
    _st := '00000';
  EXCEPTION WHEN others THEN _st := SQLSTATE || ': ' || left(SQLERRM, 120);
  END;
  PERFORM pg_temp.rec('S4', 'U-02',
    'CLEAN release without a named inspecting provider is REFUSED',
    _st LIKE '22023%', _st);

  -- U-03: non-releasable states must all fail closed.
  SELECT count(*) INTO _events_before FROM public.file_upload_scan_events WHERE file_upload_id = _fid;
  SELECT count(*) INTO _audit_before FROM public.audit_logs
   WHERE action = 'file_scan_verdict' AND entity_id = _fid::text;

  FOREACH _v IN ARRAY ARRAY['scanning','scan_error','suspicious','infected','quarantined'] LOOP
    PERFORM public.file_upload_record_scan(_fid, _v, 'F0C-Harness', 'lifecycle probe');
    IF (public.file_upload_release_state(_fid) ->> 'released') <> 'false' THEN
      _ok := false;
    END IF;
    _detail := _detail || _v || '=' || (public.file_upload_release_state(_fid) ->> 'released') || ' ';
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM pg_temp.rec('S4', 'U-03',
    'pending/scanning/error/suspicious/infected/quarantined files are never released',
    _ok, _detail);

  -- U-04: adverse verdicts auto-quarantine.
  PERFORM pg_temp.rec('S4', 'U-04',
    'Adverse verdict auto-quarantines the file',
    (SELECT is_quarantined FROM public.file_uploads WHERE id = _fid),
    'is_quarantined=' || (SELECT is_quarantined FROM public.file_uploads WHERE id = _fid)::text);

  -- U-05: scan-event history + audit trail written for every verdict.
  PERFORM pg_temp.rec('S4', 'U-05',
    'Every verdict appends a scan event and an audit record',
    (SELECT count(*) FROM public.file_upload_scan_events WHERE file_upload_id = _fid) = _events_before + 5
    AND (SELECT count(*) FROM public.audit_logs
          WHERE action = 'file_scan_verdict' AND entity_id = _fid::text) = _audit_before + 5,
    'events=+' || ((SELECT count(*) FROM public.file_upload_scan_events WHERE file_upload_id = _fid) - _events_before)
      || ' audit=+' || ((SELECT count(*) FROM public.audit_logs
          WHERE action = 'file_scan_verdict' AND entity_id = _fid::text) - _audit_before));

  -- U-06: only a provider-attributed clean verdict releases the file.
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.file_upload_record_scan(_fid, 'clean', 'F0C-Harness', 'provider attributed');
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM pg_temp.rec('S4', 'U-06',
      'Provider-attributed CLEAN verdict releases the file',
      (public.file_upload_release_state(_fid) ->> 'released') = 'true'
        AND (SELECT scan_provider IS NOT NULL FROM public.file_uploads WHERE id = _fid),
      public.file_upload_release_state(_fid)::text);
  END;

  -- U-07: unsupported verdict values are rejected (lifecycle is closed).
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.file_upload_record_scan(_fid, 'totally_clean_trust_me', 'F0C-Harness', 'x');
    _st := '00000';
  EXCEPTION WHEN others THEN _st := SQLSTATE || ': ' || left(SQLERRM, 120);
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM pg_temp.rec('S4', 'U-07',
    'Verdict vocabulary is closed (unsupported verdict rejected)', _st LIKE '22023%', _st);

  -- U-08: lifecycle CHECK constraint present on the column.
  PERFORM pg_temp.rec('S4', 'U-08',
    'scan_status lifecycle is enforced by a CHECK constraint',
    EXISTS (SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.file_uploads'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%scan_status%'),
    COALESCE((SELECT left(pg_get_constraintdef(oid), 200) FROM pg_constraint
              WHERE conrelid = 'public.file_uploads'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) ILIKE '%scan_status%' LIMIT 1), 'absent'));

  -- Return the probe row to a fail-closed state and remove it.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM public.file_upload_scan_events WHERE file_upload_id = _fid;
  DELETE FROM public.file_uploads WHERE id = _fid;
  PERFORM set_config('request.jwt.claims', '{}', true);
END
$u$;

-- ===========================================================================
-- Report
-- ===========================================================================

\pset border 2
SELECT stage, id, descr,
       CASE WHEN passed IS NULL THEN 'N/A' WHEN passed THEN 'TESTED_PASS' ELSE 'TESTED_FAIL' END AS result,
       detail
FROM f0c_results ORDER BY seq;

DO $sum$
DECLARE _p int; _f int; _n int;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE passed IS FALSE), count(*) FILTER (WHERE passed IS NULL)
    INTO _p, _f, _n FROM f0c_results;
  RAISE WARNING 'F0-C EVIDENCE SUMMARY: % TESTED_PASS / % TESTED_FAIL / % N-A', _p, _f, _n;
  IF _f > 0 THEN
    RAISE EXCEPTION 'F0-C certification gate FAILED: % assertion(s) failed', _f;
  END IF;
END
$sum$;
