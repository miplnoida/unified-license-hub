-- PCOMP-R2G — risk history semantics.
-- Root cause: the legacy AFTER UPDATE OF status trigger supervisory_risk_movement_record()
-- wrote an operative movement on approval, while the governed AML-07 publication writer
-- supervisory_assessment_publish_internal() writes the canonical movement on publication.
-- Under the governed path both fired, producing two equivalent movements per publication.
-- AML-07 semantics: approval binds the approved assessment result; ONLY publication
-- establishes the entity's operative risk-of-record and its canonical movement.
-- Historical rows are immutable and are NOT touched by this migration.

CREATE OR REPLACE FUNCTION public.supervisory_risk_movement_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _prev_rating text; _prev_assessment uuid; _req uuid; _trend text; _ord_old int; _ord_new int;
        _governed boolean;
BEGIN
  IF NEW.status <> 'approved' OR COALESCE(OLD.status,'') = 'approved' THEN RETURN NEW; END IF;

  -- Ownership split. A governed AML-07 approval carries an approval decision; for those the
  -- canonical risk movement belongs exclusively to the publication event, so this legacy
  -- writer must not create one. Assessments approved without a governed approval decision
  -- keep the documented pre-AML-07 atomic approval+publication compatibility behaviour.
  _governed := NEW.approval_decision_id IS NOT NULL;

  SELECT id INTO _req FROM public.supervisory_reassessment_requirement
   WHERE entity_id = NEW.entity_id AND domain_code = NEW.domain_code
     AND status IN ('REQUIRED','IN_PROGRESS')
   ORDER BY created_at LIMIT 1;

  IF NOT _governed THEN
    SELECT residual_rating, driving_assessment_id INTO _prev_rating, _prev_assessment
      FROM public.entity_risk_state
     WHERE entity_id = NEW.entity_id AND domain_code = NEW.domain_code;

    SELECT ordinal INTO _ord_old FROM public.supervisory_rating_scale WHERE code = upper(COALESCE(_prev_rating,''));
    SELECT ordinal INTO _ord_new FROM public.supervisory_rating_scale WHERE code = upper(COALESCE(NEW.residual_rating,''));
    _trend := CASE WHEN _ord_old IS NULL OR _ord_new IS NULL THEN 'STABLE'
                   WHEN _ord_new < _ord_old THEN 'IMPROVING'
                   WHEN _ord_new > _ord_old THEN 'DETERIORATING'
                   ELSE 'STABLE' END;

    INSERT INTO public.entity_risk_state_movement(
      entity_id, domain_code, previous_assessment_id, new_assessment_id,
      previous_rating, new_rating, previous_inherent, new_inherent, previous_control, new_control,
      trend, reason, trigger_kind, requirement_id, supporting_finding_ids, remediation_action_ids,
      examination_id, approved_by, approved_at)
    SELECT NEW.entity_id, NEW.domain_code, COALESCE(_prev_assessment, NEW.supersedes_id), NEW.id,
      _prev_rating, NEW.residual_rating,
      (SELECT inherent_rating FROM public.supervisory_assessment WHERE id = _prev_assessment),
      NEW.inherent_rating,
      (SELECT control_rating FROM public.supervisory_assessment WHERE id = _prev_assessment),
      NEW.control_rating,
      _trend, NEW.summary, COALESCE(r.trigger_kind, NEW.trigger_type), _req,
      (SELECT array_agg(f.id) FROM public.supervisory_finding f
        WHERE f.entity_id = NEW.entity_id AND f.domain_code = NEW.domain_code
          AND f.status IN ('CLOSED','VALIDATION','REMEDIATION_REQUIRED')),
      (SELECT array_agg(a.id) FROM public.supervisory_remediation_action a
        JOIN public.supervisory_finding f2 ON f2.id = a.finding_id
        WHERE f2.entity_id = NEW.entity_id AND f2.domain_code = NEW.domain_code),
      COALESCE(r.examination_id, NULL), NEW.approved_by, COALESCE(NEW.approved_at, now())
    FROM (SELECT trigger_kind, examination_id FROM public.supervisory_reassessment_requirement WHERE id = _req
          UNION ALL SELECT NULL, NULL WHERE _req IS NULL) r
    LIMIT 1;
  END IF;

  IF _req IS NOT NULL THEN
    UPDATE public.supervisory_reassessment_requirement
       SET status = 'FULFILLED', fulfilled_assessment_id = NEW.id, fulfilled_at = now(), updated_at = now()
     WHERE id = _req;
  END IF;
  RETURN NEW;
END $function$;

-- Structural backstop. Identity is the governed publication event for a given assessment,
-- never the rating text: a genuinely distinct later assessment (a real new supervisory
-- decision) has a different new_assessment_id and may record the same rating again.
CREATE UNIQUE INDEX IF NOT EXISTS entity_risk_state_movement_publication_identity_uq
  ON public.entity_risk_state_movement (new_assessment_id, domain_code)
  WHERE trigger_kind = 'ASSESSMENT_APPROVAL' AND new_assessment_id IS NOT NULL;

-- Stale explanatory text corrected: four runtime families are demonstrably consumed.
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_resolve(_domain_code text, _regulator_id uuid DEFAULT NULL::uuid, _sector_id uuid DEFAULT NULL::uuid, _as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  _res := public.supervisory_policy_profile_effective(_domain_code, _regulator_id, _sector_id, NULL, _as_of);
  RETURN _res || jsonb_build_object(
    'resolved', (_res->>'status') = 'RESOLVED',
    'binds_operational_assessments', true,
    'runtime_consumed_components', jsonb_build_array(
      'EVIDENCE_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY'),
    'configuration_only_components', jsonb_build_array(
      'SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING','MATERIALITY_POLICY',
      'DASHBOARD_POLICY','NOTIFICATION_POLICY'),
    'note', 'New programmed assessments resolve this profile and record an immutable policy basis snapshot. '||
            'Four bound component families are consumed at runtime: EVIDENCE_POLICY governs evidence '||
            'sufficiency and readiness, JUDGEMENT_POLICY governs permitted rating overrides, '||
            'RESPONSE_POLICY governs required and prohibited supervisory responses, and SLA_POLICY '||
            'governs response deadlines. The remaining six families (SECTOR_OVERLAY, FACT_CONFIG, '||
            'SOURCE_BINDING, MATERIALITY_POLICY, DASHBOARD_POLICY, NOTIFICATION_POLICY) are '||
            'authorable, validatable and bindable configuration only, and are not yet runtime consumed.');
END $function$;