-- =====================================================================
-- EPIC 3 / MIGRATION C — AML assessment workspace, closed loop, read models
-- =====================================================================

-- ---------------------------------------- 1. dimension-level judgment
ALTER TABLE public.supervisory_assessment_dimension
  ADD COLUMN IF NOT EXISTS is_applicable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_facts text,
  ADD COLUMN IF NOT EXISTS supervisory_commentary text,
  ADD COLUMN IF NOT EXISTS exceptions text,
  ADD COLUMN IF NOT EXISTS trend text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS data_quality text,
  ADD COLUMN IF NOT EXISTS calculated_inherent_rating text,
  ADD COLUMN IF NOT EXISTS calculated_control_rating text,
  ADD COLUMN IF NOT EXISTS calculated_residual_rating text,
  ADD COLUMN IF NOT EXISTS calculated_score numeric,
  ADD COLUMN IF NOT EXISTS is_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS overridden_by uuid,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_examination_scope boolean NOT NULL DEFAULT false;

ALTER TABLE public.supervisory_assessment_dimension
  DROP CONSTRAINT IF EXISTS sad_trend_chk,
  DROP CONSTRAINT IF EXISTS sad_confidence_chk,
  DROP CONSTRAINT IF EXISTS sad_override_chk;
ALTER TABLE public.supervisory_assessment_dimension
  ADD CONSTRAINT sad_trend_chk CHECK (trend IS NULL OR trend = ANY (ARRAY['IMPROVING','STABLE','DETERIORATING'])),
  ADD CONSTRAINT sad_confidence_chk CHECK (confidence IS NULL OR confidence = ANY (ARRAY['LOW','MEDIUM','HIGH'])),
  ADD CONSTRAINT sad_override_chk CHECK (
    NOT is_overridden OR (override_reason IS NOT NULL AND overridden_by IS NOT NULL AND overridden_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_upsert(
  _assessment_id uuid, _dimension_code text, _dimension_group text DEFAULT 'OTHER',
  _inherent_rating text DEFAULT NULL, _control_rating text DEFAULT NULL,
  _residual_rating text DEFAULT NULL, _weight numeric DEFAULT NULL, _score numeric DEFAULT NULL,
  _rationale text DEFAULT NULL, _methodology_dimension_id uuid DEFAULT NULL,
  _evidence_refs jsonb DEFAULT NULL,
  _source_facts text DEFAULT NULL, _supervisory_commentary text DEFAULT NULL,
  _exceptions text DEFAULT NULL, _trend text DEFAULT NULL, _confidence text DEFAULT NULL,
  _data_quality text DEFAULT NULL, _is_applicable boolean DEFAULT NULL,
  _calculated_inherent_rating text DEFAULT NULL, _calculated_control_rating text DEFAULT NULL,
  _calculated_residual_rating text DEFAULT NULL, _calculated_score numeric DEFAULT NULL,
  _override_reason text DEFAULT NULL, _proposed_examination_scope boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid; _override boolean;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment',
    'aml_supervision.create','aml_supervision.edit','aml_supervision.approve',
    'market_conduct.run_conduct_analytics']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  -- ratings must come from the single canonical scale
  IF NOT (public.supervisory_rating_valid(_inherent_rating)
          AND public.supervisory_rating_valid(_control_rating)
          AND public.supervisory_rating_valid(_residual_rating)) THEN
    RAISE EXCEPTION 'invalid_rating: ratings must use the canonical supervisory rating scale'
      USING ERRCODE = '22023'; END IF;

  -- an approved rating that departs from the calculated rating is an override
  _override := (_calculated_residual_rating IS NOT NULL AND _residual_rating IS NOT NULL
                AND upper(_calculated_residual_rating) <> upper(_residual_rating))
            OR (_calculated_inherent_rating IS NOT NULL AND _inherent_rating IS NOT NULL
                AND upper(_calculated_inherent_rating) <> upper(_inherent_rating))
            OR (_calculated_control_rating IS NOT NULL AND _control_rating IS NOT NULL
                AND upper(_calculated_control_rating) <> upper(_control_rating));
  IF _override AND length(btrim(COALESCE(_override_reason,''))) < 10 THEN
    RAISE EXCEPTION 'override_reason_required: departing from the calculated rating requires a recorded reason'
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_assessment_dimension(
    assessment_id, methodology_dimension_id, dimension_code, dimension_group, weight,
    inherent_rating, control_rating, residual_rating, score, rationale, evidence_refs, created_by,
    is_applicable, source_facts, supervisory_commentary, exceptions, trend, confidence, data_quality,
    calculated_inherent_rating, calculated_control_rating, calculated_residual_rating, calculated_score,
    is_overridden, override_reason, overridden_by, overridden_at, proposed_examination_scope)
  VALUES (_assessment_id, _methodology_dimension_id, _dimension_code, COALESCE(_dimension_group,'OTHER'),
    _weight, _inherent_rating, _control_rating, _residual_rating, _score, _rationale,
    COALESCE(_evidence_refs,'[]'::jsonb), _uid,
    COALESCE(_is_applicable,true), _source_facts, _supervisory_commentary, _exceptions,
    upper(_trend), upper(_confidence), upper(_data_quality),
    _calculated_inherent_rating, _calculated_control_rating, _calculated_residual_rating, _calculated_score,
    _override, CASE WHEN _override THEN btrim(_override_reason) END,
    CASE WHEN _override THEN _uid END, CASE WHEN _override THEN now() END,
    COALESCE(_proposed_examination_scope,false))
  ON CONFLICT (assessment_id, dimension_code) DO UPDATE
    SET dimension_group = EXCLUDED.dimension_group, weight = EXCLUDED.weight,
        inherent_rating = EXCLUDED.inherent_rating, control_rating = EXCLUDED.control_rating,
        residual_rating = EXCLUDED.residual_rating, score = EXCLUDED.score,
        rationale = EXCLUDED.rationale, evidence_refs = EXCLUDED.evidence_refs,
        is_applicable = EXCLUDED.is_applicable, source_facts = EXCLUDED.source_facts,
        supervisory_commentary = EXCLUDED.supervisory_commentary, exceptions = EXCLUDED.exceptions,
        trend = EXCLUDED.trend, confidence = EXCLUDED.confidence, data_quality = EXCLUDED.data_quality,
        calculated_inherent_rating = EXCLUDED.calculated_inherent_rating,
        calculated_control_rating = EXCLUDED.calculated_control_rating,
        calculated_residual_rating = EXCLUDED.calculated_residual_rating,
        calculated_score = EXCLUDED.calculated_score,
        is_overridden = EXCLUDED.is_overridden, override_reason = EXCLUDED.override_reason,
        overridden_by = EXCLUDED.overridden_by, overridden_at = EXCLUDED.overridden_at,
        proposed_examination_scope = EXCLUDED.proposed_examination_scope,
        methodology_dimension_id = COALESCE(EXCLUDED.methodology_dimension_id, supervisory_assessment_dimension.methodology_dimension_id),
        updated_at = now()
  RETURNING id INTO _id;

  IF _override THEN
    PERFORM public.log_compliance_audit('OVERRIDE','supervisory_assessment_dimension', _id,
      jsonb_build_object('calculated_residual',_calculated_residual_rating),
      jsonb_build_object('approved_residual',_residual_rating),
      'Supervisory override of the calculated rating: ' || btrim(COALESCE(_override_reason,'')));
  END IF;

  RETURN jsonb_build_object('id',_id,'assessment_id',_assessment_id,
    'dimension_code',_dimension_code,'is_overridden',_override);
END $$;

-- ---------------------------------------- 2. AML domain extension
ALTER TABLE public.aml_assessments
  ADD COLUMN IF NOT EXISTS methodology_id uuid REFERENCES public.supervisory_methodology(id),
  ADD COLUMN IF NOT EXISTS methodology_version text,
  ADD COLUMN IF NOT EXISTS assessment_type text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS trigger_type text,
  ADD COLUMN IF NOT EXISTS trigger_detail text,
  ADD COLUMN IF NOT EXISTS prior_residual_rating text,
  ADD COLUMN IF NOT EXISTS trend text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS evidence_completeness numeric,
  ADD COLUMN IF NOT EXISTS data_quality text,
  ADD COLUMN IF NOT EXISTS aml_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aml_assessments_envelope
  ON public.aml_assessments(supervisory_assessment_id) WHERE supervisory_assessment_id IS NOT NULL;

-- allow the governed writer through the legacy write guard on the extension
CREATE OR REPLACE FUNCTION public.aml_assessment_detail_save(
  _assessment_id uuid, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid; _prior text; _m record;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.create','aml_supervision.edit',
            'aml_supervision.approve','supervisory_spine.edit']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE='22023'; END IF;
  IF _a.domain_code <> 'AML_CFT' THEN
    RAISE EXCEPTION 'domain_mismatch: the AML extension applies only to AML_CFT assessments' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  SELECT residual_rating INTO _prior FROM public.entity_risk_state
   WHERE entity_id = _a.entity_id AND domain_code = 'AML_CFT';
  SELECT version INTO _m FROM public.supervisory_methodology WHERE id = _a.methodology_id;

  INSERT INTO public.aml_assessments(
    entity_id, reference, assessment_date, inherent_rating, control_rating, residual_rating,
    status, summary, confidential_notes, next_review_date, created_by, supervisory_assessment_id,
    methodology_id, methodology_version, assessment_type, period_start, period_end,
    trigger_type, trigger_detail, prior_residual_rating, trend, confidence,
    evidence_completeness, data_quality, aml_detail)
  VALUES (_a.entity_id, _a.reference, _a.assessment_date, _a.inherent_rating, _a.control_rating,
    _a.residual_rating, _a.status, _a.summary, _payload->>'confidential_notes', _a.next_review_date,
    _uid, _assessment_id, _a.methodology_id, COALESCE(_m.version, _a.methodology_version),
    _a.assessment_type, _a.period_start, _a.period_end, _a.trigger_type,
    _payload->>'trigger_detail', _prior, upper(_payload->>'trend'), upper(_payload->>'confidence'),
    NULLIF(_payload->>'evidence_completeness','')::numeric, upper(_payload->>'data_quality'),
    COALESCE(_payload->'aml_detail','{}'::jsonb))
  ON CONFLICT (supervisory_assessment_id) DO UPDATE
    SET inherent_rating = EXCLUDED.inherent_rating, control_rating = EXCLUDED.control_rating,
        residual_rating = EXCLUDED.residual_rating, status = EXCLUDED.status,
        summary = EXCLUDED.summary,
        confidential_notes = COALESCE(EXCLUDED.confidential_notes, aml_assessments.confidential_notes),
        next_review_date = EXCLUDED.next_review_date, trend = COALESCE(EXCLUDED.trend, aml_assessments.trend),
        confidence = COALESCE(EXCLUDED.confidence, aml_assessments.confidence),
        evidence_completeness = COALESCE(EXCLUDED.evidence_completeness, aml_assessments.evidence_completeness),
        data_quality = COALESCE(EXCLUDED.data_quality, aml_assessments.data_quality),
        trigger_detail = COALESCE(EXCLUDED.trigger_detail, aml_assessments.trigger_detail),
        aml_detail = aml_assessments.aml_detail || EXCLUDED.aml_detail,
        updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ---------------------------------------- 3. examination scope provenance
CREATE TABLE IF NOT EXISTS public.examination_scope_dimension (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES public.supervisory_assessment(id),
  assessment_dimension_id uuid NOT NULL REFERENCES public.supervisory_assessment_dimension(id),
  dimension_code text,
  residual_rating text,
  rationale     text,
  added_by      uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (examination_id, assessment_dimension_id)
);

CREATE TABLE IF NOT EXISTS public.examination_scope_area (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  area_code     text NOT NULL,
  area_label    text,
  source        text NOT NULL DEFAULT 'ASSESSMENT_DERIVED',
  assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id),
  amendment_rationale text,
  added_by      uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (examination_id, area_code),
  CONSTRAINT exam_scope_area_source_chk CHECK (source = ANY (ARRAY['ASSESSMENT_DERIVED','EXAMINER_AMENDED','METHODOLOGY_DEFAULT']))
);

GRANT SELECT ON public.examination_scope_dimension, public.examination_scope_area TO authenticated;
GRANT ALL ON public.examination_scope_dimension, public.examination_scope_area TO service_role;
ALTER TABLE public.examination_scope_dimension ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_scope_area ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS examination_scope_dimension_read ON public.examination_scope_dimension;
CREATE POLICY examination_scope_dimension_read ON public.examination_scope_dimension
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','prudential_supervision.view','aml_supervision.view',
    'market_conduct.view','inspection_management.view']));

DROP POLICY IF EXISTS examination_scope_area_read ON public.examination_scope_area;
CREATE POLICY examination_scope_area_read ON public.examination_scope_area
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','prudential_supervision.view','aml_supervision.view',
    'market_conduct.view','inspection_management.view']));

CREATE OR REPLACE FUNCTION public.examination_scope_from_assessment(
  _examination_id uuid, _dimension_ids uuid[], _rationale text DEFAULT NULL,
  _include_areas boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _e public.examinations; _d record; _n int := 0; _areas int := 0;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.examine','supervisory_spine.edit',
            'prudential_supervision.manage_examination','inspection_management.edit']);
  SELECT * INTO _e FROM public.examinations WHERE id = _examination_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'not_found: examination' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _e.entity_id);

  FOR _d IN
    SELECT sad.id, sad.assessment_id, sad.dimension_code, sad.residual_rating, sad.dimension_group,
           a.entity_id
      FROM public.supervisory_assessment_dimension sad
      JOIN public.supervisory_assessment a ON a.id = sad.assessment_id
     WHERE sad.id = ANY(_dimension_ids)
  LOOP
    IF _d.entity_id <> _e.entity_id THEN
      RAISE EXCEPTION 'scope_entity_mismatch: dimension % belongs to a different entity', _d.dimension_code
        USING ERRCODE='22023'; END IF;

    INSERT INTO public.examination_scope_dimension(
      examination_id, assessment_id, assessment_dimension_id, dimension_code, residual_rating, rationale, added_by)
    VALUES (_examination_id, _d.assessment_id, _d.id, _d.dimension_code, _d.residual_rating,
            btrim(COALESCE(_rationale,'')), _uid)
    ON CONFLICT (examination_id, assessment_dimension_id) DO UPDATE
      SET residual_rating = EXCLUDED.residual_rating, rationale = EXCLUDED.rationale;
    _n := _n + 1;

    IF _include_areas THEN
      INSERT INTO public.examination_scope_area(
        examination_id, area_code, area_label, source, assessment_dimension_id, added_by)
      VALUES (_examination_id, _d.dimension_code, initcap(replace(_d.dimension_code,'_',' ')),
              'ASSESSMENT_DERIVED', _d.id, _uid)
      ON CONFLICT (examination_id, area_code) DO NOTHING;
      _areas := _areas + 1;
    END IF;
  END LOOP;

  IF _n = 0 THEN
    RAISE EXCEPTION 'no_scope_dimensions: no matching assessment dimensions were supplied' USING ERRCODE='22023'; END IF;

  PERFORM public.log_compliance_audit('UPDATE','examinations', _examination_id, NULL,
    jsonb_build_object('scope_dimensions',_n,'scope_areas',_areas),
    'Examination scope derived from approved assessment dimensions');

  RETURN jsonb_build_object('examination_id',_examination_id,'dimensions',_n,'areas',_areas);
END $$;

CREATE OR REPLACE FUNCTION public.examination_scope_area_amend(
  _examination_id uuid, _area_code text, _area_label text, _rationale text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _e public.examinations; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.examine','supervisory_spine.edit',
            'prudential_supervision.manage_examination','inspection_management.edit']);
  SELECT * INTO _e FROM public.examinations WHERE id = _examination_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'not_found: examination' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _e.entity_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'an amendment rationale of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  INSERT INTO public.examination_scope_area(
    examination_id, area_code, area_label, source, amendment_rationale, added_by)
  VALUES (_examination_id, upper(_area_code), _area_label, 'EXAMINER_AMENDED', btrim(_rationale), _uid)
  ON CONFLICT (examination_id, area_code) DO UPDATE
    SET area_label = EXCLUDED.area_label, source = 'EXAMINER_AMENDED',
        amendment_rationale = EXCLUDED.amendment_rationale
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ---------------------------------------- 4. AML supervisory signals
CREATE OR REPLACE FUNCTION public.supervisory_signal_record(
  _entity_id uuid, _domain_code text, _source_kind text, _summary text,
  _severity text DEFAULT 'medium', _detail jsonb DEFAULT '{}'::jsonb,
  _period_start date DEFAULT NULL, _period_end date DEFAULT NULL,
  _external_reference text DEFAULT NULL, _examination_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.create','aml_supervision.edit',
            'supervisory_spine.edit','supervisory_spine.create',
            'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics']);
  IF NOT public.supervisory_domain_valid(upper(_domain_code)) THEN
    RAISE EXCEPTION 'invalid_domain: %', _domain_code USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_summary,''))) < 10 THEN
    RAISE EXCEPTION 'a signal summary of at least 10 characters is required' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  INSERT INTO public.supervisory_signal(
    entity_id, domain_code, source_kind, severity, summary, detail,
    period_start, period_end, external_reference, examination_id, created_by)
  VALUES (_entity_id, upper(_domain_code), upper(_source_kind), lower(_severity), btrim(_summary),
          COALESCE(_detail,'{}'::jsonb), _period_start, _period_end, _external_reference,
          _examination_id, _uid)
  RETURNING id INTO _id;

  PERFORM public.log_compliance_audit('CREATE','supervisory_signal', _id, NULL,
    jsonb_build_object('source_kind',upper(_source_kind),'severity',lower(_severity)),
    'Supervisory signal recorded (input to judgment, not a risk decision)');
  RETURN _id;
END $$;

-- ---------------------------------------- 5. reassessment requirement
CREATE TABLE IF NOT EXISTS public.supervisory_reassessment_requirement (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           uuid NOT NULL,
  domain_code         text NOT NULL,
  trigger_kind        text NOT NULL,
  trigger_rationale   text NOT NULL,
  requested_type      text NOT NULL DEFAULT 'FOLLOW_UP',
  previous_assessment_id uuid REFERENCES public.supervisory_assessment(id),
  finding_id          uuid REFERENCES public.supervisory_finding(id),
  remediation_action_id uuid REFERENCES public.supervisory_remediation_action(id),
  validation_id       uuid REFERENCES public.supervisory_remediation_validation(id),
  examination_id      uuid REFERENCES public.examinations(id),
  signal_id           uuid REFERENCES public.supervisory_signal(id),
  enforcement_action_id uuid REFERENCES public.enforcement_actions(id),
  due_date            date,
  owner_id            uuid,
  team_id             uuid,
  status              text NOT NULL DEFAULT 'REQUIRED',
  fulfilled_assessment_id uuid REFERENCES public.supervisory_assessment(id),
  fulfilled_at        timestamptz,
  cancelled_reason    text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT srr_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT srr_status_chk CHECK (status = ANY (ARRAY['REQUIRED','IN_PROGRESS','FULFILLED','CANCELLED'])),
  CONSTRAINT srr_type_chk CHECK (requested_type = ANY (ARRAY['PERIODIC','EVENT_DRIVEN','TARGETED','FOLLOW_UP','INITIAL_BASELINE'])),
  CONSTRAINT srr_trigger_chk CHECK (trigger_kind = ANY (ARRAY[
    'EXAMINATION_CONCLUSION','MATERIAL_FINDING','REMEDIATION_COMPLETED','REMEDIATION_INEFFECTIVE',
    'ENFORCEMENT_OUTCOME','MATERIAL_SIGNAL','SIGNIFICANT_ENTITY_CHANGE','SUPERVISORY_DIRECTION'])),
  CONSTRAINT srr_rationale_chk CHECK (length(btrim(trigger_rationale)) >= 20),
  -- a requirement must carry at least one authoritative origin
  CONSTRAINT srr_provenance_chk CHECK (
    finding_id IS NOT NULL OR remediation_action_id IS NOT NULL OR validation_id IS NOT NULL
    OR examination_id IS NOT NULL OR signal_id IS NOT NULL OR enforcement_action_id IS NOT NULL
    OR previous_assessment_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_srr_open ON public.supervisory_reassessment_requirement(entity_id, domain_code, status);

GRANT SELECT ON public.supervisory_reassessment_requirement TO authenticated;
GRANT ALL ON public.supervisory_reassessment_requirement TO service_role;
ALTER TABLE public.supervisory_reassessment_requirement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srr_read ON public.supervisory_reassessment_requirement;
CREATE POLICY srr_read ON public.supervisory_reassessment_requirement
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','prudential_supervision.view','aml_supervision.view',
    'market_conduct.view','inspection_management.view']));

CREATE OR REPLACE FUNCTION public.supervisory_reassessment_require(
  _entity_id uuid, _domain_code text, _trigger_kind text, _trigger_rationale text,
  _requested_type text DEFAULT 'FOLLOW_UP', _due_date date DEFAULT NULL,
  _previous_assessment_id uuid DEFAULT NULL, _finding_id uuid DEFAULT NULL,
  _remediation_action_id uuid DEFAULT NULL, _validation_id uuid DEFAULT NULL,
  _examination_id uuid DEFAULT NULL, _signal_id uuid DEFAULT NULL,
  _enforcement_action_id uuid DEFAULT NULL, _owner_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
     WHERE entity_id = _entity_id AND domain_code = upper(_domain_code) AND is_current LIMIT 1;
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
END $$;

-- ---------------------------------------- 6. authoritative risk movement history
CREATE TABLE IF NOT EXISTS public.entity_risk_state_movement (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             uuid NOT NULL,
  domain_code           text NOT NULL,
  previous_assessment_id uuid REFERENCES public.supervisory_assessment(id),
  new_assessment_id     uuid NOT NULL REFERENCES public.supervisory_assessment(id),
  previous_rating       text,
  new_rating            text,
  previous_inherent     text,
  new_inherent          text,
  previous_control      text,
  new_control           text,
  trend                 text,
  reason                text,
  trigger_kind          text,
  requirement_id        uuid REFERENCES public.supervisory_reassessment_requirement(id),
  supporting_finding_ids uuid[],
  remediation_action_ids uuid[],
  examination_id        uuid REFERENCES public.examinations(id),
  approved_by           uuid,
  approved_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_movement_entity ON public.entity_risk_state_movement(entity_id, domain_code, approved_at DESC);

GRANT SELECT ON public.entity_risk_state_movement TO authenticated;
GRANT ALL ON public.entity_risk_state_movement TO service_role;
ALTER TABLE public.entity_risk_state_movement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_risk_state_movement_read ON public.entity_risk_state_movement;
CREATE POLICY entity_risk_state_movement_read ON public.entity_risk_state_movement
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','prudential_supervision.view','aml_supervision.view',
    'market_conduct.view','inspection_management.view']));

-- record movement + fulfil the reassessment requirement on approval
CREATE OR REPLACE FUNCTION public.supervisory_risk_movement_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _prev_rating text; _prev_assessment uuid; _req uuid; _trend text; _ord_old int; _ord_new int;
BEGIN
  IF NEW.status <> 'approved' OR COALESCE(OLD.status,'') = 'approved' THEN RETURN NEW; END IF;

  SELECT residual_rating, driving_assessment_id INTO _prev_rating, _prev_assessment
    FROM public.entity_risk_state
   WHERE entity_id = NEW.entity_id AND domain_code = NEW.domain_code;

  SELECT ordinal INTO _ord_old FROM public.supervisory_rating_scale WHERE code = upper(COALESCE(_prev_rating,''));
  SELECT ordinal INTO _ord_new FROM public.supervisory_rating_scale WHERE code = upper(COALESCE(NEW.residual_rating,''));
  _trend := CASE WHEN _ord_old IS NULL OR _ord_new IS NULL THEN 'STABLE'
                 WHEN _ord_new < _ord_old THEN 'IMPROVING'
                 WHEN _ord_new > _ord_old THEN 'DETERIORATING'
                 ELSE 'STABLE' END;

  SELECT id INTO _req FROM public.supervisory_reassessment_requirement
   WHERE entity_id = NEW.entity_id AND domain_code = NEW.domain_code
     AND status IN ('REQUIRED','IN_PROGRESS')
   ORDER BY created_at LIMIT 1;

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

  IF _req IS NOT NULL THEN
    UPDATE public.supervisory_reassessment_requirement
       SET status = 'FULFILLED', fulfilled_assessment_id = NEW.id, fulfilled_at = now(), updated_at = now()
     WHERE id = _req;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_risk_movement_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS supervisory_assessment_risk_movement ON public.supervisory_assessment;
CREATE TRIGGER supervisory_assessment_risk_movement
  AFTER UPDATE OF status ON public.supervisory_assessment
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_risk_movement_record();

-- ---------------------------------------- 7. AML read models
CREATE OR REPLACE FUNCTION public.aml_overview_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE _supervised int; _with_current int;
BEGIN
  SELECT count(*) INTO _supervised FROM public.licensees l WHERE COALESCE(l.status,'') <> 'archived';
  SELECT count(*) INTO _with_current FROM public.supervisory_assessment
   WHERE domain_code = 'AML_CFT' AND status = 'approved' AND is_current;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'entities_supervised', _supervised,
    'entities_with_current_assessment', _with_current,
    'assessment_coverage_pct', CASE WHEN _supervised > 0
        THEN round((_with_current::numeric / _supervised) * 100, 1) ELSE 0 END,
    'assessments_due', (SELECT count(*) FROM public.entity_risk_state
        WHERE domain_code='AML_CFT' AND next_review_date BETWEEN current_date AND current_date + 60),
    'assessments_overdue', (SELECT count(*) FROM public.entity_risk_state
        WHERE domain_code='AML_CFT' AND next_review_date < current_date),
    'assessments_awaiting_review', (SELECT count(*) FROM public.supervisory_assessment
        WHERE domain_code='AML_CFT' AND status IN ('submitted','reviewed')),
    'high_risk_entities', (SELECT count(*) FROM public.entity_risk_state
        WHERE domain_code='AML_CFT' AND residual_rating IN ('HIGH','SEVERE')),
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
END $$;

CREATE OR REPLACE FUNCTION public.aml_work_queue(_limit int DEFAULT 100)
RETURNS TABLE(kind text, id uuid, entity_id uuid, title text, severity text, status text,
              due_at date, href text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT 'assessment_awaiting_action', a.id, a.entity_id,
         'AML assessment ' || a.reference || ' (' || a.status || ')',
         COALESCE(a.residual_rating,'MEDIUM'), a.status, a.next_review_date,
         '/supervision/aml/assessments/' || a.id
    FROM public.supervisory_assessment a
   WHERE a.domain_code='AML_CFT' AND a.status IN ('draft','submitted','reviewed','returned_for_revision')
  UNION ALL
  SELECT 'assessment_overdue', r.id, r.entity_id,
         'AML assessment overdue since ' || r.next_review_date::text, 'HIGH', 'OVERDUE', r.next_review_date,
         '/supervision/aml/supervised-entities'
    FROM public.entity_risk_state r
   WHERE r.domain_code='AML_CFT' AND r.next_review_date < current_date
  UNION ALL
  SELECT 'attention_awaiting_prioritisation', at.id, NULL::uuid, at.title,
         upper(COALESCE(at.materiality,'medium')), at.status, at.target_review_date,
         '/supervision/attention/' || at.id
    FROM public.supervisory_attention at
   WHERE at.domain_code='AML_CFT' AND at.status='OPEN'
  UNION ALL
  SELECT 'plan_awaiting_approval', p.id, NULL::uuid, p.title, upper(COALESCE(p.priority,'medium')),
         p.status, p.target_completion, '/supervision/plans/' || p.id
    FROM public.supervisory_plan p
   WHERE p.domain_code='AML_CFT' AND p.status IN ('submitted','draft')
  UNION ALL
  SELECT 'examination_action_due', e.id, e.entity_id, 'AML examination ' || e.reference,
         upper(COALESCE(e.risk_rating,'medium')), COALESCE(e.stage,'PLANNING'), e.fieldwork_end,
         '/supervision/examinations/' || e.id
    FROM public.examinations e
   WHERE e.domain_code='AML_CFT' AND e.closed_at IS NULL
  UNION ALL
  SELECT 'workpaper_awaiting_review', w.id, e2.entity_id, 'Workpaper awaiting review',
         'MEDIUM', COALESCE(w.status,'DRAFT'), NULL::date, '/supervision/examinations/' || w.examination_id
    FROM public.examination_workpapers w
    JOIN public.examinations e2 ON e2.id = w.examination_id
   WHERE e2.domain_code='AML_CFT' AND upper(COALESCE(w.status,'')) IN ('SUBMITTED','IN_REVIEW')
  UNION ALL
  SELECT 'finding_action', f.id, f.entity_id, f.reference || ' — ' || f.title, f.severity, f.status,
         f.due_date, '/supervision/aml/findings/' || f.id
    FROM public.supervisory_finding f
   WHERE f.domain_code='AML_CFT' AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
  UNION ALL
  SELECT 'management_response_overdue', f2.id, f2.entity_id,
         'Management response overdue: ' || f2.reference, f2.severity, f2.status, f2.due_date,
         '/supervision/aml/findings/' || f2.id
    FROM public.supervisory_finding f2
   WHERE f2.domain_code='AML_CFT' AND f2.status='ISSUED' AND f2.response_at IS NULL
     AND f2.due_date IS NOT NULL AND f2.due_date < current_date
  UNION ALL
  SELECT CASE WHEN ra.target_date < current_date THEN 'remediation_overdue'
              WHEN ra.status='VALIDATION' THEN 'validation_required'
              ELSE 'remediation_action' END,
         ra.id, ra.entity_id, ra.reference || ' — ' || left(ra.description, 80),
         'MEDIUM', ra.status, ra.target_date, '/supervision/aml/findings/' || ra.finding_id
    FROM public.supervisory_remediation_action ra
   WHERE ra.domain_code='AML_CFT' AND ra.status NOT IN ('CLOSED','EFFECTIVE')
  UNION ALL
  SELECT 'reassessment_required', rr.id, rr.entity_id,
         'Reassessment required: ' || replace(rr.trigger_kind,'_',' '), 'HIGH', rr.status, rr.due_date,
         '/supervision/aml/supervised-entities'
    FROM public.supervisory_reassessment_requirement rr
   WHERE rr.domain_code='AML_CFT' AND rr.status IN ('REQUIRED','IN_PROGRESS')
  UNION ALL
  SELECT 'enforcement_followup', ea.id, ea.entity_id,
         'Enforcement follow-up ' || COALESCE(ea.case_number,''), upper(COALESCE(ea.severity,'high')),
         COALESCE(ea.status,'open'), ea.appeal_deadline, '/enforcement/' || ea.id
    FROM public.enforcement_actions ea
   WHERE ea.supervisory_finding_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.supervisory_finding f3
                  WHERE f3.id = ea.supervisory_finding_id AND f3.domain_code='AML_CFT')
     AND ea.closed_at IS NULL
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.aml_portfolio(_limit int DEFAULT 200)
RETURNS TABLE(entity_id uuid, entity_name text, sector_name text, residual_rating text,
              inherent_rating text, control_rating text, trend text, last_review_date date,
              next_review_date date, assessment_current boolean, high_risk_dimensions text[],
              open_findings int, critical_findings int, overdue_remediation int,
              active_examinations int, reassessment_required boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT l.id, l.name, s.name, rs.residual_rating, rs.inherent_rating, rs.control_rating,
         COALESCE((SELECT m.trend FROM public.entity_risk_state_movement m
                    WHERE m.entity_id = l.id AND m.domain_code='AML_CFT'
                    ORDER BY m.approved_at DESC LIMIT 1), 'STABLE'),
         rs.last_review_date, rs.next_review_date,
         (rs.next_review_date IS NULL OR rs.next_review_date >= current_date),
         COALESCE((SELECT array_agg(d.dimension_code ORDER BY d.dimension_code)
                     FROM public.supervisory_assessment_dimension d
                    WHERE d.assessment_id = rs.driving_assessment_id
                      AND upper(COALESCE(d.residual_rating,'')) IN ('HIGH','SEVERE','MEDIUM_HIGH')), '{}'::text[]),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id=l.id AND f.domain_code='AML_CFT'
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id=l.id AND f.domain_code='AML_CFT' AND f.severity IN ('HIGH','CRITICAL')
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_remediation_action a
           WHERE a.entity_id=l.id AND a.domain_code='AML_CFT' AND a.target_date < current_date
             AND a.status NOT IN ('EFFECTIVE','CLOSED')),
         (SELECT count(*)::int FROM public.examinations e
           WHERE e.entity_id=l.id AND e.domain_code='AML_CFT' AND e.closed_at IS NULL),
         EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                  WHERE rr.entity_id=l.id AND rr.domain_code='AML_CFT'
                    AND rr.status IN ('REQUIRED','IN_PROGRESS'))
    FROM public.licensees l
    LEFT JOIN public.entity_risk_state rs ON rs.entity_id = l.id AND rs.domain_code='AML_CFT'
    LEFT JOIN public.sectors s ON s.id = l.sector_id
   WHERE COALESCE(l.status,'') <> 'archived'
   ORDER BY CASE upper(COALESCE(rs.residual_rating,'')) WHEN 'SEVERE' THEN 1 WHEN 'HIGH' THEN 2
              WHEN 'MEDIUM_HIGH' THEN 3 WHEN 'MODERATE' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END,
            l.name
   LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.aml_entity_panel(_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE _rs public.entity_risk_state; _a public.supervisory_assessment; _mv record;
BEGIN
  SELECT * INTO _rs FROM public.entity_risk_state
   WHERE entity_id = _entity_id AND domain_code='AML_CFT';
  SELECT * INTO _a FROM public.supervisory_assessment
   WHERE entity_id = _entity_id AND domain_code='AML_CFT' AND status='approved' AND is_current LIMIT 1;
  SELECT previous_rating, new_rating, trend, approved_at INTO _mv
    FROM public.entity_risk_state_movement
   WHERE entity_id = _entity_id AND domain_code='AML_CFT' ORDER BY approved_at DESC LIMIT 1;

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
END $$;

-- ---------------------------------------- 8. grants on new operations
REVOKE ALL ON FUNCTION public.aml_assessment_detail_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.examination_scope_from_assessment(uuid, uuid[], text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.examination_scope_area_amend(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_signal_record(uuid, text, text, text, text, jsonb, date, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_reassessment_require(uuid, text, text, text, text, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aml_overview_metrics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aml_work_queue(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aml_portfolio(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aml_entity_panel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aml_assessment_detail_save(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.examination_scope_from_assessment(uuid, uuid[], text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.examination_scope_area_amend(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_signal_record(uuid, text, text, text, text, jsonb, date, date, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_reassessment_require(uuid, text, text, text, text, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aml_overview_metrics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aml_work_queue(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aml_portfolio(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aml_entity_panel(uuid) TO authenticated, service_role;