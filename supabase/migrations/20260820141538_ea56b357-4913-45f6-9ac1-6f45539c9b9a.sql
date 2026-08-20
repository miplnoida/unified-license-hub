-- ============================================================
-- A1: Governed regulatory decision operations
-- ============================================================

-- ---------- Fit & Proper appeals ----------
CREATE OR REPLACE FUNCTION public.fp_appeal_file(
  _individual_id uuid,
  _determination_id uuid,
  _grounds text,
  _license_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _det record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','submit');
  IF _grounds IS NULL OR length(btrim(_grounds)) < 20 THEN
    RAISE EXCEPTION 'grounds must be at least 20 characters' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _det FROM public.fp_determinations WHERE id = _determination_id;
  IF _det IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='22023'; END IF;
  IF _det.individual_id <> _individual_id THEN
    RAISE EXCEPTION 'determination does not belong to individual' USING ERRCODE='22023';
  END IF;
  IF NOT _det.is_current THEN
    RAISE EXCEPTION 'only the current determination may be appealed' USING ERRCODE='22023';
  END IF;
  IF _det.outcome NOT IN ('rejected','conditional') THEN
    RAISE EXCEPTION 'only rejected or conditional determinations may be appealed' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_appeals a
             WHERE a.determination_id = _determination_id
               AND a.status NOT IN ('decided','withdrawn')) THEN
    RAISE EXCEPTION 'an open appeal already exists for this determination' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.fp_appeals (individual_id, determination_id, filed_by, grounds, status, supporting_docs, license_id)
  VALUES (_individual_id, _determination_id, _uid, btrim(_grounds), 'submitted', '[]'::jsonb, _license_id)
  RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, 'fp.appeal.filed', 'fp_appeal', _row.id,
          jsonb_build_object('individual_id',_individual_id,'determination_id',_determination_id,
                             'license_id',_license_id,'after',jsonb_build_object('status','submitted')));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.fp_appeal_assign_committee(
  _appeal_id uuid, _committee_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev text; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');
  SELECT status INTO _prev FROM public.fp_appeals WHERE id = _appeal_id;
  IF _prev IS NULL THEN RAISE EXCEPTION 'appeal not found' USING ERRCODE='22023'; END IF;
  IF _prev IN ('decided','withdrawn') THEN
    RAISE EXCEPTION 'appeal is closed' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fp_committees WHERE id = _committee_id) THEN
    RAISE EXCEPTION 'committee not found' USING ERRCODE='22023';
  END IF;
  UPDATE public.fp_appeals
     SET appeal_committee_id = _committee_id, status = 'under_review'
   WHERE id = _appeal_id RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, 'fp.appeal.committee_assigned', 'fp_appeal', _appeal_id,
          jsonb_build_object('before',jsonb_build_object('status',_prev),
                             'after',jsonb_build_object('status','under_review','appeal_committee_id',_committee_id)));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.fp_appeal_decide(
  _appeal_id uuid, _decision text, _rationale text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _appeal record; _det record; _new_det_id uuid; _outcome text; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','approve');
  IF _decision IS NULL OR _decision NOT IN ('upheld','dismissed','overturned_to_approved','overturned_to_conditional') THEN
    RAISE EXCEPTION 'invalid appeal decision' USING ERRCODE='22023';
  END IF;
  IF _rationale IS NULL OR length(btrim(_rationale)) < 10 THEN
    RAISE EXCEPTION 'decision rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _appeal FROM public.fp_appeals WHERE id = _appeal_id FOR UPDATE;
  IF _appeal IS NULL THEN RAISE EXCEPTION 'appeal not found' USING ERRCODE='22023'; END IF;
  IF _appeal.status IN ('decided','withdrawn') THEN
    RAISE EXCEPTION 'appeal already closed' USING ERRCODE='22023';
  END IF;

  IF _decision IN ('overturned_to_approved','overturned_to_conditional') THEN
    _outcome := CASE WHEN _decision = 'overturned_to_approved' THEN 'approved' ELSE 'conditional' END;
    SELECT * INTO _det FROM public.fp_determinations WHERE id = _appeal.determination_id;
    IF _det IS NULL THEN RAISE EXCEPTION 'appealed determination missing' USING ERRCODE='22023'; END IF;
    UPDATE public.fp_determinations SET is_current = false WHERE id = _appeal.determination_id;
    INSERT INTO public.fp_determinations (
      assessment_id, individual_id, outcome, rationale, determined_by,
      supersedes_id, is_current, effective_from
    ) VALUES (
      _det.assessment_id, _appeal.individual_id, _outcome,
      'Appeal outcome: ' || btrim(_rationale), _uid,
      _appeal.determination_id, true, CURRENT_DATE
    ) RETURNING id INTO _new_det_id;

    IF _appeal.license_id IS NOT NULL THEN
      INSERT INTO public.license_actions (license_id, action_type, actor_id, reason, metadata)
      VALUES (_appeal.license_id, 'fp_appeal_overturn', _uid,
              'FP appeal ' || _decision || ': ' || btrim(_rationale),
              jsonb_build_object('appeal_id',_appeal_id,'individual_id',_appeal.individual_id,
                                 'new_determination_id',_new_det_id,'new_outcome',_outcome));
    END IF;
  END IF;

  UPDATE public.fp_appeals
     SET status = 'decided', decision = _decision, decision_rationale = btrim(_rationale),
         decided_by = _uid, decided_at = now(), new_determination_id = _new_det_id
   WHERE id = _appeal_id RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, 'fp.appeal.decided', 'fp_appeal', _appeal_id,
          jsonb_build_object('before',jsonb_build_object('status',_appeal.status),
                             'after',jsonb_build_object('status','decided','decision',_decision,
                                                        'new_determination_id',_new_det_id),
                             'justification',btrim(_rationale),
                             'individual_id',_appeal.individual_id));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.fp_appeal_withdraw(_appeal_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _appeal record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');
  SELECT * INTO _appeal FROM public.fp_appeals WHERE id = _appeal_id FOR UPDATE;
  IF _appeal IS NULL THEN RAISE EXCEPTION 'appeal not found' USING ERRCODE='22023'; END IF;
  IF _appeal.status IN ('decided','withdrawn') THEN
    RAISE EXCEPTION 'appeal already closed' USING ERRCODE='22023';
  END IF;
  UPDATE public.fp_appeals SET status = 'withdrawn' WHERE id = _appeal_id RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, 'fp.appeal.withdrawn', 'fp_appeal', _appeal_id,
          jsonb_build_object('before',jsonb_build_object('status',_appeal.status),
                             'after',jsonb_build_object('status','withdrawn'),'reason',_reason));
  RETURN to_jsonb(_row);
END; $$;

-- ---------- Licence conditions ----------
CREATE OR REPLACE FUNCTION public.license_condition_create(
  _license_id uuid, _category text, _description text,
  _application_id uuid DEFAULT NULL, _due_date date DEFAULT NULL,
  _monitoring_owner text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('license_management','manage_conditions');
  IF _description IS NULL OR length(btrim(_description)) < 5 THEN
    RAISE EXCEPTION 'condition description is required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.licenses WHERE id = _license_id) THEN
    RAISE EXCEPTION 'license not found' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.license_conditions (license_id, application_id, category, description,
    due_date, monitoring_owner, notes, status, created_by)
  VALUES (_license_id, _application_id, COALESCE(NULLIF(btrim(_category),''),'other'),
          btrim(_description), _due_date, NULLIF(btrim(_monitoring_owner),''),
          NULLIF(btrim(_notes),''), 'open', _uid)
  RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'license.condition.created','license_condition',_row.id,
          jsonb_build_object('license_id',_license_id,'after',to_jsonb(_row)));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.license_condition_set_status(
  _condition_id uuid, _status text, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('license_management','manage_conditions');
  IF _status NOT IN ('open','in_progress','satisfied','waived','breached') THEN
    RAISE EXCEPTION 'invalid condition status' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.license_conditions WHERE id = _condition_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'condition not found' USING ERRCODE='22023'; END IF;
  UPDATE public.license_conditions
     SET status = _status,
         satisfied_at = CASE WHEN _status = 'satisfied' THEN now() ELSE NULL END,
         satisfied_by = CASE WHEN _status = 'satisfied' THEN _uid ELSE NULL END,
         notes = COALESCE(NULLIF(btrim(_note),''), notes)
   WHERE id = _condition_id RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'license.condition.status_changed','license_condition',_condition_id,
          jsonb_build_object('before',jsonb_build_object('status',_prev.status),
                             'after',jsonb_build_object('status',_status),'reason',_note));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.license_condition_delete(_condition_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev record;
BEGIN
  PERFORM public.enforce_permission('license_management','manage_conditions');
  SELECT * INTO _prev FROM public.license_conditions WHERE id = _condition_id;
  IF _prev IS NULL THEN RETURN; END IF;
  DELETE FROM public.license_conditions WHERE id = _condition_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'license.condition.deleted','license_condition',_condition_id,
          jsonb_build_object('before',to_jsonb(_prev),'reason',_reason));
END; $$;

-- ---------- Entity risk rating / licensing audit ----------
CREATE OR REPLACE FUNCTION public.record_entity_risk_rating(
  _entity_id uuid, _overall_rating text, _risk_score numeric,
  _assessment_date date DEFAULT CURRENT_DATE, _risk_factors jsonb DEFAULT '[]'::jsonb,
  _mitigation_measures text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','record_camels_assessment');
  IF _overall_rating NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'invalid risk rating' USING ERRCODE='22023';
  END IF;
  IF _risk_score IS NULL OR _risk_score < 0 OR _risk_score > 100 THEN
    RAISE EXCEPTION 'risk score must be between 0 and 100' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.risk_ratings (entity_id, overall_rating, risk_score, assessment_date,
    assessor_id, risk_factors, mitigation_measures, notes)
  VALUES (_entity_id, _overall_rating, _risk_score, COALESCE(_assessment_date, CURRENT_DATE),
          _uid, COALESCE(_risk_factors,'[]'::jsonb), _mitigation_measures, _notes)
  RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'entity.risk_rating.recorded','risk_rating',_row.id,
          jsonb_build_object('entity_id',_entity_id,'after',to_jsonb(_row)));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.licensing_audit_record_determination(
  _entity_id uuid, _verdict text, _rationale text,
  _effective_date date DEFAULT CURRENT_DATE, _risk_rating_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('license_management','approve');
  IF _rationale IS NULL OR length(btrim(_rationale)) < 10 THEN
    RAISE EXCEPTION 'rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.licensing_audit_determinations (entity_id, verdict, rationale, effective_date, risk_rating_id, issued_by)
  VALUES (_entity_id, _verdict, btrim(_rationale), COALESCE(_effective_date,CURRENT_DATE), _risk_rating_id, _uid)
  RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'licensing_audit.determination.recorded','licensing_audit_determination',_row.id,
          jsonb_build_object('entity_id',_entity_id,'after',to_jsonb(_row),'justification',btrim(_rationale)));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.licensing_audit_record_risk_profile(
  _entity_id uuid, _profile_score integer, _tier text,
  _key_drivers jsonb DEFAULT '[]'::jsonb, _snapshot jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('license_management','edit');
  INSERT INTO public.licensing_audit_risk_profiles (entity_id, profile_score, tier, key_drivers, snapshot, generated_by)
  VALUES (_entity_id, _profile_score, _tier, COALESCE(_key_drivers,'[]'::jsonb), COALESCE(_snapshot,'{}'::jsonb), _uid)
  RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'licensing_audit.risk_profile.recorded','licensing_audit_risk_profile',_row.id,
          jsonb_build_object('entity_id',_entity_id,'after',to_jsonb(_row)));
  RETURN to_jsonb(_row);
END; $$;

-- ---------- Entity relationships (ownership / association state) ----------
CREATE OR REPLACE FUNCTION public.entity_relationship_save(
  _entity_id uuid, _related_entity_name text, _relationship_type text,
  _relationship_id uuid DEFAULT NULL, _related_entity_id uuid DEFAULT NULL,
  _ownership_percentage numeric DEFAULT NULL, _effective_date date DEFAULT NULL,
  _status text DEFAULT 'active', _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('license_management','edit');
  IF _related_entity_name IS NULL OR btrim(_related_entity_name) = '' THEN
    RAISE EXCEPTION 'related entity name is required' USING ERRCODE='22023';
  END IF;
  IF _ownership_percentage IS NOT NULL AND (_ownership_percentage < 0 OR _ownership_percentage > 100) THEN
    RAISE EXCEPTION 'ownership percentage must be between 0 and 100' USING ERRCODE='22023';
  END IF;
  IF _relationship_id IS NULL THEN
    INSERT INTO public.entity_relationships (entity_id, related_entity_id, related_entity_name,
      relationship_type, ownership_percentage, effective_date, status, notes)
    VALUES (_entity_id, _related_entity_id, btrim(_related_entity_name),
            COALESCE(NULLIF(_relationship_type,''),'associate'), _ownership_percentage,
            _effective_date, COALESCE(_status,'active'), _notes)
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _prev FROM public.entity_relationships WHERE id = _relationship_id FOR UPDATE;
    IF _prev IS NULL THEN RAISE EXCEPTION 'relationship not found' USING ERRCODE='22023'; END IF;
    UPDATE public.entity_relationships
       SET related_entity_id = _related_entity_id,
           related_entity_name = btrim(_related_entity_name),
           relationship_type = COALESCE(NULLIF(_relationship_type,''),'associate'),
           ownership_percentage = _ownership_percentage,
           effective_date = _effective_date,
           status = COALESCE(_status,'active'),
           notes = _notes
     WHERE id = _relationship_id RETURNING * INTO _row;
  END IF;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, CASE WHEN _relationship_id IS NULL THEN 'entity.relationship.created' ELSE 'entity.relationship.updated' END,
          'entity_relationship', _row.id,
          jsonb_build_object('entity_id',_entity_id,'before',to_jsonb(_prev),'after',to_jsonb(_row)));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.entity_relationship_delete(_relationship_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev record;
BEGIN
  PERFORM public.enforce_permission('license_management','edit');
  SELECT * INTO _prev FROM public.entity_relationships WHERE id = _relationship_id;
  IF _prev IS NULL THEN RETURN; END IF;
  DELETE FROM public.entity_relationships WHERE id = _relationship_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'entity.relationship.deleted','entity_relationship',_relationship_id,
          jsonb_build_object('before',to_jsonb(_prev),'reason',_reason));
END; $$;

-- ---------- Twin Peaks coordination ----------
CREATE OR REPLACE FUNCTION public.twinpeaks_record_clearance(
  _application_id uuid, _regulator_role text, _status text,
  _conditions text[] DEFAULT '{}'::text[], _rationale text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('coordination','update');
  IF _status NOT IN ('pending','cleared','cleared_with_conditions','objected') THEN
    RAISE EXCEPTION 'invalid clearance status' USING ERRCODE='22023';
  END IF;
  IF _status <> 'pending' AND (_rationale IS NULL OR length(btrim(_rationale)) < 10) THEN
    RAISE EXCEPTION 'clearance rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.twinpeaks_clearances (application_id, regulator_role, status, conditions, rationale, recorded_by, recorded_at)
  VALUES (_application_id, _regulator_role, _status, COALESCE(_conditions,'{}'::text[]), _rationale, _uid, now())
  ON CONFLICT (application_id, regulator_role) DO UPDATE
     SET status = EXCLUDED.status, conditions = EXCLUDED.conditions,
         rationale = EXCLUDED.rationale, recorded_by = EXCLUDED.recorded_by, recorded_at = now()
  RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'coordination.twinpeaks.clearance_recorded','twinpeaks_clearance',_row.id,
          jsonb_build_object('application_id',_application_id,'regulator_role',_regulator_role,
                             'after',jsonb_build_object('status',_status),'justification',_rationale));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.twinpeaks_raise_disagreement(_application_id uuid, _description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('coordination','update');
  IF _description IS NULL OR length(btrim(_description)) < 10 THEN
    RAISE EXCEPTION 'disagreement description must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.twinpeaks_disagreements (application_id, raised_by, description, status)
  VALUES (_application_id, _uid, btrim(_description), 'open') RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'coordination.twinpeaks.disagreement_raised','twinpeaks_disagreement',_row.id,
          jsonb_build_object('application_id',_application_id,'after',jsonb_build_object('status','open')));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.twinpeaks_resolve_disagreement(_disagreement_id uuid, _resolution text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('coordination','update');
  IF _resolution IS NULL OR length(btrim(_resolution)) < 10 THEN
    RAISE EXCEPTION 'resolution must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.twinpeaks_disagreements WHERE id = _disagreement_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'disagreement not found' USING ERRCODE='22023'; END IF;
  UPDATE public.twinpeaks_disagreements
     SET status = 'resolved', resolution = btrim(_resolution), resolved_by = _uid, resolved_at = now()
   WHERE id = _disagreement_id RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'coordination.twinpeaks.disagreement_resolved','twinpeaks_disagreement',_disagreement_id,
          jsonb_build_object('before',jsonb_build_object('status',_prev.status),
                             'after',jsonb_build_object('status','resolved'),'justification',btrim(_resolution)));
  RETURN to_jsonb(_row);
END; $$;

-- ---------- Inspection findings / escalation ----------
CREATE OR REPLACE FUNCTION public.inspection_finding_save(
  _inspection_id uuid, _category text, _severity text, _description text,
  _finding_id uuid DEFAULT NULL, _recommended_action text DEFAULT NULL,
  _follow_up_owner text DEFAULT NULL, _follow_up_due date DEFAULT NULL,
  _status text DEFAULT 'open'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('inspection_management','edit');
  IF _description IS NULL OR length(btrim(_description)) < 5 THEN
    RAISE EXCEPTION 'finding description is required' USING ERRCODE='22023';
  END IF;
  IF _severity NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'invalid severity' USING ERRCODE='22023';
  END IF;
  IF _finding_id IS NULL THEN
    INSERT INTO public.inspection_findings (inspection_id, category, severity, description,
      recommended_action, follow_up_owner, follow_up_due, status, created_by)
    VALUES (_inspection_id, _category, _severity, btrim(_description), _recommended_action,
            _follow_up_owner, _follow_up_due, COALESCE(_status,'open'), _uid)
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _prev FROM public.inspection_findings WHERE id = _finding_id FOR UPDATE;
    IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
    UPDATE public.inspection_findings
       SET category = _category, severity = _severity, description = btrim(_description),
           recommended_action = _recommended_action, follow_up_owner = _follow_up_owner,
           follow_up_due = _follow_up_due, status = COALESCE(_status, status)
     WHERE id = _finding_id RETURNING * INTO _row;
  END IF;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, CASE WHEN _finding_id IS NULL THEN 'inspection.finding.created' ELSE 'inspection.finding.updated' END,
          'inspection_finding', _row.id,
          jsonb_build_object('inspection_id',_inspection_id,'before',to_jsonb(_prev),'after',to_jsonb(_row)));
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.inspection_finding_escalate(
  _finding_id uuid, _entity_id uuid, _enforcement_type text, _rationale text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _finding record; _case_id uuid;
BEGIN
  PERFORM public.enforce_permission('inspection_management','workflow_action');
  PERFORM public.enforce_permission('enforcement_management','create');
  IF _rationale IS NULL OR length(btrim(_rationale)) < 10 THEN
    RAISE EXCEPTION 'escalation rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _finding FROM public.inspection_findings WHERE id = _finding_id FOR UPDATE;
  IF _finding IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _finding.escalated_enforcement_id IS NOT NULL THEN
    RAISE EXCEPTION 'finding already escalated' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.enforcement_actions (entity_id, enforcement_type, description, findings,
    opened_by, source_type, source_reference_id, status)
  VALUES (_entity_id, COALESCE(NULLIF(_enforcement_type,''),'warning'),
          btrim(_rationale), _finding.description, _uid, 'inspection_finding', _finding_id, 'open')
  RETURNING id INTO _case_id;
  INSERT INTO public.enforcement_case_events (case_id, event_type, actor_id, note, detail)
  VALUES (_case_id,'opened_from_inspection_finding',_uid,btrim(_rationale),
          jsonb_build_object('finding_id',_finding_id,'inspection_id',_finding.inspection_id));
  UPDATE public.inspection_findings
     SET escalated_enforcement_id = _case_id, escalated_at = now(), escalated_by = _uid, status = 'escalated'
   WHERE id = _finding_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'inspection.finding.escalated','inspection_finding',_finding_id,
          jsonb_build_object('enforcement_case_id',_case_id,'entity_id',_entity_id,
                             'justification',btrim(_rationale)));
  RETURN jsonb_build_object('enforcement_case_id',_case_id,'finding_id',_finding_id);
END; $$;

-- ---------- Supervisory breach -> enforcement ----------
CREATE OR REPLACE FUNCTION public.supervisory_breach_issue_enforcement(
  _entity_id uuid, _breach_ids uuid[], _enforcement_type text, _rationale text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _case_id uuid; _summary text;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','initiate_supervisory_action');
  PERFORM public.enforce_permission('enforcement_management','create');
  IF _rationale IS NULL OR length(btrim(_rationale)) < 10 THEN
    RAISE EXCEPTION 'rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  IF _breach_ids IS NULL OR array_length(_breach_ids,1) IS NULL THEN
    RAISE EXCEPTION 'at least one breach must be cited' USING ERRCODE='22023';
  END IF;
  SELECT string_agg(metric_key || ' ' || COALESCE(comparator,'') || ' ' ||
                    COALESCE(threshold_value::text,'') || ' (actual ' || COALESCE(value::text,'n/a') || ')', '; ')
    INTO _summary
    FROM public.return_threshold_breaches WHERE id = ANY(_breach_ids);
  IF _summary IS NULL THEN RAISE EXCEPTION 'cited breaches not found' USING ERRCODE='22023'; END IF;
  INSERT INTO public.enforcement_actions (entity_id, enforcement_type, description, findings,
    opened_by, source_type, source_reference_id, status)
  VALUES (_entity_id, COALESCE(NULLIF(_enforcement_type,''),'warning'), btrim(_rationale),
          _summary, _uid, 'return_threshold_breach', _breach_ids[1], 'open')
  RETURNING id INTO _case_id;
  INSERT INTO public.enforcement_case_events (case_id, event_type, actor_id, note, detail)
  VALUES (_case_id,'opened_from_threshold_breach',_uid,btrim(_rationale),
          jsonb_build_object('breach_ids',to_jsonb(_breach_ids)));
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'supervision.breach.enforcement_issued','enforcement_action',_case_id,
          jsonb_build_object('entity_id',_entity_id,'breach_ids',to_jsonb(_breach_ids),
                             'justification',btrim(_rationale)));
  RETURN jsonb_build_object('enforcement_case_id',_case_id);
END; $$;

-- ---------- Execute grants: governed, authenticated-only ----------
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure::text
            FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN (
                'fp_appeal_file','fp_appeal_assign_committee','fp_appeal_decide','fp_appeal_withdraw',
                'license_condition_create','license_condition_set_status','license_condition_delete',
                'record_entity_risk_rating','licensing_audit_record_determination',
                'licensing_audit_record_risk_profile','entity_relationship_save','entity_relationship_delete',
                'twinpeaks_record_clearance','twinpeaks_raise_disagreement','twinpeaks_resolve_disagreement',
                'inspection_finding_save','inspection_finding_escalate','supervisory_breach_issue_enforcement')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ---------- Governed-write-only tables: withdraw direct browser DML ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fp_appeals','license_conditions','licensing_audit_determinations','licensing_audit_risk_profiles',
    'risk_ratings','entity_relationships','twinpeaks_clearances','twinpeaks_disagreements','inspection_findings'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;