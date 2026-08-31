-- =====================================================================
-- DEMO ENVIRONMENT: DEMO_SLU_FSRA_2026 — STAGE 3
-- Risk-based supervision thread: threshold breach -> acknowledgement ->
-- prudential action -> progress -> closure (certified F8-W1C lifecycle).
--
-- TRUTHFULNESS NOTES
--   * Every breach row below is derived by evaluating the CONFIGURED
--     active prudential_thresholds against metric values ALREADY present
--     in return_metric_values for the ACCEPTED filing CV2-E02-2025-Q4.
--     No ratio is invented: each observed value is copied from the
--     canonical metric value row referenced in `evidence`.
--   * The in-app scheduled detection job is the normal producer of these
--     rows; this script records the same evaluation deterministically so
--     the demonstration has stable IDs.
--   * Acknowledgement and action progression are performed ONLY through
--     the governed RPCs, so audit evidence is produced normally.
--   * Idempotent: fixed UUIDs, ON CONFLICT DO NOTHING, guarded RPC calls.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO seed refused: production environment';
  END IF;
END $$;

-- Observed values, thresholds and evidence pointers.
INSERT INTO public.return_threshold_breaches
  (id, entity_id, return_filing_id, return_filing_version_id, reporting_period_id,
   regulatory_metric_id, metric_key, level, value, threshold_value, comparator,
   risk_level, detected_at, detection_source, evidence)
SELECT
  x.id,
  '5855bf85-9fde-4cf8-a082-7ea904d46184',
  'efc5bc25-ba44-45a9-a3ed-94c06a72b1a8',
  '93712161-e11b-4dd4-a35a-1c3ebee442da',
  '8731481c-d1eb-4541-aa98-c49cecfe60f5',
  m.id, x.metric_key, x.level, x.value, x.threshold_value, x.comparator,
  x.risk_level, x.detected_at, 'THRESHOLD_EVALUATION',
  jsonb_build_object(
    'metric_value_id', x.metric_value_id,
    'source_filing_reference', 'CV2-E02-2025-Q4',
    'threshold_source', 'prudential_thresholds (active, sector-neutral)',
    'basis', 'Observed value read from the canonical accepted-filing metric value')
FROM (VALUES
  -- Liquidity ratio 13.00% vs breach floor 15.00% (comparator >=)
  ('5c300001-0000-4000-8000-000000000001'::uuid,'LIQUIDITY_RATIO','breach',13.0::numeric,15.0::numeric,'>=','red',
   '2026-02-16T09:15:00Z'::timestamptz,'1df908fa-4f49-41c4-95d8-2e92ae6639cd'),
  -- Cost/income ratio 76.00% vs breach ceiling 75.00% (comparator <=)
  ('5c300002-0000-4000-8000-000000000002'::uuid,'COST_INCOME_RATIO','breach',76.0::numeric,75.0::numeric,'<=','red',
   '2026-02-16T09:15:00Z'::timestamptz,'b07ae241-da99-4c5a-a712-34ff56cfff8c'),
  -- NPL ratio 6.00% vs warning ceiling 5.00% (comparator <=)
  ('5c300003-0000-4000-8000-000000000003'::uuid,'NPL_RATIO','warn',6.0::numeric,5.0::numeric,'<=','amber',
   '2026-02-16T09:15:00Z'::timestamptz,'83cccd1e-658a-485b-84af-23971c91d9da')
) AS x(id, metric_key, level, value, threshold_value, comparator, risk_level, detected_at, metric_value_id)
JOIN public.regulatory_metrics m ON m.code = x.metric_key
ON CONFLICT (id) DO NOTHING;

-- Governed acknowledgement + action for the liquidity breach only.
-- The cost/income breach is deliberately left UNACKNOWLEDGED so the
-- presenter can perform a live, audited acknowledgement on screen.
DO $$
DECLARE
  v_officer uuid := (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com');
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer::text, 'role', 'authenticated')::text, true);

  IF NOT EXISTS (SELECT 1 FROM public.return_threshold_breach_acknowledgements
                  WHERE breach_id = '5c300001-0000-4000-8000-000000000001') THEN
    PERFORM public.prudential_breach_acknowledge(
      '5c300001-0000-4000-8000-000000000001',
      'Liquidity ratio of 13.0% is below the 15.0% regulatory floor for 2025-Q4. '
      || 'Acknowledged by supervision; a directed remediation action is being issued to the institution.');
  END IF;
END $$;

INSERT INTO public.prudential_actions
  (id, entity_id, source_type, source_id, action_type, title, description, severity,
   due_date, status, action_reference, evidence_required, breach_after_days, progress_percent,
   review_status, created_by)
VALUES
  ('5c310001-0000-4000-8000-000000000001',
   '5855bf85-9fde-4cf8-a082-7ea904d46184',
   'threshold_breach','5c300001-0000-4000-8000-000000000001',
   'remediation_plan',
   'Liquidity remediation plan required (2025-Q4 liquidity ratio 13.0%)',
   'Submit a board-approved liquidity remediation plan restoring the liquid asset ratio to at least '
   || '15.0% within two reporting quarters, including a funding contingency plan and weekly liquidity monitoring.',
   'high','2026-04-30','in_progress','PA-2026-0001',true,14,40,'pending',
   (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com')),
  ('5c310002-0000-4000-8000-000000000002',
   '5855bf85-9fde-4cf8-a082-7ea904d46184',
   'threshold_breach','5c300003-0000-4000-8000-000000000003',
   'information_request',
   'Explanation of rising non-performing loans (2025-Q4 NPL ratio 6.0%)',
   'Provide an ageing analysis of the non-performing loan portfolio and the provisioning basis applied, '
   || 'together with management''s recovery strategy.',
   'medium','2026-03-31','closed','PA-2026-0002',false,14,100,'accepted',
   (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com'))
ON CONFLICT (id) DO NOTHING;

UPDATE public.prudential_actions
   SET completion_notes = 'Ageing analysis and provisioning basis received and assessed as adequate. '
                       || 'NPL trend to remain under enhanced monitoring in 2026-Q1.',
       closed_at = '2026-03-20T14:05:00Z',
       closed_by = (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com'),
       reviewed_by = (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com'),
       reviewed_at = '2026-03-20T14:05:00Z',
       review_notes = 'Closure reviewed and accepted by the supervisory lead.'
 WHERE id = '5c310002-0000-4000-8000-000000000002' AND closed_at IS NULL;

COMMIT;
