
-- Fix lifecycle stage catalogue reference in the overview reader
CREATE OR REPLACE FUNCTION public.entity360_overview(_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u uuid := auth.uid();
  res jsonb;
  ent record;
BEGIN
  IF u IS NULL OR public.has_external_role(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, 'overview') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.name, l.status, l.public_slug, l.systemic_importance,
         s.name AS sector_name, ss.name AS sub_sector_name, c.name AS category_name,
         st.label AS identity_status, ls.label AS lifecycle_stage, l.party_id,
         l.merged_into_entity_id, l.structure_version
    INTO ent
  FROM public.licensees l
  LEFT JOIN public.sectors s ON s.id = l.sector_id
  LEFT JOIN public.sub_sectors ss ON ss.id = l.sub_sector_id
  LEFT JOIN public.categories c ON c.id = l.category_id
  LEFT JOIN public.entity_identity_statuses st ON st.id = l.identity_status_id
  LEFT JOIN public.lifecycle_stages ls ON ls.id = l.lifecycle_stage_id
  WHERE l.id = _entity_id;

  IF ent.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  res := jsonb_build_object(
    'found', true,
    'entity', jsonb_build_object(
      'id', ent.id, 'name', ent.name, 'status', ent.status,
      'public_slug', ent.public_slug, 'systemic_importance', ent.systemic_importance,
      'sector', ent.sector_name, 'sub_sector', ent.sub_sector_name, 'category', ent.category_name,
      'identity_status', ent.identity_status, 'lifecycle_stage', ent.lifecycle_stage,
      'party_id', ent.party_id, 'merged_into_entity_id', ent.merged_into_entity_id,
      'structure_version', ent.structure_version),
    'sections', (
      SELECT jsonb_object_agg(sec, public.e360_section_allowed(u, sec))
      FROM unnest(ARRAY['identity','licences','ownership','relationships','governance','fit_and_proper',
        'fit_and_proper_evidence','business_profile','prudential','returns','risk','supervision',
        'market_conduct','aml','aml_confidential','resilience','examinations','enforcement',
        'regulatory_requests','documents','correspondence','timeline','provenance']) sec
    )
  );

  IF public.e360_section_allowed(u,'licences') THEN
    res := res || jsonb_build_object('licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', li.id, 'license_number', li.license_number,
        'license_type', li.license_type, 'status', li.status, 'issued_at', li.issued_at,
        'valid_until', li.valid_until, 'is_primary', el.is_primary,
        'effective_from', el.effective_from, 'effective_to', el.effective_to)
        ORDER BY el.is_primary DESC NULLS LAST, li.issued_at DESC NULLS LAST)
      FROM public.entity_licenses el JOIN public.licenses li ON li.id = el.license_id
      WHERE el.entity_id = _entity_id), '[]'::jsonb));
  END IF;

  IF public.e360_section_allowed(u,'ownership') THEN
    res := res || jsonb_build_object('ownership_summary', (
      SELECT jsonb_build_object('current_holders', count(*),
        'controllers', count(*) FILTER (WHERE oi.is_controller),
        'ubos', count(*) FILTER (WHERE oi.is_ubo))
      FROM public.ownership_interests oi
      WHERE oi.owned_entity_id = _entity_id AND oi.effective_to IS NULL AND oi.superseded_at IS NULL));
    res := res || jsonb_build_object('governance_summary', (
      SELECT jsonb_build_object('current_appointments', count(*),
        'awaiting_approval', count(*) FILTER (WHERE a.regulatory_approval_status IS DISTINCT FROM 'approved'))
      FROM public.entity_appointments a
      WHERE a.entity_id = _entity_id AND a.effective_to IS NULL AND a.superseded_at IS NULL));
  END IF;

  IF public.e360_section_allowed(u,'fit_and_proper') THEN
    res := res || jsonb_build_object('fp_summary', (
      SELECT jsonb_build_object('total', count(*),
        'open', count(*) FILTER (WHERE f.closed_at IS NULL),
        'determined', count(*) FILTER (WHERE f.determined_at IS NOT NULL))
      FROM public.fp_assessments f WHERE f.licensee_id = _entity_id));
  END IF;

  IF public.e360_section_allowed(u,'returns') THEN
    res := res || jsonb_build_object('returns_summary', (
      SELECT jsonb_build_object(
        'obligations', (SELECT count(*) FROM public.entity_reporting_obligations o
                         WHERE o.entity_id = _entity_id AND o.status = 'active'),
        'filings', count(*),
        'accepted', count(*) FILTER (WHERE rf.status = 'accepted'),
        'awaiting_review', count(*) FILTER (WHERE rf.status IN ('submitted','under_review')),
        'overdue', count(*) FILTER (WHERE rf.status <> 'accepted' AND p.due_date < current_date))
      FROM public.return_filings rf
      LEFT JOIN public.reporting_periods p ON p.id = rf.reporting_period_id
      WHERE rf.entity_id = _entity_id));
  END IF;

  IF public.e360_section_allowed(u,'risk') THEN
    res := res
      || jsonb_build_object('risk', (
        SELECT jsonb_build_object('overall_rating', r.overall_rating, 'risk_score', r.risk_score,
          'assessment_date', r.assessment_date, 'risk_factors', r.risk_factors)
        FROM public.risk_ratings r WHERE r.entity_id = _entity_id
        ORDER BY r.assessment_date DESC NULLS LAST, r.created_at DESC LIMIT 1))
      || jsonb_build_object('risk_score_current', (
        SELECT jsonb_build_object('score', rs.score, 'band', rs.band, 'period_key', rs.period_key,
          'computed_at', rs.computed_at)
        FROM public.entity_risk_scores rs
        WHERE rs.entity_id = _entity_id AND rs.is_current LIMIT 1));
  END IF;

  IF public.e360_section_allowed(u,'supervision') THEN
    res := res || jsonb_build_object('supervision', jsonb_build_object(
      'assignment', (SELECT jsonb_build_object('supervisor_name', a.supervisor_name, 'team', a.team,
          'supervisory_cycle', a.supervisory_cycle, 'cycle_start', a.cycle_start, 'cycle_end', a.cycle_end)
        FROM public.entity_supervision_assignments a
        WHERE a.entity_id = _entity_id AND a.status = 'active' AND a.effective_to IS NULL
        ORDER BY a.effective_from DESC LIMIT 1),
      'plans', (SELECT count(*) FROM public.supervisory_plans sp WHERE sp.entity_id = _entity_id),
      'open_actions', (SELECT count(*) FROM public.supervisory_plan_actions sa
        JOIN public.supervisory_plans sp ON sp.id = sa.plan_id
        WHERE sp.entity_id = _entity_id AND sa.status <> 'completed')));
  END IF;

  IF public.e360_section_allowed(u,'prudential') THEN
    res := res || jsonb_build_object('prudential', jsonb_build_object(
      'assessments', (SELECT count(*) FROM public.prudential_assessments pa WHERE pa.entity_id = _entity_id),
      'latest_rating', (SELECT pa.overall_rating FROM public.prudential_assessments pa
        WHERE pa.entity_id = _entity_id ORDER BY pa.period_end DESC NULLS LAST LIMIT 1),
      'metrics_reported', (SELECT count(DISTINCT mv.regulatory_metric_id)
        FROM public.return_metric_values mv WHERE mv.entity_id = _entity_id)));
  END IF;

  IF public.e360_section_allowed(u,'market_conduct') THEN
    res := res || jsonb_build_object('market_conduct', jsonb_build_object(
      'complaints', (SELECT count(*) FROM public.complaints c WHERE c.licensee_id = _entity_id),
      'open_complaints', (SELECT count(*) FROM public.complaints c
        WHERE c.licensee_id = _entity_id AND c.closed_at IS NULL),
      'alerts_open', (SELECT count(*) FROM public.conduct_alerts ca
        WHERE ca.licensee_id = _entity_id AND ca.closed_at IS NULL)));
  END IF;

  IF public.e360_section_allowed(u,'aml') THEN
    res := res || jsonb_build_object('aml', jsonb_build_object(
      'latest', (SELECT jsonb_build_object('reference', a.reference, 'assessment_date', a.assessment_date,
          'residual_rating', a.residual_rating, 'status', a.status, 'inspection_status', a.inspection_status,
          'next_review_date', a.next_review_date)
        FROM public.aml_assessments a WHERE a.entity_id = _entity_id
        ORDER BY a.assessment_date DESC LIMIT 1),
      'open_findings', (SELECT count(*) FROM public.aml_findings f
        WHERE f.entity_id = _entity_id AND f.status <> 'closed')));
  END IF;

  IF public.e360_section_allowed(u,'resilience') THEN
    res := res || jsonb_build_object('resilience', jsonb_build_object(
      'arrangements', (SELECT count(*) FROM public.resilience_arrangements ra
        WHERE ra.entity_id = _entity_id AND ra.status = 'active'),
      'critical_providers', (SELECT count(*) FROM public.resilience_arrangements ra
        WHERE ra.entity_id = _entity_id AND ra.criticality = 'critical' AND ra.status = 'active'),
      'open_incidents', (SELECT count(*) FROM public.resilience_incidents ri
        WHERE ri.entity_id = _entity_id AND ri.status <> 'closed')));
  END IF;

  IF public.e360_section_allowed(u,'examinations') THEN
    res := res || jsonb_build_object('examinations', jsonb_build_object(
      'total', (SELECT count(*) FROM public.examinations e WHERE e.entity_id = _entity_id),
      'in_progress', (SELECT count(*) FROM public.examinations e
        WHERE e.entity_id = _entity_id AND e.closed_at IS NULL),
      'open_findings', (SELECT count(*) FROM public.examination_findings ef
        JOIN public.examinations e ON e.id = ef.examination_id
        WHERE e.entity_id = _entity_id AND ef.status <> 'closed')));
  END IF;

  IF public.e360_section_allowed(u,'enforcement') THEN
    res := res || jsonb_build_object('enforcement', jsonb_build_object(
      'total', (SELECT count(*) FROM public.enforcement_actions ea WHERE ea.entity_id = _entity_id),
      'open', (SELECT count(*) FROM public.enforcement_actions ea
        WHERE ea.entity_id = _entity_id AND ea.closed_at IS NULL)));
  END IF;

  IF public.e360_section_allowed(u,'regulatory_requests') THEN
    res := res || jsonb_build_object('regulatory_requests', jsonb_build_object(
      'total', (SELECT count(*) FROM public.regulatory_requests rr WHERE rr.entity_id = _entity_id),
      'open', (SELECT count(*) FROM public.regulatory_requests rr
        WHERE rr.entity_id = _entity_id AND rr.closed_at IS NULL),
      'change_sets_pending', (SELECT count(*) FROM public.entity_change_sets cs
        WHERE cs.entity_id = _entity_id AND cs.status NOT IN ('applied','rejected'))));
  END IF;

  RETURN res;
END;
$fn$;

-- ---------------------------------------------------------------
-- SECTION READER
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity360_section(
  _entity_id uuid,
  _section text,
  _as_of timestamptz DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u uuid := auth.uid();
  lim int := LEAST(GREATEST(COALESCE(_limit,100),1), 500);
  off int := GREATEST(COALESCE(_offset,0),0);
  asof timestamptz := COALESCE(_as_of, now());
  rows jsonb := '[]'::jsonb;
BEGIN
  IF u IS NULL OR public.has_external_role(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, _section) THEN
    RETURN jsonb_build_object('section', _section, 'allowed', false, 'rows', '[]'::jsonb);
  END IF;

  IF _section = 'identity' THEN
    rows := COALESCE((SELECT jsonb_agg(x ORDER BY x->>'is_primary' DESC) FROM (
      SELECT jsonb_build_object('id', i.id, 'type', it.label, 'value', i.identifier_value,
        'normalized_value', i.normalized_value, 'scope', i.uniqueness_scope,
        'verification_status', i.verification_status, 'is_primary', i.is_primary,
        'effective_from', i.effective_from, 'effective_to', i.effective_to) AS x
      FROM public.entity_identifiers i
      LEFT JOIN public.entity_identifier_types it ON it.id = i.identifier_type_id
      WHERE i.entity_id = _entity_id
        AND (_as_of IS NULL OR (i.effective_from <= asof AND (i.effective_to IS NULL OR i.effective_to > asof)))
      LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'business_profile' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', f.id, 'concept', dc.label, 'concept_key', dc.key,
        'value', COALESCE(f.value_text, f.value_number::text, f.value_date::text,
                          f.value_datetime::text, f.value_boolean::text, f.value_json::text),
        'valid_from', f.valid_from, 'valid_to', f.valid_to,
        'approval_status', f.approval_status, 'verified_at', f.verified_at) AS x
      FROM public.entity_facts f
      LEFT JOIN public.data_concepts dc ON dc.id = f.data_concept_id
      WHERE f.entity_id = _entity_id AND f.superseded_at IS NULL
        AND (_as_of IS NULL OR (f.valid_from <= asof AND (f.valid_to IS NULL OR f.valid_to > asof)))
      ORDER BY dc.label LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'licences' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', li.id, 'license_number', li.license_number,
        'license_type', li.license_type, 'status', li.status, 'issued_at', li.issued_at,
        'valid_from', li.valid_from, 'valid_until', li.valid_until,
        'is_primary', el.is_primary, 'effective_from', el.effective_from,
        'effective_to', el.effective_to, 'source', el.source) AS x
      FROM public.entity_licenses el JOIN public.licenses li ON li.id = el.license_id
      WHERE el.entity_id = _entity_id
        AND (_as_of IS NULL OR (el.effective_from <= asof AND (el.effective_to IS NULL OR el.effective_to > asof)))
      ORDER BY el.is_primary DESC NULLS LAST, li.issued_at DESC NULLS LAST
      LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'ownership' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', oi.id, 'owner_party_id', oi.owner_party_id,
        'owner_name', p.display_name, 'owner_kind', p.party_kind,
        'economic_interest_percentage', oi.economic_interest_percentage,
        'voting_rights_percentage', oi.voting_rights_percentage,
        'beneficial_interest_percentage', oi.beneficial_interest_percentage,
        'is_direct', oi.is_direct, 'is_controller', oi.is_controller, 'is_ubo', oi.is_ubo,
        'approval_status', oi.approval_status, 'effective_from', oi.effective_from,
        'effective_to', oi.effective_to) AS x
      FROM public.ownership_interests oi
      LEFT JOIN public.parties p ON p.id = oi.owner_party_id
      WHERE oi.owned_entity_id = _entity_id
        AND (_as_of IS NULL
             OR (oi.effective_from <= asof
                 AND (oi.effective_to IS NULL OR oi.effective_to > asof)
                 AND (oi.superseded_at IS NULL OR oi.superseded_at > asof)))
      ORDER BY oi.economic_interest_percentage DESC NULLS LAST
      LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'relationships' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', r.id, 'related_entity_id', r.related_entity_id,
        'related_entity_name', COALESCE(r.related_entity_name, l2.name),
        'relationship_type', r.relationship_type, 'ownership_percentage', r.ownership_percentage,
        'status', r.status, 'effective_date', r.effective_date) AS x
      FROM public.entity_relationships r
      LEFT JOIN public.licensees l2 ON l2.id = r.related_entity_id
      WHERE r.entity_id = _entity_id
        AND (_as_of IS NULL OR r.effective_date IS NULL OR r.effective_date <= asof::date)
      ORDER BY r.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'governance' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', a.id, 'person_party_id', a.person_party_id,
        'person_name', p.display_name, 'role', rt.label, 'role_key', rt.key,
        'is_executive', a.is_executive, 'status', a.status,
        'regulatory_approval_status', a.regulatory_approval_status,
        'appointment_date', a.appointment_date, 'effective_from', a.effective_from,
        'effective_to', a.effective_to, 'fp_individual_id', a.fp_individual_id) AS x
      FROM public.entity_appointments a
      LEFT JOIN public.parties p ON p.id = a.person_party_id
      LEFT JOIN public.role_types rt ON rt.id = a.role_type_id
      WHERE a.entity_id = _entity_id
        AND (_as_of IS NULL
             OR (a.effective_from <= asof
                 AND (a.effective_to IS NULL OR a.effective_to > asof)
                 AND (a.superseded_at IS NULL OR a.superseded_at > asof)))
      ORDER BY a.effective_from DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'fit_and_proper' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', f.id, 'individual_name', ind.full_name,
        'assessment_type', f.assessment_type, 'status', f.status, 'pq_state', f.pq_state,
        'submitted_at', f.submitted_at, 'determined_at', f.determined_at,
        'closed_at', f.closed_at) AS x
      FROM public.fp_assessments f
      LEFT JOIN public.fp_individuals ind ON ind.id = f.individual_id
      WHERE f.licensee_id = _entity_id
      ORDER BY f.submitted_at DESC NULLS LAST LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'returns' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', rf.id, 'filing_reference', rf.filing_reference,
        'status', rf.status, 'period_label', p.period_label, 'due_date', p.due_date,
        'submitted_at', rf.submitted_at, 'accepted_at', rf.accepted_at,
        'version', rf.current_version_number, 'return_definition_id', rf.return_definition_id) AS x
      FROM public.return_filings rf
      LEFT JOIN public.reporting_periods p ON p.id = rf.reporting_period_id
      WHERE rf.entity_id = _entity_id
      ORDER BY p.due_date DESC NULLS LAST LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'risk' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', r.id, 'overall_rating', r.overall_rating,
        'risk_score', r.risk_score, 'assessment_date', r.assessment_date,
        'risk_factors', r.risk_factors, 'mitigation_measures', r.mitigation_measures) AS x
      FROM public.risk_ratings r WHERE r.entity_id = _entity_id
      ORDER BY r.assessment_date DESC NULLS LAST LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'supervision' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', sp.id, 'status', sp.status,
        'approval_status', sp.approval_status, 'created_from', sp.created_from,
        'created_at', sp.created_at,
        'open_actions', (SELECT count(*) FROM public.supervisory_plan_actions sa
          WHERE sa.plan_id = sp.id AND sa.status <> 'completed')) AS x
      FROM public.supervisory_plans sp WHERE sp.entity_id = _entity_id
      ORDER BY sp.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'prudential' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', pa.id, 'period_start', pa.period_start,
        'period_end', pa.period_end, 'overall_rating', pa.overall_rating,
        'status', pa.status, 'conclusion', pa.conclusion, 'approved_at', pa.approved_at) AS x
      FROM public.prudential_assessments pa WHERE pa.entity_id = _entity_id
      ORDER BY pa.period_end DESC NULLS LAST LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'market_conduct' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', c.id, 'complaint_number', c.complaint_number,
        'subject', c.subject, 'status', c.status, 'severity', c.severity,
        'created_at', c.created_at, 'closed_at', c.closed_at, 'sla_due_at', c.sla_due_at) AS x
      FROM public.complaints c WHERE c.licensee_id = _entity_id
      ORDER BY c.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'aml' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', a.id, 'reference', a.reference,
        'assessment_date', a.assessment_date, 'inherent_rating', a.inherent_rating,
        'control_rating', a.control_rating, 'residual_rating', a.residual_rating,
        'status', a.status, 'summary', a.summary,
        'confidential_notes', CASE WHEN public.e360_section_allowed(u,'aml_confidential')
                                   THEN a.confidential_notes ELSE NULL END,
        'next_review_date', a.next_review_date,
        'open_findings', (SELECT count(*) FROM public.aml_findings f
          WHERE f.aml_assessment_id = a.id AND f.status <> 'closed')) AS x
      FROM public.aml_assessments a WHERE a.entity_id = _entity_id
      ORDER BY a.assessment_date DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'resilience' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('kind', 'arrangement', 'id', ra.id,
        'arrangement_type', ra.arrangement_type, 'provider_name', ra.provider_name,
        'criticality', ra.criticality, 'status', ra.status,
        'effective_from', ra.effective_from, 'last_assessed_at', ra.last_assessed_at) AS x,
        ra.created_at AS ord
      FROM public.resilience_arrangements ra WHERE ra.entity_id = _entity_id
      UNION ALL
      SELECT jsonb_build_object('kind', 'incident', 'id', ri.id, 'reference', ri.reference,
        'incident_type', ri.incident_type, 'severity', ri.severity,
        'occurred_at', ri.occurred_at, 'resolved_at', ri.resolved_at,
        'status', ri.status, 'summary', ri.summary), ri.created_at
      FROM public.resilience_incidents ri WHERE ri.entity_id = _entity_id
      ORDER BY ord DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'examinations' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', e.id, 'reference', e.reference, 'title', e.title,
        'examination_type', e.examination_type, 'stage', e.stage, 'risk_rating', e.risk_rating,
        'fieldwork_start', e.fieldwork_start, 'fieldwork_end', e.fieldwork_end,
        'closed_at', e.closed_at,
        'open_findings', (SELECT count(*) FROM public.examination_findings ef
          WHERE ef.examination_id = e.id AND ef.status <> 'closed')) AS x
      FROM public.examinations e WHERE e.entity_id = _entity_id
      ORDER BY e.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'enforcement' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', ea.id, 'case_number', ea.case_number,
        'enforcement_type', ea.enforcement_type, 'status', ea.status,
        'date_opened', ea.date_opened, 'penalty_amount', ea.penalty_amount,
        'decision_outcome', ea.decision_outcome, 'closed_at', ea.closed_at) AS x
      FROM public.enforcement_actions ea WHERE ea.entity_id = _entity_id
      ORDER BY ea.date_opened DESC NULLS LAST LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'regulatory_requests' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', rr.id, 'request_number', rr.request_number,
        'status', rr.status, 'priority', rr.priority, 'summary', rr.summary,
        'submitted_at', rr.submitted_at, 'decided_at', rr.decided_at,
        'closed_at', rr.closed_at, 'change_set_id', rr.change_set_id) AS x
      FROM public.regulatory_requests rr WHERE rr.entity_id = _entity_id
      ORDER BY rr.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'correspondence' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', t.id, 'reference', t.reference, 'subject', t.subject,
        'channel', t.channel, 'direction', t.direction, 'status', t.status,
        'received_at', t.received_at, 'due_at', t.due_at, 'closed_at', t.closed_at) AS x
      FROM public.correspondence_threads t WHERE t.licensee_id = _entity_id
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

  ELSIF _section = 'provenance' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', cs.id, 'change_set_number', cs.change_set_number,
        'origin_type', cs.origin_type, 'status', cs.status, 'summary', cs.summary,
        'effective_date', cs.effective_date, 'submitted_at', cs.submitted_at,
        'approved_at', cs.approved_at, 'applied_at', cs.applied_at) AS x
      FROM public.entity_change_sets cs WHERE cs.entity_id = _entity_id
      ORDER BY cs.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('section', _section, 'allowed', true,
    'as_of', _as_of, 'limit', lim, 'offset', off, 'rows', rows);
END;
$fn$;

-- ---------------------------------------------------------------
-- CROSS-DOMAIN TIMELINE
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity360_timeline(
  _entity_id uuid,
  _domains text[] DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u uuid := auth.uid();
  lim int := LEAST(GREATEST(COALESCE(_limit,100),1), 500);
  off int := GREATEST(COALESCE(_offset,0),0);
  total int;
  events jsonb;
BEGIN
  IF u IS NULL OR public.has_external_role(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, 'timeline') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _e360_tl (
    occurred_at timestamptz, domain text, event_type text,
    title text, detail text, source_table text, source_id uuid
  ) ON COMMIT DROP;
  DELETE FROM _e360_tl;

  IF public.e360_section_allowed(u,'licences') THEN
    INSERT INTO _e360_tl
    SELECT el.effective_from, 'licensing', 'licence_linked',
      COALESCE(li.license_number, 'Licence'), li.license_type, 'entity_licenses', el.id
    FROM public.entity_licenses el LEFT JOIN public.licenses li ON li.id = el.license_id
    WHERE el.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'ownership') THEN
    INSERT INTO _e360_tl
    SELECT oi.effective_from, 'ownership', 'ownership_recorded',
      COALESCE(p.display_name,'Owner'),
      concat_ws(' ', oi.economic_interest_percentage::text, '% economic interest'),
      'ownership_interests', oi.id
    FROM public.ownership_interests oi LEFT JOIN public.parties p ON p.id = oi.owner_party_id
    WHERE oi.owned_entity_id = _entity_id;

    INSERT INTO _e360_tl
    SELECT a.effective_from, 'governance', 'appointment_recorded',
      COALESCE(p.display_name,'Officer'), rt.label, 'entity_appointments', a.id
    FROM public.entity_appointments a
    LEFT JOIN public.parties p ON p.id = a.person_party_id
    LEFT JOIN public.role_types rt ON rt.id = a.role_type_id
    WHERE a.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'returns') THEN
    INSERT INTO _e360_tl
    SELECT COALESCE(rf.submitted_at, rf.created_at), 'returns', 'filing_' || rf.status,
      rf.filing_reference, pr.period_label, 'return_filings', rf.id
    FROM public.return_filings rf
    LEFT JOIN public.reporting_periods pr ON pr.id = rf.reporting_period_id
    WHERE rf.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'risk') THEN
    INSERT INTO _e360_tl
    SELECT COALESCE(r.assessment_date::timestamptz, r.created_at), 'risk', 'risk_rating_set',
      r.overall_rating, r.notes, 'risk_ratings', r.id
    FROM public.risk_ratings r WHERE r.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'examinations') THEN
    INSERT INTO _e360_tl
    SELECT e.created_at, 'examination', 'examination_' || COALESCE(e.stage,'opened'),
      e.reference, e.title, 'examinations', e.id
    FROM public.examinations e WHERE e.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'enforcement') THEN
    INSERT INTO _e360_tl
    SELECT COALESCE(ea.date_opened::timestamptz, ea.created_at), 'enforcement', 'enforcement_' || ea.status,
      ea.case_number, ea.enforcement_type, 'enforcement_actions', ea.id
    FROM public.enforcement_actions ea WHERE ea.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'market_conduct') THEN
    INSERT INTO _e360_tl
    SELECT c.created_at, 'conduct', 'complaint_' || c.status, c.complaint_number, c.subject,
      'complaints', c.id
    FROM public.complaints c WHERE c.licensee_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'aml') THEN
    INSERT INTO _e360_tl
    SELECT a.assessment_date::timestamptz, 'aml', 'aml_assessment_' || a.status,
      a.reference, a.residual_rating, 'aml_assessments', a.id
    FROM public.aml_assessments a WHERE a.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'resilience') THEN
    INSERT INTO _e360_tl
    SELECT ri.occurred_at, 'resilience', 'incident_' || ri.status, ri.reference, ri.summary,
      'resilience_incidents', ri.id
    FROM public.resilience_incidents ri WHERE ri.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'regulatory_requests') THEN
    INSERT INTO _e360_tl
    SELECT rr.created_at, 'requests', 'request_' || rr.status, rr.request_number, rr.summary,
      'regulatory_requests', rr.id
    FROM public.regulatory_requests rr WHERE rr.entity_id = _entity_id;

    INSERT INTO _e360_tl
    SELECT cs.created_at, 'change', 'change_set_' || cs.status, cs.change_set_number, cs.summary,
      'entity_change_sets', cs.id
    FROM public.entity_change_sets cs WHERE cs.entity_id = _entity_id;
  END IF;

  IF public.e360_section_allowed(u,'correspondence') THEN
    INSERT INTO _e360_tl
    SELECT COALESCE(t.received_at, t.created_at), 'correspondence', 'thread_' || t.status,
      t.reference, t.subject, 'correspondence_threads', t.id
    FROM public.correspondence_threads t WHERE t.licensee_id = _entity_id;
  END IF;

  SELECT count(*) INTO total FROM _e360_tl
  WHERE occurred_at IS NOT NULL
    AND (_domains IS NULL OR domain = ANY(_domains))
    AND (_from IS NULL OR occurred_at >= _from)
    AND (_to IS NULL OR occurred_at <= _to);

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.occurred_at DESC), '[]'::jsonb) INTO events
  FROM (
    SELECT * FROM _e360_tl
    WHERE occurred_at IS NOT NULL
      AND (_domains IS NULL OR domain = ANY(_domains))
      AND (_from IS NULL OR occurred_at >= _from)
      AND (_to IS NULL OR occurred_at <= _to)
    ORDER BY occurred_at DESC
    LIMIT lim OFFSET off
  ) t;

  RETURN jsonb_build_object('total', total, 'limit', lim, 'offset', off, 'events', events);
END;
$fn$;

-- ---------------------------------------------------------------
-- AS-OF SNAPSHOT
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity360_as_of(_entity_id uuid, _as_of timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL OR public.has_external_role(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u,'overview') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'as_of', _as_of,
    'identity', public.entity360_section(_entity_id,'identity',_as_of,500,0) -> 'rows',
    'business_profile', public.entity360_section(_entity_id,'business_profile',_as_of,500,0) -> 'rows',
    'licences', public.entity360_section(_entity_id,'licences',_as_of,500,0) -> 'rows',
    'ownership', public.entity360_section(_entity_id,'ownership',_as_of,500,0) -> 'rows',
    'relationships', public.entity360_section(_entity_id,'relationships',_as_of,500,0) -> 'rows',
    'governance', public.entity360_section(_entity_id,'governance',_as_of,500,0) -> 'rows'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.entity360_section(uuid, text, timestamptz, int, int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity360_section(uuid, text, timestamptz, int, int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entity360_timeline(uuid, text[], timestamptz, timestamptz, int, int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity360_timeline(uuid, text[], timestamptz, timestamptz, int, int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entity360_as_of(uuid, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity360_as_of(uuid, timestamptz) TO authenticated, service_role;
