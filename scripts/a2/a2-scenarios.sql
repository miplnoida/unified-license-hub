-- A2 certification scenario facts (canonical reported values only — never outcomes).
-- S1 NORMAL, S2 PRE-BREACH EWI, S3 HARD BREACH.
BEGIN;
WITH scen(entity_name, period_end, metric_code, val) AS (
  VALUES
  -- S1 NORMAL: comfortably inside tolerance for every configured threshold
  ('Atlantic Commercial Bank Ltd', DATE '2025-03-31', 'CAPITAL_ADEQUACY_RATIO', 18.40),
  ('Atlantic Commercial Bank Ltd', DATE '2025-03-31', 'NPL_RATIO',               3.10),
  ('Atlantic Commercial Bank Ltd', DATE '2025-06-30', 'CAPITAL_ADEQUACY_RATIO', 18.10),
  ('Atlantic Commercial Bank Ltd', DATE '2025-06-30', 'NPL_RATIO',               3.30),
  -- S2 PRE-BREACH EWI: warning zone + inside breach buffer + adverse movement, no hard breach
  ('Nevis Investment Management Ltd', DATE '2025-03-31', 'CAPITAL_ADEQUACY_RATIO', 15.00),
  ('Nevis Investment Management Ltd', DATE '2025-03-31', 'NPL_RATIO',               4.00),
  ('Nevis Investment Management Ltd', DATE '2025-06-30', 'CAPITAL_ADEQUACY_RATIO', 11.50),
  ('Nevis Investment Management Ltd', DATE '2025-06-30', 'NPL_RATIO',               4.60),
  -- S3 HARD BREACH: capital below minimum and NPL above ceiling in consecutive periods
  ('Federation Credit Finance Ltd', DATE '2025-03-31', 'CAPITAL_ADEQUACY_RATIO', 11.80),
  ('Federation Credit Finance Ltd', DATE '2025-03-31', 'NPL_RATIO',               6.20),
  ('Federation Credit Finance Ltd', DATE '2025-06-30', 'CAPITAL_ADEQUACY_RATIO',  8.50),
  ('Federation Credit Finance Ltd', DATE '2025-06-30', 'NPL_RATIO',              12.40),
  ('Federation Credit Finance Ltd', DATE '2025-12-31', 'CAPITAL_ADEQUACY_RATIO',  8.20),
  ('Federation Credit Finance Ltd', DATE '2025-12-31', 'NPL_RATIO',              13.10)
)
UPDATE public.return_metric_values mv
   SET value_numeric = s.val, recorded_at = now()
  FROM scen s,
       public.regulatory_metrics rm,
       public.return_filing_versions v,
       public.return_filings f,
       public.licensees l,
       public.reporting_periods rp
 WHERE rm.code = s.metric_code
   AND mv.regulatory_metric_id = rm.id
   AND v.id = mv.return_filing_version_id
   AND f.id = v.return_filing_id
   AND l.id = f.entity_id
   AND rp.id = f.reporting_period_id
   AND l.name = s.entity_name
   AND rp.period_end = s.period_end;
COMMIT;
