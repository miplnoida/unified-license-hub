-- OS-02D — Monitoring-to-Supervisory-Action Convergence
-- Continuous Monitoring stays a read model. This migration adds:
--   * a non-raising twin of the canonical entity-scope predicate (single source),
--   * a server-authoritative action capability contract for a monitoring row,
--   * an explicit canonical provenance read for every material monitoring state,
--   * two convergence commands that DELEGATE to the canonical attention and
--     reassessment contracts and are idempotent on a repeated condition.
-- No monitoring table, case, queue, finding, alert or risk rating is created.

/* ------------------------------------------------- scope predicate (twin) -- */

CREATE OR REPLACE FUNCTION public.supervisory_entity_scope_permits(_uid uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _entity_id IS NULL
      OR public.is_super_admin(_uid)
      OR public.has_permission(_uid, 'supervisory_spine', 'view_all_entities')
      OR public.has_permission(_uid, 'prudential_supervision', 'view_all_entities')
      OR public.user_has_entity_assignment(_uid, _entity_id);
$$;

COMMENT ON FUNCTION public.supervisory_entity_scope_permits(uuid, uuid) IS
  'Non-raising twin of supervisory_entity_scope_check. Reports authority, never grants it.';

-- The raising check now delegates, so a capability preview can never diverge
-- from what the canonical command will enforce.
CREATE OR REPLACE FUNCTION public.supervisory_entity_scope_check(_uid uuid, _entity_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.supervisory_entity_scope_permits(_uid, _entity_id) THEN RETURN; END IF;
  RAISE EXCEPTION 'not_authorized: entity outside your supervisory scope' USING ERRCODE = '42501';
END $$;

REVOKE ALL ON FUNCTION public.supervisory_entity_scope_permits(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_entity_scope_permits(uuid, uuid) TO authenticated, service_role;

/* ------------------------------------------------- capability contract ----- */

CREATE OR REPLACE FUNCTION public.supervisory_monitoring_action_capabilities(
  _entity_id uuid, _domain_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _dom text; _sc jsonb; _reg uuid; _sec uuid; _in_scope boolean;
  _may_create boolean; _may_review boolean; _may_examine boolean; _scoped boolean;
  _att record; _req record; _plan record; _iv record; _exam record; _asmt record;
  _sig record; _fnd record; _rem record; _wrk record; _iv_kind text;
  _acts jsonb := '[]'::jsonb;
BEGIN
  _uid := public.sup_read_guard();
  _dom := upper(btrim(COALESCE(_domain_code, '')));
  IF NOT public.supervisory_domain_valid(_dom) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;

  _sc  := public.entity_regulatory_scope(_entity_id);
  _reg := NULLIF(_sc->>'regulator_id','')::uuid;
  _sec := NULLIF(_sc->>'sector_id','')::uuid;
  _in_scope := public.supervisory_monitoring_scope_admits(_uid, _dom, _entity_id, _reg, _sec);

  -- Permission sets are the SAME arrays the canonical commands require. A
  -- capability is a preview of the server's decision, never a second rule.
  _may_create  := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'supervisory_spine.create','aml_supervision.create',
      'prudential_supervision.record_camels_assessment',
      'market_conduct.run_conduct_analytics','aml_supervision.approve']);
  _may_review  := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'aml_supervision.review','aml_supervision.approve','aml_supervision.remediation_manage',
      'supervisory_spine.edit','supervisory_spine.approve',
      'prudential_supervision.manage_remediation','market_conduct.approve',
      'inspection_management.edit']);
  _may_examine := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'supervisory_spine.create','aml_supervision.examine',
      'prudential_supervision.manage_examination',
      'market_conduct.run_conduct_analytics','aml_supervision.approve']);
  _scoped := public.supervisory_entity_scope_permits(_uid, _entity_id);

  IF NOT _in_scope THEN
    RETURN jsonb_build_object(
      'entity_id', _entity_id, 'domain_code', _dom, 'as_of', now(),
      'readable', false,
      'reason', 'This entity and supervisory area are outside your authorised scope.',
      'actions', '[]'::jsonb);
  END IF;

  SELECT t.id, t.reference, t.status INTO _att
    FROM public.supervisory_attention t
   WHERE t.closed_at IS NULL
     AND COALESCE(t.domain_code,'CROSS_DOMAIN') = _dom
     AND _entity_id = ANY (COALESCE(t.entity_ids, ARRAY[]::uuid[]))
   ORDER BY t.created_at DESC, t.id LIMIT 1;

  SELECT rr.id, rr.status, rr.due_date, rr.trigger_kind INTO _req
    FROM public.supervisory_reassessment_requirement rr
   WHERE rr.entity_id = _entity_id
     AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = _dom
     AND upper(COALESCE(rr.status,'')) IN ('REQUIRED','IN_PROGRESS')
   ORDER BY rr.due_date NULLS LAST, rr.created_at, rr.id LIMIT 1;

  SELECT p.id, p.reference, p.status INTO _plan
    FROM public.supervisory_plan p
   WHERE p.completed_at IS NULL
     AND COALESCE(p.domain_code,'CROSS_DOMAIN') = _dom
     AND _entity_id = ANY (COALESCE(p.entity_ids, ARRAY[]::uuid[]))
   ORDER BY (upper(COALESCE(p.status,'')) IN ('APPROVED','ACTIVE')) DESC,
            p.activated_at DESC NULLS LAST, p.created_at DESC, p.id LIMIT 1;

  SELECT v.id, v.reference, v.status, v.intervention_type INTO _iv
    FROM public.supervisory_intervention v
   WHERE v.completed_at IS NULL AND v.licensee_id = _entity_id
     AND COALESCE(v.domain_code,'CROSS_DOMAIN') = _dom
   ORDER BY (upper(COALESCE(v.status,'')) IN ('ENDORSED','ACTIVE')) DESC,
            v.activated_at DESC NULLS LAST, v.created_at DESC, v.id LIMIT 1;

  SELECT x.id, x.reference, x.stage, x.engagement_type INTO _exam
    FROM public.examinations x
   WHERE x.closed_at IS NULL AND x.entity_id = _entity_id
     AND COALESCE(x.domain_code,'CROSS_DOMAIN') = _dom
   ORDER BY x.created_at DESC, x.id LIMIT 1;

  SELECT a.id, a.reference, a.residual_rating INTO _asmt
    FROM public.supervisory_assessment a
   WHERE a.entity_id = _entity_id
     AND COALESCE(a.domain_code,'CROSS_DOMAIN') = _dom
     AND a.approved_at IS NOT NULL AND upper(COALESCE(a.status,'')) = 'APPROVED'
   ORDER BY a.is_current DESC NULLS LAST, a.approved_at DESC, a.id LIMIT 1;

  SELECT g.id, g.severity INTO _sig
    FROM public.supervisory_signal g
   WHERE g.entity_id = _entity_id AND COALESCE(g.domain_code,'CROSS_DOMAIN') = _dom
   ORDER BY CASE upper(COALESCE(g.severity,''))
              WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
              WHEN 'MATERIAL' THEN 3 WHEN 'MEDIUM' THEN 4 ELSE 5 END,
            g.detected_at DESC, g.id LIMIT 1;

  SELECT f.id, f.reference, f.severity INTO _fnd
    FROM public.supervisory_finding f
   WHERE f.entity_id = _entity_id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = _dom
     AND upper(COALESCE(f.status,'')) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
   ORDER BY CASE upper(COALESCE(f.severity,''))
              WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
              WHEN 'MEDIUM' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END, f.id LIMIT 1;

  SELECT r.id, r.target_date INTO _rem
    FROM public.supervisory_remediation_action r
   WHERE r.entity_id = _entity_id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = _dom
     AND r.closed_at IS NULL
   ORDER BY r.target_date NULLS LAST, r.id LIMIT 1;

  SELECT w.work_key, w.reference, w.route, w.due_date INTO _wrk
    FROM public.supervisory_work_item w
   WHERE w.entity_id = _entity_id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = _dom
   ORDER BY w.is_overdue DESC, w.due_date NULLS LAST, w.sort_order NULLS LAST, w.work_key LIMIT 1;

  IF _iv.id IS NOT NULL THEN
    _iv_kind := public.supervisory_intervention_execution_contract(_iv.intervention_type)->>'execution_kind';
  END IF;

  /* --- navigation to canonical records (read authority only) --- */
  _acts := _acts || jsonb_build_array(
    jsonb_build_object('code','OPEN_ASSESSMENT','label','Open approved assessment',
      'kind','NAVIGATE','allowed', _asmt.id IS NOT NULL,
      'reason', CASE WHEN _asmt.id IS NULL
        THEN 'No approved assessment exists for this supervisory area.' END,
      'target', CASE WHEN _asmt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_assessment','record_id',_asmt.id,'reference',_asmt.reference,
        'route','/supervision/assessments/' || _asmt.id) END),

    jsonb_build_object('code','REVIEW_ATTENTION','label','Review supervisory attention',
      'kind','NAVIGATE','allowed', _att.id IS NOT NULL,
      'reason', CASE WHEN _att.id IS NULL
        THEN 'No open supervisory attention exists for this entity and area.' END,
      'target', CASE WHEN _att.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_attention','record_id',_att.id,'reference',_att.reference,
        'route','/conduct/attention/' || _att.id,'status',_att.status) END),

    jsonb_build_object('code','OPEN_PLAN','label','Open supervisory plan',
      'kind','NAVIGATE','allowed', _plan.id IS NOT NULL,
      'reason', CASE WHEN _plan.id IS NULL
        THEN 'No supervisory plan covers this entity for this area.' END,
      'target', CASE WHEN _plan.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_plan','record_id',_plan.id,'reference',_plan.reference,
        'route','/supervision/plans','status',_plan.status,
        'note','The plan register is the canonical plan surface; no per-plan workspace route exists.') END),

    jsonb_build_object('code','OPEN_INTERVENTION','label','Open intervention',
      'kind','NAVIGATE','allowed', _iv.id IS NOT NULL,
      'reason', CASE WHEN _iv.id IS NULL
        THEN 'No open intervention exists for this entity and area.' END,
      'target', CASE WHEN _iv.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_intervention','record_id',_iv.id,'reference',_iv.reference,
        'route','/conduct/interventions/' || _iv.id,'status',_iv.status,
        'intervention_type',_iv.intervention_type,'execution_kind',_iv_kind) END),

    jsonb_build_object('code','OPEN_ENGAGEMENT','label','Open examination / engagement',
      'kind','NAVIGATE','allowed', _exam.id IS NOT NULL,
      'reason', CASE WHEN _exam.id IS NULL
        THEN 'No active examination or offsite review exists for this entity and area.' END,
      'target', CASE WHEN _exam.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','examinations','record_id',_exam.id,'reference',_exam.reference,
        'route','/supervision/examinations/' || _exam.id,'stage',_exam.stage,
        'engagement_type',_exam.engagement_type) END),

    jsonb_build_object('code','OPEN_FINDING','label','Open finding',
      'kind','NAVIGATE','allowed', _fnd.id IS NOT NULL,
      'reason', CASE WHEN _fnd.id IS NULL THEN 'No open finding exists for this area.' END,
      'target', CASE WHEN _fnd.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_finding','record_id',_fnd.id,'reference',_fnd.reference,
        'route','/supervision/findings/' || _fnd.id,'severity',_fnd.severity) END),

    jsonb_build_object('code','OPEN_WORK_ITEM','label','Open next supervisory work item',
      'kind','NAVIGATE','allowed', _wrk.work_key IS NOT NULL,
      'reason', CASE WHEN _wrk.work_key IS NULL
        THEN 'No supervisory work item is outstanding for this entity and area.' END,
      'target', CASE WHEN _wrk.work_key IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_work_item','record_id',NULL,'reference',
        COALESCE(_wrk.reference,_wrk.work_key),'route',_wrk.route,'due_date',_wrk.due_date) END));

  /* --- governed write actions --- */
  _acts := _acts || jsonb_build_array(
    jsonb_build_object('code','RAISE_ATTENTION','label','Raise supervisory attention',
      'kind','COMMAND','command','supervisory_monitoring_raise_attention',
      'allowed', (_may_create AND _scoped AND _att.id IS NULL
                  AND (_asmt.id IS NOT NULL OR _sig.id IS NOT NULL)),
      'reason', CASE
        WHEN NOT _may_create THEN 'You may view this entity but you are not authorised to open supervisory attention.'
        WHEN NOT _scoped THEN 'This entity is outside your supervisory scope for action purposes.'
        WHEN _att.id IS NOT NULL THEN 'An open supervisory attention already exists (' ||
             COALESCE(_att.reference,'reference unavailable') || '); review it instead of opening a second one.'
        WHEN _asmt.id IS NULL AND _sig.id IS NULL THEN
             'Attention requires a canonical origin: no approved assessment and no supervisory signal exists for this area.'
        END,
      'requires','A canonical origin (approved assessment or supervisory signal) and a supervisory basis of at least 20 characters.',
      'origin', CASE WHEN _sig.id IS NOT NULL
        THEN jsonb_build_object('origin_kind','EWI_SIGNAL','signal_id',_sig.id,'severity',_sig.severity)
        WHEN _asmt.id IS NOT NULL
        THEN jsonb_build_object('origin_kind','SUPERVISORY_ASSESSMENT','assessment_id',_asmt.id,
                                'reference',_asmt.reference)
        ELSE NULL END,
      'target', CASE WHEN _att.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_attention','record_id',_att.id,'reference',_att.reference) END),

    jsonb_build_object('code','REQUIRE_REASSESSMENT','label','Require reassessment',
      'kind','COMMAND','command','supervisory_monitoring_require_reassessment',
      'allowed', (_may_review AND _scoped AND _req.id IS NULL
                  AND (_asmt.id IS NOT NULL OR _sig.id IS NOT NULL)),
      'reason', CASE
        WHEN NOT _may_review THEN 'You may view this entity but you are not authorised to require a reassessment.'
        WHEN NOT _scoped THEN 'This entity is outside your supervisory scope for action purposes.'
        WHEN _req.id IS NOT NULL THEN 'A reassessment requirement is already outstanding (' ||
             upper(COALESCE(_req.status,'')) || '); the existing requirement governs.'
        WHEN _asmt.id IS NULL AND _sig.id IS NULL THEN
             'A reassessment requirement needs canonical provenance: no approved assessment and no supervisory signal exists.'
        END,
      'requires','Canonical provenance and a trigger rationale of at least 20 characters. The authoritative risk rating is unchanged until a new assessment is approved.',
      'origin', CASE WHEN _sig.id IS NOT NULL
        THEN jsonb_build_object('trigger_kind','MATERIAL_SIGNAL','signal_id',_sig.id)
        WHEN _asmt.id IS NOT NULL
        THEN jsonb_build_object('trigger_kind','SUPERVISORY_DIRECTION','previous_assessment_id',_asmt.id)
        ELSE NULL END,
      'target', CASE WHEN _req.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_reassessment_requirement','record_id',_req.id,
        'status',_req.status,'due_date',_req.due_date,'trigger_kind',_req.trigger_kind) END),

    -- Deliberately not executable from monitoring: a plan is a supervisory
    -- decision, an intervention needs an approved plan, and an engagement needs
    -- an endorsed examination-backed intervention. Monitoring reports the gate.
    jsonb_build_object('code','PROPOSE_PLAN','label','Take to a supervisory plan',
      'kind','GATED','allowed', false,
      'reason', CASE
        WHEN _att.id IS NULL THEN 'A supervisory plan is opened from a confirmed attention item; open attention first.'
        WHEN _plan.id IS NOT NULL THEN 'A supervisory plan already covers this entity ('
             || COALESCE(_plan.reference,'reference unavailable') || ').'
        ELSE 'Open the attention item and raise the plan there: planning is a supervisory decision, not a monitoring output.'
        END,
      'target', CASE WHEN _att.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_attention','record_id',_att.id,'reference',_att.reference,
        'route','/conduct/attention/' || _att.id) END),

    jsonb_build_object('code','PROPOSE_ENGAGEMENT','label','Open an examination / offsite review',
      'kind','GATED','allowed', false,
      'reason', CASE
        WHEN NOT _may_examine THEN 'You are not authorised to open an examination.'
        WHEN _exam.id IS NOT NULL THEN 'An engagement is already open ('
             || COALESCE(_exam.reference,'reference unavailable') || ').'
        WHEN _iv.id IS NULL THEN 'An examination requires an approved plan and an endorsed intervention; none exists.'
        WHEN upper(COALESCE(_iv.status,'')) NOT IN ('ENDORSED','ACTIVE') THEN
             'The intervention must be endorsed before an examination is opened (current ' || _iv.status || ').'
        WHEN COALESCE(_iv_kind,'') <> 'EXAMINATION' THEN
             'This intervention is executed as ' || COALESCE(_iv_kind,'unspecified') || ' and cannot open an examination.'
        ELSE 'Open the examination from the endorsed intervention, which carries the authorising decision.'
        END,
      'target', CASE WHEN _iv.id IS NULL THEN NULL ELSE jsonb_build_object(
        'module','supervisory_intervention','record_id',_iv.id,'reference',_iv.reference,
        'route','/conduct/interventions/' || _iv.id,'status',_iv.status) END));

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _dom, 'as_of', now(), 'readable', true,
    'permissions', jsonb_build_object('may_open_attention',_may_create,
       'may_require_reassessment',_may_review,'may_open_examination',_may_examine,
       'entity_in_action_scope',_scoped),
    'lifecycle','monitoring evidence -> signal / filing issue / risk movement -> attention or reassessment -> supervisory decision / plan -> intervention -> engagement only where the intervention requires one',
    'actions', _acts);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_action_capabilities(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_action_capabilities(uuid, text) TO authenticated, service_role;

/* -------------------------------------------------------- provenance ------- */

CREATE OR REPLACE FUNCTION public.supervisory_monitoring_provenance(
  _entity_id uuid, _domain_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _dom text; _sc jsonb; _reg uuid; _sec uuid; _out jsonb := '[]'::jsonb;
BEGIN
  _uid := public.sup_read_guard();
  _dom := upper(btrim(COALESCE(_domain_code,'')));
  IF NOT public.supervisory_domain_valid(_dom) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  _sc := public.entity_regulatory_scope(_entity_id);
  _reg := NULLIF(_sc->>'regulator_id','')::uuid;
  _sec := NULLIF(_sc->>'sector_id','')::uuid;
  IF NOT public.supervisory_monitoring_scope_admits(_uid, _dom, _entity_id, _reg, _sec) THEN
    RETURN jsonb_build_object('readable', false,
      'reason','This entity and supervisory area are outside your authorised scope.',
      'items','[]'::jsonb);
  END IF;

  SELECT _out || COALESCE(jsonb_agg(i ORDER BY i->>'state'), '[]'::jsonb) INTO _out FROM (
    SELECT jsonb_build_object('state','RESIDUAL_RISK','present',true,
             'source_table','entity_risk_state <- supervisory_assessment (approved)',
             'source_id', s.driving_assessment_id, 'value', s.residual_rating,
             'as_of', s.effective_from,
             'route', CASE WHEN s.driving_assessment_id IS NOT NULL
                      THEN '/supervision/assessments/' || s.driving_assessment_id END) AS i
      FROM public.entity_risk_state s
     WHERE s.entity_id = _entity_id AND COALESCE(s.domain_code,'CROSS_DOMAIN') = _dom
    UNION ALL
    SELECT jsonb_build_object('state','APPROVED_ASSESSMENT','present',true,
             'source_table','supervisory_assessment','source_id',a.id,'reference',a.reference,
             'value',a.residual_rating,'as_of',a.approved_at,
             'route','/supervision/assessments/' || a.id)
      FROM public.supervisory_assessment a
     WHERE a.entity_id = _entity_id AND COALESCE(a.domain_code,'CROSS_DOMAIN') = _dom
       AND a.approved_at IS NOT NULL AND upper(COALESCE(a.status,'')) = 'APPROVED'
       AND a.is_current
    UNION ALL
    SELECT jsonb_build_object('state','REASSESSMENT_REQUIREMENT','present',true,
             'source_table','supervisory_reassessment_requirement','source_id',rr.id,
             'value',rr.trigger_kind,'status',rr.status,'as_of',rr.created_at,
             'due_date',rr.due_date,'route',NULL,
             'note','The requirement is governed from the assessment workspace; it has no separate screen.')
      FROM public.supervisory_reassessment_requirement rr
     WHERE rr.entity_id = _entity_id AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = _dom
       AND upper(COALESCE(rr.status,'')) IN ('REQUIRED','IN_PROGRESS')
    UNION ALL
    SELECT jsonb_build_object('state','SUPERVISORY_SIGNAL','present',true,
             'source_table','supervisory_signal','source_id',g.id,'value',g.severity,
             'as_of',g.detected_at,'route',NULL,
             'note','No dedicated signal workspace exists for the supervisory spine signal; the record is canonical.')
      FROM public.supervisory_signal g
     WHERE g.entity_id = _entity_id AND COALESCE(g.domain_code,'CROSS_DOMAIN') = _dom
    UNION ALL
    SELECT jsonb_build_object('state','SUPERVISORY_ATTENTION','present',true,
             'source_table','supervisory_attention','source_id',t.id,'reference',t.reference,
             'status',t.status,'as_of',t.created_at,'route','/conduct/attention/' || t.id)
      FROM public.supervisory_attention t
     WHERE t.closed_at IS NULL AND COALESCE(t.domain_code,'CROSS_DOMAIN') = _dom
       AND _entity_id = ANY (COALESCE(t.entity_ids, ARRAY[]::uuid[]))
    UNION ALL
    SELECT jsonb_build_object('state','SUPERVISORY_PLAN','present',true,
             'source_table','supervisory_plan','source_id',p.id,'reference',p.reference,
             'status',p.status,'as_of',p.created_at,'route','/supervision/plans')
      FROM public.supervisory_plan p
     WHERE p.completed_at IS NULL AND COALESCE(p.domain_code,'CROSS_DOMAIN') = _dom
       AND _entity_id = ANY (COALESCE(p.entity_ids, ARRAY[]::uuid[]))
    UNION ALL
    SELECT jsonb_build_object('state','INTERVENTION','present',true,
             'source_table','supervisory_intervention','source_id',v.id,'reference',v.reference,
             'status',v.status,'value',v.intervention_type,'as_of',v.created_at,
             'route','/conduct/interventions/' || v.id)
      FROM public.supervisory_intervention v
     WHERE v.completed_at IS NULL AND v.licensee_id = _entity_id
       AND COALESCE(v.domain_code,'CROSS_DOMAIN') = _dom
    UNION ALL
    SELECT jsonb_build_object('state','ENGAGEMENT','present',true,
             'source_table','examinations','source_id',x.id,'reference',x.reference,
             'status',x.stage,'value',x.engagement_type,'as_of',x.created_at,
             'route','/supervision/examinations/' || x.id)
      FROM public.examinations x
     WHERE x.closed_at IS NULL AND x.entity_id = _entity_id
       AND COALESCE(x.domain_code,'CROSS_DOMAIN') = _dom
    UNION ALL
    SELECT jsonb_build_object('state','FINDING','present',true,
             'source_table','supervisory_finding','source_id',f.id,'reference',f.reference,
             'status',f.status,'value',f.severity,'as_of',COALESCE(f.issued_at,f.created_at),
             'route','/supervision/findings/' || f.id)
      FROM public.supervisory_finding f
     WHERE f.entity_id = _entity_id AND COALESCE(f.domain_code,'CROSS_DOMAIN') = _dom
       AND upper(COALESCE(f.status,'')) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
    UNION ALL
    SELECT jsonb_build_object('state','REMEDIATION_ACTION','present',true,
             'source_table','supervisory_remediation_action','source_id',r.id,
             'status',r.status,'as_of',r.created_at,'due_date',r.target_date,'route',NULL,
             'note','Remediation is governed inside the owning finding workspace.')
      FROM public.supervisory_remediation_action r
     WHERE r.entity_id = _entity_id AND COALESCE(r.domain_code,'CROSS_DOMAIN') = _dom
       AND r.closed_at IS NULL
    UNION ALL
    SELECT jsonb_build_object('state','WORK_ITEM','present',true,
             'source_table','supervisory_work_item','source_id',NULL,
             'reference',COALESCE(w.reference,w.work_key),'value',w.work_type,
             'due_date',w.due_date,'route',w.route)
      FROM public.supervisory_work_item w
     WHERE w.entity_id = _entity_id AND COALESCE(w.domain_code,'CROSS_DOMAIN') = _dom
    UNION ALL
    SELECT jsonb_build_object('state','FILING_OBLIGATION','present',true,
             'source_table','entity_reporting_obligations -> reporting_periods -> return_filings',
             'source_id',o.id,'as_of',o.updated_at,'route','/returns',
             'note','Filing obligations are recorded at entity level, not per supervisory area.')
      FROM public.entity_reporting_obligations o
     WHERE o.entity_id = _entity_id
  ) q(i);

  RETURN jsonb_build_object('entity_id',_entity_id,'domain_code',_dom,'as_of',now(),
    'readable',true,'items',_out,
    'note','Only states with a canonical record are listed; an absent state has no canonical source and is not inferred.');
END $$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_provenance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_provenance(uuid, text) TO authenticated, service_role;

/* --------------------------------------------- convergence command: attention */

CREATE OR REPLACE FUNCTION public.supervisory_monitoring_raise_attention(
  _entity_id uuid, _domain_code text, _supervisory_basis text,
  _signal_id uuid DEFAULT NULL, _assessment_id uuid DEFAULT NULL,
  _materiality text DEFAULT 'high', _urgency text DEFAULT 'high',
  _target_review_date date DEFAULT NULL, _title text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _dom text; _origin text; _sig uuid; _asmt uuid; _existing record; _res jsonb;
BEGIN
  -- Authority is decided by the canonical command; monitoring adds no authority.
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create','aml_supervision.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);
  _dom := upper(btrim(COALESCE(_domain_code,'')));
  IF NOT public.supervisory_domain_valid(_dom) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;

  -- Provenance must be a real canonical record for THIS entity and area.
  SELECT g.id INTO _sig FROM public.supervisory_signal g
   WHERE g.id = _signal_id AND g.entity_id = _entity_id
     AND COALESCE(g.domain_code,'CROSS_DOMAIN') = _dom;
  IF _signal_id IS NOT NULL AND _sig IS NULL THEN
    RAISE EXCEPTION 'provenance_invalid: the signal does not belong to this entity and supervisory area'
      USING ERRCODE = '22023';
  END IF;
  IF _sig IS NULL THEN
    SELECT a.id INTO _asmt FROM public.supervisory_assessment a
     WHERE a.entity_id = _entity_id AND COALESCE(a.domain_code,'CROSS_DOMAIN') = _dom
       AND a.approved_at IS NOT NULL AND upper(COALESCE(a.status,'')) = 'APPROVED'
       AND (_assessment_id IS NULL OR a.id = _assessment_id)
     ORDER BY a.is_current DESC NULLS LAST, a.approved_at DESC, a.id LIMIT 1;
    IF _asmt IS NULL THEN
      RAISE EXCEPTION 'provenance_required: attention needs an approved assessment or a supervisory signal for this entity and area'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  _origin := CASE WHEN _sig IS NOT NULL THEN 'EWI_SIGNAL' ELSE 'SUPERVISORY_ASSESSMENT' END;

  -- Idempotency / de-duplication boundary: one open attention per
  -- (entity, domain, origin record). A repeated occurrence of the SAME
  -- underlying condition records history on the existing item and creates
  -- nothing. A genuinely different origin record produces its own attention.
  SELECT t.id, t.reference, t.status INTO _existing
    FROM public.supervisory_attention t
    JOIN public.supervisory_attention_origin o ON o.attention_id = t.id
   WHERE t.closed_at IS NULL
     AND COALESCE(t.domain_code,'CROSS_DOMAIN') = _dom
     AND _entity_id = ANY (COALESCE(t.entity_ids, ARRAY[]::uuid[]))
     AND o.origin_kind = _origin
     AND COALESCE(o.signal_id, o.assessment_id) IS NOT DISTINCT FROM COALESCE(_sig, _asmt)
   ORDER BY t.created_at, t.id LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    INSERT INTO public.supervisory_attention_event(attention_id, event_type, to_state, rationale,
      detail, actor_id)
    VALUES (_existing.id, 'MONITORING_OCCURRENCE', _existing.status, btrim(_supervisory_basis),
      jsonb_build_object('domain_code',_dom,'origin_kind',_origin,
        'signal_id',_sig,'assessment_id',_asmt,'source','continuous_monitoring'), _uid);
    PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,'supervisory_attention',_existing.id::text, NULL::jsonb,
      jsonb_build_object('reference',_existing.reference,'origin_kind',_origin,
        'deduplicated',true),
      'Repeated monitoring occurrence recorded on existing supervisory attention '
        || COALESCE(_existing.reference,''));
    RETURN jsonb_build_object('created',false,'deduplicated',true,
      'attention_id',_existing.id,'reference',_existing.reference,'status',_existing.status,
      'route','/conduct/attention/' || _existing.id,
      'reason','An open supervisory attention already exists for this condition; the recurrence was recorded on it.');
  END IF;

  _res := public.supervisory_attention_open(
    _title := COALESCE(NULLIF(btrim(COALESCE(_title,'')),''),
      'Continuous monitoring escalation - ' || replace(_dom,'_',' ')),
    _domain_code := _dom,
    _supervisory_basis := _supervisory_basis,
    _origin_kind := _origin,
    _entity_ids := ARRAY[_entity_id],
    _assessment_id := _asmt,
    _signal_id := _sig,
    _materiality := COALESCE(_materiality,'high'),
    _urgency := COALESCE(_urgency,'high'),
    _target_review_date := _target_review_date);

  RETURN _res || jsonb_build_object('created',true,'deduplicated',false,
    'attention_id', _res->>'id',
    'route','/conduct/attention/' || (_res->>'id'),
    'origin_kind',_origin,'signal_id',_sig,'assessment_id',_asmt);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_raise_attention(uuid, text, text, uuid, uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_raise_attention(uuid, text, text, uuid, uuid, text, text, date, text) TO authenticated, service_role;

/* ----------------------------------------- convergence command: reassessment */

CREATE OR REPLACE FUNCTION public.supervisory_monitoring_require_reassessment(
  _entity_id uuid, _domain_code text, _trigger_rationale text,
  _signal_id uuid DEFAULT NULL, _requested_type text DEFAULT 'TARGETED',
  _due_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _dom text; _sig uuid; _asmt uuid; _trigger text; _existing record; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.review','aml_supervision.approve',
    'aml_supervision.remediation_manage','supervisory_spine.edit','supervisory_spine.approve',
    'prudential_supervision.manage_remediation','market_conduct.approve',
    'inspection_management.edit']);
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);
  _dom := upper(btrim(COALESCE(_domain_code,'')));
  IF NOT public.supervisory_domain_valid(_dom) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;

  SELECT g.id INTO _sig FROM public.supervisory_signal g
   WHERE g.id = _signal_id AND g.entity_id = _entity_id
     AND COALESCE(g.domain_code,'CROSS_DOMAIN') = _dom;
  IF _signal_id IS NOT NULL AND _sig IS NULL THEN
    RAISE EXCEPTION 'provenance_invalid: the signal does not belong to this entity and supervisory area'
      USING ERRCODE = '22023';
  END IF;
  SELECT a.id INTO _asmt FROM public.supervisory_assessment a
   WHERE a.entity_id = _entity_id AND COALESCE(a.domain_code,'CROSS_DOMAIN') = _dom
     AND a.approved_at IS NOT NULL AND upper(COALESCE(a.status,'')) = 'APPROVED'
   ORDER BY a.is_current DESC NULLS LAST, a.approved_at DESC, a.id LIMIT 1;
  IF _sig IS NULL AND _asmt IS NULL THEN
    RAISE EXCEPTION 'provenance_required: a reassessment requirement needs an approved assessment or a supervisory signal'
      USING ERRCODE = '22023';
  END IF;
  _trigger := CASE WHEN _sig IS NOT NULL THEN 'MATERIAL_SIGNAL' ELSE 'SUPERVISORY_DIRECTION' END;

  -- Idempotency: one outstanding requirement per (entity, domain, trigger, origin).
  SELECT rr.id, rr.status, rr.due_date INTO _existing
    FROM public.supervisory_reassessment_requirement rr
   WHERE rr.entity_id = _entity_id AND COALESCE(rr.domain_code,'CROSS_DOMAIN') = _dom
     AND upper(COALESCE(rr.status,'')) IN ('REQUIRED','IN_PROGRESS')
     AND rr.trigger_kind = _trigger
     AND rr.signal_id IS NOT DISTINCT FROM _sig
   ORDER BY rr.created_at, rr.id LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,'supervisory_reassessment_requirement',
      _existing.id::text, NULL::jsonb,
      jsonb_build_object('trigger',_trigger,'domain',_dom,'deduplicated',true),
      'Repeated monitoring occurrence - existing reassessment requirement retained; authoritative risk unchanged');
    RETURN jsonb_build_object('created',false,'deduplicated',true,
      'requirement_id',_existing.id,'status',_existing.status,'due_date',_existing.due_date,
      'reason','A reassessment requirement is already outstanding for this condition.');
  END IF;

  _id := public.supervisory_reassessment_require(
    _entity_id := _entity_id, _domain_code := _dom, _trigger_kind := _trigger,
    _trigger_rationale := _trigger_rationale, _requested_type := COALESCE(_requested_type,'TARGETED'),
    _due_date := _due_date, _previous_assessment_id := _asmt, _signal_id := _sig);

  RETURN jsonb_build_object('created',true,'deduplicated',false,'requirement_id',_id,
    'status','REQUIRED','trigger_kind',_trigger,'signal_id',_sig,
    'previous_assessment_id',_asmt,
    'note','The authoritative risk rating is unchanged until a new assessment is approved.');
END $$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_require_reassessment(uuid, text, text, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_require_reassessment(uuid, text, text, uuid, text, date) TO authenticated, service_role;