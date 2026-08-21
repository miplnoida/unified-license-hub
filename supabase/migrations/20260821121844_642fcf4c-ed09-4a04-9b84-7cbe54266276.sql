-- EPR-04 fix: `rol` was only assigned when the assessment had a role_id, which
-- made the record indeterminate for role-less cases. Role and determination are
-- now read into scalar variables that are always defined.
CREATE OR REPLACE FUNCTION public.fp_assessment_case(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  a record;
  v_person text;
  v_role_id uuid;
  v_role_label text;
  v_role_type text;
  v_role_licensee uuid;
  v_licensee uuid;
  v_det_id uuid;
  v_det jsonb := 'null'::jsonb;
  v_can_act boolean;
  v_stage text;
  v_stage_label text;
  v_sla_days int;
  v_sla_anchor timestamptz;
  v_sla_due timestamptz;
  v_sla_state text;
  v_waiting text;
  v_priority text;
  v_blockers jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_next jsonb := 'null'::jsonb;
  v_committee jsonb := 'null'::jsonb;
  v_findings jsonb := '[]'::jsonb;
  v_screening jsonb := '[]'::jsonb;
  v_votes jsonb := '[]'::jsonb;
  v_conditions jsonb := '[]'::jsonb;
  v_monitoring jsonb := '[]'::jsonb;
  v_appeals jsonb := '[]'::jsonb;
  v_related jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_declaration jsonb := 'null'::jsonb;
  v_open_findings int := 0;
  v_high_findings int := 0;
  v_open_conditions int := 0;
  v_last timestamptz;
BEGIN
  IF _assessment_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'allowed', false);
  END IF;

  SELECT * INTO a FROM public.fp_assessments WHERE id = _assessment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'allowed', false);
  END IF;

  IF NOT public.can_read_fp_assessment(v_user, _assessment_id) THEN
    RETURN jsonb_build_object('found', true, 'allowed', false);
  END IF;

  v_can_act := public.can_act_on_fp(v_user);

  SELECT full_name INTO v_person FROM public.fp_individuals WHERE id = a.individual_id;

  SELECT r.id, COALESCE(r.role_title, r.role_type), r.role_type, r.licensee_id
    INTO v_role_id, v_role_label, v_role_type, v_role_licensee
    FROM public.fp_individual_roles r
   WHERE r.id = a.role_id;

  v_licensee := COALESCE(a.licensee_id, v_role_licensee);

  -- Determination for THIS assessment only (never the person's current one).
  SELECT d.id, jsonb_build_object(
           'id', d.id, 'outcome', d.outcome, 'rationale', d.rationale,
           'determined_at', d.determined_at, 'determined_by', d.determined_by,
           'effective_from', d.effective_from, 'effective_to', d.effective_to,
           'is_current', d.is_current, 'is_committee_override', d.is_committee_override,
           'override_reason', d.override_reason)
    INTO v_det_id, v_det
    FROM public.fp_determinations d
   WHERE d.assessment_id = _assessment_id
   ORDER BY d.determined_at DESC NULLS LAST
   LIMIT 1;
  v_det := COALESCE(v_det, 'null'::jsonb);

  /* ---------------------------------------------------------------- stage */
  v_stage := a.status;
  v_stage_label := CASE a.status
    WHEN 'draft'              THEN 'Declaration requested'
    WHEN 'submitted'          THEN 'Declaration received'
    WHEN 'screening'          THEN 'Screening & findings'
    WHEN 'awaiting_committee' THEN 'Committee decision'
    WHEN 'determined'         THEN 'Determination issued'
    WHEN 'closed'             THEN 'Closed'
    WHEN 'withdrawn'          THEN 'Withdrawn'
    ELSE COALESCE(a.status, 'Unknown') END;

  /* ------------------------------------------------------------ evidence */
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', f.id, 'run_id', f.run_id, 'check_type', f.check_type,
           'severity', f.severity, 'title', f.title, 'summary', f.summary,
           'is_false_positive', f.is_false_positive,
           'resolution_status', f.resolution_status,
           'assigned_to', f.assigned_to,
           'created_at', f.created_at,
           'href', '/fpa/findings/' || f.id
         ) ORDER BY f.created_at DESC), '[]'::jsonb)
    INTO v_findings
    FROM public.fp_findings f
   WHERE f.assessment_id = _assessment_id;

  SELECT count(*) FILTER (WHERE COALESCE(f.is_false_positive,false) = false
                            AND COALESCE(f.resolution_status,'open') NOT IN ('resolved','dismissed','cleared')),
         count(*) FILTER (WHERE COALESCE(f.is_false_positive,false) = false
                            AND f.severity IN ('high','critical'))
    INTO v_open_findings, v_high_findings
    FROM public.fp_findings f
   WHERE f.assessment_id = _assessment_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'run_type', r.run_type, 'status', r.status,
           'started_at', r.started_at, 'completed_at', r.completed_at,
           'total_checks', r.total_checks, 'total_hits', r.total_hits,
           'error', r.error
         ) ORDER BY r.started_at DESC), '[]'::jsonb)
    INTO v_screening
    FROM public.fp_screening_runs r
   WHERE r.assessment_id = _assessment_id;

  /* ----------------------------------------------------------- committee */
  SELECT jsonb_build_object(
           'id', c.id, 'name', c.name, 'quorum', c.quorum,
           'approval_threshold_pct', c.approval_threshold_pct,
           'is_active', c.is_active,
           'member_count', (SELECT count(*) FROM public.fp_committee_members m
                             WHERE m.committee_id = c.id AND m.is_active),
           'my_membership_id', (SELECT m.id FROM public.fp_committee_members m
                                 WHERE m.committee_id = c.id AND m.user_id = v_user AND m.is_active LIMIT 1)
         )
    INTO v_committee
    FROM public.fp_committees c
   WHERE c.id = a.committee_id;
  v_committee := COALESCE(v_committee, 'null'::jsonb);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', v.id, 'member_id', v.member_id, 'vote', v.vote,
           'justification', v.justification, 'voted_at', v.voted_at, 'weight', v.weight
         ) ORDER BY v.voted_at), '[]'::jsonb)
    INTO v_votes
    FROM public.fp_committee_votes v
   WHERE v.assessment_id = _assessment_id;

  /* ------------------------------- conditions / monitoring / appeal (lineage) */
  IF v_det_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', k.id, 'category', k.category, 'description', k.description,
             'due_date', k.due_date, 'status', k.status,
             'monitoring_owner', k.monitoring_owner, 'evidence_type', k.evidence_type,
             'satisfied_at', k.satisfied_at
           ) ORDER BY k.created_at DESC), '[]'::jsonb),
           count(*) FILTER (WHERE k.status IN ('open','overdue'))
      INTO v_conditions, v_open_conditions
      FROM public.fp_conditions k
     WHERE k.determination_id = v_det_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', m.id, 'event_type', m.event_type, 'severity', m.severity,
             'summary', m.summary, 'raised_at', m.raised_at,
             'acknowledged_at', m.acknowledged_at
           ) ORDER BY m.raised_at DESC), '[]'::jsonb)
      INTO v_monitoring
      FROM public.fp_monitoring_events m
     WHERE m.determination_id = v_det_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', p.id, 'status', p.status, 'grounds', p.grounds,
             'filed_at', p.filed_at, 'decision', p.decision,
             'decision_rationale', p.decision_rationale, 'decided_at', p.decided_at
           ) ORDER BY p.filed_at DESC), '[]'::jsonb)
      INTO v_appeals
      FROM public.fp_appeals p
     WHERE p.determination_id = v_det_id;
  END IF;

  /* -------------------------------------------------------- declaration */
  v_declaration := jsonb_build_object(
    'pq_state', a.pq_state,
    'pq_amendment_reason', a.pq_amendment_reason,
    'submitted_at', a.submitted_at,
    'submitted_by', a.submitted_by,
    'form_template_id', a.form_template_id,
    'form_version_id', a.form_version_id,
    'form_response_id', a.form_response_id,
    'has_data', (a.declaration_data IS NOT NULL AND a.declaration_data <> '{}'::jsonb),
    'invitation', (
      SELECT jsonb_build_object('id', i.id, 'status', i.status, 'channel', i.channel,
                                'recipient_email', i.recipient_email,
                                'sent_at', i.sent_at, 'opened_at', i.opened_at,
                                'submitted_at', i.submitted_at, 'expires_at', i.expires_at)
        FROM public.declaration_invitations i
       WHERE i.assessment_id = _assessment_id
       ORDER BY i.created_at DESC LIMIT 1));

  /* ------------------------------------------------------ related cases */
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', 'FP_ASSESSMENT',
           'label', COALESCE(o.assessment_type,'assessment') || ' — ' || o.status,
           'detail', to_char(o.created_at, 'DD Mon YYYY'),
           'href', '/fpa/assessments/' || o.id
         ) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO v_related
    FROM public.fp_assessments o
   WHERE o.individual_id = a.individual_id AND o.id <> _assessment_id;

  /* ------------------------------------------------------------ history */
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'at', l."timestamp", 'action', l.action_type::text,
           'object_type', l.object_type, 'user_id', l.user_id,
           'justification', l.justification
         ) ORDER BY l."timestamp" DESC), '[]'::jsonb)
    INTO v_history
    FROM (SELECT * FROM public.compliance_audit_logs
           WHERE object_id = _assessment_id::text
           ORDER BY "timestamp" DESC LIMIT 200) l;

  /* ---------------------------------------------------------- blockers */
  IF a.status = 'draft' AND COALESCE(a.declaration_data,'{}'::jsonb) = '{}'::jsonb THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','DECLARATION_OUTSTANDING','label','Declaration has not been received',
      'href','/fpa/assessments/' || a.id || '?section=declaration&from=current');
  END IF;
  IF a.status IN ('submitted','screening') AND jsonb_array_length(v_screening) = 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','NO_SCREENING_RUN','label','No screening run recorded for this assessment',
      'href','/fpa/assessments/' || a.id || '?section=screening&from=current');
  END IF;
  IF a.status = 'awaiting_committee' AND a.committee_id IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','NO_COMMITTEE','label','No committee assigned to this assessment',
      'href','/fpa/assessments/' || a.id || '?section=committee&from=current');
  END IF;
  IF a.status = 'awaiting_committee' AND a.committee_id IS NOT NULL AND jsonb_array_length(v_votes) = 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','NO_VOTES','label','Committee has not voted yet',
      'href','/fpa/assessments/' || a.id || '?section=committee&from=current');
  END IF;
  IF a.status = 'determined' AND v_det_id IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','NO_DETERMINATION','label','No determination is recorded for this assessment',
      'href','/fpa/assessments/' || a.id || '?section=determination&from=current');
  END IF;
  IF a.status = 'determined' AND v_open_conditions > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','OPEN_CONDITIONS','label','Determination conditions are still open',
      'href','/fpa/assessments/' || a.id || '?section=conditions&from=current');
  END IF;

  /* ------------------------------------------- available governed actions */
  IF v_can_act THEN
    IF a.status = 'draft' THEN
      v_actions := v_actions || jsonb_build_object('code','submit','label','Record declaration as received',
        'to_status','submitted','requires_reason',false,'permission','fit_and_proper.workflow_action',
        'enabled', COALESCE(a.declaration_data,'{}'::jsonb) <> '{}'::jsonb);
    ELSIF a.status = 'submitted' THEN
      v_actions := v_actions
        || jsonb_build_object('code','screening','label','Start screening','to_status','screening',
             'requires_reason',false,'permission','fit_and_proper.workflow_action','enabled',true)
        || jsonb_build_object('code','awaiting_committee','label','Refer to committee','to_status','awaiting_committee',
             'requires_reason',true,'permission','fit_and_proper.workflow_action','enabled', a.committee_id IS NOT NULL);
    ELSIF a.status = 'screening' THEN
      v_actions := v_actions
        || jsonb_build_object('code','awaiting_committee','label','Refer to committee','to_status','awaiting_committee',
             'requires_reason',true,'permission','fit_and_proper.workflow_action','enabled', a.committee_id IS NOT NULL)
        || jsonb_build_object('code','determined','label','Record determination','to_status','determined',
             'requires_reason',true,'permission','fit_and_proper.workflow_action','enabled', v_det_id IS NOT NULL);
    ELSIF a.status = 'awaiting_committee' THEN
      v_actions := v_actions
        || jsonb_build_object('code','determined','label','Record determination','to_status','determined',
             'requires_reason',true,'permission','fit_and_proper.workflow_action','enabled', v_det_id IS NOT NULL);
    ELSIF a.status = 'determined' THEN
      v_actions := v_actions
        || jsonb_build_object('code','closed','label','Close assessment case','to_status','closed',
             'requires_reason',true,'permission','fit_and_proper.workflow_action',
             'enabled', v_open_conditions = 0);
    END IF;
  END IF;

  v_next := CASE a.status
    WHEN 'draft'              THEN jsonb_build_object('code','declaration','label','Obtain and record the declaration')
    WHEN 'submitted'          THEN jsonb_build_object('code','screening','label','Run screening for this assessment')
    WHEN 'screening'          THEN jsonb_build_object('code','findings','label','Dispose of screening findings')
    WHEN 'awaiting_committee' THEN jsonb_build_object('code','committee','label','Complete committee voting')
    WHEN 'determined'         THEN jsonb_build_object('code','conditions','label','Monitor conditions, then close')
    ELSE 'null'::jsonb END;

  v_waiting := CASE a.status
    WHEN 'draft'              THEN 'Individual — declaration'
    WHEN 'submitted'          THEN 'Regulator — screening'
    WHEN 'screening'          THEN 'Regulator — findings disposition'
    WHEN 'awaiting_committee' THEN 'Committee — vote'
    WHEN 'determined'         THEN 'Regulator — conditions monitoring'
    ELSE NULL END;

  /* ---------------------------------------------------------------- SLA */
  v_sla_days := CASE a.status
    WHEN 'draft' THEN 14 WHEN 'submitted' THEN 10 WHEN 'screening' THEN 15
    WHEN 'awaiting_committee' THEN 20 WHEN 'determined' THEN 30 ELSE NULL END;
  v_sla_anchor := CASE a.status
    WHEN 'draft' THEN a.created_at
    WHEN 'submitted' THEN COALESCE(a.submitted_at, a.updated_at, a.created_at)
    WHEN 'determined' THEN COALESCE(a.determined_at, a.updated_at)
    ELSE COALESCE(a.pq_state_changed_at, a.updated_at, a.created_at) END;
  IF v_sla_days IS NOT NULL AND v_sla_anchor IS NOT NULL THEN
    v_sla_due := v_sla_anchor + (v_sla_days || ' days')::interval;
    v_sla_state := CASE
      WHEN now() > v_sla_due THEN 'breached'
      WHEN now() > v_sla_due - interval '3 days' THEN 'due_soon'
      ELSE 'on_track' END;
  ELSE
    v_sla_state := 'paused';
  END IF;

  v_priority := CASE
    WHEN a.status IN ('closed','withdrawn') THEN 'low'
    WHEN v_sla_state = 'breached' OR v_high_findings > 0 THEN 'critical'
    WHEN v_sla_state = 'due_soon' OR v_open_findings > 0 THEN 'high'
    ELSE 'medium' END;

  v_last := GREATEST(
    COALESCE(a.updated_at, a.created_at),
    COALESCE(a.submitted_at, a.created_at),
    COALESCE(a.determined_at, a.created_at),
    COALESCE(a.closed_at, a.created_at));

  RETURN jsonb_build_object(
    'found', true,
    'allowed', true,
    'generated_at', now(),
    'can_act', v_can_act,
    'assessment_id', a.id,
    'header', jsonb_build_object(
      'reference', 'FP-' || upper(substr(a.id::text, 1, 8)),
      'subject', COALESCE(v_person, 'Unknown individual'),
      'subject_href', '/fpa/individuals/' || a.individual_id,
      'individual_id', a.individual_id,
      'role_id', v_role_id,
      'role_label', v_role_label,
      'role_type', v_role_type,
      'licensee_id', v_licensee,
      'licensee_name', (SELECT l.legal_name FROM public.licensees l WHERE l.id = v_licensee),
      'entity_href', CASE WHEN v_licensee IS NOT NULL THEN '/entities/' || v_licensee ELSE NULL END,
      'regulator_id', a.regulator_id,
      'regulator_name', (SELECT r.name FROM public.regulators r WHERE r.id = a.regulator_id),
      'assessment_type', a.assessment_type,
      'stage', v_stage,
      'stage_label', v_stage_label,
      'status', a.status,
      'status_label', v_stage_label,
      'owner_user_id', COALESCE(a.submitted_by, a.created_by),
      'team', 'Fit & Proper',
      'priority', v_priority,
      'sla_due_at', v_sla_due,
      'sla_state', v_sla_state,
      'waiting_on', v_waiting,
      'created_at', a.created_at,
      'last_activity_at', v_last
    ),
    'blockers', v_blockers,
    'available_actions', v_actions,
    'next_action', v_next,
    'declaration', v_declaration,
    'screening', jsonb_build_object(
      'runs', v_screening,
      'open_findings', v_open_findings,
      'high_findings', v_high_findings),
    'findings', v_findings,
    'committee', jsonb_build_object('committee', v_committee, 'votes', v_votes),
    'determination', v_det,
    'conditions', v_conditions,
    'monitoring', v_monitoring,
    'appeals', v_appeals,
    'related_cases', v_related,
    'history', v_history
  );
END;
$function$;