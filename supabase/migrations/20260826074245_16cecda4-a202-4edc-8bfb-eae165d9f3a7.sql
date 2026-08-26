
-- ---------- governed internal note (replaces direct browser insert) ----------
CREATE OR REPLACE FUNCTION public.complaint_note_add(_complaint_id uuid, _body text, _subject text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); n public.complaint_correspondence;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'edit');
  IF coalesce(length(btrim(coalesce(_body,''))),0) = 0 THEN
    RAISE EXCEPTION 'Write the note before saving' USING ERRCODE='22023'; END IF;
  INSERT INTO public.complaint_correspondence (complaint_id, direction, subject, body, author_id)
  VALUES (_complaint_id, 'internal_note', nullif(btrim(coalesce(_subject,'')),''), btrim(_body), v_uid)
  RETURNING * INTO n;
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.investigation.note_added','complaint',_complaint_id,
          jsonb_build_object('correspondence_id',n.id));
  RETURN to_jsonb(n);
END; $$;

-- ---------- governed investigation task save ----------
CREATE OR REPLACE FUNCTION public.complaint_investigation_task_save(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); t public.complaint_investigation_tasks;
        v_id uuid := nullif(_payload->>'id','')::uuid; v_complaint uuid := nullif(_payload->>'complaint_id','')::uuid;
        v_status text := nullif(upper(btrim(coalesce(_payload->>'status',''))),'');
BEGIN
  IF v_id IS NOT NULL THEN
    SELECT * INTO t FROM public.complaint_investigation_tasks WHERE id=v_id FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE='P0002'; END IF;
    v_complaint := t.complaint_id;
  END IF;
  IF v_complaint IS NULL THEN RAISE EXCEPTION 'Complaint is required' USING ERRCODE='22023'; END IF;
  PERFORM public.mc03_guard(v_complaint,'investigate');

  IF v_status IS NOT NULL AND v_status NOT IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid task state' USING ERRCODE='22023'; END IF;

  IF v_id IS NULL THEN
    IF coalesce(length(btrim(coalesce(_payload->>'title',''))),0) = 0 THEN
      RAISE EXCEPTION 'Describe the work item' USING ERRCODE='22023'; END IF;
    INSERT INTO public.complaint_investigation_tasks
      (complaint_id, title, description, due_date, owner_id, created_by, status,
       plan_id, allegation_id, rfi_id, representation_id, task_kind, priority, is_mandatory)
    VALUES (v_complaint, btrim(_payload->>'title'), _payload->>'description',
      nullif(_payload->>'due_date','')::date, coalesce(nullif(_payload->>'owner_id','')::uuid, v_uid), v_uid,
      coalesce(v_status,'NOT_STARTED'),
      nullif(_payload->>'plan_id','')::uuid, nullif(_payload->>'allegation_id','')::uuid,
      nullif(_payload->>'rfi_id','')::uuid, nullif(_payload->>'representation_id','')::uuid,
      coalesce(nullif(_payload->>'task_kind',''),'GENERAL'),
      coalesce(nullif(_payload->>'priority',''),'NORMAL'),
      coalesce((_payload->>'is_mandatory')::boolean,false))
    RETURNING * INTO t;
  ELSE
    IF (_payload->>'expected_row_version') IS NOT NULL
       AND (_payload->>'expected_row_version')::int <> t.row_version THEN
      RAISE EXCEPTION 'This task has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
    UPDATE public.complaint_investigation_tasks SET
      title = COALESCE(nullif(btrim(coalesce(_payload->>'title','')),''), title),
      description = COALESCE(_payload->>'description', description),
      due_date = COALESCE(nullif(_payload->>'due_date','')::date, due_date),
      owner_id = COALESCE(nullif(_payload->>'owner_id','')::uuid, owner_id),
      status = COALESCE(v_status, status),
      blocked_reason = COALESCE(_payload->>'blocked_reason', blocked_reason),
      completion_note = COALESCE(_payload->>'completion_note', completion_note),
      priority = COALESCE(nullif(_payload->>'priority',''), priority),
      is_mandatory = COALESCE((_payload->>'is_mandatory')::boolean, is_mandatory),
      allegation_id = COALESCE(nullif(_payload->>'allegation_id','')::uuid, allegation_id),
      completed_at = CASE WHEN v_status='COMPLETED' THEN now() ELSE completed_at END,
      completed_by = CASE WHEN v_status='COMPLETED' THEN v_uid ELSE completed_by END,
      row_version = row_version + 1, updated_at = now()
    WHERE id=v_id RETURNING * INTO t;
  END IF;
  RETURN to_jsonb(t);
END; $$;

-- ---------- readiness ----------
CREATE OR REPLACE FUNCTION public.complaint_investigation_readiness(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.complaints; g jsonb; v_blockers text[] := '{}'; p public.complaint_investigation_plans;
        v_alleg int; v_unassessed int; v_open_rfi int; v_open_rep int; v_tasks int;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  g := public.complaint_investigation_gate(_complaint_id);
  IF NOT (g->>'ok')::boolean THEN
    v_blockers := v_blockers || ARRAY(SELECT jsonb_array_elements_text(g->'blockers'));
  END IF;
  IF c.status <> 'under_investigation' THEN
    v_blockers := v_blockers || 'The investigation has not been opened';
  END IF;
  SELECT * INTO p FROM public.complaint_investigation_plans WHERE complaint_id=_complaint_id AND is_current;
  IF p.id IS NULL THEN v_blockers := v_blockers || 'No current investigation plan exists';
  ELSIF p.status = 'DRAFT' THEN v_blockers := v_blockers || 'The investigation plan is still in draft';
  END IF;

  SELECT count(*) FILTER (WHERE jurisdiction_scope <> 'OUT_OF_SCOPE'),
         count(*) FILTER (WHERE jurisdiction_scope <> 'OUT_OF_SCOPE' AND assessment_outcome IS NULL)
    INTO v_alleg, v_unassessed
    FROM public.complaint_allegations WHERE complaint_id=_complaint_id;
  IF coalesce(v_alleg,0) = 0 THEN
    v_blockers := v_blockers || 'No allegations have been recorded';
  ELSIF coalesce(v_unassessed,0) > 0 THEN
    v_blockers := v_blockers || (v_unassessed::text || ' allegation(s) still await an assessment outcome');
  END IF;

  SELECT count(*) INTO v_open_rfi FROM public.complaint_rfis
   WHERE complaint_id=_complaint_id AND status NOT IN ('closed','cancelled');
  IF coalesce(v_open_rfi,0) > 0 THEN
    v_blockers := v_blockers || (v_open_rfi::text || ' information request(s) remain open'); END IF;

  SELECT count(*) INTO v_open_rep FROM public.complaint_representations
   WHERE complaint_id=_complaint_id AND status NOT IN ('CLOSED','WITHDRAWN','ACCEPTED_FOR_CONSIDERATION');
  IF coalesce(v_open_rep,0) > 0 THEN
    v_blockers := v_blockers || (v_open_rep::text || ' representation window(s) remain open'); END IF;

  SELECT count(*) INTO v_tasks FROM public.complaint_investigation_tasks
   WHERE complaint_id=_complaint_id AND is_mandatory AND coalesce(status,'') NOT IN ('COMPLETED','CANCELLED','completed');
  IF coalesce(v_tasks,0) > 0 THEN
    v_blockers := v_blockers || (v_tasks::text || ' mandatory work item(s) are incomplete'); END IF;

  RETURN jsonb_build_object(
    'complaint_id', _complaint_id,
    'readiness', CASE WHEN array_length(v_blockers,1) IS NULL THEN 'READY_FOR_OUTCOME_REVIEW' ELSE 'NOT_READY' END,
    'blockers', to_jsonb(v_blockers),
    'allegations_in_scope', coalesce(v_alleg,0),
    'allegations_awaiting_assessment', coalesce(v_unassessed,0),
    'open_information_requests', coalesce(v_open_rfi,0),
    'open_representation_windows', coalesce(v_open_rep,0),
    'incomplete_mandatory_tasks', coalesce(v_tasks,0));
END; $$;

-- ---------- workspace read model ----------
CREATE OR REPLACE FUNCTION public.get_complaint_investigation_workspace(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; v_restricted boolean;
BEGIN
  c := public.mc03_guard(_complaint_id,'view');
  v_restricted := NOT (public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'investigate'));

  RETURN jsonb_build_object(
    'complaint', jsonb_build_object(
       'id', c.id, 'complaint_number', c.complaint_number, 'subject', c.subject,
       'status', c.status, 'investigator_id', c.investigator_id, 'licensee_id', c.licensee_id,
       'priority', c.priority, 'consumer_harm', c.consumer_harm,
       'conduct_risk_level', c.conduct_risk_level, 'systemic_potential', c.systemic_potential,
       'triage_confirmation_status', c.triage_confirmation_status, 'updated_at', c.updated_at),
    'gate', public.complaint_investigation_gate(_complaint_id),
    'plan', (SELECT to_jsonb(p) FROM public.complaint_investigation_plans p
              WHERE p.complaint_id=_complaint_id AND p.is_current),
    'plan_history', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',p.id,'version',p.version,'status',p.status,'revision_reason',p.revision_reason,
              'created_at',p.created_at,'approved_at',p.approved_at) ORDER BY p.version DESC)
              FROM public.complaint_investigation_plans p WHERE p.complaint_id=_complaint_id),'[]'::jsonb),
    'allegations', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',a.id,'allegation_number',a.allegation_number,'title',a.title,'statement',a.statement,
              'respondent_id',a.respondent_id,
              'respondent_name',(SELECT coalesce(r.legal_name,r.trading_name) FROM public.complaint_respondents r WHERE r.id=a.respondent_id),
              'issue_category_label',a.issue_category_label,'product_service',a.product_service,
              'incident_from',a.incident_from,'incident_to',a.incident_to,
              'financial_amount',a.financial_amount,'currency',a.currency,'affected_party',a.affected_party,
              'jurisdiction_scope',a.jurisdiction_scope,'jurisdiction_rationale',a.jurisdiction_rationale,
              'investigation_status',a.investigation_status,'assessment_outcome',a.assessment_outcome,
              'assessment_rationale',a.assessment_rationale,'officer_analysis',a.officer_analysis,
              'row_version',a.row_version,
              'evidence_count',(SELECT count(*) FROM public.complaint_evidence_allegations l WHERE l.allegation_id=a.id),
              'supporting_count',(SELECT count(*) FROM public.complaint_evidence_allegations l WHERE l.allegation_id=a.id AND l.relationship_type='SUPPORTS'),
              'contradicting_count',(SELECT count(*) FROM public.complaint_evidence_allegations l WHERE l.allegation_id=a.id AND l.relationship_type='CONTRADICTS')
            ) ORDER BY a.allegation_number)
            FROM public.complaint_allegations a WHERE a.complaint_id=_complaint_id),'[]'::jsonb),
    'evidence', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',e.id,'evidence_reference',e.evidence_reference,'label',e.label,'description',e.description,
              'source_type',e.source_type,'source_party',e.source_party,'received_at',coalesce(e.received_at,e.created_at),
              'document_type',e.document_type,'confidentiality',e.confidentiality,'privileged',e.privileged,
              'reliability',e.reliability,'relevance',e.relevance,'assessment_rationale',e.assessment_rationale,
              'custody_state',e.custody_state,'version',e.version,'content_hash',e.content_hash,
              'supersedes_evidence_id',e.supersedes_evidence_id,'superseded_by_evidence_id',e.superseded_by_evidence_id,
              'file_upload_id',e.file_upload_id,'row_version',e.row_version,
              'links',coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'allegation_id',l.allegation_id,'relationship_type',l.relationship_type,
                     'allegation_number',(SELECT a2.allegation_number FROM public.complaint_allegations a2 WHERE a2.id=l.allegation_id),
                     'relevance_note',l.relevance_note))
                     FROM public.complaint_evidence_allegations l WHERE l.evidence_id=e.id),'[]'::jsonb)
            ) ORDER BY coalesce(e.received_at,e.created_at) DESC)
            FROM public.complaint_evidence e
            WHERE e.complaint_id=_complaint_id
              AND NOT (v_restricted AND (e.confidentiality='RESTRICTED' OR e.privileged))),'[]'::jsonb),
    'information_requests', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',r.id,'summary',r.summary,'status',r.status,'approval_state',r.approval_state,
              'due_at',r.due_at,'raised_at',r.raised_at,'dispatched_at',r.dispatched_at,
              'purpose',r.purpose,'evidence_requirement',r.evidence_requirement,
              'evidence_finalized_at',r.evidence_finalized_at,
              'investigator_disposition',r.investigator_disposition,
              'item_count',(SELECT count(*) FROM public.complaint_rfi_items i WHERE i.rfi_id=r.id),
              'allegation_numbers',coalesce((SELECT jsonb_agg(a3.allegation_number ORDER BY a3.allegation_number)
                     FROM public.complaint_rfi_allegations ra
                     JOIN public.complaint_allegations a3 ON a3.id=ra.allegation_id
                    WHERE ra.rfi_id=r.id),'[]'::jsonb)
            ) ORDER BY r.raised_at DESC)
            FROM public.complaint_rfis r WHERE r.complaint_id=_complaint_id),'[]'::jsonb),
    'representations', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',rp.id,'invitation_reference',rp.invitation_reference,'representing_party',rp.representing_party,
              'representation_type',rp.representation_type,'status',rp.status,
              'invited_at',rp.invited_at,'due_at',rp.due_at,'extended_due_at',rp.extended_due_at,
              'extension_reason',rp.extension_reason,'submitted_at',rp.submitted_at,'is_late',rp.is_late,
              'late_decision',rp.late_decision,'accepted_for_consideration',rp.accepted_for_consideration,
              'narrative',rp.narrative,'review_note',rp.review_note,'reviewed_at',rp.reviewed_at,
              'row_version',rp.row_version,
              'allegation_numbers',coalesce((SELECT jsonb_agg(a4.allegation_number ORDER BY a4.allegation_number)
                     FROM public.complaint_representation_allegations rpa
                     JOIN public.complaint_allegations a4 ON a4.id=rpa.allegation_id
                    WHERE rpa.representation_id=rp.id),'[]'::jsonb)
            ) ORDER BY rp.created_at DESC)
            FROM public.complaint_representations rp WHERE rp.complaint_id=_complaint_id),'[]'::jsonb),
    'tasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',t.id,'title',t.title,'description',t.description,'status',t.status,
              'due_date',t.due_date,'owner_id',t.owner_id,'priority',t.priority,
              'is_mandatory',t.is_mandatory,'task_kind',t.task_kind,'allegation_id',t.allegation_id,
              'blocked_reason',t.blocked_reason,'completion_note',t.completion_note,'row_version',t.row_version
            ) ORDER BY t.created_at)
            FROM public.complaint_investigation_tasks t WHERE t.complaint_id=_complaint_id),'[]'::jsonb),
    'readiness', public.complaint_investigation_readiness(_complaint_id),
    'capabilities', jsonb_build_object(
       'can_start_investigation', public.has_complaint_perm(v_uid,'investigate')
                                  AND (public.complaint_investigation_gate(_complaint_id)->>'ok')::boolean,
       'can_edit_plan', public.has_complaint_perm(v_uid,'investigate'),
       'can_approve_plan', public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'approve')
                           OR public.has_complaint_perm(v_uid,'override_triage'),
       'can_manage_allegations', public.has_complaint_perm(v_uid,'investigate'),
       'can_manage_evidence', public.has_complaint_perm(v_uid,'investigate'),
       'can_issue_rfi', public.has_complaint_perm(v_uid,'investigate'),
       'can_approve_rfi', public.can_approve_complaint_rfi(v_uid),
       'can_open_representation', public.has_complaint_perm(v_uid,'investigate'),
       'can_review_representation', public.has_complaint_perm(v_uid,'investigate'),
       'can_decide_late_representation', public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'approve')
                           OR public.has_complaint_perm(v_uid,'override_triage'),
       'can_manage_tasks', public.has_complaint_perm(v_uid,'investigate'),
       'can_add_note', public.has_complaint_perm(v_uid,'edit'),
       'sees_restricted_evidence', NOT v_restricted)
  );
END; $$;

-- ---------- timeline ----------
CREATE OR REPLACE FUNCTION public.complaint_investigation_timeline(_complaint_id uuid, _limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  RETURN coalesce((
    SELECT jsonb_agg(t ORDER BY (t->>'occurred_at') DESC) FROM (
      SELECT jsonb_build_object('occurred_at', al.created_at, 'event_type', al.action,
                                'actor_id', al.user_id, 'detail', al.new_value, 'source','AUDIT') AS t
        FROM public.audit_logs al
       WHERE al.entity_type='complaint' AND al.entity_id=_complaint_id
      UNION ALL
      SELECT jsonb_build_object('occurred_at', h.occurred_at, 'event_type','allegation.'||lower(h.event_type),
                                'actor_id', h.actor_id,
                                'detail', jsonb_build_object('allegation_id',h.allegation_id,'rationale',h.rationale),
                                'source','ALLEGATION')
        FROM public.complaint_allegation_history h WHERE h.complaint_id=_complaint_id
      UNION ALL
      SELECT jsonb_build_object('occurred_at', re.occurred_at, 'event_type','representation.'||lower(re.event_type),
                                'actor_id', re.actor_id, 'detail', re.detail, 'source','REPRESENTATION')
        FROM public.complaint_representation_events re WHERE re.complaint_id=_complaint_id
      UNION ALL
      SELECT jsonb_build_object('occurred_at', cc.created_at, 'event_type','correspondence.'||cc.direction,
                                'actor_id', cc.author_id,
                                'detail', jsonb_build_object('subject',cc.subject), 'source','CORRESPONDENCE')
        FROM public.complaint_correspondence cc WHERE cc.complaint_id=_complaint_id
      LIMIT greatest(coalesce(_limit,200),1)
    ) s), '[]'::jsonb);
END; $$;

-- ---------- direct-write lockdown ----------
DROP POLICY IF EXISTS "Internal manage complaint evidence" ON public.complaint_evidence;
CREATE POLICY "Internal read complaint evidence" ON public.complaint_evidence FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'complaint_management','view'));

DROP POLICY IF EXISTS "Internal manage complaint correspondence" ON public.complaint_correspondence;
CREATE POLICY "Internal read complaint correspondence" ON public.complaint_correspondence FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'complaint_management','view'));

DROP POLICY IF EXISTS "Internal manage complaint tasks" ON public.complaint_investigation_tasks;
CREATE POLICY "Internal read complaint tasks" ON public.complaint_investigation_tasks FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'complaint_management','view'));

REVOKE INSERT, UPDATE, DELETE ON public.complaint_correspondence FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.complaint_investigation_tasks FROM authenticated;
REVOKE UPDATE, DELETE ON public.complaint_evidence FROM authenticated;

-- ---------- API surface hygiene ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND (p.proname LIKE 'complaint_investigation%' OR p.proname LIKE 'complaint_allegation%'
            OR p.proname LIKE 'complaint_evidence_%' OR p.proname LIKE 'complaint_representation%'
            OR p.proname IN ('mc03_guard','mc03_require_gate','complaint_note_add',
                             'get_complaint_investigation_workspace','complaint_rfi_link_allegation',
                             'complaint_rfi_finalize_evidence'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
