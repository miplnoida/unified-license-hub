-- =====================================================================
-- P04 A.9–A.13 — due-process action authority for adverse lifecycle
-- =====================================================================

CREATE OR REPLACE FUNCTION public.license_lifecycle_available_actions(_license_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  l record; pol jsonb; m record; r record; am record;
  v_open_conditions int; v_overdue_conditions int;
  v_days numeric; v_expired boolean;
  out_actions jsonb := '[]'::jsonb;
  can_workflow boolean; can_approve boolean; can_adverse boolean; can_conditions boolean;
  cfg jsonb; pre jsonb; pre_progress jsonb; v_notice record;
  v_kind_label text; v_decide_key text; v_decide_label text;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF uid IS NULL THEN RETURN '[]'::jsonb; END IF;

  can_workflow   := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action');
  can_approve    := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','approve');
  can_adverse    := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','manage_license_actions');
  can_conditions := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','manage_conditions');
  IF NOT (can_workflow OR can_approve OR can_adverse OR can_conditions) THEN RETURN '[]'::jsonb; END IF;

  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  SELECT count(*) FILTER (WHERE status IN ('open','in_progress','evidence_due')),
         count(*) FILTER (WHERE status IN ('open','in_progress','evidence_due') AND due_date < current_date)
    INTO v_open_conditions, v_overdue_conditions
    FROM public.license_conditions WHERE license_id = l.id;

  SELECT * INTO m FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open'
   ORDER BY CASE matter_kind WHEN 'revocation' THEN 1 WHEN 'suspension' THEN 2 WHEN 'renewal' THEN 3 ELSE 4 END, opened_at
   LIMIT 1;

  SELECT * INTO r FROM public.license_renewals
   WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn')
   ORDER BY created_at DESC LIMIT 1;

  v_days := CASE WHEN l.valid_until IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (l.valid_until - now()))/86400 END;
  v_expired := v_days IS NOT NULL AND v_days < 0;

  IF l.status IN ('revoked','surrendered') THEN RETURN '[]'::jsonb; END IF;

  -- ---------------- renewal -----------------------------------------
  IF r.id IS NOT NULL THEN
    IF can_workflow AND r.status <> 'information_requested' THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','REQUEST_RENEWAL_INFORMATION','label','Request renewal information',
        'permission','license_management.workflow_action','adverse',false,'requires_reason',true,
        'blockers','[]'::jsonb,'section','renewal'));
    END IF;
    IF can_approve THEN
      out_actions := out_actions || jsonb_build_array(
        jsonb_build_object('key','APPROVE_RENEWAL','label','Approve renewal',
          'permission','license_management.approve','adverse',false,'requires_reason',false,
          'blockers', CASE WHEN v_overdue_conditions > 0
                           THEN jsonb_build_array(jsonb_build_object('key','overdue_conditions',
                                'label', v_overdue_conditions || ' overdue condition(s) outstanding',
                                'href','/licenses/' || l.id || '?tab=conditions'))
                           ELSE '[]'::jsonb END,
          'section','renewal'),
        jsonb_build_object('key','REFUSE_RENEWAL','label','Refuse renewal',
          'permission','license_management.approve','adverse',true,'requires_reason',true,
          'blockers','[]'::jsonb,'section','renewal'));
    END IF;
  ELSIF can_workflow AND l.status IN ('active','restricted','expired') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','START_RENEWAL','label','Start renewal',
      'permission','license_management.workflow_action','adverse',false,'requires_reason',false,
      'blockers','[]'::jsonb,'section','renewal'));
  END IF;

  -- ---------------- variation ---------------------------------------
  IF m.matter_kind = 'variation' THEN
    IF can_approve THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','APPROVE_VARIATION','label','Approve variation',
        'permission','license_management.approve','adverse',false,'requires_reason',false,
        'blockers','[]'::jsonb,'section','variation'));
    END IF;
  ELSIF can_workflow AND l.status = 'active' THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','APPLY_VARIATION','label','Open variation matter',
      'permission','license_management.workflow_action','adverse',false,'requires_reason',false,
      'blockers','[]'::jsonb,'section','variation'));
  END IF;

  -- ============ A.9–A.13 adverse lifecycle, stage driven =============
  FOR am IN
    SELECT * FROM public.license_lifecycle_matters
     WHERE license_id = l.id AND status = 'open'
       AND matter_kind IN ('suspension','revocation','reinstatement','surrender','expiry')
     ORDER BY opened_at
  LOOP
    IF NOT can_adverse THEN CONTINUE; END IF;
    cfg := public.license_lifecycle_config_resolve(l.id, am.matter_kind);
    pre := public.license_matter_prerequisites(am.id);
    pre_progress := COALESCE((SELECT jsonb_agg(b) FROM jsonb_array_elements(pre) b
                               WHERE b->>'key' NOT IN ('NOTICE_NOT_ISSUED','REPRESENTATION_WINDOW_OPEN',
                                                       'EVIDENCE_REVIEW_INCOMPLETE','VERIFICATION_INCOMPLETE',
                                                       'SURRENDER_REVIEW_INCOMPLETE','MAKER_CHECKER',
                                                       'DECISION_AUTHORITY','LEGAL_BASIS')), '[]'::jsonb);
    v_kind_label := replace(initcap(am.matter_kind),'_',' ');

    SELECT * INTO v_notice FROM public.license_matter_notices
     WHERE matter_id = am.id AND notice_kind='proposed_action' ORDER BY issued_at DESC LIMIT 1;

    -- Every open adverse matter can be concluded without adverse action.
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','CLOSE_MATTER_NO_ACTION','label','Close matter — no further action',
      'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse','matter_id', am.id, 'matter_kind', am.matter_kind,
      'stage', am.stage));

    IF am.matter_kind IN ('suspension','revocation') THEN
      v_decide_key := CASE am.matter_kind WHEN 'suspension' THEN 'SUSPEND' ELSE 'REVOKE' END;
      v_decide_label := CASE am.matter_kind WHEN 'suspension' THEN 'Suspend licence' ELSE 'Revoke licence' END;

      IF am.stage = 'OPEN' AND COALESCE((cfg->>'notice_required')::boolean,true) THEN
        out_actions := out_actions || jsonb_build_array(jsonb_build_object(
          'key','ISSUE_NOTICE','label','Issue notice of proposed ' || lower(am.matter_kind),
          'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
          'blockers','[]'::jsonb,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,
          'stage', am.stage));
      ELSIF am.stage IN ('NOTICE_OF_PROPOSED_ACTION','REPRESENTATION_WINDOW') THEN
        out_actions := out_actions || jsonb_build_array(
          jsonb_build_object('key','RECORD_REPRESENTATION','label','Record representation received',
            'permission','license_management.manage_license_actions','adverse',false,'requires_reason',false,
            'blockers','[]'::jsonb,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage),
          jsonb_build_object('key','CLOSE_REPRESENTATION_WINDOW','label','Close representation period',
            'permission','license_management.manage_license_actions','adverse',false,'requires_reason',false,
            'blockers', CASE WHEN v_notice.representation_deadline IS NOT NULL
                              AND v_notice.representation_deadline > now()
                              AND NOT EXISTS (SELECT 1 FROM public.license_matter_representations x WHERE x.matter_id = am.id)
                         THEN jsonb_build_array(jsonb_build_object('key','REPRESENTATION_WINDOW_OPEN',
                              'label','Representation period closes ' || to_char(v_notice.representation_deadline,'DD Mon YYYY'),
                              'href','/licenses/' || l.id || '?tab=adverse'))
                         ELSE '[]'::jsonb END,
            'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
        IF COALESCE((cfg->>'representation_waiver_allowed')::boolean,true) THEN
          out_actions := out_actions || jsonb_build_array(jsonb_build_object(
            'key','WAIVE_REPRESENTATION_PERIOD','label','Record waiver of representation period',
            'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
            'blockers','[]'::jsonb,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
        END IF;
      ELSIF am.stage = 'EVIDENCE_REVIEW' OR (am.stage = 'OPEN' AND NOT COALESCE((cfg->>'notice_required')::boolean,true)) THEN
        out_actions := out_actions || jsonb_build_array(jsonb_build_object(
          'key','COMPLETE_EVIDENCE_REVIEW','label','Conclude evidence review',
          'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
          'blockers', pre_progress,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
        IF COALESCE((cfg->>'late_representation_allowed')::boolean,true) THEN
          out_actions := out_actions || jsonb_build_array(jsonb_build_object(
            'key','RECORD_REPRESENTATION','label','Record late representation',
            'permission','license_management.manage_license_actions','adverse',false,'requires_reason',false,
            'blockers','[]'::jsonb,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
        END IF;
      ELSIF am.stage = 'DECISION_READY' THEN
        out_actions := out_actions || jsonb_build_array(jsonb_build_object(
          'key', v_decide_key,'label', v_decide_label,
          'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
          'blockers', pre,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
      END IF;

    ELSIF am.matter_kind = 'reinstatement' THEN
      IF am.stage IN ('OPEN','VERIFICATION') THEN
        out_actions := out_actions || jsonb_build_array(jsonb_build_object(
          'key','COMPLETE_REINSTATEMENT_VERIFICATION','label','Complete reinstatement verification',
          'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
          'blockers', pre_progress,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
      ELSIF am.stage = 'DECISION_READY' THEN
        out_actions := out_actions || jsonb_build_array(
          jsonb_build_object('key','REINSTATE','label','Reinstate licence',
            'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
            'blockers', pre,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage),
          jsonb_build_object('key','REFUSE_REINSTATEMENT','label','Refuse reinstatement',
            'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
            'blockers','[]'::jsonb,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
      END IF;

    ELSIF am.matter_kind = 'surrender' THEN
      IF am.stage IN ('OPEN','SURRENDER_REVIEW') THEN
        out_actions := out_actions || jsonb_build_array(jsonb_build_object(
          'key','COMPLETE_SURRENDER_REVIEW','label','Conclude surrender review',
          'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
          'blockers', pre_progress,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
      ELSIF am.stage = 'DECISION_READY' THEN
        out_actions := out_actions || jsonb_build_array(
          jsonb_build_object('key','ACCEPT_SURRENDER','label','Accept surrender',
            'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
            'blockers', pre,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage),
          jsonb_build_object('key','REFUSE_SURRENDER','label','Refuse surrender',
            'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
            'blockers','[]'::jsonb,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
      END IF;

    ELSIF am.matter_kind = 'expiry' THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','MARK_EXPIRED','label','Confirm lapse (mark expired)',
        'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
        'blockers', pre,'section','adverse','matter_id', am.id,'matter_kind', am.matter_kind,'stage', am.stage));
    END IF;
  END LOOP;

  -- ---------------- entry points (no open matter of that kind) -------
  IF can_adverse AND l.status IN ('active','restricted')
     AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters x
                      WHERE x.license_id=l.id AND x.status='open' AND x.matter_kind='suspension') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','BEGIN_SUSPENSION','label','Begin suspension review',
      'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse'));
  END IF;

  IF can_adverse AND l.status IN ('active','restricted','suspended')
     AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters x
                      WHERE x.license_id=l.id AND x.status='open' AND x.matter_kind='revocation') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','BEGIN_REVOCATION','label','Begin revocation review',
      'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse'));
  END IF;

  IF can_adverse AND l.status = 'suspended'
     AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters x
                      WHERE x.license_id=l.id AND x.status='open' AND x.matter_kind='reinstatement') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','BEGIN_REINSTATEMENT','label','Begin reinstatement review',
      'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse'));
  END IF;

  IF can_workflow AND l.status IN ('active','restricted','suspended')
     AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters x
                      WHERE x.license_id=l.id AND x.status='open' AND x.matter_kind='surrender') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','BEGIN_SURRENDER','label','Open surrender matter',
      'permission','license_management.workflow_action','adverse',false,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse'));
  END IF;

  IF can_adverse AND v_expired AND l.status IN ('active','restricted')
     AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters x
                      WHERE x.license_id=l.id AND x.status='open' AND x.matter_kind='expiry') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','BEGIN_EXPIRY_REVIEW','label','Open expiry review',
      'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse'));
  END IF;

  RETURN out_actions;
END
$function$;

REVOKE ALL ON FUNCTION public.license_lifecycle_available_actions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_available_actions(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.license_lifecycle_action(_license_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  l record; pol jsonb; cfg jsonb; m record; r record; am record; v_notice record;
  new_status text; old_status text;
  adverse boolean;
  v_matter_id uuid; v_renewal_id uuid; v_close_matter uuid; v_decision_id uuid;
  v_new_until timestamptz; v_deadline timestamptz;
  v_avail jsonb; v_offer jsonb;
  v_prev_term record; v_term_id uuid; v_term_no int;
  v_kind text; v_ent uuid; v_effective date; v_legal text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO l FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  old_status := l.status;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);
  cfg := public.license_lifecycle_config_resolve(l.id, 'renewal');
  SELECT id INTO v_ent FROM public.licensees WHERE license_id = l.id LIMIT 1;
  v_effective := COALESCE(NULLIF(_payload->>'effective_date','')::date, current_date);

  adverse := _action_key IN ('REFUSE_RENEWAL','BEGIN_SUSPENSION','SUSPEND','BEGIN_REVOCATION','REVOKE',
                             'ACCEPT_SURRENDER','MARK_EXPIRED','REFUSE_SURRENDER','REFUSE_REINSTATEMENT');

  IF _action_key IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    PERFORM public.enforce_permission('license_management','manage_conditions');
  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    PERFORM public.enforce_permission('license_management','approve');
  ELSIF _action_key IN ('ISSUE_NOTICE','RECORD_REPRESENTATION','CLOSE_REPRESENTATION_WINDOW',
                        'WAIVE_REPRESENTATION_PERIOD','COMPLETE_EVIDENCE_REVIEW','COMPLETE_SURRENDER_REVIEW',
                        'COMPLETE_REINSTATEMENT_VERIFICATION','CLOSE_MATTER_NO_ACTION','BEGIN_REINSTATEMENT',
                        'BEGIN_EXPIRY_REVIEW','REINSTATE') OR adverse THEN
    PERFORM public.enforce_permission('license_management','manage_license_actions');
  ELSE
    PERFORM public.enforce_permission('license_management','workflow_action');
  END IF;

  -- single authority: the action must be currently offered by the server
  IF _action_key NOT IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    v_avail := public.license_lifecycle_available_actions(l.id);
    SELECT a INTO v_offer FROM jsonb_array_elements(v_avail) a
     WHERE a->>'key' = _action_key
       AND (_payload->>'matter_id' IS NULL OR a->>'matter_id' IS NULL OR a->>'matter_id' = _payload->>'matter_id')
     LIMIT 1;
    IF v_offer IS NULL THEN
      RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
        DETAIL = 'Action ' || _action_key || ' is not available for this licence in its current state.';
    END IF;
    IF COALESCE((v_offer->>'requires_reason')::boolean,false) AND COALESCE(length(btrim(_reason)),0) < 10 THEN
      RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
    END IF;
    -- Due-process blockers on adverse decisions can never be overridden.
    IF jsonb_array_length(COALESCE(v_offer->'blockers','[]'::jsonb)) > 0
       AND (COALESCE((v_offer->>'adverse')::boolean,false)
            OR _action_key IN ('REINSTATE','COMPLETE_EVIDENCE_REVIEW','COMPLETE_SURRENDER_REVIEW',
                               'COMPLETE_REINSTATEMENT_VERIFICATION','CLOSE_REPRESENTATION_WINDOW')
            OR NOT COALESCE((_payload->>'override_blockers')::boolean,false)) THEN
      RAISE EXCEPTION 'BLOCKED' USING ERRCODE='22023', DETAIL = v_offer->>'blockers';
    END IF;
  END IF;

  IF adverse AND COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF l.status IN ('revoked','surrendered') THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023';
  END IF;

  -- resolve the adverse matter this action belongs to (server-side)
  IF v_offer ? 'matter_id' AND NULLIF(v_offer->>'matter_id','') IS NOT NULL THEN
    SELECT * INTO am FROM public.license_lifecycle_matters
     WHERE id = (v_offer->>'matter_id')::uuid FOR UPDATE;
  END IF;

  SELECT * INTO m FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open' ORDER BY opened_at LIMIT 1;

  IF _action_key = 'START_RENEWAL' THEN
    IF l.status NOT IN ('active','restricted','expired') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_renewals x WHERE x.license_id = l.id AND x.status NOT IN ('approved','refused','withdrawn')) THEN
      RAISE EXCEPTION 'RENEWAL_ALREADY_OPEN' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.license_renewals(license_id, initiated_by, status, previous_valid_until, notes)
    VALUES (l.id, uid, 'in_progress', l.valid_until, _reason) RETURNING id INTO v_renewal_id;
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, renewal_id, opened_by, due_at, waiting_on, metadata)
    VALUES (l.id, 'renewal', 'Licence renewal', _reason, v_renewal_id, uid, l.valid_until, 'regulator',
            jsonb_build_object('config_id', cfg->>'config_id', 'policy_snapshot', cfg))
    RETURNING id INTO v_matter_id;

  ELSIF _action_key = 'REQUEST_RENEWAL_INFORMATION' THEN
    SELECT * INTO r FROM public.license_renewals WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn') ORDER BY created_at DESC LIMIT 1;
    IF r IS NULL THEN RAISE EXCEPTION 'NO_OPEN_RENEWAL' USING ERRCODE='22023'; END IF;
    UPDATE public.license_renewals SET status='information_requested', notes=COALESCE(_reason, notes), updated_at=now() WHERE id=r.id;
    UPDATE public.license_lifecycle_matters SET waiting_on='entity', reason=COALESCE(_reason, reason) WHERE license_id=l.id AND status='open' AND matter_kind='renewal';
    v_renewal_id := r.id;

  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    SELECT * INTO r FROM public.license_renewals WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn') ORDER BY created_at DESC LIMIT 1;
    IF r IS NULL THEN RAISE EXCEPTION 'NO_OPEN_RENEWAL' USING ERRCODE='22023'; END IF;
    v_renewal_id := r.id;
    SELECT * INTO v_prev_term FROM public.license_terms WHERE license_id = l.id AND is_current LIMIT 1;

    IF _action_key = 'APPROVE_RENEWAL' THEN
      v_new_until := COALESCE((_payload->>'new_valid_until')::timestamptz,
                              GREATEST(COALESCE(l.valid_until, now()), now())
                                + make_interval(days => COALESCE(NULLIF(cfg->>'period_days','')::int,
                                                                 NULLIF(pol->>'period_days','')::int, 365)));
      UPDATE public.license_renewals SET status='approved', reviewed_by=uid, reviewed_at=now(),
             new_valid_until=v_new_until, decision_reason=_reason, updated_at=now() WHERE id=r.id;

      SELECT COALESCE(max(term_number),0) + 1 INTO v_term_no FROM public.license_terms WHERE license_id = l.id;
      IF v_prev_term.id IS NOT NULL THEN
        UPDATE public.license_terms SET is_current = false WHERE id = v_prev_term.id;
      END IF;
      INSERT INTO public.license_terms(license_id, term_number, term_kind, effective_from, effective_until,
        source_decision, renewal_id, matter_id, decision_actor, decision_at, conditions_snapshot, is_current, metadata)
      VALUES (l.id, v_term_no, 'renewal',
              COALESCE(v_prev_term.effective_until, l.valid_until, now()), v_new_until,
              'APPROVE_RENEWAL', r.id,
              (SELECT id FROM public.license_lifecycle_matters WHERE license_id=l.id AND status='open' AND matter_kind='renewal' ORDER BY opened_at LIMIT 1),
              uid, now(),
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'category',c.category,'description',c.description,'status',c.status,'due_date',c.due_date))
                          FROM public.license_conditions c
                         WHERE c.license_id = l.id AND c.status NOT IN ('closed')), '[]'::jsonb),
              true,
              jsonb_build_object('policy_snapshot', cfg, 'decision_reason', _reason))
      RETURNING id INTO v_term_id;
      IF v_prev_term.id IS NOT NULL THEN
        UPDATE public.license_terms SET superseded_by = v_term_id, superseded_at = now() WHERE id = v_prev_term.id;
      END IF;

      UPDATE public.licenses SET valid_until=v_new_until,
             status = CASE WHEN status='expired' THEN 'active' ELSE status END, updated_at=now() WHERE id=l.id;
      new_status := (SELECT status FROM public.licenses WHERE id=l.id);
    ELSE
      UPDATE public.license_renewals SET status='refused', reviewed_by=uid, reviewed_at=now(), decision_reason=_reason, updated_at=now() WHERE id=r.id;
      UPDATE public.license_lifecycle_matters
         SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
               'refusal', jsonb_build_object('decided_by', uid, 'decided_at', now(),
                                             'rationale', _reason,
                                             'preserved_term_id', v_prev_term.id,
                                             'preserved_valid_until', l.valid_until))
       WHERE license_id = l.id AND status = 'open' AND matter_kind = 'renewal';
    END IF;
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid,
           stage='DECIDED', decision = _action_key WHERE license_id=l.id AND status='open' AND matter_kind='renewal';

  -- ================= A.9–A.13 matter entry points ====================
  ELSIF _action_key IN ('BEGIN_SUSPENSION','BEGIN_REVOCATION','BEGIN_SURRENDER','BEGIN_REINSTATEMENT',
                        'BEGIN_EXPIRY_REVIEW','APPLY_VARIATION') THEN
    v_kind := CASE _action_key WHEN 'BEGIN_SUSPENSION' THEN 'suspension'
                               WHEN 'BEGIN_REVOCATION' THEN 'revocation'
                               WHEN 'BEGIN_SURRENDER' THEN 'surrender'
                               WHEN 'BEGIN_REINSTATEMENT' THEN 'reinstatement'
                               WHEN 'BEGIN_EXPIRY_REVIEW' THEN 'expiry'
                               ELSE 'variation' END;
    cfg := public.license_lifecycle_config_resolve(l.id, v_kind);
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by, due_at,
      waiting_on, metadata, stage, source_kind, source_id, source_reference, legal_basis, owner_user_id, team,
      sla_due_at, related_matter_id, config_id, effective_date)
    VALUES (l.id, v_kind,
            COALESCE(NULLIF(_payload->>'title',''), initcap(replace(v_kind,'_',' ')) || ' review'),
            _reason, uid, (_payload->>'due_at')::timestamptz,
            CASE WHEN _action_key IN ('APPLY_VARIATION','BEGIN_SURRENDER') THEN 'entity' ELSE 'regulator' END,
            jsonb_build_object('policy_snapshot', cfg, 'payload', COALESCE(_payload,'{}'::jsonb)),
            CASE v_kind WHEN 'reinstatement' THEN 'VERIFICATION'
                        WHEN 'surrender' THEN 'SURRENDER_REVIEW'
                        WHEN 'expiry' THEN 'EXPIRY_REVIEW'
                        ELSE 'OPEN' END,
            NULLIF(_payload->>'source_kind',''), NULLIF(_payload->>'source_id','')::uuid,
            NULLIF(_payload->>'source_reference',''), NULLIF(_payload->>'legal_basis',''),
            COALESCE(NULLIF(_payload->>'owner_user_id','')::uuid, uid), NULLIF(_payload->>'team',''),
            (_payload->>'due_at')::timestamptz, NULLIF(_payload->>'related_matter_id','')::uuid,
            NULLIF(cfg->>'config_id','')::uuid, NULLIF(_payload->>'effective_date','')::date)
    RETURNING id INTO v_matter_id;

  -- ================= due process steps ===============================
  ELSIF _action_key = 'ISSUE_NOTICE' THEN
    cfg := public.license_lifecycle_config_resolve(l.id, am.matter_kind);
    v_deadline := COALESCE(NULLIF(_payload->>'representation_deadline','')::timestamptz,
                           now() + make_interval(days => COALESCE((cfg->>'representation_period_days')::int, 14)));
    INSERT INTO public.license_matter_notices(matter_id, license_id, notice_kind, notice_reference, subject, body,
      legal_basis, issued_by, representation_deadline, correspondence_thread_id, delivery_channel,
      delivery_evidence, delivery_confirmed_at, metadata)
    VALUES (am.id, l.id, 'proposed_action', NULLIF(_payload->>'notice_reference',''),
            COALESCE(NULLIF(_payload->>'subject',''), 'Notice of proposed ' || am.matter_kind),
            COALESCE(NULLIF(_payload->>'body',''), _reason),
            COALESCE(NULLIF(_payload->>'legal_basis',''), am.legal_basis), uid, v_deadline,
            NULLIF(_payload->>'correspondence_thread_id','')::uuid,
            COALESCE(NULLIF(_payload->>'delivery_channel',''),'email'),
            COALESCE(_payload->'delivery_evidence','[]'::jsonb),
            NULLIF(_payload->>'delivery_confirmed_at','')::timestamptz,
            jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb)));
    UPDATE public.license_lifecycle_matters
       SET stage = CASE WHEN COALESCE((cfg->>'representation_period_days')::int,14) > 0
                        THEN 'REPRESENTATION_WINDOW' ELSE 'EVIDENCE_REVIEW' END,
           waiting_on = 'entity',
           legal_basis = COALESCE(NULLIF(_payload->>'legal_basis',''), legal_basis),
           sla_due_at = v_deadline, due_at = COALESCE(due_at, v_deadline)
     WHERE id = am.id;
    v_matter_id := am.id;

  ELSIF _action_key = 'RECORD_REPRESENTATION' THEN
    SELECT * INTO v_notice FROM public.license_matter_notices
     WHERE matter_id = am.id AND notice_kind='proposed_action' ORDER BY issued_at DESC LIMIT 1;
    INSERT INTO public.license_matter_representations(matter_id, license_id, notice_id, received_at, received_via,
      submitter_name, submitted_by, summary, documents, is_late, recorded_by, metadata)
    VALUES (am.id, l.id, v_notice.id,
            COALESCE(NULLIF(_payload->>'received_at','')::timestamptz, now()),
            COALESCE(NULLIF(_payload->>'received_via',''),'email'),
            NULLIF(_payload->>'submitter_name',''), NULLIF(_payload->>'submitted_by','')::uuid,
            COALESCE(NULLIF(_payload->>'summary',''), _reason),
            COALESCE(_payload->'documents','[]'::jsonb),
            (v_notice.representation_deadline IS NOT NULL
             AND COALESCE(NULLIF(_payload->>'received_at','')::timestamptz, now()) > v_notice.representation_deadline),
            uid, jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb)));
    UPDATE public.license_lifecycle_matters SET waiting_on='regulator' WHERE id = am.id;
    v_matter_id := am.id;

  ELSIF _action_key IN ('CLOSE_REPRESENTATION_WINDOW','WAIVE_REPRESENTATION_PERIOD') THEN
    IF _action_key = 'WAIVE_REPRESENTATION_PERIOD' THEN
      SELECT * INTO v_notice FROM public.license_matter_notices
       WHERE matter_id = am.id AND notice_kind='proposed_action' ORDER BY issued_at DESC LIMIT 1;
      INSERT INTO public.license_matter_representations(matter_id, license_id, notice_id, received_via,
        summary, is_waiver, waiver_reason, recorded_by)
      VALUES (am.id, l.id, v_notice.id, 'waiver', 'Representation period waived', true, _reason, uid);
    END IF;
    UPDATE public.license_lifecycle_matters SET stage='EVIDENCE_REVIEW', waiting_on='regulator' WHERE id = am.id;
    v_matter_id := am.id;

  ELSIF _action_key IN ('COMPLETE_EVIDENCE_REVIEW','COMPLETE_SURRENDER_REVIEW','COMPLETE_REINSTATEMENT_VERIFICATION') THEN
    UPDATE public.license_lifecycle_matters
       SET stage='DECISION_READY', waiting_on='regulator',
           legal_basis = COALESCE(NULLIF(_payload->>'legal_basis',''), legal_basis),
           metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
             lower(_action_key), jsonb_build_object('by', uid, 'at', now(), 'note', _reason))
     WHERE id = am.id;
    v_matter_id := am.id;

  ELSIF _action_key = 'CLOSE_MATTER_NO_ACTION' THEN
    v_close_matter := am.id; v_matter_id := am.id;
    v_kind := am.matter_kind;

  -- ================= decisions =======================================
  ELSIF _action_key = 'SUSPEND' THEN
    IF l.status NOT IN ('active','restricted') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'suspended'; v_close_matter := am.id; v_matter_id := am.id; v_kind := 'suspension';
  ELSIF _action_key = 'REVOKE' THEN
    new_status := 'revoked'; v_close_matter := am.id; v_matter_id := am.id; v_kind := 'revocation';
  ELSIF _action_key = 'REINSTATE' THEN
    IF l.status NOT IN ('suspended','restricted') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'active'; v_close_matter := am.id; v_matter_id := am.id; v_kind := 'reinstatement';
  ELSIF _action_key = 'REFUSE_REINSTATEMENT' THEN
    v_close_matter := am.id; v_matter_id := am.id; v_kind := 'reinstatement';
  ELSIF _action_key = 'ACCEPT_SURRENDER' THEN
    new_status := 'surrendered'; v_close_matter := am.id; v_matter_id := am.id; v_kind := 'surrender';
  ELSIF _action_key = 'REFUSE_SURRENDER' THEN
    v_close_matter := am.id; v_matter_id := am.id; v_kind := 'surrender';
  ELSIF _action_key = 'MARK_EXPIRED' THEN
    IF l.valid_until IS NULL OR l.valid_until > now() THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'expired'; v_close_matter := am.id; v_matter_id := am.id; v_kind := 'expiry';

  ELSIF _action_key = 'APPROVE_VARIATION' THEN
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid,
           stage='DECIDED', decision='APPROVED'
     WHERE license_id=l.id AND status='open' AND matter_kind='variation';
  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION' USING ERRCODE='22023';
  END IF;

  -- ---------------- decision record + matter closure -----------------
  IF v_close_matter IS NOT NULL THEN
    cfg := public.license_lifecycle_config_resolve(l.id, v_kind);
    SELECT COALESCE(NULLIF(am.legal_basis,''),
                    (SELECT n.legal_basis FROM public.license_matter_notices n
                      WHERE n.matter_id = am.id ORDER BY n.issued_at DESC LIMIT 1))
      INTO v_legal;

    INSERT INTO public.license_decisions(matter_id, license_id, entity_id, decision_type, decision, authority,
      actor_id, maker_id, checker_id, effective_date, rationale, legal_basis, conditions, remediation,
      artifact_reference, appealable, appeal_deadline, from_status, to_status, metadata)
    VALUES (am.id, l.id, v_ent, v_kind,
            CASE _action_key WHEN 'CLOSE_MATTER_NO_ACTION' THEN 'no_action' ELSE lower(_action_key) END,
            NULLIF(cfg->>'decision_authority',''), uid, am.opened_by, uid,
            v_effective, _reason, v_legal,
            COALESCE(_payload->'conditions','[]'::jsonb), COALESCE(_payload->'remediation','[]'::jsonb),
            NULLIF(_payload->>'artifact_reference',''),
            (_action_key IN ('SUSPEND','REVOKE','ACCEPT_SURRENDER','MARK_EXPIRED','REFUSE_SURRENDER','REFUSE_REINSTATEMENT')
              AND COALESCE((cfg->>'appealable')::boolean,true)),
            CASE WHEN _action_key IN ('SUSPEND','REVOKE','ACCEPT_SURRENDER','MARK_EXPIRED','REFUSE_SURRENDER','REFUSE_REINSTATEMENT')
                      AND COALESCE((cfg->>'appealable')::boolean,true)
                 THEN now() + make_interval(days => COALESCE((cfg->>'appeal_window_days')::int,30)) END,
            old_status, COALESCE(new_status, old_status),
            jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb), 'config_id', cfg->>'config_id'))
    RETURNING id INTO v_decision_id;

    UPDATE public.license_lifecycle_matters
       SET status='closed', closed_at=now(), closed_by=uid, stage='DECIDED',
           decision=_action_key, decision_id=v_decision_id,
           effective_date = COALESCE(effective_date, v_effective),
           legal_basis = COALESCE(legal_basis, v_legal)
     WHERE id = v_close_matter;
  END IF;

  IF new_status IS NOT NULL AND new_status <> old_status THEN
    UPDATE public.licenses SET status = new_status, updated_at = now() WHERE id = l.id;
  END IF;

  INSERT INTO public.license_actions(license_id, action_type, actor_id, reason, old_status, new_status, metadata)
  VALUES (l.id, lower(_action_key), uid, _reason, old_status, COALESCE(new_status, old_status),
          jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb), 'matter_id', v_matter_id,
                             'renewal_id', v_renewal_id, 'term_id', v_term_id, 'decision_id', v_decision_id));

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license.lifecycle.' || lower(_action_key), 'license', l.id,
          jsonb_build_object('from', old_status, 'to', COALESCE(new_status, old_status), 'reason', _reason,
                             'term_id', v_term_id, 'matter_id', v_matter_id, 'decision_id', v_decision_id,
                             'payload', COALESCE(_payload,'{}'::jsonb)));

  RETURN public.license_case(l.id, 'internal');
END $function$;

REVOKE ALL ON FUNCTION public.license_lifecycle_action(uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_action(uuid, text, jsonb, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- A.13 server-owned expiry / lapse sweep (scheduler entry point)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_expiry_sweep(_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record; cfg jsonb; v_grace int; v_lapsed int := 0; v_opened int := 0; v_dec uuid; v_matter uuid;
BEGIN
  FOR rec IN
    SELECT l.* FROM public.licenses l
     WHERE l.status IN ('active','restricted')
       AND l.valid_until IS NOT NULL AND l.valid_until < now()
     ORDER BY l.valid_until
     LIMIT GREATEST(COALESCE(_limit,200),1)
  LOOP
    cfg := public.license_lifecycle_config_resolve(rec.id, 'expiry');
    v_grace := COALESCE(NULLIF(cfg->>'grace_period_days','')::int, 0);
    CONTINUE WHEN rec.valid_until + make_interval(days => v_grace) > now();

    IF COALESCE(cfg->>'expiry_behavior','officer_confirmed') = 'automatic' THEN
      INSERT INTO public.license_decisions(license_id, decision_type, decision, actor_id, effective_date,
        rationale, legal_basis, appealable, from_status, to_status, metadata)
      VALUES (rec.id, 'expiry', 'lapsed', NULL, current_date,
              'Licence term expired and the configured grace period elapsed.',
              NULLIF(cfg->>'decision_authority',''), false, rec.status, 'expired',
              jsonb_build_object('source','license_expiry_sweep','grace_period_days', v_grace))
      RETURNING id INTO v_dec;
      UPDATE public.licenses SET status='expired', updated_at=now() WHERE id = rec.id;
      UPDATE public.license_terms SET is_current = is_current WHERE license_id = rec.id AND false;
      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
      VALUES (NULL, 'license.lifecycle.expiry_sweep_lapsed', 'license', rec.id,
              jsonb_build_object('decision_id', v_dec, 'valid_until', rec.valid_until));
      v_lapsed := v_lapsed + 1;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters x
                      WHERE x.license_id = rec.id AND x.status='open' AND x.matter_kind='expiry') THEN
        INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by,
          waiting_on, stage, source_kind, sla_due_at, metadata)
        VALUES (rec.id, 'expiry', 'Expiry review',
                'Licence term expired on ' || to_char(rec.valid_until,'DD Mon YYYY') || '; officer confirmation required.',
                NULL, 'regulator', 'EXPIRY_REVIEW', 'time_based_expiry', now(),
                jsonb_build_object('source','license_expiry_sweep','policy_snapshot', cfg))
        RETURNING id INTO v_matter;
        INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
        VALUES (NULL, 'license.lifecycle.expiry_review_opened', 'license', rec.id,
                jsonb_build_object('matter_id', v_matter, 'valid_until', rec.valid_until));
        v_opened := v_opened + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('lapsed', v_lapsed, 'reviews_opened', v_opened, 'ran_at', now());
END $$;

REVOKE ALL ON FUNCTION public.license_expiry_sweep(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.license_expiry_sweep(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.license_expiry_sweep(integer) TO service_role;