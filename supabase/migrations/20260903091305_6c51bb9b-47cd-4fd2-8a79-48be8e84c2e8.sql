-- ============================================================
-- W4-A4 — examination execution (RFI → evidence → workpaper → review → finding)
-- Additive on the canonical examination objects. No domain-specific tables.
-- ============================================================

ALTER TABLE public.examination_data_requests
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS requested_from text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS outstanding_items text,
  ADD COLUMN IF NOT EXISTS assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id);

ALTER TABLE public.examination_workpapers
  ADD COLUMN IF NOT EXISTS assessment_id uuid REFERENCES public.supervisory_assessment(id),
  ADD COLUMN IF NOT EXISTS assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id),
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS population_description text,
  ADD COLUMN IF NOT EXISTS population_size numeric,
  ADD COLUMN IF NOT EXISTS sampling_method text,
  ADD COLUMN IF NOT EXISTS sample_size numeric,
  ADD COLUMN IF NOT EXISTS exceptions_count integer,
  ADD COLUMN IF NOT EXISTS material_exceptions_count integer,
  ADD COLUMN IF NOT EXISTS analysis text,
  ADD COLUMN IF NOT EXISTS control_assessment text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by uuid;

-- ------------------------------------------------------------
-- Domain-aware examination execution authority
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.examination_execution_require(_examination_id uuid, _action text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _e public.examinations; _perms text[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO _e FROM public.examinations WHERE id = _examination_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'not_found: examination' USING ERRCODE='22023'; END IF;

  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;

  -- domain-specific examination authority; never a generic widening
  _perms := CASE upper(COALESCE(_e.domain_code,'PRUDENTIAL'))
    WHEN 'AML_CFT' THEN ARRAY['aml_supervision.examine','aml_supervision.finding_manage']
    WHEN 'AML'     THEN ARRAY['aml_supervision.examine','aml_supervision.finding_manage']
    WHEN 'CONDUCT' THEN ARRAY['market_conduct.approve','market_conduct.edit']
    WHEN 'MARKET_CONDUCT' THEN ARRAY['market_conduct.approve','market_conduct.edit']
    ELSE ARRAY['prudential_supervision.manage_examination','prudential_supervision.edit']
  END;
  _perms := _perms || ARRAY['supervisory_spine.edit'];

  IF NOT (public.examination_action_allowed(_uid, _examination_id, _action, false)
          OR public.has_any_permission(_uid, _perms)) THEN
    RAISE EXCEPTION 'not_authorized: examination % authority required for this domain', _action
      USING ERRCODE='42501';
  END IF;

  PERFORM public.supervisory_entity_scope_check(_uid, _e.entity_id);
  RETURN _uid;
END $$;

REVOKE ALL ON FUNCTION public.examination_execution_require(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_execution_require(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Information requests
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.examination_data_request_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _exam uuid; _id uuid; _dim uuid; _no int; _ref text; _e public.examinations;
BEGIN
  _id   := NULLIF(_payload->>'id','')::uuid;
  _exam := NULLIF(_payload->>'examination_id','')::uuid;
  IF _id IS NOT NULL THEN
    SELECT examination_id INTO _exam FROM public.examination_data_requests WHERE id = _id;
    IF _exam IS NULL THEN RAISE EXCEPTION 'not_found: information request' USING ERRCODE='22023'; END IF;
  END IF;
  IF _exam IS NULL THEN RAISE EXCEPTION 'examination_id required' USING ERRCODE='22023'; END IF;

  _uid := public.examination_execution_require(_exam, 'edit');
  SELECT * INTO _e FROM public.examinations WHERE id = _exam;

  _dim := NULLIF(_payload->>'assessment_dimension_id','')::uuid;
  IF _dim IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.examination_scope_dimension
     WHERE examination_id = _exam AND assessment_dimension_id = _dim) THEN
    RAISE EXCEPTION 'scope_dimension_not_in_examination' USING ERRCODE='22023';
  END IF;

  IF _id IS NULL THEN
    SELECT COALESCE(MAX(item_no),0)+1 INTO _no FROM public.examination_data_requests WHERE examination_id = _exam;
    _ref := COALESCE(_e.reference,'EXM') || '-RFI-' || lpad(_no::text,3,'0');
    INSERT INTO public.examination_data_requests(
      examination_id, item_no, reference, title, description, data_format, due_date,
      requested_from, priority, assessment_dimension_id, status, requested_by)
    VALUES (_exam, _no, _ref,
      COALESCE(NULLIF(btrim(_payload->>'title'),''), 'Untitled request'),
      _payload->>'description', _payload->>'data_format',
      NULLIF(_payload->>'due_date','')::date,
      _payload->>'requested_from',
      COALESCE(upper(NULLIF(_payload->>'priority','')),'NORMAL'),
      _dim, 'draft', _uid)
    RETURNING id INTO _id;
  ELSE
    UPDATE public.examination_data_requests SET
      title = COALESCE(NULLIF(btrim(_payload->>'title'),''), title),
      description = COALESCE(_payload->>'description', description),
      data_format = COALESCE(_payload->>'data_format', data_format),
      due_date = COALESCE(NULLIF(_payload->>'due_date','')::date, due_date),
      requested_from = COALESCE(_payload->>'requested_from', requested_from),
      priority = COALESCE(upper(NULLIF(_payload->>'priority','')), priority),
      assessment_dimension_id = COALESCE(_dim, assessment_dimension_id),
      outstanding_items = COALESCE(_payload->>'outstanding_items', outstanding_items),
      updated_at = now()
    WHERE id = _id;
  END IF;

  PERFORM public.log_compliance_audit(CASE WHEN _payload ? 'id' THEN 'UPDATE' ELSE 'CREATE' END,
    'examination_data_requests', _id, NULL,
    jsonb_build_object('examination_id', _exam), 'Examination information request saved');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.examination_data_request_issue(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _r public.examination_data_requests;
BEGIN
  SELECT * INTO _r FROM public.examination_data_requests WHERE id = _request_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: information request' USING ERRCODE='22023'; END IF;
  _uid := public.examination_execution_require(_r.examination_id, 'workflow_action');
  IF _r.status <> 'draft' THEN RAISE EXCEPTION 'request_already_issued' USING ERRCODE='22023'; END IF;

  UPDATE public.examination_data_requests
     SET status='issued', issued_at=now(), updated_at=now() WHERE id=_request_id;
  INSERT INTO public.examination_events(examination_id, event_type, actor_id, notes, metadata)
  VALUES (_r.examination_id,'data_request_issued',_uid,_r.title,
          jsonb_build_object('request_id',_request_id,'reference',_r.reference));
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.examination_data_request_receive(
  _request_id uuid, _entity_response text DEFAULT NULL,
  _outstanding_items text DEFAULT NULL, _fully_received boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _r public.examination_data_requests; _status text;
BEGIN
  SELECT * INTO _r FROM public.examination_data_requests WHERE id = _request_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: information request' USING ERRCODE='22023'; END IF;
  _uid := public.examination_execution_require(_r.examination_id, 'edit');
  IF _r.status = 'draft' THEN RAISE EXCEPTION 'request_not_issued' USING ERRCODE='22023'; END IF;

  _status := CASE WHEN _fully_received THEN 'received' ELSE 'partially_received' END;
  UPDATE public.examination_data_requests SET
    status = _status,
    received_at = COALESCE(received_at, now()),
    entity_response = COALESCE(NULLIF(btrim(_entity_response),''), entity_response),
    outstanding_items = CASE WHEN _fully_received THEN NULL
                             ELSE COALESCE(NULLIF(btrim(_outstanding_items),''), outstanding_items) END,
    updated_at = now()
  WHERE id = _request_id;

  INSERT INTO public.examination_events(examination_id, event_type, actor_id, notes, metadata)
  VALUES (_r.examination_id,'data_request_response_recorded',_uid,_r.title,
          jsonb_build_object('request_id',_request_id,'reference',_r.reference,'status',_status));
  RETURN jsonb_build_object('ok',true,'status',_status);
END $$;

REVOKE ALL ON FUNCTION public.examination_data_request_save(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.examination_data_request_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.examination_data_request_receive(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_data_request_save(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.examination_data_request_issue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.examination_data_request_receive(uuid, text, text, boolean) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Workpapers — creation keeps the exact scope dimension identity
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.examination_workpaper_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _exam uuid; _id uuid; _dim uuid; _assess uuid; _n int; _ref text;
        _e public.examinations; _scope public.examination_scope_dimension;
BEGIN
  _id   := NULLIF(_payload->>'id','')::uuid;
  _exam := NULLIF(_payload->>'examination_id','')::uuid;
  IF _id IS NOT NULL THEN
    SELECT examination_id INTO _exam FROM public.examination_workpapers WHERE id = _id;
    IF _exam IS NULL THEN RAISE EXCEPTION 'not_found: workpaper' USING ERRCODE='22023'; END IF;
  END IF;
  IF _exam IS NULL THEN RAISE EXCEPTION 'examination_id required' USING ERRCODE='22023'; END IF;

  _uid := public.examination_execution_require(_exam, 'edit');
  SELECT * INTO _e FROM public.examinations WHERE id = _exam;

  _dim := NULLIF(_payload->>'assessment_dimension_id','')::uuid;
  IF _dim IS NOT NULL THEN
    SELECT * INTO _scope FROM public.examination_scope_dimension
     WHERE examination_id = _exam AND assessment_dimension_id = _dim;
    IF _scope.id IS NULL THEN
      SELECT sd.* INTO _scope FROM public.examination_scope_dimension sd WHERE false;
      IF NOT EXISTS (SELECT 1 FROM public.examination_origin
                      WHERE examination_id = _exam AND assessment_dimension_id = _dim) THEN
        RAISE EXCEPTION 'scope_dimension_not_in_examination' USING ERRCODE='22023';
      END IF;
    END IF;
    SELECT sad.assessment_id INTO _assess
      FROM public.supervisory_assessment_dimension sad WHERE sad.id = _dim;
    IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a
                    WHERE a.id = _assess AND a.entity_id = _e.entity_id) THEN
      RAISE EXCEPTION 'scope_entity_mismatch' USING ERRCODE='22023';
    END IF;
  END IF;

  IF _id IS NULL THEN
    SELECT COALESCE(count(*),0)+1 INTO _n FROM public.examination_workpapers WHERE examination_id = _exam;
    _ref := COALESCE(_e.reference,'EXM') || '-WP-' || lpad(_n::text,3,'0');
    INSERT INTO public.examination_workpapers(
      examination_id, reference, area, objective, procedure_performed,
      population_description, population_size, sampling_method, sample_size,
      evidence_reference, exceptions_count, material_exceptions_count, analysis,
      conclusion, control_assessment, assessment_id, assessment_dimension_id, status)
    VALUES (_exam, _ref,
      COALESCE(NULLIF(btrim(_payload->>'area'),''),'Unspecified area'),
      _payload->>'objective', _payload->>'procedure_performed',
      _payload->>'population_description', NULLIF(_payload->>'population_size','')::numeric,
      _payload->>'sampling_method', NULLIF(_payload->>'sample_size','')::numeric,
      _payload->>'evidence_reference',
      NULLIF(_payload->>'exceptions_count','')::int,
      NULLIF(_payload->>'material_exceptions_count','')::int,
      _payload->>'analysis', _payload->>'conclusion',
      NULLIF(upper(_payload->>'control_assessment'),''),
      _assess, _dim, 'draft')
    RETURNING id INTO _id;
  ELSE
    UPDATE public.examination_workpapers SET
      area = COALESCE(NULLIF(btrim(_payload->>'area'),''), area),
      objective = COALESCE(_payload->>'objective', objective),
      procedure_performed = COALESCE(_payload->>'procedure_performed', procedure_performed),
      population_description = COALESCE(_payload->>'population_description', population_description),
      population_size = COALESCE(NULLIF(_payload->>'population_size','')::numeric, population_size),
      sampling_method = COALESCE(_payload->>'sampling_method', sampling_method),
      sample_size = COALESCE(NULLIF(_payload->>'sample_size','')::numeric, sample_size),
      evidence_reference = COALESCE(_payload->>'evidence_reference', evidence_reference),
      exceptions_count = COALESCE(NULLIF(_payload->>'exceptions_count','')::int, exceptions_count),
      material_exceptions_count = COALESCE(NULLIF(_payload->>'material_exceptions_count','')::int, material_exceptions_count),
      analysis = COALESCE(_payload->>'analysis', analysis),
      conclusion = COALESCE(_payload->>'conclusion', conclusion),
      control_assessment = COALESCE(NULLIF(upper(_payload->>'control_assessment'),''), control_assessment),
      assessment_dimension_id = COALESCE(_dim, assessment_dimension_id),
      assessment_id = COALESCE(_assess, assessment_id),
      updated_at = now()
    WHERE id = _id
      AND status <> 'reviewed';
    IF NOT FOUND THEN RAISE EXCEPTION 'workpaper_locked_after_review' USING ERRCODE='42501'; END IF;
  END IF;

  PERFORM public.log_compliance_audit(CASE WHEN _payload ? 'id' THEN 'UPDATE' ELSE 'CREATE' END,
    'examination_workpapers', _id, NULL,
    jsonb_build_object('examination_id',_exam,'assessment_dimension_id',_dim),
    'Examination workpaper saved');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.examination_workpaper_submit_review(_workpaper_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _w public.examination_workpapers;
BEGIN
  SELECT * INTO _w FROM public.examination_workpapers WHERE id = _workpaper_id;
  IF _w.id IS NULL THEN RAISE EXCEPTION 'not_found: workpaper' USING ERRCODE='22023'; END IF;
  _uid := public.examination_execution_require(_w.examination_id, 'edit');
  IF _w.status = 'reviewed' THEN RAISE EXCEPTION 'workpaper_already_reviewed' USING ERRCODE='22023'; END IF;
  IF COALESCE(btrim(_w.conclusion),'') = '' THEN
    RAISE EXCEPTION 'workpaper_conclusion_required' USING ERRCODE='22023'; END IF;

  UPDATE public.examination_workpapers
     SET prepared_by = COALESCE(prepared_by, _uid), prepared_at = COALESCE(prepared_at, now()),
         submitted_by = _uid, submitted_at = now(), status = 'in_review',
         returned_at = NULL, returned_by = NULL, updated_at = now()
   WHERE id = _workpaper_id;

  INSERT INTO public.examination_events(examination_id, event_type, actor_id, notes, metadata)
  VALUES (_w.examination_id,'workpaper_submitted_for_review',_uid,_w.area,
          jsonb_build_object('workpaper_id',_workpaper_id,'reference',_w.reference));
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.examination_workpaper_return(_workpaper_id uuid, _notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _w public.examination_workpapers;
BEGIN
  SELECT * INTO _w FROM public.examination_workpapers WHERE id = _workpaper_id;
  IF _w.id IS NULL THEN RAISE EXCEPTION 'not_found: workpaper' USING ERRCODE='22023'; END IF;
  _uid := public.examination_execution_require(_w.examination_id, 'workflow_action');
  IF _w.status <> 'in_review' THEN RAISE EXCEPTION 'workpaper_not_in_review' USING ERRCODE='22023'; END IF;
  IF _w.prepared_by = _uid THEN
    RAISE EXCEPTION 'workpaper_reviewer_must_differ_from_preparer' USING ERRCODE='42501'; END IF;
  IF COALESCE(btrim(_notes),'') = '' THEN
    RAISE EXCEPTION 'review_notes_required' USING ERRCODE='22023'; END IF;

  UPDATE public.examination_workpapers
     SET status='returned', review_notes=_notes, returned_at=now(), returned_by=_uid,
         reviewed_by=NULL, reviewed_at=NULL, updated_at=now()
   WHERE id=_workpaper_id;

  INSERT INTO public.examination_events(examination_id, event_type, actor_id, notes, metadata)
  VALUES (_w.examination_id,'workpaper_returned_for_revision',_uid,_notes,
          jsonb_build_object('workpaper_id',_workpaper_id,'reference',_w.reference));
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.examination_workpaper_save(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.examination_workpaper_submit_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.examination_workpaper_return(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_workpaper_save(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.examination_workpaper_submit_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.examination_workpaper_return(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Governed finding creation — provenance is validated, never trusted
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_finding_create(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _id uuid; _entity uuid; _domain text; _sev text;
        _exam uuid; _assess uuid; _dim uuid; _wp uuid;
        _attention uuid; _plan uuid; _intervention uuid;
        _e public.examinations; _w public.examination_workpapers;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.finding_manage',
            'supervisory_spine.edit','prudential_supervision.manage_remediation',
            'market_conduct.approve','inspection_management.edit']);

  _entity := NULLIF(_payload->>'entity_id','')::uuid;
  _domain := upper(COALESCE(_payload->>'domain_code',''));
  _sev    := upper(COALESCE(_payload->>'severity','MEDIUM'));
  _exam   := NULLIF(_payload->>'examination_id','')::uuid;
  _assess := NULLIF(_payload->>'assessment_id','')::uuid;
  _dim    := NULLIF(_payload->>'assessment_dimension_id','')::uuid;
  _wp     := NULLIF(_payload->>'workpaper_id','')::uuid;
  _attention    := NULLIF(_payload->>'attention_id','')::uuid;
  _plan         := NULLIF(_payload->>'plan_id','')::uuid;
  _intervention := NULLIF(_payload->>'intervention_id','')::uuid;

  IF _entity IS NULL THEN RAISE EXCEPTION 'entity_id required' USING ERRCODE='22023'; END IF;
  IF NOT public.supervisory_domain_valid(_domain) THEN
    RAISE EXCEPTION 'invalid_domain: %', _domain USING ERRCODE='22023'; END IF;
  IF _exam IS NULL AND _assess IS NULL AND _dim IS NULL AND _wp IS NULL THEN
    RAISE EXCEPTION 'a governed finding requires an authoritative origin (examination, assessment, dimension or workpaper)'
      USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity);

  -- 1. workpaper must belong to the claimed examination (and imply it when absent)
  IF _wp IS NOT NULL THEN
    SELECT * INTO _w FROM public.examination_workpapers WHERE id = _wp;
    IF _w.id IS NULL THEN RAISE EXCEPTION 'not_found: workpaper' USING ERRCODE='22023'; END IF;
    IF _exam IS NULL THEN
      _exam := _w.examination_id;
    ELSIF _w.examination_id <> _exam THEN
      RAISE EXCEPTION 'provenance_mismatch: workpaper belongs to a different examination'
        USING ERRCODE='22023';
    END IF;
    IF _dim IS NULL THEN _dim := _w.assessment_dimension_id; END IF;
  END IF;

  -- 2. examination must belong to the same entity, and carry the finding's domain
  IF _exam IS NOT NULL THEN
    SELECT * INTO _e FROM public.examinations WHERE id = _exam;
    IF _e.id IS NULL THEN RAISE EXCEPTION 'not_found: examination' USING ERRCODE='22023'; END IF;
    IF _e.entity_id <> _entity THEN
      RAISE EXCEPTION 'provenance_mismatch: examination belongs to a different entity' USING ERRCODE='22023'; END IF;
    IF _e.domain_code IS NOT NULL AND upper(_e.domain_code) <> _domain THEN
      RAISE EXCEPTION 'provenance_mismatch: examination domain % does not match finding domain %',
        _e.domain_code, _domain USING ERRCODE='22023'; END IF;
    -- domain-aware examination authority for examination-sourced findings
    PERFORM public.examination_execution_require(_exam, 'edit');

    -- derive the supervisory chain from the examination itself
    _plan         := COALESCE(_plan, _e.plan_id);
    _intervention := COALESCE(_intervention, _e.intervention_id);
    IF _attention IS NULL THEN
      SELECT attention_id INTO _attention FROM public.examination_origin
       WHERE examination_id = _exam AND attention_id IS NOT NULL LIMIT 1;
    END IF;
    IF _assess IS NULL THEN
      SELECT assessment_id INTO _assess FROM public.examination_origin
       WHERE examination_id = _exam AND origin_role = 'DRIVING_ASSESSMENT' AND assessment_id IS NOT NULL
       LIMIT 1;
    END IF;
  END IF;

  -- 3. dimension must sit inside the examination's scope or origin
  IF _dim IS NOT NULL AND _exam IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.examination_scope_dimension
                    WHERE examination_id = _exam AND assessment_dimension_id = _dim)
       AND NOT EXISTS (SELECT 1 FROM public.examination_origin
                    WHERE examination_id = _exam AND assessment_dimension_id = _dim) THEN
      RAISE EXCEPTION 'provenance_mismatch: risk dimension is not within the examination scope'
        USING ERRCODE='22023';
    END IF;
  END IF;

  -- 4. dimension implies its assessment; the assessment must be the entity's own
  IF _dim IS NOT NULL THEN
    SELECT assessment_id INTO _assess FROM public.supervisory_assessment_dimension WHERE id = _dim;
    IF _assess IS NULL THEN RAISE EXCEPTION 'not_found: assessment dimension' USING ERRCODE='22023'; END IF;
  END IF;
  IF _assess IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.supervisory_assessment WHERE id = _assess AND entity_id = _entity) THEN
    RAISE EXCEPTION 'provenance_mismatch: assessment belongs to a different entity' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.supervisory_finding(
    reference, entity_id, domain_code, regulator_id, sector_id, finding_category, severity,
    title, observation, root_cause, risk_impact, regulatory_criterion, required_action,
    recommendation, confidentiality, status, source_kind,
    assessment_id, assessment_dimension_id, attention_id, plan_id, intervention_id,
    examination_id, workpaper_id, signal_id, evidence_document_id, evidence_refs,
    owner_id, team_id, due_date, origin_provenance, created_by)
  VALUES (
    public.supervisory_finding_reference(_domain), _entity, _domain,
    NULLIF(_payload->>'regulator_id','')::uuid, NULLIF(_payload->>'sector_id','')::uuid,
    _payload->>'finding_category', _sev,
    COALESCE(_payload->>'title','Untitled finding'),
    _payload->>'observation', _payload->>'root_cause', _payload->>'risk_impact',
    _payload->>'regulatory_criterion', _payload->>'required_action', _payload->>'recommendation',
    COALESCE(upper(_payload->>'confidentiality'),'STANDARD'), 'DRAFT',
    COALESCE(upper(_payload->>'source_kind'), CASE WHEN _exam IS NOT NULL THEN 'EXAMINATION' ELSE 'ASSESSMENT' END),
    _assess, _dim, _attention, _plan, _intervention, _exam, _wp,
    NULLIF(_payload->>'signal_id','')::uuid, NULLIF(_payload->>'evidence_document_id','')::uuid,
    COALESCE(_payload->'evidence_refs','[]'::jsonb),
    NULLIF(_payload->>'owner_id','')::uuid, NULLIF(_payload->>'team_id','')::uuid,
    NULLIF(_payload->>'due_date','')::date, 'GOVERNED', _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'CREATED', 'DRAFT', 'Finding raised', _uid,
          jsonb_build_object('severity', _sev,
            'source_kind', COALESCE(upper(_payload->>'source_kind'),''),
            'examination_id', _exam, 'workpaper_id', _wp,
            'examination_reference', _e.reference, 'workpaper_reference', _w.reference,
            'assessment_id', _assess, 'assessment_dimension_id', _dim));

  IF _exam IS NOT NULL THEN
    INSERT INTO public.examination_events(examination_id, event_type, actor_id, notes, metadata)
    VALUES (_exam,'supervisory_finding_created',_uid, COALESCE(_payload->>'title','Finding raised'),
            jsonb_build_object('finding_id',_id,'workpaper_id',_wp,'severity',_sev));
  END IF;

  PERFORM public.log_compliance_audit('CREATE','supervisory_finding', _id, NULL,
    jsonb_build_object('severity',_sev,'domain',_domain,'entity_id',_entity,
                       'examination_id',_exam,'workpaper_id',_wp), 'Supervisory finding raised');

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_finding_create(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_create(jsonb) TO authenticated, service_role;