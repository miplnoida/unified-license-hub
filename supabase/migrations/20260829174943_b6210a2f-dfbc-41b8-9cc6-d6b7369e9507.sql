-- ============================================================
-- F6-X completion: regulator-scoped monetary authority, fail-closed
-- currency, independent reporting currency, governable currency master,
-- unambiguous approved-rate periods.
-- ============================================================

-- 1. Allocation reporting-currency provenance (additive) -------------
ALTER TABLE public.fee_payment_allocations
  ADD COLUMN IF NOT EXISTS reporting_amount numeric,
  ADD COLUMN IF NOT EXISTS reporting_currency text,
  ADD COLUMN IF NOT EXISTS fx_reporting_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_reporting_conversion_id uuid REFERENCES public.fx_conversions(id),
  ADD COLUMN IF NOT EXISTS monetary_config_id uuid REFERENCES public.monetary_configs(id),
  ADD COLUMN IF NOT EXISTS regulator_id uuid;

-- 2. Regulator resolution for a financial event ----------------------
CREATE OR REPLACE FUNCTION public.fee_event_regulator(_application_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.regulator_id
    FROM public.applications a
   WHERE a.id = _application_id
$$;

REVOKE ALL ON FUNCTION public.fee_event_regulator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fee_event_regulator(uuid) TO authenticated, service_role;

-- 3. Governed provisioning of a monetary configuration --------------
--    No currency is ever invented: base and reporting currency must be
--    supplied and must exist as active currency-master rows.
CREATE OR REPLACE FUNCTION public.monetary_config_provision(
  _payload jsonb,
  _regulator_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_base text := upper(NULLIF(btrim(COALESCE(_payload->>'base_currency','')),''));
  v_rep  text := upper(NULLIF(btrim(COALESCE(_payload->>'reporting_currency','')),''));
  v_id uuid;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'settings','edit')) THEN
    RAISE EXCEPTION 'FX_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_base IS NULL OR v_rep IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_CONFIGURATION_REQUIRED' USING ERRCODE = '22023',
      DETAIL = 'Base and reporting currency must be supplied explicitly; no default is assumed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_base AND is_active)
     OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_rep AND is_active) THEN
    RAISE EXCEPTION 'FX_CURRENCY_UNSUPPORTED' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.monetary_configs
              WHERE regulator_id IS NOT DISTINCT FROM _regulator_id AND is_active) THEN
    RETURN public.monetary_config_save(_payload, _regulator_id, COALESCE(_reason,'Configuration updated'));
  END IF;

  INSERT INTO public.monetary_configs(
    regulator_id, base_currency, reporting_currency,
    supported_transaction_currencies, accepted_payment_currencies, settlement_currencies,
    cross_currency_settlement_allowed, cross_currency_refund_allowed,
    fx_resolution_policy, fx_source_policy, rounding_policy, decimal_precision,
    payment_fx_date_policy, refund_fx_date_policy, backdating_requires_authority,
    is_active, notes, created_by, updated_by)
  VALUES (
    _regulator_id, v_base, v_rep,
    COALESCE((SELECT array_agg(upper(x)) FROM jsonb_array_elements_text(_payload->'supported_transaction_currencies') t(x)), ARRAY[v_base]),
    COALESCE((SELECT array_agg(upper(x)) FROM jsonb_array_elements_text(_payload->'accepted_payment_currencies') t(x)), ARRAY[v_base]),
    COALESCE((SELECT array_agg(upper(x)) FROM jsonb_array_elements_text(_payload->'settlement_currencies') t(x)), ARRAY[v_base]),
    COALESCE((_payload->>'cross_currency_settlement_allowed')::boolean, false),
    COALESCE((_payload->>'cross_currency_refund_allowed')::boolean, false),
    COALESCE(NULLIF(_payload->>'fx_resolution_policy',''),'LAST_APPROVED_EFFECTIVE_RATE'),
    COALESCE(NULLIF(_payload->>'fx_source_policy',''),'REGULATOR_MAINTAINED'),
    COALESCE(NULLIF(_payload->>'rounding_policy',''),'HALF_UP'),
    COALESCE((_payload->>'decimal_precision')::smallint,
             (SELECT decimal_precision FROM public.currencies WHERE code = v_base)),
    COALESCE(NULLIF(_payload->>'payment_fx_date_policy',''),'PAYMENT_DATE'),
    COALESCE(NULLIF(_payload->>'refund_fx_date_policy',''),'ORIGINAL_PAYMENT_DATE'),
    COALESCE((_payload->>'backdating_requires_authority')::boolean, true),
    true, NULLIF(btrim(COALESCE(_payload->>'notes','')),''), v_uid, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'monetary.config.provisioned', 'monetary_config', v_id,
          jsonb_build_object('regulator_id', _regulator_id, 'base_currency', v_base,
                             'reporting_currency', v_rep, 'reason', btrim(COALESCE(_reason,''))));
  RETURN jsonb_build_object('ok', true, 'monetary_config_id', v_id, 'created', true);
END
$$;

REVOKE ALL ON FUNCTION public.monetary_config_provision(jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monetary_config_provision(jsonb, uuid, text) TO authenticated, service_role;

-- 4. Governable currency master -------------------------------------
CREATE OR REPLACE FUNCTION public.currency_master_save(
  _code text,
  _name text DEFAULT NULL,
  _display_symbol text DEFAULT NULL,
  _decimal_precision integer DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(NULLIF(btrim(COALESCE(_code,'')),''));
  v_old public.currencies;
  v_created boolean := false;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'settings','edit')) THEN
    RAISE EXCEPTION 'FX_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_code IS NULL OR v_code !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'CURRENCY_CODE_INVALID' USING ERRCODE = '22023',
      DETAIL = 'A three-letter ISO 4217 alphabetic code is required.';
  END IF;
  SELECT * INTO v_old FROM public.currencies WHERE code = v_code FOR UPDATE;

  IF v_old.code IS NULL THEN
    IF NULLIF(btrim(COALESCE(_name,'')),'') IS NULL THEN
      RAISE EXCEPTION 'CURRENCY_NAME_REQUIRED' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.currencies(code, name, display_symbol, decimal_precision, is_active)
    VALUES (v_code, btrim(_name), NULLIF(btrim(COALESCE(_display_symbol,'')),''),
            COALESCE(_decimal_precision, 2)::smallint, COALESCE(_is_active, true));
    v_created := true;
  ELSE
    IF _is_active IS FALSE AND EXISTS (
      SELECT 1 FROM public.monetary_configs
       WHERE is_active AND (base_currency = v_code OR reporting_currency = v_code)
    ) THEN
      RAISE EXCEPTION 'CURRENCY_IN_USE' USING ERRCODE = '22023',
        DETAIL = 'This currency is an active base or reporting currency and cannot be deactivated.';
    END IF;
    UPDATE public.currencies SET
      name = COALESCE(NULLIF(btrim(COALESCE(_name,'')),''), name),
      display_symbol = COALESCE(NULLIF(btrim(COALESCE(_display_symbol,'')),''), display_symbol),
      decimal_precision = COALESCE(_decimal_precision, decimal_precision)::smallint,
      is_active = COALESCE(_is_active, is_active),
      updated_at = now()
     WHERE code = v_code;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, CASE WHEN v_created THEN 'currency.master.created' ELSE 'currency.master.updated' END,
          'currency', NULL,
          CASE WHEN v_old.code IS NULL THEN NULL ELSE to_jsonb(v_old) END,
          jsonb_build_object('code', v_code, 'name', _name, 'symbol', _display_symbol,
                             'decimal_precision', _decimal_precision, 'is_active', _is_active,
                             'reason', btrim(COALESCE(_reason,''))));
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'created', v_created);
END
$$;

REVOKE ALL ON FUNCTION public.currency_master_save(text, text, text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.currency_master_save(text, text, text, integer, boolean, text) TO authenticated, service_role;

-- Financially referenced currencies are never destructively removed.
CREATE OR REPLACE FUNCTION public.currencies_protect_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.monetary_configs
              WHERE base_currency = OLD.code OR reporting_currency = OLD.code
                 OR OLD.code = ANY (COALESCE(supported_transaction_currencies,'{}'))
                 OR OLD.code = ANY (COALESCE(accepted_payment_currencies,'{}'))
                 OR OLD.code = ANY (COALESCE(settlement_currencies,'{}')))
     OR EXISTS (SELECT 1 FROM public.fx_rates WHERE from_currency = OLD.code OR to_currency = OLD.code)
     OR EXISTS (SELECT 1 FROM public.fx_conversions WHERE source_currency = OLD.code OR target_currency = OLD.code)
     OR EXISTS (SELECT 1 FROM public.payments WHERE upper(currency) = OLD.code)
     OR EXISTS (SELECT 1 FROM public.fee_assessments WHERE upper(currency) = OLD.code)
     OR EXISTS (SELECT 1 FROM public.fee_payment_allocations WHERE upper(currency) = OLD.code)
  THEN
    RAISE EXCEPTION 'CURRENCY_IN_USE' USING ERRCODE = '22023',
      DETAIL = format('Currency %s is referenced financially and cannot be deleted; deactivate it instead.', OLD.code);
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS currencies_protect_delete ON public.currencies;
CREATE TRIGGER currencies_protect_delete
  BEFORE DELETE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.currencies_protect_delete();

REVOKE ALL ON FUNCTION public.currencies_protect_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.currencies_protect_delete() FROM authenticated;

-- 5. Approved-rate period disjointness ------------------------------
CREATE OR REPLACE FUNCTION public.fx_rates_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conflict uuid;
BEGIN
  IF NEW.status <> 'APPROVED' THEN RETURN NEW; END IF;
  SELECT f.id INTO v_conflict
    FROM public.fx_rates f
   WHERE f.id <> NEW.id
     AND f.status = 'APPROVED'
     AND f.regulator_id IS NOT DISTINCT FROM NEW.regulator_id
     AND f.from_currency = NEW.from_currency
     AND f.to_currency = NEW.to_currency
     AND COALESCE(f.rate_type,'MID') = COALESCE(NEW.rate_type,'MID')
     AND daterange(f.effective_from, f.effective_to, '[]')
         && daterange(NEW.effective_from, NEW.effective_to, '[]')
   LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'FX_RATE_PERIOD_OVERLAP' USING ERRCODE = '23514',
      DETAIL = format('An approved %s/%s rate already covers this period (%s).',
                      NEW.from_currency, NEW.to_currency, v_conflict);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS fx_rates_no_overlap ON public.fx_rates;
CREATE TRIGGER fx_rates_no_overlap
  AFTER INSERT OR UPDATE ON public.fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.fx_rates_no_overlap();

REVOKE ALL ON FUNCTION public.fx_rates_no_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fx_rates_no_overlap() FROM authenticated;

-- 6. Settlement: regulator-scoped, fail-closed currency, booked
--    base AND reporting provenance.
CREATE OR REPLACE FUNCTION public.fee_payment_settlement_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  c public.monetary_configs;
  v_reg uuid;
  v_out numeric := 0;
  v_alloc numeric := 0;
  v_ledger uuid;
  v_pay_ccy text;
  v_amount numeric;
  v_fx_date date;
  v_conv jsonb;
  v_conv_id uuid;
  v_applied numeric;
  v_base jsonb;
  v_base_amount numeric;
  v_rep jsonb;
  v_rep_amount numeric;
  v_rep_conv_id uuid;
  v_rep_rate numeric;
  v_reason_code text;
BEGIN
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','success','paid') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) IN ('completed','success','paid') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.fee_ledger_entries
              WHERE payment_id = NEW.id AND entry_type = 'PAYMENT') THEN RETURN NEW; END IF;

  -- A settled payment without an authoritative currency is never interpreted.
  v_pay_ccy := upper(NULLIF(btrim(COALESCE(NEW.currency,'')),''));
  IF v_pay_ccy IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_MISSING' USING ERRCODE = '22023',
      DETAIL = 'A settled payment must carry its own currency; base currency is never assumed.';
  END IF;

  -- Monetary authority is the regulator that owns the transaction.
  v_reg := public.fee_event_regulator(NEW.application_id);
  c := public.monetary_config_resolve(v_reg);
  v_amount := ROUND(COALESCE(NEW.amount,0),2);

  INSERT INTO public.fee_ledger_entries(application_id, payment_id, entry_type, amount, currency,
                                        external_reference, reason, metadata, created_by)
  VALUES (NEW.application_id, NEW.id, 'PAYMENT', v_amount, v_pay_ccy,
          NEW.transaction_ref, 'Cash received',
          jsonb_build_object('channel', NEW.payment_channel, 'method', NEW.payment_method,
                             'regulator_id', v_reg, 'monetary_config_id', c.id), NEW.user_id);

  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO a FROM public.fee_assessments
   WHERE application_id = NEW.application_id AND status <> 'VOID'
   ORDER BY assessed_at DESC LIMIT 1 FOR UPDATE;
  IF a.id IS NULL THEN RETURN NEW; END IF;

  v_fx_date := CASE c.payment_fx_date_policy
                 WHEN 'PAYMENT_DATE' THEN COALESCE(NEW.payment_date, NEW.paid_at::date, CURRENT_DATE)
                 WHEN 'VERIFICATION_DATE' THEN COALESCE(NEW.verified_at::date, CURRENT_DATE)
                 ELSE COALESCE(NEW.paid_at::date, NEW.payment_date, CURRENT_DATE)
               END;

  v_applied := v_amount;
  v_conv := NULL;

  IF v_pay_ccy <> upper(COALESCE(a.currency, v_pay_ccy)) THEN
    IF NOT c.cross_currency_settlement_allowed THEN
      v_reason_code := 'CROSS_CURRENCY_DISABLED';
    ELSIF NOT (v_pay_ccy = ANY (c.accepted_payment_currencies)) THEN
      v_reason_code := 'CURRENCY_NOT_ACCEPTED';
    ELSE
      BEGIN
        v_conv := public.fx_convert(v_amount, v_pay_ccy, upper(a.currency), v_fx_date, v_reg, NULL);
        v_applied := (v_conv->>'target_amount')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_reason_code := 'FX_RATE_UNAVAILABLE';
      END;
    END IF;

    IF v_reason_code IS NOT NULL THEN
      INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                            amount, currency, reason, metadata, created_by)
      VALUES (NULL, NEW.application_id, NEW.id, 'CREDIT', v_amount, v_pay_ccy,
              'Unallocated: payment currency differs from assessed currency',
              jsonb_build_object('reason_code', v_reason_code,
                                 'assessment_currency', a.currency,
                                 'regulator_id', v_reg,
                                 'fx_date', v_fx_date), NEW.user_id);
      RETURN NEW;
    END IF;
  END IF;

  v_out := public.fee_assessment_outstanding(a.id);
  v_alloc := LEAST(v_applied, v_out);

  IF v_alloc > 0 THEN
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                          amount, currency, external_reference, reason, metadata, created_by)
    VALUES (a.id, NEW.application_id, NEW.id, 'ALLOCATION', -v_alloc, a.currency,
            NEW.transaction_ref, 'Payment allocated to assessment',
            CASE WHEN v_conv IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fx', v_conv) END,
            NEW.user_id)
    RETURNING id INTO v_ledger;

    IF v_conv IS NOT NULL THEN
      v_conv_id := public.fx_record_conversion('SETTLEMENT','payment', NEW.id,
                     v_conv || jsonb_build_object('fx_applied_date', v_fx_date),
                     v_reg, NEW.user_id,
                     jsonb_build_object('assessment_id', a.id, 'application_id', NEW.application_id));
    END IF;

    -- Base equivalent: booked once, from the governed rate for this event.
    v_base_amount := NULL;
    IF upper(a.currency) = c.base_currency THEN
      v_base_amount := v_alloc;
    ELSE
      BEGIN
        v_base := public.fx_convert(v_alloc, upper(a.currency), c.base_currency, v_fx_date, v_reg, NULL);
        v_base_amount := (v_base->>'target_amount')::numeric;
        PERFORM public.fx_record_conversion('BASE_REPORTING','payment', NEW.id,
                  v_base || jsonb_build_object('fx_applied_date', v_fx_date),
                  v_reg, NEW.user_id,
                  jsonb_build_object('assessment_id', a.id, 'leg','BASE'));
      EXCEPTION WHEN OTHERS THEN
        v_base_amount := NULL;   -- surfaced as unconverted, never guessed
      END;
    END IF;

    -- Reporting equivalent: an independent booked leg whenever the
    -- reporting currency differs from the base currency. Single deterministic
    -- path: allocation currency -> reporting currency (no double conversion).
    v_rep_amount := NULL; v_rep_conv_id := NULL; v_rep_rate := NULL;
    IF c.reporting_currency = c.base_currency THEN
      v_rep_amount := v_base_amount;
      v_rep_rate := NULL;
    ELSIF upper(a.currency) = c.reporting_currency THEN
      v_rep_amount := v_alloc;
    ELSE
      BEGIN
        v_rep := public.fx_convert(v_alloc, upper(a.currency), c.reporting_currency, v_fx_date, v_reg, NULL);
        v_rep_amount := (v_rep->>'target_amount')::numeric;
        v_rep_rate := (v_rep->>'effective_rate')::numeric;
        v_rep_conv_id := public.fx_record_conversion('BASE_REPORTING','payment', NEW.id,
                  v_rep || jsonb_build_object('fx_applied_date', v_fx_date),
                  v_reg, NEW.user_id,
                  jsonb_build_object('assessment_id', a.id, 'leg','REPORTING'));
      EXCEPTION WHEN OTHERS THEN
        v_rep_amount := NULL;
      END;
    END IF;

    INSERT INTO public.fee_payment_allocations(payment_id, assessment_id, amount, currency,
                                               ledger_entry_id, allocated_by,
                                               source_amount, source_currency,
                                               fx_rate, fx_rate_id, fx_quote_convention,
                                               fx_effective_date, fx_conversion_id,
                                               rounding_difference, base_amount, base_currency,
                                               reporting_amount, reporting_currency,
                                               fx_reporting_rate, fx_reporting_conversion_id,
                                               monetary_config_id, regulator_id)
    VALUES (NEW.id, a.id, v_alloc, a.currency, v_ledger, NEW.user_id,
            v_amount, v_pay_ccy,
            NULLIF((v_conv->>'effective_rate')::numeric, NULL),
            NULLIF(v_conv->>'fx_rate_id','')::uuid,
            v_conv->>'quote_convention',
            CASE WHEN v_conv IS NULL THEN NULL ELSE v_fx_date END,
            v_conv_id,
            COALESCE((v_conv->>'rounding_difference')::numeric, 0),
            v_base_amount,
            CASE WHEN v_base_amount IS NULL THEN NULL ELSE c.base_currency END,
            v_rep_amount,
            CASE WHEN v_rep_amount IS NULL THEN NULL ELSE c.reporting_currency END,
            v_rep_rate, v_rep_conv_id,
            c.id, v_reg);
  END IF;

  IF v_applied - v_alloc > 0 THEN
    INSERT INTO public.fee_ledger_entries(application_id, payment_id, entry_type, amount, currency,
                                          reason, metadata, created_by)
    VALUES (NEW.application_id, NEW.id, 'CREDIT', v_applied - v_alloc,
            COALESCE(a.currency, v_pay_ccy), 'Overpayment held as unallocated credit',
            jsonb_build_object('reason_code','OVERPAYMENT'), NEW.user_id);
  END IF;

  IF public.fee_assessment_outstanding(a.id) <= 0 AND a.status = 'ASSESSED' THEN
    UPDATE public.fee_assessments SET status = 'SETTLED' WHERE id = a.id;
  END IF;

  RETURN NEW;
END
$$;

-- 7. Reporting: booked reporting provenance, explicit incompleteness --
CREATE OR REPLACE FUNCTION public.fee_collected_in_reporting_currency(_regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.monetary_configs;
  v_total numeric := 0; v_unconv int := 0; v_rows int := 0;
  v_unconv_by jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.fee_can_administer(auth.uid()) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  c := public.monetary_config_resolve(_regulator_id);

  SELECT COALESCE(sum(
           CASE WHEN al.reporting_currency = c.reporting_currency THEN al.reporting_amount
                WHEN upper(al.currency) = c.reporting_currency THEN al.amount
                WHEN al.base_currency = c.reporting_currency THEN al.base_amount END),0),
         count(*) FILTER (WHERE al.reporting_currency IS DISTINCT FROM c.reporting_currency
                            AND upper(al.currency) <> c.reporting_currency
                            AND al.base_currency IS DISTINCT FROM c.reporting_currency),
         count(*)
    INTO v_total, v_unconv, v_rows
    FROM public.fee_payment_allocations al
   WHERE al.reversed_at IS NULL
     AND (_regulator_id IS NULL OR al.regulator_id IS NOT DISTINCT FROM _regulator_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('currency', x.currency, 'amount', x.amount, 'allocations', x.n)), '[]'::jsonb)
    INTO v_unconv_by
    FROM (
      SELECT upper(al.currency) AS currency, ROUND(sum(al.amount),2) AS amount, count(*) AS n
        FROM public.fee_payment_allocations al
       WHERE al.reversed_at IS NULL
         AND (_regulator_id IS NULL OR al.regulator_id IS NOT DISTINCT FROM _regulator_id)
         AND al.reporting_currency IS DISTINCT FROM c.reporting_currency
         AND upper(al.currency) <> c.reporting_currency
         AND al.base_currency IS DISTINCT FROM c.reporting_currency
       GROUP BY 1) x;

  RETURN jsonb_build_object(
    'reporting_currency', c.reporting_currency,
    'base_currency', c.base_currency,
    'booked_total', ROUND(v_total,2),
    'allocations', v_rows,
    'unconverted_allocations', v_unconv,
    'unconverted_by_currency', v_unconv_by,
    'completeness', CASE WHEN v_unconv = 0 THEN 'COMPLETE' ELSE 'INCOMPLETE' END,
    'basis', 'BOOKED_FX_PROVENANCE');
END
$$;

REVOKE ALL ON FUNCTION public.fee_collected_in_reporting_currency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fee_collected_in_reporting_currency(uuid) TO authenticated, service_role;

-- 8. Classify the install-time platform configuration row -------------
UPDATE public.monetary_configs
   SET notes = 'F6-X: migrated from configured site currency (site_settings.general.currency). '
               'Classification: MIGRATED_FROM_CONFIGURED_VALUE. Regulator confirmation outstanding (BCR).'
 WHERE regulator_id IS NULL
   AND notes LIKE 'Derived from site_settings%';
