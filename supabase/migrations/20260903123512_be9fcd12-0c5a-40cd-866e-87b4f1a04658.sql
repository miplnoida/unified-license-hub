CREATE OR REPLACE FUNCTION public.enterprise_supervisory_overview(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  _uid    uuid := public.sup_read_guard();
  _doms   text[];
  _win    integer := GREATEST(COALESCE(_window_days, 30), 1);
  _since  timestamptz := now() - make_interval(days => GREATEST(COALESCE(_window_days, 30), 1));
  _risk   jsonb := '[]'::jsonb;
  _conc   jsonb := '{}'::jsonb;
  _prog   jsonb := '{}'::jsonb;
  _find   jsonb := '{}'::jsonb;
  _work   jsonb := '{}'::jsonb;
  _pay    jsonb := '{}'::jsonb;
  _att    jsonb := '{}'::jsonb;
BEGIN
  SELECT array_agg(v.d ORDER BY v.ord) INTO _doms
    FROM (VALUES (1,'PRUDENTIAL'),(2,'AML_CFT'),(3,'MARKET_CONDUCT'),
                 (4,'OPERATIONAL_RESILIENCE'),(5,'GOVERNANCE'),(6,'CROSS_DOMAIN')) v(ord, d)
   WHERE public.sup_domain_readable(_uid, v.d);

  IF _doms IS NULL THEN
    RETURN jsonb_build_object('generated_at', now(), 'authorised_domains', '[]'::jsonb,
                              'available', false);
  END IF;

  -- Entities in scope (RLS applies), with per-domain perimeter and risk state.
  WITH ents AS (
    SELECT l.id, l.sector_id FROM public.licensees l
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
  ),
  dom AS (
    SELECT e.id AS entity_id, d.domain_code,
           public.supervisory_domain_applicable(e.id, d.domain_code) AS is_applicable,
           rs.id IS NOT NULL AS is_assessed,
           upper(COALESCE(rs.residual_rating,'UNRATED')) AS rating,
           (rs.next_review_date IS NOT NULL AND rs.next_review_date < current_date) AS review_overdue
      FROM ents e
      CROSS JOIN unnest(_doms) AS d(domain_code)
      LEFT JOIN public.entity_risk_state rs
             ON rs.entity_id = e.id AND rs.domain_code = d.domain_code
  )
  SELECT COALESCE(jsonb_agg(x.payload ORDER BY x.domain_code), '[]'::jsonb) INTO _risk
    FROM (
      SELECT d.domain_code, jsonb_build_object(
        'domain_code', d.domain_code,
        'in_perimeter', count(*) FILTER (WHERE d.is_applicable),
        'outside_perimeter', count(*) FILTER (WHERE NOT d.is_applicable),
        'assessed', count(*) FILTER (WHERE d.is_applicable AND d.is_assessed),
        'unassessed', count(*) FILTER (WHERE d.is_applicable AND NOT d.is_assessed),
        'review_overdue', count(*) FILTER (WHERE d.is_applicable AND d.review_overdue),
        'rating_distribution', COALESCE((
          SELECT jsonb_object_agg(r.rating, r.n) FROM (
            SELECT d2.rating, count(*) AS n FROM dom d2
             WHERE d2.domain_code = d.domain_code AND d2.is_applicable AND d2.is_assessed
             GROUP BY 1) r), '{}'::jsonb),
        'movements_in_window', (
          SELECT count(*) FROM public.entity_risk_state_movement m
            JOIN ents e2 ON e2.id = m.entity_id
           WHERE m.domain_code = d.domain_code AND m.created_at >= _since),
        'deteriorations_in_window', (
          SELECT count(*) FROM public.entity_risk_state_movement m
            JOIN ents e2 ON e2.id = m.entity_id
           WHERE m.domain_code = d.domain_code AND m.created_at >= _since
             AND upper(COALESCE(m.trend,'')) IN ('DETERIORATING','WORSENING','ADVERSE'))
      ) AS payload
        FROM dom d GROUP BY d.domain_code) x;

  -- Entities of concern, sourced from the same canonical portfolio definition.
  WITH ents AS (
    SELECT l.id FROM public.licensees l
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
  ),
  conc AS (
    SELECT e.id AS entity_id, d.domain_code,
      (public.supervisory_domain_applicable(e.id, d.domain_code) AND (
        upper(COALESCE(rs.residual_rating,'')) IN ('MEDIUM_HIGH','HIGH','SEVERE','CRITICAL')
        OR EXISTS (SELECT 1 FROM public.supervisory_finding f
                    WHERE f.entity_id = e.id
                      AND COALESCE(f.domain_code,'CROSS_DOMAIN') = d.domain_code
                      AND upper(COALESCE(f.severity,'')) IN ('HIGH','CRITICAL','SEVERE')
                      AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED'))
        OR EXISTS (SELECT 1 FROM public.supervisory_remediation_action r
                    WHERE r.entity_id = e.id
                      AND COALESCE(r.domain_code,'CROSS_DOMAIN') = d.domain_code
                      AND r.target_date < current_date AND r.closed_at IS NULL
                      AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED'))
        OR EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                    WHERE rr.entity_id = e.id
                      AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = d.domain_code
                      AND upper(rr.status) IN ('REQUIRED','IN_PROGRESS'))
      )) AS is_concern
      FROM ents e
      CROSS JOIN unnest(_doms) AS d(domain_code)
      LEFT JOIN public.entity_risk_state rs
             ON rs.entity_id = e.id AND rs.domain_code = d.domain_code
  ),
  per_entity AS (
    SELECT entity_id, count(*) FILTER (WHERE is_concern) AS concern_domains FROM conc GROUP BY 1
  )
  SELECT jsonb_build_object(
    'entities_in_scope', (SELECT count(*) FROM per_entity),
    'entities_of_concern', (SELECT count(*) FROM per_entity WHERE concern_domains > 0),
    'multi_domain_concern', (SELECT count(*) FROM per_entity WHERE concern_domains > 1),
    'concern_by_domain', COALESCE((SELECT jsonb_object_agg(c.domain_code, c.n) FROM (
        SELECT domain_code, count(*) AS n FROM conc WHERE is_concern GROUP BY 1) c), '{}'::jsonb)
  ) INTO _conc;

  -- Supervisory programme delivery.
  SELECT jsonb_build_object(
    'plans_active', (SELECT count(*) FROM public.supervisory_plan p
                      WHERE p.completed_at IS NULL
                        AND COALESCE(p.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'plans_awaiting_approval', (SELECT count(*) FROM public.supervisory_plan p
                      WHERE p.approved_at IS NULL AND p.submitted_at IS NOT NULL
                        AND COALESCE(p.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'plans_overdue', (SELECT count(*) FROM public.supervisory_plan p
                      WHERE p.completed_at IS NULL AND p.target_completion < current_date
                        AND COALESCE(p.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'interventions_active', (SELECT count(*) FROM public.supervisory_intervention v
                      WHERE v.completed_at IS NULL
                        AND COALESCE(v.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'examinations_open', (SELECT count(*) FROM public.examinations x
                      WHERE x.closed_at IS NULL
                        AND COALESCE(x.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'examinations_by_stage', COALESCE((SELECT jsonb_object_agg(s.stage, s.n) FROM (
        SELECT COALESCE(x.stage,'unknown') AS stage, count(*) AS n FROM public.examinations x
         WHERE x.closed_at IS NULL AND COALESCE(x.domain_code,'CROSS_DOMAIN') = ANY(_doms)
         GROUP BY 1) s), '{}'::jsonb),
    'examinations_opened_in_window', (SELECT count(*) FROM public.examinations x
                      WHERE x.created_at >= _since
                        AND COALESCE(x.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'examinations_closed_in_window', (SELECT count(*) FROM public.examinations x
                      WHERE x.closed_at >= _since
                        AND COALESCE(x.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'assessments_awaiting_approval', (SELECT count(*) FROM public.supervisory_assessment a
                      WHERE upper(COALESCE(a.status,'')) IN ('SUBMITTED','UNDER_REVIEW','PENDING_APPROVAL')
                        AND COALESCE(a.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'reassessments_required', (SELECT count(*) FROM public.supervisory_reassessment_requirement rr
                      WHERE upper(rr.status) IN ('REQUIRED','IN_PROGRESS')
                        AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'reassessments_overdue', (SELECT count(*) FROM public.supervisory_reassessment_requirement rr
                      WHERE upper(rr.status) IN ('REQUIRED','IN_PROGRESS')
                        AND rr.due_date < current_date
                        AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = ANY(_doms))
  ) INTO _prog;

  -- Findings, remediation and enforcement health.
  SELECT jsonb_build_object(
    'findings_open', (SELECT count(*) FROM public.supervisory_finding f
                       WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
                         AND COALESCE(f.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'findings_by_severity', COALESCE((SELECT jsonb_object_agg(s.sev, s.n) FROM (
        SELECT upper(COALESCE(f.severity,'UNRATED')) AS sev, count(*) AS n
          FROM public.supervisory_finding f
         WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
           AND COALESCE(f.domain_code,'CROSS_DOMAIN') = ANY(_doms)
         GROUP BY 1) s), '{}'::jsonb),
    'findings_overdue', (SELECT count(*) FROM public.supervisory_finding f
                       WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
                         AND f.due_date < current_date
                         AND COALESCE(f.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'findings_awaiting_response', (SELECT count(*) FROM public.supervisory_finding f
                       WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
                         AND f.response_at IS NULL AND f.response_recorded_at IS NULL
                         AND COALESCE(f.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'findings_issued_in_window', (SELECT count(*) FROM public.supervisory_finding f
                       WHERE f.issued_at >= _since
                         AND COALESCE(f.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'findings_closed_in_window', (SELECT count(*) FROM public.supervisory_finding f
                       WHERE f.closed_at >= _since
                         AND COALESCE(f.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'remediation_open', (SELECT count(*) FROM public.supervisory_remediation_action r
                       WHERE r.closed_at IS NULL
                         AND COALESCE(r.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'remediation_overdue', (SELECT count(*) FROM public.supervisory_remediation_action r
                       WHERE r.closed_at IS NULL AND r.target_date < current_date
                         AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')
                         AND COALESCE(r.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'remediation_validation_pending', (SELECT count(*) FROM public.supervisory_remediation_action r
                       WHERE r.completed_at IS NOT NULL AND r.closed_at IS NULL
                         AND COALESCE(r.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'remediation_ineffective', (SELECT count(*) FROM public.supervisory_remediation_action r
                       WHERE upper(COALESCE(r.effectiveness,'')) IN ('INEFFECTIVE','PARTIALLY_EFFECTIVE')
                         AND COALESCE(r.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'enforcement_open', (SELECT count(*) FROM public.enforcement_actions x WHERE x.closed_at IS NULL),
    'enforcement_from_supervision', (SELECT count(*) FROM public.enforcement_actions x
                       WHERE x.closed_at IS NULL
                         AND (x.supervisory_finding_id IS NOT NULL OR x.supervisory_assessment_id IS NOT NULL)),
    'residual_acceptances', (SELECT count(*) FROM public.supervisory_residual_acceptance)
  ) INTO _find;

  -- Open supervisory attention.
  SELECT jsonb_build_object(
    'open', (SELECT count(*) FROM public.supervisory_attention t
              WHERE t.closed_at IS NULL AND COALESCE(t.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'by_priority', COALESCE((SELECT jsonb_object_agg(p.pri, p.n) FROM (
        SELECT upper(COALESCE(t.confirmed_priority, t.calculated_priority, 'UNSET')) AS pri, count(*) AS n
          FROM public.supervisory_attention t
         WHERE t.closed_at IS NULL AND COALESCE(t.domain_code,'CROSS_DOMAIN') = ANY(_doms)
         GROUP BY 1) p), '{}'::jsonb),
    'awaiting_priority_confirmation', (SELECT count(*) FROM public.supervisory_attention t
              WHERE t.closed_at IS NULL AND t.confirmed_at IS NULL
                AND COALESCE(t.domain_code,'CROSS_DOMAIN') = ANY(_doms)),
    'overdue_review', (SELECT count(*) FROM public.supervisory_attention t
              WHERE t.closed_at IS NULL AND t.target_review_date < current_date
                AND COALESCE(t.domain_code,'CROSS_DOMAIN') = ANY(_doms))
  ) INTO _att;

  -- Canonical work position (same model as My Work and every queue).
  SELECT jsonb_build_object(
    'open', count(*),
    'overdue', count(*) FILTER (WHERE w.is_overdue),
    'due_soon', count(*) FILTER (WHERE w.is_due_soon),
    'unassigned', count(*) FILTER (WHERE w.is_unassigned),
    'decision_points', count(*) FILTER (WHERE w.decision_point),
    'by_work_type', COALESCE((SELECT jsonb_object_agg(t.work_type_label, t.n) FROM (
        SELECT w2.work_type_label, count(*) AS n FROM public.supervisory_work_item w2
         WHERE COALESCE(w2.domain_code,'CROSS_DOMAIN') = ANY(_doms) GROUP BY 1) t), '{}'::jsonb)
  ) INTO _work
    FROM public.supervisory_work_item w
   WHERE COALESCE(w.domain_code,'CROSS_DOMAIN') = ANY(_doms);

  -- Payment systems and PFMI oversight (prudential domain authority).
  IF public.sup_domain_readable(_uid, 'PRUDENTIAL') THEN
    SELECT jsonb_build_object(
      'available', true,
      'operators', (SELECT count(*) FROM public.payment_system_operators o
                     WHERE COALESCE(o.status,'active') <> 'inactive'),
      'systemically_important', (SELECT count(*) FROM public.payment_system_operators o
                     WHERE o.systemically_important),
      'incidents_open', (SELECT count(*) FROM public.payment_system_incidents i
                     WHERE COALESCE(i.resolution_status,'open') NOT IN ('resolved','closed')),
      'incidents_in_window', (SELECT count(*) FROM public.payment_system_incidents i
                     WHERE i.occurred_at >= _since),
      'incidents_sla_breached', (SELECT count(*) FROM public.payment_system_incidents i
                     WHERE i.sla_breached),
      'pfmi_assessments_in_progress', (SELECT count(*) FROM public.pfmi_assessments a
                     WHERE upper(COALESCE(a.status,'')) <> 'COMPLETED'),
      'pfmi_assessments_completed', (SELECT count(*) FROM public.pfmi_assessments a
                     WHERE upper(COALESCE(a.status,'')) = 'COMPLETED'),
      'operators_without_current_pfmi', (SELECT count(*) FROM public.payment_system_operators o
                     WHERE o.last_pfmi_assessment_date IS NULL
                        OR o.last_pfmi_assessment_date < (current_date - interval '2 years'))
    ) INTO _pay;
  ELSE
    _pay := jsonb_build_object('available', false);
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'available', true,
    'authorised_domains', to_jsonb(_doms),
    'filters', jsonb_build_object('sector_id', _sector_id, 'window_days', _win),
    'window', jsonb_build_object('days', _win, 'since', _since, 'until', now()),
    'risk', _risk,
    'concern', _conc,
    'programme', _prog,
    'findings', _find,
    'attention', _att,
    'work', _work,
    'payment_systems', _pay,
    'sources', jsonb_build_object(
      'risk', 'public.entity_risk_state + entity_risk_state_movement',
      'perimeter', 'public.supervisory_domain_perimeter',
      'programme', 'public.supervisory_plan / supervisory_intervention / examinations / supervisory_assessment',
      'findings', 'public.supervisory_finding / supervisory_remediation_action / supervisory_residual_acceptance',
      'attention', 'public.supervisory_attention',
      'work', 'public.supervisory_work_item',
      'enforcement', 'public.enforcement_actions',
      'payment_systems', 'public.payment_system_operators / payment_system_incidents / pfmi_assessments'));
END;
$$;
REVOKE ALL ON FUNCTION public.enterprise_supervisory_overview(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enterprise_supervisory_overview(uuid, integer) TO authenticated, service_role;