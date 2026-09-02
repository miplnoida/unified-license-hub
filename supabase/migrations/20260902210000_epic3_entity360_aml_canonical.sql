CREATE OR REPLACE FUNCTION public.entity360_overview(_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$

DECLARE
  u uuid := auth.uid();
  res jsonb;
  ent record;
BEGIN
  IF u IS NULL OR NOT public.is_internal_staff(u) THEN
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
                         WHERE o.entity_id = _entity_id AND lower(o.status) = 'active'),
        'filings', count(*),
        'accepted', count(*) FILTER (WHERE lower(rf.status) = 'accepted'),
        'awaiting_review', count(*) FILTER (WHERE lower(rf.status) IN ('submitted','under_review')),
        'overdue', count(*) FILTER (WHERE lower(rf.status) <> 'accepted' AND p.due_date < current_date))
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
    -- EPIC 3 / Gate 10: Entity 360 AML reconciles with the canonical AML
    -- risk-of-record (entity_risk_state + supervisory_assessment). No
    -- independent risk calculation and no legacy aml_assessments read.
    DECLARE _amlp jsonb;
    BEGIN
      _amlp := public.aml_entity_panel(_entity_id);
      res := res || jsonb_build_object('aml', jsonb_build_object(
        'latest', CASE WHEN _amlp->'last_approved_assessment' = 'null'::jsonb THEN NULL ELSE
          jsonb_build_object(
            'reference', _amlp->'last_approved_assessment'->>'reference',
            'assessment_date', _amlp->'last_approved_assessment'->>'approved_at',
            'residual_rating', _amlp->>'residual_rating',
            'inherent_rating', _amlp->>'inherent_rating',
            'control_rating', _amlp->>'control_rating',
            'prior_rating', _amlp->>'prior_rating',
            'trend', _amlp->>'trend',
            'methodology', _amlp->'methodology',
            'status', _amlp->'last_approved_assessment'->>'residual_rating',
            'next_review_date', _amlp->>'next_review_date') END,
        'open_findings', COALESCE((_amlp->>'open_findings')::int, 0),
        'critical_findings', COALESCE((_amlp->>'critical_findings')::int, 0),
        'overdue_remediation', COALESCE((_amlp->>'overdue_remediation')::int, 0),
        'active_enforcement', COALESCE((_amlp->>'active_enforcement')::int, 0),
        'reassessment_required', COALESCE((_amlp->>'reassessment_required')::boolean, false),
        'high_risk_dimensions', COALESCE(_amlp->'high_risk_dimensions', '[]'::jsonb)));
    END;
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

CREATE OR REPLACE FUNCTION public.entity360_section(_entity_id uuid, _section text, _as_of timestamp with time zone, _limit integer, _offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$

DECLARE
  u uuid := auth.uid();
  lim int := LEAST(GREATEST(COALESCE(_limit,100),1), 500);
  off int := GREATEST(COALESCE(_offset,0),0);
  asof timestamptz := COALESCE(_as_of, now());
  rows jsonb := '[]'::jsonb;
BEGIN
  IF u IS NULL OR NOT public.is_internal_staff(u) THEN
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
      SELECT jsonb_build_object('id', f.id, 'concept', dc.name, 'concept_key', dc.code,
        'value', COALESCE(f.value_text, f.value_number::text, f.value_date::text,
                          f.value_datetime::text, f.value_boolean::text, f.value_json::text),
        'valid_from', f.valid_from, 'valid_to', f.valid_to,
        'approval_status', f.approval_status, 'verified_at', f.verified_at) AS x
      FROM public.entity_facts f
      LEFT JOIN public.data_concepts dc ON dc.id = f.data_concept_id
      WHERE f.entity_id = _entity_id AND f.superseded_at IS NULL
        AND (_as_of IS NULL OR (f.valid_from <= asof AND (f.valid_to IS NULL OR f.valid_to > asof)))
      ORDER BY dc.name LIMIT lim OFFSET off) s), '[]'::jsonb);

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
        'is_direct', oi.is_direct, 'is_controller', oi.is_controller,
        'recorded_ubo', oi.is_ubo,
        'ownership_type', ot.label,
        'owner_entity_id', lo.id,
        'source', CASE WHEN oi.source_change_set_id IS NOT NULL THEN 'Governed change set'
                       WHEN oi.source_submission_id IS NOT NULL THEN 'Regulatory submission'
                       ELSE 'Regulator record' END,
        'approval_status', oi.approval_status, 'valid_from', oi.effective_from,
        'valid_to', oi.effective_to) AS x
      FROM public.ownership_interests oi
      LEFT JOIN public.ownership_types ot ON ot.id = oi.ownership_type_id
      LEFT JOIN public.licensees lo ON lo.party_id = oi.owner_party_id
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
      SELECT jsonb_build_object('id', r.id,
        'related_party_id', CASE WHEN r.source_party_id = e.ep THEN r.target_party_id ELSE r.source_party_id END,
        'related_entity_name', CASE WHEN r.source_party_id = e.ep THEN COALESCE(lt.name, pt.display_name)
                                    ELSE COALESCE(ls.name, ps.display_name) END,
        'related_party_kind', CASE WHEN r.source_party_id = e.ep THEN pt.party_kind ELSE ps.party_kind END,
        'related_entity_id', CASE WHEN r.source_party_id = e.ep THEN lt.id ELSE ls.id END,
        'relationship_type', CASE WHEN r.source_party_id = e.ep THEN rt.label ELSE COALESCE(irt.label, rt.label) END,
        'relationship_key', CASE WHEN r.source_party_id = e.ep THEN rt.key ELSE COALESCE(irt.key, rt.key) END,
        'perspective', CASE WHEN r.source_party_id = e.ep THEN 'DIRECT' ELSE 'INVERSE' END,
        'status', r.status, 'valid_from', r.effective_from, 'valid_to', r.effective_to,
        'source', CASE WHEN r.source_change_set_id IS NOT NULL THEN 'Governed change set'
                       WHEN r.source_submission_id IS NOT NULL THEN 'Regulatory submission'
                       ELSE 'Regulator record' END) AS x
      FROM public.party_relationships r
      CROSS JOIN (SELECT party_id AS ep FROM public.licensees WHERE id = _entity_id) e
      JOIN public.relationship_types rt ON rt.id = r.relationship_type_id
      LEFT JOIN public.relationship_types irt ON irt.id = rt.inverse_relationship_type_id
      LEFT JOIN public.parties ps ON ps.id = r.source_party_id
      LEFT JOIN public.parties pt ON pt.id = r.target_party_id
      LEFT JOIN public.licensees ls ON ls.party_id = r.source_party_id
      LEFT JOIN public.licensees lt ON lt.party_id = r.target_party_id
      WHERE r.superseded_at IS NULL
        AND (r.entity_id = _entity_id OR r.source_party_id = e.ep OR r.target_party_id = e.ep)
        AND (_as_of IS NULL
             OR (r.effective_from <= asof
                 AND (r.effective_to IS NULL OR r.effective_to > asof)
                 AND (r.superseded_at IS NULL OR r.superseded_at > asof)))
      ORDER BY r.effective_from DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

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
    -- EPIC 3 / Gate 10: canonical AML assessment register for this entity.
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', a.id, 'assessment_reference', a.reference,
        'reference', a.reference,
        'assessment_date', COALESCE(a.approved_at::date, a.period_end, a.created_at::date),
        'assessment_type', a.assessment_type, 'trigger_type', a.trigger_type,
        'methodology_version', a.methodology_version,
        'inherent_rating', a.inherent_rating,
        'control_effectiveness', a.control_rating,
        'control_rating', a.control_rating,
        'residual_rating', a.residual_rating,
        'status', a.status, 'is_current', a.is_current,
        'confidentiality', a.confidentiality,
        'next_review_date', (SELECT rs.next_review_date FROM public.entity_risk_state rs
          WHERE rs.entity_id = _entity_id AND rs.domain_code = 'AML_CFT'),
        'high_risk_dimensions', (SELECT count(*) FROM public.supervisory_assessment_dimension d
          WHERE d.assessment_id = a.id
            AND upper(COALESCE(d.residual_rating,'')) IN ('MEDIUM_HIGH','HIGH','SEVERE')),
        'open_findings', (SELECT count(*) FROM public.supervisory_finding f
          WHERE f.assessment_id = a.id
            AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED'))) AS x
      FROM public.supervisory_assessment a
      WHERE a.entity_id = _entity_id AND a.domain_code = 'AML_CFT'
        AND (a.confidentiality IS NULL OR upper(a.confidentiality) IN ('STANDARD','INTERNAL')
             OR public.e360_section_allowed(u,'aml_confidential'))
      ORDER BY COALESCE(a.approved_at, a.created_at) DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

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

  ELSIF _section = 'documents' THEN
    rows := COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', d.id, 'file_name', d.file_name,
        'file_path', d.file_path, 'file_size', d.file_size, 'mime_type', d.mime_type,
        'uploaded_at', d.created_at) AS x
      FROM public.documents d
      WHERE d.entity_id = _entity_id
        AND (_as_of IS NULL OR d.created_at <= asof)
      ORDER BY d.created_at DESC LIMIT lim OFFSET off) s), '[]'::jsonb);

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
