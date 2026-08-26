CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_facts(
  _pack_type text, _subject_id uuid, _subject_key text,
  _sectors uuid[], _period_start date, _period_end date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ps timestamptz := _period_start::timestamptz;
        _pe timestamptz := (_period_end + 1)::timestamptz;
        _attention uuid[]; _facts jsonb;
BEGIN
  SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) INTO _attention
    FROM public.conduct_attention_items a
   WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
     AND CASE _pack_type
           WHEN 'entity'        THEN _subject_id = ANY(COALESCE(a.entity_ids,'{}'::uuid[]))
           WHEN 'theme'         THEN a.theme = _subject_key
           WHEN 'emerging_risk' THEN a.emerging_risk_id = _subject_id
           WHEN 'attention'     THEN a.id = _subject_id
           WHEN 'plan'          THEN EXISTS (SELECT 1 FROM public.conduct_supervisory_plans p
                                              WHERE p.id = _subject_id AND p.attention_id = a.id)
           WHEN 'intervention'  THEN EXISTS (SELECT 1 FROM public.conduct_interventions i
                                              WHERE i.id = _subject_id AND i.attention_id = a.id)
           ELSE true
         END;

  SELECT jsonb_build_object(
    'attention_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'reference', a.reference, 'title', a.title, 'status', a.status,
        'source_type', a.source_type, 'theme', a.theme, 'sector_id', a.sector_id,
        'materiality', a.materiality, 'urgency', a.urgency,
        'supervisory_basis', a.supervisory_basis,
        'calculated_priority', a.calculated_priority, 'confirmed_priority', a.confirmed_priority,
        'confirmation_rationale', a.confirmation_rationale, 'confirmed_at', a.confirmed_at,
        'target_review_date', a.target_review_date,
        'disposition', a.disposition, 'disposition_rationale', a.disposition_rationale,
        'created_at', a.created_at, 'closed_at', a.closed_at) ORDER BY a.created_at), '[]'::jsonb)
      FROM public.conduct_attention_items a WHERE a.id = ANY(_attention)),
    'priority_calculations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'attention_id', c.attention_id, 'method', c.method, 'factors', c.factors,
        'score', c.score, 'band', c.band, 'facts_signature', c.facts_signature,
        'window_start', c.window_start, 'window_end', c.window_end,
        'computed_by', c.computed_by, 'computed_at', c.computed_at) ORDER BY c.computed_at), '[]'::jsonb)
      FROM public.conduct_attention_priority_calcs c WHERE c.attention_id = ANY(_attention)),
    'plans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'reference', p.reference, 'title', p.title, 'status', p.status,
        'planning_period', p.planning_period, 'objective', p.objective,
        'objective_source', p.objective_source, 'factual_basis', p.factual_basis,
        'priority', p.priority, 'target_completion', p.target_completion,
        'submitted_at', p.submitted_at, 'approved_at', p.approved_at, 'approved_by', p.approved_by,
        'completed_at', p.completed_at, 'attention_id', p.attention_id) ORDER BY p.created_at), '[]'::jsonb)
      FROM public.conduct_supervisory_plans p
       WHERE (p.attention_id = ANY(_attention) OR (_pack_type = 'plan' AND p.id = _subject_id))
         AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'interventions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id, 'reference', i.reference, 'title', i.title, 'status', i.status,
        'intervention_type', i.intervention_type, 'catalogue_code', i.catalogue_code,
        'basis', i.basis, 'purpose', i.purpose, 'expected_outcome', i.expected_outcome,
        'licensee_id', i.licensee_id, 'theme', i.theme,
        'planned_start', i.planned_start, 'planned_end', i.planned_end,
        'proposed_by', i.proposed_by, 'proposed_at', i.proposed_at,
        'decided_by', i.decided_by, 'decided_at', i.decided_at,
        'decision_rationale', i.decision_rationale,
        'activated_at', i.activated_at, 'completed_at', i.completed_at,
        'outcome_result', i.outcome_result, 'outcome_rationale', i.outcome_rationale,
        'outcome_findings', i.outcome_findings, 'outstanding_actions', i.outstanding_actions,
        'outcome_recorded_by', i.outcome_recorded_by, 'outcome_recorded_at', i.outcome_recorded_at,
        'followup_due_date', i.followup_due_date, 'followup_note', i.followup_note,
        'followup_completed_at', i.followup_completed_at,
        'attention_id', i.attention_id, 'plan_id', i.plan_id) ORDER BY i.created_at), '[]'::jsonb)
      FROM public.conduct_interventions i
       WHERE (i.attention_id = ANY(_attention)
              OR (_pack_type = 'intervention' AND i.id = _subject_id)
              OR (_pack_type = 'entity' AND i.licensee_id = _subject_id)
              OR (_pack_type = 'plan' AND i.plan_id = _subject_id))
         AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'reassessments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id, 'attention_id', r.attention_id, 'intervention_id', r.intervention_id,
        'assessment', r.assessment, 'concern_state', r.concern_state, 'next_step', r.next_step,
        'next_review_date', r.next_review_date, 'assessed_by', r.assessed_by,
        'assessed_at', r.assessed_at) ORDER BY r.assessed_at), '[]'::jsonb)
      FROM public.conduct_attention_reassessments r WHERE r.attention_id = ANY(_attention)),
    'emerging_risks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id, 'reference', e.reference, 'title', e.title, 'status', e.status,
        'severity', e.severity, 'confidence', e.confidence, 'systemic_potential', e.systemic_potential,
        'entity_count', e.entity_count, 'window_start', e.window_start, 'window_end', e.window_end,
        'sector_id', e.sector_id, 'created_at', e.created_at, 'closed_at', e.closed_at)
        ORDER BY e.created_at), '[]'::jsonb)
      FROM public.conduct_emerging_risks e
       WHERE (_sectors IS NULL OR e.sector_id = ANY(_sectors))
         AND ((_pack_type = 'emerging_risk' AND e.id = _subject_id)
              OR e.id IN (SELECT a.emerging_risk_id FROM public.conduct_attention_items a
                           WHERE a.id = ANY(_attention) AND a.emerging_risk_id IS NOT NULL))),
    'findings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'reference', f.finding_reference, 'title', f.title, 'status', f.status,
        'severity', f.severity, 'entity_id', f.entity_id, 'opened_at', f.opened_at,
        'closed_at', f.closed_at) ORDER BY f.opened_at), '[]'::jsonb)
      FROM public.conduct_findings f
      LEFT JOIN public.licensees l ON l.id = f.entity_id
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND ((_pack_type = 'entity' AND f.entity_id = _subject_id)
              OR (_pack_type = 'period_sector' AND f.opened_at >= _ps AND f.opened_at < _pe))),
    'entities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name,
               'sector_id', l.sector_id, 'status', l.status) ORDER BY l.name), '[]'::jsonb)
      FROM public.licensees l
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND ((_pack_type = 'entity' AND l.id = _subject_id)
              OR (_pack_type <> 'entity' AND l.id IN (
                    SELECT unnest(COALESCE(a.entity_ids,'{}'::uuid[]))
                      FROM public.conduct_attention_items a WHERE a.id = ANY(_attention))))))
    INTO _facts;

  RETURN _facts;
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_facts(text, uuid, text, uuid[], date, date) FROM PUBLIC, anon, authenticated;