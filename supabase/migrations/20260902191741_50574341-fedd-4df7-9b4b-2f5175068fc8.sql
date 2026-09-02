-- ============================================================
-- EPIC 2 — governed operations for the canonical supervisory spine
-- ============================================================

CREATE OR REPLACE FUNCTION public.supervisory_domain_valid(_domain text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _domain IN ('PRUDENTIAL','AML_CFT','MARKET_CONDUCT','OPERATIONAL_RESILIENCE',
                     'GOVERNANCE','CYBER','CROSS_DOMAIN')
$$;

-- ---------- authorisation helpers ----------
CREATE OR REPLACE FUNCTION public.supervisory_spine_require(_actions text[])
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(_uid) OR public.has_any_permission(_uid, _actions) THEN
    RETURN _uid;
  END IF;
  RAISE EXCEPTION 'not_authorized: % required', array_to_string(_actions, ' or ') USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.supervisory_spine_require(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_spine_require(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_entity_scope_check(_uid uuid, _entity_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _entity_id IS NULL OR public.is_super_admin(_uid) THEN RETURN; END IF;
  IF public.has_permission(_uid, 'supervisory_spine', 'view_all_entities')
     OR public.has_permission(_uid, 'prudential_supervision', 'view_all_entities')
     OR public.user_has_entity_assignment(_uid, _entity_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'not_authorized: entity outside your supervisory scope' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.supervisory_entity_scope_check(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_entity_scope_check(uuid, uuid) TO authenticated, service_role;

-- ---------- 1. assessment envelope ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_create(
  _entity_id uuid, _domain_code text, _assessment_type text DEFAULT 'PERIODIC',
  _period_start date DEFAULT NULL, _period_end date DEFAULT NULL,
  _methodology_id uuid DEFAULT NULL, _trigger_type text DEFAULT 'PERIODIC',
  _trigger_signal_id uuid DEFAULT NULL, _summary text DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _supersedes_id uuid DEFAULT NULL,
  _confidentiality text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _mv text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

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
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_create(uuid,text,text,date,date,uuid,text,uuid,text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_create(uuid,text,text,date,date,uuid,text,uuid,text,uuid,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_link_domain_record(
  _assessment_id uuid, _domain_table text, _record_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _entity uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','aml_supervision.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  IF _domain_table = 'prudential_assessments' THEN
    SELECT entity_id INTO _entity FROM public.prudential_assessments WHERE id = _record_id;
    IF _entity IS NULL THEN RAISE EXCEPTION 'not_found: prudential assessment' USING ERRCODE = '22023'; END IF;
    IF _entity <> _a.entity_id THEN
      RAISE EXCEPTION 'entity_mismatch: the domain record belongs to another entity' USING ERRCODE = '22023'; END IF;
    UPDATE public.prudential_assessments SET supervisory_assessment_id = _assessment_id, updated_at = now()
     WHERE id = _record_id;
  ELSIF _domain_table = 'aml_assessments' THEN
    SELECT entity_id INTO _entity FROM public.aml_assessments WHERE id = _record_id;
    IF _entity IS NULL THEN RAISE EXCEPTION 'not_found: aml assessment' USING ERRCODE = '22023'; END IF;
    IF _entity <> _a.entity_id THEN
      RAISE EXCEPTION 'entity_mismatch: the domain record belongs to another entity' USING ERRCODE = '22023'; END IF;
    UPDATE public.aml_assessments SET supervisory_assessment_id = _assessment_id, updated_at = now()
     WHERE id = _record_id;
  ELSE
    RAISE EXCEPTION 'unsupported domain extension %', _domain_table USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, 'DOMAIN_RECORD_LINKED', 'Linked ' || _domain_table,
          jsonb_build_object('domain_table',_domain_table,'record_id',_record_id), _uid);
  PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment',_assessment_id, NULL,
    jsonb_build_object('domain_table',_domain_table,'record_id',_record_id),
    'Domain assessment linked to ' || _a.reference);
  RETURN jsonb_build_object('assessment_id',_assessment_id,'domain_table',_domain_table,'record_id',_record_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_link_domain_record(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_link_domain_record(uuid,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_upsert(
  _assessment_id uuid, _dimension_code text, _dimension_group text DEFAULT 'OTHER',
  _inherent_rating text DEFAULT NULL, _control_rating text DEFAULT NULL,
  _residual_rating text DEFAULT NULL, _weight numeric DEFAULT NULL,
  _score numeric DEFAULT NULL, _rationale text DEFAULT NULL,
  _methodology_dimension_id uuid DEFAULT NULL, _evidence_refs jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','aml_supervision.approve',
    'market_conduct.run_conduct_analytics']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  INSERT INTO public.supervisory_assessment_dimension(
    assessment_id, methodology_dimension_id, dimension_code, dimension_group, weight,
    inherent_rating, control_rating, residual_rating, score, rationale, evidence_refs, created_by)
  VALUES (_assessment_id, _methodology_dimension_id, _dimension_code, COALESCE(_dimension_group,'OTHER'),
    _weight, _inherent_rating, _control_rating, _residual_rating, _score, _rationale,
    COALESCE(_evidence_refs,'[]'::jsonb), _uid)
  ON CONFLICT (assessment_id, dimension_code) DO UPDATE
    SET dimension_group = EXCLUDED.dimension_group, weight = EXCLUDED.weight,
        inherent_rating = EXCLUDED.inherent_rating, control_rating = EXCLUDED.control_rating,
        residual_rating = EXCLUDED.residual_rating, score = EXCLUDED.score,
        rationale = EXCLUDED.rationale, evidence_refs = EXCLUDED.evidence_refs, updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id',_id,'assessment_id',_assessment_id,'dimension_code',_dimension_code);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_dimension_upsert(uuid,text,text,text,text,text,numeric,numeric,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_dimension_upsert(uuid,text,text,text,text,text,numeric,numeric,text,uuid,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_transition(
  _assessment_id uuid, _to_status text, _rationale text DEFAULT NULL,
  _residual_rating text DEFAULT NULL, _next_review_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _allowed boolean; _residual text;
BEGIN
  IF _to_status IN ('approved','reviewed','returned_for_revision','closed') THEN
    _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.approve','supervisory_spine.review',
      'prudential_supervision.workflow_action','market_conduct.approve','aml_supervision.approve']);
  ELSE
    _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.submit','supervisory_spine.edit',
      'supervisory_spine.create','prudential_supervision.record_camels_assessment',
      'market_conduct.run_conduct_analytics','aml_supervision.approve']);
  END IF;

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  IF _to_status NOT IN ('submitted','reviewed','returned_for_revision','approved','closed') THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023'; END IF;
  _allowed := CASE _a.status
    WHEN 'draft' THEN _to_status = 'submitted'
    WHEN 'returned_for_revision' THEN _to_status = 'submitted'
    WHEN 'submitted' THEN _to_status IN ('reviewed','returned_for_revision','approved')
    WHEN 'reviewed' THEN _to_status IN ('approved','returned_for_revision')
    WHEN 'approved' THEN _to_status = 'closed'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _a.status, _to_status USING ERRCODE = '22023'; END IF;
  IF _to_status IN ('approved','returned_for_revision','closed')
     AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  IF _to_status = 'approved' AND NOT public.is_super_admin(_uid)
     AND (_a.created_by = _uid OR _a.submitted_by = _uid) THEN
    RAISE EXCEPTION 'not_authorized: the officer who prepared or submitted the assessment cannot approve it'
      USING ERRCODE = '42501'; END IF;

  _residual := COALESCE(_residual_rating, _a.residual_rating);

  UPDATE public.supervisory_assessment
     SET status = _to_status,
         residual_rating = _residual,
         next_review_date = COALESCE(_next_review_date, next_review_date),
         submitted_by = CASE WHEN _to_status='submitted' THEN _uid ELSE submitted_by END,
         submitted_at = CASE WHEN _to_status='submitted' THEN now() ELSE submitted_at END,
         reviewed_by = CASE WHEN _to_status IN ('reviewed','returned_for_revision') THEN _uid ELSE reviewed_by END,
         reviewed_at = CASE WHEN _to_status IN ('reviewed','returned_for_revision') THEN now() ELSE reviewed_at END,
         approved_by = CASE WHEN _to_status='approved' THEN _uid ELSE approved_by END,
         approved_at = CASE WHEN _to_status='approved' THEN now() ELSE approved_at END,
         assessment_date = CASE WHEN _to_status='approved' THEN COALESCE(assessment_date, current_date) ELSE assessment_date END,
         closed_at = CASE WHEN _to_status='closed' THEN now() ELSE closed_at END,
         updated_at = now()
   WHERE id = _assessment_id;

  IF _to_status = 'approved' THEN
    -- supersede the prior current assessment for this entity+domain
    UPDATE public.supervisory_assessment
       SET is_current = false,
           status = CASE WHEN status IN ('approved','closed') THEN 'superseded' ELSE status END,
           updated_at = now()
     WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code
       AND id <> _assessment_id AND is_current;
    UPDATE public.supervisory_assessment SET is_current = true WHERE id = _assessment_id;

    -- I-03: the approved human transition is the ONLY writer of authoritative risk state
    PERFORM set_config('app.supervisory_risk_state_writer','assessment_transition', true);
    INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating, inherent_rating,
      control_rating, driving_assessment_id, effective_from, last_review_date, next_review_date, updated_by)
    VALUES (_a.entity_id, _a.domain_code, _residual, _a.inherent_rating, _a.control_rating,
      _assessment_id, now(), current_date, COALESCE(_next_review_date, _a.next_review_date), _uid)
    ON CONFLICT (entity_id, domain_code) DO UPDATE
      SET residual_rating = EXCLUDED.residual_rating,
          inherent_rating = EXCLUDED.inherent_rating,
          control_rating = EXCLUDED.control_rating,
          driving_assessment_id = EXCLUDED.driving_assessment_id,
          effective_from = EXCLUDED.effective_from,
          last_review_date = EXCLUDED.last_review_date,
          next_review_date = EXCLUDED.next_review_date,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
    PERFORM set_config('app.supervisory_risk_state_writer','', true);
  END IF;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_assessment_id, CASE WHEN _to_status='approved' THEN 'APPROVAL' ELSE 'STATUS_CHANGE' END,
          _a.status, _to_status, btrim(COALESCE(_rationale,'')), _uid);

  PERFORM public.log_compliance_audit(
    CASE WHEN _to_status='approved' THEN 'APPROVE'
         WHEN _to_status='returned_for_revision' THEN 'REJECT'
         ELSE 'WORKFLOW_TRANSITION' END,
    'supervisory_assessment', _assessment_id,
    jsonb_build_object('status',_a.status), jsonb_build_object('status',_to_status),
    'Supervisory assessment ' || _a.reference || ': ' || _a.status || ' -> ' || _to_status);

  RETURN jsonb_build_object('id',_assessment_id,'reference',_a.reference,
    'from_status',_a.status,'to_status',_to_status);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_transition(uuid,text,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_transition(uuid,text,text,text,date) TO authenticated, service_role;

-- ---------- 2. enterprise attention ----------
CREATE OR REPLACE FUNCTION public.supervisory_attention_open(
  _title text, _domain_code text, _supervisory_basis text,
  _origin_kind text, _entity_ids uuid[] DEFAULT NULL,
  _assessment_id uuid DEFAULT NULL, _assessment_dimension_id uuid DEFAULT NULL,
  _signal_id uuid DEFAULT NULL, _complaint_id uuid DEFAULT NULL,
  _examination_id uuid DEFAULT NULL, _external_reference text DEFAULT NULL,
  _materiality text DEFAULT 'medium', _urgency text DEFAULT 'medium',
  _owner_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL,
  _target_review_date date DEFAULT NULL, _theme text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _entities uuid[]; _e uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF length(btrim(COALESCE(_supervisory_basis,''))) < 20 THEN
    RAISE EXCEPTION 'a supervisory basis of at least 20 characters is required' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023'; END IF;

  _entities := COALESCE(_entity_ids,'{}');
  IF _assessment_id IS NOT NULL AND COALESCE(array_length(_entities,1),0) = 0 THEN
    SELECT ARRAY[entity_id] INTO _entities FROM public.supervisory_assessment WHERE id = _assessment_id;
  END IF;
  IF _assessment_id IS NULL AND _assessment_dimension_id IS NULL AND _signal_id IS NULL
     AND _complaint_id IS NULL AND _examination_id IS NULL
     AND _external_reference IS NULL THEN
    RAISE EXCEPTION 'attention requires a governed origin (assessment, dimension, signal, complaint, examination or external reference)'
      USING ERRCODE = '22023'; END IF;

  FOREACH _e IN ARRAY _entities LOOP
    PERFORM public.supervisory_entity_scope_check(_uid, _e);
  END LOOP;
  IF COALESCE(array_length(_entities,1),0) > 0 THEN
    SELECT l.sector_id, s.regulator_id INTO _sector, _reg
      FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id WHERE l.id = _entities[1];
  END IF;

  _ref := 'SA-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_attention_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_attention(
    reference, regulator_id, sector_id, title, source_type, source_module, source_id,
    source_reference, supervisory_basis, entity_ids, sector_ids, theme, linked_evidence,
    materiality, urgency, breadth, owner_id, team_id, target_review_date,
    domain_code, origin_kind, created_by)
  VALUES (_ref, _reg, _sector, btrim(_title), _origin_kind, lower(_domain_code),
    COALESCE(_assessment_id,_signal_id,_complaint_id,_examination_id), _external_reference,
    btrim(_supervisory_basis), _entities,
    CASE WHEN _sector IS NULL THEN '{}'::uuid[] ELSE ARRAY[_sector] END,
    nullif(btrim(COALESCE(_theme,'')),''), '[]'::jsonb,
    COALESCE(_materiality,'medium'), COALESCE(_urgency,'medium'),
    GREATEST(COALESCE(array_length(_entities,1),0),1), COALESCE(_owner_id,_uid), _team_id,
    _target_review_date, _domain_code, _origin_kind, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_attention_origin(attention_id, origin_kind, assessment_id,
    assessment_dimension_id, signal_id, examination_id, complaint_id, external_reference, created_by)
  VALUES (_id, _origin_kind, _assessment_id, _assessment_dimension_id, _signal_id,
    _examination_id, _complaint_id, _external_reference, _uid);

  INSERT INTO public.supervisory_attention_event(attention_id, event_type, to_state, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'OPEN', btrim(_supervisory_basis),
    jsonb_build_object('domain_code',_domain_code,'origin_kind',_origin_kind,'assessment_id',_assessment_id), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_attention',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code,'origin_kind',_origin_kind),
    'Supervisory attention ' || _ref || ' opened');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','OPEN','domain_code',_domain_code);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_attention_open(text,text,text,text,uuid[],uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_attention_open(text,text,text,text,uuid[],uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,date,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_attention_confirm_priority(
  _attention_id uuid, _confirmed_priority text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_attention; _override boolean;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.review','supervisory_spine.approve',
    'prudential_supervision.workflow_action','market_conduct.run_conduct_analytics','aml_supervision.approve']);
  SELECT * INTO _row FROM public.supervisory_attention WHERE id = _attention_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: attention' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a confirmation rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  IF _confirmed_priority NOT IN ('critical','high','medium','low') THEN
    RAISE EXCEPTION 'unsupported priority %', _confirmed_priority USING ERRCODE = '22023'; END IF;

  _override := _row.calculated_priority IS NOT NULL AND _row.calculated_priority <> _confirmed_priority;

  UPDATE public.supervisory_attention
     SET confirmed_priority = _confirmed_priority, confirmed_by = _uid, confirmed_at = now(),
         confirmation_rationale = btrim(_rationale), priority_overridden = _override,
         status = CASE WHEN status = 'OPEN' THEN 'PRIORITISED' ELSE status END,
         updated_at = now()
   WHERE id = _attention_id;

  INSERT INTO public.supervisory_attention_event(attention_id, event_type, from_state, to_state, rationale, detail, actor_id)
  VALUES (_attention_id, CASE WHEN _override THEN 'PRIORITY_OVERRIDDEN' ELSE 'PRIORITY_CONFIRMED' END,
    _row.status, 'PRIORITISED', btrim(_rationale),
    jsonb_build_object('calculated',_row.calculated_priority,'confirmed',_confirmed_priority), _uid);

  PERFORM public.log_compliance_audit(CASE WHEN _override THEN 'OVERRIDE' ELSE 'UPDATE' END,
    'supervisory_attention', _attention_id,
    jsonb_build_object('calculated_priority',_row.calculated_priority),
    jsonb_build_object('confirmed_priority',_confirmed_priority),
    'Attention ' || _row.reference || ' priority confirmed as ' || _confirmed_priority);

  RETURN jsonb_build_object('id',_attention_id,'confirmed_priority',_confirmed_priority,'overridden',_override);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_attention_confirm_priority(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_attention_confirm_priority(uuid,text,text) TO authenticated, service_role;

-- ---------- 3. enterprise plan ----------
CREATE OR REPLACE FUNCTION public.supervisory_plan_open(
  _title text, _domain_code text, _factual_basis text, _objective text,
  _attention_id uuid DEFAULT NULL, _assessment_ids uuid[] DEFAULT NULL,
  _entity_ids uuid[] DEFAULT NULL, _planning_period text DEFAULT 'annual',
  _period_label text DEFAULT NULL, _lead_officer_id uuid DEFAULT NULL,
  _team_id uuid DEFAULT NULL, _start_date date DEFAULT NULL,
  _target_completion date DEFAULT NULL, _next_review_date date DEFAULT NULL,
  _priority text DEFAULT NULL, _theme text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _ref text; _att public.supervisory_attention;
        _entities uuid[]; _e uuid; _a uuid; _sector uuid; _reg uuid; _prio text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF length(btrim(COALESCE(_factual_basis,''))) < 20 THEN
    RAISE EXCEPTION 'a factual basis of at least 20 characters is required' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023'; END IF;

  _entities := COALESCE(_entity_ids,'{}');
  IF _attention_id IS NOT NULL THEN
    SELECT * INTO _att FROM public.supervisory_attention WHERE id = _attention_id;
    IF _att.id IS NULL THEN RAISE EXCEPTION 'not_found: attention' USING ERRCODE = '22023'; END IF;
    IF COALESCE(array_length(_entities,1),0) = 0 THEN _entities := _att.entity_ids; END IF;
    _prio := COALESCE(_priority, _att.confirmed_priority);
  ELSE
    _prio := _priority;
  END IF;

  FOREACH _e IN ARRAY _entities LOOP
    PERFORM public.supervisory_entity_scope_check(_uid, _e);
  END LOOP;
  IF COALESCE(array_length(_entities,1),0) > 0 THEN
    SELECT l.sector_id, s.regulator_id INTO _sector, _reg
      FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id WHERE l.id = _entities[1];
  END IF;

  _ref := 'SP-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_plan_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_plan(
    reference, regulator_id, sector_id, title, objective, objective_source, scope,
    attention_id, theme, entity_ids, sector_ids, factual_basis, priority, planning_period,
    period_label, lead_officer_id, team_id, start_date, target_completion, next_review_date,
    domain_code, created_by)
  VALUES (_ref, _reg, _sector, btrim(_title), nullif(btrim(COALESCE(_objective,'')),''), 'HUMAN',
    NULL, _attention_id, nullif(btrim(COALESCE(_theme,'')),''), _entities,
    CASE WHEN _sector IS NULL THEN '{}'::uuid[] ELSE ARRAY[_sector] END,
    btrim(_factual_basis), _prio, COALESCE(_planning_period,'annual'), _period_label,
    COALESCE(_lead_officer_id,_uid), _team_id, _start_date, _target_completion, _next_review_date,
    _domain_code, _uid)
  RETURNING id INTO _id;

  IF _assessment_ids IS NOT NULL THEN
    FOREACH _a IN ARRAY _assessment_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment WHERE id = _a) THEN
        RAISE EXCEPTION 'not_found: assessment %', _a USING ERRCODE = '22023'; END IF;
      INSERT INTO public.supervisory_plan_assessment(plan_id, assessment_id, created_by)
      VALUES (_id, _a, _uid) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.supervisory_plan_event(plan_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'DRAFT', btrim(_factual_basis),
    jsonb_build_object('domain_code',_domain_code,'attention_id',_attention_id,
      'assessment_ids', to_jsonb(COALESCE(_assessment_ids,'{}'::uuid[]))), _uid);

  IF _attention_id IS NOT NULL THEN
    UPDATE public.supervisory_attention
       SET status = CASE WHEN status IN ('OPEN','PRIORITISED') THEN 'PLANNED' ELSE status END,
           updated_at = now()
     WHERE id = _attention_id;
    INSERT INTO public.supervisory_attention_event(attention_id, event_type, rationale, detail, actor_id)
    VALUES (_attention_id, 'PLAN_LINKED', 'Supervisory plan ' || _ref || ' created',
      jsonb_build_object('plan_id',_id,'plan_reference',_ref), _uid);
  END IF;

  PERFORM public.log_compliance_audit('CREATE','supervisory_plan',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code),
    'Supervisory plan ' || _ref || ' created');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','DRAFT','domain_code',_domain_code);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_plan_open(text,text,text,text,uuid,uuid[],uuid[],text,text,uuid,uuid,date,date,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_open(text,text,text,text,uuid,uuid[],uuid[],text,text,uuid,uuid,date,date,date,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_plan_lifecycle(
  _plan_id uuid, _to_status text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_plan; _allowed boolean;
BEGIN
  IF _to_status = 'APPROVED' THEN
    _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.approve',
      'prudential_supervision.workflow_action','market_conduct.approve','aml_supervision.approve']);
  ELSE
    _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.submit','supervisory_spine.edit',
      'supervisory_spine.create','prudential_supervision.record_camels_assessment',
      'market_conduct.run_conduct_analytics','aml_supervision.approve']);
  END IF;

  SELECT * INTO _row FROM public.supervisory_plan WHERE id = _plan_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: plan' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  IF _to_status NOT IN ('SUBMITTED','APPROVED','ACTIVE','COMPLETED','CANCELLED','DRAFT') THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023'; END IF;
  _allowed := CASE _row.status
    WHEN 'DRAFT' THEN _to_status IN ('SUBMITTED','CANCELLED')
    WHEN 'SUBMITTED' THEN _to_status IN ('APPROVED','DRAFT','CANCELLED')
    WHEN 'APPROVED' THEN _to_status IN ('ACTIVE','CANCELLED')
    WHEN 'ACTIVE' THEN _to_status IN ('COMPLETED','CANCELLED')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to_status USING ERRCODE = '22023'; END IF;
  IF _to_status IN ('SUBMITTED','APPROVED','ACTIVE')
     AND COALESCE(btrim(COALESCE(_row.objective,'')),'') = '' THEN
    RAISE EXCEPTION 'objective_required: the supervisory objective must be recorded' USING ERRCODE = '22023'; END IF;
  IF _to_status = 'APPROVED' AND NOT public.is_super_admin(_uid)
     AND (_row.submitted_by = _uid OR _row.created_by = _uid) THEN
    RAISE EXCEPTION 'not_authorized: the officer who prepared or submitted the plan cannot approve it'
      USING ERRCODE = '42501'; END IF;

  UPDATE public.supervisory_plan
     SET status = _to_status,
         submitted_by = CASE WHEN _to_status='SUBMITTED' THEN _uid ELSE submitted_by END,
         submitted_at = CASE WHEN _to_status='SUBMITTED' THEN now() ELSE submitted_at END,
         approved_by = CASE WHEN _to_status='APPROVED' THEN _uid ELSE approved_by END,
         approved_at = CASE WHEN _to_status='APPROVED' THEN now() ELSE approved_at END,
         approval_rationale = CASE WHEN _to_status='APPROVED' THEN btrim(_rationale) ELSE approval_rationale END,
         activated_at = CASE WHEN _to_status='ACTIVE' THEN now() ELSE activated_at END,
         completed_at = CASE WHEN _to_status IN ('COMPLETED','CANCELLED') THEN now() ELSE completed_at END,
         outcome_summary = CASE WHEN _to_status IN ('COMPLETED','CANCELLED') THEN btrim(_rationale) ELSE outcome_summary END,
         updated_at = now()
   WHERE id = _plan_id;

  INSERT INTO public.supervisory_plan_event(plan_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_plan_id, CASE WHEN _to_status='APPROVED' THEN 'APPROVAL' ELSE 'STATUS_CHANGE' END,
    _row.status, _to_status, btrim(_rationale), _uid);

  IF _row.attention_id IS NOT NULL AND _to_status = 'ACTIVE' THEN
    UPDATE public.supervisory_attention
       SET status = CASE WHEN status IN ('OPEN','PRIORITISED','PLANNED') THEN 'IN_PROGRESS' ELSE status END,
           updated_at = now()
     WHERE id = _row.attention_id;
  END IF;

  PERFORM public.log_compliance_audit(
    CASE WHEN _to_status='APPROVED' THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END,
    'supervisory_plan', _plan_id, jsonb_build_object('status',_row.status),
    jsonb_build_object('status',_to_status),
    'Supervisory plan ' || _row.reference || ': ' || _row.status || ' -> ' || _to_status);

  RETURN jsonb_build_object('id',_plan_id,'reference',_row.reference,
    'from_status',_row.status,'to_status',_to_status);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_plan_lifecycle(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_lifecycle(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_plan_item_save(
  _plan_id uuid, _title text, _item_type text DEFAULT 'MILESTONE', _detail text DEFAULT NULL,
  _due_date date DEFAULT NULL, _owner_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL,
  _depends_on_item_id uuid DEFAULT NULL, _item_id uuid DEFAULT NULL,
  _status text DEFAULT NULL, _source text DEFAULT 'PLAN')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_plan; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  SELECT * INTO _row FROM public.supervisory_plan WHERE id = _plan_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: plan' USING ERRCODE = '22023'; END IF;
  IF _row.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'plan is closed (%)', _row.status USING ERRCODE = '55000'; END IF;

  IF _item_id IS NULL THEN
    INSERT INTO public.supervisory_plan_item(plan_id, title, detail, due_date, status,
      item_type, owner_id, team_id, depends_on_item_id, source, created_by)
    VALUES (_plan_id, btrim(_title), _detail, _due_date, COALESCE(_status,'PENDING'),
      COALESCE(_item_type,'MILESTONE'), _owner_id, _team_id, _depends_on_item_id,
      COALESCE(_source,'PLAN'), _uid)
    RETURNING id INTO _id;
  ELSE
    UPDATE public.supervisory_plan_item
       SET title = btrim(_title), detail = _detail, due_date = _due_date,
           status = COALESCE(_status, status), item_type = COALESCE(_item_type,item_type),
           owner_id = _owner_id, team_id = _team_id, depends_on_item_id = _depends_on_item_id,
           completed_at = CASE WHEN COALESCE(_status,status) = 'COMPLETED' THEN now() ELSE completed_at END,
           completed_by = CASE WHEN COALESCE(_status,status) = 'COMPLETED' THEN _uid ELSE completed_by END,
           updated_at = now()
     WHERE id = _item_id AND plan_id = _plan_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'not_found: plan item' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO public.supervisory_plan_event(plan_id, event_type, rationale, detail, actor_id)
  VALUES (_plan_id, 'PLAN_ITEM_SAVED', btrim(_title), jsonb_build_object('item_id',_id), _uid);
  RETURN jsonb_build_object('id',_id,'plan_id',_plan_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_plan_item_save(uuid,text,text,text,date,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_plan_item_save(uuid,text,text,text,date,uuid,uuid,uuid,uuid,text,text) TO authenticated, service_role;

-- ---------- 4. enterprise intervention ----------
CREATE OR REPLACE FUNCTION public.supervisory_intervention_open(
  _plan_id uuid, _intervention_type text, _title text, _basis text,
  _domain_code text DEFAULT NULL, _licensee_id uuid DEFAULT NULL,
  _attention_id uuid DEFAULT NULL, _expected_outcome text DEFAULT NULL,
  _planned_start date DEFAULT NULL, _planned_end date DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL, _catalogue_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _ref text; _plan public.supervisory_plan; _domain text;
        _entity uuid; _sector uuid; _reg uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF length(btrim(COALESCE(_basis,''))) < 20 THEN
    RAISE EXCEPTION 'a supervisory basis of at least 20 characters is required' USING ERRCODE = '22023'; END IF;
  IF _plan_id IS NULL THEN
    RAISE EXCEPTION 'an authorising supervisory plan is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _plan FROM public.supervisory_plan WHERE id = _plan_id;
  IF _plan.id IS NULL THEN RAISE EXCEPTION 'not_found: plan' USING ERRCODE = '22023'; END IF;
  IF _plan.status NOT IN ('APPROVED','ACTIVE') THEN
    RAISE EXCEPTION 'plan_not_authorised: interventions require an approved or active plan (current %)', _plan.status
      USING ERRCODE = '55000'; END IF;

  _domain := COALESCE(_domain_code, _plan.domain_code);
  IF NOT public.supervisory_domain_valid(_domain) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain USING ERRCODE = '22023'; END IF;
  _entity := COALESCE(_licensee_id, CASE WHEN COALESCE(array_length(_plan.entity_ids,1),0) > 0
                                         THEN _plan.entity_ids[1] END);
  IF _entity IS NOT NULL THEN
    PERFORM public.supervisory_entity_scope_check(_uid, _entity);
    SELECT l.sector_id, s.regulator_id INTO _sector, _reg
      FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id WHERE l.id = _entity;
  END IF;

  _ref := 'SI-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_intervention_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_intervention(
    reference, regulator_id, sector_id, licensee_id, intervention_type, title, basis,
    expected_outcome, planned_start, planned_end, owner_id, team_id, plan_id, attention_id,
    catalogue_code, domain_code, theme, proposed_by)
  VALUES (_ref, COALESCE(_reg,_plan.regulator_id), COALESCE(_sector,_plan.sector_id), _entity,
    _intervention_type, btrim(_title), btrim(_basis), _expected_outcome, _planned_start, _planned_end,
    COALESCE(_owner_id,_uid), _team_id, _plan_id, COALESCE(_attention_id,_plan.attention_id),
    _catalogue_code, _domain,
    CASE WHEN _entity IS NULL THEN COALESCE(_plan.theme, _plan.title) END, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_intervention_event(intervention_id, event_type, to_status, rationale, actor_id)
  VALUES (_id, 'PROPOSED', 'PROPOSED', btrim(_basis), _uid);

  INSERT INTO public.supervisory_plan_event(plan_id, event_type, rationale, detail, actor_id)
  VALUES (_plan_id, 'INTERVENTION_PROPOSED', btrim(_title),
    jsonb_build_object('intervention_id',_id,'reference',_ref,'type',_intervention_type), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_intervention',_id, NULL,
    jsonb_build_object('reference',_ref,'type',_intervention_type,'plan_id',_plan_id),
    'Supervisory intervention ' || _ref || ' proposed');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','PROPOSED','plan_id',_plan_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_intervention_open(uuid,text,text,text,text,uuid,uuid,text,date,date,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_open(uuid,text,text,text,text,uuid,uuid,text,date,date,uuid,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_intervention_decide(
  _intervention_id uuid, _decision text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_intervention; _to text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.approve','supervisory_spine.workflow_action',
    'prudential_supervision.workflow_action','market_conduct.approve','aml_supervision.approve']);
  SELECT * INTO _row FROM public.supervisory_intervention WHERE id = _intervention_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: intervention' USING ERRCODE = '22023'; END IF;
  IF _decision NOT IN ('ENDORSED','REJECTED','ACTIVE','COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'unsupported decision %', _decision USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  IF _decision IN ('ENDORSED','REJECTED') AND _row.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _decision USING ERRCODE = '22023'; END IF;
  IF _decision IN ('ENDORSED','REJECTED') AND NOT public.is_super_admin(_uid)
     AND _row.proposed_by = _uid THEN
    RAISE EXCEPTION 'not_authorized: the proposing officer cannot decide their own intervention'
      USING ERRCODE = '42501'; END IF;
  _to := _decision;

  UPDATE public.supervisory_intervention
     SET status = _to,
         decided_by = CASE WHEN _to IN ('ENDORSED','REJECTED') THEN _uid ELSE decided_by END,
         decided_at = CASE WHEN _to IN ('ENDORSED','REJECTED') THEN now() ELSE decided_at END,
         decision_rationale = CASE WHEN _to IN ('ENDORSED','REJECTED') THEN btrim(_rationale) ELSE decision_rationale END,
         activated_at = CASE WHEN _to='ACTIVE' THEN now() ELSE activated_at END,
         completed_at = CASE WHEN _to IN ('COMPLETED','CANCELLED') THEN now() ELSE completed_at END,
         outcome_note = CASE WHEN _to IN ('COMPLETED','CANCELLED') THEN btrim(_rationale) ELSE outcome_note END,
         updated_at = now()
   WHERE id = _intervention_id;

  INSERT INTO public.supervisory_intervention_event(intervention_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_intervention_id, 'DECISION', _row.status, _to, btrim(_rationale), _uid);

  PERFORM public.log_compliance_audit(
    CASE WHEN _to='ENDORSED' THEN 'APPROVE' WHEN _to='REJECTED' THEN 'REJECT' ELSE 'WORKFLOW_TRANSITION' END,
    'supervisory_intervention', _intervention_id, jsonb_build_object('status',_row.status),
    jsonb_build_object('status',_to),
    'Supervisory intervention ' || _row.reference || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id',_intervention_id,'from_status',_row.status,'to_status',_to);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_intervention_decide(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_decide(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_intervention_link_activity(
  _intervention_id uuid, _activity_kind text, _activity_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_intervention; _ref text; _route text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.workflow_action',
    'prudential_supervision.manage_examination','market_conduct.run_conduct_analytics','aml_supervision.approve']);
  SELECT * INTO _row FROM public.supervisory_intervention WHERE id = _intervention_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: intervention' USING ERRCODE = '22023'; END IF;
  IF _row.status NOT IN ('ENDORSED','ACTIVE') THEN
    RAISE EXCEPTION 'intervention must be endorsed before a canonical activity is linked (current %)', _row.status
      USING ERRCODE = '55000'; END IF;

  IF _activity_kind = 'examination' THEN
    SELECT reference INTO _ref FROM public.examinations WHERE id = _activity_id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'not_found: examination %', _activity_id USING ERRCODE = '22023'; END IF;
    _route := '/prudential/examinations/' || _activity_id::text;
    UPDATE public.supervisory_intervention
       SET examination_id = _activity_id, thematic_review_id = NULL, investigation_id = NULL,
           canonical_module = 'examinations', canonical_record_id = _activity_id,
           canonical_reference = _ref, canonical_route = _route, updated_at = now()
     WHERE id = _intervention_id;
    UPDATE public.examinations
       SET intervention_id = _intervention_id, plan_id = COALESCE(plan_id, _row.plan_id),
           origin_provenance = 'GOVERNED', updated_at = now()
     WHERE id = _activity_id;
  ELSIF _activity_kind = 'thematic_review' THEN
    SELECT COALESCE(code, title) INTO _ref FROM public.thematic_reviews WHERE id = _activity_id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'not_found: thematic review %', _activity_id USING ERRCODE = '22023'; END IF;
    _route := '/supervision/thematic-reviews/' || _activity_id::text;
    UPDATE public.supervisory_intervention
       SET thematic_review_id = _activity_id, examination_id = NULL, investigation_id = NULL,
           canonical_module = 'thematic_reviews', canonical_record_id = _activity_id,
           canonical_reference = _ref, canonical_route = _route, updated_at = now()
     WHERE id = _intervention_id;
  ELSIF _activity_kind = 'investigation' THEN
    SELECT COALESCE(code, id::text) INTO _ref FROM public.conduct_investigations WHERE id = _activity_id;
    IF _ref IS NULL THEN RAISE EXCEPTION 'not_found: investigation %', _activity_id USING ERRCODE = '22023'; END IF;
    _route := '/conduct/investigations/' || _activity_id::text;
    UPDATE public.supervisory_intervention
       SET investigation_id = _activity_id, examination_id = NULL, thematic_review_id = NULL,
           canonical_module = 'conduct_investigations', canonical_record_id = _activity_id,
           canonical_reference = _ref, canonical_route = _route, updated_at = now()
     WHERE id = _intervention_id;
  ELSE
    RAISE EXCEPTION 'unsupported canonical activity kind %', _activity_kind USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_intervention_event(intervention_id, event_type, rationale, actor_id)
  VALUES (_intervention_id, 'CANONICAL_ACTIVITY_LINKED',
    'Linked ' || _activity_kind || ' ' || _ref, _uid);
  PERFORM public.log_compliance_audit('UPDATE','supervisory_intervention',_intervention_id, NULL,
    jsonb_build_object('activity_kind',_activity_kind,'activity_id',_activity_id),
    'Intervention ' || _row.reference || ' linked to ' || _activity_kind || ' ' || _ref);

  RETURN jsonb_build_object('id',_intervention_id,'activity_kind',_activity_kind,
    'activity_id',_activity_id,'activity_reference',_ref);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_intervention_link_activity(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_link_activity(uuid,text,uuid) TO authenticated, service_role;

-- ---------- 5. canonical examination from the spine ----------
CREATE OR REPLACE FUNCTION public.supervisory_examination_open(
  _intervention_id uuid, _title text, _engagement_type text,
  _domain_code text DEFAULT NULL, _entity_id uuid DEFAULT NULL,
  _origin_assessment_ids uuid[] DEFAULT NULL, _risk_focus_dimension_ids uuid[] DEFAULT NULL,
  _period_start date DEFAULT NULL, _period_end date DEFAULT NULL,
  _lead_examiner_id uuid DEFAULT NULL, _methodology_id uuid DEFAULT NULL,
  _trigger_type text DEFAULT 'PLANNED_SUPERVISION')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _iv public.supervisory_intervention; _entity uuid; _domain text;
        _id uuid; _ref text; _a uuid; _d uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create',
    'prudential_supervision.manage_examination','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  SELECT * INTO _iv FROM public.supervisory_intervention WHERE id = _intervention_id;
  IF _iv.id IS NULL THEN RAISE EXCEPTION 'not_found: intervention' USING ERRCODE = '22023'; END IF;
  IF _iv.status NOT IN ('ENDORSED','ACTIVE') THEN
    RAISE EXCEPTION 'intervention must be endorsed before an examination is opened (current %)', _iv.status
      USING ERRCODE = '55000'; END IF;
  IF _engagement_type IS NULL THEN
    RAISE EXCEPTION 'an engagement type is required' USING ERRCODE = '22023'; END IF;

  _entity := COALESCE(_entity_id, _iv.licensee_id);
  IF _entity IS NULL THEN RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity);
  _domain := COALESCE(_domain_code, _iv.domain_code);

  INSERT INTO public.examinations(entity_id, regulator_id, sector_id, title, examination_type,
    engagement_type, stage, period_under_review_start, period_under_review_end, lead_examiner_id,
    domain_code, intervention_id, plan_id, methodology_id, trigger_type, origin_provenance, created_by)
  VALUES (_entity, _iv.regulator_id, _iv.sector_id, btrim(_title), _engagement_type,
    _engagement_type, 'planned', _period_start, _period_end, COALESCE(_lead_examiner_id,_uid),
    _domain, _intervention_id, _iv.plan_id, _methodology_id, _trigger_type, 'GOVERNED', _uid)
  RETURNING id, reference INTO _id, _ref;

  IF _origin_assessment_ids IS NOT NULL THEN
    FOREACH _a IN ARRAY _origin_assessment_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment WHERE id = _a) THEN
        RAISE EXCEPTION 'not_found: originating assessment %', _a USING ERRCODE = '22023'; END IF;
      INSERT INTO public.examination_origin(examination_id, assessment_id, origin_role, created_by)
      VALUES (_id, _a, 'DRIVING_ASSESSMENT', _uid) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  IF _risk_focus_dimension_ids IS NOT NULL THEN
    FOREACH _d IN ARRAY _risk_focus_dimension_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension WHERE id = _d) THEN
        RAISE EXCEPTION 'not_found: assessment dimension %', _d USING ERRCODE = '22023'; END IF;
      INSERT INTO public.examination_origin(examination_id, assessment_dimension_id, origin_role, created_by)
      VALUES (_id, _d, 'RISK_FOCUS', _uid);
    END LOOP;
  END IF;
  IF _iv.attention_id IS NOT NULL THEN
    INSERT INTO public.examination_origin(examination_id, attention_id, origin_role, created_by)
    VALUES (_id, _iv.attention_id, 'ATTENTION', _uid);
  END IF;

  PERFORM public.supervisory_intervention_link_activity(_intervention_id, 'examination', _id);

  PERFORM public.log_compliance_audit('CREATE','examination',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain,'engagement_type',_engagement_type,
      'intervention_id',_intervention_id),
    'Examination ' || COALESCE(_ref,_id::text) || ' opened from intervention ' || _iv.reference);

  RETURN jsonb_build_object('id',_id,'reference',_ref,'domain_code',_domain,
    'engagement_type',_engagement_type,'intervention_id',_intervention_id,'plan_id',_iv.plan_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_examination_open(uuid,text,text,text,uuid,uuid[],uuid[],date,date,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_examination_open(uuid,text,text,text,uuid,uuid[],uuid[],date,date,uuid,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.examination_link_origin(
  _examination_id uuid, _assessment_id uuid DEFAULT NULL, _assessment_dimension_id uuid DEFAULT NULL,
  _signal_id uuid DEFAULT NULL, _origin_role text DEFAULT 'DRIVING_ASSESSMENT', _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _ex_entity uuid; _as_entity uuid; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit',
    'prudential_supervision.manage_examination','market_conduct.run_conduct_analytics','aml_supervision.approve']);
  SELECT entity_id INTO _ex_entity FROM public.examinations WHERE id = _examination_id;
  IF _ex_entity IS NULL THEN RAISE EXCEPTION 'not_found: examination' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _ex_entity);

  IF _assessment_id IS NOT NULL THEN
    SELECT entity_id INTO _as_entity FROM public.supervisory_assessment WHERE id = _assessment_id;
    IF _as_entity IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
    IF _as_entity <> _ex_entity THEN
      RAISE EXCEPTION 'entity_mismatch: the assessment belongs to another entity' USING ERRCODE = '22023'; END IF;
  END IF;
  IF _assessment_dimension_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension WHERE id = _assessment_dimension_id) THEN
    RAISE EXCEPTION 'not_found: assessment dimension' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.examination_origin(examination_id, assessment_id, assessment_dimension_id,
    signal_id, origin_role, note, created_by)
  VALUES (_examination_id, _assessment_id, _assessment_dimension_id, _signal_id,
    COALESCE(_origin_role,'DRIVING_ASSESSMENT'), _note, _uid)
  RETURNING id INTO _id;

  UPDATE public.examinations SET origin_provenance = 'GOVERNED', updated_at = now()
   WHERE id = _examination_id AND origin_provenance = 'LEGACY_UNKNOWN';

  PERFORM public.log_compliance_audit('UPDATE','examination',_examination_id, NULL,
    jsonb_build_object('assessment_id',_assessment_id,'dimension_id',_assessment_dimension_id,
      'origin_role',_origin_role), 'Examination provenance recorded');
  RETURN jsonb_build_object('id',_id,'examination_id',_examination_id);
END $$;
REVOKE ALL ON FUNCTION public.examination_link_origin(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_link_origin(uuid,uuid,uuid,uuid,text,text) TO authenticated, service_role;

-- ---------- 6. legacy inspection creation is retired ----------
CREATE OR REPLACE FUNCTION public.inspection_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'legacy_path_retired: inspections are superseded by the canonical examination engine. Open an examination from an endorsed supervisory intervention (supervisory_examination_open).'
    USING ERRCODE = '42501';
END $$;

-- ---------- 7. canonical traceability read model ----------
CREATE OR REPLACE FUNCTION public.supervisory_trace(_scope text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF _scope NOT IN ('assessment','attention','plan','intervention','examination','entity') THEN
    RAISE EXCEPTION 'unsupported trace scope %', _scope USING ERRCODE = '22023';
  END IF;

  IF _scope = 'assessment' THEN
    SELECT jsonb_build_object(
      'scope','assessment',
      'assessment', to_jsonb(a) - 'confidential_notes',
      'dimensions', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.dimension_code)
                                FROM public.supervisory_assessment_dimension d WHERE d.assessment_id = a.id),'[]'::jsonb),
      'attention', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',at.id,'reference',at.reference,
                                'status',at.status,'confirmed_priority',at.confirmed_priority))
                               FROM public.supervisory_attention_origin o
                               JOIN public.supervisory_attention at ON at.id = o.attention_id
                              WHERE o.assessment_id = a.id),'[]'::jsonb),
      'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'reference',p.reference,'status',p.status))
                           FROM public.supervisory_plan_assessment pa
                           JOIN public.supervisory_plan p ON p.id = pa.plan_id
                          WHERE pa.assessment_id = a.id),'[]'::jsonb),
      'examinations', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',e.id,'reference',e.reference,
                                  'stage',e.stage,'engagement_type',e.engagement_type,'domain_code',e.domain_code))
                                 FROM public.examination_origin eo
                                 JOIN public.examinations e ON e.id = eo.examination_id
                                WHERE eo.assessment_id = a.id),'[]'::jsonb),
      'risk_state', (SELECT to_jsonb(rs) FROM public.entity_risk_state rs
                      WHERE rs.entity_id = a.entity_id AND rs.domain_code = a.domain_code)
    ) INTO _out FROM public.supervisory_assessment a WHERE a.id = _id;

  ELSIF _scope = 'examination' THEN
    SELECT jsonb_build_object(
      'scope','examination',
      'examination', jsonb_build_object('id',e.id,'reference',e.reference,'entity_id',e.entity_id,
        'domain_code',e.domain_code,'engagement_type',e.engagement_type,'stage',e.stage,
        'origin_provenance',e.origin_provenance,'intervention_id',e.intervention_id,'plan_id',e.plan_id),
      'origins', COALESCE((SELECT jsonb_agg(jsonb_build_object('origin_role',o.origin_role,
                              'assessment_id',o.assessment_id,'assessment_reference',sa.reference,
                              'assessment_domain',sa.domain_code,
                              'assessment_dimension_id',o.assessment_dimension_id,
                              'attention_id',o.attention_id,'signal_id',o.signal_id))
                             FROM public.examination_origin o
                             LEFT JOIN public.supervisory_assessment sa ON sa.id = o.assessment_id
                            WHERE o.examination_id = e.id),'[]'::jsonb),
      'intervention', (SELECT jsonb_build_object('id',i.id,'reference',i.reference,'type',i.intervention_type,
                          'status',i.status,'plan_id',i.plan_id,'attention_id',i.attention_id)
                         FROM public.supervisory_intervention i WHERE i.id = e.intervention_id),
      'plan', (SELECT jsonb_build_object('id',p.id,'reference',p.reference,'status',p.status,
                  'domain_code',p.domain_code,'attention_id',p.attention_id)
                 FROM public.supervisory_plan p WHERE p.id = e.plan_id)
    ) INTO _out FROM public.examinations e WHERE e.id = _id;

  ELSIF _scope = 'plan' THEN
    SELECT jsonb_build_object(
      'scope','plan',
      'plan', jsonb_build_object('id',p.id,'reference',p.reference,'status',p.status,
        'domain_code',p.domain_code,'entity_ids',p.entity_ids,'attention_id',p.attention_id),
      'assessments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sa.id,'reference',sa.reference,
                                  'domain_code',sa.domain_code,'status',sa.status))
                                 FROM public.supervisory_plan_assessment pa
                                 JOIN public.supervisory_assessment sa ON sa.id = pa.assessment_id
                                WHERE pa.plan_id = p.id),'[]'::jsonb),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',it.id,'title',it.title,'status',it.status,
                            'item_type',it.item_type,'due_date',it.due_date))
                           FROM public.supervisory_plan_item it WHERE it.plan_id = p.id),'[]'::jsonb),
      'interventions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'reference',i.reference,
                                    'type',i.intervention_type,'status',i.status,
                                    'examination_id',i.examination_id,'thematic_review_id',i.thematic_review_id,
                                    'investigation_id',i.investigation_id))
                                   FROM public.supervisory_intervention i WHERE i.plan_id = p.id),'[]'::jsonb)
    ) INTO _out FROM public.supervisory_plan p WHERE p.id = _id;

  ELSIF _scope = 'attention' THEN
    SELECT jsonb_build_object(
      'scope','attention',
      'attention', jsonb_build_object('id',at.id,'reference',at.reference,'status',at.status,
        'domain_code',at.domain_code,'origin_kind',at.origin_kind,'calculated_priority',at.calculated_priority,
        'confirmed_priority',at.confirmed_priority,'priority_overridden',at.priority_overridden),
      'origins', COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.supervisory_attention_origin o
                            WHERE o.attention_id = at.id),'[]'::jsonb),
      'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'reference',p.reference,'status',p.status))
                           FROM public.supervisory_plan p WHERE p.attention_id = at.id),'[]'::jsonb),
      'interventions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'reference',i.reference,
                                    'status',i.status,'examination_id',i.examination_id))
                                   FROM public.supervisory_intervention i WHERE i.attention_id = at.id),'[]'::jsonb)
    ) INTO _out FROM public.supervisory_attention at WHERE at.id = _id;

  ELSIF _scope = 'intervention' THEN
    SELECT jsonb_build_object('scope','intervention',
      'intervention', jsonb_build_object('id',i.id,'reference',i.reference,'status',i.status,
        'type',i.intervention_type,'domain_code',i.domain_code,'plan_id',i.plan_id,
        'attention_id',i.attention_id,'examination_id',i.examination_id,
        'thematic_review_id',i.thematic_review_id,'investigation_id',i.investigation_id,
        'canonical_reference',i.canonical_reference)
    ) INTO _out FROM public.supervisory_intervention i WHERE i.id = _id;

  ELSE -- entity
    SELECT jsonb_build_object(
      'scope','entity','entity_id',l.id,'entity_name',l.company_name,
      'risk_state', COALESCE((SELECT jsonb_agg(jsonb_build_object('domain_code',rs.domain_code,
                                'residual_rating',rs.residual_rating,'driving_assessment_id',rs.driving_assessment_id,
                                'next_review_date',rs.next_review_date))
                               FROM public.entity_risk_state rs WHERE rs.entity_id = l.id),'[]'::jsonb),
      'assessments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'reference',a.reference,
                                  'domain_code',a.domain_code,'status',a.status,'is_current',a.is_current))
                                 FROM public.supervisory_assessment a WHERE a.entity_id = l.id),'[]'::jsonb),
      'attention', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',at.id,'reference',at.reference,
                                'status',at.status,'domain_code',at.domain_code))
                               FROM public.supervisory_attention at WHERE l.id = ANY(at.entity_ids)),'[]'::jsonb),
      'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'reference',p.reference,
                            'status',p.status,'domain_code',p.domain_code))
                           FROM public.supervisory_plan p WHERE l.id = ANY(p.entity_ids)),'[]'::jsonb),
      'interventions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'reference',i.reference,
                                    'status',i.status,'examination_id',i.examination_id))
                                   FROM public.supervisory_intervention i WHERE i.licensee_id = l.id),'[]'::jsonb),
      'examinations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'reference',e.reference,
                                  'stage',e.stage,'domain_code',e.domain_code,
                                  'origin_provenance',e.origin_provenance))
                                 FROM public.examinations e WHERE e.entity_id = l.id),'[]'::jsonb)
    ) INTO _out FROM public.licensees l WHERE l.id = _id;
  END IF;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'not_found: % %', _scope, _id USING ERRCODE = '22023';
  END IF;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_trace(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_trace(text,uuid) TO authenticated, service_role;