-- SR-18: repair ambiguous `sector_id` in prudential_sector_risk (grp_agg CTE).
-- `sector_id` is also an OUT parameter, so the unqualified reference raised
-- 42702 and every /executive call returned HTTP 400.
CREATE OR REPLACE FUNCTION public.prudential_sector_risk(_lookback_days integer DEFAULT 365)
RETURNS TABLE (
  sector_id uuid,
  sector_name text,
  entity_count integer,
  ratio_breaches integer,
  severe_ewi integer,
  adverse_assessments integer,
  group_risk_signals integer,
  open_actions integer,
  evidence_count integer,
  score numeric,
  band text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - make_interval(days => GREATEST(COALESCE(_lookback_days, 365), 1));
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.user_has_permission(auth.uid(), 'prudential_supervision', 'view') THEN
    RAISE EXCEPTION 'insufficient_privilege: prudential_supervision.view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ent AS (
    SELECT l.id, l.sector_id
    FROM public.licensees l
    WHERE l.sector_id IS NOT NULL
  ),
  breaches AS (
    SELECT e.sector_id, count(*)::int AS n
    FROM public.return_threshold_breaches b
    JOIN public.returns_filed rf ON rf.id = b.return_id
    JOIN ent e ON e.id = rf.entity_id
    WHERE b.detected_at >= _since
      AND b.acknowledged_at IS NULL
      AND (lower(COALESCE(b.level, '')) IN ('breach', 'critical', 'high')
           OR lower(COALESCE(b.risk_level, '')) IN ('high', 'critical'))
    GROUP BY e.sector_id
  ),
  ewi AS (
    SELECT e.sector_id, count(*)::int AS n
    FROM public.prudential_ewi_alerts a
    JOIN ent e ON e.id = a.entity_id
    WHERE a.executed_at >= _since
      AND lower(COALESCE(a.severity, '')) IN ('high', 'critical')
      AND lower(COALESCE(a.status, '')) NOT IN ('closed', 'resolved', 'dismissed', 'cancelled', 'false_positive')
    GROUP BY e.sector_id
  ),
  assess AS (
    SELECT e.sector_id, count(*)::int AS n
    FROM public.prudential_assessments pa
    JOIN ent e ON e.id = pa.entity_id
    WHERE pa.created_at >= _since
      AND upper(COALESCE(pa.overall_rating, '')) IN ('4', '5', 'HIGH', 'CRITICAL', 'ADVERSE', 'UNSATISFACTORY')
    GROUP BY e.sector_id
  ),
  grp AS (
    SELECT DISTINCT e.sector_id, gm.group_id, gs.band
    FROM public.group_risk_scores gs
    JOIN public.financial_group_members gm ON gm.group_id = gs.group_id
    JOIN ent e ON e.id = gm.licensee_id
    WHERE gs.is_current
      AND lower(COALESCE(gs.band, '')) IN ('high', 'critical')
      AND (gm.end_date IS NULL OR gm.end_date >= current_date)
  ),
  grp_agg AS (
    SELECT g.sector_id, count(*)::int AS n FROM grp g GROUP BY g.sector_id
  ),
  acts AS (
    SELECT e.sector_id, count(*)::int AS n
    FROM public.prudential_actions pact
    JOIN ent e ON e.id = pact.entity_id
    WHERE lower(COALESCE(pact.severity, '')) IN ('high', 'critical')
      AND lower(COALESCE(pact.status, '')) NOT IN ('closed', 'cancelled', 'completed', 'withdrawn')
    GROUP BY e.sector_id
  ),
  base AS (
    SELECT s.id AS sector_id,
           s.name AS sector_name,
           (SELECT count(*) FROM ent e WHERE e.sector_id = s.id)::int AS entity_count,
           COALESCE(breaches.n, 0) AS ratio_breaches,
           COALESCE(ewi.n, 0) AS severe_ewi,
           COALESCE(assess.n, 0) AS adverse_assessments,
           COALESCE(grp_agg.n, 0) AS group_risk_signals,
           COALESCE(acts.n, 0) AS open_actions
    FROM public.sectors s
    LEFT JOIN breaches ON breaches.sector_id = s.id
    LEFT JOIN ewi ON ewi.sector_id = s.id
    LEFT JOIN assess ON assess.sector_id = s.id
    LEFT JOIN grp_agg ON grp_agg.sector_id = s.id
    LEFT JOIN acts ON acts.sector_id = s.id
  ),
  scored AS (
    SELECT b.*,
           (b.ratio_breaches + b.severe_ewi + b.adverse_assessments
            + b.group_risk_signals + b.open_actions) AS evidence_count,
           (b.ratio_breaches * 3 + b.severe_ewi * 4 + b.adverse_assessments * 5
            + b.group_risk_signals * 3 + b.open_actions * 2)::numeric AS weighted
    FROM base b
  )
  SELECT sc.sector_id,
         sc.sector_name,
         sc.entity_count,
         sc.ratio_breaches,
         sc.severe_ewi,
         sc.adverse_assessments,
         sc.group_risk_signals,
         sc.open_actions,
         sc.evidence_count,
         CASE WHEN sc.evidence_count = 0 THEN NULL
              ELSE round(sc.weighted / GREATEST(sc.entity_count, 1), 2) END AS score,
         CASE
           WHEN sc.evidence_count = 0 THEN 'INSUFFICIENT_DATA'
           WHEN sc.weighted / GREATEST(sc.entity_count, 1) >= 8 THEN 'CRITICAL'
           WHEN sc.weighted / GREATEST(sc.entity_count, 1) >= 4 THEN 'HIGH'
           WHEN sc.weighted / GREATEST(sc.entity_count, 1) >= 1.5 THEN 'MEDIUM'
           ELSE 'LOW'
         END AS band
  FROM scored sc
  ORDER BY (sc.evidence_count = 0), sc.weighted / GREATEST(sc.entity_count, 1) DESC, sc.sector_name;
END;
$$;

REVOKE ALL ON FUNCTION public.prudential_sector_risk(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_sector_risk(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.prudential_sector_risk(integer) IS
'Phase 11: sector-level prudential risk from unacknowledged threshold breaches (w3), severe open EWI alerts (w4), adverse assessments (w5), high/critical group risk signals (w3) and open high-severity supervisory actions (w2), normalised per entity. Bands: CRITICAL >= 8, HIGH >= 4, MEDIUM >= 1.5, LOW > 0, INSUFFICIENT_DATA when no evidence rows exist.';