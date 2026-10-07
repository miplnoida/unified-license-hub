-- AML-CLOSE-08E: one bounded operational dashboard aggregate.
-- SECURITY INVOKER: every count runs under the caller's own RLS, so values
-- are identical to the per-table count requests it replaces.
CREATE OR REPLACE FUNCTION public.supervisory_dashboard_operational_summary(
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ents uuid[];
  today date := (now() AT TIME ZONE 'utc')::date;
  lic jsonb; lce jsonb; pay jsonb; exm jsonb; enf jsonb; cmp jsonb; rsk jsonb; apps jsonb;
  pend_rows jsonb; exp_rows jsonb; risk_rows jsonb; enf_rows jsonb; pay_amt jsonb;
  ret jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF _sector_id IS NOT NULL THEN
    SELECT coalesce(array_agg(id), ARRAY['00000000-0000-0000-0000-000000000000'::uuid])
      INTO ents FROM public.licensees WHERE sector_id = _sector_id;
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE status = 'active'),
    'expired', count(*) FILTER (WHERE status = 'expired'),
    'suspended', count(*) FILTER (WHERE status = 'suspended'),
    'revoked', count(*) FILTER (WHERE status = 'revoked'),
    'expiring_30d', count(*) FILTER (WHERE status = 'active' AND valid_until >= now() AND valid_until <= now() + interval '30 days'),
    'expiring_90d', count(*) FILTER (WHERE status = 'active' AND valid_until >= now() AND valid_until <= now() + interval '90 days'))
  INTO lic FROM public.licenses
  WHERE (_sector_id IS NULL OR sector_id = _sector_id) AND (_regulator_id IS NULL OR regulator_id = _regulator_id);

  SELECT coalesce(jsonb_agg(x), '[]') INTO exp_rows FROM (
    SELECT id, license_number, valid_until FROM public.licenses
    WHERE status = 'active' AND valid_until >= now() AND valid_until <= now() + interval '30 days'
      AND (_sector_id IS NULL OR sector_id = _sector_id)
    ORDER BY valid_until ASC LIMIT 5) x;

  SELECT jsonb_build_object('total', count(*), 'active', count(*) FILTER (WHERE status = 'active'))
  INTO lce FROM public.licensees WHERE (_sector_id IS NULL OR sector_id = _sector_id);

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status IN ('pending','awaiting_verification')),
    'paid', count(*) FILTER (WHERE status IN ('paid','completed','verified')),
    'failed', count(*) FILTER (WHERE status IN ('failed','rejected')))
  INTO pay FROM public.payments;

  -- Same bounded 1000-row sample the dashboard previously summed client-side.
  SELECT jsonb_build_object(
    'outstanding_amount', coalesce(sum(amount) FILTER (WHERE status IN ('pending','awaiting_verification')), 0),
    'revenue_month', coalesce(sum(amount) FILTER (WHERE status IN ('paid','completed','verified') AND paid_at >= date_trunc('month', now())), 0))
  INTO pay_amt FROM (SELECT amount, status, paid_at FROM public.payments LIMIT 1000) p;

  SELECT jsonb_build_object(
    'scheduled', count(*) FILTER (WHERE stage IN ('planned','scoping')),
    'completed', count(*) FILTER (WHERE stage = 'closed'),
    'overdue', count(*) FILTER (WHERE stage IN ('planned','scoping') AND fieldwork_start < today))
  INTO exm FROM public.examinations WHERE (ents IS NULL OR entity_id = ANY(ents));

  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE status IN ('open','investigation','pending')),
    'new_this_month', count(*) FILTER (WHERE date_opened >= today - 30),
    'pending_action', count(*) FILTER (WHERE status = 'pending'),
    'closed', count(*) FILTER (WHERE status = 'closed'))
  INTO enf FROM public.enforcement_actions WHERE (ents IS NULL OR entity_id = ANY(ents));

  SELECT coalesce(jsonb_agg(x), '[]') INTO enf_rows FROM (
    SELECT id, case_number, status FROM public.enforcement_actions
    WHERE status IN ('open','investigation','pending') AND (ents IS NULL OR entity_id = ANY(ents))
    ORDER BY date_opened ASC LIMIT 5) x;

  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE status IN ('open','submitted','pending','under_investigation')),
    'under_investigation', count(*) FILTER (WHERE status = 'under_investigation'),
    'closed', count(*) FILTER (WHERE status IN ('closed','resolved')))
  INTO cmp FROM public.complaints
  WHERE (ents IS NULL OR licensee_id = ANY(ents)) AND (_regulator_id IS NULL OR regulator_id = _regulator_id);

  SELECT jsonb_build_object(
    'high', count(*) FILTER (WHERE overall_rating ILIKE 'high%'),
    'medium', count(*) FILTER (WHERE overall_rating ILIKE 'medium%'),
    'low', count(*) FILTER (WHERE overall_rating ILIKE 'low%'))
  INTO rsk FROM public.risk_ratings WHERE (ents IS NULL OR entity_id = ANY(ents));

  SELECT coalesce(jsonb_agg(x), '[]') INTO risk_rows FROM (
    SELECT id, entity_id, overall_rating FROM public.risk_ratings
    WHERE overall_rating ILIKE 'high%' AND (ents IS NULL OR entity_id = ANY(ents))
    ORDER BY assessment_date DESC LIMIT 5) x;

  -- Application counts: the SAME list RPC + params the drill-down list uses.
  SELECT jsonb_object_agg(k, c) INTO apps FROM (
    SELECT k, coalesce((SELECT g.total_count FROM public.get_application_list_page(0, 1, NULL, 'contains', st, NULL, 'created_at', 'desc', NULL, _sector_id, sl, sg) g LIMIT 1), 0) AS c
    FROM (VALUES
      ('all', NULL::text, NULL::text, NULL::text),
      ('pending', NULL, 'pending', NULL),
      ('slaBreached', NULL, 'breached', NULL),
      ('slaDueSoon', NULL, 'due_soon', NULL),
      ('draft', 'draft', NULL, NULL),
      ('submitted', 'submitted', NULL, NULL),
      ('inProgress', 'in_progress', NULL, NULL),
      ('approved', NULL, NULL, 'approved'),
      ('rejected', NULL, NULL, 'rejected'),
      ('returned', NULL, NULL, 'returned')) v(k, st, sl, sg)) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'application_number', g.application_number, 'created_at', g.created_at, 'status', g.status)), '[]')
  INTO pend_rows FROM public.get_application_list_page(0, 5, NULL, 'contains', NULL, NULL, 'created_at', 'asc', NULL, _sector_id, 'pending', NULL) g;

  ret := public.returns_supervisory_summary(_sector_id);

  RETURN jsonb_build_object(
    'licenses', lic, 'licensees', lce, 'payments', pay || pay_amt,
    'examinations', exm, 'enforcement', enf, 'complaints', cmp, 'risk', rsk,
    'applications', apps, 'returns', ret,
    'priority', jsonb_build_object('pending_applications', pend_rows, 'license_expiries', exp_rows,
      'high_risk', risk_rows, 'open_enforcement', enf_rows));
END;
$$;

REVOKE ALL ON FUNCTION public.supervisory_dashboard_operational_summary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_dashboard_operational_summary(uuid, uuid) TO authenticated;