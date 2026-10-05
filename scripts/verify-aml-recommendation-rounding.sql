-- AML-CLOSE-04A — recommendation ordinal follows the governed rounding mode at whole-step precision.
-- Read-only. Each row must report PASS.
WITH cases(v, mode, expected) AS (VALUES
  (2.4999, 'HALF_UP', 2), (2.5, 'HALF_UP', 3), (2.5001, 'HALF_UP', 3),
  (2.4999, 'HALF_DOWN', 2), (2.5, 'HALF_DOWN', 2), (2.5001, 'HALF_DOWN', 3),
  (2.4999, 'FLOOR', 2), (2.5, 'FLOOR', 2), (2.9999, 'FLOOR', 2),
  (2.0001, 'CEILING', 3), (2.5, 'CEILING', 3), (3.0, 'CEILING', 3),
  (2.5, 'NONE', 3) -- NONE cannot yield a whole step: documented half-up
)
SELECT v, mode, expected, public.supervisory_calc_round_ordinal(v, mode) AS actual,
       CASE WHEN public.supervisory_calc_round_ordinal(v, mode) = expected THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM cases
UNION ALL
SELECT NULL, 'ENGINE_USES_HELPER', NULL, NULL,
       CASE WHEN position('supervisory_calc_round_ordinal(_ord_num/_ord_den, _rmode)' IN
              pg_get_functiondef('public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer)'::regprocedure)) > 0
             AND position('round(_ord_num/_ord_den)::int' IN
              pg_get_functiondef('public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer)'::regprocedure)) = 0
            THEN 'PASS' ELSE 'FAIL' END;
