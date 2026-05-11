-- Mark duplicate successful payments as 'duplicate' (keep earliest per application).
WITH ranked AS (
  SELECT id,
         application_id,
         row_number() OVER (
           PARTITION BY application_id
           ORDER BY paid_at NULLS LAST, created_at ASC, id ASC
         ) AS rn
  FROM public.payments
  WHERE application_id IS NOT NULL
    AND status IN ('completed', 'success', 'paid')
)
UPDATE public.payments p
SET status = 'duplicate'
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- Enforce one successful payment per application at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS unique_successful_payment_per_application
ON public.payments (application_id)
WHERE status IN ('completed', 'success', 'paid') AND application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_application_status
ON public.payments (application_id, status)
WHERE application_id IS NOT NULL;