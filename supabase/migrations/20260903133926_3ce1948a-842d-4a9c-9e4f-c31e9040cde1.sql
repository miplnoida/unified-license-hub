-- =====================================================================
-- 1. conduct_interventions view — expose the four canonical spine columns
--    (domain_code, examination_id, thematic_review_id, investigation_id).
--    conduct_intervention_guard RETURNS supervisory_intervention while
--    declaring its row variable as this view's rowtype; the view had drifted
--    to 48 columns against the 52-column canonical record, so every
--    intervention case file failed with
--    "returned record type does not match expected record type".
--    Columns are appended, so existing readers are unaffected.
-- =====================================================================
CREATE OR REPLACE VIEW public.conduct_interventions AS
 SELECT id, reference, regulator_id, sector_id, licensee_id, theme,
        emerging_risk_id, priority_score_id, intervention_type, title, basis,
        expected_outcome, planned_start, planned_end, owner_id, status,
        proposed_by, proposed_at, decided_by, decided_at, decision_rationale,
        activated_at, completed_at, outcome_note, created_at, updated_at,
        attention_id, plan_id, catalogue_code, team_id, purpose, actual_start,
        actual_end, canonical_module, canonical_record_id, canonical_reference,
        canonical_route, evidence, outcome_result, outcome_rationale,
        outcome_findings, outstanding_actions, outcome_recorded_by,
        outcome_recorded_at, followup_due_date, followup_note,
        followup_completed_at, ai_insight_id,
        domain_code, examination_id, thematic_review_id, investigation_id
   FROM public.supervisory_intervention;

-- =====================================================================
-- 2. supervisory_portfolio — W5-17 performance.
--    Same canonical sources, same authority model (SECURITY INVOKER, RLS
--    applies, sup_read_guard + sup_domain_readable), same JSON contract.
--    Only the access pattern changes: every source is aggregated ONCE by
--    (entity_id, domain_code) and joined, instead of ~15 correlated
--    sub-selects evaluated per (entity x domain) pair.
--    The governed perimeter is joined from supervisory_domain_perimeter,
--    which is exactly what supervisory_domain_applicable() reads
--    (COALESCE(is_applicable, true) on a unique (entity_id, domain_code)).
--    Confidentiality still goes through entity_restricted_matter_present().
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_portfolio(
  _domain text DEFAULT NULL::text,
  _sector_id uuid DEFAULT NULL::uuid,
  _rating text DEFAULT NULL::text,
  _priority text DEFAULT NULL::text,
  _team_id uuid DEFAULT NULL::uuid,
  _concern_only boolean DEFAULT false,
  _multi_domain_only boolean DEFAULT false,
  _overdue_remediation_only boolean DEFAULT false,
  _reassessment_due_only boolean DEFAULT false,
  _assessment_overdue_only boolean DEFAULT false,
  _unassessed_only boolean DEFAULT false,
  _search text DEFAULT NULL::text,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _uid   uuid := public.sup_read_guard();
  _doms  text[];
  _lim   integer := LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
  _off   integer := GREATEST(COALESCE(_offset, 0), 0);
  _rows  jsonb := '[]'::jsonb;
  _sum   jsonb := '{}'::jsonb;
  _total integer := 0;
BEGIN
  SELECT array_agg(v.d ORDER BY v.ord) INTO _doms
    FROM (VALUES (1,'PRUDENTIAL'),(2,'AML_CFT'),(3,'MARKET_CONDUCT'),
                 (4,'OPERATIONAL_RESILIENCE'),(5,'GOVERNANCE'),(6,'CROSS_DOMAIN')) v(ord, d)
   WHERE public.sup_domain_readable(_uid, v.d)
     AND (_domain IS NULL OR upper(_domain) = v.d);

  IF _doms IS NULL THEN
    RETURN jsonb_build_object(
      'generated_at', now(), 'authorised_domains', '[]'::jsonb,
      'total', 0, 'limit', _lim, 'offset', _off,
      'summary', jsonb_build_object(), 'rows', '[]'::jsonb,
      'sources', jsonb_build_object('authority', 'public.sup_domain_readable'));
  END IF;

  WITH ents AS (
    SELECT l.id, l.name, l.status, l.systemic_importance,
           l.assigned_supervisor_id AS assigned_supervisory_officer,
           l.sector_id, s.name AS sector_name, s.code AS sector_code
      FROM public.licensees l
      LEFT JOIN public.sectors s ON s.id = l.sector_id
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
       AND (_search IS NULL OR _search = '' OR l.name ILIKE '%' || _search || '%')
  ),
  pairs AS (
    SELECT e.id AS entity_id, d.domain_code
      FROM ents e CROSS JOIN unnest(_doms) AS d(domain_code)
  ),
  fnd AS (
    SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) AS open_findings,
           count(*) FILTER (WHERE upper(COALESCE(f.severity,'')) = 'HIGH') AS high_findings,
           count(*) FILTER (WHERE upper(COALESCE(f.severity,'')) IN ('CRITICAL','SEVERE')) AS critical_findings
      FROM public.supervisory_finding f
     WHERE f.entity_id IS NOT NULL
       AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
     GROUP BY 1, 2
  ),
  rem AS (
    SELECT r.entity_id, COALESCE(r.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) FILTER (WHERE r.target_date < current_date AND r.closed_at IS NULL
                              AND upper(COALESCE(r.status,'')) NOT IN
                                  ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')) AS overdue_remediation,
           count(*) FILTER (WHERE r.completed_at IS NOT NULL AND r.closed_at IS NULL) AS validation_pending
      FROM public.supervisory_remediation_action r
     WHERE r.entity_id IS NOT NULL
     GROUP BY 1, 2
  ),
  att_rows AS (
    SELECT a.entity_id, COALESCE(t.domain_code,'CROSS_DOMAIN') AS domain_code,
           COALESCE(t.confirmed_priority, t.calculated_priority) AS priority,
           CASE upper(COALESCE(t.confirmed_priority, t.calculated_priority, ''))
             WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
             WHEN 'LOW' THEN 4 ELSE 5 END AS pri_rank
      FROM public.supervisory_attention t
      CROSS JOIN LATERAL unnest(COALESCE(t.entity_ids, ARRAY[]::uuid[])) AS a(entity_id)
     WHERE t.closed_at IS NULL
  ),
  att AS (
    SELECT entity_id, domain_code, count(*) AS open_attention,
           (array_agg(priority ORDER BY pri_rank))[1] AS attention_priority
      FROM att_rows GROUP BY 1, 2
  ),
  exam AS (
    SELECT DISTINCT ON (x.entity_id, COALESCE(x.domain_code,'CROSS_DOMAIN'))
           x.entity_id, COALESCE(x.domain_code,'CROSS_DOMAIN') AS domain_code,
           jsonb_build_object('id', x.id, 'reference', x.reference, 'title', x.title,
             'stage', x.stage, 'engagement_type', x.engagement_type,
             'route', '/supervision/examinations/' || x.id) AS active_examination
      FROM public.examinations x
     WHERE x.closed_at IS NULL AND x.entity_id IS NOT NULL
     ORDER BY x.entity_id, COALESCE(x.domain_code,'CROSS_DOMAIN'), x.created_at DESC
  ),
  plan_rows AS (
    SELECT a.entity_id, COALESCE(p.domain_code,'CROSS_DOMAIN') AS domain_code,
           p.id, p.reference, p.title, p.status, p.target_completion,
           p.activated_at, p.created_at
      FROM public.supervisory_plan p
      CROSS JOIN LATERAL unnest(COALESCE(p.entity_ids, ARRAY[]::uuid[])) AS a(entity_id)
     WHERE p.completed_at IS NULL
  ),
  plans AS (
    SELECT DISTINCT ON (entity_id, domain_code)
           entity_id, domain_code,
           jsonb_build_object('id', id, 'reference', reference, 'title', title,
             'status', status, 'target_completion', target_completion,
             'route', '/supervision/plans/' || id) AS current_plan
      FROM plan_rows
     ORDER BY entity_id, domain_code, activated_at DESC NULLS LAST, created_at DESC
  ),
  intv AS (
    SELECT DISTINCT ON (v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'))
           v.licensee_id AS entity_id, COALESCE(v.domain_code,'CROSS_DOMAIN') AS domain_code,
           jsonb_build_object('id', v.id, 'reference', v.reference, 'title', v.title,
             'intervention_type', v.intervention_type, 'status', v.status,
             'route', '/supervision/interventions/' || v.id) AS active_intervention
      FROM public.supervisory_intervention v
     WHERE v.completed_at IS NULL AND v.licensee_id IS NOT NULL
     ORDER BY v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'),
              v.activated_at DESC NULLS LAST, v.created_at DESC
  ),
  reas AS (
    SELECT rr.entity_id, COALESCE(rr.domain_code,'CROSS_DOMAIN') AS domain_code,
           true AS reassessment_required
      FROM public.supervisory_reassessment_requirement rr
     WHERE upper(rr.status) IN ('REQUIRED','IN_PROGRESS') AND rr.entity_id IS NOT NULL
     GROUP BY 1, 2
  ),
  enf_pairs AS (
    SELECT x.id, x.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN') AS domain_code
      FROM public.enforcement_actions x
      JOIN public.supervisory_finding f ON f.id = x.supervisory_finding_id
     WHERE x.closed_at IS NULL AND x.entity_id IS NOT NULL
    UNION
    SELECT x.id, x.entity_id, COALESCE(sa.domain_code,'CROSS_DOMAIN')
      FROM public.enforcement_actions x
      JOIN public.supervisory_assessment sa ON sa.id = x.supervisory_assessment_id
     WHERE x.closed_at IS NULL AND x.entity_id IS NOT NULL
    UNION
    SELECT x.id, x.entity_id, 'CROSS_DOMAIN'
      FROM public.enforcement_actions x
     WHERE x.closed_at IS NULL AND x.entity_id IS NOT NULL
       AND x.supervisory_finding_id IS NULL AND x.supervisory_assessment_id IS NULL
  ),
  enf AS (
    SELECT entity_id, domain_code, count(DISTINCT id) AS active_enforcement
      FROM enf_pairs GROUP BY 1, 2
  ),
  work AS (
    SELECT w.entity_id, COALESCE(w.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) AS open_work_items,
           count(*) FILTER (WHERE w.is_overdue) AS overdue_work_items,
           (array_agg(jsonb_build_object(
              'work_key', w.work_key, 'work_type', w.work_type,
              'work_type_label', w.work_type_label, 'title', w.title, 'reference', w.reference,
              'priority', w.priority, 'work_state', w.work_state, 'due_date', w.due_date,
              'is_overdue', w.is_overdue, 'is_unassigned', w.is_unassigned,
              'owner_id', w.effective_owner_id, 'team_id', w.effective_team_id,
              'source_object', w.source_object, 'source_id', w.source_id, 'route', w.route,
              'reason', w.work_type_label || ' outstanding on ' || COALESCE(w.reference, w.title, 'this case'))
              ORDER BY w.sort_order, w.due_date NULLS LAST))[1] AS next_action,
           (array_agg(w.effective_team_id ORDER BY w.sort_order)
              FILTER (WHERE w.effective_team_id IS NOT NULL))[1] AS lead_team_id
      FROM public.supervisory_work_item w
     WHERE w.entity_id IS NOT NULL
     GROUP BY 1, 2
  ),
  dom AS (
    SELECT
      p.entity_id, p.domain_code,
      COALESCE(pm.is_applicable, true) AS is_applicable,
      rs.id IS NOT NULL AS is_assessed,
      rs.residual_rating, rs.inherent_rating, rs.control_rating,
      rs.last_review_date, rs.next_review_date, rs.driving_assessment_id,
      mv.trend, mv.previous_rating,
      (rs.next_review_date IS NOT NULL AND rs.next_review_date < current_date) AS assessment_overdue,
      COALESCE(f.open_findings, 0) AS open_findings,
      COALESCE(f.high_findings, 0) AS high_findings,
      COALESCE(f.critical_findings, 0) AS critical_findings,
      COALESCE(r.overdue_remediation, 0) AS overdue_remediation,
      COALESCE(r.validation_pending, 0) AS validation_pending,
      COALESCE(a.open_attention, 0) AS open_attention,
      a.attention_priority,
      x.active_examination,
      pl.current_plan,
      iv.active_intervention,
      COALESCE(rq.reassessment_required, false) AS reassessment_required,
      COALESCE(en.active_enforcement, 0) AS active_enforcement,
      wk.next_action,
      COALESCE(wk.open_work_items, 0) AS open_work_items,
      COALESCE(wk.overdue_work_items, 0) AS overdue_work_items,
      wk.lead_team_id
      FROM pairs p
      LEFT JOIN public.supervisory_domain_perimeter pm
             ON pm.entity_id = p.entity_id AND pm.domain_code = p.domain_code
      LEFT JOIN public.entity_risk_state rs
             ON rs.entity_id = p.entity_id AND rs.domain_code = p.domain_code
      LEFT JOIN LATERAL (
        SELECT m.trend, m.previous_rating
          FROM public.entity_risk_state_movement m
         WHERE m.entity_id = p.entity_id AND m.domain_code = p.domain_code
         ORDER BY m.created_at DESC LIMIT 1) mv ON true
      LEFT JOIN fnd   f  ON f.entity_id  = p.entity_id AND f.domain_code  = p.domain_code
      LEFT JOIN rem   r  ON r.entity_id  = p.entity_id AND r.domain_code  = p.domain_code
      LEFT JOIN att   a  ON a.entity_id  = p.entity_id AND a.domain_code  = p.domain_code
      LEFT JOIN exam  x  ON x.entity_id  = p.entity_id AND x.domain_code  = p.domain_code
      LEFT JOIN plans pl ON pl.entity_id = p.entity_id AND pl.domain_code = p.domain_code
      LEFT JOIN intv  iv ON iv.entity_id = p.entity_id AND iv.domain_code = p.domain_code
      LEFT JOIN reas  rq ON rq.entity_id = p.entity_id AND rq.domain_code = p.domain_code
      LEFT JOIN enf   en ON en.entity_id = p.entity_id AND en.domain_code = p.domain_code
      LEFT JOIN work  wk ON wk.entity_id = p.entity_id AND wk.domain_code = p.domain_code
  ),
  domf AS (
    SELECT d.*,
      (d.is_applicable AND (
         upper(COALESCE(d.residual_rating,'')) IN ('MEDIUM_HIGH','HIGH','SEVERE','CRITICAL')
         OR d.critical_findings > 0 OR d.high_findings > 0
         OR d.overdue_remediation > 0 OR d.reassessment_required
         OR d.active_enforcement > 0)) AS is_concern
      FROM dom d
  ),
  ent_dom AS (
    SELECT f.entity_id,
      jsonb_agg(jsonb_build_object(
          'domain_code', f.domain_code, 'is_applicable', f.is_applicable,
          'is_assessed', f.is_assessed, 'is_concern', f.is_concern,
          'residual_rating', f.residual_rating, 'inherent_rating', f.inherent_rating,
          'control_rating', f.control_rating, 'previous_rating', f.previous_rating,
          'trend', f.trend, 'last_review_date', f.last_review_date,
          'next_review_date', f.next_review_date, 'assessment_overdue', f.assessment_overdue,
          'driving_assessment_id', f.driving_assessment_id,
          'open_findings', f.open_findings, 'high_findings', f.high_findings,
          'critical_findings', f.critical_findings,
          'overdue_remediation', f.overdue_remediation, 'validation_pending', f.validation_pending,
          'open_attention', f.open_attention, 'attention_priority', f.attention_priority,
          'active_examination', f.active_examination, 'current_plan', f.current_plan,
          'active_intervention', f.active_intervention,
          'reassessment_required', f.reassessment_required,
          'active_enforcement', f.active_enforcement,
          'open_work_items', f.open_work_items, 'overdue_work_items', f.overdue_work_items,
          'lead_team_id', f.lead_team_id, 'next_action', f.next_action)
          ORDER BY f.domain_code) AS domains,
      COALESCE(array_agg(f.domain_code ORDER BY f.domain_code) FILTER (WHERE f.is_concern),
               ARRAY[]::text[]) AS concern_domains,
      count(*) FILTER (WHERE f.is_applicable) AS applicable_domains,
      count(*) FILTER (WHERE f.is_applicable AND f.is_assessed) AS assessed_domains,
      COALESCE(sum(f.open_findings),0) AS open_findings,
      COALESCE(sum(f.critical_findings),0) AS critical_findings,
      COALESCE(sum(f.overdue_remediation),0) AS overdue_remediation,
      COALESCE(sum(f.open_attention),0) AS open_attention,
      COALESCE(sum(f.active_enforcement),0) AS active_enforcement,
      COALESCE(sum(f.open_work_items),0) AS open_work_items,
      COALESCE(sum(f.overdue_work_items),0) AS overdue_work_items,
      bool_or(f.reassessment_required) AS reassessment_required,
      bool_or(f.assessment_overdue) FILTER (WHERE f.is_applicable) AS assessment_overdue,
      max(CASE upper(COALESCE(f.residual_rating,''))
            WHEN 'CRITICAL' THEN 5 WHEN 'SEVERE' THEN 5 WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM_HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END)
        FILTER (WHERE f.is_applicable) AS rating_rank,
      (array_agg(f.residual_rating ORDER BY
          CASE upper(COALESCE(f.residual_rating,''))
            WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
            WHEN 'MEDIUM_HIGH' THEN 4 WHEN 'MEDIUM' THEN 5 WHEN 'LOW' THEN 6 ELSE 7 END)
        FILTER (WHERE f.is_applicable))[1] AS highest_residual_rating,
      (array_agg(f.next_action ORDER BY
          (f.next_action->>'is_overdue')::boolean DESC NULLS LAST,
          (f.next_action->>'due_date') NULLS LAST)
        FILTER (WHERE f.next_action IS NOT NULL))[1] AS next_action,
      (array_agg(f.lead_team_id) FILTER (WHERE f.lead_team_id IS NOT NULL))[1] AS lead_team_id
      FROM domf f GROUP BY f.entity_id
  ),
  ent AS (
    SELECT e.*, d.domains, d.concern_domains, d.applicable_domains, d.assessed_domains,
           d.open_findings, d.critical_findings, d.overdue_remediation, d.open_attention,
           d.active_enforcement, d.open_work_items, d.overdue_work_items,
           d.reassessment_required, d.assessment_overdue, d.rating_rank,
           d.highest_residual_rating, d.next_action, d.lead_team_id,
           public.entity_restricted_matter_present(e.id) AS restricted_matter_present
      FROM ents e
      LEFT JOIN ent_dom d ON d.entity_id = e.id
  ),
  filtered AS (
    SELECT * FROM ent x
     WHERE (NOT _concern_only OR array_length(x.concern_domains, 1) > 0)
       AND (NOT _multi_domain_only OR COALESCE(array_length(x.concern_domains, 1), 0) > 1)
       AND (NOT _overdue_remediation_only OR x.overdue_remediation > 0)
       AND (NOT _reassessment_due_only OR COALESCE(x.reassessment_required, false))
       AND (NOT _assessment_overdue_only OR COALESCE(x.assessment_overdue, false))
       AND (NOT _unassessed_only OR x.assessed_domains = 0)
       AND (_rating IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(x.domains) dd
              WHERE upper(COALESCE(dd->>'residual_rating','')) = upper(_rating)))
       AND (_priority IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(x.domains) dd
              WHERE upper(COALESCE(dd->>'attention_priority','')) = upper(_priority)))
       AND (_team_id IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(x.domains) dd
              WHERE (dd->>'lead_team_id')::uuid = _team_id))
  )
  SELECT
    (SELECT count(*) FROM filtered),
    jsonb_build_object(
      'entities', (SELECT count(*) FROM filtered),
      'entities_of_concern', (SELECT count(*) FROM filtered WHERE array_length(concern_domains,1) > 0),
      'multi_domain_concern', (SELECT count(*) FROM filtered WHERE COALESCE(array_length(concern_domains,1),0) > 1),
      'unassessed_entities', (SELECT count(*) FROM filtered WHERE assessed_domains = 0),
      'assessment_overdue', (SELECT count(*) FROM filtered WHERE COALESCE(assessment_overdue,false)),
      'reassessment_required', (SELECT count(*) FROM filtered WHERE COALESCE(reassessment_required,false)),
      'open_findings', (SELECT COALESCE(sum(open_findings),0) FROM filtered),
      'critical_findings', (SELECT COALESCE(sum(critical_findings),0) FROM filtered),
      'overdue_remediation', (SELECT COALESCE(sum(overdue_remediation),0) FROM filtered),
      'open_attention', (SELECT COALESCE(sum(open_attention),0) FROM filtered),
      'active_enforcement', (SELECT COALESCE(sum(active_enforcement),0) FROM filtered),
      'open_work_items', (SELECT COALESCE(sum(open_work_items),0) FROM filtered),
      'overdue_work_items', (SELECT COALESCE(sum(overdue_work_items),0) FROM filtered)
    ),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'entity_id', p.id, 'entity_name', p.name, 'status', p.status,
        'systemic_importance', p.systemic_importance,
        'sector_id', p.sector_id, 'sector_name', p.sector_name, 'sector_code', p.sector_code,
        'assigned_supervisor_id', p.assigned_supervisory_officer,
        'lead_team_id', p.lead_team_id,
        'highest_residual_rating', p.highest_residual_rating,
        'concern_domains', to_jsonb(p.concern_domains),
        'multi_domain_concern', COALESCE(array_length(p.concern_domains,1),0) > 1,
        'applicable_domains', p.applicable_domains,
        'assessed_domains', p.assessed_domains,
        'open_findings', p.open_findings, 'critical_findings', p.critical_findings,
        'overdue_remediation', p.overdue_remediation, 'open_attention', p.open_attention,
        'active_enforcement', p.active_enforcement,
        'open_work_items', p.open_work_items, 'overdue_work_items', p.overdue_work_items,
        'reassessment_required', COALESCE(p.reassessment_required,false),
        'assessment_overdue', COALESCE(p.assessment_overdue,false),
        'restricted_matter_present', p.restricted_matter_present,
        'next_action', p.next_action,
        'route', '/entities/' || p.id || '/360',
        'domains', COALESCE(p.domains, '[]'::jsonb))
        ORDER BY p.rating_rank DESC NULLS LAST, p.critical_findings DESC,
                 p.overdue_remediation DESC, p.name)
      FROM (SELECT * FROM filtered
             ORDER BY rating_rank DESC NULLS LAST, critical_findings DESC,
                      overdue_remediation DESC, name
             LIMIT _lim OFFSET _off) p), '[]'::jsonb)
  INTO _total, _sum, _rows;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'authorised_domains', to_jsonb(_doms),
    'total', _total, 'limit', _lim, 'offset', _off,
    'filters', jsonb_build_object(
      'domain', _domain, 'sector_id', _sector_id, 'rating', _rating, 'priority', _priority,
      'team_id', _team_id, 'concern_only', _concern_only, 'multi_domain_only', _multi_domain_only,
      'overdue_remediation_only', _overdue_remediation_only,
      'reassessment_due_only', _reassessment_due_only,
      'assessment_overdue_only', _assessment_overdue_only,
      'unassessed_only', _unassessed_only, 'search', _search),
    'summary', _sum,
    'rows', _rows,
    'sources', jsonb_build_object(
      'perimeter', 'public.supervisory_domain_perimeter / supervisory_domain_applicable',
      'risk', 'public.entity_risk_state + entity_risk_state_movement',
      'findings', 'public.supervisory_finding',
      'remediation', 'public.supervisory_remediation_action',
      'attention', 'public.supervisory_attention',
      'programme', 'public.supervisory_plan / supervisory_intervention / examinations',
      'reassessment', 'public.supervisory_reassessment_requirement',
      'enforcement', 'public.enforcement_actions',
      'work', 'public.supervisory_work_item'));
END;
$function$;

-- Index supporting the once-per-run remediation aggregate keyed by
-- (entity_id, domain_code) with the open/overdue predicates on closed_at.
CREATE INDEX IF NOT EXISTS idx_sup_remediation_entity_domain
  ON public.supervisory_remediation_action (entity_id, domain_code, closed_at);
