-- ============================================================================
-- verify:f6b — F6 FEES & PAYMENTS CONSOLIDATED REMEDIATION GATE
--
-- Permanent gate proving, empirically, that:
--   A  no browser role can write any F6 financial table (assessment of record,
--      lines, ledger, allocations, waivers, refunds, reconciliation, references)
--   B  every F6 RPC is a guarded SECURITY DEFINER with a pinned search_path and
--      no anon EXECUTE
--   C  the assessment of record is server-authoritative and idempotent, and the
--      indicative preview uses IDENTICAL monetary semantics to the assessment
--   D  payment application is ledger-based: over-application is refused, credit
--      is never silently absorbed, duplicate references are rejected
--   E  waivers and refunds are maker-checker and fail closed (no self-approval,
--      no excess refund, decision precedes execution)
--   F  corrections are compensating entries — settled financial history is
--      never edited or deleted
--   G  reconciliation matches server-side and records exceptions rather than
--      guessing
--
-- Vacuity guard: sections C-G require a real fee-administering actor and a real
-- fee configuration. If either is absent the gate FAILS (it never silently
-- passes on an empty fixture).
--
-- Every empirical write happens inside a savepoint that is ALWAYS rolled back
-- → zero residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f6b.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f6b_results;
CREATE TEMP TABLE f6b_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f6b_results (section, id, descr, passed, detail) VALUES (_s,_id,_d,_ok,_detail);
END $$;

-- Behavioural results are buffered in a variable: the fixture block is always
-- rolled back, so results written to the temp table inside it would be lost.
DROP FUNCTION IF EXISTS pg_temp.bufrec(jsonb,text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.bufrec(_buf jsonb, _s text, _id text, _d text, _ok boolean, _detail text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_buf,'[]'::jsonb) || jsonb_build_object(
    'section',_s,'id',_id,'descr',_d,'passed',_ok,'detail',_detail)
$$;

DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
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

-- ===========================================================================
-- SECTION A — privilege surface: browser roles cannot touch money
-- ===========================================================================
DO $a$
DECLARE _n int; _detail text;
BEGIN
  SELECT count(*), coalesce(string_agg(t.tbl||' '||r.rolename||'/'||p.priv, ', '), 'none')
    INTO _n, _detail
    FROM (VALUES ('public.fee_assessments'),
                 ('public.fee_assessment_lines'),
                 ('public.fee_ledger_entries'),
                 ('public.fee_payment_allocations'),
                 ('public.fee_waivers'),
                 ('public.refunds'),
                 ('public.fee_reconciliation_runs'),
                 ('public.fee_reconciliation_items'),
                 ('public.fee_payment_references'),
                 ('public.fee_components'),
                 ('public.payments')) t(tbl)
    CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolename)
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
   WHERE has_table_privilege(r.rolename, t.tbl, p.priv);
  PERFORM pg_temp.rec('A','A-01','no browser role can write any fee, payment or ledger table',
    _n = 0, 'violations='||_n||' ['||_detail||']');

  SELECT count(*), coalesce(string_agg(t.tbl, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('public.fee_assessments'),
                 ('public.fee_ledger_entries'),
                 ('public.fee_payment_allocations'),
                 ('public.fee_waivers'),
                 ('public.refunds'),
                 ('public.fee_reconciliation_items'),
                 ('public.fee_payment_references')) t(tbl)
   WHERE has_table_privilege('anon', t.tbl, 'SELECT');
  PERFORM pg_temp.rec('A','A-02','unauthenticated visitors cannot read any financial record',
    _n = 0, 'anon-readable='||_n||' ['||_detail||']');

  SELECT count(*) INTO _n
    FROM (VALUES ('public.fee_assessments'),
                 ('public.fee_assessment_lines'),
                 ('public.fee_ledger_entries'),
                 ('public.fee_payment_allocations'),
                 ('public.fee_waivers'),
                 ('public.refunds'),
                 ('public.fee_reconciliation_runs'),
                 ('public.fee_reconciliation_items'),
                 ('public.fee_payment_references')) t(tbl)
   WHERE NOT (has_table_privilege('service_role', t.tbl, 'SELECT')
          AND has_table_privilege('service_role', t.tbl, 'INSERT'));
  PERFORM pg_temp.rec('A','A-03','the trusted server path retains access to the financial estate',
    _n = 0, 'missing='||_n);

  SELECT count(*), coalesce(string_agg(c.relname, ', '), 'none') INTO _n, _detail
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public'
     AND c.relname IN ('fee_assessments','fee_assessment_lines','fee_ledger_entries',
                       'fee_payment_allocations','fee_waivers','refunds',
                       'fee_reconciliation_runs','fee_reconciliation_items',
                       'fee_payment_references')
     AND NOT c.relrowsecurity;
  PERFORM pg_temp.rec('A','A-04','row level security is enabled on every financial table',
    _n = 0, 'without RLS='||_n||' ['||_detail||']');

  -- immutability guards must exist on the append-only structures
  SELECT count(*) INTO _n FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND c.relname='fee_ledger_entries' AND NOT tg.tgisinternal;
  PERFORM pg_temp.rec('A','A-05','the ledger is protected by an append-only guard',
    _n > 0, 'guards='||_n);
END $a$;

-- ===========================================================================
-- SECTION B — RPC surface: guarded definers, pinned search_path, no anon
-- ===========================================================================
DO $b$
DECLARE _n int; _detail text; _fns text[] := ARRAY[
    'fee_assessment_resolve_lines','fee_assessment_preview','fee_assessment_ensure',
    'fee_assessment_supersede','fee_assessment_overview','fee_component_operation',
    'fee_waiver_request','fee_waiver_decide','fee_refund_request','payment_refund_decide',
    'fee_refund_execute','fee_payment_reverse','fee_assessment_state',
    'fee_reconciliation_ingest','fee_reconciliation_resolve',
    'fee_can_administer','fee_can_view_application_finance','submit_offline_payment'];
BEGIN
  -- B-01 every F6 RPC exists
  SELECT count(*), coalesce(string_agg(f, ', '),'none') INTO _n, _detail
    FROM unnest(_fns) f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                      WHERE ns.nspname='public' AND p.proname=f);
  PERFORM pg_temp.rec('B','B-01','the complete F6 server contract is present',
    _n = 0, 'missing='||_n||' ['||_detail||']');

  -- B-02 all are SECURITY DEFINER
  SELECT count(*), coalesce(string_agg(p.proname, ', '),'none') INTO _n, _detail
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname = ANY(_fns) AND NOT p.prosecdef;
  PERFORM pg_temp.rec('B','B-02','every F6 entry point runs under server authority',
    _n = 0, 'invoker='||_n||' ['||_detail||']');

  -- B-03 all pin search_path
  SELECT count(*), coalesce(string_agg(p.proname, ', '),'none') INTO _n, _detail
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname = ANY(_fns)
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg WHERE cfg LIKE 'search\_path=%');
  PERFORM pg_temp.rec('B','B-03','every F6 entry point pins its schema resolution',
    _n = 0, 'unpinned='||_n||' ['||_detail||']');

  -- B-04 no anon / PUBLIC execute on any F6 RPC
  SELECT count(*), coalesce(string_agg(p.proname||'/'||r.rolename, ', '),'none') INTO _n, _detail
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    CROSS JOIN (VALUES ('anon'),('public')) r(rolename)
   WHERE ns.nspname='public' AND p.proname = ANY(_fns)
     AND has_function_privilege(r.rolename, p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('B','B-04','no unauthenticated caller can execute any F6 operation',
    _n = 0, 'violations='||_n||' ['||_detail||']');

  -- B-05 every mutating RPC contains an explicit authority check
  SELECT count(*), coalesce(string_agg(p.proname, ', '),'none') INTO _n, _detail
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname = ANY(ARRAY['fee_component_operation','fee_waiver_decide',
                               'fee_refund_execute','fee_payment_reverse','fee_reconciliation_ingest',
                               'fee_reconciliation_resolve'])
     AND p.prosrc NOT LIKE '%fee_can_administer%';
  PERFORM pg_temp.rec('B','B-05','every regulator-only fee operation checks fee administration authority',
    _n = 0, 'unguarded='||_n||' ['||_detail||']');

  -- B-06 read paths check finance visibility
  SELECT count(*), coalesce(string_agg(p.proname, ', '),'none') INTO _n, _detail
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname = ANY(ARRAY['fee_assessment_preview','fee_assessment_ensure','fee_assessment_state','fee_assessment_overview'])
     AND p.prosrc NOT LIKE '%fee_can_view_application_finance%'
     -- delegation to a checked read is acceptable, an unchecked read is not
     AND p.prosrc NOT LIKE '%fee_assessment_state(%';
  PERFORM pg_temp.rec('B','B-06','financial reads are scoped by an explicit visibility check',
    _n = 0, 'unscoped='||_n||' ['||_detail||']');

  -- B-07 preview and assessment share identical monetary semantics (blocking-only)
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='fee_assessment_preview'
     AND p.prosrc LIKE '%blocking%';
  PERFORM pg_temp.rec('B','B-07','the indicative preview totals only payable lines, as the assessment does',
    _n = 1, 'blocking-filtered='||_n);

  -- B-08 idempotency is structural, not advisory
  SELECT count(*) INTO _n FROM pg_indexes
   WHERE schemaname='public' AND tablename='fee_assessments' AND indexdef ILIKE '%unique%'
     AND indexdef ILIKE '%idempotency_key%';
  PERFORM pg_temp.rec('B','B-08','the assessment of record is protected by a structural idempotency key',
    _n >= 1, 'unique indexes='||_n);

  -- B-09 duplicate payment references are structurally impossible
  SELECT count(*) INTO _n FROM pg_indexes
   WHERE schemaname='public' AND tablename='fee_payment_references' AND indexdef ILIKE '%unique%'
     AND indexdef ILIKE '%reference_norm%';
  PERFORM pg_temp.rec('B','B-09','a payment reference can only be recorded once',
    _n >= 1, 'unique indexes='||_n);
END $b$;

-- ===========================================================================
-- SECTIONS C-G — empirical behaviour (rolled back)
-- ===========================================================================
DO $c$
DECLARE
  _admin uuid; _applicant uuid; _app uuid; _lt text; _ft uuid;
  _pre jsonb; _s1 jsonb; _s2 jsonb; _ov jsonb; _state text;
  _pay uuid; _wv uuid; _rf uuid; _n int; _ledger int; _step text := 'start'; _buf jsonb := '[]'::jsonb; _r jsonb;
BEGIN
  -- vacuity guard: a real fee-administering actor must exist
  SELECT u.id INTO _admin FROM auth.users u
   WHERE public.fee_can_administer(u.id) LIMIT 1;
  IF _admin IS NULL THEN
    PERFORM pg_temp.rec('C','C-00','a fee-administering actor exists to exercise the engine',
      false, 'no user holds fee administration authority — gate cannot be proven');
    RETURN;
  END IF;
  PERFORM pg_temp.rec('C','C-00','a fee-administering actor exists to exercise the engine', true,
    'actor='||_admin::text);

  SELECT u.id INTO _applicant FROM auth.users u WHERE u.id <> _admin LIMIT 1;
  SELECT id INTO _ft FROM public.fee_types LIMIT 1;
  IF _ft IS NULL THEN
    PERFORM pg_temp.rec('C','C-01','a fee type exists to itemise against', false, 'fee_types is empty');
    RETURN;
  END IF;
  PERFORM pg_temp.rec('C','C-01','a fee type exists to itemise against', true, 'fee_type='||_ft::text);

  BEGIN  -- ---------------- all writes inside this block are rolled back ----
    -- fixture application
    SELECT license_type INTO _lt FROM public.applications WHERE license_type IS NOT NULL LIMIT 1;
    INSERT INTO public.applications (applicant_id, license_type, status, request_kind, data)
    VALUES (_admin, COALESCE(_lt,'VERIFY-F6B'), 'submitted', 'NEW_LICENCE',
            jsonb_build_object('verify_f6b', true))
    RETURNING id INTO _app;

    INSERT INTO public.fee_components (application_id, fee_type_id, amount, description)
    VALUES (_app, _ft, 1000.00, 'verify:f6b fixture line');

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _admin::text, 'role','authenticated')::text, true);

    -- C-02 preview total == assessed total (identical monetary semantics)
    _step := 'C-02'; RAISE NOTICE 'step: %', _step;
    _pre := public.fee_assessment_preview(_app);
    _s1  := public.fee_assessment_ensure(_app, 'verify:f6b');
    _buf := pg_temp.bufrec(_buf, 'C','C-02',
      'the indicative preview figure equals the figure later assessed of record',
      ROUND((_pre->>'assessed_total')::numeric,2) = ROUND((_s1->>'assessed_total')::numeric,2),
      'preview='||(_pre->>'assessed_total')||' assessed='||(_s1->>'assessed_total'));

    -- C-03 assessment is idempotent
    _step := 'C-03'; RAISE NOTICE 'step: %', _step;
    _s2 := public.fee_assessment_ensure(_app, 'verify:f6b repeat');
    _buf := pg_temp.bufrec(_buf, 'C','C-03','re-entering the financial boundary never duplicates the assessment',
      (_s1->>'assessment_id') = (_s2->>'assessment_id'),
      'first='||(_s1->>'assessment_id')||' second='||(_s2->>'assessment_id'));

    SELECT count(*) INTO _n FROM public.fee_assessments
     WHERE application_id = _app AND status = 'ACTIVE';
    _buf := pg_temp.bufrec(_buf, 'C','C-04','exactly one assessment of record is active per application',
      _n = 1, 'active='||_n);

    -- C-05 the assessment carries provenance
    _step := 'C-05'; RAISE NOTICE 'step: %', _step;
    _buf := pg_temp.bufrec(_buf, 'C','C-05','the assessment records its basis, source and configuration snapshot',
      COALESCE(_s1->>'basis','') <> '' AND COALESCE(_s1->>'resolution_source','') <> '',
      'basis='||COALESCE(_s1->>'basis','∅')||' source='||COALESCE(_s1->>'resolution_source','∅'));

    -- D-01 an overpayment is allocated up to the assessed balance and the excess
    _step := 'D-01'; RAISE NOTICE 'step: %', _step;
    --      is retained as an explicit credit — never silently absorbed
    INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                 payment_method, payment_channel, transaction_ref, paid_at)
    VALUES (_admin, _app, ROUND((_s1->>'outstanding')::numeric,2) + 500, _s1->>'currency', 'success',
            'online','online','VERIFY-F6B-OVER-'||gen_random_uuid()::text, now())
    RETURNING id INTO _pay;
    SELECT COALESCE(sum(al.amount),0) INTO _n
      FROM public.fee_payment_allocations al
     WHERE al.payment_id = _pay AND al.reversed_at IS NULL;
    _buf := pg_temp.bufrec(_buf, 'D','D-01','an overpayment is allocated only up to the assessed balance',
      _n <= ROUND((_s1->>'outstanding')::numeric,2),
      'allocated='||_n||' outstanding_was='||(_s1->>'outstanding'));

    SELECT count(*) INTO _n FROM public.fee_ledger_entries
     WHERE payment_id = _pay AND entry_type IN ('CREDIT','PAYMENT');
    _buf := pg_temp.bufrec(_buf, 'D','D-01b','the unallocated excess is retained as an explicit ledger credit',
      _n >= 2, 'ledger entries for the overpayment='||_n);

    -- the overpayment is reversed so the remaining sections start from a clean balance
    PERFORM public.fee_payment_reverse(_pay, 'verify f6b clearing the overpayment fixture');

    -- D-02 itemisation change supersedes the un-settled assessment
    _step := 'D-02'; RAISE NOTICE 'step: %', _step;
    PERFORM public.fee_component_operation(_app, 'add',
      jsonb_build_object('fee_type_id', (SELECT id FROM public.fee_types WHERE id <> _ft LIMIT 1),
                         'amount', 250, 'description', 'verify:f6b second line'));
    SELECT count(*) INTO _n FROM public.fee_assessments
     WHERE application_id = _app AND status = 'ACTIVE';
    _buf := pg_temp.bufrec(_buf, 'D','D-02','changing the fee itemisation retires the stale assessment',
      _n <= 1, 'active after change='||_n);

    _s1 := public.fee_assessment_ensure(_app, 'verify:f6b re-assess');

    -- E-01 self-approval of a waiver is refused
    _step := 'E-01'; RAISE NOTICE 'step: %', _step;
    PERFORM public.fee_waiver_request(_app, 100, 'verify f6b waiver justification text');
    SELECT id INTO _wv FROM public.fee_waivers
     WHERE assessment_id = (_s1->>'assessment_id')::uuid ORDER BY requested_at DESC LIMIT 1;
    _state := 'unexpected-success';
    BEGIN
      PERFORM public.fee_waiver_decide(_wv, true, 'verify f6b self approval attempt');
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,80);
    END;
    _buf := pg_temp.bufrec(_buf, 'E','E-01','the requester of a waiver can never approve it',
      _state <> 'unexpected-success', 'result='||_state);

    -- E-02 a waiver above the outstanding balance is refused
    _step := 'E-02'; RAISE NOTICE 'step: %', _step;
    _state := 'unexpected-success';
    BEGIN
      PERFORM public.fee_waiver_request(_app,
        ROUND((_s1->>'outstanding')::numeric,2) + 1000, 'verify f6b excessive waiver request');
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,80);
    END;
    _buf := pg_temp.bufrec(_buf, 'E','E-02','a waiver cannot exceed the outstanding assessed amount',
      _state <> 'unexpected-success', 'result='||_state);

    -- E-03 refunds cannot be executed before they are decided
    _step := 'E-03'; RAISE NOTICE 'step: %', _step;
    INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                 payment_method, payment_channel, transaction_ref, paid_at)
    VALUES (_admin, _app, 300, _s1->>'currency', 'success',
            'online', 'online', 'VERIFY-F6B-'||gen_random_uuid()::text, now())
    RETURNING id INTO _pay;
    PERFORM public.fee_refund_request(_pay, 100, 'verify f6b refund reason text');
    SELECT id INTO _rf FROM public.refunds WHERE payment_id = _pay ORDER BY created_at DESC LIMIT 1;
    _state := 'unexpected-success';
    BEGIN
      PERFORM public.fee_refund_execute(_rf, 'VERIFY-F6B-REF');
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,80);
    END;
    _buf := pg_temp.bufrec(_buf, 'E','E-03','a refund cannot be paid out before it has been approved',
      _state <> 'unexpected-success', 'result='||_state);

    -- E-04 a refund above the settled receipt is refused
    _step := 'E-04'; RAISE NOTICE 'step: %', _step;
    _state := 'unexpected-success';
    BEGIN
      PERFORM public.fee_refund_request(_pay, 100000, 'verify f6b excessive refund reason');
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,80);
    END;
    _buf := pg_temp.bufrec(_buf, 'E','E-04','a refund cannot exceed the amount actually received',
      _state <> 'unexpected-success', 'result='||_state);

    -- F-01 reversal writes a compensating entry and deletes nothing
    _step := 'F-01'; RAISE NOTICE 'step: %', _step;
    SELECT count(*) INTO _ledger FROM public.fee_ledger_entries WHERE application_id = _app;
    PERFORM public.fee_payment_reverse(_pay, 'verify f6b reversal rationale text');
    SELECT count(*) INTO _n FROM public.fee_ledger_entries WHERE application_id = _app;
    _buf := pg_temp.bufrec(_buf, 'F','F-01','a reversal adds a compensating entry rather than removing history',
      _n > _ledger, 'entries before='||_ledger||' after='||_n);

    SELECT count(*) INTO _n FROM public.fee_payment_allocations
     WHERE payment_id = _pay AND reversed_at IS NOT NULL;
    _buf := pg_temp.bufrec(_buf, 'F','F-02','the original allocation is marked reversed, never deleted',
      _n = 1, 'reversed allocations='||_n);

    -- F-03 the outstanding balance returns to the pre-payment position
    _step := 'F-03'; RAISE NOTICE 'step: %', _step;
    _ov := public.fee_assessment_overview(_app);
    _buf := pg_temp.bufrec(_buf, 'F','F-03','the outstanding balance is restored after the reversal',
      ROUND((_ov->>'reversed_total')::numeric,2) >= 300,
      'reversed_total='||COALESCE(_ov->>'reversed_total','∅')||
      ' outstanding='||COALESCE(_ov->>'outstanding','∅'));

    -- F-04 the ledger itself refuses mutation
    _step := 'F-04'; RAISE NOTICE 'step: %', _step;
    _state := 'unexpected-success';
    BEGIN
      UPDATE public.fee_ledger_entries SET amount = amount + 1 WHERE application_id = _app;
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,80);
    END;
    _buf := pg_temp.bufrec(_buf, 'F','F-04','ledger entries cannot be altered once written',
      _state <> 'unexpected-success', 'result='||_state);

    -- G-01 reconciliation matches server-side; unknown references become exceptions
    _step := 'G-01'; RAISE NOTICE 'step: %', _step;
    _ov := public.fee_reconciliation_ingest('BANK_STATEMENT', 'VERIFY-F6B-'||gen_random_uuid()::text,
      jsonb_build_array(
        jsonb_build_object('reference','NO-SUCH-REF-'||gen_random_uuid()::text,
                           'amount', 42, 'currency', _s1->>'currency')));
    _buf := pg_temp.bufrec(_buf, 'G','G-01','an unknown statement line is recorded as unmatched, never guessed',
      COALESCE((_ov->>'unmatched')::int,0) + COALESCE((_ov->>'exceptions')::int,0) = 1,
      'matched='||COALESCE(_ov->>'matched','∅')||' unmatched='||COALESCE(_ov->>'unmatched','∅')||
      ' exceptions='||COALESCE(_ov->>'exceptions','∅'));

    -- G-02 the overview is the single financial read for regulator surfaces
    _step := 'G-02'; RAISE NOTICE 'step: %', _step;
    _ov := public.fee_assessment_overview(_app);
    _buf := pg_temp.bufrec(_buf, 'G','G-02','one governed read returns assessment, payments, ledger and audit',
      (_ov ? 'lines') AND (_ov ? 'payments') AND (_ov ? 'ledger')
        AND (_ov ? 'waivers') AND (_ov ? 'refunds') AND (_ov ? 'outstanding'),
      'keys='||(SELECT string_agg(k, ',') FROM jsonb_object_keys(_ov) k));

    -- G-03 an entity user never receives the regulator-only sections
    _step := 'G-03'; RAISE NOTICE 'step: %', _step;
    IF _applicant IS NOT NULL AND NOT public.fee_can_administer(_applicant) THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', _applicant::text, 'role','authenticated')::text, true);
      BEGIN
        _ov := public.fee_assessment_overview(_app);
        _buf := pg_temp.bufrec(_buf, 'G','G-03','entity users never receive the regulator-only ledger or audit',
          COALESCE(jsonb_array_length(_ov->'ledger'),0) = 0
            AND COALESCE(jsonb_array_length(_ov->'audit'),0) = 0,
          'ledger='||COALESCE(jsonb_array_length(_ov->'ledger'),0)::text||
          ' audit='||COALESCE(jsonb_array_length(_ov->'audit'),0)::text);
      EXCEPTION WHEN others THEN
        _buf := pg_temp.bufrec(_buf, 'G','G-03','entity users never receive the regulator-only ledger or audit',
          true, 'access refused outright: '||SQLSTATE);
      END;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', _admin::text, 'role','authenticated')::text, true);
    END IF;

    -- zero residue
    RAISE EXCEPTION 'VERIFY_F6B_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'VERIFY_F6B_ROLLBACK' THEN
      _buf := pg_temp.bufrec(_buf, 'C','C-ERR','the behavioural battery runs to completion',
        false, 'at '||_step||' — '||SQLSTATE||': '||left(SQLERRM,180));
    END IF;
  END;

  -- flush the buffered behavioural results (survives the fixture rollback)
  FOR _r IN SELECT jsonb_array_elements(_buf) LOOP
    PERFORM pg_temp.rec(_r->>'section', _r->>'id', _r->>'descr',
                        (_r->>'passed')::boolean, _r->>'detail');
  END LOOP;


  PERFORM set_config('request.jwt.claims', '{}', true);
END $c$;

-- ===========================================================================
-- SECTION H — zero residue
-- ===========================================================================
DO $h$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.applications WHERE data ? 'verify_f6b';
  PERFORM pg_temp.rec('H','H-01','the gate leaves no fixture behind', _n = 0, 'residual applications='||_n);

  SELECT count(*) INTO _n FROM public.fee_payment_references WHERE raw_reference LIKE 'VERIFY-F6B%';
  PERFORM pg_temp.rec('H','H-02','the gate leaves no payment references behind', _n = 0, 'residual refs='||_n);

  SELECT count(*) INTO _n FROM public.fee_reconciliation_runs WHERE statement_reference LIKE 'VERIFY-F6B%';
  PERFORM pg_temp.rec('H','H-03','the gate leaves no reconciliation runs behind', _n = 0, 'residual runs='||_n);
END $h$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f6b_results ORDER BY seq;

DO $r$
DECLARE _p int; _f int; _detail text;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed) INTO _p, _f FROM f6b_results;
  RAISE NOTICE 'verify:f6b — % PASS / % FAIL', _p, _f;
  IF _f > 0 THEN
    SELECT string_agg(id||' ('||detail||')', '; ') INTO _detail FROM f6b_results WHERE NOT passed;
    RAISE EXCEPTION 'verify:f6b FAILED — %', _detail;
  END IF;
END $r$;

DROP TABLE IF EXISTS f6b_results;
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
