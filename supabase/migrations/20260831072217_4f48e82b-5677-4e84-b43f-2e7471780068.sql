-- 1. Fail-closed payment currency guard (system-wide)
CREATE OR REPLACE FUNCTION public.fee_payment_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.monetary_configs;
  v text;
  v_reg uuid;
BEGIN
  v := upper(NULLIF(btrim(COALESCE(NEW.currency,'')),''));
  IF v IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_MISSING' USING ERRCODE = '22023',
      DETAIL = 'A payment must state its own currency; base currency is never assumed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v AND is_active) THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_UNKNOWN' USING ERRCODE = '22023',
      DETAIL = format('%s is not an active currency in the governed currency master.', v);
  END IF;

  v_reg := public.fee_event_regulator(NEW.application_id);
  c := public.monetary_config_resolve(v_reg);

  IF COALESCE(array_length(c.accepted_payment_currencies, 1), 0) > 0
     AND NOT (v = ANY (c.accepted_payment_currencies)) THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_NOT_ACCEPTED' USING ERRCODE = '22023',
      DETAIL = format('%s is not an accepted payment currency for this regulator (accepted: %s).',
                      v, array_to_string(c.accepted_payment_currencies, ', '));
  END IF;

  NEW.currency := v;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS fee_payment_currency_guard ON public.payments;
CREATE TRIGGER fee_payment_currency_guard
BEFORE INSERT OR UPDATE OF currency, amount ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fee_payment_currency_guard();

-- 2. One-off remediation of verification-fixture residue booked in INR.
--    Amounts are untouched; only the mis-stated currency code is corrected to
--    the configured base currency. The fee ledger append-only guard is
--    suspended for this single controlled correction.
DO $mig$
DECLARE
  v_base text;
BEGIN
  SELECT base_currency INTO v_base
    FROM public.monetary_configs
   WHERE is_active AND regulator_id IS NULL
   LIMIT 1;
  IF v_base IS NULL THEN RETURN; END IF;

  ALTER TABLE public.fee_ledger_entries DISABLE TRIGGER fee_ledger_append_only;
  ALTER TABLE public.payments DISABLE TRIGGER fee_payment_currency_guard;

  UPDATE public.fee_ledger_entries
     SET currency = v_base,
         metadata = metadata || jsonb_build_object(
           'currency_remediation',
           jsonb_build_object('from', currency, 'to', v_base,
                              'reason', 'Verification-fixture residue mis-stated in INR; corrected to configured base currency.'))
   WHERE currency = 'INR';

  UPDATE public.payments SET currency = v_base WHERE currency = 'INR';

  ALTER TABLE public.payments ENABLE TRIGGER fee_payment_currency_guard;
  ALTER TABLE public.fee_ledger_entries ENABLE TRIGGER fee_ledger_append_only;
END
$mig$;