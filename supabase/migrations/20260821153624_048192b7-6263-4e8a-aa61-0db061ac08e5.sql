-- =====================================================================
-- P04 A.9-A.13 — adverse matter read model, server action input schema,
-- and governed expiry sweep operations evidence.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.license_action_input_requirements(
  _license_id uuid, _action_key text, _matter_kind text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg jsonb; v_days int; v_out jsonb := '[]'::jsonb;
BEGIN
  cfg := public.license_lifecycle_config_resolve(_license_id, COALESCE(_matter_kind,'renewal'));
  v_days := COALESCE((cfg->>'representation_period_days')::int, 14);

  IF _action_key = 'ISSUE_NOTICE' THEN
    v_out := jsonb_build_array(
      jsonb_build_object('key','subject','label','Notice subject','type','text','required',true),
      jsonb_build_object('key','body','label','Notice body','type','textarea','required',true),
      jsonb_build_object('key','legal_basis','label','Legal basis','type','textarea',
        'required', COALESCE((cfg->>'legal_basis_required')::boolean, true)),
      jsonb_build_object('key','delivery_channel','label','Delivery channel','type','select','required',true,
        'options', jsonb_build_array('email','post','registered_post','hand_delivery','portal')),
      jsonb_build_object('key','notice_reference','label','Notice reference','type','text','required',false),
      jsonb_build_object('key','correspondence_thread_id','label','Correspondence thread','type','text','required',false),
      jsonb_build_object('key','representation_deadline','label',
        'Representation deadline (server default: ' || v_days || ' days)','type','date','required',false,
        'help','Leave blank to use the configured representation period.')
    );
  ELSIF _action_key = 'RECORD_REPRESENTATION' THEN
    v_out := jsonb_build_array(
      jsonb_build_object('key','summary','label','Representation summary','type','textarea','required',true),
      jsonb_build_object('key','received_via','label','Received via','type','select','required',true,
        'options', jsonb_build_array('email','post','portal','meeting','other')),
      jsonb_build_object('key','submitter_name','label','Submitted by (name)','type','text','required',true),
      jsonb_build_object('key','received_at','label','Received date','type','date','required',false,
        'help','Late status is derived by the server from the notice deadline.')
    );
  ELSIF _action_key = 'WAIVE_REPRESENTATION_PERIOD' THEN
    v_out := jsonb_build_array(
      jsonb_build_object('key','waiver_reason','label','Waiver reason','type','textarea','required',true));
  ELSIF _action_key IN ('COMPLETE_EVIDENCE_REVIEW','COMPLETE_SURRENDER_REVIEW','COMPLETE_REINSTATEMENT_VERIFICATION') THEN
    v_out := jsonb_build_array(
      jsonb_build_object('key','legal_basis','label','Legal basis','type','textarea',
        'required', COALESCE((cfg->>'legal_basis_required')::boolean, false)));
  ELSIF _action_key IN ('SUSPEND','REVOKE','REINSTATE','ACCEPT_SURRENDER','MARK_EXPIRED',
                        'REFUSE_SURRENDER','REFUSE_REINSTATEMENT') THEN
    v_out := jsonb_build_array(
      jsonb_build_object('key','legal_basis','label','Legal basis','type','textarea',
        'required', COALESCE((cfg->>'legal_basis_required')::boolean, true)),
      jsonb_build_object('key','effective_date','label','Effective date','type','date','required',true),
      jsonb_build_object('key','artifact_reference','label','Decision artifact reference','type','text','required',false));
  ELSIF _action_key IN ('BEGIN_SUSPENSION','BEGIN_REVOCATION','BEGIN_SURRENDER','BEGIN_REINSTATEMENT','BEGIN_EXPIRY_REVIEW') THEN
    v_out := jsonb_build_array(
      jsonb_build_object('key','source_kind','label','Source / trigger','type','select','required',true,
        'options', jsonb_build_array('condition_breach','prudential_matter','examination_finding','conduct_matter',
          'enforcement_case','complaint','licensing_review','entity_request','time_based_expiry','manual_referral')),
      jsonb_build_object('key','source_reference','label','Source reference','type','text','required',false),
      jsonb_build_object('key','legal_basis','label','Legal basis','type','textarea','required',false),
      jsonb_build_object('key','team','label','Owning team','type','text','required',false),
      jsonb_build_object('key','due_at','label','Target completion date','type','date','required',false));
  END IF;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.license_action_input_requirements(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_action_input_requirements(uuid, text, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.license_adverse_matter_case(_license_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  can_view boolean;
  v_matters jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  m record; tl jsonb; n record; rp record; d record; pre jsonb; cfg jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  can_view := public.is_super_admin(uid)
           OR public.has_permission(uid,'license_management','view')
           OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id=_license_id AND l.holder_id=uid);
  IF NOT can_view THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  FOR m IN
    SELECT * FROM public.license_lifecycle_matters
     WHERE license_id = _license_id
       AND matter_kind IN ('suspension','revocation','reinstatement','surrender','expiry')
     ORDER BY (status='open') DESC, opened_at DESC
  LOOP
    cfg := public.license_lifecycle_config_resolve(_license_id, m.matter_kind);
    pre := CASE WHEN m.status='open' THEN public.license_matter_prerequisites(m.id) ELSE '[]'::jsonb END;

    tl := jsonb_build_array(jsonb_build_object(
      'key','matter_opened','label','Matter opened','at', m.opened_at,
      'detail', COALESCE(m.reason, m.title),
      'actor', (SELECT full_name FROM public.profiles p WHERE p.id = m.opened_by),
      'state','done'));

    FOR n IN SELECT * FROM public.license_matter_notices WHERE matter_id=m.id ORDER BY issued_at LOOP
      tl := tl || jsonb_build_array(
        jsonb_build_object('key','notice','label','Notice issued — ' || COALESCE(n.notice_reference,'unreferenced'),
          'at', n.issued_at, 'detail', n.subject,
          'actor', (SELECT full_name FROM public.profiles p WHERE p.id = n.issued_by), 'state','done',
          'meta', jsonb_build_object('delivery_channel', n.delivery_channel,
                                     'representation_deadline', n.representation_deadline,
                                     'legal_basis', n.legal_basis)),
        jsonb_build_object('key','notice_delivery','label','Delivery evidence',
          'at', n.delivery_confirmed_at, 'detail',
          CASE WHEN n.delivery_confirmed_at IS NOT NULL
               THEN 'Delivery confirmed via ' || COALESCE(n.delivery_channel,'unknown channel')
               ELSE 'Delivery not yet confirmed' END,
          'state', CASE WHEN n.delivery_confirmed_at IS NOT NULL THEN 'done' ELSE 'pending' END,
          'meta', jsonb_build_object('evidence', n.delivery_evidence)),
        jsonb_build_object('key','representation_window','label','Representation period',
          'at', n.representation_deadline,
          'detail', CASE WHEN n.representation_deadline IS NULL THEN 'No representation period configured'
                         WHEN n.representation_deadline > now() THEN 'Open until ' || to_char(n.representation_deadline,'DD Mon YYYY')
                         ELSE 'Closed ' || to_char(n.representation_deadline,'DD Mon YYYY') END,
          'state', CASE WHEN n.representation_deadline IS NULL THEN 'skipped'
                        WHEN n.representation_deadline > now() THEN 'current' ELSE 'done' END));
    END LOOP;

    FOR rp IN SELECT * FROM public.license_matter_representations WHERE matter_id=m.id ORDER BY received_at LOOP
      tl := tl || jsonb_build_array(jsonb_build_object(
        'key', CASE WHEN rp.is_waiver THEN 'representation_waived' ELSE 'representation_received' END,
        'label', CASE WHEN rp.is_waiver THEN 'Representation period waived' ELSE 'Representation received' END,
        'at', rp.received_at,
        'detail', COALESCE(rp.summary, rp.waiver_reason),
        'actor', COALESCE(rp.submitter_name, (SELECT full_name FROM public.profiles p WHERE p.id = rp.recorded_by)),
        'state','done',
        'meta', jsonb_build_object('received_via', rp.received_via, 'is_late', rp.is_late,
                                   'documents', rp.documents)));
    END LOOP;

    tl := tl || jsonb_build_array(jsonb_build_object(
      'key','evidence_review','label','Evidence review',
      'at', m.metadata->'complete_evidence_review'->>'at',
      'detail', COALESCE(m.metadata->'complete_evidence_review'->>'note',
                         m.metadata->'complete_surrender_review'->>'note',
                         m.metadata->'complete_reinstatement_verification'->>'note'),
      'state', CASE WHEN m.stage IN ('DECISION_READY','DECIDED','CLOSED') THEN 'done'
                    WHEN m.stage IN ('EVIDENCE_REVIEW','VERIFICATION','SURRENDER_REVIEW','EXPIRY_REVIEW') THEN 'current'
                    ELSE 'pending' END));

    FOR d IN SELECT * FROM public.license_decisions WHERE matter_id=m.id ORDER BY decided_at LOOP
      tl := tl || jsonb_build_array(
        jsonb_build_object('key','decision','label','Decision — ' || d.decision_reference,
          'at', d.decided_at, 'detail', d.rationale,
          'actor', (SELECT full_name FROM public.profiles p WHERE p.id = d.actor_id), 'state','done',
          'meta', jsonb_build_object('decision', d.decision, 'authority', d.authority,
                                     'from_status', d.from_status, 'to_status', d.to_status,
                                     'legal_basis', d.legal_basis)),
        jsonb_build_object('key','effective','label','Effective date', 'at', d.effective_date,
          'detail', NULL, 'state', CASE WHEN d.effective_date IS NULL THEN 'skipped' ELSE 'done' END),
        jsonb_build_object('key','appeal','label','Appeal rights',
          'at', d.appeal_deadline,
          'detail', CASE WHEN NOT d.appealable THEN 'Decision is not appealable'
                         ELSE 'Appealable until ' || to_char(d.appeal_deadline,'DD Mon YYYY') END,
          'state', CASE WHEN NOT d.appealable THEN 'skipped'
                        WHEN d.appeal_deadline > now() THEN 'current' ELSE 'done' END));
    END LOOP;

    tl := tl || jsonb_build_array(jsonb_build_object(
      'key','closure','label','Matter closed', 'at', m.closed_at,
      'detail', CASE WHEN m.closed_at IS NULL THEN 'Matter is open' ELSE m.decision END,
      'actor', (SELECT full_name FROM public.profiles p WHERE p.id = m.closed_by),
      'state', CASE WHEN m.closed_at IS NULL THEN 'pending' ELSE 'done' END));

    v_matters := v_matters || jsonb_build_array(jsonb_build_object(
      'id', m.id, 'matter_reference', m.matter_reference, 'matter_kind', m.matter_kind,
      'title', m.title, 'stage', m.stage, 'status', m.status,
      'source_kind', m.source_kind, 'source_reference', m.source_reference, 'source_id', m.source_id,
      'legal_basis', m.legal_basis, 'reason', m.reason,
      'owner_user_id', m.owner_user_id,
      'owner_name', (SELECT full_name FROM public.profiles p WHERE p.id = m.owner_user_id),
      'team', m.team, 'sla_due_at', m.sla_due_at, 'due_at', m.due_at,
      'sla_state', CASE WHEN m.status <> 'open' THEN 'closed'
                        WHEN m.sla_due_at IS NULL THEN 'none'
                        WHEN m.sla_due_at < now() THEN 'breached'
                        WHEN m.sla_due_at < now() + interval '3 days' THEN 'at_risk'
                        ELSE 'on_track' END,
      'waiting_on', m.waiting_on, 'opened_at', m.opened_at, 'closed_at', m.closed_at,
      'effective_date', m.effective_date, 'related_matter_id', m.related_matter_id,
      'related_matter_reference', (SELECT x.matter_reference FROM public.license_lifecycle_matters x WHERE x.id = m.related_matter_id),
      'blockers', pre,
      'config', cfg,
      'timeline', tl,
      'notices', COALESCE((SELECT jsonb_agg(to_jsonb(n2) ORDER BY n2.issued_at)
                             FROM public.license_matter_notices n2 WHERE n2.matter_id=m.id), '[]'::jsonb),
      'representations', COALESCE((SELECT jsonb_agg(to_jsonb(r2) ORDER BY r2.received_at)
                             FROM public.license_matter_representations r2 WHERE r2.matter_id=m.id), '[]'::jsonb),
      'decisions', COALESCE((SELECT jsonb_agg(to_jsonb(d2) ORDER BY d2.decided_at)
                             FROM public.license_decisions d2 WHERE d2.matter_id=m.id), '[]'::jsonb)
    ));
  END LOOP;

  SELECT COALESCE(jsonb_agg(a || jsonb_build_object('input_requirements',
            public.license_action_input_requirements(_license_id, a->>'key', a->>'matter_kind'))), '[]'::jsonb)
    INTO v_actions
    FROM jsonb_array_elements(public.license_lifecycle_available_actions(_license_id)) a;

  RETURN jsonb_build_object(
    'license_id', _license_id,
    'matters', v_matters,
    'actions', v_actions,
    'decisions', COALESCE((SELECT jsonb_agg(to_jsonb(d3) ORDER BY d3.decided_at DESC)
                             FROM public.license_decisions d3 WHERE d3.license_id=_license_id), '[]'::jsonb),
    'generated_at', now());
END $$;

REVOKE ALL ON FUNCTION public.license_adverse_matter_case(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_adverse_matter_case(uuid) TO authenticated, service_role;


CREATE TABLE IF NOT EXISTS public.license_expiry_sweep_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  initiator text NOT NULL DEFAULT 'SYSTEM',
  eligible_count int NOT NULL DEFAULT 0,
  auto_expired_count int NOT NULL DEFAULT 0,
  review_created_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.license_expiry_sweep_runs TO authenticated;
GRANT ALL ON public.license_expiry_sweep_runs TO service_role;
ALTER TABLE public.license_expiry_sweep_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lesr_read" ON public.license_expiry_sweep_runs;
CREATE POLICY "lesr_read" ON public.license_expiry_sweep_runs
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'license_management','view'));

CREATE OR REPLACE FUNCTION public.license_expiry_sweep_run(_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run uuid; v_res jsonb; v_eligible int; v_skipped int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501',
      DETAIL='license_expiry_sweep_run is a service-role operation and cannot be executed by a signed-in session.';
  END IF;

  INSERT INTO public.license_expiry_sweep_runs(initiator) VALUES ('SYSTEM') RETURNING id INTO v_run;

  SELECT count(*) INTO v_eligible FROM public.licenses l
   WHERE l.status IN ('active','restricted') AND l.valid_until IS NOT NULL AND l.valid_until < now();

  v_res := public.license_expiry_sweep(_limit);
  v_skipped := GREATEST(v_eligible - COALESCE((v_res->>'lapsed')::int,0) - COALESCE((v_res->>'reviews_opened')::int,0), 0);

  UPDATE public.license_expiry_sweep_runs
     SET finished_at = now(), eligible_count = v_eligible,
         auto_expired_count = COALESCE((v_res->>'lapsed')::int,0),
         review_created_count = COALESCE((v_res->>'reviews_opened')::int,0),
         skipped_count = v_skipped, result = v_res
   WHERE id = v_run;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'license.lifecycle.expiry_sweep_run', 'license_expiry_sweep_run', v_run,
          jsonb_build_object('eligible', v_eligible, 'result', v_res));

  RETURN jsonb_build_object('run_id', v_run, 'eligible_count', v_eligible,
    'auto_expired_count', COALESCE((v_res->>'lapsed')::int,0),
    'review_created_count', COALESCE((v_res->>'reviews_opened')::int,0),
    'skipped_count', v_skipped, 'errors', '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.license_expiry_sweep_run(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.license_expiry_sweep_run(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.license_expiry_sweep_run(integer) TO service_role;