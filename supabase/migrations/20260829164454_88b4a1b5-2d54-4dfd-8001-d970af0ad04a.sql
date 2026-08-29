-- ===========================================================================
-- F6-C: receipt provenance, historical integrity and reversal semantics
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.payment_receipt_issue(_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record;
  v_asmt record;
  v_id uuid; v_no text; v_inv text; v_void timestamptz;
  v_name text; v_email text;
  v_breakdown jsonb; v_aid uuid; v_alloc numeric; v_src text;
BEGIN
  IF NOT public.fee_can_view_payment(v_uid, _payment_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'You do not have access to this payment.';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_pay.status,'') NOT IN ('success','completed','paid','verified') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_SETTLED' USING ERRCODE = '22023',
      DETAIL = 'A receipt can only be issued for a settled payment.';
  END IF;

  -- Idempotent: one receipt per payment, voided evidence included.
  SELECT id, receipt_number, invoice_number, voided_at
    INTO v_id, v_no, v_inv, v_void
    FROM public.payment_receipts
   WHERE payment_id = _payment_id
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'receipt_id', v_id,
      'receipt_number', v_no, 'invoice_number', v_inv, 'issued', false,
      'voided', v_void IS NOT NULL);
  END IF;

  -- Canonical provenance: the assessment this payment actually settled.
  SELECT a.assessment_id, a.amount, 'ALLOCATION'
    INTO v_aid, v_alloc, v_src
    FROM public.fee_payment_allocations a
   WHERE a.payment_id = _payment_id
   ORDER BY (a.reversed_at IS NULL) DESC, a.allocated_at
   LIMIT 1;

  IF v_aid IS NULL THEN
    SELECT le.assessment_id, le.amount, 'LEDGER'
      INTO v_aid, v_alloc, v_src
      FROM public.fee_ledger_entries le
     WHERE le.payment_id = _payment_id AND le.assessment_id IS NOT NULL
     ORDER BY le.created_at
     LIMIT 1;
  END IF;

  IF v_aid IS NULL THEN
    RAISE EXCEPTION 'NO_ASSESSMENT_LINEAGE' USING ERRCODE = '22023',
      DETAIL = 'This payment has no assessment or ledger lineage, so no receipt can be issued.';
  END IF;

  SELECT * INTO v_asmt FROM public.fee_assessments WHERE id = v_aid;

  SELECT COALESCE(NULLIF(btrim(pr.full_name),''), NULLIF(btrim(pr.email),''), 'Payer'),
         NULLIF(btrim(pr.email),'')
    INTO v_name, v_email
    FROM public.profiles pr WHERE pr.id = v_pay.user_id;
  v_name := COALESCE(v_name, 'Payer');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'line_no', l.line_no,
           'description', l.description, 'fee_type_code', l.fee_type_code,
           'amount', l.amount, 'currency', l.currency) ORDER BY l.line_no), '[]'::jsonb)
    INTO v_breakdown FROM public.fee_assessment_lines l WHERE l.assessment_id = v_aid;

  INSERT INTO public.payment_receipts(
    payment_id, application_id, issued_to_name, issued_to_email,
    amount, currency, subtotal, tax_amount, total_amount, fee_breakdown,
    payment_method, payment_reference, payment_channel, paid_at, issued_by, snapshot)
  VALUES (
    _payment_id, v_pay.application_id, v_name, v_email,
    ROUND(COALESCE(v_pay.amount,0),2), COALESCE(v_pay.currency,'USD'),
    ROUND(COALESCE(v_pay.amount,0),2), 0, ROUND(COALESCE(v_pay.amount,0),2),
    COALESCE(v_breakdown,'[]'::jsonb),
    v_pay.payment_method, COALESCE(v_pay.transaction_ref, v_pay.receipt_number),
    v_pay.payment_channel,
    COALESCE(v_pay.paid_at, v_pay.payment_date::timestamptz, v_pay.created_at, now()),
    v_uid,
    jsonb_build_object(
      'payment_id', _payment_id,
      'payment_status', v_pay.status,
      'payment_amount', ROUND(COALESCE(v_pay.amount,0),2),
      'payment_currency', COALESCE(v_pay.currency,'USD'),
      'payment_method', v_pay.payment_method,
      'payment_reference', COALESCE(v_pay.transaction_ref, v_pay.receipt_number),
      'assessment_id', v_aid,
      'lineage_source', v_src,
      'allocated_amount', ROUND(COALESCE(v_alloc,0),2),
      'assessment', jsonb_build_object(
        'assessment_number', v_asmt.assessment_number,
        'assessed_total', v_asmt.assessed_total,
        'currency', v_asmt.currency,
        'status_at_issue', v_asmt.status,
        'basis', v_asmt.basis,
        'resolution_source', v_asmt.resolution_source,
        'assessed_at', v_asmt.assessed_at,
        'config_snapshot', v_asmt.config_snapshot),
      'fee_lines', COALESCE(v_breakdown,'[]'::jsonb),
      'issued_source','SERVER'))
  RETURNING id, receipt_number, invoice_number INTO v_id, v_no, v_inv;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'payment.receipt.issued', 'payment_receipt', v_id,
          jsonb_build_object('payment_id', _payment_id, 'receipt_number', v_no,
                             'amount', ROUND(COALESCE(v_pay.amount,0),2),
                             'currency', COALESCE(v_pay.currency,'USD'),
                             'assessment_id', v_aid,
                             'lineage_source', v_src));

  RETURN jsonb_build_object('ok', true, 'receipt_id', v_id,
    'receipt_number', v_no, 'invoice_number', v_inv, 'issued', true,
    'assessment_id', v_aid, 'lineage_source', v_src, 'voided', false);
END $function$;

REVOKE ALL ON FUNCTION public.payment_receipt_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_receipt_issue(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.payment_receipt_issue(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reversal: preserve the receipt as evidence, mark its settlement void.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_payment_reverse(_payment_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); p record; al record; v_ledger uuid; v_count int := 0;
  r record; v_receipts int := 0;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower(COALESCE(p.status,'')) = 'reversed' THEN
    RAISE EXCEPTION 'ALREADY_REVERSED' USING ERRCODE='22023';
  END IF;

  FOR al IN SELECT * FROM public.fee_payment_allocations
             WHERE payment_id = _payment_id AND reversed_at IS NULL FOR UPDATE LOOP
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                          amount, currency, reversal_of, reason, created_by)
    VALUES (al.assessment_id, p.application_id, p.id, 'REVERSAL', al.amount, al.currency,
            al.ledger_entry_id, btrim(_reason), v_uid)
    RETURNING id INTO v_ledger;

    UPDATE public.fee_payment_allocations
       SET reversed_at = now(), reversal_reason = btrim(_reason), reversal_ledger_entry_id = v_ledger
     WHERE id = al.id;

    UPDATE public.fee_assessments SET status='ASSESSED'
     WHERE id = al.assessment_id AND status IN ('SETTLED','WAIVED');
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.payments SET status = 'reversed' WHERE id = _payment_id;

  -- The receipt is historical evidence: never deleted, never rewritten. Its
  -- settlement standing is voided under an audited, reasoned action.
  FOR r IN SELECT id, receipt_number, amount, currency FROM public.payment_receipts
            WHERE payment_id = _payment_id AND voided_at IS NULL FOR UPDATE LOOP
    UPDATE public.payment_receipts
       SET voided_at = now(),
           voided_reason = 'Payment reversed: '||btrim(_reason)
     WHERE id = r.id;
    v_receipts := v_receipts + 1;
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (v_uid, 'payment.receipt.voided', 'payment_receipt', r.id,
            jsonb_build_object('receipt_number', r.receipt_number,
                               'amount', r.amount, 'currency', r.currency),
            jsonb_build_object('voided', true, 'reason', btrim(_reason),
                               'payment_id', _payment_id));
  END LOOP;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fee.payment.reversed', 'payment', _payment_id,
          jsonb_build_object('status', p.status, 'amount', p.amount),
          jsonb_build_object('status','reversed','allocations_reversed', v_count,
                             'receipts_voided', v_receipts, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'payment_id', _payment_id,
    'allocations_reversed', v_count, 'receipts_voided', v_receipts);
END $function$;

REVOKE ALL ON FUNCTION public.fee_payment_reverse(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fee_payment_reverse(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fee_payment_reverse(uuid, text) TO authenticated, service_role;