-- Rejected filing coverage for CERTIFICATION DATASET v1
WITH pick AS (
  SELECT f.id, ROW_NUMBER() OVER (ORDER BY f.filing_reference) rn
  FROM return_filings f
  WHERE f.filing_reference LIKE 'CERT-FIL-%' AND f.status = 'SUBMITTED'
), target AS (
  SELECT id FROM pick WHERE rn % 2 = 0
)
UPDATE return_filings f
   SET status = 'REJECTED',
       rejected_at = f.submitted_at + INTERVAL '7 day'
 WHERE f.id IN (SELECT id FROM target);

UPDATE return_filing_versions v
   SET status = 'REJECTED',
       rejected_at = f.rejected_at,
       rejected_by = '6d4f5483-b81b-47bb-9e4d-265f9c1b0f25',
       rejection_reason = 'Reported balances did not reconcile to the submitted statement of financial position.'
  FROM return_filings f
 WHERE f.id = v.return_filing_id
   AND f.status = 'REJECTED'
   AND f.filing_reference LIKE 'CERT-FIL-%'
   AND v.version_number = 1;