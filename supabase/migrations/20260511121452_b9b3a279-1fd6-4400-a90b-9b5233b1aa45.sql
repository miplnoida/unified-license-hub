DROP INDEX IF EXISTS public.idx_one_successful_payment_per_application;
DROP INDEX IF EXISTS public.unique_successful_payment_per_application;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_successful_payment_per_application
ON public.payments(application_id)
WHERE lower(status) IN ('completed', 'success', 'paid');

CREATE OR REPLACE FUNCTION public.create_or_get_application_payment(
  _application_id uuid,
  _amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_payment record;
  v_amount numeric := COALESCE(_amount, 0);
  v_txn_ref text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'action', 'block',
      'code', 'UNAUTHORIZED',
      'message', 'You must be signed in.'
    );
  END IF;

  SELECT id, applicant_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'action', 'block',
      'code', 'NOT_FOUND',
      'message', 'Application not found.'
    );
  END IF;

  IF v_app.applicant_id <> v_uid
     AND NOT public.has_role(v_uid, 'super_admin'::app_role)
     AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object(
      'action', 'block',
      'code', 'FORBIDDEN',
      'message', 'You do not have access to this application.'
    );
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at, p.created_at
    INTO v_payment
    FROM public.payments p
   WHERE p.application_id = _application_id
     AND lower(p.status) IN ('completed', 'success', 'paid')
   ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_payment.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'paid',
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'amount', v_payment.amount,
      'transaction_ref', v_payment.transaction_ref,
      'receipt_number', v_payment.receipt_number,
      'currency', v_payment.currency,
      'paid_at', v_payment.paid_at
    );
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at, p.created_at
    INTO v_payment
    FROM public.payments p
   WHERE p.application_id = _application_id
     AND lower(p.status) IN ('pending', 'processing', 'initiated')
   ORDER BY p.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_payment.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'pending',
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'amount', v_payment.amount,
      'transaction_ref', v_payment.transaction_ref,
      'receipt_number', v_payment.receipt_number,
      'currency', v_payment.currency,
      'paid_at', v_payment.paid_at
    );
  END IF;

  v_txn_ref := 'TXN-' || EXTRACT(EPOCH FROM clock_timestamp())::bigint || '-' || upper(substr(md5(random()::text), 1, 6));

  INSERT INTO public.payments (
    user_id,
    application_id,
    amount,
    status,
    payment_method,
    transaction_ref
  ) VALUES (
    v_uid,
    _application_id,
    v_amount,
    'initiated',
    'online',
    v_txn_ref
  )
  RETURNING id, status, amount, transaction_ref, receipt_number, currency, paid_at, created_at
    INTO v_payment;

  RETURN jsonb_build_object(
    'action', 'created',
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'transaction_ref', v_payment.transaction_ref,
    'receipt_number', v_payment.receipt_number,
    'currency', v_payment.currency,
    'paid_at', v_payment.paid_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_or_get_application_payment(
  _application_id uuid,
  _amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_payment record;
  v_amount numeric := COALESCE(_amount, 0);
  v_txn_ref text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'action', 'block',
      'code', 'UNAUTHORIZED',
      'message', 'You must be signed in.'
    );
  END IF;

  SELECT id, applicant_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'action', 'block',
      'code', 'NOT_FOUND',
      'message', 'Application not found.'
    );
  END IF;

  IF v_app.applicant_id <> v_uid
     AND NOT public.has_role(v_uid, 'super_admin'::app_role)
     AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object(
      'action', 'block',
      'code', 'FORBIDDEN',
      'message', 'You do not have access to this application.'
    );
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at, p.created_at
    INTO v_payment
    FROM public.payments p
   WHERE p.application_id = _application_id
     AND lower(p.status) IN ('completed', 'success', 'paid')
   ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_payment.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'paid',
      'payment_id', v_payment.id,
      'status', v_payment.status,
      'amount', v_payment.amount,
      'transaction_ref', v_payment.transaction_ref,
      'receipt_number', v_payment.receipt_number,
      'currency', v_payment.currency,
      'paid_at', v_payment.paid_at
    );
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at, p.created_at
    INTO v_payment
    FROM public.payments p
   WHERE p.application_id = _application_id
     AND lower(p.status) IN ('pending', 'processing', 'initiated')
   ORDER BY p.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_payment.id IS NULL THEN
    v_txn_ref := 'TXN-' || EXTRACT(EPOCH FROM clock_timestamp())::bigint || '-' || upper(substr(md5(random()::text), 1, 6));

    INSERT INTO public.payments (
      user_id,
      application_id,
      amount,
      status,
      payment_method,
      transaction_ref
    ) VALUES (
      v_uid,
      _application_id,
      v_amount,
      'initiated',
      'online',
      v_txn_ref
    )
    RETURNING id, status, amount, transaction_ref, receipt_number, currency, paid_at, created_at
      INTO v_payment;
  END IF;

  BEGIN
    UPDATE public.payments p
       SET status = 'completed',
           paid_at = COALESCE(p.paid_at, now()),
           amount = COALESCE(NULLIF(p.amount, 0), v_amount, p.amount)
     WHERE p.id = v_payment.id
     RETURNING p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at, p.created_at
      INTO v_payment;
  EXCEPTION WHEN unique_violation THEN
    SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at, p.created_at
      INTO v_payment
      FROM public.payments p
     WHERE p.application_id = _application_id
       AND lower(p.status) IN ('completed', 'success', 'paid')
     ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
     LIMIT 1;

    IF v_payment.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'action', 'paid',
        'payment_id', v_payment.id,
        'status', v_payment.status,
        'amount', v_payment.amount,
        'transaction_ref', v_payment.transaction_ref,
        'receipt_number', v_payment.receipt_number,
        'currency', v_payment.currency,
        'paid_at', v_payment.paid_at
      );
    END IF;

    RAISE;
  END;

  RETURN jsonb_build_object(
    'action', 'completed',
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'transaction_ref', v_payment.transaction_ref,
    'receipt_number', v_payment.receipt_number,
    'currency', v_payment.currency,
    'paid_at', v_payment.paid_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_get_application_payment(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_or_get_application_payment(uuid,numeric) TO authenticated;