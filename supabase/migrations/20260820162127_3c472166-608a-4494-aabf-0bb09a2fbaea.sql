
-- ========== Conduct & Enforcement governed operations ==========

CREATE OR REPLACE FUNCTION public.conduct_require(_module text, _action text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(_uid, _module, _action) THEN
    RAISE EXCEPTION 'Permission denied: %.%', _module, _action USING ERRCODE = '42501';
  END IF;
  RETURN _uid;
END; $$;

-- ---------- Conduct alerts ----------
CREATE OR REPLACE FUNCTION public.conduct_alert_acknowledge(_alert_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct','manage_complaints');
  SELECT to_jsonb(a) INTO _before FROM public.conduct_alerts a WHERE a.id = _alert_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002'; END IF;
  IF _before->>'status' NOT IN ('open','escalated') THEN
    RAISE EXCEPTION 'Only open alerts can be acknowledged' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conduct_alerts SET status='acknowledged', acknowledged_by=_uid,
    acknowledged_at=now(), updated_at=now() WHERE id=_alert_id
  RETURNING to_jsonb(conduct_alerts) INTO _after;
  PERFORM public.log_compliance_audit('UPDATE','conduct_alert',_alert_id,_before,_after,_note);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_alert_close(_alert_id uuid, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct','manage_complaints');
  IF coalesce(length(btrim(_reason)),0) < 5 THEN
    RAISE EXCEPTION 'Closure reason required (min 5 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(a) INTO _before FROM public.conduct_alerts a WHERE a.id=_alert_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002'; END IF;
  IF _before->>'status' = 'closed' THEN
    RAISE EXCEPTION 'Alert is already closed' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conduct_alerts SET status='closed', closed_by=_uid, closed_at=now(),
    closure_reason=btrim(_reason),
    disposition = coalesce(_metadata->>'disposition', disposition),
    disposition_reason = coalesce(_metadata->>'disposition_reason', disposition_reason),
    updated_at=now() WHERE id=_alert_id
  RETURNING to_jsonb(conduct_alerts) INTO _after;
  PERFORM public.log_compliance_audit(
    CASE WHEN _before->>'status'='open' THEN 'OVERRIDE' ELSE 'UPDATE' END,
    'conduct_alert',_alert_id,_before,_after,btrim(_reason));
  RETURN _after;
END; $$;

-- ---------- Conduct investigations ----------
CREATE OR REPLACE FUNCTION public.conduct_investigation_open(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct','initiate_investigation');
  IF coalesce(length(btrim(_payload->>'allegation')),0) < 10 THEN
    RAISE EXCEPTION 'Allegation summary required (min 10 characters)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.conduct_investigations (
    source_type, source_id, licensee_id, product_id, allegation, priority, severity,
    assigned_investigator, status, due_date, scope, legal_basis, investigation_plan,
    metadata, opened_by
  ) VALUES (
    coalesce(_payload->>'source_type','manual'),
    nullif(_payload->>'source_id','')::uuid,
    nullif(_payload->>'licensee_id','')::uuid,
    nullif(_payload->>'product_id','')::uuid,
    btrim(_payload->>'allegation'),
    nullif(_payload->>'priority',''),
    nullif(_payload->>'severity',''),
    nullif(_payload->>'assigned_investigator','')::uuid,
    coalesce(nullif(_payload->>'status',''),'open'),
    nullif(_payload->>'due_date','')::date,
    nullif(_payload->>'scope',''),
    nullif(_payload->>'legal_basis',''),
    nullif(_payload->>'investigation_plan',''),
    coalesce(_payload->'metadata','{}'::jsonb),
    _uid
  ) RETURNING id INTO _id;
  SELECT to_jsonb(i) INTO _after FROM public.conduct_investigations i WHERE i.id=_id;
  PERFORM public.log_compliance_audit('CREATE','conduct_investigation',_id,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_investigation_update(_investigation_id uuid, _patch jsonb, _justification text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb; _closing boolean;
BEGIN
  _uid := public.conduct_require('market_conduct','initiate_investigation');
  SELECT to_jsonb(i) INTO _before FROM public.conduct_investigations i WHERE i.id=_investigation_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Investigation not found' USING ERRCODE='P0002'; END IF;
  _closing := (_patch->>'status') = 'closed' AND coalesce(_before->>'status','') <> 'closed';
  IF _closing AND coalesce(length(btrim(_justification)),0) < 10 THEN
    RAISE EXCEPTION 'Closure justification required (min 10 characters)' USING ERRCODE='22023';
  END IF;
  UPDATE public.conduct_investigations SET
    status = coalesce(nullif(_patch->>'status',''), status),
    priority = coalesce(nullif(_patch->>'priority',''), priority),
    severity = coalesce(nullif(_patch->>'severity',''), severity),
    allegation = coalesce(nullif(_patch->>'allegation',''), allegation),
    assigned_investigator = CASE WHEN _patch ? 'assigned_investigator'
      THEN nullif(_patch->>'assigned_investigator','')::uuid ELSE assigned_investigator END,
    due_date = CASE WHEN _patch ? 'due_date' THEN nullif(_patch->>'due_date','')::date ELSE due_date END,
    scope = coalesce(nullif(_patch->>'scope',''), scope),
    legal_basis = coalesce(nullif(_patch->>'legal_basis',''), legal_basis),
    investigation_plan = coalesce(nullif(_patch->>'investigation_plan',''), investigation_plan),
    milestones = coalesce(_patch->'milestones', milestones),
    outcome = coalesce(nullif(_patch->>'outcome',''), outcome),
    closure_reason = coalesce(nullif(_patch->>'closure_reason',''), closure_reason),
    metadata = coalesce(_patch->'metadata', metadata),
    closed_by = CASE WHEN _closing THEN _uid ELSE closed_by END,
    closed_at = CASE WHEN _closing THEN now() ELSE closed_at END,
    updated_at = now()
  WHERE id=_investigation_id
  RETURNING to_jsonb(conduct_investigations) INTO _after;
  PERFORM public.log_compliance_audit(
    CASE WHEN _closing THEN 'APPROVE' ELSE 'UPDATE' END,
    'conduct_investigation',_investigation_id,_before,_after,_justification);
  RETURN _after;
END; $$;

-- ---------- Conduct supervisory actions ----------
CREATE OR REPLACE FUNCTION public.conduct_action_issue(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb; _rationale text;
BEGIN
  _uid := public.conduct_require('market_conduct','issue_enforcement_action');
  _rationale := btrim(coalesce(_payload->>'rationale',''));
  IF coalesce(length(btrim(_payload->>'title')),0) = 0 THEN
    RAISE EXCEPTION 'Title is required' USING ERRCODE='22023';
  END IF;
  IF length(_rationale) < 10 THEN
    RAISE EXCEPTION 'Rationale required (min 10 characters)' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.conduct_actions (
    source_module, source_id, entity_id, product_id, action_type, title, description,
    due_date, assigned_to, assigned_team, status, created_by, metadata
  ) VALUES (
    coalesce(nullif(_payload->>'source_module',''),'manual'),
    nullif(_payload->>'source_id','')::uuid,
    nullif(_payload->>'entity_id','')::uuid,
    nullif(_payload->>'product_id','')::uuid,
    coalesce(nullif(_payload->>'action_type',''),'remediation_request'),
    btrim(_payload->>'title'),
    nullif(btrim(coalesce(_payload->>'description','')),''),
    nullif(_payload->>'due_date','')::date,
    nullif(_payload->>'assigned_to','')::uuid,
    nullif(btrim(coalesce(_payload->>'assigned_team','')),''),
    'open', _uid,
    coalesce(_payload->'metadata','{}'::jsonb) || jsonb_build_object('rationale',_rationale)
  ) RETURNING id INTO _id;
  SELECT to_jsonb(a) INTO _after FROM public.conduct_actions a WHERE a.id=_id;
  PERFORM public.log_compliance_audit('CREATE','conduct_action',_id,NULL,_after,_rationale);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_action_close(_action_id uuid, _disposition text, _reason text, _outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb; _min int;
BEGIN
  _uid := public.conduct_require('market_conduct','issue_enforcement_action');
  IF _disposition NOT IN ('completed','waived','cancelled') THEN
    RAISE EXCEPTION 'Unsupported disposition: %', _disposition USING ERRCODE='22023';
  END IF;
  _min := CASE WHEN _disposition='completed' THEN 1 ELSE 10 END;
  IF coalesce(length(btrim(_reason)),0) < _min THEN
    RAISE EXCEPTION 'Reason required (min % characters)', _min USING ERRCODE='22023';
  END IF;
  IF _disposition='completed' AND coalesce(length(btrim(_outcome)),0) = 0 THEN
    RAISE EXCEPTION 'Outcome is required to complete an action' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(a) INTO _before FROM public.conduct_actions a WHERE a.id=_action_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
  IF _before->>'status' IN ('completed','waived','cancelled') THEN
    RAISE EXCEPTION 'Action is already closed' USING ERRCODE='22023';
  END IF;
  UPDATE public.conduct_actions SET
    status = _disposition,
    outcome = CASE WHEN _disposition='completed' THEN btrim(_outcome) ELSE outcome END,
    completion_notes = CASE WHEN _disposition='completed' THEN btrim(_reason) ELSE completion_notes END,
    waiver_reason = CASE WHEN _disposition='waived' THEN btrim(_reason) ELSE waiver_reason END,
    cancellation_reason = CASE WHEN _disposition='cancelled' THEN btrim(_reason) ELSE cancellation_reason END,
    closed_by = _uid, closed_at = now(), updated_at = now()
  WHERE id=_action_id
  RETURNING to_jsonb(conduct_actions) INTO _after;
  PERFORM public.log_compliance_audit(
    CASE WHEN _disposition='completed' THEN 'UPDATE' ELSE 'OVERRIDE' END,
    'conduct_action',_action_id,_before,_after,btrim(_reason));
  RETURN _after;
END; $$;

-- ---------- Conduct evidence ----------
CREATE OR REPLACE FUNCTION public.conduct_evidence_upload(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct_investigation','manage_evidence_repository');
  IF coalesce(length(btrim(_payload->>'title')),0) = 0 THEN
    RAISE EXCEPTION 'Evidence title is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.conduct_evidence (
    title, evidence_type, file_url, file_id, description, source, restricted,
    confidentiality_level, complaint_id, investigation_id, thematic_review_id,
    alert_id, action_id, entity_id, metadata, uploaded_by
  ) VALUES (
    btrim(_payload->>'title'),
    nullif(_payload->>'evidence_type',''),
    nullif(_payload->>'file_url',''),
    nullif(_payload->>'file_id','')::uuid,
    nullif(_payload->>'description',''),
    nullif(_payload->>'source',''),
    coalesce((_payload->>'restricted')::boolean,false),
    nullif(_payload->>'confidentiality_level',''),
    nullif(_payload->>'complaint_id','')::uuid,
    nullif(_payload->>'investigation_id','')::uuid,
    nullif(_payload->>'thematic_review_id','')::uuid,
    nullif(_payload->>'alert_id','')::uuid,
    nullif(_payload->>'action_id','')::uuid,
    nullif(_payload->>'entity_id','')::uuid,
    coalesce(_payload->'metadata','{}'::jsonb),
    _uid
  ) RETURNING id INTO _id;
  SELECT to_jsonb(e) INTO _after FROM public.conduct_evidence e WHERE e.id=_id;
  PERFORM public.log_compliance_audit('CREATE','conduct_evidence',_id,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_evidence_set_restriction(_evidence_id uuid, _restricted boolean, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct_investigation','manage_evidence_repository');
  IF coalesce(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Reason required (min 10 characters)' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(e) INTO _before FROM public.conduct_evidence e WHERE e.id=_evidence_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.conduct_evidence SET restricted=_restricted, updated_at=now()
  WHERE id=_evidence_id RETURNING to_jsonb(conduct_evidence) INTO _after;
  PERFORM public.log_conduct_evidence_access(_evidence_id,
    CASE WHEN _restricted THEN 'restrict' ELSE 'unrestrict' END, btrim(_reason));
  PERFORM public.log_compliance_audit('UPDATE','conduct_evidence',_evidence_id,_before,_after,btrim(_reason));
  RETURN _after;
END; $$;

-- ---------- Complaint investigation work items ----------
CREATE OR REPLACE FUNCTION public.complaint_task_create(_complaint_id uuid, _title text, _description text DEFAULT NULL, _due_date date DEFAULT NULL, _owner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('complaint_management','edit');
  IF coalesce(length(btrim(_title)),0) = 0 THEN
    RAISE EXCEPTION 'Please describe the work item' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id=_complaint_id) THEN
    RAISE EXCEPTION 'Complaint not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.complaint_investigation_tasks
    (complaint_id, title, description, due_date, owner_id, created_by)
  VALUES (_complaint_id, btrim(_title), nullif(btrim(coalesce(_description,'')),''),
          _due_date, coalesce(_owner_id,_uid), _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(t) INTO _after FROM public.complaint_investigation_tasks t WHERE t.id=_id;
  PERFORM public.log_compliance_audit('CREATE','complaint_investigation_task',_id,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_task_set_status(_task_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('complaint_management','edit');
  IF _status NOT IN ('pending','in_progress','completed','cancelled') THEN
    RAISE EXCEPTION 'Unsupported work item status: %', _status USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(t) INTO _before FROM public.complaint_investigation_tasks t WHERE t.id=_task_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Work item not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.complaint_investigation_tasks SET
    status = _status,
    completed_at = CASE WHEN _status='completed' THEN now() ELSE NULL END,
    completed_by = CASE WHEN _status='completed' THEN _uid ELSE NULL END,
    updated_at = now()
  WHERE id=_task_id RETURNING to_jsonb(complaint_investigation_tasks) INTO _after;
  PERFORM public.log_compliance_audit('UPDATE','complaint_investigation_task',_task_id,_before,_after,NULL);
  RETURN _after;
END; $$;

-- ---------- Enforcement actions & obligations ----------
CREATE OR REPLACE FUNCTION public.enforcement_action_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('enforcement_management','create');
  IF coalesce(length(btrim(_payload->>'case_number')),0) = 0 THEN
    RAISE EXCEPTION 'Case number is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.enforcement_actions (
    entity_id, case_number, enforcement_type, date_opened, status,
    penalty_amount, description, source_type, opened_by
  ) VALUES (
    nullif(_payload->>'entity_id','')::uuid,
    btrim(_payload->>'case_number'),
    coalesce(nullif(_payload->>'enforcement_type',''),'Warning'),
    coalesce(nullif(_payload->>'date_opened','')::date, current_date),
    coalesce(nullif(_payload->>'status',''),'open'),
    coalesce((_payload->>'penalty_amount')::numeric,0),
    nullif(btrim(coalesce(_payload->>'description','')),''),
    coalesce(nullif(_payload->>'source_type',''),'manual'),
    _uid
  ) RETURNING id INTO _id;
  SELECT to_jsonb(e) INTO _after FROM public.enforcement_actions e WHERE e.id=_id;
  PERFORM public.log_compliance_audit('CREATE','enforcement_action',_id,NULL,_after,NULL);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.enforcement_action_update(_action_id uuid, _patch jsonb, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb; _after jsonb; _closing boolean;
BEGIN
  _uid := public.conduct_require('enforcement_management','edit');
  SELECT to_jsonb(e) INTO _before FROM public.enforcement_actions e WHERE e.id=_action_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Enforcement action not found' USING ERRCODE='P0002'; END IF;
  _closing := (_patch->>'status') = 'closed' AND coalesce(_before->>'status','') <> 'closed';
  IF _closing AND coalesce(length(btrim(_rationale)),0) < 10 THEN
    RAISE EXCEPTION 'Closure rationale required (min 10 characters)' USING ERRCODE='22023';
  END IF;
  UPDATE public.enforcement_actions SET
    case_number = coalesce(nullif(_patch->>'case_number',''), case_number),
    enforcement_type = coalesce(nullif(_patch->>'enforcement_type',''), enforcement_type),
    date_opened = coalesce(nullif(_patch->>'date_opened','')::date, date_opened),
    status = coalesce(nullif(_patch->>'status',''), status),
    penalty_amount = coalesce((_patch->>'penalty_amount')::numeric, penalty_amount),
    description = CASE WHEN _patch ? 'description'
      THEN nullif(btrim(coalesce(_patch->>'description','')),'') ELSE description END,
    closed_by = CASE WHEN _closing THEN _uid ELSE closed_by END,
    closed_at = CASE WHEN _closing THEN now() ELSE closed_at END,
    updated_at = now()
  WHERE id=_action_id RETURNING to_jsonb(enforcement_actions) INTO _after;
  PERFORM public.log_compliance_audit(
    CASE WHEN _closing THEN 'APPROVE' ELSE 'UPDATE' END,
    'enforcement_action',_action_id,_before,_after,_rationale);
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.enforcement_action_delete(_action_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb;
BEGIN
  _uid := public.conduct_require('enforcement_management','delete');
  IF coalesce(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Deletion reason required (min 10 characters)' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(e) INTO _before FROM public.enforcement_actions e WHERE e.id=_action_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Enforcement action not found' USING ERRCODE='P0002'; END IF;
  DELETE FROM public.enforcement_actions WHERE id=_action_id;
  PERFORM public.log_compliance_audit('DELETE','enforcement_action',_action_id,_before,NULL,btrim(_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.enforcement_obligation_add(_case_id uuid, _obligation text, _detail text DEFAULT NULL, _deadline date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('enforcement_management','edit');
  IF coalesce(length(btrim(_obligation)),0) < 3 THEN
    RAISE EXCEPTION 'Obligation description is required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enforcement_actions WHERE id=_case_id) THEN
    RAISE EXCEPTION 'Enforcement case not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.enforcement_obligations (case_id, obligation, detail, deadline, created_by)
  VALUES (_case_id, btrim(_obligation), nullif(btrim(coalesce(_detail,'')),''), _deadline, _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(o) INTO _after FROM public.enforcement_obligations o WHERE o.id=_id;
  PERFORM public.log_compliance_audit('CREATE','enforcement_obligation',_id,NULL,_after,NULL);
  RETURN _after;
END; $$;

-- ---------- Grants ----------
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'conduct_alert_acknowledge(uuid,text)',
    'conduct_alert_close(uuid,text,jsonb)',
    'conduct_investigation_open(jsonb)',
    'conduct_investigation_update(uuid,jsonb,text)',
    'conduct_action_issue(jsonb)',
    'conduct_action_close(uuid,text,text,text)',
    'conduct_evidence_upload(jsonb)',
    'conduct_evidence_set_restriction(uuid,boolean,text)',
    'complaint_task_create(uuid,text,text,date,uuid)',
    'complaint_task_set_status(uuid,text)',
    'enforcement_action_create(jsonb)',
    'enforcement_action_update(uuid,jsonb,text)',
    'enforcement_action_delete(uuid,text)',
    'enforcement_obligation_add(uuid,text,text,date)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.conduct_require(text,text) FROM PUBLIC;

-- ---------- DML lockdown ----------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'conduct_alerts','conduct_investigations','conduct_actions','conduct_evidence',
    'complaint_investigation_tasks','enforcement_actions','enforcement_obligations'
  ]) LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
