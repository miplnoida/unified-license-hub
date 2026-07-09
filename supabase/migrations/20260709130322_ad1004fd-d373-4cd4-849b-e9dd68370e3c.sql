
-- Reassign stress events from duplicate indicators to the surviving (earliest) one
WITH ranked AS (
  SELECT id, metric_key, direction, threshold_value,
         ROW_NUMBER() OVER (
           PARTITION BY metric_key, direction, threshold_value
           ORDER BY created_at NULLS LAST, id
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY metric_key, direction, threshold_value
           ORDER BY created_at NULLS LAST, id
         ) AS keep_id
  FROM public.prudential_stress_indicators
)
UPDATE public.prudential_stress_events e
SET indicator_id = r.keep_id
FROM ranked r
WHERE e.indicator_id = r.id AND r.rn > 1;

-- Delete duplicate indicator rows (keeps the earliest per rule tuple)
DELETE FROM public.prudential_stress_indicators psi
USING (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY metric_key, direction, threshold_value
             ORDER BY created_at NULLS LAST, id
           ) AS rn
    FROM public.prudential_stress_indicators
  ) s
  WHERE s.rn > 1
) d
WHERE psi.id = d.id;

-- Prevent re-introduction of duplicates
CREATE UNIQUE INDEX IF NOT EXISTS prudential_stress_indicators_unique_rule
  ON public.prudential_stress_indicators (metric_key, direction, threshold_value);
