-- ============================================================
-- CERTIFICATION DATASET v1 — Part C: obligations, periods, filings, metrics
-- ============================================================
CREATE OR REPLACE FUNCTION public.cert_seed_returns_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_seed_user uuid := '6d4f5483-b81b-47bb-9e4d-265f9c1b0f25';
BEGIN
  ------------------------------------------------------------------
  -- 1. Entity reporting obligations derived from sector obligation rules
  ------------------------------------------------------------------
  INSERT INTO entity_reporting_obligations (id, entity_id, return_definition_id, source_rule_id, origin,
    frequency, due_days_after_period_end, effective_from, status, created_by)
  SELECT cert_uuid('oblig:'||m.scenario_key||':'||rr.code), m.entity_id, rr.return_definition_id, rr.id, 'RULE',
         COALESCE(rr.frequency_override, rd.frequency),
         COALESCE(rr.due_days_override, rd.due_days_after_period_end),
         DATE '2024-01-01', 'ACTIVE', v_seed_user
  FROM certification_seed_manifest m
  JOIN licensees l ON l.id = m.entity_id
  JOIN reporting_obligation_rules rr ON rr.sector_id = l.sector_id AND rr.is_active
  JOIN return_definitions rd ON rd.id = rr.return_definition_id AND rd.status = 'ACTIVE'
  WHERE m.record_kind = 'REGULATED_ENTITY'
    AND EXISTS (SELECT 1 FROM entity_licenses el WHERE el.entity_id = m.entity_id AND el.effective_to IS NULL)
  ON CONFLICT (id) DO UPDATE SET frequency = EXCLUDED.frequency, status = EXCLUDED.status;

  ------------------------------------------------------------------
  -- 2. Reporting periods per obligation frequency
  ------------------------------------------------------------------
  INSERT INTO reporting_periods (id, entity_reporting_obligation_id, period_label, period_start, period_end,
    due_date, status, opened_at, closed_at)
  SELECT cert_uuid('period:'||o.id::text||':'||p.label), o.id, p.label, p.pstart, p.pend,
         (p.pend + o.due_days_after_period_end),
         CASE WHEN (p.pend + o.due_days_after_period_end) < DATE '2026-06-01' THEN 'CLOSED' ELSE 'OPEN' END,
         p.pstart::timestamptz,
         CASE WHEN (p.pend + o.due_days_after_period_end) < DATE '2026-06-01'
              THEN (p.pend + o.due_days_after_period_end)::timestamptz END
  FROM entity_reporting_obligations o
  CROSS JOIN LATERAL (
    SELECT s.pstart,
           (s.pstart + s.step - INTERVAL '1 day')::date AS pend,
           s.label
    FROM (
      SELECT
        CASE o.frequency
          WHEN 'MONTHLY' THEN (DATE '2025-07-01' + (i || ' month')::interval)::date
          WHEN 'SEMI_ANNUAL' THEN (DATE '2025-01-01' + (i * 6 || ' month')::interval)::date
          WHEN 'ANNUAL' THEN (DATE '2024-01-01' + (i || ' year')::interval)::date
          ELSE (DATE '2025-01-01' + (i * 3 || ' month')::interval)::date
        END AS pstart,
        CASE o.frequency
          WHEN 'MONTHLY' THEN INTERVAL '1 month'
          WHEN 'SEMI_ANNUAL' THEN INTERVAL '6 month'
          WHEN 'ANNUAL' THEN INTERVAL '1 year'
          ELSE INTERVAL '3 month'
        END AS step,
        CASE o.frequency
          WHEN 'MONTHLY' THEN to_char(DATE '2025-07-01' + (i || ' month')::interval, 'Mon YYYY')
          WHEN 'SEMI_ANNUAL' THEN 'H' || (1 + (i % 2)) || ' ' || to_char(DATE '2025-01-01' + (i * 6 || ' month')::interval, 'YYYY')
          WHEN 'ANNUAL' THEN 'FY ' || to_char(DATE '2024-01-01' + (i || ' year')::interval, 'YYYY')
          ELSE 'Q' || to_char(DATE '2025-01-01' + (i * 3 || ' month')::interval, 'Q YYYY')
        END AS label
      FROM generate_series(0,
        CASE o.frequency WHEN 'MONTHLY' THEN 5 WHEN 'ANNUAL' THEN 1 WHEN 'SEMI_ANNUAL' THEN 2 ELSE 4 END) AS i
    ) s
  ) p
  ON CONFLICT (id) DO NOTHING;

  ------------------------------------------------------------------
  -- 3. Filings for the two earliest periods of each obligation
  ------------------------------------------------------------------
  WITH ranked AS (
    SELECT p.id AS period_id, p.period_label, p.due_date, o.id AS obligation_id, o.entity_id,
           o.return_definition_id,
           ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY p.period_start) AS period_rank,
           DENSE_RANK() OVER (ORDER BY o.id) AS oblig_rank
    FROM reporting_periods p
    JOIN entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
  ), chosen AS (
    SELECT r.*,
           CASE ((r.oblig_rank * 2 + r.period_rank) % 7)
             WHEN 0 THEN 'ACCEPTED' WHEN 1 THEN 'ACCEPTED' WHEN 2 THEN 'ACCEPTED'
             WHEN 3 THEN 'SUBMITTED' WHEN 4 THEN 'UNDER_REVIEW'
             WHEN 5 THEN 'CORRECTION_REQUESTED' ELSE 'DRAFT' END AS st
    FROM ranked r WHERE r.period_rank <= 2
  )
  INSERT INTO return_filings (id, filing_reference, entity_id, entity_reporting_obligation_id,
    reporting_period_id, return_definition_id, status, current_version_number,
    assigned_reviewer_id, submitted_at, accepted_at, created_by, created_at)
  SELECT cert_uuid('filing:'||c.period_id::text),
         'CERT-FIL-'||lpad(c.oblig_rank::text,3,'0')||'-'||c.period_rank,
         c.entity_id, c.obligation_id, c.period_id, c.return_definition_id, c.st,
         CASE WHEN c.st = 'CORRECTION_REQUESTED' THEN 2 WHEN c.st = 'DRAFT' THEN 1 ELSE 1 END,
         CASE WHEN c.st IN ('UNDER_REVIEW','CORRECTION_REQUESTED','ACCEPTED') THEN v_seed_user END,
         CASE WHEN c.st <> 'DRAFT' THEN (c.due_date - 5)::timestamptz END,
         CASE WHEN c.st = 'ACCEPTED' THEN (c.due_date + 3)::timestamptz END,
         v_seed_user, (c.due_date - 20)::timestamptz
  FROM chosen c
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  ------------------------------------------------------------------
  -- 4. Versions (v1 for every filing, superseded v1 + v2 for corrections)
  ------------------------------------------------------------------
  INSERT INTO return_filing_versions (id, return_filing_id, version_number, status, is_immutable,
    submitted_at, submitted_by, accepted_at, accepted_by, declaration_accepted_at, declaration_accepted_by, created_at)
  SELECT cert_uuid('fver:'||f.id::text||':1'), f.id, 1,
         CASE WHEN f.status = 'CORRECTION_REQUESTED' THEN 'SUPERSEDED' ELSE f.status END,
         (f.status <> 'DRAFT'),
         f.submitted_at, CASE WHEN f.status <> 'DRAFT' THEN v_seed_user END,
         f.accepted_at, CASE WHEN f.status = 'ACCEPTED' THEN v_seed_user END,
         f.submitted_at, CASE WHEN f.status <> 'DRAFT' THEN v_seed_user END,
         f.created_at
  FROM return_filings f
  WHERE f.filing_reference LIKE 'CERT-FIL-%'
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO return_filing_versions (id, return_filing_id, version_number, status, is_immutable,
    submitted_at, submitted_by, supersedes_version_id, created_at)
  SELECT cert_uuid('fver:'||f.id::text||':2'), f.id, 2, 'CORRECTION_REQUESTED', false,
         f.submitted_at + INTERVAL '10 day', v_seed_user,
         cert_uuid('fver:'||f.id::text||':1'), f.submitted_at + INTERVAL '10 day'
  FROM return_filings f
  WHERE f.filing_reference LIKE 'CERT-FIL-%' AND f.status = 'CORRECTION_REQUESTED'
  ON CONFLICT (id) DO NOTHING;

  UPDATE return_filings f
     SET accepted_version_id = cert_uuid('fver:'||f.id::text||':1')
   WHERE f.filing_reference LIKE 'CERT-FIL-%' AND f.status = 'ACCEPTED';

  ------------------------------------------------------------------
  -- 5. Metric values on accepted versions (reported + calculated)
  ------------------------------------------------------------------
  INSERT INTO return_metric_values (id, return_filing_version_id, entity_id, regulatory_metric_id,
    reporting_period_id, value_numeric, availability, source_kind, calculated_at, recorded_at)
  SELECT cert_uuid('mval:'||v.id::text||':'||rm.code), v.id, f.entity_id, rm.id, f.reporting_period_id,
         ROUND((('x'||substr(md5(v.id::text||rm.code),1,8))::bit(32)::bigint % 900000 + 100000)
               * CASE WHEN rm.code IN ('CAPITAL_ADEQUACY_RATIO','LIQUIDITY_COVERAGE_RATIO','NPL_RATIO',
                                       'RETURN_ON_ASSETS','RETURN_ON_EQUITY','SOLVENCY_RATIO')
                      THEN 0.00005 ELSE 1 END, 2),
         'AVAILABLE',
         CASE WHEN EXISTS (SELECT 1 FROM metric_calculation_rules mc WHERE mc.regulatory_metric_id = rm.id)
              THEN 'CALCULATED' ELSE 'REPORTED' END,
         CASE WHEN EXISTS (SELECT 1 FROM metric_calculation_rules mc WHERE mc.regulatory_metric_id = rm.id)
              THEN v.accepted_at END,
         v.accepted_at
  FROM return_filing_versions v
  JOIN return_filings f ON f.id = v.return_filing_id
  JOIN regulatory_metrics rm ON rm.code IN ('TOTAL_ASSETS','TOTAL_LIABILITIES','TOTAL_EQUITY',
       'NET_PROFIT_AFTER_TAX','CAPITAL_ADEQUACY_RATIO','LIQUIDITY_COVERAGE_RATIO','NPL_RATIO','RETURN_ON_ASSETS')
  WHERE f.filing_reference LIKE 'CERT-FIL-%' AND v.status = 'ACCEPTED'
  ON CONFLICT (id) DO NOTHING;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_seed_returns_v1() FROM PUBLIC, anon, authenticated;

SELECT public.cert_seed_returns_v1();