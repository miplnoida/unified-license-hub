CREATE OR REPLACE FUNCTION public.aml_entity_panel(_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE _rs public.entity_risk_state; _a public.supervisory_assessment; _mv record;
BEGIN
  SELECT * INTO _rs FROM public.entity_risk_state
   WHERE entity_id = _entity_id AND domain_code='AML_CFT';
  SELECT * INTO _a FROM public.supervisory_assessment
   WHERE id = _rs.driving_assessment_id AND entity_id = _entity_id AND domain_code='AML_CFT' LIMIT 1;
  SELECT previous_rating, new_rating, trend, approved_at INTO _mv
    FROM public.entity_risk_state_movement
   WHERE entity_id = _entity_id AND domain_code='AML_CFT'
   ORDER BY (new_assessment_id IS NOT DISTINCT FROM _rs.driving_assessment_id) DESC,
            approved_at DESC, created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'entity_id', _entity_id,
    'generated_at', now(),
    'residual_rating', _rs.residual_rating,
    'inherent_rating', _rs.inherent_rating,
    'control_rating', _rs.control_rating,
    'prior_rating', _mv.previous_rating,
    'trend', COALESCE(_mv.trend,'STABLE'),
    'last_review_date', _rs.last_review_date,
    'next_review_date', _rs.next_review_date,
    'methodology', (SELECT jsonb_build_object('id',m.id,'code',m.code,'version',m.version,'name',m.name)
                      FROM public.supervisory_methodology m WHERE m.id = _a.methodology_id),
    'last_approved_assessment', CASE WHEN _a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',_a.id,'reference',_a.reference,'assessment_type',_a.assessment_type,
        'period_start',_a.period_start,'period_end',_a.period_end,
        'residual_rating',_a.residual_rating,'approved_at',_a.approved_at) END,
    'high_risk_dimensions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'code',d.dimension_code,'group',d.dimension_group,'inherent',d.inherent_rating,
          'control',d.control_rating,'residual',d.residual_rating,'trend',d.trend,
          'overridden',d.is_overridden) ORDER BY d.dimension_code)
        FROM public.supervisory_assessment_dimension d
       WHERE d.assessment_id = _a.id
         AND upper(COALESCE(d.residual_rating,'')) IN ('MEDIUM_HIGH','HIGH','SEVERE')), '[]'::jsonb),
    'examinations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',e.id,'reference',e.reference,'engagement_type',e.engagement_type,
          'stage',e.stage,'closed_at',e.closed_at,
          'scope_dimensions',(SELECT count(*) FROM public.examination_scope_dimension sd WHERE sd.examination_id=e.id))
          ORDER BY e.created_at DESC)
        FROM public.examinations e
       WHERE e.entity_id=_entity_id AND e.domain_code='AML_CFT'), '[]'::jsonb),
    'findings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',f.id,'reference',f.reference,'title',f.title,'severity',f.severity,'status',f.status,
          'due_date',f.due_date,'validation_conclusion',f.validation_conclusion) ORDER BY f.created_at DESC)
        FROM public.supervisory_finding f
       WHERE f.entity_id=_entity_id AND f.domain_code='AML_CFT'), '[]'::jsonb),
    'open_findings', (SELECT count(*) FROM public.supervisory_finding f
       WHERE f.entity_id=_entity_id AND f.domain_code='AML_CFT'
         AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
    'critical_findings', (SELECT count(*) FROM public.supervisory_finding f
       WHERE f.entity_id=_entity_id AND f.domain_code='AML_CFT' AND f.severity IN ('HIGH','CRITICAL')
         AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
    'overdue_remediation', (SELECT count(*) FROM public.supervisory_remediation_action a
       WHERE a.entity_id=_entity_id AND a.domain_code='AML_CFT' AND a.target_date < current_date
         AND a.status NOT IN ('EFFECTIVE','CLOSED')),
    'remediation', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',a.id,'reference',a.reference,'status',a.status,'target_date',a.target_date,
          'effectiveness',a.effectiveness,'escalated',a.escalated_attention_id IS NOT NULL)
          ORDER BY a.created_at DESC)
        FROM public.supervisory_remediation_action a
       WHERE a.entity_id=_entity_id AND a.domain_code='AML_CFT'), '[]'::jsonb),
    'active_enforcement', (SELECT count(*) FROM public.enforcement_actions ea
       JOIN public.supervisory_finding f ON f.id = ea.supervisory_finding_id
      WHERE ea.entity_id=_entity_id AND f.domain_code='AML_CFT' AND ea.closed_at IS NULL),
    'reassessment_required', EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
       WHERE rr.entity_id=_entity_id AND rr.domain_code='AML_CFT'
         AND rr.status IN ('REQUIRED','IN_PROGRESS')),
    'reassessment_requirements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',rr.id,'trigger_kind',rr.trigger_kind,'requested_type',rr.requested_type,
          'status',rr.status,'due_date',rr.due_date) ORDER BY rr.created_at DESC)
        FROM public.supervisory_reassessment_requirement rr
       WHERE rr.entity_id=_entity_id AND rr.domain_code='AML_CFT'), '[]'::jsonb),
    'risk_movements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'previous_rating',m.previous_rating,'new_rating',m.new_rating,'trend',m.trend,
          'approved_at',m.approved_at,'trigger_kind',m.trigger_kind) ORDER BY m.approved_at DESC)
        FROM public.entity_risk_state_movement m
       WHERE m.entity_id=_entity_id AND m.domain_code='AML_CFT'), '[]'::jsonb),
    'assigned_officer_id', _a.owner_id,
    'assigned_team_id', _a.team_id
  );
END $function$;

CREATE OR REPLACE FUNCTION public.aml_portfolio(_limit integer DEFAULT 200)
 RETURNS TABLE(entity_id uuid, entity_name text, sector_name text, licence_reference text, residual_rating text, inherent_rating text, control_rating text, prior_rating text, trend text, last_review_date date, next_review_date date, assessment_current boolean, last_assessment_id uuid, last_assessment_reference text, last_assessment_status text, methodology_version text, assigned_officer_id uuid, assigned_officer_name text, assigned_team_id uuid, high_risk_dimensions text[], open_findings integer, critical_findings integer, overdue_remediation integer, active_examinations integer, reassessment_required boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cur AS (
    SELECT a.* FROM public.supervisory_assessment a
       JOIN public.entity_risk_state r ON r.driving_assessment_id = a.id AND r.entity_id = a.entity_id AND r.domain_code = 'AML_CFT'
     WHERE a.domain_code = 'AML_CFT'
  )
  SELECT l.id, l.name, s.name,
         (SELECT lic.license_number FROM public.entity_licenses el
            JOIN public.licenses lic ON lic.id = el.license_id
           WHERE el.entity_id = l.id
           ORDER BY el.is_primary DESC NULLS LAST, el.effective_from DESC NULLS LAST LIMIT 1),
         rs.residual_rating, rs.inherent_rating, rs.control_rating,
         (SELECT m.previous_rating FROM public.entity_risk_state_movement m
            WHERE m.entity_id = l.id AND m.domain_code = 'AML_CFT'
            ORDER BY (m.new_assessment_id IS NOT DISTINCT FROM rs.driving_assessment_id) DESC,
                     m.approved_at DESC, m.created_at DESC LIMIT 1),
         COALESCE((SELECT m.trend FROM public.entity_risk_state_movement m
                    WHERE m.entity_id = l.id AND m.domain_code = 'AML_CFT'
                    ORDER BY (m.new_assessment_id IS NOT DISTINCT FROM rs.driving_assessment_id) DESC,
                             m.approved_at DESC, m.created_at DESC LIMIT 1), 'STABLE'),
         rs.last_review_date, rs.next_review_date,
         (rs.next_review_date IS NULL OR rs.next_review_date >= current_date),
         c.id, c.reference, COALESCE(c.status, 'none'), c.methodology_version,
         c.owner_id,
         (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = c.owner_id),
         c.team_id,
         COALESCE((SELECT array_agg(d.dimension_code ORDER BY d.dimension_code)
                     FROM public.supervisory_assessment_dimension d
                    WHERE d.assessment_id = rs.driving_assessment_id
                      AND upper(COALESCE(d.residual_rating,'')) IN ('HIGH','SEVERE','MEDIUM_HIGH')), '{}'::text[]),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id = l.id AND f.domain_code = 'AML_CFT'
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id = l.id AND f.domain_code = 'AML_CFT' AND f.severity IN ('HIGH','CRITICAL')
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_remediation_action a
           WHERE a.entity_id = l.id AND a.domain_code = 'AML_CFT' AND a.target_date < current_date
             AND a.status NOT IN ('EFFECTIVE','CLOSED')),
         (SELECT count(*)::int FROM public.examinations e
           WHERE e.entity_id = l.id AND e.domain_code = 'AML_CFT' AND e.closed_at IS NULL),
         EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                  WHERE rr.entity_id = l.id AND rr.domain_code = 'AML_CFT'
                    AND rr.status IN ('REQUIRED','IN_PROGRESS'))
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    LEFT JOIN public.entity_risk_state rs
           ON rs.entity_id = l.id AND rs.domain_code = 'AML_CFT'
    LEFT JOIN cur c ON c.entity_id = l.id
   WHERE COALESCE(l.status,'') <> 'archived'
     AND public.supervisory_domain_applicable(l.id, 'AML_CFT')
   ORDER BY CASE upper(COALESCE(rs.residual_rating,''))
              WHEN 'SEVERE' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM_HIGH' THEN 3
              WHEN 'MODERATE' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END,
            l.name
   LIMIT _limit;
$function$;

CREATE OR REPLACE FUNCTION public.aml_overview_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE _supervised int; _with_current int; _outside int;
BEGIN
  SELECT count(*) INTO _supervised FROM public.licensees l
   WHERE COALESCE(l.status,'') <> 'archived'
     AND public.supervisory_domain_applicable(l.id, 'AML_CFT');
  SELECT count(*) INTO _outside FROM public.licensees l
   WHERE COALESCE(l.status,'') <> 'archived'
     AND NOT public.supervisory_domain_applicable(l.id, 'AML_CFT');
  SELECT count(*) INTO _with_current FROM public.supervisory_assessment a
     JOIN public.entity_risk_state r ON r.driving_assessment_id = a.id AND r.entity_id = a.entity_id AND r.domain_code = 'AML_CFT'
   WHERE a.domain_code = 'AML_CFT'
     AND public.supervisory_domain_applicable(a.entity_id, 'AML_CFT');

  RETURN jsonb_build_object(
    'generated_at', now(),
    'entities_supervised', _supervised,
    'entities_outside_perimeter', _outside,
    'entities_with_current_assessment', _with_current,
    'assessment_coverage_pct', CASE WHEN _supervised > 0
        THEN round((_with_current::numeric / _supervised) * 100, 1) ELSE 0 END,
    'assessments_due', (SELECT count(*) FROM public.entity_risk_state r
        WHERE r.domain_code='AML_CFT' AND r.next_review_date BETWEEN current_date AND current_date + 60
          AND public.supervisory_domain_applicable(r.entity_id,'AML_CFT')),
    'assessments_overdue', (SELECT count(*) FROM public.entity_risk_state r
        WHERE r.domain_code='AML_CFT' AND r.next_review_date < current_date
          AND public.supervisory_domain_applicable(r.entity_id,'AML_CFT')),
    'assessments_awaiting_review', (SELECT count(*) FROM public.supervisory_assessment
        WHERE domain_code='AML_CFT' AND status IN ('submitted','reviewed')),
    'high_risk_entities', (SELECT count(*) FROM public.entity_risk_state r
        WHERE r.domain_code='AML_CFT' AND r.residual_rating IN ('HIGH','SEVERE')
          AND public.supervisory_domain_applicable(r.entity_id,'AML_CFT')),
    'deteriorating_entities', (SELECT count(DISTINCT entity_id) FROM public.entity_risk_state_movement
        WHERE domain_code='AML_CFT' AND trend='DETERIORATING'),
    'active_examinations', (SELECT count(*) FROM public.examinations
        WHERE domain_code='AML_CFT' AND closed_at IS NULL),
    'examinations_awaiting_report', (SELECT count(*) FROM public.examinations
        WHERE domain_code='AML_CFT' AND closed_at IS NULL AND upper(COALESCE(stage,'')) IN ('REPORTING','DRAFT_REPORT')),
    'open_findings', (SELECT count(*) FROM public.supervisory_finding
        WHERE domain_code='AML_CFT' AND status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
    'critical_findings', (SELECT count(*) FROM public.supervisory_finding
        WHERE domain_code='AML_CFT' AND severity IN ('HIGH','CRITICAL')
          AND status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
    'overdue_remediation', (SELECT count(*) FROM public.supervisory_remediation_action
        WHERE domain_code='AML_CFT' AND target_date < current_date
          AND status NOT IN ('EFFECTIVE','CLOSED')),
    'reassessments_required', (SELECT count(*) FROM public.supervisory_reassessment_requirement
        WHERE domain_code='AML_CFT' AND status IN ('REQUIRED','IN_PROGRESS'))
  );
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_reassessment_require(_entity_id uuid, _domain_code text, _trigger_kind text, _trigger_rationale text, _requested_type text DEFAULT 'FOLLOW_UP'::text, _due_date date DEFAULT NULL::date, _previous_assessment_id uuid DEFAULT NULL::uuid, _finding_id uuid DEFAULT NULL::uuid, _remediation_action_id uuid DEFAULT NULL::uuid, _validation_id uuid DEFAULT NULL::uuid, _examination_id uuid DEFAULT NULL::uuid, _signal_id uuid DEFAULT NULL::uuid, _enforcement_action_id uuid DEFAULT NULL::uuid, _owner_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _prev uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.review','aml_supervision.approve',
            'aml_supervision.remediation_manage','supervisory_spine.edit','supervisory_spine.approve',
            'prudential_supervision.manage_remediation','market_conduct.approve',
            'inspection_management.edit']);
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _prev := _previous_assessment_id;
  IF _prev IS NULL THEN
    SELECT id INTO _prev FROM public.supervisory_assessment
     WHERE entity_id = _entity_id AND domain_code = upper(_domain_code)
       AND id = (SELECT rs.driving_assessment_id FROM public.entity_risk_state rs
                  WHERE rs.entity_id = _entity_id AND rs.domain_code = upper(_domain_code)) LIMIT 1;
  END IF;

  INSERT INTO public.supervisory_reassessment_requirement(
    entity_id, domain_code, trigger_kind, trigger_rationale, requested_type, due_date,
    previous_assessment_id, finding_id, remediation_action_id, validation_id, examination_id,
    signal_id, enforcement_action_id, owner_id, created_by)
  VALUES (_entity_id, upper(_domain_code), upper(_trigger_kind), btrim(_trigger_rationale),
    upper(_requested_type), COALESCE(_due_date, current_date + 90), _prev, _finding_id,
    _remediation_action_id, _validation_id, _examination_id, _signal_id, _enforcement_action_id,
    _owner_id, _uid)
  RETURNING id INTO _id;

  IF _examination_id IS NOT NULL THEN
    UPDATE public.examinations
       SET reassessment_required = true,
           reassessment_rationale = btrim(_trigger_rationale), updated_at = now()
     WHERE id = _examination_id;
  END IF;

  PERFORM public.log_compliance_audit('CREATE','supervisory_reassessment_requirement', _id, NULL,
    jsonb_build_object('trigger',upper(_trigger_kind),'domain',upper(_domain_code)),
    'Reassessment requirement created — authoritative risk unchanged until a new assessment is approved');

  IF _owner_id IS NOT NULL THEN
    PERFORM public.create_notification(_owner_id, 'AML/CFT reassessment required',
      'A supervisory reassessment is required following ' || lower(replace(upper(_trigger_kind),'_',' ')) || '.',
      'action_required', 'supervisory_reassessment_requirement', _id::text);
  END IF;
  RETURN _id;
END $function$;