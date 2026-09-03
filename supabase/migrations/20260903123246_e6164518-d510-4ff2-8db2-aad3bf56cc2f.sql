-- EPIC 4 / W5 — Enterprise dashboard, portfolio and sector supervision read models.
CREATE OR REPLACE FUNCTION public.sup_domain_readable(_uid uuid, _domain_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE upper(COALESCE(_domain_code, 'CROSS_DOMAIN'))
    WHEN 'AML_CFT' THEN
      public.has_any_permission(_uid, ARRAY['supervisory_spine.view','aml_supervision.view'])
    WHEN 'PRUDENTIAL' THEN
      public.has_any_permission(_uid, ARRAY['supervisory_spine.view','prudential_supervision.view'])
    WHEN 'MARKET_CONDUCT' THEN
      public.has_any_permission(_uid, ARRAY['supervisory_spine.view','market_conduct.view'])
    WHEN 'OPERATIONAL_RESILIENCE' THEN
      public.has_any_permission(_uid, ARRAY['supervisory_spine.view','prudential_supervision.view'])
    WHEN 'GOVERNANCE' THEN
      public.has_any_permission(_uid, ARRAY['supervisory_spine.view','fit_and_proper.view','prudential_supervision.view'])
    ELSE
      public.has_any_permission(_uid, ARRAY['supervisory_spine.view','prudential_supervision.view',
                                            'aml_supervision.view','market_conduct.view'])
  END;
$$;
REVOKE ALL ON FUNCTION public.sup_domain_readable(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sup_domain_readable(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_portfolio(
  _domain text DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _rating text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _team_id uuid DEFAULT NULL,
  _concern_only boolean DEFAULT false,
  _multi_domain_only boolean DEFAULT false,
  _overdue_remediation_only boolean DEFAULT false,
  _reassessment_due_only boolean DEFAULT false,
  _assessment_overdue_only boolean DEFAULT false,
  _unassessed_only boolean DEFAULT false,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
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
  dom AS (
    SELECT
      e.id AS entity_id, d.domain_code,
      public.supervisory_domain_applicable(e.id, d.domain_code) AS is_applicable,
      rs.id IS NOT NULL AS is_assessed,
      rs.residual_rating, rs.inherent_rating, rs.control_rating,
      rs.last_review_date, rs.next_review_date, rs.driving_assessment_id,
      mv.trend, mv.previous_rating,
      (rs.next_review_date IS NOT NULL AND rs.next_review_date < current_date) AS assessment_overdue,
      (SELECT count(*) FROM public.supervisory_finding f
        WHERE f.entity_id = e.id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')) AS open_findings,
      (SELECT count(*) FROM public.supervisory_finding f
        WHERE f.entity_id = e.id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND upper(COALESCE(f.severity,'')) = 'HIGH'
          AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')) AS high_findings,
      (SELECT count(*) FROM public.supervisory_finding f
        WHERE f.entity_id = e.id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND upper(COALESCE(f.severity,'')) IN ('CRITICAL','SEVERE')
          AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')) AS critical_findings,
      (SELECT count(*) FROM public.supervisory_remediation_action r
        WHERE r.entity_id = e.id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND r.target_date < current_date AND r.closed_at IS NULL
          AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')) AS overdue_remediation,
      (SELECT count(*) FROM public.supervisory_remediation_action r
        WHERE r.entity_id = e.id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND r.completed_at IS NOT NULL AND r.closed_at IS NULL) AS validation_pending,
      (SELECT count(*) FROM public.supervisory_attention t
        WHERE e.id = ANY(t.entity_ids) AND COALESCE(t.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND t.closed_at IS NULL) AS open_attention,
      (SELECT COALESCE(t.confirmed_priority, t.calculated_priority) FROM public.supervisory_attention t
        WHERE e.id = ANY(t.entity_ids) AND COALESCE(t.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND t.closed_at IS NULL
        ORDER BY CASE upper(COALESCE(t.confirmed_priority, t.calculated_priority, ''))
                   WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
                   WHEN 'LOW' THEN 4 ELSE 5 END LIMIT 1) AS attention_priority,
      (SELECT jsonb_build_object('id', x.id, 'reference', x.reference, 'title', x.title,
                'stage', x.stage, 'engagement_type', x.engagement_type,
                'route', '/supervision/examinations/' || x.id)
         FROM public.examinations x
        WHERE x.entity_id = e.id AND COALESCE(x.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND x.closed_at IS NULL ORDER BY x.created_at DESC LIMIT 1) AS active_examination,
      (SELECT jsonb_build_object('id', p.id, 'reference', p.reference, 'title', p.title,
                'status', p.status, 'target_completion', p.target_completion,
                'route', '/supervision/plans/' || p.id)
         FROM public.supervisory_plan p
        WHERE e.id = ANY(p.entity_ids) AND COALESCE(p.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND p.completed_at IS NULL
        ORDER BY p.activated_at DESC NULLS LAST, p.created_at DESC LIMIT 1) AS current_plan,
      (SELECT jsonb_build_object('id', v.id, 'reference', v.reference, 'title', v.title,
                'intervention_type', v.intervention_type, 'status', v.status,
                'route', '/supervision/interventions/' || v.id)
         FROM public.supervisory_intervention v
        WHERE v.licensee_id = e.id AND COALESCE(v.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND v.completed_at IS NULL
        ORDER BY v.activated_at DESC NULLS LAST, v.created_at DESC LIMIT 1) AS active_intervention,
      EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
               WHERE rr.entity_id = e.id AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = d.domain_code
                 AND upper(rr.status) IN ('REQUIRED','IN_PROGRESS')) AS reassessment_required,
      (SELECT count(*) FROM public.enforcement_actions x
        WHERE x.entity_id = e.id AND x.closed_at IS NULL
          AND (EXISTS (SELECT 1 FROM public.supervisory_finding f
                        WHERE f.id = x.supervisory_finding_id
                          AND COALESCE(f.domain_code,'CROSS_DOMAIN') = d.domain_code)
            OR EXISTS (SELECT 1 FROM public.supervisory_assessment sa
                        WHERE sa.id = x.supervisory_assessment_id
                          AND COALESCE(sa.domain_code,'CROSS_DOMAIN') = d.domain_code)
            OR (d.domain_code = 'CROSS_DOMAIN' AND x.supervisory_finding_id IS NULL
                AND x.supervisory_assessment_id IS NULL))) AS active_enforcement,
      (SELECT jsonb_build_object('work_key', w.work_key, 'work_type', w.work_type,
                'work_type_label', w.work_type_label, 'title', w.title, 'reference', w.reference,
                'priority', w.priority, 'work_state', w.work_state, 'due_date', w.due_date,
                'is_overdue', w.is_overdue, 'is_unassigned', w.is_unassigned,
                'owner_id', w.effective_owner_id, 'team_id', w.effective_team_id,
                'source_object', w.source_object, 'source_id', w.source_id, 'route', w.route,
                'reason', w.work_type_label || ' outstanding on ' || COALESCE(w.reference, w.title, 'this case'))
         FROM public.supervisory_work_item w
        WHERE w.entity_id = e.id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = d.domain_code
        ORDER BY w.sort_order, w.due_date NULLS LAST LIMIT 1) AS next_action,
      (SELECT count(*) FROM public.supervisory_work_item w
        WHERE w.entity_id = e.id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = d.domain_code) AS open_work_items,
      (SELECT count(*) FROM public.supervisory_work_item w
        WHERE w.entity_id = e.id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND w.is_overdue) AS overdue_work_items,
      (SELECT w.effective_team_id FROM public.supervisory_work_item w
        WHERE w.entity_id = e.id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = d.domain_code
          AND w.effective_team_id IS NOT NULL ORDER BY w.sort_order LIMIT 1) AS lead_team_id
      FROM ents e
      CROSS JOIN unnest(_doms) AS d(domain_code)
      LEFT JOIN public.entity_risk_state rs
             ON rs.entity_id = e.id AND rs.domain_code = d.domain_code
      LEFT JOIN LATERAL (
        SELECT m.trend, m.previous_rating
          FROM public.entity_risk_state_movement m
         WHERE m.entity_id = e.id AND m.domain_code = d.domain_code
         ORDER BY m.created_at DESC LIMIT 1) mv ON true
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
  ent AS (
    SELECT e.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
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
          ORDER BY f.domain_code)
        FROM domf f WHERE f.entity_id = e.id), '[]'::jsonb) AS domains,
      (SELECT COALESCE(array_agg(f.domain_code ORDER BY f.domain_code), ARRAY[]::text[])
         FROM domf f WHERE f.entity_id = e.id AND f.is_concern) AS concern_domains,
      (SELECT count(*) FROM domf f WHERE f.entity_id = e.id AND f.is_applicable) AS applicable_domains,
      (SELECT count(*) FROM domf f WHERE f.entity_id = e.id AND f.is_applicable AND f.is_assessed) AS assessed_domains,
      (SELECT COALESCE(sum(f.open_findings),0) FROM domf f WHERE f.entity_id = e.id) AS open_findings,
      (SELECT COALESCE(sum(f.critical_findings),0) FROM domf f WHERE f.entity_id = e.id) AS critical_findings,
      (SELECT COALESCE(sum(f.overdue_remediation),0) FROM domf f WHERE f.entity_id = e.id) AS overdue_remediation,
      (SELECT COALESCE(sum(f.open_attention),0) FROM domf f WHERE f.entity_id = e.id) AS open_attention,
      (SELECT COALESCE(sum(f.active_enforcement),0) FROM domf f WHERE f.entity_id = e.id) AS active_enforcement,
      (SELECT COALESCE(sum(f.open_work_items),0) FROM domf f WHERE f.entity_id = e.id) AS open_work_items,
      (SELECT COALESCE(sum(f.overdue_work_items),0) FROM domf f WHERE f.entity_id = e.id) AS overdue_work_items,
      (SELECT bool_or(f.reassessment_required) FROM domf f WHERE f.entity_id = e.id) AS reassessment_required,
      (SELECT bool_or(f.assessment_overdue) FROM domf f WHERE f.entity_id = e.id AND f.is_applicable) AS assessment_overdue,
      (SELECT max(CASE upper(COALESCE(f.residual_rating,''))
                    WHEN 'CRITICAL' THEN 5 WHEN 'SEVERE' THEN 5 WHEN 'HIGH' THEN 4
                    WHEN 'MEDIUM_HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END)
         FROM domf f WHERE f.entity_id = e.id AND f.is_applicable) AS rating_rank,
      (SELECT f.residual_rating FROM domf f
        WHERE f.entity_id = e.id AND f.is_applicable
        ORDER BY CASE upper(COALESCE(f.residual_rating,''))
                   WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
                   WHEN 'MEDIUM_HIGH' THEN 4 WHEN 'MEDIUM' THEN 5 WHEN 'LOW' THEN 6 ELSE 7 END
        LIMIT 1) AS highest_residual_rating,
      (SELECT f.next_action FROM domf f
        WHERE f.entity_id = e.id AND f.next_action IS NOT NULL
        ORDER BY (f.next_action->>'is_overdue')::boolean DESC NULLS LAST,
                 (f.next_action->>'due_date') NULLS LAST LIMIT 1) AS next_action,
      (SELECT f.lead_team_id FROM domf f WHERE f.entity_id = e.id AND f.lead_team_id IS NOT NULL LIMIT 1) AS lead_team_id,
      public.entity_restricted_matter_present(e.id) AS restricted_matter_present
      FROM ents e
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
        'domains', p.domains)
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
$$;
REVOKE ALL ON FUNCTION public.supervisory_portfolio(text, uuid, text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio(text, uuid, text, text, uuid, boolean, boolean, boolean, boolean, boolean, boolean, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_sector_overview(_domain text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  _uid  uuid := public.sup_read_guard();
  _doms text[];
  _rows jsonb := '[]'::jsonb;
BEGIN
  SELECT array_agg(v.d ORDER BY v.ord) INTO _doms
    FROM (VALUES (1,'PRUDENTIAL'),(2,'AML_CFT'),(3,'MARKET_CONDUCT'),
                 (4,'OPERATIONAL_RESILIENCE'),(5,'GOVERNANCE'),(6,'CROSS_DOMAIN')) v(ord, d)
   WHERE public.sup_domain_readable(_uid, v.d)
     AND (_domain IS NULL OR upper(_domain) = v.d);

  IF _doms IS NULL THEN
    RETURN jsonb_build_object('generated_at', now(), 'authorised_domains', '[]'::jsonb, 'rows', '[]'::jsonb);
  END IF;

  WITH base AS (
    SELECT s.id AS sector_id, s.name AS sector_name, s.code AS sector_code,
           d.domain_code, l.id AS entity_id,
           public.supervisory_domain_applicable(l.id, d.domain_code) AS is_applicable,
           rs.residual_rating, rs.id IS NOT NULL AS is_assessed,
           (rs.next_review_date IS NOT NULL AND rs.next_review_date < current_date) AS assessment_overdue
      FROM public.licensees l
      JOIN public.sectors s ON s.id = l.sector_id
      CROSS JOIN unnest(_doms) AS d(domain_code)
      LEFT JOIN public.entity_risk_state rs
             ON rs.entity_id = l.id AND rs.domain_code = d.domain_code
  ),
  agg AS (
    SELECT b.sector_id, b.sector_name, b.sector_code, b.domain_code,
           count(*) AS entities,
           count(*) FILTER (WHERE b.is_applicable) AS in_perimeter,
           count(*) FILTER (WHERE NOT b.is_applicable) AS outside_perimeter,
           count(*) FILTER (WHERE b.is_applicable AND b.is_assessed) AS assessed,
           count(*) FILTER (WHERE b.is_applicable AND NOT b.is_assessed) AS unassessed,
           count(*) FILTER (WHERE b.is_applicable AND b.assessment_overdue) AS assessment_overdue
      FROM base b
     GROUP BY 1,2,3,4
  ),
  agg2 AS (
    SELECT r.sector_id, r.domain_code,
           jsonb_object_agg(r.rating, r.n) AS rating_distribution
      FROM (SELECT b.sector_id, b.domain_code,
                   upper(COALESCE(b.residual_rating,'UNRATED')) AS rating, count(*) AS n
              FROM base b WHERE b.is_applicable
             GROUP BY 1,2,3) r
     GROUP BY 1,2
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sector_id', a.sector_id, 'sector_name', a.sector_name, 'sector_code', a.sector_code,
    'domain_code', a.domain_code,
    'entities', a.entities, 'in_perimeter', a.in_perimeter, 'outside_perimeter', a.outside_perimeter,
    'assessed', a.assessed, 'unassessed', a.unassessed,
    'assessment_overdue', a.assessment_overdue,
    'rating_distribution', COALESCE(a2.rating_distribution, '{}'::jsonb),
    'open_findings', (SELECT count(*) FROM public.supervisory_finding f
                       JOIN public.licensees l2 ON l2.id = f.entity_id
                      WHERE l2.sector_id = a.sector_id
                        AND COALESCE(f.domain_code,'CROSS_DOMAIN') = a.domain_code
                        AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
    'critical_findings', (SELECT count(*) FROM public.supervisory_finding f
                           JOIN public.licensees l2 ON l2.id = f.entity_id
                          WHERE l2.sector_id = a.sector_id
                            AND COALESCE(f.domain_code,'CROSS_DOMAIN') = a.domain_code
                            AND upper(COALESCE(f.severity,'')) IN ('CRITICAL','SEVERE')
                            AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
    'overdue_remediation', (SELECT count(*) FROM public.supervisory_remediation_action r
                             JOIN public.licensees l2 ON l2.id = r.entity_id
                            WHERE l2.sector_id = a.sector_id
                              AND COALESCE(r.domain_code,'CROSS_DOMAIN') = a.domain_code
                              AND r.target_date < current_date AND r.closed_at IS NULL
                              AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')),
    'open_attention', (SELECT count(*) FROM public.supervisory_attention t
                        WHERE COALESCE(t.domain_code,'CROSS_DOMAIN') = a.domain_code
                          AND t.closed_at IS NULL
                          AND (t.sector_id = a.sector_id
                               OR a.sector_id = ANY(COALESCE(t.sector_ids, ARRAY[]::uuid[]))
                               OR EXISTS (SELECT 1 FROM public.licensees l3
                                           WHERE l3.id = ANY(COALESCE(t.entity_ids, ARRAY[]::uuid[]))
                                             AND l3.sector_id = a.sector_id))),
    'active_examinations', (SELECT count(*) FROM public.examinations x
                             JOIN public.licensees l2 ON l2.id = x.entity_id
                            WHERE l2.sector_id = a.sector_id
                              AND COALESCE(x.domain_code,'CROSS_DOMAIN') = a.domain_code
                              AND x.closed_at IS NULL),
    'active_interventions', (SELECT count(*) FROM public.supervisory_intervention v
                              JOIN public.licensees l2 ON l2.id = v.licensee_id
                             WHERE l2.sector_id = a.sector_id
                               AND COALESCE(v.domain_code,'CROSS_DOMAIN') = a.domain_code
                               AND v.completed_at IS NULL),
    'active_enforcement', (SELECT count(*) FROM public.enforcement_actions x
                            JOIN public.licensees l2 ON l2.id = x.entity_id
                           WHERE l2.sector_id = a.sector_id AND x.closed_at IS NULL)
  ) ORDER BY a.sector_name, a.domain_code), '[]'::jsonb)
  INTO _rows
  FROM agg a
  LEFT JOIN agg2 a2 ON a2.sector_id = a.sector_id AND a2.domain_code = a.domain_code;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'authorised_domains', to_jsonb(_doms),
    'rows', _rows,
    'sources', jsonb_build_object(
      'perimeter', 'public.supervisory_domain_perimeter',
      'risk', 'public.entity_risk_state',
      'findings', 'public.supervisory_finding',
      'remediation', 'public.supervisory_remediation_action',
      'attention', 'public.supervisory_attention',
      'programme', 'public.examinations / supervisory_intervention',
      'enforcement', 'public.enforcement_actions'));
END;
$$;
REVOKE ALL ON FUNCTION public.supervisory_sector_overview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_sector_overview(text) TO authenticated, service_role;