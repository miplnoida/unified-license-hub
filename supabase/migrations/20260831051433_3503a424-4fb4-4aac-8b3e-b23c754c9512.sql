-- F8-W2C: governed retail payment volume recording

ALTER TABLE public.payment_retail_volumes
  ADD CONSTRAINT prv_period_order CHECK (period_end >= period_start),
  ADD CONSTRAINT prv_count_nonneg CHECK (transaction_count >= 0),
  ADD CONSTRAINT prv_value_nonneg CHECK (transaction_value >= 0),
  ADD CONSTRAINT prv_currency_code CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT prv_payment_type_allowed CHECK (payment_type IN
    ('cards','ach_credit','ach_debit','rtgs_transfer','e_money','remittance','cheque','other'));

CREATE OR REPLACE FUNCTION public.payment_retail_volume_record(
  _operator_id uuid,
  _period_start date,
  _period_end date,
  _payment_type text,
  _transaction_count bigint,
  _transaction_value numeric,
  _currency text DEFAULT 'JMD',
  _source text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.payment_system_operators;
  v_before jsonb;
  v_row public.payment_retail_volumes;
  v_cur text := upper(trim(COALESCE(_currency, 'JMD')));
  v_created boolean;
BEGIN
  IF NOT (public.can_act_on_payment_oversight(auth.uid(), 'create')
          OR public.can_act_on_payment_oversight(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;

  SELECT * INTO v_op FROM public.payment_system_operators WHERE id = _operator_id;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'operator_not_found'; END IF;

  IF _period_start IS NULL OR _period_end IS NULL OR _period_end < _period_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;
  IF COALESCE(_transaction_count, 0) < 0 OR COALESCE(_transaction_value, 0) < 0 THEN
    RAISE EXCEPTION 'negative_volume_not_allowed';
  END IF;
  IF v_cur !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency';
  END IF;
  IF _payment_type IS NULL OR _payment_type NOT IN
     ('cards','ach_credit','ach_debit','rtgs_transfer','e_money','remittance','cheque','other') THEN
    RAISE EXCEPTION 'invalid_payment_type';
  END IF;

  SELECT to_jsonb(r) INTO v_before
    FROM public.payment_retail_volumes r
   WHERE r.operator_id = _operator_id
     AND r.period_start = _period_start
     AND r.period_end = _period_end
     AND r.payment_type = _payment_type;

  INSERT INTO public.payment_retail_volumes (
    operator_id, period_start, period_end, payment_type,
    transaction_count, transaction_value, currency, source, created_by)
  VALUES (_operator_id, _period_start, _period_end, _payment_type,
          COALESCE(_transaction_count, 0), COALESCE(_transaction_value, 0),
          v_cur, COALESCE(_source, 'manual'), auth.uid())
  ON CONFLICT (operator_id, period_start, period_end, payment_type) DO UPDATE
    SET transaction_count = EXCLUDED.transaction_count,
        transaction_value = EXCLUDED.transaction_value,
        currency = EXCLUDED.currency,
        source = EXCLUDED.source,
        updated_at = now()
  RETURNING * INTO v_row;

  v_created := v_before IS NULL;

  INSERT INTO public.payment_oversight_events (operator_id, event_type, actor_id, metadata)
  VALUES (_operator_id,
          CASE WHEN v_created THEN 'RETAIL_VOLUME_RECORDED' ELSE 'RETAIL_VOLUME_UPDATED' END,
          auth.uid(),
          jsonb_build_object('volume_id', v_row.id, 'payment_type', _payment_type,
                             'period_start', _period_start, 'period_end', _period_end,
                             'transaction_count', v_row.transaction_count,
                             'transaction_value', v_row.transaction_value,
                             'currency', v_row.currency));

  PERFORM public.prudential_audit_event(
    CASE WHEN v_created THEN 'retail_volume_recorded' ELSE 'retail_volume_updated' END,
    'payment_retail_volume', v_row.id, v_before, to_jsonb(v_row),
    jsonb_build_object('operator_id', _operator_id, 'payment_type', _payment_type),
    NULL,
    (CASE WHEN v_created THEN 'CREATE' ELSE 'UPDATE' END)::public.compliance_audit_action);

  RETURN jsonb_build_object('ok', true, 'volume_id', v_row.id, 'created', v_created,
                            'transaction_count', v_row.transaction_count,
                            'transaction_value', v_row.transaction_value,
                            'currency', v_row.currency);
END;
$$;

REVOKE ALL ON FUNCTION public.payment_retail_volume_record(uuid, date, date, text, bigint, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_retail_volume_record(uuid, date, date, text, bigint, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_retail_volume_record(uuid, date, date, text, bigint, numeric, text, text) TO service_role;

-- writes must flow through the governed function; reads unchanged
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_retail_volumes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_retail_volumes FROM anon;