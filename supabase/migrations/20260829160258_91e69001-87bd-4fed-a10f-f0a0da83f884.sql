-- ---------------------------------------------------------------------------
-- Who may see a payment's financial detail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_can_view_payment(_uid uuid, _payment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payments p
     WHERE p.id = _payment_id
       AND (
         public.is_internal_staff_user(_uid)
         OR p.user_id = _uid
         OR (p.application_id IS NOT NULL
             AND public.fee_can_view_application_finance(_uid, p.application_id))
         OR public.external_can_access_payment(_uid, _payment_id, 'can_view_status')
       )
  )
$$;

REVOKE ALL ON FUNCTION public.fee_can_view_payment(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_can_view_payment(uuid,uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Receipt issuance becomes server-authoritative and idempotent.
-- Every figure is read from the settled payment and the assessment of record;
-- nothing is taken from the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_receipt_issue(_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record;
  v_id uuid;
  v_no text;
  v_inv text;
  v_name text;
  v_email text;
  v_breakdown jsonb;
  v_aid uuid;
BEGIN
  IF NOT public.fee_can_view_payment(v_uid, _payment_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'You do not have access to this payment.';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- a receipt evidences money actually received
  IF COALESCE(v_pay.status,'') NOT IN ('success','completed','paid','verified') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_SETTLED' USING ERRCODE = '22023',
      DETAIL = 'A receipt can only be issued for a settled payment.';
  END IF;

  SELECT id, receipt_number, invoice_number INTO v_id, v_no, v_inv
    FROM public.payment_receipts
   WHERE payment_id = _payment_id AND voided_at IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'receipt_id', v_id,
      'receipt_number', v_no, 'invoice_number', v_inv, 'issued', false);
  END IF;

  SELECT COALESCE(NULLIF(btrim(pr.full_name),''), v_pay.payer_name, 'Payer'),
         COALESCE(NULLIF(btrim(pr.email),''), v_pay.payer_email)
    INTO v_name, v_email
    FROM public.profiles pr WHERE pr.id = v_pay.user_id;
  v_name := COALESCE(v_name, 'Payer');

  -- the breakdown is the assessed itemisation of record, never a client figure
  SELECT a.id INTO v_aid
    FROM public.fee_assessments a
   WHERE a.application_id = v_pay.application_id AND a.status <> 'VOID'
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'description', l.description,
           'fee_type_code', l.fee_type_code,
           'amount', l.amount,
           'currency', l.currency) ORDER BY l.line_no), '[]'::jsonb)
    INTO v_breakdown
    FROM public.fee_assessment_lines l
   WHERE l.assessment_id = v_aid;

  INSERT INTO public.payment_receipts(
    payment_id, application_id, issued_to_name, issued_to_email,
    amount, currency, subtotal, tax_amount, total_amount, fee_breakdown,
    payment_method, payment_reference, payment_channel, paid_at,
    issued_by, snapshot)
  VALUES (
    _payment_id, v_pay.application_id, v_name, v_email,
    ROUND(COALESCE(v_pay.amount,0),2), COALESCE(v_pay.currency,'USD'),
    ROUND(COALESCE(v_pay.amount,0),2), 0, ROUND(COALESCE(v_pay.amount,0),2),
    COALESCE(v_breakdown,'[]'::jsonb),
    v_pay.payment_method, COALESCE(v_pay.transaction_ref, v_pay.receipt_number),
    v_pay.payment_channel, COALESCE(v_pay.paid_at, v_pay.updated_at, now()),
    v_uid,
    jsonb_build_object('assessment_id', v_aid, 'payment_status', v_pay.status,
                       'issued_source', 'SERVER'))
  RETURNING id, receipt_number, invoice_number INTO v_id, v_no, v_inv;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'payment.receipt.issued', 'payment_receipt', v_id,
          jsonb_build_object('payment_id', _payment_id, 'receipt_number', v_no,
                             'amount', ROUND(COALESCE(v_pay.amount,0),2),
                             'assessment_id', v_aid));

  RETURN jsonb_build_object('ok', true, 'receipt_id', v_id,
    'receipt_number', v_no, 'invoice_number', v_inv, 'issued', true);
END $$;

REVOKE ALL ON FUNCTION public.payment_receipt_issue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_receipt_issue(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Receipts: read-only to the browser, written only through the server path
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage receipts" ON public.payment_receipts;
DROP POLICY IF EXISTS "Users read own receipts" ON public.payment_receipts;
CREATE POLICY "Payment receipts are readable by those entitled to the payment"
  ON public.payment_receipts FOR SELECT TO authenticated
  USING (public.fee_can_view_payment(auth.uid(), payment_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.payment_receipts FROM authenticated;
REVOKE ALL ON public.payment_receipts FROM anon;
GRANT SELECT ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;

-- ---------------------------------------------------------------------------
-- Remarks: confidential to the payer, the regulator and authorised entity users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view payment remarks" ON public.payment_remarks;
CREATE POLICY "Payment remarks are readable by those entitled to the payment"
  ON public.payment_remarks FOR SELECT TO authenticated
  USING (public.fee_can_view_payment(auth.uid(), payment_id));

REVOKE ALL ON public.payment_remarks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_remarks TO authenticated;
GRANT ALL ON public.payment_remarks TO service_role;

-- ---------------------------------------------------------------------------
-- Attachments: scoped to the payment they evidence
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own payment attachments" ON public.payment_attachments;
DROP POLICY IF EXISTS "Users can upload payment attachments" ON public.payment_attachments;
DROP POLICY IF EXISTS "Users can delete own payment attachments" ON public.payment_attachments;

CREATE POLICY "Payment attachments are readable by those entitled to the payment"
  ON public.payment_attachments FOR SELECT TO authenticated
  USING (public.fee_can_view_payment(auth.uid(), payment_id));

CREATE POLICY "Evidence may only be attached to a payment you may see"
  ON public.payment_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid()
              AND public.fee_can_view_payment(auth.uid(), payment_id));

CREATE POLICY "An uploader or the regulator may remove an attachment"
  ON public.payment_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_internal_staff_user(auth.uid()));

REVOKE ALL ON public.payment_attachments FROM anon;
GRANT SELECT, INSERT, DELETE ON public.payment_attachments TO authenticated;
GRANT ALL ON public.payment_attachments TO service_role;