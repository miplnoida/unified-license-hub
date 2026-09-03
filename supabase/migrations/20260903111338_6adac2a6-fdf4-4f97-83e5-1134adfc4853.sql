-- Epic 4 / W4-A6 — governed supervisory domain applicability perimeter
CREATE TABLE public.supervisory_domain_perimeter (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  domain_code text NOT NULL,
  is_applicable boolean NOT NULL DEFAULT true,
  basis text NOT NULL,
  determined_by uuid REFERENCES auth.users(id),
  determined_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_domain_perimeter_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT supervisory_domain_perimeter_unique UNIQUE (entity_id, domain_code)
);

GRANT SELECT ON public.supervisory_domain_perimeter TO authenticated;
GRANT ALL ON public.supervisory_domain_perimeter TO service_role;

ALTER TABLE public.supervisory_domain_perimeter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supervisory_domain_perimeter_read"
ON public.supervisory_domain_perimeter FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR ((NOT public.has_external_role(auth.uid()))
      AND public.has_any_permission(auth.uid(), ARRAY[
        'supervisory_spine.view','prudential_supervision.view','aml_supervision.view']))
);

CREATE TRIGGER supervisory_domain_perimeter_touch
BEFORE UPDATE ON public.supervisory_domain_perimeter
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_column();

CREATE INDEX supervisory_domain_perimeter_domain_idx
  ON public.supervisory_domain_perimeter(domain_code, is_applicable);

COMMENT ON TABLE public.supervisory_domain_perimeter IS
  'CANONICAL. Governed supervisory domain applicability. Absence of a row means applicable; only an explicit determination places an entity outside a domain perimeter.';

-- Applicability helper: applicable unless an explicit determination excludes it.
CREATE OR REPLACE FUNCTION public.supervisory_domain_applicable(_entity_id uuid, _domain_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT p.is_applicable
                     FROM public.supervisory_domain_perimeter p
                    WHERE p.entity_id = _entity_id
                      AND p.domain_code = _domain_code), true);
$$;

REVOKE ALL ON FUNCTION public.supervisory_domain_applicable(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_applicable(uuid, text) TO authenticated, service_role;

-- Governed writer
CREATE OR REPLACE FUNCTION public.supervisory_domain_perimeter_set(
  _entity_id uuid, _domain_code text, _is_applicable boolean, _basis text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _id uuid; _before jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY[
    'aml_supervision.manage_config','prudential_supervision.manage_config',
    'supervisory_spine.manage_config']);
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  IF _basis IS NULL OR length(btrim(_basis)) < 10 THEN
    RAISE EXCEPTION 'perimeter_basis_required: state why this domain does or does not apply'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  SELECT to_jsonb(p) INTO _before FROM public.supervisory_domain_perimeter p
   WHERE p.entity_id = _entity_id AND p.domain_code = _domain_code;

  INSERT INTO public.supervisory_domain_perimeter(
    entity_id, domain_code, is_applicable, basis, determined_by, determined_at)
  VALUES (_entity_id, _domain_code, _is_applicable, btrim(_basis), _uid, now())
  ON CONFLICT (entity_id, domain_code) DO UPDATE
    SET is_applicable = EXCLUDED.is_applicable,
        basis         = EXCLUDED.basis,
        determined_by = EXCLUDED.determined_by,
        determined_at = now()
  RETURNING id INTO _id;

  PERFORM public.log_compliance_audit(
    CASE WHEN _before IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
    'supervisory_domain_perimeter', _id, _before,
    jsonb_build_object('entity_id',_entity_id,'domain_code',_domain_code,
                       'is_applicable',_is_applicable,'basis',btrim(_basis)),
    'Supervisory perimeter determination for ' || _domain_code);

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_domain_perimeter_set(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_perimeter_set(uuid, text, boolean, text) TO authenticated, service_role;

-- An assessment may not be raised for an entity explicitly outside the perimeter.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_create(_entity_id uuid, _domain_code text, _assessment_type text DEFAULT 'PERIODIC'::text, _period_start date DEFAULT NULL::date, _period_end date DEFAULT NULL::date, _methodology_id uuid DEFAULT NULL::uuid, _trigger_type text DEFAULT 'PERIODIC'::text, _trigger_signal_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text, _owner_id uuid DEFAULT NULL::uuid, _supersedes_id uuid DEFAULT NULL::uuid, _confidentiality text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _mv text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create','aml_supervision.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  IF NOT public.supervisory_domain_applicable(_entity_id, _domain_code) THEN
    RAISE EXCEPTION 'domain_not_applicable: % supervision has been determined not to apply to this entity; record a governed perimeter determination before assessing it', _domain_code
      USING ERRCODE = '22023';
  END IF;

  SELECT l.sector_id, s.regulator_id INTO _sector, _reg
    FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id
   WHERE l.id = _entity_id;
  IF _methodology_id IS NOT NULL THEN
    SELECT version INTO _mv FROM public.supervisory_methodology WHERE id = _methodology_id;
    IF _mv IS NULL THEN
      RAISE EXCEPTION 'not_found: methodology does not exist' USING ERRCODE = '22023';
    END IF;
  END IF;

  _ref := 'SUP-' || _domain_code || '-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.supervisory_assessment_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_assessment(
    reference, entity_id, domain_code, assessment_type, methodology_id, methodology_version,
    period_start, period_end, trigger_type, trigger_signal_id, summary, owner_id,
    regulator_id, sector_id, supersedes_id, confidentiality, origin_provenance, created_by)
  VALUES (_ref, _entity_id, _domain_code, COALESCE(_assessment_type,'PERIODIC'), _methodology_id, _mv,
    _period_start, _period_end, COALESCE(_trigger_type,'PERIODIC'), _trigger_signal_id, _summary,
    COALESCE(_owner_id,_uid), _reg, _sector, _supersedes_id,
    COALESCE(_confidentiality, CASE WHEN _domain_code = 'AML_CFT' THEN 'CONFIDENTIAL' ELSE 'STANDARD' END),
    'GOVERNED', _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'draft', _summary,
    jsonb_build_object('domain_code',_domain_code,'trigger_type',_trigger_type,'supersedes_id',_supersedes_id), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_assessment',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code,'entity_id',_entity_id),
    'Supervisory assessment ' || _ref || ' created');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','draft','domain_code',_domain_code);
END $function$;

-- AML overview counts only the AML/CFT perimeter.
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
   WHERE a.domain_code = 'AML_CFT' AND a.status = 'approved' AND a.is_current
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

-- AML portfolio (and therefore the heatmap) covers only the AML/CFT perimeter.
CREATE OR REPLACE FUNCTION public.aml_portfolio(_limit integer DEFAULT 200)
RETURNS TABLE(entity_id uuid, entity_name text, sector_name text, licence_reference text, residual_rating text, inherent_rating text, control_rating text, prior_rating text, trend text, last_review_date date, next_review_date date, assessment_current boolean, last_assessment_id uuid, last_assessment_reference text, last_assessment_status text, methodology_version text, assigned_officer_id uuid, assigned_officer_name text, assigned_team_id uuid, high_risk_dimensions text[], open_findings integer, critical_findings integer, overdue_remediation integer, active_examinations integer, reassessment_required boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH cur AS (
    SELECT a.* FROM public.supervisory_assessment a
     WHERE a.domain_code = 'AML_CFT' AND a.status = 'approved' AND a.is_current
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