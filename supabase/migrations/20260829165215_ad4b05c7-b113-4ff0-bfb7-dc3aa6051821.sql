CREATE OR REPLACE FUNCTION public.issue_payment_invoice(
  _payment_id uuid,
  _fee_breakdown jsonb DEFAULT NULL::jsonb,
  _tax_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record;
  v_rec record;
  v_issue jsonb;
  v_created boolean := false;
BEGIN
  -- The caller-supplied itemisation and tax figures are deliberately ignored:
  -- a receipt is only ever stated by the server from the assessment the
  -- payment actually settled. The parameters remain for call compatibility.
  PERFORM _fee_breakdown, _tax_amount;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Payment not found.');
  END IF;

  IF v_uid IS NULL OR NOT public.fee_can_view_payment(v_uid, _payment_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'You do not have access to this payment.');
  END IF;

  IF lower(COALESCE(v_pay.status,'')) NOT IN ('completed','success','paid','verified') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PAID', 'message', 'Invoice is available once the payment is confirmed.');
  END IF;

  BEGIN
    v_issue := public.payment_receipt_issue(_payment_id);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_RECEIPT',
      'message', 'A receipt of record could not be established for this payment.');
  END;

  v_created := COALESCE((v_issue->>'issued')::boolean, false);

  SELECT * INTO v_rec FROM public.payment_receipts WHERE id = (v_issue->>'receipt_id')::uuid;
  IF v_rec.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_RECEIPT',
      'message', 'A receipt of record could not be established for this payment.');
  END IF;

  IF v_rec.invoice_number IS NULL THEN
    UPDATE public.payment_receipts
       SET invoice_number = public.next_invoice_number()
     WHERE id = v_rec.id
     RETURNING * INTO v_rec;
  END IF;

  IF v_created THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
    VALUES (v_uid, 'invoice_issued', 'payment', _payment_id,
            jsonb_build_object('invoice_number', v_rec.invoice_number,
                               'receipt_number', v_rec.receipt_number,
                               'total_amount', v_rec.total_amount,
                               'assessment_id', v_rec.snapshot->>'assessment_id',
                               'application_id', v_pay.application_id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'created', v_created, 'receipt_id', v_rec.id,
    'invoice_number', v_rec.invoice_number, 'total_amount', v_rec.total_amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_payment_invoice(uuid, jsonb, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_payment_invoice(uuid, jsonb, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_payment_invoice(uuid, jsonb, numeric) TO authenticated, service_role;