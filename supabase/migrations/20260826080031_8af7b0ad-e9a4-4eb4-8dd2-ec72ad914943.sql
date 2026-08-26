-- =====================================================================
-- PART D: governed workflow lifecycle (retire / hard delete)
-- =====================================================================
ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_by uuid,
  ADD COLUMN IF NOT EXISTS retirement_reason text;

REVOKE DELETE ON public.approval_workflows FROM authenticated;
REVOKE DELETE ON public.approval_workflows FROM anon;

CREATE OR REPLACE FUNCTION public.workflow_admin_guard()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to manage workflows' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'admin')) THEN
    RAISE EXCEPTION 'You are not authorised to change workflow definitions' USING ERRCODE='42501';
  END IF;
  RETURN v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.workflow_retire(_workflow_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := public.workflow_admin_guard(); w public.approval_workflows;
BEGIN
  IF coalesce(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'Record why this workflow is being retired' USING ERRCODE='22023';
  END IF;
  SELECT * INTO w FROM public.approval_workflows WHERE id=_workflow_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Workflow not found' USING ERRCODE='P0002'; END IF;
  IF w.retired_at IS NOT NULL THEN
    RETURN jsonb_build_object('workflow_id',w.id,'already_retired',true,'retired_at',w.retired_at);
  END IF;
  UPDATE public.approval_workflows
     SET is_active=false, retired_at=now(), retired_by=v_uid,
         retirement_reason=btrim(_reason), updated_at=now()
   WHERE id=_workflow_id RETURNING * INTO w;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid,'workflow.retired','approval_workflow',_workflow_id,
          jsonb_build_object('name',w.name,'entity_type',w.entity_type,'reason',w.retirement_reason,
            'instances',(SELECT count(*) FROM public.workflow_instances WHERE workflow_id=_workflow_id)));
  RETURN jsonb_build_object('workflow_id',w.id,'retired_at',w.retired_at,'reason',w.retirement_reason);
END $$;

CREATE OR REPLACE FUNCTION public.workflow_hard_delete(_workflow_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := public.workflow_admin_guard(); w public.approval_workflows;
        v_inst int; v_acts int;
BEGIN
  SELECT * INTO w FROM public.approval_workflows WHERE id=_workflow_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Workflow not found' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO v_inst FROM public.workflow_instances WHERE workflow_id=_workflow_id;
  SELECT count(*) INTO v_acts FROM public.approval_actions aa
    JOIN public.workflow_instances i ON i.id=aa.workflow_instance_id
   WHERE i.workflow_id=_workflow_id;
  IF v_inst > 0 OR v_acts > 0 THEN
    RAISE EXCEPTION 'WORKFLOW_HAS_HISTORY_USE_RETIRE' USING ERRCODE='23503',
      DETAIL = format('instances=%s, approval_actions=%s', v_inst, v_acts);
  END IF;
  DELETE FROM public.approval_step_actions WHERE step_id IN
    (SELECT id FROM public.approval_steps WHERE workflow_id=_workflow_id);
  DELETE FROM public.approval_steps WHERE workflow_id=_workflow_id;
  UPDATE public.approval_workflows SET current_published_version_id=NULL, draft_version_id=NULL WHERE id=_workflow_id;
  DELETE FROM public.approval_workflow_versions WHERE workflow_id=_workflow_id;
  DELETE FROM public.approval_workflows WHERE id=_workflow_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid,'workflow.hard_deleted','approval_workflow',_workflow_id,
          jsonb_build_object('name',w.name,'entity_type',w.entity_type));
  RETURN jsonb_build_object('workflow_id',_workflow_id,'deleted',true);
END $$;

GRANT EXECUTE ON FUNCTION public.workflow_retire(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_hard_delete(uuid) TO authenticated;

-- =====================================================================
-- PART G: canonical Market Conduct — Consumer Complaint workflow
-- =====================================================================
DO $$
DECLARE v_wf uuid; v_ver uuid;
BEGIN
  SELECT id INTO v_wf FROM public.approval_workflows
   WHERE entity_type='complaint' AND name='Market Conduct — Consumer Complaint';
  IF v_wf IS NULL THEN
    INSERT INTO public.approval_workflows (name, description, license_type, entity_type, is_active)
    VALUES ('Market Conduct — Consumer Complaint',
            'Canonical centralized workflow for consumer complaint casework. Business decisions remain owned by the Market Conduct domain operations; this workflow routes work, shows the current phase, assignment, SLA and history.',
            'all','complaint',true)
    RETURNING id INTO v_wf;

    INSERT INTO public.approval_steps
      (workflow_id, step_order, name, step_key, description, approver_role, approver_role_id, step_type,
       is_required, is_start, is_terminal, complainant_visible, licensee_visible, public_label, sla_hours)
    VALUES
      (v_wf,1,'Jurisdiction Assessment','mc_jurisdiction_assessment','Confirm whether the complaint falls within the regulator''s remit. Authority: complaint_jurisdiction_decide.','analyst','0f4e0251-cc14-40fc-8e37-92d161064f97','approval',true,true,false,true,false,'Under jurisdiction assessment',120),
      (v_wf,2,'Triage Review','mc_triage_review','Confirm the risk-based triage recommendation. Authority: complaint_triage_confirm.','supervisor','37f867b4-8740-4671-95bb-6fffbf529848','approval',true,false,false,true,false,'Under assessment',72),
      (v_wf,3,'Investigation Setup','mc_investigation_setup','Open the investigation and obtain plan approval. Authority: complaint investigation open / plan operations.','analyst','0f4e0251-cc14-40fc-8e37-92d161064f97','approval',true,false,false,true,false,'Under assessment',120),
      (v_wf,4,'Investigation Casework','mc_investigation_casework','Allegation assessment, evidence, information requests and representations. Blockers are shown as work states, not separate phases.','analyst','0f4e0251-cc14-40fc-8e37-92d161064f97','review',true,false,false,true,true,'Under investigation',720),
      (v_wf,5,'Outcome Review','mc_outcome_review','Outcome and redress determination (owned by MC-04).','supervisor','37f867b4-8740-4671-95bb-6fffbf529848','approval',true,false,false,true,false,'Under review',168),
      (v_wf,6,'Closure & QA','mc_closure_qa','Quality assurance before formal closure (owned by MC-04).','supervisor','37f867b4-8740-4671-95bb-6fffbf529848','approval',true,false,false,true,false,'Finalising',120),
      (v_wf,7,'Closed','mc_closed','Complaint formally closed.','supervisor','37f867b4-8740-4671-95bb-6fffbf529848','approval',false,false,true,true,false,'Closed',NULL),
      (v_wf,8,'Referred / Outside Jurisdiction','mc_referred_pending_outcome','Holding phase for referred or out-of-jurisdiction complaints pending formal outcome policy (MC-04).','supervisor','37f867b4-8740-4671-95bb-6fffbf529848','approval',false,false,false,true,false,'Referred',NULL);

    INSERT INTO public.approval_workflow_versions (workflow_id, version_number, status, snapshot, notes, published_at)
    VALUES (v_wf, 1, 'published',
      jsonb_build_object('steps',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.step_order)
                                    FROM public.approval_steps s WHERE s.workflow_id=v_wf)),
      'Initial published version — MC-01/MC-02/MC-03 domain convergence.', now())
    RETURNING id INTO v_ver;

    UPDATE public.approval_workflows SET current_published_version_id=v_ver WHERE id=v_wf;
  END IF;
END $$;

-- =====================================================================
-- PART J/K: domain event -> workflow transition bridge
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mc_complaint_workflow_definition()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.approval_workflows
   WHERE entity_type='complaint' AND name='Market Conduct — Consumer Complaint'
     AND retired_at IS NULL LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mc_complaint_workflow_sync(_complaint_id uuid, _event text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_wf uuid := public.mc_complaint_workflow_definition();
  v_target_key text;
  v_step public.approval_steps;
  v_inst public.workflow_instances;
  v_cur public.approval_steps;
  v_ver uuid;
BEGIN
  IF v_wf IS NULL THEN RETURN jsonb_build_object('synced',false,'reason','no_published_workflow'); END IF;

  v_target_key := CASE _event
    WHEN 'complaint.created'                                   THEN 'mc_jurisdiction_assessment'
    WHEN 'complaint.jurisdiction.information_requested'         THEN 'mc_jurisdiction_assessment'
    WHEN 'complaint.jurisdiction.accepted'                      THEN 'mc_triage_review'
    WHEN 'complaint.jurisdiction.partially_accepted'            THEN 'mc_triage_review'
    WHEN 'complaint.jurisdiction.referred'                      THEN 'mc_referred_pending_outcome'
    WHEN 'complaint.jurisdiction.out_of_jurisdiction'           THEN 'mc_referred_pending_outcome'
    WHEN 'complaint.triage.confirmed'                           THEN 'mc_investigation_setup'
    WHEN 'complaint.investigation.plan_approved'                THEN 'mc_investigation_casework'
    WHEN 'complaint.investigation.ready_for_outcome_review'     THEN 'mc_outcome_review'
    ELSE NULL END;
  IF v_target_key IS NULL THEN RETURN jsonb_build_object('synced',false,'reason','unmapped_event'); END IF;

  SELECT * INTO v_step FROM public.approval_steps WHERE workflow_id=v_wf AND step_key=v_target_key;
  IF v_step.id IS NULL THEN RETURN jsonb_build_object('synced',false,'reason','missing_step'); END IF;

  SELECT current_published_version_id INTO v_ver FROM public.approval_workflows WHERE id=v_wf;

  -- one canonical active instance per complaint, concurrency-safe
  SELECT * INTO v_inst FROM public.workflow_instances
   WHERE workflow_id=v_wf AND entity_type='complaint' AND entity_id=_complaint_id
   ORDER BY started_at LIMIT 1 FOR UPDATE;

  IF v_inst.id IS NULL THEN
    INSERT INTO public.workflow_instances
      (workflow_id, entity_type, entity_id, current_step_id, current_step_key,
       status, workflow_version_id, assigned_role)
    VALUES (v_wf,'complaint',_complaint_id,v_step.id,v_step.step_key,'active',v_ver,v_step.approver_role::text)
    RETURNING * INTO v_inst;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
    VALUES (auth.uid(),'complaint.workflow.instance_opened','complaint',_complaint_id,
            jsonb_build_object('workflow_id',v_wf,'instance_id',v_inst.id,'step',v_step.step_key,'event',_event));
    RETURN jsonb_build_object('synced',true,'created',true,'step',v_step.step_key);
  END IF;

  IF v_inst.current_step_key = v_target_key THEN
    RETURN jsonb_build_object('synced',true,'unchanged',true,'step',v_target_key);
  END IF;

  SELECT * INTO v_cur FROM public.approval_steps WHERE id=v_inst.current_step_id;
  -- never regress, and never move out of the referred holding phase automatically
  IF v_cur.id IS NOT NULL AND v_cur.step_key='mc_referred_pending_outcome' THEN
    RETURN jsonb_build_object('synced',false,'reason','referred_holding_phase');
  END IF;
  IF v_cur.id IS NOT NULL AND v_step.step_key <> 'mc_referred_pending_outcome'
     AND v_step.step_order <= v_cur.step_order THEN
    RETURN jsonb_build_object('synced',false,'reason','no_backward_transition',
                              'current',v_cur.step_key,'requested',v_target_key);
  END IF;

  UPDATE public.workflow_instances
     SET current_step_id=v_step.id, current_step_key=v_step.step_key,
         assigned_role=v_step.approver_role::text,
         status = CASE WHEN v_step.is_terminal THEN 'completed' ELSE 'active' END,
         completed_at = CASE WHEN v_step.is_terminal THEN now() ELSE NULL END,
         due_at = CASE WHEN v_step.sla_hours IS NULL THEN NULL
                       ELSE now() + make_interval(hours => v_step.sla_hours) END,
         updated_at=now()
   WHERE id=v_inst.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(),'complaint.workflow.advanced','complaint',_complaint_id,
          jsonb_build_object('step',v_cur.step_key),
          jsonb_build_object('step',v_step.step_key,'event',_event,'instance_id',v_inst.id));

  RETURN jsonb_build_object('synced',true,'from',v_cur.step_key,'to',v_step.step_key);
END $$;

GRANT EXECUTE ON FUNCTION public.mc_complaint_workflow_sync(uuid,text) TO authenticated, service_role;

-- ---- triggers: domain state is authoritative, workflow follows ----
CREATE OR REPLACE FUNCTION public.trg_mc_complaint_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.mc_complaint_workflow_sync(NEW.id,'complaint.created');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mc_complaint_created_workflow ON public.complaints;
CREATE TRIGGER mc_complaint_created_workflow AFTER INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_complaint_created();

CREATE OR REPLACE FUNCTION public.trg_mc_jurisdiction_decided()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_event text;
BEGIN
  IF NEW.decision_outcome IS NULL
     OR (TG_OP='UPDATE' AND coalesce(OLD.decision_outcome,'') = coalesce(NEW.decision_outcome,'')) THEN
    RETURN NEW;
  END IF;
  v_event := CASE upper(NEW.decision_outcome)
    WHEN 'ACCEPTED' THEN 'complaint.jurisdiction.accepted'
    WHEN 'PARTIALLY_ACCEPTED' THEN 'complaint.jurisdiction.partially_accepted'
    WHEN 'REFERRED' THEN 'complaint.jurisdiction.referred'
    WHEN 'OUT_OF_JURISDICTION' THEN 'complaint.jurisdiction.out_of_jurisdiction'
    ELSE NULL END;
  IF v_event IS NOT NULL THEN PERFORM public.mc_complaint_workflow_sync(NEW.complaint_id, v_event); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mc_jurisdiction_decided_workflow ON public.complaint_jurisdiction_assessments;
CREATE TRIGGER mc_jurisdiction_decided_workflow
AFTER INSERT OR UPDATE OF decision_outcome ON public.complaint_jurisdiction_assessments
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_jurisdiction_decided();

CREATE OR REPLACE FUNCTION public.trg_mc_triage_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.complaint_triage_gate_ok(NEW.id) THEN
    PERFORM public.mc_complaint_workflow_sync(NEW.id,'complaint.triage.confirmed');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mc_triage_confirmed_workflow ON public.complaints;
CREATE TRIGGER mc_triage_confirmed_workflow AFTER UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_triage_confirmed();

CREATE OR REPLACE FUNCTION public.trg_mc_plan_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status='APPROVED' AND NEW.is_current
     AND (TG_OP='INSERT' OR coalesce(OLD.status,'') <> 'APPROVED') THEN
    PERFORM public.mc_complaint_workflow_sync(NEW.complaint_id,'complaint.investigation.plan_approved');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mc_plan_approved_workflow ON public.complaint_investigation_plans;
CREATE TRIGGER mc_plan_approved_workflow
AFTER INSERT OR UPDATE OF status ON public.complaint_investigation_plans
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_plan_approved();

-- readiness-driven advance to Outcome Review
CREATE OR REPLACE FUNCTION public.mc_complaint_readiness_sync(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  r := public.complaint_investigation_readiness(_complaint_id);
  IF r->>'readiness' = 'READY_FOR_OUTCOME_REVIEW' THEN
    RETURN public.mc_complaint_workflow_sync(_complaint_id,'complaint.investigation.ready_for_outcome_review');
  END IF;
  RETURN jsonb_build_object('synced',false,'reason','not_ready','blockers',r->'blockers');
END $$;
GRANT EXECUTE ON FUNCTION public.mc_complaint_readiness_sync(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_mc_readiness_recheck()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cid uuid := coalesce(NEW.complaint_id, OLD.complaint_id);
BEGIN
  IF v_cid IS NOT NULL THEN PERFORM public.mc_complaint_readiness_sync(v_cid); END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS mc_readiness_recheck ON public.complaint_allegations;
CREATE TRIGGER mc_readiness_recheck AFTER INSERT OR UPDATE OR DELETE ON public.complaint_allegations
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_readiness_recheck();
DROP TRIGGER IF EXISTS mc_readiness_recheck ON public.complaint_investigation_tasks;
CREATE TRIGGER mc_readiness_recheck AFTER INSERT OR UPDATE OR DELETE ON public.complaint_investigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_readiness_recheck();
DROP TRIGGER IF EXISTS mc_readiness_recheck ON public.complaint_rfis;
CREATE TRIGGER mc_readiness_recheck AFTER INSERT OR UPDATE OR DELETE ON public.complaint_rfis
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_readiness_recheck();
DROP TRIGGER IF EXISTS mc_readiness_recheck ON public.complaint_representations;
CREATE TRIGGER mc_readiness_recheck AFTER INSERT OR UPDATE OR DELETE ON public.complaint_representations
FOR EACH ROW EXECUTE FUNCTION public.trg_mc_readiness_recheck();

-- =====================================================================
-- PART O: current-phase read model
-- =====================================================================
CREATE OR REPLACE FUNCTION public.complaint_workflow_state(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_wf uuid := public.mc_complaint_workflow_definition();
        i public.workflow_instances; s public.approval_steps; nx public.approval_steps;
        r jsonb; g jsonb; v_block text[] := '{}'; v_action text;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO i FROM public.workflow_instances
   WHERE workflow_id=v_wf AND entity_type='complaint' AND entity_id=_complaint_id
   ORDER BY started_at LIMIT 1;
  IF i.id IS NULL THEN RETURN jsonb_build_object('has_instance',false); END IF;
  SELECT * INTO s FROM public.approval_steps WHERE id=i.current_step_id;
  SELECT * INTO nx FROM public.approval_steps
   WHERE workflow_id=v_wf AND step_order > s.step_order AND step_key <> 'mc_referred_pending_outcome'
   ORDER BY step_order LIMIT 1;

  IF s.step_key='mc_jurisdiction_assessment' THEN
    v_action := 'Open jurisdiction assessment';
    IF EXISTS (SELECT 1 FROM public.complaint_jurisdiction_info_requests
                WHERE complaint_id=_complaint_id AND responded_at IS NULL) THEN
      v_block := v_block || ARRAY['Waiting for jurisdiction information from the complainant'];
    END IF;
  ELSIF s.step_key='mc_triage_review' THEN
    v_action := 'Review triage recommendation';
  ELSIF s.step_key='mc_investigation_setup' THEN
    v_action := 'Prepare / review investigation plan';
    g := public.complaint_investigation_gate(_complaint_id);
    IF NOT (g->>'ok')::boolean THEN
      v_block := v_block || ARRAY(SELECT jsonb_array_elements_text(g->'blockers'));
    END IF;
  ELSIF s.step_key='mc_investigation_casework' THEN
    v_action := 'Continue investigation';
    r := public.complaint_investigation_readiness(_complaint_id);
    IF r->>'readiness' <> 'READY_FOR_OUTCOME_REVIEW' THEN
      v_block := v_block || ARRAY(SELECT jsonb_array_elements_text(r->'blockers'));
    END IF;
  ELSIF s.step_key='mc_outcome_review' THEN
    v_action := 'Record complaint outcome (MC-04)';
  ELSIF s.step_key='mc_referred_pending_outcome' THEN
    v_action := 'Record referral outcome (MC-04)';
  ELSE
    v_action := 'No action required';
  END IF;

  RETURN jsonb_build_object(
    'has_instance', true,
    'workflow_id', v_wf,
    'instance_id', i.id,
    'workflow_version_id', i.workflow_version_id,
    'status', i.status,
    'phase_key', s.step_key,
    'phase', s.name,
    'phase_description', s.description,
    'public_label', s.public_label,
    'with_whom', i.assigned_role,
    'assigned_user_id', i.assigned_user_id,
    'started_at', i.started_at,
    'phase_updated_at', i.updated_at,
    'operational_target', i.due_at,
    'sla_status', i.sla_status,
    'blockers', to_jsonb(v_block),
    'next_action', v_action,
    'what_happens_next', nx.name,
    'is_terminal', coalesce(s.is_terminal,false));
END $$;
GRANT EXECUTE ON FUNCTION public.complaint_workflow_state(uuid) TO authenticated;

-- =====================================================================
-- PART E: retire the historical 12-step Complaint Management Workflow
-- =====================================================================
UPDATE public.approval_workflows
   SET is_active=false, retired_at=now(),
       retirement_reason='Superseded by canonical Market Conduct — Consumer Complaint workflow after MC-01/MC-02/MC-03 domain convergence.',
       updated_at=now()
 WHERE entity_type='complaint' AND name='Complaint Management Workflow' AND retired_at IS NULL;

INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
SELECT NULL,'workflow.retired','approval_workflow',w.id,
       jsonb_build_object('name',w.name,'reason',w.retirement_reason,
         'instances',(SELECT count(*) FROM public.workflow_instances WHERE workflow_id=w.id),
         'actor','system migration')
  FROM public.approval_workflows w
 WHERE w.entity_type='complaint' AND w.name='Complaint Management Workflow';