-- =====================================================================
-- DEMO ENVIRONMENT: DEMO_SLU_FSRA_2026 — STAGE 3
-- Risk-based supervision thread: threshold breach -> acknowledgement ->
-- prudential action -> progress -> closure (certified F8-W1C lifecycle).
--
-- TRUTHFULNESS NOTES
--   * Every breach/warning row below is produced by evaluating the
--     CONFIGURED active prudential_thresholds against metric values that
--     ALREADY exist in return_metric_values for the ACCEPTED version of
--     filing CV2-E02-2025-Q3 (version 5568551b…, the version the
--     application itself displays for this entity). No ratio is invented:
--     every observed value is copied from the canonical metric value row
--     referenced in `evidence`.
--   * 2025-Q3 is used deliberately: it is the newest period whose ACCEPTED
--     filing version carries AVAILABLE calculated ratios, so the numbers
--     quoted in the runbook are the numbers on screen. The 2025-Q4 accepted
--     version records its ratios as NOT_AVAILABLE and must not be quoted.
--   * The scheduled detection job is the normal producer of these rows;
--     this script records the same evaluation deterministically so the
--     demonstration has stable IDs.
--   * Acknowledgement is performed ONLY through the governed RPC, so audit
--     evidence is produced normally.
--   * Idempotent: fixed UUIDs, guarded RPC calls, safe to re-run.
--
-- Evaluation performed (active, sector-neutral thresholds):
--   CAPITAL_ADEQUACY_RATIO 12.50  >= warn 12.0 / breach 10.0  -> compliant
--   LIQUIDITY_RATIO        14.50  >= warn 20.0 / breach 15.0  -> BREACH
--   COST_INCOME_RATIO      74.00  <= warn 65.0 / breach 75.0  -> warning
--   NPL_RATIO               5.80  <= warn  5.0 / breach 10.0  -> warning
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO seed refused: production environment';
  END IF;
END $$;

-- Retire the superseded first-cut demo rows (2025-Q4 based) if present.
-- prudential_actions cannot be deleted (their event log is append-only), so the
-- two demo actions are retargeted in place further below.
DELETE FROM public.return_threshold_breach_acknowledgements
 WHERE breach_id IN ('5c300001-0000-4000-8000-000000000001',
                     '5c300002-0000-4000-8000-000000000002',
                     '5c300003-0000-4000-8000-000000000003');
-- return_threshold_breaches is immutable (append-only detection evidence), so the
-- first-cut 2025-Q4 detections stay on record. They reference filing version 1,
-- which was later superseded; the demonstration filters the Breaches tab to Q3.

-- Observed values, thresholds and evidence pointers (2025-Q3 accepted version).
INSERT INTO public.return_threshold_breaches
  (id, entity_id, return_filing_id, return_filing_version_id, reporting_period_id,
   regulatory_metric_id, metric_key, level, value, threshold_value, comparator,
   risk_level, detected_at, detection_source, evidence)
SELECT
  x.id,
  '5855bf85-9fde-4cf8-a082-7ea904d46184',
  'e124d2dc-f08c-4b17-a92f-0db411a8b985',
  '5568551b-5574-48b8-aa9a-5f1ac283751f',
  '76e59e62-af5f-47cc-a4c0-7d6c33510011',
  m.id, x.metric_key, x.level, x.value, x.threshold_value, x.comparator,
  x.risk_level, x.detected_at, 'THRESHOLD_EVALUATION',
  jsonb_build_object(
    'metric_value_id', x.metric_value_id,
    'source_filing_reference', 'CV2-E02-2025-Q3',
    'threshold_source', 'prudential_thresholds (active, sector-neutral)',
    'basis', 'Observed value read from the canonical accepted-filing metric value')
FROM (VALUES
  -- Liquidity ratio 14.50% vs breach floor 15.00% (comparator >=)
  ('5c300011-0000-4000-8000-000000000011'::uuid,'LIQUIDITY_RATIO','breach',14.5::numeric,15.0::numeric,'>=','red',
   '2025-11-12T09:15:00Z'::timestamptz,'911800c3-71cd-4ee7-bcbf-c9b4a6748ed2'),
  -- NPL ratio 5.80% vs warning ceiling 5.00% (comparator <=)
  ('5c300012-0000-4000-8000-000000000012'::uuid,'NPL_RATIO','warn',5.8::numeric,5.0::numeric,'<=','amber',
   '2025-11-12T09:15:00Z'::timestamptz,'83968596-e77b-46f1-aab0-b0348a3df019'),
  -- Cost/income ratio 74.00% vs warning ceiling 65.00% (comparator <=)
  ('5c300013-0000-4000-8000-000000000013'::uuid,'COST_INCOME_RATIO','warn',74.0::numeric,65.0::numeric,'<=','amber',
   '2025-11-12T09:15:00Z'::timestamptz,'fd8a0241-2362-4521-a071-ca42ada6856a')
) AS x(id, metric_key, level, value, threshold_value, comparator, risk_level, detected_at, metric_value_id)
JOIN public.regulatory_metrics m ON m.code = x.metric_key
ON CONFLICT (id) DO UPDATE
   SET value = EXCLUDED.value,
       threshold_value = EXCLUDED.threshold_value,
       comparator = EXCLUDED.comparator,
       level = EXCLUDED.level,
       risk_level = EXCLUDED.risk_level,
       evidence = EXCLUDED.evidence;

-- Governed acknowledgement of the NPL warning only.
-- The LIQUIDITY BREACH is deliberately left UNACKNOWLEDGED so the presenter
-- can perform a live, fully audited acknowledgement on screen.
DO $$
DECLARE
  v_officer uuid := (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com');
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer::text, 'role', 'authenticated')::text, true);

  IF NOT EXISTS (SELECT 1 FROM public.return_threshold_breach_acknowledgements
                  WHERE breach_id = '5c300012-0000-4000-8000-000000000012') THEN
    PERFORM public.prudential_breach_acknowledge(
      '5c300012-0000-4000-8000-000000000012',
      'Non-performing loan ratio of 5.8% exceeds the 5.0% supervisory warning level for 2025-Q3. '
      || 'Acknowledged by supervision; an information request has been issued to the institution.');
  END IF;
END $$;

INSERT INTO public.prudential_actions
  (id, entity_id, source_type, source_id, action_type, title, description, severity,
   due_date, status, action_reference, evidence_required, breach_after_days, progress_percent,
   review_status, created_by)
VALUES
  ('5c310011-0000-4000-8000-000000000011',
   '5855bf85-9fde-4cf8-a082-7ea904d46184',
   'return_breach','5c300011-0000-4000-8000-000000000011',
   'remediation_plan',
   'Liquidity remediation plan required (2025-Q3 liquidity ratio 14.5%)',
   'Submit a board-approved liquidity remediation plan restoring the liquid asset ratio to at least '
   || '15.0% within two reporting quarters, including a funding contingency plan and weekly liquidity monitoring.',
   'high','2026-04-30','in_progress','PA-2026-0001',true,14,40,'awaiting_review',
   (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com')),
  ('5c310012-0000-4000-8000-000000000012',
   '5855bf85-9fde-4cf8-a082-7ea904d46184',
   'return_breach','5c300012-0000-4000-8000-000000000012',
   'remediation_plan',
   'Explanation of rising non-performing loans (2025-Q3 NPL ratio 5.8%)',
   'Provide an ageing analysis of the non-performing loan portfolio and the provisioning basis applied, '
   || 'together with management''s recovery strategy.',
   'medium','2026-03-31','completed','PA-2026-0002',false,14,100,'accepted',
   (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com'))
ON CONFLICT (id) DO NOTHING;

-- Retarget the first-cut (2025-Q4 based) demo actions if they exist, so the
-- Actions tab never quotes a period whose ratios are not displayable.
UPDATE public.prudential_actions
   SET source_id = '5c300011-0000-4000-8000-000000000011',
       title = 'Liquidity remediation plan required (2025-Q3 liquidity ratio 14.5%)',
       description = 'Superseded demonstration record — see PA-2026-0001.',
       status = 'completed', progress_percent = 100, review_status = 'accepted',
       action_reference = 'PA-2026-0001-R'
 WHERE id = '5c310001-0000-4000-8000-000000000001';
UPDATE public.prudential_actions
   SET source_id = '5c300012-0000-4000-8000-000000000012',
       title = 'Explanation of rising non-performing loans (2025-Q3 NPL ratio 5.8%)',
       description = 'Superseded demonstration record — see PA-2026-0002.',
       status = 'completed', progress_percent = 100, review_status = 'accepted',
       action_reference = 'PA-2026-0002-R'
 WHERE id = '5c310002-0000-4000-8000-000000000002';

UPDATE public.prudential_actions
   SET completion_notes = 'Ageing analysis and provisioning basis received and assessed as adequate. '
                       || 'NPL trend to remain under enhanced monitoring in 2026-Q1.',
       closed_at = '2026-03-20T14:05:00Z',
       closed_by = (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com'),
       reviewed_by = (SELECT id FROM auth.users WHERE email = 'super_admin@mishainfotech.com'),
       reviewed_at = '2026-03-20T14:05:00Z',
       review_notes = 'Closure reviewed and accepted by the supervisory lead.'
 WHERE id IN ('5c310012-0000-4000-8000-000000000012',
              '5c310001-0000-4000-8000-000000000001',
              '5c310002-0000-4000-8000-000000000002')
   AND closed_at IS NULL;

COMMIT;

