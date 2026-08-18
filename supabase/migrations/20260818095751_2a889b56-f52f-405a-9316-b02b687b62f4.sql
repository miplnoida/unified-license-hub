CREATE OR REPLACE FUNCTION public.issue_payment_invoice(
  _payment_id uuid,
  _fee_breakdown jsonb DEFAULT NULL,
  _tax_amount numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record;
  v_rec record;
  v_name text;
  v_email text;
  v_lines jsonb;
  v_subtotal numeric;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Payment not found.');
  END IF;

  IF v_uid IS NULL OR (v_pay.user_id <> v_uid
      AND NOT public.has_role(v_uid,'super_admin'::app_role)
      AND NOT public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'You do not have access to this payment.');
  END IF;

  IF lower(COALESCE(v_pay.status,'')) NOT IN ('completed','success','paid') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PAID', 'message', 'Invoice is available once the payment is confirmed.');
  END IF;

  SELECT * INTO v_rec FROM public.payment_receipts WHERE payment_id = _payment_id;
  IF FOUND THEN
    IF v_rec.invoice_number IS NULL THEN
      UPDATE public.payment_receipts
         SET invoice_number = public.next_invoice_number()
       WHERE id = v_rec.id
       RETURNING * INTO v_rec;
    END IF;
    RETURN jsonb_build_object('ok', true, 'created', false, 'receipt_id', v_rec.id,
      'invoice_number', v_rec.invoice_number, 'total_amount', v_rec.total_amount);
  END IF;

  SELECT COALESCE(NULLIF(TRIM(COALESCE(pr.entity_name, '')), ''), NULLIF(TRIM(COALESCE(pr.full_name,'')),''), pr.email, 'Applicant'),
         pr.email
    INTO v_name, v_email
    FROM public.profiles pr
   WHERE pr.id = v_pay.user_id;

  v_lines := CASE
    WHEN _fee_breakdown IS NULL OR jsonb_typeof(_fee_breakdown) <> 'array' OR jsonb_array_length(_fee_breakdown) = 0
      THEN jsonb_build_array(jsonb_build_object('label','Application fee','amount', v_pay.amount))
    ELSE _fee_breakdown
  END;

  SELECT COALESCE(SUM((item->>'amount')::numeric), v_pay.amount)
    INTO v_subtotal
    FROM jsonb_array_elements(v_lines) item;

  IF v_subtotal + COALESCE(_tax_amount,0) <> v_pay.amount THEN
    v_lines := jsonb_build_array(jsonb_build_object('label','Application fee','amount', v_pay.amount));
    v_subtotal := v_pay.amount;
    _tax_amount := 0;
  END IF;

  INSERT INTO public.payment_receipts (
    payment_id, issued_to_name, issued_to_email, amount, currency, fee_breakdown,
    invoice_number, application_id, subtotal, tax_amount, total_amount,
    payment_method, payment_reference, payment_channel, paid_at, issued_by, snapshot
  ) VALUES (
    v_pay.id, COALESCE(v_name,'Applicant'), v_email, v_pay.amount, COALESCE(v_pay.currency,'USD'), v_lines,
    public.next_invoice_number(), v_pay.application_id, v_subtotal, COALESCE(_tax_amount,0),
    v_subtotal + COALESCE(_tax_amount,0),
    COALESCE(v_pay.offline_method, v_pay.payment_method), v_pay.transaction_ref, v_pay.payment_channel,
    COALESCE(v_pay.paid_at, now()), v_uid,
    jsonb_build_object('payment_status', v_pay.status, 'issued_at', now())
  )
  RETURNING * INTO v_rec;

  RETURN jsonb_build_object('ok', true, 'created', true, 'receipt_id', v_rec.id,
    'invoice_number', v_rec.invoice_number, 'total_amount', v_rec.total_amount);
END;
$$;