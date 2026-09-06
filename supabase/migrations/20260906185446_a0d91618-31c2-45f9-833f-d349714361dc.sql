-- OS-02G1A — Portfolio Intelligence Scope, Peer & Trend Closure.
-- Read/intelligence layer only. No business tables, no scores, no queues.

/* ============================================================ 1. canonical peer engine convergence
   peer_ratio_snapshot keeps its signature and remains the single peer engine.
   Two corrections:
     (a) client-supplied _sector_id is never authority when _entity_id is given;
     (b) Model A — the peer population is restricted to entities the calling
         user is authorised to supervise in the PRUDENTIAL domain. Internal
         service-role/no-JWT execution (scheduled analysis, pgTAP) is
         unrestricted because there is no user remit to apply.                */
CREATE OR REPLACE FUNCTION public.peer_ratio_snapshot(
  _period_end date, _ratio_key text, _sector_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid, _min_peers integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sector uuid := _sector_id;
  v_category uuid := NULL;
  v_entity_value numeric := NULL;
  v_count int := 0;
  v_min int := GREATEST(COALESCE(_min_peers, 5), 1);
  v_stats jsonb;
  v_below int := 0;
  v_pct numeric := NULL;
  v_uid uuid := auth.uid();
  v_scoped boolean := false;
  v_model text;
BEGIN
  -- Peer population model (explicit architectural decision, OS-02G1A §2):
  -- Model A, authorised-population peers, whenever a user context exists.
  v_scoped := v_uid IS NOT NULL AND NOT public.is_super_admin(v_uid);
  v_model := CASE
               WHEN v_uid IS NULL THEN 'INTERNAL_UNSCOPED'
               WHEN v_scoped THEN 'AUTHORISED_POPULATION'
               ELSE 'SUPER_ADMIN_FULL_POPULATION' END;

  IF _entity_id IS NOT NULL THEN
    -- classification is derived server-side; the client sector is ignored.
    SELECT l.sector_id, l.category_id
      INTO v_sector, v_category
      FROM public.licensees l WHERE l.id = _entity_id;

    IF v_uid IS NOT NULL
       AND NOT public.supervisory_monitoring_scope_admits(v_uid, 'PRUDENTIAL', _entity_id, NULL, NULL) THEN
      RETURN jsonb_build_object(
        'ratio_key', _ratio_key, 'period_end', _period_end,
        'state', 'NOT_AUTHORISED', 'peer_count', 0, 'count', 0,
        'min_peers', v_min, 'entity_value', NULL, 'percentile', NULL,
        'peer_population_model', v_model,
        'reason', 'The requested entity is outside the caller''s authorised prudential supervisory scope.',
        'peer_group', jsonb_build_object('sector_id', NULL, 'category_id', NULL));
    END IF;
  END IF;

  WITH peers AS (
    SELECT DISTINCT ON (c.entity_id) c.entity_id, c.value_numeric AS value
      FROM public.v_return_metric_facts_current c
      JOIN public.licensees l ON l.id = c.entity_id
     WHERE upper(c.metric_code) = upper(_ratio_key)
       AND c.period_end = _period_end
       AND c.value_numeric IS NOT NULL
       AND (v_sector IS NULL OR l.sector_id = v_sector)
       AND (v_category IS NULL OR l.category_id = v_category)
       AND (NOT v_scoped
            OR public.supervisory_monitoring_scope_admits(v_uid, 'PRUDENTIAL', c.entity_id, NULL, NULL))
     ORDER BY c.entity_id, c.filing_updated_at DESC NULLS LAST
  )
  SELECT COUNT(*),
         MAX(CASE WHEN _entity_id IS NOT NULL AND entity_id = _entity_id THEN value END),
         jsonb_build_object(
           'min', MIN(value), 'max', MAX(value),
           'median', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value),
           'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value),
           'p90', PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY value),
           'average', AVG(value))
    INTO v_count, v_entity_value, v_stats
    FROM peers;

  IF v_count < v_min THEN
    RETURN jsonb_build_object(
      'ratio_key', _ratio_key, 'period_end', _period_end,
      'state', 'INSUFFICIENT_PEER_DATA', 'peer_count', v_count,
      'min_peers', v_min, 'count', v_count,
      'entity_value', v_entity_value,
      'peer_population_model', v_model,
      'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category));
  END IF;

  IF v_entity_value IS NOT NULL THEN
    WITH peers AS (
      SELECT DISTINCT ON (c.entity_id) c.entity_id, c.value_numeric AS value
        FROM public.v_return_metric_facts_current c
        JOIN public.licensees l ON l.id = c.entity_id
       WHERE upper(c.metric_code) = upper(_ratio_key)
         AND c.period_end = _period_end
         AND c.value_numeric IS NOT NULL
         AND (v_sector IS NULL OR l.sector_id = v_sector)
         AND (v_category IS NULL OR l.category_id = v_category)
         AND (NOT v_scoped
              OR public.supervisory_monitoring_scope_admits(v_uid, 'PRUDENTIAL', c.entity_id, NULL, NULL))
       ORDER BY c.entity_id, c.filing_updated_at DESC NULLS LAST
    )
    SELECT COUNT(*) INTO v_below FROM peers WHERE value < v_entity_value;
    v_pct := ROUND((v_below::numeric / v_count::numeric) * 10000) / 100;
  END IF;

  RETURN v_stats
    || jsonb_build_object(
         'ratio_key', _ratio_key, 'period_end', _period_end,
         'state', 'OK', 'peer_count', v_count, 'count', v_count,
         'min_peers', v_min, 'entity_value', v_entity_value,
         'percentile', v_pct,
         'peer_population_model', v_model,
         'peer_group', jsonb_build_object('sector_id', v_sector, 'category_id', v_category));
END $function$;

COMMENT ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) IS
'Canonical peer engine. Model A authorised-population peers: when a user context exists the peer set and the minimum-sample test are restricted to entities admitted by supervisory_monitoring_scope_admits(uid, ''PRUDENTIAL'', entity). Entity classification is derived server-side; a client-supplied sector never widens scope. No peer identity is returned. States: OK / INSUFFICIENT_PEER_DATA / NOT_AUTHORISED.';

REVOKE ALL ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peer_ratio_snapshot(date, text, uuid, uuid, integer) TO authenticated, service_role;

/* ============================================================ 2. peer wrapper — single call, canonical state */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_peer_view(
  _period_end date, _ratio_key text, _sector_id uuid DEFAULT NULL, _entity_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  _min int := public.prudential_min_peers();
  _snap jsonb;
  _state text;
BEGIN
  IF _entity_id IS NOT NULL
     AND NOT public.supervisory_monitoring_scope_admits(auth.uid(), 'PRUDENTIAL', _entity_id, NULL, NULL) THEN
    RETURN jsonb_build_object(
      'generated_at', now(), 'engine', 'peer_ratio_snapshot',
      'minimum_peers', _min, 'period_end', _period_end, 'ratio_key', _ratio_key,
      'sector_id', NULL, 'entity_id', _entity_id,
      'snapshot', '{}'::jsonb, 'state', 'NOT_AUTHORISED',
      'peer_population_model', 'AUTHORISED_POPULATION',
      'reason', 'The requested entity is outside the caller''s authorised prudential supervisory scope.',
      'note', 'Peer intelligence is gated by the canonical OS-02C supervisory scope contract.');
  END IF;

  -- one call to the canonical engine; the wrapper derives nothing of its own.
  _snap := COALESCE(public.peer_ratio_snapshot(_period_end, _ratio_key, _sector_id, _entity_id, _min),
                    '{}'::jsonb);

  _state := CASE upper(COALESCE(_snap->>'state',''))
              WHEN 'OK' THEN 'OK'
              WHEN 'INSUFFICIENT_PEER_DATA' THEN 'INSUFFICIENT_PEER_DATA'
              WHEN 'NOT_AUTHORISED' THEN 'NOT_AUTHORISED'
              ELSE 'PEER_RESULT_INVALID' END;

  RETURN jsonb_build_object(
    'generated_at', now(), 'engine', 'peer_ratio_snapshot',
    'minimum_peers', _min, 'period_end', _period_end, 'ratio_key', _ratio_key,
    'sector_id', _snap->'peer_group'->'sector_id', 'entity_id', _entity_id,
    'snapshot', _snap,
    'state', _state,
    'engine_state', _snap->>'state',
    'peer_population_model', COALESCE(_snap->>'peer_population_model', 'AUTHORISED_POPULATION'),
    'peer_count', COALESCE((_snap->>'peer_count')::int, 0),
    'reason', CASE WHEN _state = 'PEER_RESULT_INVALID'
                   THEN 'The canonical peer engine returned no recognisable state; no peer conclusion is published.'
                   ELSE _snap->>'reason' END,
    'note', 'The certified prudential peer engine is reused unchanged as the single calculation. Wrapper state is copied from the engine snapshot state; the minimum-sample guard is evaluated by the engine against the authorised peer population.');
END $fn$;

COMMENT ON FUNCTION public.supervisory_portfolio_peer_view(date, text, uuid, uuid) IS
'OS-02G1A: single call to peer_ratio_snapshot per request; wrapper state is derived from snapshot.state (OK / INSUFFICIENT_PEER_DATA / NOT_AUTHORISED / PEER_RESULT_INVALID). No second peer calculation and no invented JSON field.';

REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_peer_view(date, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_peer_view(date, text, uuid, uuid) TO authenticated, service_role;

/* ============================================================ 3. canonical supervisory-domain vocabulary */
CREATE OR REPLACE VIEW public.supervisory_domain_vocabulary
WITH (security_invoker = true) AS
SELECT a.domain_code,
       public.supervisory_domain_regulatory_function(a.domain_code) AS regulatory_function_id,
       a.manage_config_permission,
       a.methodology_approval_permission
  FROM public.supervisory_domain_authority a
 WHERE public.supervisory_domain_valid(a.domain_code)
   AND public.supervisory_domain_regulatory_function(a.domain_code) IS NOT NULL;

COMMENT ON VIEW public.supervisory_domain_vocabulary IS
'Canonical governed supervisory-domain vocabulary: domains carrying regulator authority (supervisory_domain_authority), valid per supervisory_domain_valid and mapped to an active regulatory function. Detectors are observation mechanisms and are never a portfolio definition.';

GRANT SELECT ON public.supervisory_domain_vocabulary TO authenticated, service_role;
REVOKE SELECT ON public.supervisory_domain_vocabulary FROM anon;

/* portfolio population is now detector-independent */
CREATE OR REPLACE VIEW public.supervisory_portfolio_entity
WITH (security_invoker = true) AS
SELECT
  l.id            AS entity_id,
  l.name          AS entity_name,
  l.sector_id,
  l.sub_sector_id,
  l.category_id,
  dm.domain_code,
  g.group_id,
  fg.group_code,
  fg.name         AS group_name,
  rs.residual_rating
FROM public.licensees l
CROSS JOIN (SELECT domain_code FROM public.supervisory_domain_vocabulary) dm
LEFT JOIN LATERAL (
  SELECT fm.group_id
    FROM public.financial_group_members fm
   WHERE fm.licensee_id = l.id
     AND (fm.end_date IS NULL OR fm.end_date >= CURRENT_DATE)
   ORDER BY fm.effective_date DESC NULLS LAST
   LIMIT 1) g ON true
LEFT JOIN public.financial_groups fg ON fg.id = g.group_id
LEFT JOIN public.entity_risk_state rs ON rs.entity_id = l.id AND rs.domain_code = dm.domain_code
WHERE public.supervisory_domain_applicable(l.id, dm.domain_code)
  AND public.supervisory_monitoring_scope_admits(auth.uid(), dm.domain_code, l.id, NULL, NULL);

COMMENT ON VIEW public.supervisory_portfolio_entity IS
'OS-02G1A authorised portfolio population = canonical governed domain (supervisory_domain_vocabulary) x domain applicability (supervisory_domain_perimeter) x regulatory remit (supervisory_monitoring_scope_admits). Independent of detector existence, activity or detection history; a domain with no detector honestly shows zero detected conditions.';

GRANT SELECT ON public.supervisory_portfolio_entity TO authenticated, service_role;
REVOKE SELECT ON public.supervisory_portfolio_entity FROM anon;

/* ============================================================ 4. window coverage / trend assessability */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_detector_window_coverage(
  _detector_code text, _from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH att AS (
    SELECT upper(COALESCE(r.status,'UNKNOWN')) AS status,
           COALESCE(r.completed_at, r.started_at) AS at,
           r.completed_at, r.trigger_kind
      FROM public.supervisory_detector_run r
     WHERE r.detector_code = _detector_code
       AND COALESCE(r.completed_at, r.started_at) >= _from
       AND COALESCE(r.completed_at, r.started_at) <= _to),
  latest AS (SELECT * FROM att ORDER BY at DESC LIMIT 1),
  agg AS (SELECT count(*) AS attempts,
                 count(*) FILTER (WHERE status = 'COMPLETED' AND completed_at IS NOT NULL) AS completed,
                 count(*) FILTER (WHERE status <> 'COMPLETED') AS failed_or_incomplete
            FROM att)
  SELECT jsonb_build_object(
    'from', _from, 'to', _to,
    'attempts', (SELECT attempts FROM agg),
    'completed_runs', (SELECT completed FROM agg),
    'failed_or_incomplete_runs', (SELECT failed_or_incomplete FROM agg),
    'latest_attempt_status', (SELECT status FROM latest),
    'latest_attempt_at', (SELECT at FROM latest),
    'assessable', CASE
        WHEN (SELECT attempts FROM agg) = 0 THEN false
        WHEN (SELECT completed FROM agg) = 0 THEN false
        WHEN (SELECT status FROM latest) <> 'COMPLETED' THEN false
        ELSE true END,
    'reason', CASE
        WHEN (SELECT attempts FROM agg) = 0 THEN 'NO_DETECTOR_ATTEMPT_IN_WINDOW'
        WHEN (SELECT completed FROM agg) = 0 THEN 'NO_COMPLETED_RUN_IN_WINDOW'
        WHEN (SELECT status FROM latest) <> 'COMPLETED'
          THEN 'LATEST_ATTEMPT_' || (SELECT status FROM latest)
        ELSE 'COMPLETED_RUN_IN_WINDOW' END);
$fn$;

COMMENT ON FUNCTION public.supervisory_portfolio_detector_window_coverage(text, timestamptz, timestamptz) IS
'OS-02G1A read-only detector execution coverage for one analytical window, reusing OS-02E supervisory_detector_run status semantics. A window is assessable only when it contains a COMPLETED run AND the latest authoritative attempt in it COMPLETED: a later FAILED/INCOMPLETE attempt means absence of conditions cannot be trusted. Failure to observe is never evidence of improvement.';

REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_detector_window_coverage(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_detector_window_coverage(text, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_portfolio_detector_assessable(
  _detector_code text, _since timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  SELECT COALESCE((public.supervisory_portfolio_detector_window_coverage(
                     _detector_code, _since, now()) ->> 'assessable')::boolean, false);
$fn$;

COMMENT ON FUNCTION public.supervisory_portfolio_detector_assessable(text, timestamptz) IS
'OS-02G1A: thin compatibility wrapper over supervisory_portfolio_detector_window_coverage for the window [_since, now()].';

REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_detector_assessable(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_detector_assessable(text, timestamptz) TO authenticated, service_role;

/* change lens — two-window assessability required before any trend is claimed */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_change_lens(
  _domain text DEFAULT NULL, _days integer DEFAULT 30,
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH w AS (
    SELECT COALESCE(_to, now()) AS to_at,
           COALESCE(_from, COALESCE(_to, now()) - make_interval(days => GREATEST(COALESCE(_days,30),1))) AS cur_from),
  w2 AS (SELECT to_at, cur_from, cur_from - (to_at - cur_from) AS prev_from FROM w),
  c AS (SELECT * FROM public.supervisory_portfolio_condition
         WHERE (_domain IS NULL OR domain_code = _domain)),
  occ AS (SELECT c.theme_key, c.domain_code, c.entity_id, c.signal_id, o.observed_at
            FROM c JOIN public.supervisory_signal_occurrence o ON o.signal_id = c.signal_id),
  t AS (SELECT DISTINCT theme_key, domain_code, theme_label FROM c),
  m AS (
    SELECT t.theme_key, t.domain_code, t.theme_label,
      (SELECT count(DISTINCT o.entity_id) FROM occ o, w2 WHERE o.theme_key=t.theme_key AND o.domain_code=t.domain_code
         AND o.observed_at >= w2.cur_from AND o.observed_at <= w2.to_at) AS cur_entities,
      (SELECT count(DISTINCT o.entity_id) FROM occ o, w2 WHERE o.theme_key=t.theme_key AND o.domain_code=t.domain_code
         AND o.observed_at >= w2.prev_from AND o.observed_at < w2.cur_from) AS prev_entities,
      (SELECT count(*) FROM occ o, w2 WHERE o.theme_key=t.theme_key AND o.domain_code=t.domain_code
         AND o.observed_at >= w2.cur_from AND o.observed_at <= w2.to_at) AS cur_occurrences,
      (SELECT count(*) FROM occ o, w2 WHERE o.theme_key=t.theme_key AND o.domain_code=t.domain_code
         AND o.observed_at >= w2.prev_from AND o.observed_at < w2.cur_from) AS prev_occurrences,
      (SELECT count(*) FROM c x, w2 WHERE x.theme_key=t.theme_key AND x.domain_code=t.domain_code
         AND x.first_detected_at >= w2.cur_from AND x.first_detected_at <= w2.to_at) AS new_conditions,
      (SELECT count(*) FROM c x, w2 WHERE x.theme_key=t.theme_key AND x.domain_code=t.domain_code
         AND x.condition_state='RESOLVED' AND x.resolved_at >= w2.cur_from AND x.resolved_at <= w2.to_at) AS resolved_conditions,
      (SELECT count(DISTINCT x.action_record_id) FROM c x WHERE x.theme_key=t.theme_key AND x.domain_code=t.domain_code
         AND x.response_overdue) AS overdue_responses,
      (SELECT count(*) FROM c x WHERE x.theme_key=t.theme_key AND x.domain_code=t.domain_code
         AND x.is_material AND x.condition_state='OPEN') AS material_open,
      (SELECT count(*) FROM c x WHERE x.theme_key=t.theme_key AND x.domain_code=t.domain_code
         AND x.severity IN ('critical','high') AND x.condition_state='OPEN') AS high_severity_open,
      (SELECT public.supervisory_portfolio_detector_window_coverage(t.theme_key, w2.cur_from, w2.to_at) FROM w2) AS cur_cov,
      (SELECT public.supervisory_portfolio_detector_window_coverage(t.theme_key, w2.prev_from, w2.cur_from - interval '1 microsecond') FROM w2) AS prev_cov
    FROM t),
  m2 AS (
    SELECT m.*,
      COALESCE((m.cur_cov->>'assessable')::boolean, false)  AS cur_assessable,
      COALESCE((m.prev_cov->>'assessable')::boolean, false) AS prev_assessable
      FROM m),
  cls AS (
    SELECT m2.*, CASE
      WHEN NOT (m2.cur_assessable AND m2.prev_assessable) THEN 'NOT_ASSESSABLE'
      WHEN m2.prev_entities = 0 AND m2.cur_entities > 0 THEN 'EMERGED'
      WHEN m2.cur_entities > m2.prev_entities OR m2.cur_occurrences > m2.prev_occurrences OR m2.new_conditions > 0 THEN 'WORSENING'
      WHEN m2.cur_entities < m2.prev_entities OR (m2.resolved_conditions > 0 AND m2.cur_entities = 0) THEN 'IMPROVING'
      WHEN m2.cur_entities > 0 THEN 'PERSISTENT'
      ELSE 'NOT_OBSERVED_IN_WINDOW' END AS change_state
    FROM m2)
  SELECT jsonb_build_object(
    'generated_at', now(),
    'domain', _domain,
    'window', (SELECT jsonb_build_object('current_from', cur_from, 'to', to_at, 'comparison_from', prev_from) FROM w2),
    'method', 'Historical comparison reconstructed from canonical timestamps (supervisory_signal.first_detected_at / resolved_at and supervisory_signal_occurrence.observed_at). No snapshot table is used.',
    'guard', 'A trend (EMERGED / WORSENING / IMPROVING / PERSISTENT) is published only when BOTH compared windows have trustworthy detector execution coverage; otherwise NOT_ASSESSABLE with a reason. A detector attempt that FAILED or did not complete is never read as zero observations or as improvement.',
    'assessability_source', 'supervisory_detector_run (OS-02E) via supervisory_portfolio_detector_window_coverage',
    'summary', (SELECT jsonb_object_agg(change_state, n) FROM (
        SELECT change_state, count(*) AS n FROM cls GROUP BY change_state) s),
    'rows', COALESCE((SELECT jsonb_agg(r ORDER BY r->>'change_state', (r->>'material_open')::int DESC) FROM (
      SELECT jsonb_build_object(
        'theme_key', theme_key, 'theme_label', theme_label, 'domain_code', domain_code,
        'change_state', change_state,
        'current_window_entities', cur_entities, 'comparison_window_entities', prev_entities,
        'current_window_occurrences', cur_occurrences, 'comparison_window_occurrences', prev_occurrences,
        'new_conditions_in_window', new_conditions, 'resolved_conditions_in_window', resolved_conditions,
        'material_open', material_open, 'high_severity_open', high_severity_open,
        'overdue_responses', overdue_responses,
        'detection_assessable', (cur_assessable AND prev_assessable),
        'current_window_assessable', cur_assessable,
        'comparison_window_assessable', prev_assessable,
        'current_window_assessability_reason', cur_cov->>'reason',
        'comparison_window_assessability_reason', prev_cov->>'reason',
        'current_window_latest_attempt_status', cur_cov->>'latest_attempt_status',
        'comparison_window_latest_attempt_status', prev_cov->>'latest_attempt_status',
        'current_window_coverage', cur_cov,
        'comparison_window_coverage', prev_cov) AS r FROM cls) q), '[]'::jsonb));
$fn$;

REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_change_lens(text, integer, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_change_lens(text, integer, timestamptz, timestamptz) TO authenticated, service_role;

/* ============================================================ 5. cross-domain: scoped risk states only */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_cross_domain(
  _limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH c AS (SELECT * FROM public.supervisory_portfolio_condition WHERE is_material AND condition_state = 'OPEN'),
  pe AS (SELECT entity_id, domain_code FROM public.supervisory_portfolio_entity),
  e AS (
    SELECT entity_id, min(entity_name) AS entity_name,
           count(DISTINCT domain_code) AS affected_domain_count,
           count(*) AS material_open_conditions,
           count(DISTINCT theme_key) AS theme_count,
           jsonb_agg(DISTINCT domain_code) AS domains,
           min(group_id::text) AS group_id
      FROM c GROUP BY entity_id HAVING count(DISTINCT domain_code) > 1)
  SELECT jsonb_build_object(
    'generated_at', now(),
    'statement', 'Domain co-occurrence only. No overall or composite risk rating is derived; approved risk ratings remain owned by the canonical assessment and entity_risk_state processes.',
    'risk_state_scope', 'Approved risk state is published only for entity x domain pairs inside the caller''s authorised portfolio population (supervisory_portfolio_entity). Domains outside the caller''s remit are withheld even when the entity itself is visible.',
    'entities', COALESCE((SELECT jsonb_agg(r ORDER BY (r->>'affected_domain_count')::int DESC,
                                              (r->>'material_open_conditions')::int DESC) FROM (
      SELECT jsonb_build_object(
        'entity_id', e.entity_id, 'entity_name', e.entity_name,
        'affected_domain_count', e.affected_domain_count, 'domains', e.domains,
        'material_open_conditions', e.material_open_conditions, 'theme_count', e.theme_count,
        'group_id', e.group_id,
        'approved_risk_state', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'domain_code', rs.domain_code, 'residual_rating', rs.residual_rating,
              'effective_from', rs.effective_from))
            FROM public.entity_risk_state rs
           WHERE rs.entity_id = e.entity_id
             AND EXISTS (SELECT 1 FROM pe WHERE pe.entity_id = rs.entity_id
                           AND pe.domain_code = rs.domain_code)), '[]'::jsonb),
        'href', '/supervision/entities/' || e.entity_id) AS r
        FROM e LIMIT GREATEST(COALESCE(_limit,100),1)) q), '[]'::jsonb));
$fn$;

REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_cross_domain(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_cross_domain(integer) TO authenticated, service_role;

/* ============================================================ 6. group membership visibility policy */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_group_intelligence(
  _domain text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH pe AS (SELECT * FROM public.supervisory_portfolio_entity WHERE group_id IS NOT NULL
                AND (_domain IS NULL OR domain_code = _domain)),
  c AS (SELECT * FROM public.supervisory_portfolio_condition WHERE group_id IS NOT NULL
          AND (_domain IS NULL OR domain_code = _domain)),
  g0 AS (
    SELECT fg.id AS group_id, fg.group_code, fg.name AS group_name, fg.holding_entity_id, fg.status,
      (SELECT count(*) FROM public.financial_group_members fm
        WHERE fm.group_id = fg.id AND (fm.end_date IS NULL OR fm.end_date >= CURRENT_DATE)) AS all_members,
      (SELECT count(*) FROM public.financial_group_members fm
        WHERE fm.group_id = fg.id AND (fm.end_date IS NULL OR fm.end_date >= CURRENT_DATE)
          AND EXISTS (SELECT 1 FROM pe WHERE pe.entity_id = fm.licensee_id AND pe.group_id = fg.id)) AS scoped_members
      FROM public.financial_groups fg
     WHERE EXISTS (SELECT 1 FROM pe WHERE pe.group_id = fg.id)),
  g AS (
    SELECT g0.group_id, g0.group_code, g0.group_name, g0.holding_entity_id, g0.status,
      g0.scoped_members AS visible_member_count,
      (g0.scoped_members = g0.all_members) AS full_membership_authorised,
      CASE WHEN g0.scoped_members = g0.all_members THEN g0.all_members ELSE NULL END AS canonical_member_count,
      CASE WHEN g0.scoped_members = g0.all_members
           THEN 'FULL_CANONICAL_MEMBERSHIP_AUTHORISED'
           ELSE 'SCOPED_VISIBLE_MEMBERSHIP_ONLY' END AS member_count_basis,
      (SELECT count(DISTINCT x.entity_id) FROM c x WHERE x.group_id = g0.group_id AND x.is_material AND x.condition_state='OPEN') AS members_with_material_open,
      (SELECT count(*) FROM c x WHERE x.group_id = g0.group_id AND x.is_material AND x.condition_state='OPEN') AS material_open_conditions,
      (SELECT count(DISTINCT x.domain_code) FROM c x WHERE x.group_id = g0.group_id AND x.is_material AND x.condition_state='OPEN') AS affected_domains,
      (SELECT count(DISTINCT x.action_record_id) FROM c x WHERE x.group_id = g0.group_id AND x.response_overdue) AS overdue_responses,
      (SELECT count(*) FROM c x WHERE x.group_id = g0.group_id AND x.unreviewed_material) AS unreviewed_material,
      (SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'member_count')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('theme_key', x.theme_key, 'theme_label', min(x.theme_label),
                                  'domain_code', x.domain_code,
                                  'member_count', count(DISTINCT x.entity_id),
                                  'condition_count', count(*)) AS t
          FROM c x WHERE x.group_id = g0.group_id AND x.is_material AND x.condition_state='OPEN'
         GROUP BY x.theme_key, x.domain_code HAVING count(DISTINCT x.entity_id) > 1) s) AS shared_themes,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_id', pe2.entity_id, 'entity_name', pe2.entity_name)), '[]'::jsonb)
         FROM (SELECT DISTINCT entity_id, entity_name FROM pe WHERE pe.group_id = g0.group_id) pe2) AS visible_members
      FROM g0)
  SELECT jsonb_build_object(
    'generated_at', now(), 'domain', _domain,
    'model', 'Aggregation over legal entities using the existing canonical financial group model (financial_groups / financial_group_members). Legal-entity truth is unchanged.',
    'membership_visibility_policy', 'Group membership totals are not disclosed beyond the caller''s authorised supervisory scope. visible_member_count counts only members inside the caller''s scoped portfolio population; canonical_member_count is published only when the caller is authorised for every current member (full_membership_authorised = true), otherwise it is null. Hidden member identifiers and names are never returned.',
    'groups', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.members_with_material_open DESC, g.group_name) FROM g), '[]'::jsonb),
    'provenance', jsonb_build_object(
      'membership_source', 'financial_group_members (current membership only)',
      'visibility', 'scoped visible membership; canonical totals withheld unless the caller is authorised for the whole group',
      'scope_contract', 'supervisory_monitoring_scope_admits via supervisory_portfolio_entity',
      'writes', 'none'));
$fn$;

REVOKE EXECUTE ON FUNCTION public.supervisory_portfolio_group_intelligence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_group_intelligence(text) TO authenticated, service_role;