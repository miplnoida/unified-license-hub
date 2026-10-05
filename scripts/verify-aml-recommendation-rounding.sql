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
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
-- Unequal weights must move the result: ordinals 5 and 1, weights 3:1 -> 16/4 = 4; equal weights -> 6/2 = 3.
SELECT NULL, 'UNEQUAL_WEIGHTS_' || m, 4, public.supervisory_calc_round_ordinal((5*3 + 1*1)::numeric / 4, m),
       CASE WHEN public.supervisory_calc_round_ordinal((5*3 + 1*1)::numeric / 4, m) = 4
             AND public.supervisory_calc_round_ordinal((5*1 + 1*1)::numeric / 2, m) = 3
            THEN 'PASS' ELSE 'FAIL' END
  FROM unnest(ARRAY['HALF_UP','HALF_DOWN','FLOOR','CEILING','NONE']) m
UNION ALL
-- Unequal weights at a boundary: ordinals 4 and 1, weights 3:1 -> 13/4 = 3.25; equal -> 2.5.
SELECT NULL, 'UNEQUAL_BOUNDARY_' || m, e_w, public.supervisory_calc_round_ordinal(3.25, m),
       CASE WHEN public.supervisory_calc_round_ordinal(3.25, m) = e_w
             AND public.supervisory_calc_round_ordinal(2.5, m) = e_eq THEN 'PASS' ELSE 'FAIL' END
  FROM (VALUES ('HALF_UP',3,3),('HALF_DOWN',3,2),('FLOOR',3,2),('CEILING',4,3),('NONE',3,3)) x(m,e_w,e_eq);
