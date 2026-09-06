-- OS-02G1 — Portfolio, Thematic & Systemic Supervisory Intelligence Foundation
-- Read/intelligence layer only. No business tables, no risk scoring, no alerts,
-- no work queue. All truth is consumed from the canonical supervisory spine.

/* ------------------------------------------------------------------ scoped condition base */
CREATE OR REPLACE VIEW public.supervisory_portfolio_condition
WITH (security_invoker = true) AS
SELECT
  m.signal_id,
  m.entity_id,
  m.entity_name,
  m.domain_code,
  m.detector_code                                            AS theme_key,
  'DETECTOR'::text                                           AS theme_kind,
  COALESCE(d.name, m.detector_code)                          AS theme_label,
  COALESCE(d.source_kind, m.source_kind)                     AS theme_family,
  d.source_object                                            AS theme_source_object,
  m.severity,
  m.is_material,
  m.condition_state,
  m.first_detected_at,
  m.last_detected_at,
  m.last_occurrence_at,
  m.resolved_at,
  m.resolution_reason,
  m.occurrence_total,
  m.occurrence_days,
  m.is_reviewed,
  m.reviewed_at,
  m.disposition,
  m.action_type,
  m.action_record_id,
  m.action_source_table,
  m.action_reference,
  m.action_status,
  m.action_is_open,
  m.action_due_date,
  m.action_closed_at,
  m.recurred_after_review,
  m.recurred_after_action_opened,
  m.persists_after_action_closed,
  m.assurance_conditions,
  m.owner_id,
  m.owner_team_id,
  m.source_table,
  m.source_id,
  m.source_reference,
  l.sector_id,
  l.sub_sector_id,
  l.category_id,
  g.group_id,
  fg.group_code,
  fg.name                                                    AS group_name,
  rs.residual_rating                                         AS entity_residual_rating,
  ('RESPONSE_OVERDUE' = ANY (m.assurance_conditions))        AS response_overdue,
  (m.is_material AND NOT m.is_reviewed AND m.condition_state = 'OPEN') AS unreviewed_material
FROM public.supervisory_management_assurance_matter m
LEFT JOIN public.licensees l ON l.id = m.entity_id
LEFT JOIN LATERAL (
  SELECT dd.name, dd.source_kind, dd.source_object
    FROM public.supervisory_detector dd
   WHERE dd.code = m.detector_code
   ORDER BY dd.is_active DESC, dd.version DESC
   LIMIT 1) d ON true
LEFT JOIN LATERAL (
  SELECT fm.group_id
    FROM public.financial_group_members fm
   WHERE fm.licensee_id = m.entity_id
     AND (fm.end_date IS NULL OR fm.end_date >= CURRENT_DATE)
   ORDER BY fm.effective_date DESC NULLS LAST
   LIMIT 1) g ON true
LEFT JOIN public.financial_groups fg ON fg.id = g.group_id
LEFT JOIN public.entity_risk_state rs
       ON rs.entity_id = m.entity_id AND rs.domain_code = m.domain_code;

COMMENT ON VIEW public.supervisory_portfolio_condition IS
'OS-02G1 scoped condition read model. One row per canonical supervisory_signal admitted by supervisory_monitoring_scope_admits. Thematic identity is the governed detector code — never free text.';

GRANT SELECT ON public.supervisory_portfolio_condition TO authenticated;
GRANT SELECT ON public.supervisory_portfolio_condition TO service_role;

/* ------------------------------------------------------------------ authorised population */
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
CROSS JOIN (SELECT DISTINCT domain_code FROM public.supervisory_detector WHERE domain_code IS NOT NULL) dm
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
'OS-02G1 authorised portfolio population: entity x supervisory domain, applicable per supervisory_domain_perimeter and admitted by the certified OS-02C scope contract.';

GRANT SELECT ON public.supervisory_portfolio_entity TO authenticated;
GRANT SELECT ON public.supervisory_portfolio_entity TO service_role;

/* ------------------------------------------------------------------ detection assurance helper */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_detector_assessable(
  _detector_code text, _since timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.supervisory_detector_run r
     WHERE r.detector_code = _detector_code
       AND upper(r.status) = 'COMPLETED'
       AND r.completed_at IS NOT NULL
       AND r.completed_at >= _since);
$fn$;

COMMENT ON FUNCTION public.supervisory_portfolio_detector_assessable(text, timestamptz) IS
'OS-02G1: a detector that did not complete successfully in the window cannot be interpreted as improvement.';

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_detector_assessable(text, timestamptz) TO authenticated, service_role;

/* ------------------------------------------------------------------ portfolio overview */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_intelligence_overview(
  _domain text DEFAULT NULL, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH w AS (SELECT now() - make_interval(days => GREATEST(COALESCE(_days,30),1)) AS from_at, now() AS to_at),
  pe AS (SELECT * FROM public.supervisory_portfolio_entity
          WHERE _domain IS NULL OR domain_code = _domain),
  c AS (SELECT * FROM public.supervisory_portfolio_condition
          WHERE _domain IS NULL OR domain_code = _domain),
  mo AS (SELECT * FROM c WHERE is_material AND condition_state = 'OPEN')
  SELECT jsonb_build_object(
    'generated_at', now(),
    'domain', _domain,
    'window', (SELECT jsonb_build_object('days', GREATEST(COALESCE(_days,30),1), 'from', from_at, 'to', to_at) FROM w),
    'population', jsonb_build_object(
      'definition', 'Entities where the supervisory domain is applicable and the caller is authorised under the canonical supervisory scope contract.',
      'source_objects', jsonb_build_array('licensees', 'supervisory_domain_perimeter', 'supervisory_monitoring_scope_admits'),
      'authorised_entities', (SELECT count(DISTINCT entity_id) FROM pe),
      'authorised_entity_domains', (SELECT count(*) FROM pe),
      'entities_in_groups', (SELECT count(DISTINCT entity_id) FROM pe WHERE group_id IS NOT NULL)),
    'conditions', jsonb_build_object(
      'material_open_conditions', (SELECT count(*) FROM mo),
      'affected_entities', (SELECT count(DISTINCT entity_id) FROM mo),
      'unreviewed_material_conditions', (SELECT count(*) FROM c WHERE unreviewed_material),
      'unreviewed_material_entities', (SELECT count(DISTINCT entity_id) FROM c WHERE unreviewed_material),
      'material_open_occurrences', (SELECT COALESCE(sum(occurrence_total),0)::bigint FROM mo),
      'recurring_conditions', (SELECT count(*) FROM c WHERE occurrence_days > 1),
      'recurrence_after_response', (SELECT count(*) FROM c WHERE recurred_after_action_opened OR persists_after_action_closed),
      'resolved_conditions', (SELECT count(*) FROM c WHERE condition_state = 'RESOLVED'),
      'observed_in_window', (SELECT count(*) FROM c, w WHERE COALESCE(c.last_occurrence_at, c.last_detected_at) >= w.from_at)),
    'responses', jsonb_build_object(
      'open_actions', (SELECT count(DISTINCT action_record_id) FROM c WHERE action_is_open),
      'overdue_responses', (SELECT count(DISTINCT action_record_id) FROM c WHERE response_overdue),
      'material_open_without_action', (SELECT count(*) FROM mo WHERE action_record_id IS NULL)),
    'themes', jsonb_build_object(
      'themes_present', (SELECT count(DISTINCT theme_key) FROM mo),
      'themes_across_multiple_entities', (SELECT count(*) FROM (
          SELECT theme_key FROM mo GROUP BY theme_key HAVING count(DISTINCT entity_id) > 1) t),
      'themes_across_multiple_groups', (SELECT count(*) FROM (
          SELECT theme_key FROM mo WHERE group_id IS NOT NULL GROUP BY theme_key HAVING count(DISTINCT group_id) > 1) t),
      'recurring_themes', (SELECT count(DISTINCT theme_key) FROM c WHERE occurrence_days > 1)),
    'cross_domain', jsonb_build_object(
      'entities_with_multiple_affected_domains', (SELECT count(*) FROM (
          SELECT entity_id FROM (SELECT * FROM public.supervisory_portfolio_condition
                                  WHERE is_material AND condition_state = 'OPEN') x
           GROUP BY entity_id HAVING count(DISTINCT domain_code) > 1) t),
      'note', 'Domain counts only. No composite or overall risk rating is derived here.'),
    'count_definitions', jsonb_build_object(
      'condition', 'One row of supervisory_signal (a distinct detected condition identity).',
      'occurrence', 'One row of supervisory_signal_occurrence (a repeat observation of the same condition).',
      'entity', 'One distinct licensees.id.',
      'action', 'One distinct canonical supervisory response record (attention, finding, remediation or reassessment requirement).'),
    'provenance', jsonb_build_object(
      'read_model', 'supervisory_portfolio_condition',
      'condition_source', 'supervisory_signal / supervisory_signal_occurrence via supervisory_management_assurance_matter',
      'review_source', 'supervisory_signal_review',
      'scope_contract', 'supervisory_monitoring_scope_admits',
      'writes', 'none — read-only intelligence layer'));
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_intelligence_overview(text, integer) TO authenticated, service_role;

/* ------------------------------------------------------------------ thematic register */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_theme_register(
  _domain text DEFAULT NULL, _days integer DEFAULT 30, _limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH w AS (SELECT GREATEST(COALESCE(_days,30),1) AS d,
                    now() - make_interval(days => GREATEST(COALESCE(_days,30),1)) AS cur_from,
                    now() - make_interval(days => 2 * GREATEST(COALESCE(_days,30),1)) AS prev_from,
                    now() AS to_at),
  c AS (SELECT * FROM public.supervisory_portfolio_condition
         WHERE (_domain IS NULL OR domain_code = _domain)),
  occ AS (
    SELECT c.theme_key, c.domain_code, c.entity_id, c.signal_id, o.observed_at
      FROM c JOIN public.supervisory_signal_occurrence o ON o.signal_id = c.signal_id),
  agg AS (
    SELECT
      c.theme_key, c.domain_code,
      min(c.theme_label)  AS theme_label,
      min(c.theme_family) AS theme_family,
      min(c.theme_source_object) AS theme_source_object,
      count(*)                                              AS condition_count,
      count(*) FILTER (WHERE c.condition_state = 'OPEN')     AS open_condition_count,
      count(*) FILTER (WHERE c.is_material AND c.condition_state = 'OPEN') AS material_open_count,
      count(DISTINCT c.entity_id)                            AS affected_entity_count,
      count(DISTINCT c.entity_id) FILTER (WHERE c.is_material AND c.condition_state = 'OPEN') AS material_entity_count,
      count(DISTINCT c.group_id)                             AS affected_group_count,
      count(DISTINCT c.sector_id)                            AS affected_sector_count,
      COALESCE(sum(c.occurrence_total),0)::bigint            AS occurrence_count,
      count(*) FILTER (WHERE c.is_reviewed)                  AS reviewed_count,
      count(*) FILTER (WHERE NOT c.is_reviewed)              AS unreviewed_count,
      count(*) FILTER (WHERE c.unreviewed_material)          AS unreviewed_material_count,
      count(*) FILTER (WHERE c.disposition = 'NO_ACTION_REQUIRED') AS no_action_required_count,
      count(*) FILTER (WHERE c.occurrence_days > 1)          AS recurrence_count,
      count(*) FILTER (WHERE c.condition_state = 'RESOLVED') AS resolved_count,
      count(*) FILTER (WHERE c.recurred_after_review)        AS reobserved_after_review_count,
      count(*) FILTER (WHERE c.recurred_after_action_opened) AS reobserved_after_response_count,
      count(*) FILTER (WHERE c.persists_after_action_closed) AS persists_after_response_count,
      count(DISTINCT c.action_record_id) FILTER (WHERE c.action_is_open) AS open_action_count,
      count(DISTINCT c.action_record_id) FILTER (WHERE c.response_overdue) AS overdue_response_count,
      count(*) FILTER (WHERE c.is_material AND c.condition_state = 'OPEN' AND c.action_record_id IS NULL) AS material_without_action_count,
      count(*) FILTER (WHERE 'MISSING_TRACEABILITY' = ANY (c.assurance_conditions)) AS weak_traceability_count,
      count(*) FILTER (WHERE c.owner_id IS NULL AND c.owner_team_id IS NULL) AS unowned_count,
      count(*) FILTER (WHERE c.severity = 'critical') AS severity_critical,
      count(*) FILTER (WHERE c.severity = 'high')     AS severity_high,
      count(*) FILTER (WHERE c.severity = 'medium')   AS severity_medium,
      count(*) FILTER (WHERE c.severity = 'low')      AS severity_low,
      count(*) FILTER (WHERE c.severity IS NULL OR c.severity NOT IN ('critical','high','medium','low')) AS severity_other,
      count(DISTINCT c.entity_residual_rating) FILTER (WHERE c.entity_residual_rating IN ('high','critical')) AS elevated_rating_bands,
      min(c.first_detected_at) AS first_observed,
      max(COALESCE(c.last_occurrence_at, c.last_detected_at)) AS last_observed
    FROM c GROUP BY c.theme_key, c.domain_code),
  win AS (
    SELECT a.theme_key, a.domain_code,
      (SELECT count(DISTINCT o.entity_id) FROM occ o, w
        WHERE o.theme_key = a.theme_key AND o.domain_code = a.domain_code
          AND o.observed_at >= w.cur_from) AS cur_entities,
      (SELECT count(DISTINCT o.entity_id) FROM occ o, w
        WHERE o.theme_key = a.theme_key AND o.domain_code = a.domain_code
          AND o.observed_at >= w.prev_from AND o.observed_at < w.cur_from) AS prev_entities,
      (SELECT count(*) FROM occ o, w
        WHERE o.theme_key = a.theme_key AND o.domain_code = a.domain_code
          AND o.observed_at >= w.cur_from) AS cur_occurrences,
      (SELECT count(*) FROM occ o, w
        WHERE o.theme_key = a.theme_key AND o.domain_code = a.domain_code
          AND o.observed_at >= w.prev_from AND o.observed_at < w.cur_from) AS prev_occurrences,
      (SELECT public.supervisory_portfolio_detector_assessable(a.theme_key, w.cur_from) FROM w) AS assessable
    FROM agg a),
  fin AS (
    SELECT a.*, x.cur_entities, x.prev_entities, x.cur_occurrences, x.prev_occurrences, x.assessable,
      CASE
        WHEN NOT x.assessable THEN 'NOT_ASSESSABLE'
        WHEN x.prev_entities = 0 AND x.cur_entities > 0 THEN 'EMERGED'
        WHEN x.cur_entities > x.prev_entities OR x.cur_occurrences > x.prev_occurrences THEN 'WORSENING'
        WHEN x.cur_entities < x.prev_entities OR (x.cur_occurrences < x.prev_occurrences AND x.cur_entities = x.prev_entities) THEN 'IMPROVING'
        WHEN x.cur_entities > 0 THEN 'PERSISTENT'
        ELSE 'NOT_OBSERVED_IN_WINDOW'
      END AS trend_direction
    FROM agg a JOIN win x ON x.theme_key = a.theme_key AND x.domain_code = a.domain_code)
  SELECT jsonb_build_object(
    'generated_at', now(),
    'domain', _domain,
    'window', (SELECT jsonb_build_object('days', d, 'current_from', cur_from, 'comparison_from', prev_from, 'to', to_at) FROM w),
    'theme_identity', jsonb_build_object(
      'kind', 'DETECTOR',
      'key_source', 'supervisory_signal.detector_code',
      'label_source', 'supervisory_detector.name',
      'family_source', 'supervisory_detector.source_kind',
      'rule', 'Deterministic canonical classification. No free-text or model-generated grouping.'),
    'themes', COALESCE((SELECT jsonb_agg(r ORDER BY (r->>'material_open_count')::int DESC,
                                            (r->>'affected_entity_count')::int DESC,
                                            r->>'theme_key') FROM (
      SELECT jsonb_build_object(
        'theme_key', f.theme_key, 'theme_kind', 'DETECTOR', 'theme_label', f.theme_label,
        'theme_family', f.theme_family, 'theme_source_object', f.theme_source_object,
        'domain_code', f.domain_code,
        'condition_count', f.condition_count, 'open_condition_count', f.open_condition_count,
        'material_open_count', f.material_open_count,
        'affected_entity_count', f.affected_entity_count,
        'material_entity_count', f.material_entity_count,
        'affected_group_count', f.affected_group_count,
        'affected_sector_count', f.affected_sector_count,
        'occurrence_count', f.occurrence_count,
        'reviewed_count', f.reviewed_count, 'unreviewed_count', f.unreviewed_count,
        'unreviewed_material_count', f.unreviewed_material_count,
        'no_action_required_count', f.no_action_required_count,
        'recurrence_count', f.recurrence_count, 'resolved_count', f.resolved_count,
        'reobserved_after_review_count', f.reobserved_after_review_count,
        'reobserved_after_response_count', f.reobserved_after_response_count,
        'persists_after_response_count', f.persists_after_response_count,
        'open_action_count', f.open_action_count,
        'overdue_response_count', f.overdue_response_count,
        'material_without_action_count', f.material_without_action_count,
        'weak_traceability_count', f.weak_traceability_count,
        'unowned_count', f.unowned_count,
        'severity_distribution', jsonb_build_object(
          'critical', f.severity_critical, 'high', f.severity_high,
          'medium', f.severity_medium, 'low', f.severity_low, 'other', f.severity_other),
        'first_observed', f.first_observed, 'last_observed', f.last_observed,
        'current_window_entities', f.cur_entities, 'comparison_window_entities', f.prev_entities,
        'current_window_occurrences', f.cur_occurrences, 'comparison_window_occurrences', f.prev_occurrences,
        'detection_assessable', f.assessable,
        'trend_direction', f.trend_direction,
        'response_effectiveness_indicators', (
          SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
            SELECT 'CONDITION_REOBSERVED_AFTER_RESPONSE'::text AS t WHERE f.reobserved_after_response_count > 0
            UNION ALL SELECT 'CONDITION_PERSISTS_AFTER_RESPONSE' WHERE f.persists_after_response_count > 0
            UNION ALL SELECT 'RESPONSE_OVERDUE' WHERE f.overdue_response_count > 0
            UNION ALL SELECT 'MATERIAL_CONDITION_WITHOUT_RESPONSE' WHERE f.material_without_action_count > 0
            UNION ALL SELECT 'REOBSERVED_AFTER_REVIEW' WHERE f.reobserved_after_review_count > 0) s(t)),
        'provenance', jsonb_build_object(
          'population', 'authorised scope only (supervisory_monitoring_scope_admits)',
          'source_objects', jsonb_build_array('supervisory_signal','supervisory_signal_occurrence','supervisory_signal_review','supervisory_detector','supervisory_detector_run'),
          'count_basis', 'condition_count = distinct supervisory_signal rows; occurrence_count = sum of canonical occurrence totals; affected_entity_count = distinct licensees.id',
          'trend_basis', 'distinct entities and occurrence rows observed in the current window versus the immediately preceding window of equal length',
          'drill_down', 'supervisory_portfolio_theme_detail')) AS r
        FROM fin f
       LIMIT GREATEST(COALESCE(_limit,100),1)) q), '[]'::jsonb));
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_theme_register(text, integer, integer) TO authenticated, service_role;

/* ------------------------------------------------------------------ theme drill-down */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_theme_detail(
  _theme_key text, _domain text DEFAULT NULL, _limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH c AS (SELECT * FROM public.supervisory_portfolio_condition
              WHERE theme_key = _theme_key AND (_domain IS NULL OR domain_code = _domain))
  SELECT jsonb_build_object(
    'generated_at', now(),
    'theme_key', _theme_key,
    'domain', _domain,
    'theme_label', (SELECT min(theme_label) FROM c),
    'headline', jsonb_build_object(
      'condition_count', (SELECT count(*) FROM c),
      'material_open_count', (SELECT count(*) FROM c WHERE is_material AND condition_state='OPEN'),
      'affected_entity_count', (SELECT count(DISTINCT entity_id) FROM c),
      'occurrence_count', (SELECT COALESCE(sum(occurrence_total),0)::bigint FROM c)),
    'entity_ids', COALESCE((SELECT jsonb_agg(DISTINCT entity_id) FROM c), '[]'::jsonb),
    'signal_ids', COALESCE((SELECT jsonb_agg(signal_id) FROM c), '[]'::jsonb),
    'action_ids', COALESCE((SELECT jsonb_agg(DISTINCT action_record_id) FROM c WHERE action_record_id IS NOT NULL), '[]'::jsonb),
    'conditions', COALESCE((SELECT jsonb_agg(r ORDER BY r->>'severity', r->>'last_observed' DESC) FROM (
      SELECT jsonb_build_object(
        'signal_id', c.signal_id, 'entity_id', c.entity_id, 'entity_name', c.entity_name,
        'domain_code', c.domain_code, 'severity', c.severity, 'is_material', c.is_material,
        'condition_state', c.condition_state, 'first_observed', c.first_detected_at,
        'last_observed', COALESCE(c.last_occurrence_at, c.last_detected_at),
        'occurrence_count', c.occurrence_total, 'occurrence_days', c.occurrence_days,
        'is_reviewed', c.is_reviewed, 'reviewed_at', c.reviewed_at, 'disposition', c.disposition,
        'action_type', c.action_type, 'action_record_id', c.action_record_id,
        'action_reference', c.action_reference, 'action_status', c.action_status,
        'action_is_open', c.action_is_open, 'response_overdue', c.response_overdue,
        'assurance_conditions', to_jsonb(c.assurance_conditions),
        'group_id', c.group_id, 'group_name', c.group_name,
        'sector_id', c.sector_id, 'entity_residual_rating', c.entity_residual_rating,
        'source', jsonb_build_object('table', c.source_table, 'id', c.source_id, 'reference', c.source_reference),
        'href', '/supervision/monitoring/conditions') AS r
        FROM c LIMIT GREATEST(COALESCE(_limit,500),1)) q), '[]'::jsonb));
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_theme_detail(text, text, integer) TO authenticated, service_role;

/* ------------------------------------------------------------------ what changed lens */
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
      (SELECT public.supervisory_portfolio_detector_assessable(t.theme_key, w2.cur_from) FROM w2) AS assessable
    FROM t),
  cls AS (
    SELECT m.*, CASE
      WHEN NOT m.assessable THEN 'NOT_ASSESSABLE'
      WHEN m.prev_entities = 0 AND m.cur_entities > 0 THEN 'EMERGED'
      WHEN m.cur_entities > m.prev_entities OR m.cur_occurrences > m.prev_occurrences OR m.new_conditions > 0 THEN 'WORSENING'
      WHEN m.cur_entities < m.prev_entities OR (m.resolved_conditions > 0 AND m.cur_entities = 0) THEN 'IMPROVING'
      WHEN m.cur_entities > 0 THEN 'PERSISTENT'
      ELSE 'NOT_OBSERVED_IN_WINDOW' END AS change_state
    FROM m)
  SELECT jsonb_build_object(
    'generated_at', now(),
    'domain', _domain,
    'window', (SELECT jsonb_build_object('current_from', cur_from, 'to', to_at, 'comparison_from', prev_from) FROM w2),
    'method', 'Historical comparison reconstructed from canonical timestamps (supervisory_signal.first_detected_at / resolved_at and supervisory_signal_occurrence.observed_at). No snapshot table is used.',
    'guard', 'A detector without a COMPLETED run inside the current window is reported as NOT_ASSESSABLE, never as improvement.',
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
        'detection_assessable', assessable) AS r FROM cls) q), '[]'::jsonb));
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_change_lens(text, integer, timestamptz, timestamptz) TO authenticated, service_role;

/* ------------------------------------------------------------------ financial group lens */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_group_intelligence(
  _domain text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH pe AS (SELECT * FROM public.supervisory_portfolio_entity WHERE group_id IS NOT NULL
                AND (_domain IS NULL OR domain_code = _domain)),
  c AS (SELECT * FROM public.supervisory_portfolio_condition WHERE group_id IS NOT NULL
          AND (_domain IS NULL OR domain_code = _domain)),
  g AS (
    SELECT fg.id AS group_id, fg.group_code, fg.name AS group_name, fg.holding_entity_id, fg.status,
      (SELECT count(*) FROM public.financial_group_members fm
        WHERE fm.group_id = fg.id AND (fm.end_date IS NULL OR fm.end_date >= CURRENT_DATE)) AS canonical_member_count,
      (SELECT count(DISTINCT pe.entity_id) FROM pe WHERE pe.group_id = fg.id) AS visible_member_count,
      (SELECT count(DISTINCT x.entity_id) FROM c x WHERE x.group_id = fg.id AND x.is_material AND x.condition_state='OPEN') AS members_with_material_open,
      (SELECT count(*) FROM c x WHERE x.group_id = fg.id AND x.is_material AND x.condition_state='OPEN') AS material_open_conditions,
      (SELECT count(DISTINCT x.domain_code) FROM c x WHERE x.group_id = fg.id AND x.is_material AND x.condition_state='OPEN') AS affected_domains,
      (SELECT count(DISTINCT x.action_record_id) FROM c x WHERE x.group_id = fg.id AND x.response_overdue) AS overdue_responses,
      (SELECT count(*) FROM c x WHERE x.group_id = fg.id AND x.unreviewed_material) AS unreviewed_material,
      (SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'member_count')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('theme_key', x.theme_key, 'theme_label', min(x.theme_label),
                                  'domain_code', x.domain_code,
                                  'member_count', count(DISTINCT x.entity_id),
                                  'condition_count', count(*)) AS t
          FROM c x WHERE x.group_id = fg.id AND x.is_material AND x.condition_state='OPEN'
         GROUP BY x.theme_key, x.domain_code HAVING count(DISTINCT x.entity_id) > 1) s) AS shared_themes,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_id', pe2.entity_id, 'entity_name', pe2.entity_name)), '[]'::jsonb)
         FROM (SELECT DISTINCT entity_id, entity_name FROM pe WHERE pe.group_id = fg.id) pe2) AS visible_members
    FROM public.financial_groups fg
    WHERE EXISTS (SELECT 1 FROM pe WHERE pe.group_id = fg.id))
  SELECT jsonb_build_object(
    'generated_at', now(), 'domain', _domain,
    'model', 'Aggregation over legal entities using the existing canonical financial group model (financial_groups / financial_group_members). Legal-entity truth is unchanged.',
    'groups', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.members_with_material_open DESC, g.group_name) FROM g), '[]'::jsonb),
    'provenance', jsonb_build_object(
      'membership_source', 'financial_group_members (current membership only)',
      'visibility', 'visible_member_count reflects only members inside the caller''s authorised scope; canonical_member_count is the full canonical membership',
      'writes', 'none'));
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_group_intelligence(text) TO authenticated, service_role;

/* ------------------------------------------------------------------ cross-domain lens */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_cross_domain(
  _limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  WITH c AS (SELECT * FROM public.supervisory_portfolio_condition WHERE is_material AND condition_state = 'OPEN'),
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
            FROM public.entity_risk_state rs WHERE rs.entity_id = e.entity_id), '[]'::jsonb),
        'href', '/supervision/entities/' || e.entity_id) AS r
        FROM e LIMIT GREATEST(COALESCE(_limit,100),1)) q), '[]'::jsonb));
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_cross_domain(integer) TO authenticated, service_role;

/* ------------------------------------------------------------------ peer lens (reuses existing capability) */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_peer_view(
  _period_end date, _ratio_key text, _sector_id uuid DEFAULT NULL, _entity_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'engine', 'peer_ratio_snapshot',
    'minimum_peers', public.prudential_min_peers(),
    'period_end', _period_end, 'ratio_key', _ratio_key,
    'sector_id', _sector_id, 'entity_id', _entity_id,
    'snapshot', COALESCE(public.peer_ratio_snapshot(_period_end, _ratio_key, _sector_id, _entity_id,
                                                    public.prudential_min_peers()), '{}'::jsonb),
    'state', CASE WHEN COALESCE((public.peer_ratio_snapshot(_period_end, _ratio_key, _sector_id, _entity_id,
                                    public.prudential_min_peers()) ->> 'insufficient')::boolean, true)
                  THEN 'INSUFFICIENT_PEER_DATA' ELSE 'OK' END,
    'note', 'Existing certified prudential peer capability is reused unchanged, including its minimum-sample safeguard.');
$fn$;

GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_peer_view(date, text, uuid, uuid) TO authenticated, service_role;