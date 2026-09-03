CREATE OR REPLACE FUNCTION public.entity360_overview(_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- EPIC 4 / AML hardening: the legacy AML block is retired here exactly as it
  -- already is in entity360_section(). It read `aml_assessments` and
  -- `aml_findings` -- historical stores, the second of which no longer exists,
  -- so the overview raised `relation does not exist` for every user allowed the
  -- AML section. AML truth for an entity is served solely by aml_entity_panel()
  -- over the canonical supervisory spine.

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
      'open_findings', (SELECT count(*) FROM public.supervisory_finding sf
        JOIN public.examinations e ON e.id = sf.examination_id
        WHERE e.entity_id = _entity_id
          AND lower(coalesce(sf.status,'')) NOT IN ('closed','withdrawn','superseded'))));
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
$function$;