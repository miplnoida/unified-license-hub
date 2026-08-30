-- F8A / SR-24: R-229 prudential_entity_universe generic-plan performance defect.
-- Root cause: the SQL function is not inlinable (CTEs + DISTINCT ON + RETURNS TABLE),
-- so its body is cached as a GENERIC plan. With `_param IS NULL OR col = _param`
-- predicates the generic plan degrades to nested loops that re-evaluate the RLS
-- helper functions (can_read_licensee / can_read_entity_returns /
-- can_read_prudential_entity / has_permission / is_super_admin) tens of thousands of
-- times: 4.6 s and 233k shared buffer hits versus 236 ms / 6.7k with a custom plan.
-- Measured under the authenticated 8 s statement_timeout this intermittently raised
-- SQLSTATE 57014 on /prudential/assessments/:id.
--
-- Repair: force per-call custom planning for this function only. The signature,
-- returned columns, body, ordering, SECURITY INVOKER posture, search_path and grants
-- are byte-for-byte unchanged; no business semantics are altered.

CREATE OR REPLACE FUNCTION public.prudential_entity_universe(
  _sector_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS TABLE (
  entity_id uuid,
  entity_name text,
  status text,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  license_id text,
  assigned_supervisor_id uuid,
  systemic_importance text,
  latest_filing_id uuid,
  latest_filing_reference text,
  latest_period_label text,
  latest_period_end date,
  latest_filing_status text,
  latest_submitted_at timestamptz,
  latest_accepted_filing_id uuid,
  latest_accepted_period_end date,
  breach_count bigint,
  worst_breach text,
  open_ewi bigint,
  open_actions bigint,
  overdue_actions bigint,
  open_escalations bigint,
  stress_open bigint,
  latest_rating text,
  latest_rating_status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $$
  WITH ent AS (
    SELECT l.id, l.name, l.status, l.sector_id, l.sub_sector_id, l.category_id,
           l.license_id, l.assigned_supervisor_id, l.systemic_importance
      FROM public.licensees l
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
       AND (_status IS NULL OR l.status = _status)
       AND (_search IS NULL OR l.name ILIKE '%' || _search || '%')
  ),
  latest AS (
    SELECT DISTINCT ON (w.entity_id)
           w.entity_id, w.filing_id, w.filing_reference, w.period_label,
           w.period_end, w.status, w.submitted_at
      FROM public.v_return_filing_workflow_state w
      JOIN ent ON ent.id = w.entity_id
     WHERE w.status <> 'WITHDRAWN'
     ORDER BY w.entity_id, w.period_end DESC NULLS LAST, w.updated_at DESC NULLS LAST
  ),
  latest_accepted AS (
    SELECT DISTINCT ON (w.entity_id) w.entity_id, w.filing_id, w.period_end
      FROM public.v_return_filing_workflow_state w
      JOIN ent ON ent.id = w.entity_id
     WHERE w.status = 'ACCEPTED'
     ORDER BY w.entity_id, w.period_end DESC NULLS LAST
  ),
  breach AS (
    SELECT b.entity_id,
           count(*) AS breach_count,
           min(CASE lower(coalesce(b.risk_level, b.level, ''))
                 WHEN 'red' THEN 1 WHEN 'breach' THEN 1 WHEN 'critical' THEN 1 WHEN 'high' THEN 1
                 WHEN 'amber' THEN 2 WHEN 'warn' THEN 2 WHEN 'warning' THEN 2 WHEN 'medium' THEN 2
                 ELSE 3 END) AS worst_rank
      FROM public.v_prudential_current_breaches b
      JOIN ent ON ent.id = b.entity_id
     GROUP BY b.entity_id
  ),
  ewi AS (
    SELECT a.entity_id, count(*) AS open_ewi
      FROM public.prudential_ewi_alerts a
      JOIN ent ON ent.id = a.entity_id
     WHERE a.status = 'open'
     GROUP BY a.entity_id
  ),
  acts AS (
    SELECT a.entity_id,
           count(*) FILTER (WHERE a.status IN ('open','in_progress','overdue')) AS open_actions,
           count(*) FILTER (WHERE a.status = 'overdue') AS overdue_actions
      FROM public.prudential_actions a
      JOIN ent ON ent.id = a.entity_id
     GROUP BY a.entity_id
  ),
  esc AS (
    SELECT e.entity_id, count(*) AS open_escalations
      FROM public.prudential_escalations e
      JOIN ent ON ent.id = e.entity_id
     WHERE e.status IN ('open','under_review')
     GROUP BY e.entity_id
  ),
  stress AS (
    SELECT s.entity_id, count(*) AS stress_open
      FROM public.prudential_stress_events s
      JOIN ent ON ent.id = s.entity_id
     WHERE s.resolved_at IS NULL
     GROUP BY s.entity_id
  ),
  rated AS (
    SELECT DISTINCT ON (a.entity_id) a.entity_id, a.overall_rating, a.status
      FROM public.prudential_assessments a
      JOIN ent ON ent.id = a.entity_id
     WHERE a.status IN ('submitted','reviewed','approved','closed')
     ORDER BY a.entity_id,
              CASE WHEN a.status IN ('approved','closed') THEN 0 ELSE 1 END,
              coalesce(a.approved_at, a.reviewed_at, a.submitted_at, a.created_at) DESC
  )
  SELECT ent.id, ent.name, ent.status, ent.sector_id, ent.sub_sector_id, ent.category_id,
         ent.license_id, ent.assigned_supervisor_id, ent.systemic_importance,
         latest.filing_id, latest.filing_reference, latest.period_label, latest.period_end,
         latest.status, latest.submitted_at,
         latest_accepted.filing_id, latest_accepted.period_end,
         COALESCE(breach.breach_count, 0),
         CASE breach.worst_rank WHEN 1 THEN 'red' WHEN 2 THEN 'amber' WHEN 3 THEN 'green' ELSE NULL END,
         COALESCE(ewi.open_ewi, 0),
         COALESCE(acts.open_actions, 0),
         COALESCE(acts.overdue_actions, 0),
         COALESCE(esc.open_escalations, 0),
         COALESCE(stress.stress_open, 0),
         rated.overall_rating, rated.status
    FROM ent
    LEFT JOIN latest ON latest.entity_id = ent.id
    LEFT JOIN latest_accepted ON latest_accepted.entity_id = ent.id
    LEFT JOIN breach ON breach.entity_id = ent.id
    LEFT JOIN ewi ON ewi.entity_id = ent.id
    LEFT JOIN acts ON acts.entity_id = ent.id
    LEFT JOIN esc ON esc.entity_id = ent.id
    LEFT JOIN stress ON stress.entity_id = ent.id
    LEFT JOIN rated ON rated.entity_id = ent.id
   ORDER BY ent.name;
$$;

REVOKE ALL ON FUNCTION public.prudential_entity_universe(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prudential_entity_universe(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.prudential_entity_universe(uuid, text, text) TO authenticated, service_role;