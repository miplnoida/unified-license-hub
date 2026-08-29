-- =====================================================================
-- F6-B (2/2) — SERVER-AUTHORITATIVE FEE & PAYMENT ENGINE (function layer)
-- Source-parity migration: repository definitions == live definitions.
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.fee_assessment_number_seq;

-- ---------------------------------------------------------------------
-- Authority helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_can_view_application_finance(_uid uuid, _application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_internal_staff_user(_uid)
    OR EXISTS (SELECT 1 FROM public.applications a
                WHERE a.id = _application_id AND a.applicant_id = _uid)
    OR public.external_can_access_application(_uid, _application_id, 'view')
  );
$$;

CREATE OR REPLACE FUNCTION public.fee_can_administer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _uid IS NOT NULL
     AND (public.is_super_admin(_uid) OR public.has_permission(_uid,'fee_management','edit'));
$$;

-- ---------------------------------------------------------------------
-- Server-side fee resolution (the only place lines are priced)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_assessment_resolve_lines(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app record;
  v_data jsonb;
  v_pl jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_currency text := 'USD';
  v_source text := 'NONE';
  v_basis text := 'NO_FEE_RESOLVED';
  v_renewal boolean;
  v_sector uuid; v_sub uuid; v_cat uuid; v_service uuid;
  v_forms uuid[];
  v_total numeric := 0;
BEGIN
  SELECT id, data, request_kind, entity_id INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'lines','[]'::jsonb, 'currency','USD',
                              'basis','NO_FEE_RESOLVED','source','NONE');
  END IF;
  v_data := COALESCE(v_app.data, '{}'::jsonb);

  -- 1. Post-licensing matters price from the certified licence fee bindings.
  IF v_app.request_kind = 'POST_LICENSE' THEN
    v_pl := public.post_license_fee_assessment(_application_id);
    v_lines := COALESCE(v_pl->'lines', '[]'::jsonb);
    v_currency := COALESCE(v_pl->>'currency', 'JMD');
    v_basis := COALESCE(v_pl->>'basis', 'NO_FEE_RESOLVED');
    RETURN jsonb_build_object(
      'found', true,
      'source', CASE WHEN jsonb_array_length(v_lines) > 0 THEN 'LICENSE_FEE_BINDINGS' ELSE 'NONE' END,
      'basis', v_basis,
      'currency', v_currency,
      'license_id', v_pl->>'license_id',
      'service_id', NULLIF(btrim(COALESCE(v_data->>'service_id','')),''),
      'service_code', v_pl->>'service_code',
      'matter_kind', v_pl->>'matter_kind',
      'entity_id', v_app.entity_id,
      'lines', v_lines,
      'config_snapshot', jsonb_build_object('engine','license_fee_resolve','state', v_pl->>'state'));
  END IF;

  v_renewal := COALESCE(v_data->>'is_renewal','') = 'true'
               OR COALESCE(v_data->>'service_name','') = 'Renew'
               OR COALESCE(v_data->>'service','') = 'Renew';
  v_sector  := NULLIF(btrim(COALESCE(v_data->>'sector_id','')),'')::uuid;
  v_sub     := NULLIF(btrim(COALESCE(v_data->>'sub_sector_id','')),'')::uuid;
  v_cat     := NULLIF(btrim(COALESCE(v_data->>'category_id','')),'')::uuid;
  v_service := NULLIF(btrim(COALESCE(v_data->>'service_id','')),'')::uuid;

  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_forms
    FROM (
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_data->'form_template_ids') = 'array'
                                            THEN v_data->'form_template_ids' ELSE '[]'::jsonb END) AS x
      UNION
      SELECT NULLIF(btrim(COALESCE(v_data->>'form_template_id','')),'')
    ) s WHERE x IS NOT NULL AND x <> '';

  -- 2. Manually itemised fee components take precedence when present.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fee_type_code', ft.code,
           'fee_type_id', fc.fee_type_id,
           'description', COALESCE(ft.name, fc.description, 'Fee'),
           'amount', ROUND(COALESCE(fc.amount,0), 2),
           'unit_amount', ROUND(COALESCE(fc.amount,0), 2),
           'quantity', 1,
           'currency', 'USD',
           'blocking', true,
           'source', 'FEE_COMPONENTS',
           'fee_component_id', fc.id) ORDER BY fc.created_at), '[]'::jsonb)
    INTO v_lines
    FROM public.fee_components fc
    LEFT JOIN public.fee_types ft ON ft.id = fc.fee_type_id
   WHERE fc.application_id = _application_id
     AND (NOT v_renewal OR lower(COALESCE(ft.name, fc.description, '')) LIKE '%renew%');

  IF jsonb_array_length(v_lines) > 0 THEN
    v_source := 'FEE_COMPONENTS';
  ELSE
    -- 3. Otherwise resolve the configured schedule, most specific first.
    IF v_sector IS NULL THEN
      v_lines := '[]'::jsonb;
    ELSE
      WITH ranked AS (
        SELECT f.*,
               (CASE WHEN f.form_id IS NOT NULL AND f.form_id = ANY(v_forms) THEN 16 ELSE 0 END)
             + (CASE WHEN f.service_id IS NOT NULL AND f.service_id = v_service THEN 8 ELSE 0 END)
             + (CASE WHEN f.category_id IS NOT NULL AND f.category_id = v_cat THEN 4 ELSE 0 END)
             + (CASE WHEN f.sub_sector_id IS NOT NULL AND f.sub_sector_id = v_sub THEN 2 ELSE 0 END)
             + (CASE WHEN f.sector_id = v_sector THEN 1 ELSE 0 END) AS specificity
          FROM public.fee_configurations f
         WHERE f.is_active
           AND (f.sector_id = v_sector OR f.sector_id IS NULL)
           AND (f.sub_sector_id IS NULL OR v_sub IS NULL OR f.sub_sector_id = v_sub)
           AND (f.category_id IS NULL OR v_cat IS NULL OR f.category_id = v_cat)
           AND (f.form_id IS NULL OR f.form_id = ANY(v_forms))
           AND (CASE WHEN v_renewal
                     THEN lower(COALESCE(f.fee_type,'')) LIKE '%renew%'
                          AND (f.service_id IS NULL OR f.service_id = v_service)
                     ELSE lower(COALESCE(f.fee_type,'')) NOT LIKE '%renew%'
                          AND (CASE WHEN v_service IS NOT NULL THEN f.service_id = v_service
                                    ELSE f.service_id IS NULL END)
                END)
      ), deduped AS (
        SELECT DISTINCT ON (lower(btrim(COALESCE(fee_type,'')))) *
          FROM ranked
         WHERE COALESCE(btrim(fee_type),'') <> ''
         ORDER BY lower(btrim(COALESCE(fee_type,''))), specificity DESC, name
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'fee_type_code', d.fee_type,
               'description', COALESCE(d.name, initcap(replace(d.fee_type,'_',' '))),
               'amount', ROUND(COALESCE(d.amount,0), 2),
               'unit_amount', ROUND(COALESCE(d.amount,0), 2),
               'quantity', 1,
               'currency', COALESCE(d.currency,'USD'),
               'blocking', true,
               'source', 'FEE_CONFIGURATIONS',
               'fee_configuration_id', d.id,
               'calculation_type', d.calculation_type) ORDER BY d.specificity DESC, d.name), '[]'::jsonb),
             COALESCE(max(d.currency), 'USD')
        INTO v_lines, v_currency
        FROM deduped d;
      IF jsonb_array_length(v_lines) > 0 THEN v_source := 'FEE_CONFIGURATIONS'; END IF;
    END IF;
  END IF;

  SELECT COALESCE(sum((x->>'amount')::numeric), 0) INTO v_total
    FROM jsonb_array_elements(v_lines) x WHERE COALESCE((x->>'blocking')::boolean, true);

  v_basis := CASE WHEN jsonb_array_length(v_lines) = 0 THEN 'NO_FEE_RESOLVED'
                  WHEN v_total <= 0 THEN 'WAIVED_OR_ZERO_RATED'
                  ELSE 'ASSESSED' END;

  RETURN jsonb_build_object(
    'found', true, 'source', v_source, 'basis', v_basis, 'currency', v_currency,
    'license_id', NULLIF(btrim(COALESCE(v_data->>'license_id','')),''),
    'service_id', v_service, 'entity_id', v_app.entity_id,
    'matter_kind', NULL, 'service_code', NULL,
    'lines', v_lines,
    'config_snapshot', jsonb_build_object(
      'engine','fee_assessment_resolve_lines', 'renewal', v_renewal,
      'sector_id', v_sector, 'sub_sector_id', v_sub, 'category_id', v_cat,
      'service_id', v_service, 'form_ids', to_jsonb(v_forms)));
END $$;

-- ---------------------------------------------------------------------
-- Balance of an assessment, straight from the ledger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_assessment_outstanding(_assessment_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT ROUND(GREATEST(COALESCE(sum(l.amount), 0), 0), 2)
    FROM public.fee_ledger_entries l
   WHERE l.assessment_id = _assessment_id;
$$;

CREATE OR REPLACE FUNCTION public.fee_assessment_state(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  a record;
  v_out numeric := 0;
BEGIN
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'You do not have access to the financial record of this application.';
  END IF;

  SELECT * INTO a FROM public.fee_assessments
   WHERE application_id = _application_id AND status <> 'VOID'
   ORDER BY assessed_at DESC LIMIT 1;

  IF a.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'application_id', _application_id,
      'assessed_total', 0, 'outstanding', 0, 'paid_total', 0, 'waived_total', 0,
      'refunded_total', 0, 'currency', NULL, 'status', NULL, 'lines', '[]'::jsonb);
  END IF;

  v_out := public.fee_assessment_outstanding(a.id);

  RETURN jsonb_build_object(
    'found', true,
    'assessment_id', a.id,
    'assessment_number', a.assessment_number,
    'application_id', a.application_id,
    'license_id', a.license_id,
    'service_id', a.service_id,
    'basis', a.basis,
    'resolution_source', a.resolution_source,
    'status', a.status,
    'currency', a.currency,
    'assessed_total', a.assessed_total,
    'assessed_at', a.assessed_at,
    'lines', a.lines,
    'paid_total', COALESCE((SELECT ROUND(sum(al.amount),2) FROM public.fee_payment_allocations al
                             WHERE al.assessment_id = a.id AND al.reversed_at IS NULL), 0),
    'waived_total', COALESCE((SELECT ROUND(-sum(l.amount),2) FROM public.fee_ledger_entries l
                               WHERE l.assessment_id = a.id AND l.entry_type = 'WAIVER'), 0),
    'refunded_total', COALESCE((SELECT ROUND(sum(l.amount),2) FROM public.fee_ledger_entries l
                                 WHERE l.assessment_id = a.id AND l.entry_type = 'REFUND'), 0),
    'reversed_total', COALESCE((SELECT ROUND(sum(l.amount),2) FROM public.fee_ledger_entries l
                                 WHERE l.assessment_id = a.id AND l.entry_type = 'REVERSAL'), 0),
    'outstanding', v_out,
    'requires_payment', v_out > 0);
END $$;

-- ---------------------------------------------------------------------
-- Create the assessment of record (idempotent, concurrency-safe)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_assessment_ensure(_application_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_res jsonb;
  v_line jsonb;
  v_total numeric := 0;
  v_id uuid;
  v_seq bigint;
  v_no text;
  v_i int := 0;
BEGIN
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'You do not have access to the financial record of this application.';
  END IF;

  SELECT id, applicant_id, entity_id, request_kind, data INTO v_app
    FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_id FROM public.fee_assessments
   WHERE application_id = _application_id AND status <> 'VOID' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN public.fee_assessment_state(_application_id);
  END IF;

  v_res := public.fee_assessment_resolve_lines(_application_id);

  SELECT COALESCE(sum((x->>'amount')::numeric), 0) INTO v_total
    FROM jsonb_array_elements(COALESCE(v_res->'lines','[]'::jsonb)) x
   WHERE COALESCE((x->>'blocking')::boolean, true);

  v_seq := nextval('public.fee_assessment_number_seq');
  v_no := 'FA-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.fee_assessments(
    assessment_number, subject_type, application_id, license_id, service_id, entity_id,
    request_kind, matter_kind, service_code, basis, resolution_source, config_snapshot,
    lines, assessed_total, currency, status, assessed_by, assessed_source, idempotency_key)
  VALUES (
    v_no, 'APPLICATION', _application_id,
    NULLIF(btrim(COALESCE(v_res->>'license_id','')),'')::uuid,
    NULLIF(btrim(COALESCE(v_res->>'service_id','')),'')::uuid,
    v_app.entity_id, v_app.request_kind, v_res->>'matter_kind', v_res->>'service_code',
    COALESCE(v_res->>'basis','NO_FEE_RESOLVED'), COALESCE(v_res->>'source','NONE'),
    COALESCE(v_res->'config_snapshot','{}'::jsonb),
    COALESCE(v_res->'lines','[]'::jsonb), ROUND(v_total,2),
    COALESCE(v_res->>'currency','USD'), 'ASSESSED', v_uid, 'SERVER',
    'APP:' || _application_id::text || ':' || v_seq::text)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- lost a concurrent race: the winner's assessment is authoritative
    RETURN public.fee_assessment_state(_application_id);
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(v_res->'lines','[]'::jsonb)) LOOP
    v_i := v_i + 1;
    INSERT INTO public.fee_assessment_lines(
      assessment_id, line_no, fee_type_code, fee_type_id, description, unit_amount, quantity,
      amount, currency, fee_configuration_id, binding_id, blocking, source_snapshot)
    VALUES (v_id, v_i, v_line->>'fee_type_code',
      NULLIF(btrim(COALESCE(v_line->>'fee_type_id','')),'')::uuid,
      v_line->>'description',
      ROUND(COALESCE((v_line->>'unit_amount')::numeric, (v_line->>'amount')::numeric, 0),2),
      COALESCE((v_line->>'quantity')::numeric, 1),
      ROUND(COALESCE((v_line->>'amount')::numeric,0),2),
      COALESCE(v_line->>'currency', v_res->>'currency', 'USD'),
      NULLIF(btrim(COALESCE(v_line->>'fee_configuration_id','')),'')::uuid,
      NULLIF(btrim(COALESCE(v_line->>'binding_id','')),'')::uuid,
      COALESCE((v_line->>'blocking')::boolean, true), v_line);
  END LOOP;

  IF v_total > 0 THEN
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, entry_type, amount,
                                          currency, reason, metadata, created_by)
    VALUES (v_id, _application_id, 'CHARGE', ROUND(v_total,2),
            COALESCE(v_res->>'currency','USD'),
            COALESCE(_reason, 'Assessment of record raised'),
            jsonb_build_object('assessment_number', v_no, 'source', v_res->>'source'), v_uid);
  END IF;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (v_uid, 'fee.assessment.created', 'fee_assessment', v_id,
          jsonb_build_object('application_id', _application_id, 'assessed_total', ROUND(v_total,2),
                             'currency', COALESCE(v_res->>'currency','USD')),
          jsonb_build_object('assessment_number', v_no, 'source', v_res->>'source',
                             'basis', v_res->>'basis'));

  RETURN public.fee_assessment_state(_application_id);
END $$;

-- ---------------------------------------------------------------------
-- Supersede (never re-price): used when the itemisation legitimately changes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_assessment_supersede(_application_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); a record; v_paid numeric;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'Fee administration permission is required.';
  END IF;
  IF COALESCE(length(btrim(_reason)),0) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO a FROM public.fee_assessments
   WHERE application_id = _application_id AND status <> 'VOID' FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('superseded', false, 'reason', 'NO_LIVE_ASSESSMENT'); END IF;

  SELECT COALESCE(sum(amount),0) INTO v_paid FROM public.fee_payment_allocations
   WHERE assessment_id = a.id AND reversed_at IS NULL;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'ASSESSMENT_SETTLED' USING ERRCODE = '22023',
      DETAIL = 'A settled assessment cannot be superseded; reverse or refund the payment first.';
  END IF;

  UPDATE public.fee_assessments
     SET status = 'VOID', superseded_at = now(), supersede_reason = btrim(_reason)
   WHERE id = a.id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fee.assessment.superseded', 'fee_assessment', a.id,
          jsonb_build_object('status', a.status, 'assessed_total', a.assessed_total),
          jsonb_build_object('status','VOID','reason', btrim(_reason)));

  RETURN jsonb_build_object('superseded', true, 'assessment_id', a.id);
END $$;

-- ---------------------------------------------------------------------
-- Regulator / entity overview
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_assessment_overview(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_state jsonb;
  v_internal boolean;
  v_aid uuid;
BEGIN
  v_state := public.fee_assessment_state(_application_id);
  v_internal := public.is_internal_staff_user(v_uid);
  v_aid := NULLIF(v_state->>'assessment_id','')::uuid;

  RETURN v_state || jsonb_build_object(
    'is_internal', v_internal,
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'currency', p.currency, 'status', p.status,
        'payment_method', p.payment_method, 'payment_channel', p.payment_channel,
        'offline_method', p.offline_method, 'verification_status', p.verification_status,
        'transaction_ref', p.transaction_ref, 'receipt_number', p.receipt_number,
        'paid_at', p.paid_at, 'created_at', p.created_at) ORDER BY p.created_at DESC)
      FROM public.payments p WHERE p.application_id = _application_id), '[]'::jsonb),
    'allocations', COALESCE((SELECT jsonb_agg(to_jsonb(al) ORDER BY al.allocated_at DESC)
      FROM public.fee_payment_allocations al WHERE al.assessment_id = v_aid), '[]'::jsonb),
    'waivers', COALESCE((SELECT jsonb_agg(to_jsonb(w) ORDER BY w.requested_at DESC)
      FROM public.fee_waivers w WHERE w.assessment_id = v_aid), '[]'::jsonb),
    'refunds', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
      FROM public.refunds r JOIN public.payments p ON p.id = r.payment_id
     WHERE p.application_id = _application_id), '[]'::jsonb),
    'ledger', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at, l.id)
      FROM public.fee_ledger_entries l
     WHERE l.application_id = _application_id OR l.assessment_id = v_aid), '[]'::jsonb),
    'reconciliation_exceptions', CASE WHEN v_internal THEN
        COALESCE((SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.created_at DESC)
          FROM public.fee_reconciliation_items ri
         WHERE ri.status IN ('UNMATCHED','EXCEPTION')
           AND (ri.assessment_id = v_aid
                OR ri.payment_id IN (SELECT id FROM public.payments WHERE application_id = _application_id))), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'audit', CASE WHEN v_internal THEN
        COALESCE((SELECT jsonb_agg(jsonb_build_object('action', al.action, 'at', al.created_at,
                                                      'user_id', al.user_id, 'metadata', al.metadata)
                                   ORDER BY al.created_at DESC)
          FROM public.audit_logs al
         WHERE al.entity_id IN (SELECT id FROM public.payments WHERE application_id = _application_id)
            OR al.entity_id = v_aid), '[]'::jsonb)
      ELSE '[]'::jsonb END);
END $$;

-- ---------------------------------------------------------------------
-- Cash recognition + allocation (single settlement point for every channel)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_payment_settlement_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  a record;
  v_out numeric := 0;
  v_alloc numeric := 0;
  v_ledger uuid;
  v_currency_ok boolean := true;
BEGIN
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','success','paid') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) IN ('completed','success','paid') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.fee_ledger_entries
              WHERE payment_id = NEW.id AND entry_type = 'PAYMENT') THEN RETURN NEW; END IF;

  INSERT INTO public.fee_ledger_entries(application_id, payment_id, entry_type, amount, currency,
                                        external_reference, reason, metadata, created_by)
  VALUES (NEW.application_id, NEW.id, 'PAYMENT', ROUND(COALESCE(NEW.amount,0),2),
          COALESCE(NEW.currency,'USD'), NEW.transaction_ref, 'Cash received',
          jsonb_build_object('channel', NEW.payment_channel, 'method', NEW.payment_method), NEW.user_id);

  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO a FROM public.fee_assessments
   WHERE application_id = NEW.application_id AND status <> 'VOID'
   ORDER BY assessed_at DESC LIMIT 1 FOR UPDATE;
  IF a.id IS NULL THEN RETURN NEW; END IF;

  v_currency_ok := upper(COALESCE(NEW.currency,'')) = upper(COALESCE(a.currency,''));
  IF NOT v_currency_ok THEN
    -- currencies are never silently converted: the receipt stays unallocated
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                          amount, currency, reason, metadata, created_by)
    VALUES (NULL, NEW.application_id, NEW.id, 'CREDIT', ROUND(COALESCE(NEW.amount,0),2),
            COALESCE(NEW.currency,'USD'), 'Unallocated: payment currency differs from assessed currency',
            jsonb_build_object('reason_code','CURRENCY_MISMATCH','assessment_currency', a.currency), NEW.user_id);
    RETURN NEW;
  END IF;

  v_out := public.fee_assessment_outstanding(a.id);
  v_alloc := LEAST(ROUND(COALESCE(NEW.amount,0),2), v_out);

  IF v_alloc > 0 THEN
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                          amount, currency, external_reference, reason, created_by)
    VALUES (a.id, NEW.application_id, NEW.id, 'ALLOCATION', -v_alloc, a.currency,
            NEW.transaction_ref, 'Payment allocated to assessment', NEW.user_id)
    RETURNING id INTO v_ledger;

    INSERT INTO public.fee_payment_allocations(payment_id, assessment_id, amount, currency,
                                               ledger_entry_id, allocated_by)
    VALUES (NEW.id, a.id, v_alloc, a.currency, v_ledger, NEW.user_id);
  END IF;

  IF ROUND(COALESCE(NEW.amount,0),2) - v_alloc > 0 THEN
    INSERT INTO public.fee_ledger_entries(application_id, payment_id, entry_type, amount, currency,
                                          reason, metadata, created_by)
    VALUES (NEW.application_id, NEW.id, 'CREDIT', ROUND(COALESCE(NEW.amount,0),2) - v_alloc,
            COALESCE(NEW.currency,'USD'), 'Overpayment held as unallocated credit',
            jsonb_build_object('reason_code','OVERPAYMENT'), NEW.user_id);
  END IF;

  IF public.fee_assessment_outstanding(a.id) <= 0 AND a.status = 'ASSESSED' THEN
    UPDATE public.fee_assessments SET status = 'SETTLED' WHERE id = a.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fee_payment_settlement ON public.payments;
CREATE TRIGGER fee_payment_settlement AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fee_payment_settlement_sync();

-- ---------------------------------------------------------------------
-- Payment initiation / completion — the browser no longer sets the amount
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_or_get_application_payment(_application_id uuid, _amount numeric DEFAULT NULL::numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record; v_payment record; v_state jsonb; v_amount numeric; v_currency text; v_txn text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('action','block','code','UNAUTHORIZED','message','You must be signed in.');
  END IF;

  SELECT id, applicant_id INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action','block','code','NOT_FOUND','message','Application not found.');
  END IF;
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RETURN jsonb_build_object('action','block','code','FORBIDDEN','message','You do not have access to this application.');
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at
    INTO v_payment FROM public.payments p
   WHERE p.application_id = _application_id AND lower(p.status) IN ('completed','success','paid')
   ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC LIMIT 1 FOR UPDATE;
  IF v_payment.id IS NOT NULL THEN
    RETURN jsonb_build_object('action','paid','payment_id', v_payment.id, 'status', v_payment.status,
      'amount', v_payment.amount, 'transaction_ref', v_payment.transaction_ref,
      'receipt_number', v_payment.receipt_number, 'currency', v_payment.currency, 'paid_at', v_payment.paid_at);
  END IF;

  v_state := public.fee_assessment_ensure(_application_id, 'Payment initiation');
  v_amount := ROUND(COALESCE((v_state->>'outstanding')::numeric, 0), 2);
  v_currency := COALESCE(v_state->>'currency', 'USD');

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('action','not_required','code','NO_OUTSTANDING_BALANCE',
      'amount', 0, 'currency', v_currency,
      'message','No outstanding assessed amount exists for this application.');
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at
    INTO v_payment FROM public.payments p
   WHERE p.application_id = _application_id AND lower(p.status) IN ('pending','processing','initiated')
   ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;

  IF v_payment.id IS NOT NULL THEN
    UPDATE public.payments SET amount = v_amount, currency = v_currency
     WHERE id = v_payment.id
    RETURNING id, status, amount, transaction_ref, receipt_number, currency, paid_at INTO v_payment;
    RETURN jsonb_build_object('action','pending','payment_id', v_payment.id, 'status', v_payment.status,
      'amount', v_payment.amount, 'transaction_ref', v_payment.transaction_ref,
      'receipt_number', v_payment.receipt_number, 'currency', v_payment.currency, 'paid_at', v_payment.paid_at);
  END IF;

  v_txn := 'TXN-' || EXTRACT(EPOCH FROM clock_timestamp())::bigint || '-' || upper(substr(md5(random()::text),1,6));
  INSERT INTO public.payments(user_id, application_id, amount, currency, status, payment_method, transaction_ref)
  VALUES (v_uid, _application_id, v_amount, v_currency, 'initiated', 'online', v_txn)
  RETURNING id, status, amount, transaction_ref, receipt_number, currency, paid_at INTO v_payment;

  RETURN jsonb_build_object('action','created','payment_id', v_payment.id, 'status', v_payment.status,
    'amount', v_payment.amount, 'transaction_ref', v_payment.transaction_ref,
    'receipt_number', v_payment.receipt_number, 'currency', v_payment.currency, 'paid_at', v_payment.paid_at);
END $$;

CREATE OR REPLACE FUNCTION public.complete_or_get_application_payment(_application_id uuid, _amount numeric DEFAULT NULL::numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record; v_payment record; v_state jsonb; v_amount numeric; v_currency text; v_txn text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('action','block','code','UNAUTHORIZED','message','You must be signed in.');
  END IF;

  SELECT id, applicant_id INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action','block','code','NOT_FOUND','message','Application not found.');
  END IF;
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RETURN jsonb_build_object('action','block','code','FORBIDDEN','message','You do not have access to this application.');
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at
    INTO v_payment FROM public.payments p
   WHERE p.application_id = _application_id AND lower(p.status) IN ('completed','success','paid')
   ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC LIMIT 1 FOR UPDATE;
  IF v_payment.id IS NOT NULL AND public.fee_assessment_outstanding(
       (SELECT id FROM public.fee_assessments WHERE application_id = _application_id AND status <> 'VOID' LIMIT 1)) <= 0 THEN
    RETURN jsonb_build_object('action','paid','payment_id', v_payment.id, 'status', v_payment.status,
      'amount', v_payment.amount, 'transaction_ref', v_payment.transaction_ref,
      'receipt_number', v_payment.receipt_number, 'currency', v_payment.currency, 'paid_at', v_payment.paid_at);
  END IF;

  v_state := public.fee_assessment_ensure(_application_id, 'Online payment');
  v_amount := ROUND(COALESCE((v_state->>'outstanding')::numeric, 0), 2);
  v_currency := COALESCE(v_state->>'currency','USD');

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('action','not_required','code','NO_OUTSTANDING_BALANCE',
      'amount', 0, 'currency', v_currency,
      'message','No outstanding assessed amount exists for this application.');
  END IF;

  SELECT p.id, p.status, p.amount, p.transaction_ref, p.currency
    INTO v_payment FROM public.payments p
   WHERE p.application_id = _application_id AND lower(p.status) IN ('pending','processing','initiated')
   ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;

  IF v_payment.id IS NULL THEN
    v_txn := 'TXN-' || EXTRACT(EPOCH FROM clock_timestamp())::bigint || '-' || upper(substr(md5(random()::text),1,6));
    INSERT INTO public.payments(user_id, application_id, amount, currency, status, payment_method, transaction_ref)
    VALUES (v_uid, _application_id, v_amount, v_currency, 'initiated', 'online', v_txn)
    RETURNING id, status, amount, transaction_ref, currency INTO v_payment;
  END IF;

  UPDATE public.payments p
     SET status = 'completed', paid_at = COALESCE(p.paid_at, now()),
         amount = v_amount, currency = v_currency
   WHERE p.id = v_payment.id
  RETURNING p.id, p.status, p.amount, p.transaction_ref, p.receipt_number, p.currency, p.paid_at
    INTO v_payment;

  RETURN jsonb_build_object('action','completed','payment_id', v_payment.id, 'status', v_payment.status,
    'amount', v_payment.amount, 'transaction_ref', v_payment.transaction_ref,
    'receipt_number', v_payment.receipt_number, 'currency', v_payment.currency, 'paid_at', v_payment.paid_at,
    'client_declared_amount', _amount, 'authoritative', true);
END $$;

-- ---------------------------------------------------------------------
-- Offline declaration — partial allowed, duplicate reference refused
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_offline_payment(_application_id uuid, _amount numeric, _offline_method text, _payment_date date, _reference text, _bank_name text DEFAULT NULL::text, _remarks text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record; v_existing record; v_pay record; v_state jsonb;
  v_out numeric; v_currency text; v_norm text;
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
  IF _offline_method <> 'cash' AND (_reference IS NULL OR length(TRIM(_reference)) < 3) THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Enter the payment reference (min 3 characters).');
  END IF;
  IF _payment_date IS NULL OR _payment_date > (now()::date) OR _payment_date < (now()::date - interval '2 years') THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID','message','Enter a valid payment date.');
  END IF;

  SELECT id, applicant_id, status INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','NOT_FOUND','message','Application not found.');
  END IF;
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RETURN jsonb_build_object('ok', false, 'code','FORBIDDEN','message','You do not have access to this application.');
  END IF;
  IF lower(COALESCE(v_app.status,'')) IN ('approved','rejected','cancelled','withdrawn') THEN
    RETURN jsonb_build_object('ok', false, 'code','INVALID_STATE',
      'message','This application is closed and cannot accept a new payment.');
  END IF;

  SELECT id INTO v_existing FROM public.payments
   WHERE application_id = _application_id AND payment_channel = 'offline' AND verification_status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','ALREADY_EXISTS','payment_id', v_existing.id,
      'message','An offline payment for this application is already awaiting verification.');
  END IF;

  v_state := public.fee_assessment_ensure(_application_id, 'Offline payment declaration');
  v_out := ROUND(COALESCE((v_state->>'outstanding')::numeric, 0), 2);
  v_currency := COALESCE(v_state->>'currency','USD');
  IF v_out <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code','NO_OUTSTANDING_BALANCE',
      'message','No outstanding assessed amount exists for this application.');
  END IF;
  IF ROUND(_amount,2) > v_out THEN
    RETURN jsonb_build_object('ok', false, 'code','AMOUNT_EXCEEDS_ASSESSMENT',
      'outstanding', v_out, 'currency', v_currency,
      'message','The declared amount exceeds the outstanding assessed amount.');
  END IF;

  INSERT INTO public.payments (
    user_id, application_id, amount, currency, status, payment_method, payment_channel,
    offline_method, payment_date, bank_name, transaction_ref, verification_status, verification_remarks
  ) VALUES (
    v_uid, _application_id, ROUND(_amount,2), v_currency, 'pending_verification', 'offline', 'offline',
    _offline_method, _payment_date, NULLIF(TRIM(COALESCE(_bank_name,'')),''),
    NULLIF(TRIM(COALESCE(_reference,'')),''), 'pending', NULLIF(TRIM(COALESCE(_remarks,'')),'')
  ) RETURNING id, status, verification_status INTO v_pay;

  v_norm := lower(regexp_replace(COALESCE(_reference,''), '[^a-zA-Z0-9]', '', 'g'));
  IF v_norm <> '' THEN
    BEGIN
      INSERT INTO public.fee_payment_references(reference_norm, raw_reference, source, payment_id, created_by)
      VALUES (v_norm, btrim(_reference), 'OFFLINE', v_pay.id, v_uid);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'DUPLICATE_PAYMENT_REFERENCE' USING ERRCODE = '23505',
        DETAIL = 'This payment reference has already been recorded.';
    END;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'offline_payment_submitted', 'payment', v_pay.id,
          jsonb_build_object('application_id', _application_id, 'amount', ROUND(_amount,2),
                             'currency', v_currency, 'offline_method', _offline_method,
                             'payment_date', _payment_date, 'verification_status','pending'));

  RETURN jsonb_build_object('ok', true, 'payment_id', v_pay.id, 'status', v_pay.status,
    'verification_status', v_pay.verification_status, 'outstanding_before', v_out, 'currency', v_currency);
END $$;

-- ---------------------------------------------------------------------
-- Waivers / exemptions — request, authority, decision, ledger effect
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_waiver_request(_application_id uuid, _amount numeric, _reason text, _kind text DEFAULT 'WAIVER')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_state jsonb; v_aid uuid; v_out numeric; v_id uuid;
BEGIN
  IF NOT public.fee_can_view_application_finance(v_uid, _application_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023',
      DETAIL='A written waiver justification of at least 10 characters is required.';
  END IF;
  IF COALESCE(_kind,'WAIVER') NOT IN ('WAIVER','EXEMPTION') THEN
    RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE='22023';
  END IF;

  v_state := public.fee_assessment_ensure(_application_id, 'Waiver request');
  v_aid := NULLIF(v_state->>'assessment_id','')::uuid;
  IF v_aid IS NULL THEN RAISE EXCEPTION 'NO_ASSESSMENT' USING ERRCODE='22023'; END IF;
  v_out := ROUND(COALESCE((v_state->>'outstanding')::numeric,0),2);
  IF _amount IS NULL OR _amount <= 0 OR ROUND(_amount,2) > v_out THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023',
      DETAIL='The waiver amount must be positive and cannot exceed the outstanding balance.';
  END IF;

  INSERT INTO public.fee_waivers(assessment_id, waiver_kind, requested_amount, currency,
                                 request_reason, requested_by)
  VALUES (v_aid, COALESCE(_kind,'WAIVER'), ROUND(_amount,2),
          COALESCE(v_state->>'currency','USD'), btrim(_reason), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'fee.waiver.requested', 'fee_waiver', v_id,
          jsonb_build_object('assessment_id', v_aid, 'amount', ROUND(_amount,2)));

  RETURN jsonb_build_object('ok', true, 'waiver_id', v_id, 'status','PENDING');
END $$;

CREATE OR REPLACE FUNCTION public.fee_waiver_decide(_waiver_id uuid, _approve boolean, _reason text, _approved_amount numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); w record; a record; v_out numeric; v_amt numeric; v_ledger uuid;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501',
      DETAIL='Fee waiver authority is required.';
  END IF;
  IF COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT * INTO w FROM public.fee_waivers WHERE id = _waiver_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'WAIVER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF w.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='22023'; END IF;
  IF w.requested_by = v_uid THEN
    RAISE EXCEPTION 'MAKER_CHECKER' USING ERRCODE='42501',
      DETAIL='The requester of a waiver cannot approve it.';
  END IF;

  SELECT * INTO a FROM public.fee_assessments WHERE id = w.assessment_id FOR UPDATE;
  v_out := public.fee_assessment_outstanding(a.id);
  v_amt := LEAST(ROUND(COALESCE(_approved_amount, w.requested_amount),2), v_out);

  IF _approve THEN
    IF v_amt <= 0 THEN RAISE EXCEPTION 'NOTHING_TO_WAIVE' USING ERRCODE='22023'; END IF;
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, entry_type, amount, currency,
                                          reason, metadata, created_by)
    VALUES (a.id, a.application_id, 'WAIVER', -v_amt, a.currency, btrim(_reason),
            jsonb_build_object('waiver_id', w.id, 'kind', w.waiver_kind), v_uid)
    RETURNING id INTO v_ledger;

    UPDATE public.fee_waivers SET status='APPROVED', approved_amount=v_amt, decided_by=v_uid,
           decided_at=now(), decision_reason=btrim(_reason), ledger_entry_id=v_ledger, updated_at=now()
     WHERE id = w.id;

    IF public.fee_assessment_outstanding(a.id) <= 0 AND a.status = 'ASSESSED' THEN
      UPDATE public.fee_assessments SET status='WAIVED' WHERE id = a.id;
    END IF;
  ELSE
    UPDATE public.fee_waivers SET status='REJECTED', decided_by=v_uid, decided_at=now(),
           decision_reason=btrim(_reason), updated_at=now() WHERE id = w.id;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, CASE WHEN _approve THEN 'fee.waiver.approved' ELSE 'fee.waiver.rejected' END,
          'fee_waiver', w.id, jsonb_build_object('status', w.status),
          jsonb_build_object('status', CASE WHEN _approve THEN 'APPROVED' ELSE 'REJECTED' END,
                             'amount', CASE WHEN _approve THEN v_amt ELSE NULL END,
                             'reason', btrim(_reason)));

  RETURN (SELECT to_jsonb(x) FROM public.fee_waivers x WHERE x.id = w.id);
END $$;

-- ---------------------------------------------------------------------
-- Refund lifecycle: request -> eligibility -> maker/checker -> execution
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_refund_request(_payment_id uuid, _amount numeric, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); p record; v_refunded numeric; v_eligible numeric; v_id uuid; v_aid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT (p.user_id = v_uid OR public.fee_can_administer(v_uid)
          OR (p.application_id IS NOT NULL AND public.fee_can_view_application_finance(v_uid, p.application_id))) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF lower(COALESCE(p.status,'')) NOT IN ('completed','success','paid') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_SETTLED' USING ERRCODE='22023',
      DETAIL='Only a settled payment can be refunded.';
  END IF;
  IF COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(sum(amount),0) INTO v_refunded FROM public.refunds
   WHERE payment_id = _payment_id AND status IN ('pending','approved','executed');
  v_eligible := ROUND(COALESCE(p.amount,0) - v_refunded, 2);
  IF _amount IS NULL OR _amount <= 0 OR ROUND(_amount,2) > v_eligible THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023',
      DETAIL='The refund amount must be positive and cannot exceed the refundable balance.';
  END IF;

  SELECT id INTO v_aid FROM public.fee_assessments
   WHERE application_id = p.application_id AND status <> 'VOID' LIMIT 1;

  INSERT INTO public.refunds(payment_id, amount, reason, status, requested_by, currency,
                             assessment_id, eligibility_snapshot)
  VALUES (_payment_id, ROUND(_amount,2), btrim(_reason), 'pending', v_uid, p.currency, v_aid,
          jsonb_build_object('payment_amount', p.amount, 'already_refunded', v_refunded,
                             'eligible', v_eligible, 'checked_at', now()))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'fee.refund.requested', 'payment_refund', v_id,
          jsonb_build_object('payment_id', _payment_id, 'amount', ROUND(_amount,2)));

  RETURN jsonb_build_object('ok', true, 'refund_id', v_id, 'status','pending', 'eligible', v_eligible);
END $$;

CREATE OR REPLACE FUNCTION public.payment_refund_decide(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); r record; _before jsonb; _after jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.fee_can_administer(_uid) THEN
    RAISE EXCEPTION 'Refund approval permission required' USING ERRCODE='42501';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Refund decision must be approved or rejected' USING ERRCODE='22023';
  END IF;
  IF coalesce(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'A refund decision rationale of at least 10 characters is required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO r FROM public.refunds WHERE id = _refund_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Refund request not found' USING ERRCODE='P0002'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This refund request has already been decided' USING ERRCODE='22023';
  END IF;
  IF r.requested_by = _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'MAKER_CHECKER' USING ERRCODE='42501',
      DETAIL='The officer who requested the refund cannot approve it.';
  END IF;

  SELECT to_jsonb(x) INTO _before FROM public.refunds x WHERE x.id = _refund_id;
  UPDATE public.refunds SET status = _decision,
         approved_by = CASE WHEN _decision='approved' THEN _uid ELSE approved_by END,
         decision_reason = btrim(_reason), updated_at = now()
   WHERE id = _refund_id RETURNING to_jsonb(refunds) INTO _after;

  PERFORM public.log_compliance_audit(
    (CASE WHEN _decision='approved' THEN 'APPROVE' ELSE 'REJECT' END)::compliance_audit_action,
    'payment_refund', _refund_id::text, _before, _after, btrim(_reason));
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.fee_refund_execute(_refund_id uuid, _reference text, _method text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); r record; p record; v_ledger uuid; v_total numeric; _before jsonb; _after jsonb;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF COALESCE(length(btrim(_reference)),0) < 3 THEN
    RAISE EXCEPTION 'REFERENCE_REQUIRED' USING ERRCODE='22023',
      DETAIL='A refund execution reference is required.';
  END IF;

  SELECT * INTO r FROM public.refunds WHERE id = _refund_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'REFUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF r.status <> 'approved' THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL='Only an approved refund can be executed.';
  END IF;
  IF r.requested_by = v_uid AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'MAKER_CHECKER' USING ERRCODE='42501',
      DETAIL='The requester of a refund cannot execute it.';
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = r.payment_id FOR UPDATE;
  _before := to_jsonb(r);

  -- compensating entry: the original receipt is never edited away
  INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type, amount,
                                        currency, external_reference, reason, metadata, created_by)
  VALUES (r.assessment_id, p.application_id, p.id, 'REFUND', ROUND(r.amount,2),
          COALESCE(r.currency, p.currency), btrim(_reference), r.reason,
          jsonb_build_object('refund_id', r.id), v_uid)
  RETURNING id INTO v_ledger;

  UPDATE public.refunds SET status='executed', processed_at=now(), executed_by=v_uid, executed_at=now(),
         refund_reference=btrim(_reference), refund_method=COALESCE(_method, refund_method),
         ledger_entry_id=v_ledger, updated_at=now()
   WHERE id = r.id RETURNING to_jsonb(refunds) INTO _after;

  SELECT COALESCE(sum(amount),0) INTO v_total FROM public.refunds
   WHERE payment_id = p.id AND status = 'executed';
  IF v_total >= ROUND(COALESCE(p.amount,0),2) THEN
    UPDATE public.payments SET status='refunded' WHERE id = p.id;
  END IF;

  IF r.assessment_id IS NOT NULL THEN
    UPDATE public.fee_assessments SET status='ASSESSED'
     WHERE id = r.assessment_id AND status = 'SETTLED'
       AND public.fee_assessment_outstanding(r.assessment_id) > 0;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action, 'payment_refund',
    r.id::text, _before, _after, 'Refund executed: ' || btrim(_reference));

  RETURN _after;
END $$;

-- ---------------------------------------------------------------------
-- Governed payment reversal / void (compensating, never destructive)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_payment_reverse(_payment_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); p record; al record; v_ledger uuid; v_count int := 0;
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

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fee.payment.reversed', 'payment', _payment_id,
          jsonb_build_object('status', p.status, 'amount', p.amount),
          jsonb_build_object('status','reversed','allocations_reversed', v_count, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'payment_id', _payment_id, 'allocations_reversed', v_count);
END $$;

-- ---------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_reconciliation_ingest(_source text, _statement_reference text, _items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_run uuid; it jsonb; p record;
  v_matched int := 0; v_unmatched int := 0; v_exception int := 0; v_norm text; v_status text; v_code text;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fee_reconciliation_runs(source, statement_reference, run_by)
  VALUES (COALESCE(NULLIF(btrim(_source),''),'MANUAL'), NULLIF(btrim(_statement_reference),''), v_uid)
  RETURNING id INTO v_run;

  FOR it IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_norm := lower(regexp_replace(COALESCE(it->>'reference',''), '[^a-zA-Z0-9]', '', 'g'));
    p := NULL;
    SELECT pm.* INTO p FROM public.payments pm
     WHERE lower(regexp_replace(COALESCE(pm.transaction_ref,''), '[^a-zA-Z0-9]', '', 'g')) = v_norm
       AND v_norm <> ''
     ORDER BY pm.created_at DESC LIMIT 1;

    IF p.id IS NULL THEN
      v_status := 'UNMATCHED'; v_code := 'NO_MATCHING_PAYMENT'; v_unmatched := v_unmatched + 1;
    ELSIF ROUND(COALESCE((it->>'amount')::numeric,0),2) <> ROUND(COALESCE(p.amount,0),2) THEN
      v_status := 'EXCEPTION'; v_code := 'AMOUNT_MISMATCH'; v_exception := v_exception + 1;
    ELSIF upper(COALESCE(it->>'currency', p.currency)) <> upper(COALESCE(p.currency,'')) THEN
      v_status := 'EXCEPTION'; v_code := 'CURRENCY_MISMATCH'; v_exception := v_exception + 1;
    ELSE
      v_status := 'MATCHED'; v_code := NULL; v_matched := v_matched + 1;
    END IF;

    INSERT INTO public.fee_reconciliation_items(run_id, external_reference, external_amount,
      external_currency, external_date, payment_id, assessment_id, status, exception_code, notes)
    VALUES (v_run, COALESCE(it->>'reference',''), ROUND(COALESCE((it->>'amount')::numeric,0),2),
            upper(COALESCE(it->>'currency','USD')),
            NULLIF(btrim(COALESCE(it->>'value_date','')),'')::date, p.id,
            (SELECT fa.id FROM public.fee_assessments fa
              WHERE fa.application_id = p.application_id AND fa.status <> 'VOID' LIMIT 1),
            v_status, v_code, NULLIF(btrim(COALESCE(it->>'notes','')),''));
  END LOOP;

  UPDATE public.fee_reconciliation_runs
     SET total_items = v_matched + v_unmatched + v_exception, matched_items = v_matched,
         unmatched_items = v_unmatched, exception_items = v_exception
   WHERE id = v_run;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'fee.reconciliation.ingested', 'fee_reconciliation_run', v_run,
          jsonb_build_object('matched', v_matched, 'unmatched', v_unmatched, 'exceptions', v_exception));

  RETURN jsonb_build_object('run_id', v_run, 'matched', v_matched, 'unmatched', v_unmatched,
                            'exceptions', v_exception);
END $$;

CREATE OR REPLACE FUNCTION public.fee_reconciliation_resolve(_item_id uuid, _resolution text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); i record;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF COALESCE(length(btrim(_resolution)),0) < 5 THEN
    RAISE EXCEPTION 'RESOLUTION_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT * INTO i FROM public.fee_reconciliation_items WHERE id = _item_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF i.status = 'RESOLVED' THEN RAISE EXCEPTION 'ALREADY_RESOLVED' USING ERRCODE='22023'; END IF;

  UPDATE public.fee_reconciliation_items
     SET status='RESOLVED', resolution=btrim(_resolution), resolved_by=v_uid, resolved_at=now(),
         notes = COALESCE(NULLIF(btrim(COALESCE(_note,'')),''), notes)
   WHERE id = _item_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fee.reconciliation.resolved', 'fee_reconciliation_item', _item_id,
          jsonb_build_object('status', i.status, 'exception_code', i.exception_code),
          jsonb_build_object('status','RESOLVED','resolution', btrim(_resolution)));

  RETURN jsonb_build_object('ok', true, 'item_id', _item_id, 'status','RESOLVED');
END $$;

-- ---------------------------------------------------------------------
-- Governed fee-component maintenance (replaces browser DML)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_component_operation(_application_id uuid, _operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_id uuid; v_amount numeric; v_ft uuid; v_before jsonb; v_paid numeric;
BEGIN
  IF NOT (public.fee_can_administer(v_uid)
          OR public.has_permission(v_uid,'application_management','edit')) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE='42501',
      DETAIL='Fee administration permission is required to change fee components.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id = _application_id) THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT COALESCE(sum(al.amount),0) INTO v_paid
    FROM public.fee_payment_allocations al
    JOIN public.fee_assessments fa ON fa.id = al.assessment_id
   WHERE fa.application_id = _application_id AND al.reversed_at IS NULL;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'ASSESSMENT_SETTLED' USING ERRCODE='22023',
      DETAIL='Fees cannot be re-itemised after a payment has been allocated.';
  END IF;

  IF _operation = 'add' THEN
    v_ft := NULLIF(btrim(COALESCE(_payload->>'fee_type_id','')),'')::uuid;
    v_amount := ROUND(COALESCE((_payload->>'amount')::numeric, -1), 2);
    IF v_ft IS NULL THEN RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='Fee type is required.'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023', DETAIL='Amount must be greater than zero.'; END IF;
    IF EXISTS (SELECT 1 FROM public.fee_components WHERE application_id=_application_id AND fee_type_id=v_ft) THEN
      RAISE EXCEPTION 'DUPLICATE_FEE_TYPE' USING ERRCODE='23505', DETAIL='That fee type is already itemised.';
    END IF;
    INSERT INTO public.fee_components(application_id, fee_type_id, amount, description)
    VALUES (_application_id, v_ft, v_amount, NULLIF(btrim(COALESCE(_payload->>'description','')),''))
    RETURNING id INTO v_id;

  ELSIF _operation = 'update' THEN
    v_id := NULLIF(btrim(COALESCE(_payload->>'id','')),'')::uuid;
    v_amount := ROUND(COALESCE((_payload->>'amount')::numeric, -1), 2);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023', DETAIL='Amount must be greater than zero.'; END IF;
    SELECT to_jsonb(f) INTO v_before FROM public.fee_components f WHERE f.id = v_id AND f.application_id = _application_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'COMPONENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    UPDATE public.fee_components
       SET amount = v_amount, description = NULLIF(btrim(COALESCE(_payload->>'description','')),'')
     WHERE id = v_id;

  ELSIF _operation = 'remove' THEN
    v_id := NULLIF(btrim(COALESCE(_payload->>'id','')),'')::uuid;
    SELECT to_jsonb(f) INTO v_before FROM public.fee_components f WHERE f.id = v_id AND f.application_id = _application_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'COMPONENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    DELETE FROM public.fee_components WHERE id = v_id;

  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
  END IF;

  -- the itemisation changed: void the un-settled assessment so the next read re-assesses
  PERFORM public.fee_assessment_supersede(_application_id, 'Fee itemisation changed (' || _operation || ')');

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fee.component.' || _operation, 'fee_component', COALESCE(v_id, _application_id),
          v_before, jsonb_build_object('application_id', _application_id, 'payload', _payload));

  RETURN jsonb_build_object('ok', true, 'operation', _operation, 'component_id', v_id);
END $$;

-- ---------------------------------------------------------------------
-- F5 submission boundary: read the authoritative outstanding balance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_license_fee_assessment(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app record; v_license_id uuid; v_service_id uuid; v_code text; v_matter text;
  v_lines jsonb := '[]'::jsonb; v_amount numeric := 0; v_currency text := 'JMD'; v_basis text;
  a record; v_out numeric;
BEGIN
  SELECT id, data, request_kind INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('state','APPLICATION_NOT_FOUND','requires_payment', false, 'amount_due', 0);
  END IF;
  IF v_app.request_kind <> 'POST_LICENSE' THEN
    RETURN jsonb_build_object('state','NOT_POST_LICENSE','requires_payment', true, 'amount_due', NULL);
  END IF;

  v_license_id := NULLIF(btrim(COALESCE(v_app.data->>'license_id','')),'')::uuid;
  v_service_id := NULLIF(btrim(COALESCE(v_app.data->>'service_id','')),'')::uuid;
  v_code := public.post_license_effect_key(v_service_id);
  v_matter := public.post_license_matter_kind(v_code);

  IF v_license_id IS NULL THEN
    RETURN jsonb_build_object('state','LICENSE_NOT_BOUND','requires_payment', false, 'amount_due', 0,
                              'basis','NO_LICENCE_CONTEXT', 'lines','[]'::jsonb);
  END IF;
  IF v_matter IS NULL THEN
    RETURN jsonb_build_object('state','NO_FEE_CATEGORY_CONFIGURED','requires_payment', false, 'amount_due', 0,
                              'basis','BUSINESS_CONFIGURATION_ABSENT','service_code', v_code, 'lines','[]'::jsonb);
  END IF;

  v_lines := public.license_fee_resolve(v_license_id, v_matter, NULL);

  SELECT COALESCE(sum((x->>'amount')::numeric), 0), COALESCE(max(x->>'currency'), 'JMD')
    INTO v_amount, v_currency
    FROM jsonb_array_elements(v_lines) x
   WHERE COALESCE((x->>'blocking')::boolean, true);

  v_basis := CASE WHEN jsonb_array_length(v_lines) = 0 THEN 'NO_FEE_RESOLVED'
                  WHEN v_amount <= 0 THEN 'WAIVED_OR_ZERO_RATED'
                  ELSE 'ASSESSED' END;

  -- Once an assessment of record exists, the ledger balance is authoritative:
  -- payments, waivers, refunds and reversals all move this number.
  SELECT * INTO a FROM public.fee_assessments
   WHERE application_id = _application_id AND status <> 'VOID' LIMIT 1;
  IF a.id IS NOT NULL THEN
    v_out := public.fee_assessment_outstanding(a.id);
    RETURN jsonb_build_object(
      'state','OK', 'application_id', _application_id, 'license_id', v_license_id,
      'service_code', v_code, 'matter_kind', v_matter,
      'amount_due', ROUND(COALESCE(v_out,0),2), 'currency', a.currency, 'basis', a.basis,
      'requires_payment', COALESCE(v_out,0) > 0, 'lines', a.lines,
      'assessment_id', a.id, 'assessment_number', a.assessment_number,
      'assessed_total', a.assessed_total, 'authority','FEE_ASSESSMENT_OF_RECORD');
  END IF;

  RETURN jsonb_build_object(
    'state','OK', 'application_id', _application_id, 'license_id', v_license_id,
    'service_code', v_code, 'matter_kind', v_matter,
    'amount_due', ROUND(COALESCE(v_amount,0), 2), 'currency', v_currency, 'basis', v_basis,
    'requires_payment', COALESCE(v_amount,0) > 0, 'lines', v_lines, 'authority','RESOLVED_SCHEDULE');
END $$;

-- ---------------------------------------------------------------------
-- Execute privileges: authenticated only, never anonymous
-- ---------------------------------------------------------------------
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fee_can_view_application_finance(uuid,uuid)','fee_can_administer(uuid)',
    'fee_assessment_resolve_lines(uuid)','fee_assessment_outstanding(uuid)',
    'fee_assessment_state(uuid)','fee_assessment_ensure(uuid,text)','fee_assessment_supersede(uuid,text)',
    'fee_assessment_overview(uuid)','fee_waiver_request(uuid,numeric,text,text)',
    'fee_waiver_decide(uuid,boolean,text,numeric)','fee_refund_request(uuid,numeric,text)',
    'fee_refund_execute(uuid,text,text)','fee_payment_reverse(uuid,text)',
    'fee_reconciliation_ingest(text,text,jsonb)','fee_reconciliation_resolve(uuid,text,text)',
    'fee_component_operation(uuid,text,jsonb)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.fee_payment_settlement_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fee_append_only_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fee_assessment_immutability_guard() FROM PUBLIC, anon, authenticated;