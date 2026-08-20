
-- ============================================================
-- A1 authority closure: legacy Returns (compatibility), Licence Appeals,
-- Inspections, Examinations, Thematic Review authority.
-- ============================================================

-- ---------- LEGACY RETURNS (COMPATIBILITY_ONLY) ----------
CREATE OR REPLACE FUNCTION public.legacy_return_can_file(_uid uuid, _entity_id uuid, _on_behalf uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;
  IF public.has_permission(_uid, 'returns_management', 'submit') THEN RETURN true; END IF;
  IF _entity_id IS NOT NULL AND _entity_id = ANY (COALESCE(public.external_user_entity_ids(_uid), ARRAY[]::uuid[])) THEN RETURN true; END IF;
  IF _on_behalf IS NOT NULL AND _on_behalf = ANY (COALESCE(public.ppoc_mapped_licensee_ids(_uid), ARRAY[]::uuid[])) THEN RETURN true; END IF;
  IF _entity_id IS NOT NULL AND _entity_id = ANY (COALESCE(public.ppoc_mapped_licensee_ids(_uid), ARRAY[]::uuid[])) THEN RETURN true; END IF;
  RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION public.legacy_return_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _entity uuid; _on_behalf uuid; _id uuid; _after jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  _entity := nullif(_payload->>'entity_id','')::uuid;
  _on_behalf := nullif(_payload->>'on_behalf_of_licensee_id','')::uuid;
  IF _entity IS NULL THEN RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023'; END IF;
  IF NOT public.legacy_return_can_file(_uid, _entity, _on_behalf) THEN
    RAISE EXCEPTION 'You are not entitled to file returns for this entity' USING ERRCODE='42501';
  END IF;
  IF nullif(_payload->>'return_configuration_id','') IS NULL THEN
    RAISE EXCEPTION 'return_configuration_id is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.returns_filed (
    entity_id, on_behalf_of_licensee_id, return_configuration_id, sector_id, subsector_id,
    return_year, return_period, period_start_date, period_end_date, due_date,
    workflow_status, created_by, updated_by
  ) VALUES (
    _entity, _on_behalf,
    (_payload->>'return_configuration_id')::uuid,
    nullif(_payload->>'sector_id','')::uuid,
    nullif(_payload->>'subsector_id','')::uuid,
    nullif(_payload->>'return_year','')::int,
    nullif(_payload->>'return_period',''),
    nullif(_payload->>'period_start_date','')::date,
    nullif(_payload->>'period_end_date','')::date,
    nullif(_payload->>'due_date','')::date,
    'TEMP', _uid, _uid
  ) RETURNING id INTO _id;
  SELECT to_jsonb(r) INTO _after FROM public.returns_filed r WHERE r.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'legacy_return',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.legacy_return_save_draft(_return_id uuid, _patch jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(r) INTO _before FROM public.returns_filed r WHERE r.id=_return_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.legacy_return_can_file(_uid, nullif(_before->>'entity_id','')::uuid, nullif(_before->>'on_behalf_of_licensee_id','')::uuid) THEN
    RAISE EXCEPTION 'You are not entitled to edit this return' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(_before->>'workflow_status','')) NOT IN ('TEMP','WIP','TBR','REJ') THEN
    RAISE EXCEPTION 'This return can no longer be edited (status %)', _before->>'workflow_status' USING ERRCODE='22023';
  END IF;
  UPDATE public.returns_filed SET
    workflow_status = CASE
      WHEN upper(coalesce(_patch->>'workflow_status','')) IN ('TEMP','WIP') THEN upper(_patch->>'workflow_status')
      ELSE workflow_status END,
    explanations = CASE WHEN _patch ? 'explanations' THEN _patch->'explanations' ELSE explanations END,
    updated_by = _uid, updated_at = now()
  WHERE id=_return_id RETURNING to_jsonb(returns_filed) INTO _after;
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.legacy_return_submit(_return_id uuid, _ontime text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb; _status text; _ot text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(r) INTO _before FROM public.returns_filed r WHERE r.id=_return_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.legacy_return_can_file(_uid, nullif(_before->>'entity_id','')::uuid, nullif(_before->>'on_behalf_of_licensee_id','')::uuid) THEN
    RAISE EXCEPTION 'You are not entitled to file this return' USING ERRCODE='42501';
  END IF;
  _status := upper(coalesce(_before->>'workflow_status',''));
  IF _status NOT IN ('TEMP','WIP','TBR','REJ') THEN
    RAISE EXCEPTION 'Return cannot be submitted from status %', _status USING ERRCODE='22023';
  END IF;
  _ot := CASE WHEN upper(coalesce(_ontime,'')) IN ('ON_TIME','LATE') THEN upper(_ontime)
              WHEN nullif(_before->>'due_date','') IS NOT NULL
                   AND current_date > (_before->>'due_date')::date THEN 'LATE'
              ELSE 'ON_TIME' END;
  UPDATE public.returns_filed SET
    workflow_status='SUB', submit_date=now(), ontime_status=_ot::ontime_status_enum,
    updated_by=_uid, updated_at=now()
  WHERE id=_return_id RETURNING to_jsonb(returns_filed) INTO _after;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,'legacy_return',_return_id::text,_before,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.legacy_return_delete_draft(_return_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(r) INTO _before FROM public.returns_filed r WHERE r.id=_return_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.legacy_return_can_file(_uid, nullif(_before->>'entity_id','')::uuid, nullif(_before->>'on_behalf_of_licensee_id','')::uuid) THEN
    RAISE EXCEPTION 'You are not entitled to delete this return' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(_before->>'workflow_status','')) NOT IN ('TEMP','WIP') THEN
    RAISE EXCEPTION 'Only unsubmitted drafts can be deleted' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.returns_filed WHERE id=_return_id;
  PERFORM public.log_compliance_audit('DELETE'::compliance_audit_action,'legacy_return',_return_id::text,_before,NULL,_reason);
  RETURN jsonb_build_object('deleted', true, 'id', _return_id);
END; $$;

CREATE OR REPLACE FUNCTION public.legacy_return_review_decision(_return_id uuid, _decision text, _comments text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb; _target text; _status text;
BEGIN
  IF _decision NOT IN ('approve','request_edit','reject') THEN
    RAISE EXCEPTION 'Invalid decision %', _decision USING ERRCODE='22023';
  END IF;
  PERFORM public.returns_require(CASE WHEN _decision='approve' THEN 'approve' ELSE 'review' END);
  _uid := auth.uid();
  SELECT to_jsonb(r) INTO _before FROM public.returns_filed r WHERE r.id=_return_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
  _status := upper(coalesce(_before->>'workflow_status',''));
  IF _status NOT IN ('SUB','TBR') THEN
    RAISE EXCEPTION 'Return is not awaiting review (status %)', _status USING ERRCODE='22023';
  END IF;
  IF _decision <> 'approve' AND coalesce(length(btrim(_comments)),0) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE='22023';
  END IF;
  _target := CASE _decision WHEN 'approve' THEN 'VAL' WHEN 'request_edit' THEN 'TBR' ELSE 'REJ' END;
  UPDATE public.returns_filed SET workflow_status=_target, updated_by=_uid, updated_at=now()
  WHERE id=_return_id RETURNING to_jsonb(returns_filed) INTO _after;
  PERFORM public.log_compliance_audit(
    (CASE WHEN _decision='approve' THEN 'APPROVE' WHEN _decision='reject' THEN 'REJECT' ELSE 'WORKFLOW_TRANSITION' END)::compliance_audit_action,
    'legacy_return',_return_id::text,_before,_after,_comments);
  RETURN _after;
END; $$;

-- ---------- LICENCE APPEALS ----------
CREATE OR REPLACE FUNCTION public.license_appeal_file(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _app uuid; _id uuid; _after jsonb; _allowed boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  _app := nullif(_payload->>'application_id','')::uuid;
  IF _app IS NULL THEN RAISE EXCEPTION 'application_id is required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id=_app) THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE='P0002';
  END IF;
  IF coalesce(length(btrim(_payload->>'grounds')),0) < 10 THEN
    RAISE EXCEPTION 'Grounds of appeal are required (min 10 characters)' USING ERRCODE='22023';
  END IF;
  _allowed := public.is_super_admin(_uid)
    OR public.has_permission(_uid,'license_appeals','create')
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.id=_app AND a.applicant_id=_uid);
  IF NOT _allowed THEN RAISE EXCEPTION 'Permission denied: license_appeals.create' USING ERRCODE='42501'; END IF;
  INSERT INTO public.license_appeals (application_id, licensee_id, regulator_id, filed_by, grounds, relief_sought, appeal_deadline, status)
  VALUES (_app, nullif(_payload->>'licensee_id','')::uuid, nullif(_payload->>'regulator_id','')::uuid,
          _uid, btrim(_payload->>'grounds'), nullif(_payload->>'relief_sought',''),
          nullif(_payload->>'appeal_deadline','')::timestamptz, 'submitted')
  RETURNING id INTO _id;
  SELECT to_jsonb(a) INTO _after FROM public.license_appeals a WHERE a.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'license_appeal',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.license_appeal_acknowledge(_appeal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('license_appeals','edit');
  SELECT to_jsonb(a) INTO _before FROM public.license_appeals a WHERE a.id=_appeal_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Appeal not found' USING ERRCODE='P0002'; END IF;
  IF coalesce(_before->>'status','') <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted appeals can be acknowledged (status %)', _before->>'status' USING ERRCODE='22023';
  END IF;
  UPDATE public.license_appeals SET status='under_review', acknowledged_at=now(), acknowledged_by=_uid, updated_at=now()
  WHERE id=_appeal_id RETURNING to_jsonb(license_appeals) INTO _after;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,'license_appeal',_appeal_id::text,_before,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.license_appeal_withdraw(_appeal_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb; _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(a) INTO _before FROM public.license_appeals a WHERE a.id=_appeal_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Appeal not found' USING ERRCODE='P0002'; END IF;
  _allowed := public.is_super_admin(_uid)
    OR public.has_permission(_uid,'license_appeals','edit')
    OR coalesce(_before->>'filed_by','') = _uid::text;
  IF NOT _allowed THEN RAISE EXCEPTION 'Permission denied: license_appeals.edit' USING ERRCODE='42501'; END IF;
  IF coalesce(_before->>'status','') IN ('decided','withdrawn','closed') THEN
    RAISE EXCEPTION 'Appeal is already concluded (status %)', _before->>'status' USING ERRCODE='22023';
  END IF;
  UPDATE public.license_appeals SET status='withdrawn', updated_at=now()
  WHERE id=_appeal_id RETURNING to_jsonb(license_appeals) INTO _after;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,'license_appeal',_appeal_id::text,_before,_after,_reason);
  RETURN _after;
END; $$;

-- ---------- INSPECTIONS ----------
CREATE OR REPLACE FUNCTION public.inspection_lifecycle_save(_inspection_id uuid, _patch jsonb, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb; _new_status text; _closing boolean;
BEGIN
  _uid := public.conduct_require('inspection_management','edit');
  SELECT to_jsonb(i) INTO _before FROM public.inspections i WHERE i.id=_inspection_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Inspection not found' USING ERRCODE='P0002'; END IF;
  _new_status := nullif(_patch->>'status','');
  IF _new_status IS NOT NULL AND _new_status NOT IN ('planned','scheduled','in_progress','completed','cancelled','closed') THEN
    RAISE EXCEPTION 'Invalid inspection status %', _new_status USING ERRCODE='22023';
  END IF;
  _closing := _new_status IN ('completed','closed','cancelled') AND coalesce(_before->>'status','') <> _new_status;
  UPDATE public.inspections SET
    status = coalesce(_new_status, status),
    scheduled_date = CASE WHEN _patch ? 'scheduled_date' THEN nullif(_patch->>'scheduled_date','')::date ELSE scheduled_date END,
    date_conducted = CASE WHEN _patch ? 'date_conducted' THEN nullif(_patch->>'date_conducted','')::date ELSE date_conducted END,
    location = CASE WHEN _patch ? 'location' THEN nullif(_patch->>'location','') ELSE location END,
    scope = CASE WHEN _patch ? 'scope' THEN nullif(_patch->>'scope','') ELSE scope END,
    inspector_name = CASE WHEN _patch ? 'inspector_name' THEN nullif(_patch->>'inspector_name','') ELSE inspector_name END,
    findings_summary = CASE WHEN _patch ? 'findings_summary' THEN nullif(_patch->>'findings_summary','') ELSE findings_summary END,
    compliance_rating = CASE WHEN _patch ? 'compliance_rating' THEN nullif(_patch->>'compliance_rating','') ELSE compliance_rating END,
    follow_up_actions = CASE WHEN _patch ? 'follow_up_actions' THEN nullif(_patch->>'follow_up_actions','') ELSE follow_up_actions END,
    updated_at = now()
  WHERE id=_inspection_id RETURNING to_jsonb(inspections) INTO _after;
  PERFORM public.log_compliance_audit(
    (CASE WHEN _closing THEN 'WORKFLOW_TRANSITION' ELSE 'UPDATE' END)::compliance_audit_action,
    'inspection',_inspection_id::text,_before,_after,_rationale);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.inspection_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('inspection_management','create');
  IF nullif(_payload->>'entity_id','') IS NULL THEN
    RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.inspections (entity_id, inspection_type, scheduled_date, date_conducted, location, scope,
                                  inspector_id, inspector_name, lead_inspector_id, status)
  VALUES ((_payload->>'entity_id')::uuid, nullif(_payload->>'inspection_type',''),
          nullif(_payload->>'scheduled_date','')::date, nullif(_payload->>'date_conducted','')::date,
          nullif(_payload->>'location',''), nullif(_payload->>'scope',''),
          coalesce(nullif(_payload->>'inspector_id','')::uuid, _uid), nullif(_payload->>'inspector_name',''),
          nullif(_payload->>'lead_inspector_id','')::uuid,
          coalesce(nullif(_payload->>'status',''),'scheduled'))
  RETURNING id INTO _id;
  SELECT to_jsonb(i) INTO _after FROM public.inspections i WHERE i.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'inspection',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $$;

-- ---------- EXAMINATIONS ----------
CREATE OR REPLACE FUNCTION public.examination_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('prudential_supervision','manage_examination');
  IF nullif(_payload->>'entity_id','') IS NULL THEN
    RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.examinations (entity_id, regulator_id, sector_id, title, examination_type, stage, risk_rating,
        period_under_review_start, period_under_review_end, fieldwork_start, fieldwork_end, lead_examiner_id, created_by)
  VALUES ((_payload->>'entity_id')::uuid, nullif(_payload->>'regulator_id','')::uuid, nullif(_payload->>'sector_id','')::uuid,
          nullif(_payload->>'title',''), nullif(_payload->>'examination_type',''),
          coalesce(nullif(_payload->>'stage',''),'planning'), nullif(_payload->>'risk_rating',''),
          nullif(_payload->>'period_under_review_start','')::date, nullif(_payload->>'period_under_review_end','')::date,
          nullif(_payload->>'fieldwork_start','')::date, nullif(_payload->>'fieldwork_end','')::date,
          coalesce(nullif(_payload->>'lead_examiner_id','')::uuid, _uid), _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(e) INTO _after FROM public.examinations e WHERE e.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'examination',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.examination_update(_examination_id uuid, _patch jsonb, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('prudential_supervision','manage_examination');
  SELECT to_jsonb(e) INTO _before FROM public.examinations e WHERE e.id=_examination_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Examination not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.examinations SET
    title = CASE WHEN _patch ? 'title' THEN nullif(_patch->>'title','') ELSE title END,
    examination_type = CASE WHEN _patch ? 'examination_type' THEN nullif(_patch->>'examination_type','') ELSE examination_type END,
    risk_rating = CASE WHEN _patch ? 'risk_rating' THEN nullif(_patch->>'risk_rating','') ELSE risk_rating END,
    period_under_review_start = CASE WHEN _patch ? 'period_under_review_start' THEN nullif(_patch->>'period_under_review_start','')::date ELSE period_under_review_start END,
    period_under_review_end = CASE WHEN _patch ? 'period_under_review_end' THEN nullif(_patch->>'period_under_review_end','')::date ELSE period_under_review_end END,
    fieldwork_start = CASE WHEN _patch ? 'fieldwork_start' THEN nullif(_patch->>'fieldwork_start','')::date ELSE fieldwork_start END,
    fieldwork_end = CASE WHEN _patch ? 'fieldwork_end' THEN nullif(_patch->>'fieldwork_end','')::date ELSE fieldwork_end END,
    lead_examiner_id = CASE WHEN _patch ? 'lead_examiner_id' THEN nullif(_patch->>'lead_examiner_id','')::uuid ELSE lead_examiner_id END,
    overall_conclusion = CASE WHEN _patch ? 'overall_conclusion' THEN nullif(_patch->>'overall_conclusion','') ELSE overall_conclusion END,
    updated_at = now()
  WHERE id=_examination_id RETURNING to_jsonb(examinations) INTO _after;
  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,'examination',_examination_id::text,_before,_after,_rationale);
  RETURN _after;
END; $$;

-- ---------- THEMATIC REVIEW AUTHORITY ----------
CREATE OR REPLACE FUNCTION public.thematic_require(_action text DEFAULT 'initiate_thematic_review')
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;
  IF public.has_permission(_uid,'market_conduct',_action) THEN RETURN _uid; END IF;
  RAISE EXCEPTION 'Permission denied: market_conduct.%', _action USING ERRCODE='42501';
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  IF coalesce(length(btrim(_payload->>'title')),0) < 3 THEN
    RAISE EXCEPTION 'A review title is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.thematic_reviews (title, description, hypothesis, risk_category_id, scope_start, scope_end,
                                       lead_officer_id, regulator_id, status, opened_at, created_by)
  VALUES (btrim(_payload->>'title'), nullif(_payload->>'description',''), nullif(_payload->>'hypothesis',''),
          nullif(_payload->>'risk_category_id','')::uuid, nullif(_payload->>'scope_start','')::date,
          nullif(_payload->>'scope_end','')::date,
          coalesce(nullif(_payload->>'lead_officer_id','')::uuid, _uid),
          nullif(_payload->>'regulator_id','')::uuid, 'draft', now(), _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(t) INTO _after FROM public.thematic_reviews t WHERE t.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'thematic_review',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_set_status(_review_id uuid, _status text, _reason text DEFAULT NULL, _override_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  SELECT to_jsonb(t) INTO _before FROM public.thematic_reviews t WHERE t.id=_review_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Thematic review not found' USING ERRCODE='P0002'; END IF;
  IF _status NOT IN ('draft','scoping','fieldwork','analysis','reporting','closed','cancelled') THEN
    RAISE EXCEPTION 'Invalid thematic review status %', _status USING ERRCODE='22023';
  END IF;
  IF _status IN ('closed','cancelled') AND coalesce(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required to close or cancel a review' USING ERRCODE='22023';
  END IF;
  UPDATE public.thematic_reviews SET
    status=_status,
    closed_at = CASE WHEN _status IN ('closed','cancelled') THEN now() ELSE closed_at END,
    updated_at = now()
  WHERE id=_review_id RETURNING to_jsonb(thematic_reviews) INTO _after;
  INSERT INTO public.thematic_review_status_history (review_id, from_status, to_status, changed_by, reason, override_id)
  VALUES (_review_id, _before->>'status', _status, _uid, _reason, _override_id);
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,'thematic_review',_review_id::text,_before,_after,_reason);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_finding_save(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _before jsonb; _after jsonb; _review uuid;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  _id := nullif(_payload->>'finding_id','')::uuid;
  IF coalesce(length(btrim(_payload->>'title')),0) < 3 THEN
    RAISE EXCEPTION 'A finding title is required' USING ERRCODE='22023';
  END IF;
  IF coalesce(_payload->>'severity','medium') NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid severity' USING ERRCODE='22023';
  END IF;
  IF _id IS NULL THEN
    _review := nullif(_payload->>'review_id','')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.thematic_reviews t WHERE t.id=_review) THEN
      RAISE EXCEPTION 'Thematic review not found' USING ERRCODE='P0002';
    END IF;
    INSERT INTO public.thematic_review_findings (review_id, licensee_id, severity, title, detail, root_cause, status, created_by)
    VALUES (_review, nullif(_payload->>'licensee_id','')::uuid, coalesce(nullif(_payload->>'severity',''),'medium'),
            btrim(_payload->>'title'), nullif(_payload->>'detail',''), nullif(_payload->>'root_cause',''), 'draft', _uid)
    RETURNING id INTO _id;
  ELSE
    SELECT to_jsonb(f) INTO _before FROM public.thematic_review_findings f WHERE f.id=_id;
    IF _before IS NULL THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE='P0002'; END IF;
    IF coalesce(_before->>'status','') = 'issued' THEN
      RAISE EXCEPTION 'An issued finding cannot be edited' USING ERRCODE='22023';
    END IF;
    UPDATE public.thematic_review_findings SET
      licensee_id = nullif(_payload->>'licensee_id','')::uuid,
      severity = coalesce(nullif(_payload->>'severity',''), severity),
      title = btrim(_payload->>'title'),
      detail = nullif(_payload->>'detail',''),
      root_cause = nullif(_payload->>'root_cause',''),
      updated_at = now()
    WHERE id=_id;
  END IF;
  SELECT to_jsonb(f) INTO _after FROM public.thematic_review_findings f WHERE f.id=_id;
  PERFORM public.log_compliance_audit(
    (CASE WHEN _before IS NULL THEN 'CREATE' ELSE 'UPDATE' END)::compliance_audit_action,
    'thematic_review_finding',_id::text,_before,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_finding_issue(_finding_id uuid, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  SELECT to_jsonb(f) INTO _before FROM public.thematic_review_findings f WHERE f.id=_finding_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Finding not found' USING ERRCODE='P0002'; END IF;
  IF coalesce(_before->>'status','') = 'issued' THEN
    RAISE EXCEPTION 'Finding is already issued' USING ERRCODE='22023';
  END IF;
  UPDATE public.thematic_review_findings SET status='issued', issued_at=now(), issued_by=_uid, updated_at=now()
  WHERE id=_finding_id RETURNING to_jsonb(thematic_review_findings) INTO _after;
  PERFORM public.log_compliance_audit('APPROVE'::compliance_audit_action,'thematic_review_finding',_finding_id::text,_before,_after,_rationale);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_action_save(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _before jsonb; _after jsonb; _review uuid;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  _id := nullif(_payload->>'action_id','')::uuid;
  IF coalesce(length(btrim(_payload->>'title')),0) < 3 THEN
    RAISE EXCEPTION 'An action title is required' USING ERRCODE='22023';
  END IF;
  IF _id IS NULL THEN
    _review := nullif(_payload->>'review_id','')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.thematic_reviews t WHERE t.id=_review) THEN
      RAISE EXCEPTION 'Thematic review not found' USING ERRCODE='P0002';
    END IF;
    INSERT INTO public.thematic_review_actions (review_id, finding_id, licensee_id, action_type, title, description,
                                                due_date, original_due_date, status, created_by)
    VALUES (_review, nullif(_payload->>'finding_id','')::uuid, nullif(_payload->>'licensee_id','')::uuid,
            coalesce(nullif(_payload->>'action_type',''),'remediation'), btrim(_payload->>'title'),
            nullif(_payload->>'description',''), nullif(_payload->>'due_date','')::date,
            nullif(_payload->>'due_date','')::date, 'open', _uid)
    RETURNING id INTO _id;
  ELSE
    SELECT to_jsonb(a) INTO _before FROM public.thematic_review_actions a WHERE a.id=_id;
    IF _before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
    UPDATE public.thematic_review_actions SET
      title = btrim(_payload->>'title'),
      description = nullif(_payload->>'description',''),
      action_type = coalesce(nullif(_payload->>'action_type',''), action_type),
      licensee_id = nullif(_payload->>'licensee_id','')::uuid,
      finding_id = nullif(_payload->>'finding_id','')::uuid,
      updated_at = now()
    WHERE id=_id;
  END IF;
  SELECT to_jsonb(a) INTO _after FROM public.thematic_review_actions a WHERE a.id=_id;
  PERFORM public.log_compliance_audit(
    (CASE WHEN _before IS NULL THEN 'CREATE' ELSE 'UPDATE' END)::compliance_audit_action,
    'thematic_review_action',_id::text,_before,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_action_complete(_action_id uuid, _evidence text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  SELECT to_jsonb(a) INTO _before FROM public.thematic_review_actions a WHERE a.id=_action_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
  IF coalesce(_before->>'status','') IN ('completed','waived') THEN
    RAISE EXCEPTION 'Action is already concluded' USING ERRCODE='22023';
  END IF;
  UPDATE public.thematic_review_actions SET status='completed', completed_at=now(),
         evidence_of_completion=nullif(btrim(coalesce(_evidence,'')),''), updated_at=now()
  WHERE id=_action_id RETURNING to_jsonb(thematic_review_actions) INTO _after;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,'thematic_review_action',_action_id::text,_before,_after,_evidence);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_action_waive(_action_id uuid, _override_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  IF _override_id IS NULL THEN
    RAISE EXCEPTION 'A recorded override is required to waive an action' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(a) INTO _before FROM public.thematic_review_actions a WHERE a.id=_action_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.thematic_review_actions SET status='waived', waiver_override_id=_override_id, updated_at=now()
  WHERE id=_action_id RETURNING to_jsonb(thematic_review_actions) INTO _after;
  PERFORM public.log_compliance_audit('OVERRIDE'::compliance_audit_action,'thematic_review_action',_action_id::text,_before,_after,_reason);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.thematic_review_letter_mark_dispatched(_letter_id uuid, _recipient_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  SELECT to_jsonb(l) INTO _before FROM public.thematic_review_letters l WHERE l.id=_letter_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Letter not found' USING ERRCODE='P0002'; END IF;
  IF coalesce(_before->>'status','') = 'dispatched' THEN
    RAISE EXCEPTION 'Letter is already dispatched' USING ERRCODE='22023';
  END IF;
  UPDATE public.thematic_review_letters SET status='dispatched', dispatched_at=now(), dispatched_by=_uid,
         recipient_email = coalesce(nullif(btrim(coalesce(_recipient_email,'')),''), recipient_email),
         error_message=NULL, updated_at=now()
  WHERE id=_letter_id RETURNING to_jsonb(thematic_review_letters) INTO _after;
  PERFORM public.log_compliance_audit('APPROVE'::compliance_audit_action,'thematic_review_letter',_letter_id::text,_before,_after,NULL);
  RETURN _after;
END; $$;

-- ---------- GRANTS ----------
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'legacy_return_can_file(uuid,uuid,uuid)',
    'legacy_return_create(jsonb)','legacy_return_save_draft(uuid,jsonb)','legacy_return_submit(uuid,text)',
    'legacy_return_delete_draft(uuid,text)','legacy_return_review_decision(uuid,text,text)',
    'license_appeal_file(jsonb)','license_appeal_acknowledge(uuid)','license_appeal_withdraw(uuid,text)',
    'inspection_lifecycle_save(uuid,jsonb,text)','inspection_create(jsonb)',
    'examination_create(jsonb)','examination_update(uuid,jsonb,text)',
    'thematic_require(text)','thematic_review_create(jsonb)','thematic_review_set_status(uuid,text,text,uuid)',
    'thematic_review_finding_save(jsonb)','thematic_review_finding_issue(uuid,text)',
    'thematic_review_action_save(jsonb)','thematic_review_action_complete(uuid,text)',
    'thematic_review_action_waive(uuid,uuid,text)','thematic_review_letter_mark_dispatched(uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ---------- DIRECT DML LOCKDOWN ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'returns_filed','license_appeals','license_appeal_events','inspections','examinations',
    'thematic_reviews','thematic_review_findings','thematic_review_actions',
    'thematic_review_letters','thematic_review_status_history'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
