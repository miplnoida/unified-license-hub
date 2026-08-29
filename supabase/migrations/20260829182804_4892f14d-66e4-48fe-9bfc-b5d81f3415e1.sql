-- F6-X correction: base/reporting conversion legs were recorded with a purpose
-- ('BASE_REPORTING') that the fx_conversions purpose constraint rejects, so the
-- base and reporting equivalents of every cross-currency settlement were
-- silently left unbooked. The canonical purposes 'BASE' and 'REPORTING' already
-- exist; use them, and record the regulator scope the conversion was made under.

ALTER TABLE public.fx_conversions
  ADD COLUMN IF NOT EXISTS regulator_id uuid REFERENCES public.regulators(id);

CREATE INDEX IF NOT EXISTS fx_conversions_regulator_idx
  ON public.fx_conversions (regulator_id, purpose, converted_at DESC);

CREATE OR REPLACE FUNCTION public.fx_record_conversion(_purpose text, _subject_type text, _subject_id uuid, _conv jsonb, _regulator_id uuid DEFAULT NULL::uuid, _actor uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.fx_conversions(
    purpose, subject_type, subject_id, source_amount, source_currency,
    target_amount, target_currency, rate, quote_convention, fx_rate_id, fx_rate_version,
    fx_effective_date, fx_regime, fx_source, rounding_policy, rounding_difference,
    regulator_id, created_by, metadata)
  VALUES (
    _purpose, _subject_type, _subject_id,
    (_conv->>'source_amount')::numeric, _conv->>'source_currency',
    (_conv->>'target_amount')::numeric, _conv->>'target_currency',
    COALESCE((_conv->>'rate')::numeric, 1),
    COALESCE(_conv->>'quote_convention','IDENTITY'),
    NULLIF(_conv->>'fx_rate_id','')::uuid,
    NULLIF(_conv->>'fx_rate_version','')::integer,
    COALESCE(NULLIF(_conv->>'fx_applied_date','')::date, CURRENT_DATE),
    _conv->>'fx_regime', _conv->>'fx_source', _conv->>'rounding_policy',
    COALESCE((_conv->>'rounding_difference')::numeric, 0),
    _regulator_id, _actor, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fee_payment_settlement_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        PERFORM public.fx_record_conversion('BASE','payment', NEW.id,
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
        v_rep_conv_id := public.fx_record_conversion('REPORTING','payment', NEW.id,
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
$function$;

REVOKE ALL ON FUNCTION public.fx_record_conversion(text,text,uuid,jsonb,uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fx_record_conversion(text,text,uuid,jsonb,uuid,uuid,jsonb) TO service_role;