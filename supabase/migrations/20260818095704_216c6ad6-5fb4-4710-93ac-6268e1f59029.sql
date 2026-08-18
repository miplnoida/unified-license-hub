-- Issue (or fetch) the invoice for a completed payment. Idempotent.
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

  SELECT COALESCE(NULLIF(TRIM(COALESCE(pr.first_name,'') || ' ' || COALESCE(pr.last_name,'')), ''), pr.email, 'Applicant'),
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
GRANT EXECUTE ON FUNCTION public.issue_payment_invoice(uuid, jsonb, numeric) TO authenticated, service_role;

-- Applicant declares an offline payment awaiting verification
CREATE OR REPLACE FUNCTION public.submit_offline_payment(
  _application_id uuid,
  _amount numeric,
  _offline_method text,
  _payment_date date,
  _reference text,
  _bank_name text DEFAULT NULL,
  _remarks text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_existing record;
  v_pay record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','UNAUTHORIZED','message','You must be signed in.');
  END IF;
  IF _offline_method IS NULL OR _offline_method NOT IN ('bank_transfer','cheque','cash','demand_draft','manager_cheque') THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Select a valid offline payment method.');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Enter the amount paid.');
  END IF;
  IF _reference IS NULL OR length(TRIM(_reference)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Enter the payment reference (min 3 characters).');
  END IF;
  IF _payment_date IS NULL OR _payment_date > (now()::date) THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Enter a valid payment date.');
  END IF;

  SELECT id, applicant_id INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','NOT_FOUND','message','Application not found.');
  END IF;
  IF v_app.applicant_id <> v_uid
     AND NOT public.has_role(v_uid,'super_admin'::app_role)
     AND NOT public.has_role(v_uid,'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'code','FORBIDDEN','message','You do not have access to this application.');
  END IF;

  SELECT id, status, verification_status INTO v_existing
    FROM public.payments
   WHERE application_id = _application_id
     AND (lower(status) IN ('completed','success','paid')
          OR (payment_channel = 'offline' AND verification_status = 'pending'))
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','ALREADY_EXISTS','payment_id', v_existing.id,
      'message','A payment already exists for this application.');
  END IF;

  INSERT INTO public.payments (
    user_id, application_id, amount, status, payment_method, payment_channel,
    offline_method, payment_date, bank_name, transaction_ref,
    verification_status, verification_remarks
  ) VALUES (
    v_uid, _application_id, _amount, 'pending_verification', 'offline', 'offline',
    _offline_method, _payment_date, NULLIF(TRIM(COALESCE(_bank_name,'')),''), TRIM(_reference),
    'pending', NULLIF(TRIM(COALESCE(_remarks,'')),'')
  ) RETURNING id, status, verification_status INTO v_pay;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_pay.id, 'status', v_pay.status,
    'verification_status', v_pay.verification_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_offline_payment(uuid, numeric, text, date, text, text, text) TO authenticated, service_role;

-- Regulator verifies or rejects a declared offline payment
CREATE OR REPLACE FUNCTION public.verify_offline_payment(
  _payment_id uuid,
  _approve boolean,
  _remarks text DEFAULT NULL,
  _fee_breakdown jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record;
  v_invoice jsonb := NULL;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'code','FORBIDDEN','message','Only regulators can verify offline payments.');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','NOT_FOUND','message','Payment not found.');
  END IF;
  IF v_pay.payment_channel <> 'offline' THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Only offline payments require verification.');
  END IF;
  IF v_pay.verification_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code','ALREADY_REVIEWED',
      'verification_status', v_pay.verification_status, 'message','This payment has already been reviewed.');
  END IF;
  IF NOT _approve AND (_remarks IS NULL OR length(TRIM(_remarks)) < 10) THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Provide a rejection reason (min 10 characters).');
  END IF;

  UPDATE public.payments
     SET status = CASE WHEN _approve THEN 'completed' ELSE 'rejected' END,
         verification_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         paid_at = CASE WHEN _approve THEN COALESCE(paid_at, now()) ELSE paid_at END,
         verified_by = v_uid,
         verified_at = now(),
         verification_remarks = NULLIF(TRIM(COALESCE(_remarks,'')),'')
   WHERE id = _payment_id
   RETURNING * INTO v_pay;

  IF _approve THEN
    v_invoice := public.issue_payment_invoice(_payment_id, _fee_breakdown, 0);
  END IF;

  RETURN jsonb_build_object('ok', true, 'payment_id', _payment_id,
    'status', v_pay.status, 'verification_status', v_pay.verification_status, 'invoice', v_invoice);
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_offline_payment(uuid, boolean, text, jsonb) TO authenticated, service_role;