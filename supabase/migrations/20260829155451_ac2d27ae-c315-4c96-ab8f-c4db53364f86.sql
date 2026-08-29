-- fee_assessment_overview: audit_logs.entity_id is text; compare on text so the
-- regulator financial record (and its audit trail) loads instead of erroring.
CREATE OR REPLACE FUNCTION public.fee_assessment_overview(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
         WHERE al.entity_id::text IN (SELECT p.id::text FROM public.payments p
                                       WHERE p.application_id = _application_id)
            OR (v_aid IS NOT NULL AND al.entity_id::text = v_aid::text)), '[]'::jsonb)
      ELSE '[]'::jsonb END);
END $function$;

REVOKE ALL ON FUNCTION public.fee_assessment_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_assessment_overview(uuid) TO authenticated, service_role;