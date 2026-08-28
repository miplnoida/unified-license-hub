-- verify:license-terms
--
-- Permanent gate for DEF-F4-C-04 (F4-B5).
--
-- Category asserted: every licence that exists must carry an authoritative
-- term chain — an opening `original` term and exactly one `is_current` term —
-- and the issuance path must create that opening term atomically inside the
-- issuing transaction (never asynchronously, never optionally).
--
-- Assertions
--   1. licences with no `original` term == 0 (legacy allowlist only)
--   2. licences with no `is_current` term == 0
--   3. licences with more than one `is_current` term == 0
--   4. `original` terms whose validity does not match the licence == 0
--   5. AFTER INSERT trigger `trg_license_open_original_term` present + enabled
--   6. term writer routines are not executable by anon / authenticated
--   7. empirical (savepoint-rolled-back): inserting a licence creates its opening term
--      in the same transaction, and the writer is idempotent
--
-- Legacy allowlist: LIC-2026-000033 (96adeaa2-b3a4-467f-bc47-2b1e50f687a4)
-- recorded a `renewal` term at term_number 1 before any original term existed.
-- `license_terms` is append-only, so term_number 1 cannot be reclaimed; this
-- row is classified DATA_REMEDIATION_REQUIRED and is the only tolerated gap.
--
-- Usage: psql -f scripts/verify-license-terms.sql
\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
-- Every gate restores the default explicitly so RLS probes are deterministic.
SET row_security = on;
\pset pager off

DO $$
DECLARE
  v_allowlist uuid[] := ARRAY['96adeaa2-b3a4-467f-bc47-2b1e50f687a4'::uuid];
  v_pass int := 0;
  v_n int;
  v_detail text;
  v_lic uuid;
  v_term uuid;
  v_term2 uuid;
  v_fail text;
BEGIN
  ---------------------------------------------------------------- 1
  SELECT count(*), coalesce(string_agg(l.license_number, ', '), '')
    INTO v_n, v_detail
    FROM public.licenses l
   WHERE l.id <> ALL (v_allowlist)
     AND NOT EXISTS (SELECT 1 FROM public.license_terms t
                      WHERE t.license_id = l.id AND t.term_kind = 'original');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verify:license-terms FAILED [1] — % licence(s) with no original term: %', v_n, v_detail;
  END IF;
  v_pass := v_pass + 1;

  ---------------------------------------------------------------- 2
  SELECT count(*), coalesce(string_agg(l.license_number, ', '), '')
    INTO v_n, v_detail
    FROM public.licenses l
   WHERE NOT EXISTS (SELECT 1 FROM public.license_terms t
                      WHERE t.license_id = l.id AND t.is_current);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verify:license-terms FAILED [2] — % licence(s) with no current term: %', v_n, v_detail;
  END IF;
  v_pass := v_pass + 1;

  ---------------------------------------------------------------- 3
  SELECT count(*), coalesce(string_agg(x.license_id::text, ', '), '')
    INTO v_n, v_detail
    FROM (SELECT license_id FROM public.license_terms
           WHERE is_current GROUP BY license_id HAVING count(*) > 1) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verify:license-terms FAILED [3] — % licence(s) with multiple current terms: %', v_n, v_detail;
  END IF;
  v_pass := v_pass + 1;

  ---------------------------------------------------------------- 4
  SELECT count(*), coalesce(string_agg(l.license_number, ', '), '')
    INTO v_n, v_detail
    FROM public.license_terms t
    JOIN public.licenses l ON l.id = t.license_id
   WHERE t.term_kind = 'original'
     AND (t.effective_from IS DISTINCT FROM l.valid_from
          OR (NOT EXISTS (SELECT 1 FROM public.license_terms t2
                           WHERE t2.license_id = l.id AND t2.term_number > t.term_number)
              AND t.effective_until IS DISTINCT FROM l.valid_until));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verify:license-terms FAILED [4] — % original term(s) diverge from licence validity: %', v_n, v_detail;
  END IF;
  v_pass := v_pass + 1;

  ---------------------------------------------------------------- 5
  SELECT count(*) INTO v_n
    FROM pg_trigger
   WHERE tgrelid = 'public.licenses'::regclass
     AND tgname = 'trg_license_open_original_term'
     AND NOT tgisinternal
     AND tgenabled <> 'D';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'verify:license-terms FAILED [5] — issuance term trigger missing or disabled';
  END IF;
  v_pass := v_pass + 1;

  ---------------------------------------------------------------- 6
  SELECT count(*), coalesce(string_agg(p.proname, ', '), '')
    INTO v_n, v_detail
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('ensure_license_original_term',
                       'assert_license_term_integrity',
                       'tg_license_open_original_term')
     AND (has_function_privilege('anon', p.oid, 'execute')
          OR has_function_privilege('authenticated', p.oid, 'execute'));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verify:license-terms FAILED [6] — term writer(s) callable from the browser: %', v_detail;
  END IF;
  v_pass := v_pass + 1;

  ---------------------------------------------------------------- 7 (empirical)
  -- Driven inside a savepoint that is always rolled back, so the probe leaves
  -- no residue in the append-only licence/term tables.
  BEGIN
    INSERT INTO public.licenses (application_id, holder_id, license_type,
                                 valid_from, valid_until, status)
    VALUES (NULL,
            (SELECT holder_id FROM public.licenses WHERE holder_id IS NOT NULL LIMIT 1),
            'VERIFY_LICENSE_TERMS_PROBE',
            now(), now() + interval '365 days', 'active')
    RETURNING id INTO v_lic;

    SELECT id INTO v_term FROM public.license_terms
     WHERE license_id = v_lic AND term_kind = 'original' AND is_current AND term_number = 1;
    IF v_term IS NULL THEN
      v_fail := 'verify:license-terms FAILED [7a] — issuance did not create the opening term atomically';
    END IF;

    IF v_fail IS NULL THEN
      v_term2 := public.ensure_license_original_term(v_lic, NULL, 'INITIAL_ISSUANCE');
      IF v_term2 IS DISTINCT FROM v_term THEN
        v_fail := 'verify:license-terms FAILED [7b] — term writer is not idempotent';
      END IF;
    END IF;

    IF v_fail IS NULL THEN
      SELECT count(*) INTO v_n FROM public.license_terms WHERE license_id = v_lic;
      IF v_n <> 1 THEN
        v_fail := format('verify:license-terms FAILED [7c] — expected 1 term for probe licence, found %s', v_n);
      END IF;
    END IF;

    IF v_fail IS NULL THEN
      PERFORM public.assert_license_term_integrity(v_lic, NULL);
    END IF;

    RAISE EXCEPTION 'PROBE_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PROBE_ROLLBACK' AND v_fail IS NULL THEN
      v_fail := 'verify:license-terms FAILED [7] — ' || SQLERRM;
    END IF;
  END;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION '%', v_fail;
  END IF;
  v_pass := v_pass + 1;

  IF EXISTS (SELECT 1 FROM public.licenses WHERE license_type = 'VERIFY_LICENSE_TERMS_PROBE') THEN
    RAISE EXCEPTION 'verify:license-terms FAILED — probe residue remains';
  END IF;

  RAISE NOTICE 'verify:license-terms PASSED — %/7 assertions, allowlisted legacy gaps: %',
    v_pass, array_length(v_allowlist, 1);
END;
$$;

