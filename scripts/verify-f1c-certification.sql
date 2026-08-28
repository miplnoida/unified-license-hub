-- ============================================================================
-- F1-C — MASTER CONFIGURATION CERTIFICATION EVIDENCE GATE
--
-- Certifies the F1 master-configuration product surface: governed configuration
-- writes, RBAC denial, audit evidence, decision authority (including a
-- temporary ENFORCED certification rule that is rolled back), service
-- configuration completeness and configuration integrity.
--
-- Read-mostly: every write is either a governed writer call on a scratch
-- record or the temporary certification authority rule; both are removed
-- before the gate exits.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f1c-certification.sql
-- ============================================================================

\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
-- Every gate restores the default explicitly so RLS probes are deterministic.
SET row_security = on;
SET client_min_messages = warning;

-- The sandbox reaches Postgres through a transaction-mode pooler, so the whole
-- gate runs inside one transaction to stay pinned to a single session (the
-- harness state below is session-scoped).
BEGIN;

DROP TABLE IF EXISTS f1c_results;
DROP TABLE IF EXISTS f1c_ctx;

CREATE TEMP TABLE f1c_results (
  seq serial, stage text, id text, descr text, passed boolean, detail text
);
CREATE TEMP TABLE f1c_ctx (k text primary key, v text);

DO $ctx$
BEGIN
  INSERT INTO f1c_ctx VALUES
    ('super_admin', (SELECT id::text FROM auth.users WHERE email = 'super_admin@mishainfotech.com')),
    ('applicant',   (SELECT id::text FROM auth.users WHERE email = 'applicant_user@mishainfotech.com'));
  IF (SELECT count(*) FROM f1c_ctx WHERE v IS NULL) > 0 THEN
    RAISE EXCEPTION 'F1-C harness: required persona fixture missing';
  END IF;
END
$ctx$;

CREATE OR REPLACE FUNCTION pg_temp.uid(_k text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT v::uuid FROM f1c_ctx WHERE k = _k $$;

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f1c_results (stage, id, descr, passed, detail) VALUES (_stage, _id, _d, _ok, _detail);
END $$;

-- Executes `_sql` as the `authenticated` API role impersonating `_uid`.
-- Returns SQLSTATE + message ('00000' when the statement succeeded).
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
    _state := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- Executes a scalar/jsonb-returning statement as `_uid`; failures come back as
-- a text error envelope so the gate can assert on the denial reason.
CREATE OR REPLACE FUNCTION pg_temp.val_as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _out text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql INTO _out;
  EXCEPTION WHEN others THEN
    _out := 'ERR ' || SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN coalesce(_out, 'NULL');
END $$;

CREATE OR REPLACE FUNCTION pg_temp.val_as_anon(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _out text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE _sql INTO _out;
  EXCEPTION WHEN others THEN
    _out := 'ERR';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN coalesce(_out, 'NULL');
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- ===========================================================================
-- S1 — GOVERNED CONFIGURATION WRITES (GAP-F1-03 / GAP-F1-05 / GAP-F1-08)
-- ===========================================================================
DO $s1$
DECLARE
  _sa uuid := pg_temp.uid('super_admin');
  _ap uuid := pg_temp.uid('applicant');
  _res text; _id uuid; _n int; _txt text;
BEGIN
  -- C-01 authorized create through the governed writer
  _txt := pg_temp.val_as_user(_sa,
    $q$ SELECT (public.config_save('complaint_types',
          jsonb_build_object('name','F1C CERT SCRATCH TYPE','description','F1-C certification scratch','sla_days',30),
          NULL, 'F1-C certification evidence')->>'id') $q$);
  PERFORM pg_temp.rec('S1','C-01','authorized operator creates configuration through config_save',
    _txt ~* '^[0-9a-f-]{36}$', _txt);
  IF _txt ~* '^[0-9a-f-]{36}$' THEN _id := _txt::uuid; END IF;

  -- C-02 the create actually landed in the database
  SELECT count(*) INTO _n FROM public.complaint_types WHERE id = _id;
  PERFORM pg_temp.rec('S1','C-02','governed create produced the database row', _n = 1, 'rows=' || _n);

  -- C-03 audit evidence: before/after captured
  SELECT count(*) INTO _n FROM public.config_change_log
   WHERE table_name = 'complaint_types' AND record_id = _id
     AND action = 'CREATE' AND new_data ? 'name' AND changed_by = _sa;
  PERFORM pg_temp.rec('S1','C-03','create wrote an attributed audit entry with new_data', _n >= 1, 'audit rows=' || _n);

  -- C-04 authorized update, audited with old + new
  PERFORM pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.config_save('complaint_types', jsonb_build_object('sla_days', 21), %L, 'F1-C update evidence')::text $q$, _id));
  SELECT count(*) INTO _n FROM public.config_change_log
   WHERE table_name = 'complaint_types' AND record_id = _id AND action = 'UPDATE'
     AND (old_data->>'sla_days') = '30' AND (new_data->>'sla_days') = '21';
  PERFORM pg_temp.rec('S1','C-04','update audit captures before and after values', _n >= 1, 'audit rows=' || _n);

  -- C-05 unauthorized operator is denied by the governed writer
  _txt := pg_temp.val_as_user(_ap,
    $q$ SELECT public.config_save('complaint_types', jsonb_build_object('name','F1C UNAUTHORIZED'), NULL, 'negative test')::text $q$);
  PERFORM pg_temp.rec('S1','C-05','unauthorized operator cannot call the governed writer',
    _txt LIKE 'ERR%' AND (_txt ILIKE '%not_authorised%' OR _txt LIKE '%42501%'), _txt);

  -- C-06 direct DML on a governed registry table is revoked for signed-in users
  _res := pg_temp.as_user(_sa, $q$ INSERT INTO public.sectors(name) VALUES ('F1C DIRECT DML') $q$);
  PERFORM pg_temp.rec('S1','C-06','direct INSERT on a governed registry table is revoked', _res LIKE '42501%', _res);

  _res := pg_temp.as_user(_sa, $q$ UPDATE public.regulators SET name = name $q$);
  PERFORM pg_temp.rec('S1','C-07','direct UPDATE on regulators is revoked', _res LIKE '42501%', _res);

  _res := pg_temp.as_user(_sa, $q$ UPDATE public.license_fee_bindings SET updated_at = now() $q$);
  PERFORM pg_temp.rec('S1','C-08','GAP-F1-05 direct UPDATE on fee bindings is revoked', _res LIKE '42501%', _res);

  _res := pg_temp.as_user(_sa, $q$ UPDATE public.license_verification_templates SET updated_at = now() $q$);
  PERFORM pg_temp.rec('S1','C-09','GAP-F1-05 direct UPDATE on verification templates is revoked', _res LIKE '42501%', _res);

  -- C-10 retire, not hard delete, for referenced configuration
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.config_delete('regulators', %L, 'negative test')::text $q$,
    (SELECT id FROM public.regulators LIMIT 1)));
  PERFORM pg_temp.rec('S1','C-10','hard delete refused for referenced configuration',
    _txt LIKE 'ERR%' AND _txt ILIKE '%config_hard_delete_forbidden%', _txt);

  -- C-11 governed retire flips the soft-delete column and audits
  PERFORM pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.config_retire('complaint_types', %L, 'F1-C retire evidence')::text $q$, _id));
  SELECT count(*) INTO _n FROM public.complaint_types WHERE id = _id AND is_active = false;
  PERFORM pg_temp.rec('S1','C-11','governed retire deactivates rather than deletes', _n = 1, 'inactive rows=' || _n);
  SELECT count(*) INTO _n FROM public.config_change_log
   WHERE table_name = 'complaint_types' AND record_id = _id AND action = 'RETIRE';
  PERFORM pg_temp.rec('S1','C-12','retire is audited', _n >= 1, 'audit rows=' || _n);

  -- C-13 reactivate round-trip
  PERFORM pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.config_retire('complaint_types', %L, 'F1-C reactivate evidence', true)::text $q$, _id));
  SELECT count(*) INTO _n FROM public.complaint_types WHERE id = _id AND is_active;
  PERFORM pg_temp.rec('S1','C-13','governed reactivate restores the record', _n = 1, 'active rows=' || _n);

  -- C-14 duplicate/conflicting configuration is rejected (taxonomy uniqueness)
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.config_save('sectors', jsonb_build_object('name', %L), NULL, 'duplicate test')::text $q$,
    (SELECT name FROM public.sectors WHERE coalesce(status,'active') = 'active' LIMIT 1)));
  PERFORM pg_temp.rec('S1','C-15','duplicate configuration is rejected by the writer',
    _txt LIKE 'ERR%', _txt);

  -- C-16 audit trail is append-only for signed-in users. The privilege itself is
  -- revoked (not merely filtered by RLS), and the append-only trigger is the
  -- second line of defence (proved by C-19).
  SELECT count(*) INTO _n FROM public.config_change_log WHERE table_name = 'complaint_types';
  _res := pg_temp.as_user(_sa, $q$ UPDATE public.config_change_log SET reason = 'tampered' $q$);
  PERFORM pg_temp.rec('S1','C-16','configuration audit log cannot be rewritten by a signed-in user',
    _res LIKE '42501%' AND NOT EXISTS (SELECT 1 FROM public.config_change_log WHERE reason = 'tampered'),
    'statement=' || _res);
  _res := pg_temp.as_user(_sa, $q$ DELETE FROM public.config_change_log $q$);
  PERFORM pg_temp.rec('S1','C-17','configuration audit log cannot be erased by a signed-in user',
    _res LIKE '42501%'
    AND (SELECT count(*) FROM public.config_change_log WHERE table_name = 'complaint_types') = _n,
    'statement=' || _res || ' surviving entries=' || _n);

  -- C-20 DEF-F1-C-01: expectations are governed-writer only, denied by privilege
  _res := pg_temp.as_user(_sa,
    $q$ UPDATE public.service_config_expectations SET updated_at = now() $q$);
  PERFORM pg_temp.rec('S1','C-20','direct UPDATE on service expectations is revoked by privilege',
    _res LIKE '42501%', _res);
  _res := pg_temp.as_user(_sa, $q$ DELETE FROM public.service_config_expectations $q$);
  PERFORM pg_temp.rec('S1','C-21','direct DELETE on service expectations is revoked by privilege',
    _res LIKE '42501%', _res);
  _res := pg_temp.as_user(_sa,
    $q$ INSERT INTO public.config_change_log(table_name, record_id, action)
        VALUES ('sectors', gen_random_uuid(), 'CREATE') $q$);
  PERFORM pg_temp.rec('S1','C-22','signed-in users cannot forge audit entries directly',
    _res LIKE '42501%', _res);
  BEGIN
    UPDATE public.config_change_log SET reason = 'tampered' WHERE record_id = _id;
    _res := 'NOT BLOCKED';
  EXCEPTION WHEN others THEN
    _res := left(SQLERRM, 120);
  END;
  PERFORM pg_temp.rec('S1','C-19','the append-only trigger blocks audit mutation outright',
    _res ILIKE '%append-only%', _res);

  -- C-18 scratch cleanup
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.config_delete('complaint_types', %L, 'F1-C cleanup')::text $q$, _id));
  DELETE FROM public.complaint_types WHERE id = _id;
  SELECT count(*) INTO _n FROM public.complaint_types WHERE id = _id;
  PERFORM pg_temp.rec('S1','C-18','certification scratch configuration removed', _n = 0,
    'remaining=' || _n || ' governed_delete=' || _txt);
END
$s1$;

-- ===========================================================================
-- S2 — ANONYMOUS READ SURFACE (GAP-F1-02)
-- ===========================================================================
DO $s2$
DECLARE _res text; _n int; _t text; _rows text;
BEGIN
  FOR _t IN SELECT unnest(ARRAY['form_templates','notification_templates','escalation_rules',
                                'engine_rules','license_fee_bindings','license_verification_templates',
                                'process_templates','license_lifecycle_configs','decision_authority_rules',
                                'service_config_expectations','config_change_log'])
  LOOP
    _res := pg_temp.as_anon(format('SELECT count(*) FROM public.%I', _t));
    _rows := pg_temp.val_as_anon(format('SELECT count(*)::text FROM public.%I', _t));
    PERFORM pg_temp.rec('S2','A-' || _t, 'anon sees no rows in ' || _t,
      _res LIKE '42501%' OR _rows IN ('0','ERR'), 'statement=' || _res || ' rows=' || _rows);
    PERFORM pg_temp.rec('S2','G-' || _t, 'anon holds no privilege on ' || _t,
      NOT has_table_privilege('anon', 'public.' || quote_ident(_t), 'SELECT'),
      'anon SELECT privilege=' ||
        has_table_privilege('anon', 'public.' || quote_ident(_t), 'SELECT')::text);
  END LOOP;

  -- The public allowlist still works for genuinely public configuration.
  SELECT count(*) INTO _n FROM public.config_public_read_allowlist;
  PERFORM pg_temp.rec('S2','A-allowlist','public configuration reads are allowlist-scoped', _n > 0, 'allowlisted tables=' || _n);

  _res := pg_temp.as_anon($q$ SELECT public.config_save('sectors', '{"name":"anon"}'::jsonb) $q$);
  PERFORM pg_temp.rec('S2','A-writer','anon cannot execute the governed writer', _res LIKE '42501%', _res);
END
$s2$;

-- ===========================================================================
-- S3 — DECISION AUTHORITY END TO END (GAP-F1-01)
-- ===========================================================================
DO $s3$
DECLARE
  _sa uuid := pg_temp.uid('super_admin');
  _ap uuid := pg_temp.uid('applicant');
  _dt text := 'f1c_certification_decision';
  _rule uuid; _txt text; _out jsonb; _n int;
BEGIN
  -- D-01 create (OBSERVE_ONLY) through the governed writer
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_upsert(%L, NULL,NULL,NULL,NULL,NULL,
        'complaint_management','close', true, false, NULL, NULL, true, true,
        'OBSERVE_ONLY', 'F1-C temporary certification rule', NULL, now() - interval '1 hour', NULL,
        'F1-C certification')::text $q$, _dt));
  PERFORM pg_temp.rec('S3','D-01','operator creates a decision authority rule',
    _txt ~* '^[0-9a-f-]{36}$', _txt);
  IF _txt ~* '^[0-9a-f-]{36}$' THEN _rule := _txt::uuid; END IF;

  -- D-02 audited
  SELECT count(*) INTO _n FROM public.config_change_log
   WHERE table_name = 'decision_authority_rules' AND record_id = _rule AND action = 'CREATE';
  PERFORM pg_temp.rec('S3','D-02','authority create is audited', _n >= 1, 'audit rows=' || _n);

  -- D-03 unauthorized operator cannot configure authority
  _txt := pg_temp.val_as_user(_ap, format(
    $q$ SELECT public.decision_authority_rule_upsert(%L, NULL,NULL,NULL,NULL,NULL,NULL,NULL,
        true,false,NULL,NULL,true,true,'OFF','negative test',NULL,NULL,NULL,'negative')::text $q$, _dt));
  PERFORM pg_temp.rec('S3','D-03','unauthorized operator cannot configure decision authority',
    _txt LIKE 'ERR%' AND (_txt ILIKE '%not_authorised%' OR _txt LIKE '%42501%'), _txt);

  -- D-04 overlapping scope/period conflict is rejected
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_upsert(%L, NULL,NULL,NULL,NULL,NULL,
        'complaint_management','close', true,false,NULL,NULL,true,true,'OBSERVE_ONLY',
        'conflict probe', NULL, now(), NULL, 'conflict probe')::text $q$, _dt));
  PERFORM pg_temp.rec('S3','D-04','overlapping authority scope/period is rejected',
    _txt LIKE 'ERR%' AND _txt ILIKE '%decision_authority_conflict%', _txt);

  -- D-05 invalid effective window is rejected
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_upsert(%L, NULL,NULL,NULL,NULL,NULL,
        'complaint_management','close', true,false,NULL,NULL,true,true,'OBSERVE_ONLY',
        'window probe', NULL, now() + interval '10 days', now() + interval '1 day', 'window probe')::text $q$,
    _dt || '_window'));
  PERFORM pg_temp.rec('S3','D-05','invalid effective window is rejected',
    _txt LIKE 'ERR%' AND _txt ILIKE '%invalid_effective_window%', _txt);

  -- D-06 an ENFORCED rule must carry a real requirement
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_upsert(%L, NULL,NULL,NULL,NULL,NULL,
        NULL,NULL,false,false,NULL,NULL,false,true,'ENFORCED','empty enforced probe',NULL,NULL,NULL,'probe')::text $q$,
    _dt || '_empty'));
  PERFORM pg_temp.rec('S3','D-06','an ENFORCED rule without a requirement is rejected',
    _txt LIKE 'ERR%' AND _txt ILIKE '%enforced_rule_needs_requirement%', _txt);

  -- D-07 OBSERVE_ONLY records an observation but never denies
  SELECT public.resolve_decision_authority(_ap, _dt, NULL, NULL, NULL, NULL, NULL, NULL,
    'F1C-OBSERVE', true) INTO _out;
  PERFORM pg_temp.rec('S3','D-07','OBSERVE_ONLY permits the decision',
    (_out->>'allowed')::boolean AND _out->>'mode' = 'OBSERVE_ONLY', _out::text);
  PERFORM pg_temp.rec('S3','D-08','OBSERVE_ONLY still reports the authority verdict',
    (_out->>'would_allow')::boolean IS FALSE, _out->>'reasons');
  SELECT count(*) INTO _n FROM public.decision_authority_observations
   WHERE rule_id = _rule AND subject_reference = 'F1C-OBSERVE';
  PERFORM pg_temp.rec('S3','D-09','OBSERVE_ONLY writes an observation', _n = 1, 'observations=' || _n);

  -- D-10/11 ENFORCED actually permits and denies according to configuration
  PERFORM pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_upsert(%L, NULL,NULL,NULL,NULL,NULL,
        'complaint_management','close', true,false,NULL,NULL,true,true,'ENFORCED',
        'F1-C temporary certification rule (enforced probe)', %L, now() - interval '1 hour', NULL,
        'F1-C enforcement probe')::text $q$, _dt, _rule));
  SELECT public.resolve_decision_authority(_ap, _dt, NULL,NULL,NULL,NULL,NULL,NULL,'F1C-ENF-DENY', true) INTO _out;
  PERFORM pg_temp.rec('S3','D-10','ENFORCED denies an actor without the configured authority',
    (_out->>'allowed')::boolean IS FALSE AND _out->>'mode' = 'ENFORCED', _out::text);
  SELECT public.resolve_decision_authority(_sa, _dt, NULL,NULL,NULL,NULL,NULL,NULL,'F1C-ENF-ALLOW', true) INTO _out;
  PERFORM pg_temp.rec('S3','D-11','ENFORCED permits an actor holding the configured authority',
    (_out->>'allowed')::boolean AND _out->>'mode' = 'ENFORCED', _out::text);

  -- D-12 retire removes the rule from resolution (effective dating honoured)
  _txt := pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_set_status(%L, 'retired', 'F1-C retire probe')::text $q$, _rule));
  SELECT count(*) INTO _n FROM public.decision_authority_rules WHERE id = _rule AND status = 'retired';
  PERFORM pg_temp.rec('S3','D-12a','governed retire sets the rule to retired', _n = 1,
    'retired=' || _n || ' rpc=' || _txt);
  SELECT public.resolve_decision_authority(_ap, _dt, NULL,NULL,NULL,NULL,NULL,NULL,'F1C-RETIRED', true) INTO _out;
  PERFORM pg_temp.rec('S3','D-12','a retired rule no longer governs the decision',
    _out->>'mode' = 'OFF' AND (_out->>'allowed')::boolean, _out::text);

  -- D-13 reactivate
  PERFORM pg_temp.val_as_user(_sa, format(
    $q$ SELECT public.decision_authority_rule_set_status(%L, 'active', 'F1-C reactivate probe')::text $q$, _rule));
  SELECT count(*) INTO _n FROM public.decision_authority_rules WHERE id = _rule AND status = 'active';
  PERFORM pg_temp.rec('S3','D-13','a retired rule can be reactivated', _n = 1, 'active=' || _n);

  -- D-14 the product decision path evaluates authority on every approval action
  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public' AND c.relname = 'approval_actions'
     AND t.tgname = 'trg_approval_action_decision_authority' AND NOT t.tgisinternal;
  PERFORM pg_temp.rec('S3','D-14','approval actions evaluate decision authority', _n = 1, 'triggers=' || _n);

  -- D-15 rollback of the certification rule and its observations
  DELETE FROM public.decision_authority_observations WHERE rule_id = _rule;
  DELETE FROM public.decision_authority_observations WHERE decision_type LIKE 'f1c_certification%';
  DELETE FROM public.decision_authority_rules WHERE decision_type LIKE 'f1c_certification%';
  -- The audit entries for the certification rule are deliberately NOT removed:
  -- `config_change_log` is append-only by design (proved by C-16/C-17).
  SELECT count(*) INTO _n FROM public.decision_authority_rules WHERE decision_type LIKE 'f1c_certification%';
  PERFORM pg_temp.rec('S3','D-15','temporary certification authority rule rolled back', _n = 0, 'remaining=' || _n);

  -- D-18 canonical status vocabulary is 'active' / 'retired' end to end
  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid = 'public.decision_authority_rules'::regclass
     AND conname = 'decision_authority_rules_status_chk'
     AND pg_get_constraintdef(oid) ILIKE '%''active''%'
     AND pg_get_constraintdef(oid) ILIKE '%''retired''%';
  PERFORM pg_temp.rec('S3','D-18','the status constraint uses the canonical active/retired vocabulary',
    _n = 1, 'matching constraints=' || _n);
  SELECT count(*) INTO _n FROM public.decision_authority_rules
   WHERE status NOT IN ('active','retired');
  PERFORM pg_temp.rec('S3','D-19','no rule holds a legacy status value', _n = 0, 'legacy rows=' || _n);

  -- D-16 no invented production regulator policy: nothing is ENFORCED
  SELECT count(*) INTO _n FROM public.decision_authority_rules
   WHERE status = 'active' AND enforcement_mode = 'ENFORCED';
  PERFORM pg_temp.rec('S3','D-16','no ENFORCED production authority policy was invented', _n = 0, 'enforced rules=' || _n);

  SELECT count(*) INTO _n FROM public.decision_authority_rules
   WHERE status = 'active' AND enforcement_mode = 'OBSERVE_ONLY';
  PERFORM pg_temp.rec('S3','D-17','baseline authority rules remain observation-only', _n >= 10, 'observe_only rules=' || _n);
END
$s3$;

-- ===========================================================================
-- S4 — SERVICE CONFIGURATION COMPLETENESS (GAP-F1-04)
-- ===========================================================================
DO $s4$
DECLARE _n int; _svc int; _dim int; _bcr int; _txt text;
BEGIN
  SELECT count(DISTINCT service_id), count(*) INTO _svc, _dim
    FROM public.service_configuration_completeness;
  PERFORM pg_temp.rec('S4','SC-01','every active service is evaluated on all five dimensions',
    _svc = 136 AND _dim = 680, format('services=%s dimensions=%s', _svc, _dim));

  -- Every remaining incomplete dimension must be an explicitly justified
  -- BUSINESS_CONFIGURATION_REQUIRED item (the operator screen renders that
  -- label from the expectation justification) — nothing unexplained.
  SELECT count(*) INTO _n FROM public.service_configuration_completeness c
   WHERE NOT c.is_complete
     AND coalesce(c.justification, '') NOT ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%';
  PERFORM pg_temp.rec('S4','SC-02','zero unexplained configuration gaps', _n = 0, 'unexplained=' || _n);

  SELECT count(*) INTO _bcr FROM public.service_configuration_completeness c
   WHERE NOT c.is_complete AND c.justification ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%';
  PERFORM pg_temp.rec('S4','SC-03','exactly 9 BUSINESS_CONFIGURATION_REQUIRED items remain visible',
    _bcr = 9, 'items=' || _bcr);

  SELECT count(*) INTO _n FROM public.service_configuration_completeness c
   WHERE NOT c.is_complete AND c.justification ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%'
     AND c.dimension = 'sla';
  PERFORM pg_temp.rec('S4','SC-04','8 of them are renewal service standards', _n = 8, 'sla items=' || _n);
  SELECT count(*) INTO _n FROM public.service_configuration_completeness c
   WHERE NOT c.is_complete AND c.justification ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%'
     AND c.dimension = 'fee';
  PERFORM pg_temp.rec('S4','SC-05','1 of them is a renewal fee', _n = 1, 'fee items=' || _n);

  SELECT count(*) INTO _n FROM public.service_config_expectations
   WHERE justification ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%' AND btrim(justification) = '';
  PERFORM pg_temp.rec('S4','SC-06','each BUSINESS_CONFIGURATION_REQUIRED item carries an explicit justification',
    _n = 0, 'unjustified=' || _n);

  -- They are never silently represented as configured…
  SELECT count(*) INTO _n FROM public.service_configuration_completeness c
   WHERE c.justification ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%'
     AND (c.is_complete OR c.direct_ok OR c.fallback_ok);
  PERFORM pg_temp.rec('S4','SC-07','BUSINESS_CONFIGURATION_REQUIRED items are not reported as configured',
    _n = 0, 'mislabelled=' || _n);

  -- …and no fee/SLA value was invented for them.
  SELECT count(*) INTO _n
    FROM public.service_configuration_completeness c
    JOIN public.services s ON s.id = c.service_id
   WHERE c.justification ILIKE '%BUSINESS_CONFIGURATION_REQUIRED%'
     AND ((c.dimension = 'sla' AND s.sla_days IS NOT NULL)
       OR (c.dimension = 'fee' AND EXISTS (SELECT 1 FROM public.fee_configurations f
                                            WHERE f.service_id = c.service_id
                                              AND coalesce(f.is_active, true))));
  PERFORM pg_temp.rec('S4','SC-08','no fee or service standard was invented for the pending renewals',
    _n = 0, 'invented values=' || _n);

  -- Disposition vocabulary behaves
  SELECT count(*) INTO _n FROM public.service_configuration_completeness WHERE disposition = 'NOT_APPLICABLE' AND NOT is_complete AND state <> 'NOT_APPLICABLE';
  PERFORM pg_temp.rec('S4','SC-09','NOT_APPLICABLE dispositions resolve to a complete state', _n = 0, 'mismatched=' || _n);
  SELECT count(*) INTO _n FROM public.service_configuration_completeness WHERE state = 'SATISFIED_BY_FALLBACK' AND NOT fallback_ok;
  PERFORM pg_temp.rec('S4','SC-10','SHARED_FALLBACK dispositions require a real fallback', _n = 0, 'mismatched=' || _n);

  -- The permanent gate agrees
  BEGIN
    PERFORM public.service_configuration_gate();
    _txt := 'gate passed';
  EXCEPTION WHEN others THEN
    _txt := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  PERFORM pg_temp.rec('S4','SC-11','the permanent completeness gate passes', _txt = 'gate passed', _txt);

  -- Report RPC is operator-callable and internal-only
  SELECT count(*) INTO _n FROM pg_proc WHERE proname = 'service_configuration_completeness_report';
  PERFORM pg_temp.rec('S4','SC-12','the completeness report RPC exists for the operator screen', _n = 1, 'routines=' || _n);
END
$s4$;

-- ===========================================================================
-- S5 — CONFIGURATION INTEGRITY / NO HARD-CODED POLICY
-- ===========================================================================
DO $s5$
DECLARE _n int; _res text;
BEGIN
  -- Governed registry coverage across every material configuration domain
  SELECT count(*) INTO _n FROM public.config_governed_tables;
  PERFORM pg_temp.rec('S5','I-01','all material configuration registries are governed', _n >= 27, 'governed tables=' || _n);

  SELECT count(*) INTO _n FROM public.config_governed_tables g
   WHERE has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), 'INSERT')
      OR has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), 'UPDATE')
      OR has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), 'DELETE');
  PERFORM pg_temp.rec('S5','I-02','no governed registry table accepts direct DML from signed-in users',
    _n = 0, 'leaking tables=' || _n ||
    coalesce((SELECT ': ' || string_agg(g.table_name, ', ')
                FROM public.config_governed_tables g
               WHERE has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), 'UPDATE')), ''));

  -- Effective dating exists where regulator policy needs it
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'decision_authority_rules'
     AND column_name IN ('effective_from','effective_to');
  PERFORM pg_temp.rec('S5','I-03','decision authority is effective-dated', _n = 2, 'columns=' || _n);
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'service_config_expectations'
     AND column_name IN ('effective_from','effective_to');
  PERFORM pg_temp.rec('S5','I-04','service expectations are effective-dated', _n = 2, 'columns=' || _n);

  -- Audit coverage is real, attributed and reason-bearing
  SELECT count(*) INTO _n FROM public.config_change_log WHERE changed_by IS NOT NULL;
  PERFORM pg_temp.rec('S5','I-05','configuration audit entries are attributed to an actor', _n > 0, 'attributed entries=' || _n);
  SELECT count(DISTINCT table_name) INTO _n FROM public.config_change_log;
  PERFORM pg_temp.rec('S5','I-06','audit history spans multiple configuration domains', _n >= 3, 'domains=' || _n);

  -- Public read allowlist is the only anonymous configuration surface
  SELECT count(*) INTO _n FROM public.config_public_read_allowlist a
   WHERE NOT has_table_privilege('anon', 'public.' || quote_ident(a.table_name), 'SELECT');
  PERFORM pg_temp.rec('S5','I-07','every allowlisted public table is actually readable by anon', _n = 0, 'broken=' || _n);
  SELECT count(*) INTO _n FROM public.config_governed_tables g
   WHERE has_table_privilege('anon', 'public.' || quote_ident(g.table_name), 'SELECT')
     AND NOT EXISTS (SELECT 1 FROM public.config_public_read_allowlist a WHERE a.table_name = g.table_name);
  PERFORM pg_temp.rec('S5','I-08','no governed table is anon-readable outside the allowlist', _n = 0, 'off-allowlist=' || _n);

  -- Duplicate-detection window comes from configuration, not code
  SELECT count(*) INTO _n FROM public.complaint_duplicate_scoring_config WHERE active;
  PERFORM pg_temp.rec('S5','I-09','the duplicate-detection window is database configuration', _n = 1, 'active configs=' || _n);
END
$s5$;

-- ===========================================================================
-- S6 — GOVERNED CONFIGURATION PRIVILEGE CONTRACT (F1-B3, DEF-F1-C2-01)
--
-- Derived entirely from public.config_governed_tables +
-- public.config_public_read_allowlist. No table names are hard-coded.
-- ===========================================================================
DO $s6$
DECLARE _n int; _detail text; _res text; _probe text;
BEGIN
  -- P-01: anon holds no privilege at all outside allowlisted SELECT
  WITH viol AS (
    SELECT g.table_name, p.priv
      FROM public.config_governed_tables g
      CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv)
     WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
       AND has_table_privilege('anon', 'public.' || quote_ident(g.table_name), p.priv)
       AND NOT (p.priv = 'SELECT'
                AND EXISTS (SELECT 1 FROM public.config_public_read_allowlist a
                             WHERE a.table_name = g.table_name))
  )
  SELECT count(*), coalesce(string_agg(DISTINCT table_name || '/' || priv, ', '), 'none')
    INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S6','P-01','anon holds no privilege on governed configuration outside allowlisted SELECT',
    _n = 0, 'violations=' || _n || ' [' || left(_detail, 400) || ']');

  -- P-02: authenticated holds no write/structural privilege anywhere governed
  WITH viol AS (
    SELECT g.table_name, p.priv
      FROM public.config_governed_tables g
      CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv)
     WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
       AND has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), p.priv)
  )
  SELECT count(*), coalesce(string_agg(DISTINCT table_name || '/' || priv, ', '), 'none')
    INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S6','P-02','signed-in users hold no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on governed configuration',
    _n = 0, 'violations=' || _n || ' [' || left(_detail, 400) || ']');

  -- P-03: PUBLIC pseudo-role carries no inherited governed privilege
  WITH viol AS (
    SELECT c.relname, a.privilege_type
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE ns.nspname = 'public'
       AND c.relname IN (SELECT table_name FROM public.config_governed_tables)
       AND a.grantee = 0
  )
  SELECT count(*), coalesce(string_agg(DISTINCT relname || '/' || privilege_type, ', '), 'none')
    INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S6','P-03','no governed configuration privilege is inherited through PUBLIC',
    _n = 0, 'violations=' || _n || ' [' || left(_detail, 300) || ']');

  -- P-04: service_role retains privileged backend access everywhere governed
  SELECT count(*) INTO _n FROM public.config_governed_tables g
   WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
     AND NOT (has_table_privilege('service_role', 'public.' || quote_ident(g.table_name), 'SELECT')
              AND has_table_privilege('service_role', 'public.' || quote_ident(g.table_name), 'UPDATE'));
  PERFORM pg_temp.rec('S6','P-04','trusted backend role keeps required access on every governed registry',
    _n = 0, 'missing=' || _n);

  -- Representative empirical negative probes, table chosen from the registry
  SELECT g.table_name INTO _probe
    FROM public.config_governed_tables g
   WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
   ORDER BY g.table_name LIMIT 1;

  _res := pg_temp.as_anon(format('TRUNCATE public.%I', _probe));
  PERFORM pg_temp.rec('S6','P-05','anon TRUNCATE on a governed registry is refused with 42501',
    _res LIKE '42501%', _probe || ' -> ' || _res);

  _res := pg_temp.as_user(pg_temp.uid('applicant'), format('TRUNCATE public.%I', _probe));
  PERFORM pg_temp.rec('S6','P-06','signed-in TRUNCATE on a governed registry is refused with 42501',
    _res LIKE '42501%', _probe || ' -> ' || _res);

  _res := pg_temp.as_anon(format('DELETE FROM public.%I WHERE false', _probe));
  PERFORM pg_temp.rec('S6','P-07','anon direct DELETE on a governed registry is refused with 42501',
    _res LIKE '42501%', _probe || ' -> ' || _res);

  _res := pg_temp.as_anon(format('UPDATE public.%I SET id = id WHERE false', _probe));
  PERFORM pg_temp.rec('S6','P-08','anon direct UPDATE on a governed registry is refused with 42501',
    _res LIKE '42501%', _probe || ' -> ' || _res);

  -- Formerly leaking registries (DEF-F1-C2-01) proven closed by name
  WITH known(t) AS (VALUES ('license_fee_bindings'),('license_verification_templates'),('license_fee_process_settings'))
  SELECT count(*), coalesce(string_agg(t, ', '), 'none') INTO _n, _detail
    FROM known
   WHERE to_regclass('public.' || quote_ident(t)) IS NOT NULL
     AND (has_table_privilege('anon', 'public.' || quote_ident(t), 'INSERT')
       OR has_table_privilege('anon', 'public.' || quote_ident(t), 'UPDATE')
       OR has_table_privilege('anon', 'public.' || quote_ident(t), 'DELETE')
       OR has_table_privilege('anon', 'public.' || quote_ident(t), 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || quote_ident(t), 'TRUNCATE'));
  PERFORM pg_temp.rec('S6','P-09','DEF-F1-C2-01 registries carry no destructive anon or signed-in TRUNCATE privilege',
    _n = 0, 'still leaking=' || _n || ' [' || _detail || ']');

  -- Legitimate operator reads survive the lockdown
  SELECT count(*) INTO _n FROM public.config_governed_tables g
   WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
     AND has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), 'SELECT');
  PERFORM pg_temp.rec('S6','P-10','internal operator read surfaces retain SELECT on governed configuration',
    _n >= 20, 'readable registries=' || _n);
END
$s6$;

-- ===========================================================================
-- EVIDENCE
-- ===========================================================================
\pset border 2
SELECT stage, id, descr,
       CASE WHEN passed IS NULL THEN 'N/A' WHEN passed THEN 'TESTED_PASS' ELSE 'TESTED_FAIL' END AS result,
       detail
FROM f1c_results ORDER BY seq;

DO $sum$
DECLARE _p int; _f int; _n int;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE passed IS FALSE), count(*) FILTER (WHERE passed IS NULL)
    INTO _p, _f, _n FROM f1c_results;
  RAISE WARNING 'F1-C EVIDENCE SUMMARY: % TESTED_PASS / % TESTED_FAIL / % N-A', _p, _f, _n;
  IF _f > 0 THEN
    RAISE EXCEPTION 'F1-C certification gate FAILED: % assertion(s) failed', _f;
  END IF;
END
$sum$;

COMMIT;
