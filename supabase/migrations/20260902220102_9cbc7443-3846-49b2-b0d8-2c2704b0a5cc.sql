-- Same read model, with drill-through routes aligned to the real workspace pages
-- already used by the enterprise work queue.
CREATE OR REPLACE FUNCTION public.entity_supervisory_360(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := public.sup_read_guard();
  _foundation jsonb;
  _domains jsonb;
  _header jsonb;
  _next jsonb;
BEGIN
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id required' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'entity_id', l.id,
    'name', l.name,
    'status', l.status,
    'systemic_importance', l.systemic_importance,
    'sector', s.name,
    'sector_code', s.code,
    'sub_sector', ss.name,
    'assigned_supervisor_id', l.assigned_supervisor_id,
    'licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', lic.id, 'license_number', lic.license_number,
               'license_type', lic.license_type, 'status', lic.status,
               'valid_from', lic.valid_from, 'valid_until', lic.valid_until,
               'is_primary', el.is_primary)
             ORDER BY el.is_primary DESC NULLS LAST, lic.valid_from DESC NULLS LAST)
        FROM public.entity_licenses el
        JOIN public.licenses lic ON lic.id = el.license_id
       WHERE el.entity_id = l.id), '[]'::jsonb),
    'group_memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'group_id', g.id, 'group_name', g.name, 'member_role', gm.member_role,
               'consolidation_treatment', gm.consolidation_treatment,
               'ownership_percentage', gm.ownership_percentage))
        FROM public.financial_group_members gm
        JOIN public.financial_groups g ON g.id = gm.group_id
       WHERE gm.licensee_id = l.id AND gm.end_date IS NULL), '[]'::jsonb)
  )
  INTO _foundation
  FROM public.licensees l
  LEFT JOIN public.sectors s ON s.id = l.sector_id
  LEFT JOIN public.sub_sectors ss ON ss.id = l.sub_sector_id
  WHERE l.id = _entity_id;

  IF _foundation IS NULL THEN
    RETURN jsonb_build_object('found', false, 'entity_id', _entity_id, 'generated_at', now());
  END IF;

  SELECT jsonb_agg(d.payload ORDER BY d.ord)
  INTO _domains
  FROM (
    SELECT dom.ord, jsonb_build_object(
      'domain_code', dom.domain_code,
      'is_assessed', (rs.id IS NOT NULL OR a.id IS NOT NULL),
      'residual_rating', rs.residual_rating,
      'inherent_rating', rs.inherent_rating,
      'control_rating', rs.control_rating,
      'prior_rating', mv.previous_rating,
      'trend', CASE WHEN rs.id IS NULL THEN NULL ELSE COALESCE(mv.trend,'STABLE') END,
      'last_review_date', rs.last_review_date,
      'next_review_date', COALESCE(rs.next_review_date, a.next_review_date),
      'assessment_overdue',
        COALESCE(COALESCE(rs.next_review_date, a.next_review_date) < current_date, false),
      'driving_assessment', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', a.id, 'reference', a.reference, 'assessment_type', a.assessment_type,
          'trigger_type', a.trigger_type, 'assessment_date', a.assessment_date,
          'period_start', a.period_start, 'period_end', a.period_end,
          'residual_rating', a.residual_rating, 'inherent_rating', a.inherent_rating,
          'control_rating', a.control_rating, 'approved_at', a.approved_at,
          'approved_by', a.approved_by, 'summary', a.summary,
          'is_driving_risk_state', (rs.driving_assessment_id IS NOT DISTINCT FROM a.id),
          'methodology', (SELECT jsonb_build_object('code', m.code, 'version', m.version, 'name', m.name)
                            FROM public.supervisory_methodology m WHERE m.id = a.methodology_id),
          'methodology_version', a.methodology_version,
          'route', CASE WHEN dom.domain_code = 'AML_CFT'
                        THEN '/supervision/aml/assessments/' || a.id
                        ELSE '/prudential/assessments/' || a.id END) END,
      'material_dimensions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'code', dm.dimension_code, 'group', dm.dimension_group,
                 'inherent', dm.inherent_rating, 'control', dm.control_rating,
                 'residual', dm.residual_rating, 'trend', dm.trend,
                 'rationale', dm.rationale, 'overridden', dm.is_overridden)
               ORDER BY dm.dimension_code)
          FROM public.supervisory_assessment_dimension dm
         WHERE dm.assessment_id = a.id
           AND upper(COALESCE(dm.residual_rating,'')) IN ('MEDIUM_HIGH','HIGH','SEVERE','CRITICAL')
        ), '[]'::jsonb),
      'open_attention', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id, 'reference', t.reference, 'title', t.title,
                 'priority', COALESCE(t.confirmed_priority, t.calculated_priority),
                 'status', t.status, 'owner_id', t.owner_id, 'team_id', t.team_id,
                 'target_review_date', t.target_review_date,
                 'route', '/conduct/attention/' || t.id)
               ORDER BY t.created_at DESC)
          FROM public.supervisory_attention t
         WHERE _entity_id = ANY(t.entity_ids)
           AND COALESCE(t.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND t.closed_at IS NULL), '[]'::jsonb),
      'current_plan', (
        SELECT jsonb_build_object('id', p.id, 'reference', p.reference, 'title', p.title,
                 'status', p.status, 'priority', p.priority, 'lead_officer_id', p.lead_officer_id,
                 'team_id', p.team_id, 'target_completion', p.target_completion,
                 'route', '/conduct/plans/' || p.id)
          FROM public.supervisory_plan p
         WHERE _entity_id = ANY(p.entity_ids)
           AND COALESCE(p.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND p.completed_at IS NULL
         ORDER BY p.activated_at DESC NULLS LAST, p.created_at DESC LIMIT 1),
      'active_intervention', (
        SELECT jsonb_build_object('id', v.id, 'reference', v.reference, 'title', v.title,
                 'intervention_type', v.intervention_type, 'status', v.status,
                 'owner_id', v.owner_id, 'team_id', v.team_id,
                 'route', '/conduct/interventions/' || v.id)
          FROM public.supervisory_intervention v
         WHERE v.licensee_id = _entity_id
           AND COALESCE(v.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND v.completed_at IS NULL
         ORDER BY v.activated_at DESC NULLS LAST, v.created_at DESC LIMIT 1),
      'active_examination', (
        SELECT jsonb_build_object('id', e.id, 'reference', e.reference, 'title', e.title,
                 'engagement_type', e.engagement_type, 'examination_type', e.examination_type,
                 'stage', e.stage, 'lead_examiner_id', e.lead_examiner_id,
                 'fieldwork_start', e.fieldwork_start, 'fieldwork_end', e.fieldwork_end,
                 'route', '/prudential/examinations/' || e.id)
          FROM public.examinations e
         WHERE e.entity_id = _entity_id
           AND COALESCE(e.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND e.closed_at IS NULL
         ORDER BY e.created_at DESC LIMIT 1),
      'open_findings', (SELECT count(*) FROM public.supervisory_finding f
         WHERE f.entity_id = _entity_id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
      'high_findings', (SELECT count(*) FROM public.supervisory_finding f
         WHERE f.entity_id = _entity_id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND upper(COALESCE(f.severity,'')) = 'HIGH'
           AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
      'critical_findings', (SELECT count(*) FROM public.supervisory_finding f
         WHERE f.entity_id = _entity_id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND upper(COALESCE(f.severity,'')) IN ('CRITICAL','SEVERE')
           AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
      'findings', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', f.id, 'reference', f.reference, 'title', f.title,
                 'severity', f.severity, 'status', f.status, 'due_date', f.due_date,
                 'route', '/conduct/findings/' || f.id) ORDER BY f.created_at DESC)
          FROM public.supervisory_finding f
         WHERE f.entity_id = _entity_id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')), '[]'::jsonb),
      'overdue_remediation', (SELECT count(*) FROM public.supervisory_remediation_action r
         WHERE r.entity_id = _entity_id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND r.target_date < current_date AND r.closed_at IS NULL
           AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')),
      'overdue_remediation_items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference,
                 'status', r.status, 'target_date', r.target_date,
                 'route', '/conduct/actions/' || r.id) ORDER BY r.target_date)
          FROM public.supervisory_remediation_action r
         WHERE r.entity_id = _entity_id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND r.target_date < current_date AND r.closed_at IS NULL
           AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')), '[]'::jsonb),
      'validation_pending', (SELECT count(*) FROM public.supervisory_remediation_action r
         WHERE r.entity_id = _entity_id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND r.completed_at IS NOT NULL AND r.closed_at IS NULL),
      'ineffective_remediation', (SELECT count(*) FROM public.supervisory_remediation_action r
         WHERE r.entity_id = _entity_id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND upper(COALESCE(r.effectiveness,'')) IN ('INEFFECTIVE','PARTIALLY_EFFECTIVE')),
      'active_enforcement', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', x.id, 'case_number', x.case_number,
                 'enforcement_type', x.enforcement_type, 'stage', x.stage, 'status', x.status,
                 'severity', x.severity, 'source_kind', x.source_kind,
                 'supervisory_finding_id', x.supervisory_finding_id,
                 'remediation_action_id', x.remediation_action_id,
                 'supervisory_assessment_id', x.supervisory_assessment_id,
                 'route', '/enforcement/' || x.id))
          FROM public.enforcement_actions x
         WHERE x.entity_id = _entity_id AND x.closed_at IS NULL
           AND (
             dom.domain_code = 'CROSS_DOMAIN' AND x.supervisory_finding_id IS NULL
               AND x.supervisory_assessment_id IS NULL
             OR EXISTS (SELECT 1 FROM public.supervisory_finding f
                         WHERE f.id = x.supervisory_finding_id
                           AND COALESCE(f.domain_code,'CROSS_DOMAIN') = dom.domain_code)
             OR EXISTS (SELECT 1 FROM public.supervisory_assessment sa
                         WHERE sa.id = x.supervisory_assessment_id
                           AND COALESCE(sa.domain_code,'CROSS_DOMAIN') = dom.domain_code)
           )), '[]'::jsonb),
      'reassessment', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', rr.id, 'trigger_kind', rr.trigger_kind,
                 'trigger_rationale', rr.trigger_rationale, 'requested_type', rr.requested_type,
                 'status', rr.status, 'due_date', rr.due_date,
                 'finding_id', rr.finding_id, 'remediation_action_id', rr.remediation_action_id,
                 'examination_id', rr.examination_id, 'signal_id', rr.signal_id,
                 'enforcement_action_id', rr.enforcement_action_id,
                 'fulfilled_assessment_id', rr.fulfilled_assessment_id,
                 'fulfilled_at', rr.fulfilled_at)
               ORDER BY rr.created_at DESC)
          FROM public.supervisory_reassessment_requirement rr
         WHERE rr.entity_id = _entity_id
           AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = dom.domain_code), '[]'::jsonb),
      'reassessment_required', EXISTS (
        SELECT 1 FROM public.supervisory_reassessment_requirement rr
         WHERE rr.entity_id = _entity_id
           AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = dom.domain_code
           AND upper(rr.status) IN ('REQUIRED','IN_PROGRESS')),
      'lead_officer_id', COALESCE(a.owner_id, rs.updated_by),
      'lead_team_id', a.team_id,
      'next_action', (
        SELECT jsonb_build_object('work_key', w.work_key, 'work_type', w.work_type,
                 'work_type_label', w.work_type_label, 'title', w.title, 'reference', w.reference,
                 'priority', w.priority, 'work_state', w.work_state, 'due_date', w.due_date,
                 'is_overdue', w.is_overdue, 'owner_id', w.effective_owner_id,
                 'team_id', w.effective_team_id, 'source_object', w.source_object,
                 'source_id', w.source_id, 'route', w.route,
                 'reason', w.work_type_label || ' outstanding on ' || COALESCE(w.reference, w.title))
          FROM public.supervisory_work_item w
         WHERE w.entity_id = _entity_id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = dom.domain_code
         ORDER BY w.sort_order, w.due_date NULLS LAST LIMIT 1)
    ) AS payload
    FROM (VALUES
      (1,'PRUDENTIAL'), (2,'AML_CFT'), (3,'MARKET_CONDUCT'),
      (4,'OPERATIONAL_RESILIENCE'), (5,'GOVERNANCE'), (6,'CROSS_DOMAIN')
    ) AS dom(ord, domain_code)
    LEFT JOIN public.entity_risk_state rs
           ON rs.entity_id = _entity_id AND rs.domain_code = dom.domain_code
    LEFT JOIN public.supervisory_assessment a
           ON a.id = rs.driving_assessment_id
    LEFT JOIN LATERAL (
      SELECT m.previous_rating, m.trend
        FROM public.entity_risk_state_movement m
       WHERE m.entity_id = _entity_id AND m.domain_code = dom.domain_code
       ORDER BY (m.new_assessment_id IS NOT DISTINCT FROM rs.driving_assessment_id) DESC,
                m.approved_at DESC NULLS LAST, m.created_at DESC
       LIMIT 1) mv ON true
  ) d;

  SELECT jsonb_build_object('work_key', w.work_key, 'work_type', w.work_type,
           'work_type_label', w.work_type_label, 'domain_code', w.domain_code,
           'title', w.title, 'reference', w.reference, 'priority', w.priority,
           'work_state', w.work_state, 'due_date', w.due_date, 'is_overdue', w.is_overdue,
           'owner_id', w.effective_owner_id, 'team_id', w.effective_team_id,
           'is_unassigned', w.is_unassigned, 'source_object', w.source_object,
           'source_id', w.source_id, 'route', w.route,
           'reason', w.work_type_label || ' is outstanding'
                     || CASE WHEN w.is_overdue THEN ' and past its due date' ELSE '' END
                     || CASE WHEN w.priority IS NOT NULL
                             THEN ' (priority ' || w.priority || ')' ELSE '' END)
  INTO _next
  FROM public.supervisory_work_item w
  WHERE w.entity_id = _entity_id
  ORDER BY w.sort_order, w.due_date NULLS LAST
  LIMIT 1;

  SELECT jsonb_build_object(
    'domains_assessed', (
      SELECT count(*) FROM jsonb_array_elements(_domains) e
       WHERE (e->>'is_assessed')::boolean),
    'domains_of_concern', COALESCE((
      SELECT jsonb_agg(e->>'domain_code')
        FROM jsonb_array_elements(_domains) e
       WHERE upper(COALESCE(e->>'residual_rating','')) IN ('MEDIUM_HIGH','HIGH','SEVERE','CRITICAL')), '[]'::jsonb),
    'highest_material_risk', (
      SELECT max(upper(e->>'residual_rating')) FROM jsonb_array_elements(_domains) e
       WHERE upper(COALESCE(e->>'residual_rating','')) IN ('MEDIUM_HIGH','HIGH','SEVERE','CRITICAL')),
    'cross_domain_concern_present', (
      SELECT count(*) > 1 FROM jsonb_array_elements(_domains) e
       WHERE upper(COALESCE(e->>'residual_rating','')) IN ('MEDIUM_HIGH','HIGH','SEVERE','CRITICAL')),
    'open_findings', (SELECT COALESCE(sum((e->>'open_findings')::int),0)
                        FROM jsonb_array_elements(_domains) e),
    'critical_findings', (SELECT COALESCE(sum((e->>'critical_findings')::int),0)
                        FROM jsonb_array_elements(_domains) e),
    'overdue_remediation', (SELECT COALESCE(sum((e->>'overdue_remediation')::int),0)
                        FROM jsonb_array_elements(_domains) e),
    'reassessment_required', (SELECT bool_or((e->>'reassessment_required')::boolean)
                        FROM jsonb_array_elements(_domains) e),
    'active_enforcement', (SELECT count(*) FROM public.enforcement_actions x
                            WHERE x.entity_id = _entity_id AND x.closed_at IS NULL),
    'open_work_items', (SELECT count(*) FROM public.supervisory_work_item w
                          WHERE w.entity_id = _entity_id),
    'overdue_work_items', (SELECT count(*) FROM public.supervisory_work_item w
                             WHERE w.entity_id = _entity_id AND w.is_overdue),
    'supervisory_priority', (SELECT max(upper(COALESCE(t.confirmed_priority, t.calculated_priority)))
                               FROM public.supervisory_attention t
                              WHERE _entity_id = ANY(t.entity_ids) AND t.closed_at IS NULL),
    'lead_team_id', (SELECT w.effective_team_id FROM public.supervisory_work_item w
                      WHERE w.entity_id = _entity_id AND w.effective_team_id IS NOT NULL
                      ORDER BY w.sort_order LIMIT 1),
    'restricted_matter_present', public.entity_restricted_matter_present(_entity_id)
  ) INTO _header;

  RETURN jsonb_build_object(
    'found', true,
    'generated_at', now(),
    'entity', _foundation,
    'summary', _header,
    'domains', COALESCE(_domains, '[]'::jsonb),
    'next_action', _next
  );
END $$;
