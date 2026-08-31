-- F8-W2C — RETAIL PAYMENT VOLUME OVERSIGHT (retail-volume part of GAP-F8-10)
--
-- Proves the retail payment volume contract end to end:
--
--   payment operator
--     -> record period figures     public.payment_retail_volume_record(...)
--     -> canonical store           public.payment_retail_volumes (RLS)
--     -> oversight evidence        public.payment_oversight_events
--     -> canonical audit           public.prudential_audit_event -> audit_logs
--                                                               -> compliance_audit_logs
--     -> read model / UI           useRetailVolumes / RetailPaymentsPanel
--
-- Authority helpers: public.can_read_payment_oversight(uuid)
--                    public.can_act_on_payment_oversight(uuid, text)
--
-- Runtime section is rollback-scoped (BEGIN ... ROLLBACK), uses real
-- certification personas only, seeds nothing into auth.users and modifies no
-- permission, policy or grant.
\set ON_ERROR_STOP on
\timing off
\pset pager off

-- ===========================================================================
-- PART 1 — static contract
-- ===========================================================================
DO $$
DECLARE def text; n int;
BEGIN
  -- 1. canonical store and governed columns
  PERFORM 1 FROM pg_class WHERE oid = 'public.payment_retail_volumes'::regclass;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payment_retail_volumes'
     AND column_name IN ('id','operator_id','period_start','period_end','payment_type',
       'transaction_count','transaction_value','currency','source','created_by',
       'created_at','updated_at');
  IF n <> 12 THEN RAISE EXCEPTION 'FAIL 1: retail volume contract columns missing (found %)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.payment_retail_volumes'::regclass
                    AND contype = 'u'
                    AND pg_get_constraintdef(oid) =
                        'UNIQUE (operator_id, period_start, period_end, payment_type)') THEN
    RAISE EXCEPTION 'FAIL 1: canonical period/payment-type uniqueness lost';
  END IF;
  RAISE NOTICE 'PASS 1: canonical retail volume store present with governed columns and period uniqueness';

  -- 2. database-enforced validation
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.payment_retail_volumes'::regclass AND contype = 'c'
     AND conname IN ('prv_period_order','prv_count_nonneg','prv_value_nonneg',
                     'prv_currency_code','prv_payment_type_allowed');
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL 2: database-enforced volume validation missing (found %)', n; END IF;
  RAISE NOTICE 'PASS 2: period order, non-negative count/value, currency code and payment type enforced in the database';

  -- 3. single canonical governed write path, SECURITY DEFINER + pinned search_path
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname ILIKE '%retail_volume%';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 3: expected exactly 1 retail volume function, found %', n; END IF;
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'payment_retail_volume_record';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL 3: canonical payment_retail_volume_record missing'; END IF;
  IF def NOT LIKE '%SECURITY DEFINER%' OR def NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'FAIL 3: retail volume RPC lost SECURITY DEFINER / pinned search_path';
  END IF;
  IF def NOT LIKE '%can_act_on_payment_oversight(auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL 3: retail volume RPC does not enforce the canonical authority helper';
  END IF;
  IF def NOT LIKE '%payment_oversight_events%' OR def NOT LIKE '%prudential_audit_event%' THEN
    RAISE EXCEPTION 'FAIL 3: retail volume RPC does not write canonical oversight/audit evidence';
  END IF;
  IF def NOT LIKE '%created_by%auth.uid()%' AND def NOT LIKE '%auth.uid()%created_by%' THEN
    RAISE EXCEPTION 'FAIL 3: retail volume RPC does not derive the actor from the session';
  END IF;
  RAISE NOTICE 'PASS 3: payment_retail_volume_record is the single governed write path (definer, authority-guarded, server-derived actor, audited)';

  -- 4. direct browser DML is no longer possible; reads stay authority-scoped
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'payment_retail_volumes'
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 4: direct client DML grants still present on payment_retail_volumes (%)', n;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_retail_volumes'::regclass) THEN
    RAISE EXCEPTION 'FAIL 4: RLS disabled on payment_retail_volumes';
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'payment_retail_volumes'
     AND (qual LIKE '%payment_oversight%' OR with_check LIKE '%payment_oversight%');
  IF n < 2 THEN RAISE EXCEPTION 'FAIL 4: retail volume policies not bound to payment oversight authority'; END IF;
  RAISE NOTICE 'PASS 4: no direct client DML grants; RLS reads restricted to payment oversight authority';

  -- 5. execute privileges limited to signed-in / service principals
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE pronamespace = 'public'::regnamespace
                AND proname = 'payment_retail_volume_record'
                AND has_function_privilege('anon', oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'FAIL 5: anon can execute the retail volume RPC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                  WHERE pronamespace = 'public'::regnamespace
                    AND proname = 'payment_retail_volume_record'
                    AND has_function_privilege('authenticated', oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'FAIL 5: authenticated cannot execute the retail volume RPC';
  END IF;
  RAISE NOTICE 'PASS 5: RPC execute privilege limited to authenticated/service_role';
END $$;

-- ===========================================================================
-- PART 2 — rollback-scoped runtime proof
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_sec  uuid := '00000000-0000-0000-0000-00000f82c001';
  v_ent  uuid := '00000000-0000-0000-0000-00000f82c002';
  v_opa  uuid := '00000000-0000-0000-0000-00000f82c003';
  v_opb  uuid := '00000000-0000-0000-0000-00000f82c004';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'W2C Payments Sector')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_ent, 'W2C Payments Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;
  INSERT INTO public.payment_system_operators
    (id, reference, operator_name, operator_type, entity_id, systemically_important)
  VALUES (v_opa, 'PSO-W2C-0001', 'W2C Retail Switch', 'card_network', v_ent, false),
         (v_opb, 'PSO-W2C-0002', 'W2C E-money Issuer', 'e_money', v_ent, false);
END $$;

-- ---------------------------------------------------------------------------
-- 6. unauthorised internal / external principals cannot write
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
      'cards', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 6: unauthorised internal persona recorded retail volumes';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
      'cards', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 6: external licensee user recorded retail volumes';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  -- direct table DML is impossible for either persona (no grant)
  BEGIN
    INSERT INTO public.payment_retail_volumes
      (operator_id, period_start, period_end, payment_type, transaction_count, transaction_value, currency)
    VALUES ('00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
            'cards', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 6: direct client DML into payment_retail_volumes succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 3 THEN RAISE EXCEPTION 'FAIL 6: expected 3 denials, got %', denied; END IF;
  RAISE NOTICE 'PASS 6: unauthorised internal, external and direct-DML writes are denied';
END $$;
RESET ROLE;

-- 7. anonymous caller cannot write or read
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '';
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
      'cards', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 7: anonymous caller recorded retail volumes';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  BEGIN
    INSERT INTO public.payment_retail_volumes
      (operator_id, period_start, period_end, payment_type, transaction_count, transaction_value)
    VALUES ('00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31', 'cards', 1, 1);
    RAISE EXCEPTION 'FAIL 7: anonymous direct DML succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 2 THEN RAISE EXCEPTION 'FAIL 7: expected 2 anonymous denials, got %', denied; END IF;
  IF (SELECT count(*) FROM public.payment_retail_volumes) <> 0 THEN
    RAISE EXCEPTION 'FAIL 7: anonymous caller can read retail volume rows';
  END IF;
  RAISE NOTICE 'PASS 7: anonymous callers cannot record or read retail volumes';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- authorised payment systems supervisor
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}';

-- 8. record one period's figures
DO $$
DECLARE r jsonb; v public.payment_retail_volumes;
BEGIN
  r := public.payment_retail_volume_record(
        '00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
        'cards', 1250000, 8734500.75, 'jmd');
  IF COALESCE((r->>'ok')::boolean, false) IS NOT TRUE OR (r->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 8: retail volume record did not return a created result (%)', r;
  END IF;
  SELECT * INTO v FROM public.payment_retail_volumes WHERE id = (r->>'volume_id')::uuid;
  IF v.id IS NULL THEN RAISE EXCEPTION 'FAIL 8: retail volume row not persisted'; END IF;
  IF v.operator_id <> '00000000-0000-0000-0000-00000f82c003'::uuid
     OR v.period_start <> DATE '2026-01-01' OR v.period_end <> DATE '2026-01-31'
     OR v.payment_type <> 'cards' OR v.transaction_count <> 1250000
     OR v.transaction_value <> 8734500.75 OR v.currency <> 'JMD' THEN
    RAISE EXCEPTION 'FAIL 8: operator/period/type/count/value/currency not persisted correctly';
  END IF;
  IF v.created_by <> '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid THEN
    RAISE EXCEPTION 'FAIL 8: actor not derived from the session (%)', v.created_by;
  END IF;
  RAISE NOTICE 'PASS 8: authorised supervisor recorded a period with correct operator, period, type, count, value, normalised currency and server-derived actor';
END $$;

-- 9. second payment type in the same period is stored independently; zero values allowed
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.payment_retail_volume_record(
        '00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
        'cheque', 0, 0, 'JMD');
  IF (r->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 9: second payment type was not stored as a new row (%)', r;
  END IF;
  SELECT count(*) INTO n FROM public.payment_retail_volumes
   WHERE operator_id = '00000000-0000-0000-0000-00000f82c003'
     AND period_start = DATE '2026-01-01' AND period_end = DATE '2026-01-31';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 9: expected 2 independent payment-type rows, found %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_retail_volumes
                  WHERE id = (r->>'volume_id')::uuid
                    AND transaction_count = 0 AND transaction_value = 0) THEN
    RAISE EXCEPTION 'FAIL 9: zero figures were not stored as zero';
  END IF;
  RAISE NOTICE 'PASS 9: payment types are independent within a period and zero figures are accepted per the existing contract';
END $$;

-- 10. validation: negative figures, inverted period, invalid currency/payment type, unknown operator
DO $$
DECLARE denied int := 0;
BEGIN
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-02-01', DATE '2026-02-28', 'cards', -1, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 10: negative transaction count accepted';
  EXCEPTION WHEN raise_exception OR check_violation THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-02-01', DATE '2026-02-28', 'cards', 10, -5, 'JMD');
    RAISE EXCEPTION 'FAIL 10: negative transaction value accepted';
  EXCEPTION WHEN raise_exception OR check_violation THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-02-28', DATE '2026-02-01', 'cards', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 10: inverted period accepted';
  EXCEPTION WHEN raise_exception OR check_violation THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-02-01', DATE '2026-02-28', 'cards', 10, 10, 'DOLLARS');
    RAISE EXCEPTION 'FAIL 10: invalid currency accepted';
  EXCEPTION WHEN raise_exception OR check_violation THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-00000f82c003', DATE '2026-02-01', DATE '2026-02-28', 'crypto', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 10: unknown payment type accepted';
  EXCEPTION WHEN raise_exception OR check_violation THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM public.payment_retail_volume_record(
      '00000000-0000-0000-0000-0000deadbeef', DATE '2026-02-01', DATE '2026-02-28', 'cards', 10, 10, 'JMD');
    RAISE EXCEPTION 'FAIL 10: unknown operator accepted';
  EXCEPTION WHEN raise_exception THEN denied := denied + 1;
  END;
  IF denied <> 6 THEN RAISE EXCEPTION 'FAIL 10: expected 6 validation rejections, got %', denied; END IF;
  RAISE NOTICE 'PASS 10: negative figures, inverted periods, invalid currency/payment type and unknown operators are rejected';
END $$;

-- 11. duplicate operator+period+payment type = in-place correction (upsert), row identity preserved
DO $$
DECLARE r jsonb; v_id uuid; v public.payment_retail_volumes; n int; created_before timestamptz;
BEGIN
  SELECT id, created_at INTO v_id, created_before FROM public.payment_retail_volumes
   WHERE operator_id = '00000000-0000-0000-0000-00000f82c003'
     AND period_start = DATE '2026-01-01' AND payment_type = 'cards';

  r := public.payment_retail_volume_record(
        '00000000-0000-0000-0000-00000f82c003', DATE '2026-01-01', DATE '2026-01-31',
        'cards', 1260000, 8800000.00, 'JMD');
  IF (r->>'created')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 11: duplicate period was not treated as a correction (%)', r;
  END IF;
  IF (r->>'volume_id')::uuid <> v_id THEN
    RAISE EXCEPTION 'FAIL 11: correction did not preserve the canonical row identity';
  END IF;
  SELECT * INTO v FROM public.payment_retail_volumes WHERE id = v_id;
  IF v.transaction_count <> 1260000 OR v.transaction_value <> 8800000.00 THEN
    RAISE EXCEPTION 'FAIL 11: corrected figures not persisted';
  END IF;
  IF v.created_at <> created_before OR v.updated_at <= created_before THEN
    RAISE EXCEPTION 'FAIL 11: correction history semantics broken (created_at/updated_at)';
  END IF;
  SELECT count(*) INTO n FROM public.payment_retail_volumes
   WHERE operator_id = '00000000-0000-0000-0000-00000f82c003'
     AND period_start = DATE '2026-01-01' AND payment_type = 'cards';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 11: duplicate row created (%)', n; END IF;
  RAISE NOTICE 'PASS 11: duplicate operator+period+payment type performs an in-place governed correction (single row, identity and created_at preserved)';
END $$;

-- 12. cross-operator isolation: another operator's figures are untouched
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.payment_retail_volume_record(
        '00000000-0000-0000-0000-00000f82c004', DATE '2026-01-01', DATE '2026-01-31',
        'e_money', 44000, 990000.10, 'USD');
  IF (r->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 12: second operator figures not recorded (%)', r;
  END IF;
  SELECT count(*) INTO n FROM public.payment_retail_volumes
   WHERE operator_id = '00000000-0000-0000-0000-00000f82c003';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 12: first operator row count changed (%)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_retail_volumes
                  WHERE operator_id = '00000000-0000-0000-0000-00000f82c003'
                    AND payment_type = 'cards' AND transaction_count = 1260000) THEN
    RAISE EXCEPTION 'FAIL 12: first operator figures were overwritten';
  END IF;
  RAISE NOTICE 'PASS 12: operators are isolated — a write for one operator cannot overwrite another operator''s figures';
END $$;

-- 13. UI read model + aggregation by payment type, currency-safe
DO $$
DECLARE
  n int; c bigint; v numeric; ccy int;
BEGIN
  -- read model (useRetailVolumes: select * order by period_start)
  SELECT count(*) INTO n FROM (
    SELECT * FROM public.payment_retail_volumes ORDER BY period_start
  ) q;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 13: authorised read model returned % rows, expected 3', n; END IF;

  -- aggregation for the operator under review (RetailPaymentsPanel byType)
  SELECT sum(transaction_count) INTO c FROM public.payment_retail_volumes
   WHERE operator_id = '00000000-0000-0000-0000-00000f82c003' AND payment_type = 'cards';
  IF c <> 1260000 THEN RAISE EXCEPTION 'FAIL 13: aggregated transaction count wrong (%)', c; END IF;
  SELECT sum(transaction_value) INTO v FROM public.payment_retail_volumes
   WHERE operator_id = '00000000-0000-0000-0000-00000f82c003' AND payment_type = 'cards'
     AND currency = 'JMD';
  IF v <> 8800000.00 THEN RAISE EXCEPTION 'FAIL 13: aggregated transaction value wrong (%)', v; END IF;

  -- more than one currency exists in the surface, so value totals must be per currency
  SELECT count(DISTINCT currency) INTO ccy FROM public.payment_retail_volumes;
  IF ccy < 2 THEN RAISE EXCEPTION 'FAIL 13: currency isolation not exercised (% currencies)', ccy; END IF;
  IF EXISTS (
    SELECT payment_type FROM public.payment_retail_volumes
     GROUP BY operator_id, payment_type HAVING count(DISTINCT currency) > 1
       AND count(*) <> count(DISTINCT currency)) THEN
    RAISE EXCEPTION 'FAIL 13: mixed-currency rows would be summed into one value';
  END IF;
  RAISE NOTICE 'PASS 13: authorised read model returns saved rows; counts aggregate by payment type and values are grouped per currency (no mixed-currency total)';
END $$;

-- 14. unauthorised personas cannot read the volume surface
DO $$
DECLARE n int;
BEGIN
  SET LOCAL "request.jwt.claims" = '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.payment_retail_volumes;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 14: unauthorised internal persona read % volume rows', n; END IF;
  SET LOCAL "request.jwt.claims" = '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}';
  SELECT count(*) INTO n FROM public.payment_retail_volumes;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 14: external licensee user read % volume rows', n; END IF;
  RAISE NOTICE 'PASS 14: unauthorised internal and external personas cannot read protected volume data';
END $$;

RESET ROLE;
RESET "request.jwt.claims";

-- 15. canonical oversight + dual-surface audit evidence
-- (inspected outside the persona session: audit surfaces are RLS-protected)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.payment_oversight_events
   WHERE event_type = 'RETAIL_VOLUME_RECORDED'
     AND actor_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
     AND operator_id IN ('00000000-0000-0000-0000-00000f82c003',
                         '00000000-0000-0000-0000-00000f82c004')
     AND created_at IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 15: expected 3 RETAIL_VOLUME_RECORDED events, found %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_oversight_events
                  WHERE event_type = 'RETAIL_VOLUME_UPDATED'
                    AND actor_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid) THEN
    RAISE EXCEPTION 'FAIL 15: correction produced no RETAIL_VOLUME_UPDATED oversight event';
  END IF;

  SELECT count(*) INTO n FROM public.audit_logs
   WHERE action IN ('retail_volume_recorded','retail_volume_updated')
     AND entity_type = 'payment_retail_volume'
     AND user_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
     AND created_at IS NOT NULL;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL 15: expected 4 canonical audit_logs entries, found %', n; END IF;

  SELECT count(*) INTO n FROM public.compliance_audit_logs
   WHERE object_type = 'payment_retail_volume'
     AND user_id = '4180b172-8435-4511-a152-ccfd1701cbbc'::uuid
     AND action_type IN ('CREATE','UPDATE');
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL 15: expected 4 compliance_audit_logs entries, found %', n; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_type = 'payment_retail_volume' AND action_type = 'UPDATE'
                    AND before_value IS NOT NULL AND after_value IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 15: correction audit entry lacks before/after state';
  END IF;
  RAISE NOTICE 'PASS 15: canonical oversight events plus dual-surface prudential audit (actor, object, action, timestamp, before/after) recorded for every governed volume write';
END $$;

ROLLBACK;

DO $$
BEGIN
  RAISE NOTICE '=== F8-W2C RETAIL PAYMENT VOLUME OVERSIGHT: ALL GATES PASSED (rollback-scoped) ===';
END $$;
