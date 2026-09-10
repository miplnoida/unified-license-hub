-- AML-08 — POST-PUBLICATION SUPERVISORY CONSEQUENCE & ACTION LINKAGE

CREATE TABLE IF NOT EXISTS public.supervisory_consequence_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  domain_code text NOT NULL,
  regulator_id uuid,
  sector_id uuid,
  source_kind text NOT NULL,
  publication_id uuid REFERENCES public.supervisory_assessment_risk_publication(id) ON DELETE RESTRICT,
  risk_state_id uuid REFERENCES public.entity_risk_state(id) ON DELETE RESTRICT,
  assessment_id uuid REFERENCES public.supervisory_assessment(id) ON DELETE RESTRICT,
  approval_decision_id uuid REFERENCES public.supervisory_assessment_approval_decision(id) ON DELETE RESTRICT,
  calculation_run_id uuid REFERENCES public.supervisory_assessment_calculation_run(id) ON DELETE RESTRICT,
  override_id uuid REFERENCES public.supervisory_assessment_calculation_override(id) ON DELETE RESTRICT,
  source_rating text,
  rating_provenance text NOT NULL,
  calculation_availability text NOT NULL DEFAULT 'UNAVAILABLE',
  action_type text NOT NULL,
  linkage_mode text NOT NULL,
  target_kind text,
  target_id uuid,
  target_reference text,
  rationale text NOT NULL,
  supervisory_objective text,
  priority text,
  due_date date,
  owner_id uuid,
  status text NOT NULL DEFAULT 'RECORDED',
  superseded_by_id uuid REFERENCES public.supervisory_consequence_decision(id) ON DELETE RESTRICT,
  withdrawn_by uuid,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scd_source_kind CHECK (source_kind = ANY (ARRAY['PUBLICATION','LEGACY_RISK_RECORD'])),
  CONSTRAINT scd_provenance CHECK (rating_provenance = ANY (ARRAY['COMPUTED','APPROVED_OVERRIDE','LEGACY_OFFICER_RATING','NOT_CALCULABLE','UNAVAILABLE'])),
  CONSTRAINT scd_calc_availability CHECK (calculation_availability = ANY (ARRAY['CALCULATED','NOT_CALCULABLE','NO_RUN','UNAVAILABLE'])),
  CONSTRAINT scd_mode CHECK (linkage_mode = ANY (ARRAY['CREATE','LINK','RECORD_ONLY'])),
  CONSTRAINT scd_status CHECK (status = ANY (ARRAY['RECORDED','WITHDRAWN','SUPERSEDED'])),
  CONSTRAINT scd_rationale CHECK (length(btrim(rationale)) >= 20),
  CONSTRAINT scd_domain CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT scd_publication_source CHECK (source_kind <> 'PUBLICATION' OR publication_id IS NOT NULL),
  CONSTRAINT scd_target_shape CHECK (
    (linkage_mode = 'RECORD_ONLY' AND target_id IS NULL AND target_kind IS NULL)
    OR (linkage_mode <> 'RECORD_ONLY' AND target_id IS NOT NULL AND target_kind IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS scd_idempotency_uidx ON public.supervisory_consequence_decision(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS scd_active_target_uidx ON public.supervisory_consequence_decision(entity_id, domain_code, action_type, target_kind, target_id) WHERE status = 'RECORDED' AND target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scd_entity_idx ON public.supervisory_consequence_decision(entity_id, domain_code, decided_at DESC);
CREATE INDEX IF NOT EXISTS scd_publication_idx ON public.supervisory_consequence_decision(publication_id);

GRANT SELECT ON public.supervisory_consequence_decision TO authenticated;
GRANT ALL ON public.supervisory_consequence_decision TO service_role;
ALTER TABLE public.supervisory_consequence_decision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scd_read ON public.supervisory_consequence_decision;
CREATE POLICY scd_read ON public.supervisory_consequence_decision FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));

CREATE OR REPLACE FUNCTION public.supervisory_consequence_writer_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF current_setting('app.supervisory_consequence_writer', true) IS DISTINCT FROM 'governed' THEN
    RAISE EXCEPTION '% is written only by a governed supervisory consequence operation', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_consequence_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable: a recorded supervisory consequence decision cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.domain_code IS DISTINCT FROM OLD.domain_code
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
     OR NEW.risk_state_id IS DISTINCT FROM OLD.risk_state_id
     OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
     OR NEW.approval_decision_id IS DISTINCT FROM OLD.approval_decision_id
     OR NEW.calculation_run_id IS DISTINCT FROM OLD.calculation_run_id
     OR NEW.override_id IS DISTINCT FROM OLD.override_id
     OR NEW.source_rating IS DISTINCT FROM OLD.source_rating
     OR NEW.rating_provenance IS DISTINCT FROM OLD.rating_provenance
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.linkage_mode IS DISTINCT FROM OLD.linkage_mode
     OR NEW.target_kind IS DISTINCT FROM OLD.target_kind
     OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.rationale IS DISTINCT FROM OLD.rationale
     OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
     OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
     OR NEW.lineage IS DISTINCT FROM OLD.lineage THEN
    RAISE EXCEPTION 'immutable: the source, judgment, actor and lineage of a recorded supervisory consequence cannot be altered - withdraw or supersede it instead' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS scd_writer_guard ON public.supervisory_consequence_decision;
CREATE TRIGGER scd_writer_guard BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_consequence_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_consequence_writer_guard();
DROP TRIGGER IF EXISTS scd_immutable_guard ON public.supervisory_consequence_decision;
CREATE TRIGGER scd_immutable_guard BEFORE UPDATE OR DELETE ON public.supervisory_consequence_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_consequence_immutable_guard();

REVOKE ALL ON FUNCTION public.supervisory_consequence_writer_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_consequence_immutable_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.supervisory_consequence_target_internal(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _r jsonb; _route text;
BEGIN
  IF _id IS NULL OR _kind IS NULL THEN RETURN NULL; END IF;
  CASE upper(_kind)
    WHEN 'SUPERVISORY_PLAN' THEN
      SELECT to_jsonb(x) INTO _r FROM public.supervisory_plan x WHERE x.id = _id;
      _route := '/conduct/plans/' || _id::text;
    WHEN 'REASSESSMENT_REQUIREMENT' THEN
      SELECT to_jsonb(x) INTO _r FROM public.supervisory_reassessment_requirement x WHERE x.id = _id;
      _route := NULL;
    WHEN 'SUPERVISORY_INTERVENTION' THEN
      SELECT to_jsonb(x) INTO _r FROM public.supervisory_intervention x WHERE x.id = _id;
      _route := '/conduct/interventions/' || _id::text;
    WHEN 'EXAMINATION' THEN
      SELECT to_jsonb(x) INTO _r FROM public.examinations x WHERE x.id = _id;
      _route := '/supervision/examinations/' || _id::text;
    WHEN 'SUPERVISORY_FINDING' THEN
      SELECT to_jsonb(x) INTO _r FROM public.supervisory_finding x WHERE x.id = _id;
      _route := '/supervision/findings/' || _id::text;
    WHEN 'ENFORCEMENT_ACTION' THEN
      SELECT to_jsonb(x) INTO _r FROM public.enforcement_actions x WHERE x.id = _id;
      _route := '/enforcement/' || _id::text;
    ELSE RETURN NULL;
  END CASE;
  IF _r IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'kind', upper(_kind), 'id', _id,
    'reference', COALESCE(_r->>'reference', _r->>'case_number', _r->>'requested_type'),
    'title', COALESCE(_r->>'title', _r->>'trigger_kind'),
    'status', COALESCE(_r->>'status', _r->>'stage'),
    'entity_id', COALESCE(_r->>'entity_id', _r->>'licensee_id'),
    'entity_ids', _r->'entity_ids',
    'domain_code', _r->>'domain_code',
    'route', _route);
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_consequence_source_internal(
  _entity_id uuid, _domain_code text, _assessment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _rs public.entity_risk_state;
  _pub public.supervisory_assessment_risk_publication;
  _dec public.supervisory_assessment_approval_decision;
  _aj jsonb; _run jsonb; _ovr jsonb; _cfg uuid;
  _calc text; _prov text; _kind text; _blk jsonb := '[]'::jsonb; _pending boolean := false;
BEGIN
  SELECT * INTO _rs FROM public.entity_risk_state WHERE entity_id = _entity_id AND domain_code = _d;

  SELECT * INTO _pub FROM public.supervisory_assessment_risk_publication
   WHERE entity_id = _entity_id AND domain_code = _d
     AND (_rs.driving_assessment_id IS NULL OR assessment_id = _rs.driving_assessment_id)
   ORDER BY published_at DESC LIMIT 1;
  IF _pub.id IS NULL THEN
    SELECT * INTO _pub FROM public.supervisory_assessment_risk_publication
     WHERE entity_id = _entity_id AND domain_code = _d ORDER BY published_at DESC LIMIT 1;
  END IF;

  IF _pub.id IS NOT NULL THEN
    SELECT * INTO _dec FROM public.supervisory_assessment_approval_decision WHERE id = _pub.approval_decision_id;
    SELECT to_jsonb(x) INTO _aj FROM public.supervisory_assessment x WHERE x.id = _pub.assessment_id;
  ELSIF _assessment_id IS NOT NULL THEN
    SELECT to_jsonb(x) INTO _aj FROM public.supervisory_assessment x WHERE x.id = _assessment_id;
  ELSIF _rs.driving_assessment_id IS NOT NULL THEN
    SELECT to_jsonb(x) INTO _aj FROM public.supervisory_assessment x WHERE x.id = _rs.driving_assessment_id;
  END IF;

  IF _assessment_id IS NOT NULL THEN
    SELECT count(*) > 0 INTO _pending FROM public.supervisory_assessment_approval_decision d
     WHERE d.assessment_id = _assessment_id AND d.decision = 'APPROVED'
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p
                        WHERE p.approval_decision_id = d.id);
  END IF;

  IF _aj IS NOT NULL THEN
    SELECT jsonb_build_object('id', r.id, 'run_seq', r.run_seq, 'status', r.status,
             'residual_rating', r.residual_rating, 'inputs_hash', r.inputs_hash, 'result_hash', r.result_hash)
      INTO _run FROM public.supervisory_assessment_calculation_run r
     WHERE r.assessment_id = (_aj->>'id')::uuid AND r.status = 'CALCULATED'
     ORDER BY r.run_seq DESC LIMIT 1;
    SELECT jsonb_build_object('id', o.id, 'status', o.status, 'proposed_rating', o.proposed_rating)
      INTO _ovr FROM public.supervisory_assessment_calculation_override o
     WHERE o.assessment_id = (_aj->>'id')::uuid AND o.status = 'APPROVED'
     ORDER BY o.created_at DESC LIMIT 1;
    SELECT c.id INTO _cfg FROM public.supervisory_calculation_config c
     WHERE c.methodology_id = NULLIF(_aj->>'methodology_id','')::uuid AND c.status = 'ACTIVE'
     ORDER BY c.config_version DESC LIMIT 1;
  END IF;

  _calc := CASE
    WHEN _run IS NOT NULL THEN 'CALCULATED'
    WHEN _aj IS NULL THEN 'UNAVAILABLE'
    WHEN _cfg IS NULL THEN 'NOT_CALCULABLE'
    ELSE 'NO_RUN' END;

  _prov := CASE
    WHEN _dec.id IS NOT NULL AND _dec.final_rating_source = 'APPROVED_OVERRIDE' THEN 'APPROVED_OVERRIDE'
    WHEN _dec.id IS NOT NULL AND _dec.final_rating_source = 'COMPUTED' THEN 'COMPUTED'
    WHEN _dec.id IS NOT NULL THEN 'LEGACY_OFFICER_RATING'
    WHEN _pub.id IS NULL AND _rs.id IS NOT NULL THEN 'LEGACY_OFFICER_RATING'
    WHEN _calc = 'NOT_CALCULABLE' THEN 'NOT_CALCULABLE'
    ELSE 'UNAVAILABLE' END;

  _kind := CASE WHEN _pub.id IS NOT NULL THEN 'PUBLICATION'
                WHEN _rs.id IS NOT NULL THEN 'LEGACY_RISK_RECORD' ELSE 'NONE' END;

  IF _kind = 'NONE' THEN
    _blk := _blk || jsonb_build_array(jsonb_build_object('code','NO_RISK_OF_RECORD','blocking', true,
      'detail','No current AML/CFT risk-of-record exists for this entity, so there is no published supervisory outcome to act on.'));
  END IF;
  IF _pending AND _kind <> 'PUBLICATION' THEN
    _blk := _blk || jsonb_build_array(jsonb_build_object('code','SOURCE_NOT_PUBLISHED','blocking', true,
      'detail','This assessment is approved but its risk-of-record has not been published yet.'));
  END IF;
  IF _kind = 'LEGACY_RISK_RECORD' THEN
    _blk := _blk || jsonb_build_array(jsonb_build_object('code','LEGACY_RISK_RECORD','blocking', false,
      'detail','The current risk-of-record predates governed publication. Any action is recorded as based on a legacy risk record.'));
  END IF;
  IF _calc = 'NOT_CALCULABLE' THEN
    _blk := _blk || jsonb_build_array(jsonb_build_object('code','NOT_CALCULABLE','blocking', false,
      'detail','No approved calculation policy is in force, so no rating can be calculated. No rating, band or automatic consequence is inferred.'));
  END IF;
  IF _assessment_id IS NOT NULL AND _pub.id IS NOT NULL AND _pub.assessment_id <> _assessment_id THEN
    _blk := _blk || jsonb_build_array(jsonb_build_object('code','SOURCE_SUPERSEDED','blocking', false,
      'detail','A later publication now drives the risk-of-record. New decisions use the current published source; earlier decisions keep their own.'));
  END IF;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d, 'source_kind', _kind,
    'eligible', (_kind <> 'NONE' AND NOT (_pending AND _kind <> 'PUBLICATION')),
    'publication', CASE WHEN _pub.id IS NULL THEN NULL ELSE to_jsonb(_pub) END,
    'approval_decision', CASE WHEN _dec.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', _dec.id, 'decision', _dec.decision, 'final_rating', _dec.final_rating,
        'final_rating_source', _dec.final_rating_source, 'rationale', _dec.rationale,
        'decided_by', _dec.decided_by, 'decided_at', _dec.decided_at,
        'methodology_id', _dec.methodology_id, 'methodology_version', _dec.methodology_version,
        'programme_id', _dec.programme_id, 'question_plan_version', _dec.question_plan_version) END,
    'assessment', _aj,
    'risk_state', CASE WHEN _rs.id IS NULL THEN NULL ELSE to_jsonb(_rs) END,
    'calculation_run', _run,
    'approved_override', _ovr,
    'calculation_availability', _calc,
    'rating_provenance', _prov,
    'current_rating', _rs.residual_rating,
    'effective_from', _rs.effective_from,
    'approved_not_published', _pending,
    'blockers', _blk);
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_consequence_view(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT', _assessment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _src jsonb; _eligible boolean; _actions jsonb := '[]'::jsonb;
  _decisions jsonb := '[]'::jsonb; _linked jsonb := '[]'::jsonb; _cands jsonb := '[]'::jsonb;
  _plan_ok boolean; _iv_ok boolean; _finding_ok boolean;
  _rec record; _perm text; _avail boolean; _code text; _detail text; _dup jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _src := public.supervisory_consequence_source_internal(_entity_id, _d, _assessment_id);
  _eligible := COALESCE((_src->>'eligible')::boolean, false);

  SELECT EXISTS (SELECT 1 FROM public.supervisory_plan p
                  WHERE p.domain_code = _d AND p.status IN ('APPROVED','ACTIVE')
                    AND _entity_id = ANY (COALESCE(p.entity_ids,'{}'::uuid[]))) INTO _plan_ok;
  SELECT EXISTS (SELECT 1 FROM public.supervisory_intervention i
                  WHERE i.licensee_id = _entity_id AND upper(COALESCE(i.domain_code,'')) = _d
                    AND i.status IN ('ENDORSED','ACTIVE')) INTO _iv_ok;
  SELECT EXISTS (SELECT 1 FROM public.supervisory_finding f
                  WHERE f.entity_id = _entity_id AND upper(COALESCE(f.domain_code,'')) = _d) INTO _finding_ok;

  FOR _rec IN
    SELECT * FROM (VALUES
      ('OPEN_SUPERVISORY_PLAN','Open or link a supervisory plan','SUPERVISORY_PLAN','aml_supervision.create', ARRAY['CREATE','LINK'], NULL::text, NULL::text),
      ('REQUIRE_REASSESSMENT','Require a reassessment','REASSESSMENT_REQUIREMENT','aml_supervision.review', ARRAY['CREATE','LINK'], NULL, NULL),
      ('OPEN_INTERVENTION','Open or link a supervisory intervention','SUPERVISORY_INTERVENTION','aml_supervision.create', ARRAY['CREATE','LINK'], 'PLAN','An approved or active supervisory plan must authorise the intervention.'),
      ('OPEN_EXAMINATION','Open or link an examination','EXAMINATION','aml_supervision.examine', ARRAY['CREATE','LINK'], 'INTERVENTION','An endorsed or active supervisory intervention must authorise the examination.'),
      ('RAISE_FINDING','Create or link a supervisory finding','SUPERVISORY_FINDING','aml_supervision.finding_manage', ARRAY['CREATE','LINK'], NULL, NULL),
      ('REFER_TO_ENFORCEMENT','Refer to enforcement','ENFORCEMENT_ACTION','enforcement_management.create', ARRAY['CREATE','LINK'], 'FINDING','Enforcement is referred from a canonical supervisory finding, never from a risk rating.'),
      ('RECORD_MONITORING','Record monitoring / no immediate action', NULL,'aml_supervision.review', ARRAY['RECORD_ONLY'], NULL, NULL),
      ('RECORD_DEFERRED','Record a blocked or deferred decision', NULL,'aml_supervision.review', ARRAY['RECORD_ONLY'], NULL, NULL)
    ) AS v(action, label, target_kind, required_permission, modes, prereq, prereq_detail)
  LOOP
    _perm := _rec.required_permission;
    _avail := true; _code := 'OK'; _detail := 'Available';
    IF NOT (public.is_super_admin(_uid)
            OR public.has_permission(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2))) THEN
      _avail := false; _code := 'PERMISSION_MISSING'; _detail := 'You do not hold ' || _perm || '.';
    ELSIF NOT _eligible THEN
      _avail := false;
      _code := CASE WHEN COALESCE((_src->>'approved_not_published')::boolean,false) THEN 'SOURCE_NOT_PUBLISHED' ELSE 'NO_RISK_OF_RECORD' END;
      _detail := CASE WHEN _code = 'SOURCE_NOT_PUBLISHED'
        THEN 'The approved assessment has not published a risk-of-record yet.'
        ELSE 'No current AML/CFT risk-of-record exists for this entity.' END;
    ELSIF _rec.prereq = 'PLAN' AND NOT _plan_ok THEN
      _avail := false; _code := 'PREREQUISITE_MISSING'; _detail := _rec.prereq_detail;
    ELSIF _rec.prereq = 'INTERVENTION' AND NOT _iv_ok THEN
      _avail := false; _code := 'PREREQUISITE_MISSING'; _detail := _rec.prereq_detail;
    ELSIF _rec.prereq = 'FINDING' AND NOT _finding_ok THEN
      _avail := false; _code := 'PREREQUISITE_MISSING'; _detail := _rec.prereq_detail;
    END IF;

    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'target_kind', d.target_kind,
             'target_id', d.target_id, 'target_reference', d.target_reference, 'decided_at', d.decided_at))
      INTO _dup FROM public.supervisory_consequence_decision d
     WHERE d.entity_id = _entity_id AND d.domain_code = _d
       AND d.action_type = _rec.action AND d.status = 'RECORDED';

    _actions := _actions || jsonb_build_array(jsonb_build_object(
      'action', _rec.action, 'label', _rec.label, 'target_kind', _rec.target_kind,
      'linkage_modes', to_jsonb(_rec.modes), 'required_permission', _perm,
      'available', _avail, 'reason_code', _code, 'reason', _detail,
      'prerequisite', _rec.prereq, 'existing', COALESCE(_dup, '[]'::jsonb)));
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'action_type', d.action_type, 'linkage_mode', d.linkage_mode,
           'status', d.status, 'source_kind', d.source_kind, 'publication_id', d.publication_id,
           'assessment_id', d.assessment_id, 'source_rating', d.source_rating,
           'rating_provenance', d.rating_provenance, 'calculation_availability', d.calculation_availability,
           'rationale', d.rationale, 'supervisory_objective', d.supervisory_objective,
           'priority', d.priority, 'due_date', d.due_date, 'owner_id', d.owner_id,
           'decided_by', d.decided_by, 'decided_at', d.decided_at,
           'withdrawal_reason', d.withdrawal_reason, 'superseded_by_id', d.superseded_by_id,
           'target_kind', d.target_kind, 'target_id', d.target_id, 'target_reference', d.target_reference,
           'target', public.supervisory_consequence_target_internal(d.target_kind, d.target_id),
           'lineage', d.lineage) ORDER BY d.decided_at DESC), '[]'::jsonb)
    INTO _decisions FROM public.supervisory_consequence_decision d
   WHERE d.entity_id = _entity_id AND d.domain_code = _d;

  SELECT COALESCE(jsonb_agg(s.x), '[]'::jsonb) INTO _linked FROM (
    SELECT DISTINCT ON (d.target_kind, d.target_id)
           jsonb_build_object('action_type', d.action_type, 'decision_id', d.id,
             'target', public.supervisory_consequence_target_internal(d.target_kind, d.target_id)) AS x
      FROM public.supervisory_consequence_decision d
     WHERE d.entity_id = _entity_id AND d.domain_code = _d
       AND d.status = 'RECORDED' AND d.target_id IS NOT NULL
     ORDER BY d.target_kind, d.target_id, d.decided_at DESC) s;

  SELECT COALESCE(jsonb_agg(c ORDER BY c->>'target_kind'), '[]'::jsonb) INTO _cands FROM (
    SELECT jsonb_build_object('target_kind','SUPERVISORY_PLAN','id',p.id,'reference',p.reference,
             'title',p.title,'status',p.status) c
      FROM public.supervisory_plan p
     WHERE p.domain_code = _d AND _entity_id = ANY (COALESCE(p.entity_ids,'{}'::uuid[]))
       AND p.status NOT IN ('CANCELLED','COMPLETED')
    UNION ALL
    SELECT jsonb_build_object('target_kind','EXAMINATION','id',e.id,'reference',e.reference,
             'title',e.title,'status',e.stage)
      FROM public.examinations e
     WHERE e.entity_id = _entity_id AND upper(COALESCE(e.domain_code,_d)) = _d
    UNION ALL
    SELECT jsonb_build_object('target_kind','SUPERVISORY_FINDING','id',f.id,'reference',f.reference,
             'title',f.title,'status',f.status)
      FROM public.supervisory_finding f
     WHERE f.entity_id = _entity_id AND upper(COALESCE(f.domain_code,'')) = _d
    UNION ALL
    SELECT jsonb_build_object('target_kind','REASSESSMENT_REQUIREMENT','id',r.id,
             'reference', r.requested_type,'title', r.trigger_kind,'status', r.status)
      FROM public.supervisory_reassessment_requirement r
     WHERE r.entity_id = _entity_id AND r.domain_code = _d
    UNION ALL
    SELECT jsonb_build_object('target_kind','SUPERVISORY_INTERVENTION','id',i.id,'reference',i.reference,
             'title',i.title,'status',i.status)
      FROM public.supervisory_intervention i
     WHERE i.licensee_id = _entity_id AND upper(COALESCE(i.domain_code,'')) = _d) s2;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d, 'source', _src, 'actions', _actions,
    'linked_records', _linked, 'link_candidates', _cands, 'decisions', _decisions,
    'prerequisites', jsonb_build_object('plan', _plan_ok, 'intervention', _iv_ok, 'finding', _finding_ok),
    'viewer', jsonb_build_object('user_id', _uid));
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_consequence_view(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_consequence_source_internal(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_consequence_target_internal(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_consequence_view(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_consequence_source_internal(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_consequence_target_internal(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supervisory_consequence_record(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _entity uuid := NULLIF(_payload->>'entity_id','')::uuid;
  _d text := upper(COALESCE(NULLIF(_payload->>'domain_code',''),'AML_CFT'));
  _assessment uuid := NULLIF(_payload->>'assessment_id','')::uuid;
  _action text := upper(COALESCE(NULLIF(_payload->>'action_type',''),''));
  _mode text := upper(COALESCE(NULLIF(_payload->>'linkage_mode',''),''));
  _rationale text := btrim(COALESCE(_payload->>'rationale',''));
  _target uuid := NULLIF(_payload->>'target_id','')::uuid;
  _view jsonb; _src jsonb; _act jsonb; _tgt jsonb; _key text;
  _existing public.supervisory_consequence_decision;
  _kind text; _res jsonb; _id uuid; _reg uuid; _sector uuid; _lineage jsonb;
  _plan uuid; _iv uuid; _finding uuid; _priority text; _due date; _owner uuid; _title text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF _entity IS NULL THEN
    RAISE EXCEPTION 'entity_id is required' USING ERRCODE = '22023';
  END IF;
  IF length(_rationale) < 20 THEN
    RAISE EXCEPTION 'rationale_required: a written supervisory rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity);

  _view := public.supervisory_consequence_view(_entity, _d, _assessment);
  _src := _view->'source';

  SELECT a INTO _act FROM jsonb_array_elements(_view->'actions') a WHERE a->>'action' = _action;
  IF _act IS NULL THEN
    RAISE EXCEPTION 'unsupported_action: % is not a governed supervisory consequence', _action USING ERRCODE = '22023';
  END IF;
  IF NOT (_act->'linkage_modes' ? _mode) THEN
    RAISE EXCEPTION 'unsupported_mode: % is not permitted for %', _mode, _action USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE((_act->>'available')::boolean,false) THEN
    RAISE EXCEPTION 'action_blocked: % (%)', _act->>'reason', _act->>'reason_code' USING ERRCODE = '42501';
  END IF;

  _kind := _act->>'target_kind';
  _priority := NULLIF(_payload->>'priority','');
  _due := NULLIF(_payload->>'due_date','')::date;
  _owner := NULLIF(_payload->>'owner_id','')::uuid;
  _title := COALESCE(NULLIF(btrim(_payload->>'title'),''), 'AML/CFT supervisory consequence - ' || _action);

  SELECT l.regulator_id, l.sector_id INTO _reg, _sector FROM public.licensees l WHERE l.id = _entity;

  _key := md5(concat_ws('|', _uid::text, _entity::text, _d, _action, _mode,
    COALESCE(_target::text,'-'), COALESCE(_src->'publication'->>'id','-'),
    COALESCE(NULLIF(_payload->>'idempotency_key',''), _rationale)));

  SELECT * INTO _existing FROM public.supervisory_consequence_decision WHERE idempotency_key = _key;
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('decision_id', _existing.id, 'idempotent', true,
      'action_type', _existing.action_type, 'linkage_mode', _existing.linkage_mode,
      'target_kind', _existing.target_kind, 'target_id', _existing.target_id,
      'target', public.supervisory_consequence_target_internal(_existing.target_kind, _existing.target_id));
  END IF;

  PERFORM 1 FROM public.entity_risk_state WHERE entity_id = _entity AND domain_code = _d FOR UPDATE;

  IF _mode = 'LINK' THEN
    IF _target IS NULL THEN
      RAISE EXCEPTION 'target_id is required to link an existing record' USING ERRCODE = '22023';
    END IF;
    _tgt := public.supervisory_consequence_target_internal(_kind, _target);
    IF _tgt IS NULL
       OR (_tgt->>'domain_code' IS NOT NULL AND upper(_tgt->>'domain_code') <> _d)
       OR NOT ((NULLIF(_tgt->>'entity_id','')::uuid IS NOT DISTINCT FROM _entity)
               OR (_tgt->'entity_ids' IS NOT NULL AND jsonb_typeof(_tgt->'entity_ids') = 'array'
                   AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(_tgt->'entity_ids') e WHERE e::uuid = _entity))) THEN
      RAISE EXCEPTION 'not_found: no linkable % is available for this entity', COALESCE(_kind,'record') USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _existing FROM public.supervisory_consequence_decision
     WHERE entity_id = _entity AND domain_code = _d AND action_type = _action
       AND target_kind = _kind AND target_id = _target AND status = 'RECORDED';
    IF _existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('decision_id', _existing.id, 'duplicate', true,
        'reason_code','DUPLICATE_EXISTS',
        'reason','This record is already linked to this entity for the same supervisory consequence.',
        'target_kind', _existing.target_kind, 'target_id', _existing.target_id,
        'target', _tgt);
    END IF;
  ELSIF _mode = 'CREATE' THEN
    CASE _action
      WHEN 'OPEN_SUPERVISORY_PLAN' THEN
        _res := public.supervisory_plan_open(_title, _d, _rationale,
          NULLIF(_payload->>'supervisory_objective',''), NULL::uuid,
          CASE WHEN _assessment IS NULL THEN NULL::uuid[] ELSE ARRAY[_assessment] END,
          ARRAY[_entity], NULL::text, NULL::text, _owner, NULL::uuid, current_date, _due,
          NULL::date, _priority, NULL::text);
        _target := (_res->>'id')::uuid;
      WHEN 'REQUIRE_REASSESSMENT' THEN
        _target := public.supervisory_reassessment_require(_entity, _d, 'SUPERVISORY_DIRECTION', _rationale,
          COALESCE(NULLIF(_payload->>'requested_type',''),'EVENT_DRIVEN'), _due,
          COALESCE(_assessment, NULLIF(_src->'assessment'->>'id','')::uuid),
          NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, _owner);
      WHEN 'OPEN_INTERVENTION' THEN
        _plan := NULLIF(_payload->>'plan_id','')::uuid;
        IF _plan IS NULL THEN
          SELECT p.id INTO _plan FROM public.supervisory_plan p
           WHERE p.domain_code = _d AND p.status IN ('APPROVED','ACTIVE')
             AND _entity = ANY (COALESCE(p.entity_ids,'{}'::uuid[]))
           ORDER BY p.created_at DESC LIMIT 1;
        END IF;
        _res := public.supervisory_intervention_open(_plan,
          COALESCE(NULLIF(_payload->>'intervention_type',''),'TARGETED_EXAMINATION'),
          _title, _rationale, _d, _entity, NULL::uuid,
          NULLIF(_payload->>'supervisory_objective',''), current_date, _due, _owner, NULL::uuid, NULL::text);
        _target := (_res->>'id')::uuid;
      WHEN 'OPEN_EXAMINATION' THEN
        _iv := NULLIF(_payload->>'intervention_id','')::uuid;
        IF _iv IS NULL THEN
          SELECT i.id INTO _iv FROM public.supervisory_intervention i
           WHERE i.licensee_id = _entity AND upper(COALESCE(i.domain_code,'')) = _d
             AND i.status IN ('ENDORSED','ACTIVE') ORDER BY i.created_at DESC LIMIT 1;
        END IF;
        _res := public.supervisory_examination_open(_iv, _title,
          COALESCE(NULLIF(_payload->>'engagement_type',''),'TARGETED_EXAMINATION'), _d, _entity,
          CASE WHEN _assessment IS NULL THEN NULL::uuid[] ELSE ARRAY[_assessment] END,
          NULL::uuid[], NULL::date, NULL::date, _owner, NULL::uuid, NULL::text);
        _target := (_res->>'id')::uuid;
      WHEN 'RAISE_FINDING' THEN
        _target := public.supervisory_finding_create(jsonb_strip_nulls(jsonb_build_object(
          'entity_id', _entity, 'domain_code', _d,
          'assessment_id', COALESCE(_assessment, NULLIF(_src->'assessment'->>'id','')::uuid),
          'assessment_dimension_id', NULLIF(_payload->>'assessment_dimension_id',''),
          'source_kind','ASSESSMENT',
          'severity', COALESCE(NULLIF(_payload->>'severity',''),'MEDIUM'),
          'title', _title, 'observation', _rationale,
          'regulatory_criterion', NULLIF(_payload->>'regulatory_criterion',''),
          'due_date', _due, 'owner_id', _owner)));
      WHEN 'REFER_TO_ENFORCEMENT' THEN
        _finding := NULLIF(_payload->>'source_finding_id','')::uuid;
        IF _finding IS NULL THEN
          RAISE EXCEPTION 'A canonical supervisory finding must be referred: a risk rating is not a basis for enforcement' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.supervisory_finding f
                        WHERE f.id = _finding AND f.entity_id = _entity
                          AND upper(COALESCE(f.domain_code,'')) = _d) THEN
          RAISE EXCEPTION 'not_found: no referable supervisory finding is available for this entity' USING ERRCODE = '22023';
        END IF;
        _target := public.enforcement_referral_create(jsonb_build_object(
          'source_kind','SUPERVISORY_FINDING','source_id', _finding, 'referral_reason', _rationale));
      ELSE
        RAISE EXCEPTION 'unsupported_mode: % cannot create a target record', _action USING ERRCODE = '22023';
    END CASE;
    _tgt := public.supervisory_consequence_target_internal(_kind, _target);
  END IF;

  _lineage := jsonb_strip_nulls(jsonb_build_object(
    'risk_state_id', _src->'risk_state'->>'id',
    'publication_id', _src->'publication'->>'id',
    'approval_decision_id', _src->'approval_decision'->>'id',
    'assessment_id', COALESCE(_assessment::text, _src->'assessment'->>'id'),
    'calculation_run_id', _src->'calculation_run'->>'id',
    'override_id', _src->'approved_override'->>'id',
    'methodology_id', _src->'approval_decision'->>'methodology_id',
    'methodology_version', _src->'approval_decision'->>'methodology_version',
    'programme_id', _src->'approval_decision'->>'programme_id',
    'question_plan_version', _src->'approval_decision'->>'question_plan_version',
    'source_kind', _src->>'source_kind',
    'rating_provenance', _src->>'rating_provenance',
    'calculation_availability', _src->>'calculation_availability',
    'source_rating', _src->>'current_rating'));

  PERFORM set_config('app.supervisory_consequence_writer','governed', true);
  INSERT INTO public.supervisory_consequence_decision(
    entity_id, domain_code, regulator_id, sector_id, source_kind, publication_id, risk_state_id,
    assessment_id, approval_decision_id, calculation_run_id, override_id, source_rating,
    rating_provenance, calculation_availability, action_type, linkage_mode, target_kind, target_id,
    target_reference, rationale, supervisory_objective, priority, due_date, owner_id,
    lineage, idempotency_key, decided_by)
  VALUES (_entity, _d, _reg, _sector, _src->>'source_kind',
    NULLIF(_src->'publication'->>'id','')::uuid, NULLIF(_src->'risk_state'->>'id','')::uuid,
    COALESCE(_assessment, NULLIF(_src->'assessment'->>'id','')::uuid),
    NULLIF(_src->'approval_decision'->>'id','')::uuid,
    NULLIF(_src->'calculation_run'->>'id','')::uuid,
    NULLIF(_src->'approved_override'->>'id','')::uuid, _src->>'current_rating',
    _src->>'rating_provenance', _src->>'calculation_availability', _action, _mode,
    CASE WHEN _mode = 'RECORD_ONLY' THEN NULL ELSE _kind END,
    CASE WHEN _mode = 'RECORD_ONLY' THEN NULL ELSE _target END,
    _tgt->>'reference', _rationale, NULLIF(_payload->>'supervisory_objective',''),
    _priority, _due, _owner, _lineage, _key, _uid)
  RETURNING id INTO _id;
  PERFORM set_config('app.supervisory_consequence_writer','', true);

  PERFORM public.log_compliance_audit('CREATE'::public.compliance_audit_action,
    'supervisory_consequence_decision', _id::text, NULL::jsonb,
    jsonb_build_object('entity_id', _entity, 'domain_code', _d, 'action_type', _action,
      'linkage_mode', _mode, 'target_kind', _kind, 'target_id', _target,
      'source_kind', _src->>'source_kind', 'rating_provenance', _src->>'rating_provenance'),
    _rationale, NULL::text, NULL::inet, _lineage);

  RETURN jsonb_build_object('decision_id', _id, 'idempotent', false,
    'action_type', _action, 'linkage_mode', _mode,
    'target_kind', CASE WHEN _mode = 'RECORD_ONLY' THEN NULL ELSE _kind END,
    'target_id', CASE WHEN _mode = 'RECORD_ONLY' THEN NULL ELSE _target END,
    'target', _tgt);
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_consequence_withdraw(_decision_id uuid, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _uid uuid := auth.uid(); _d public.supervisory_consequence_decision;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 20 THEN
    RAISE EXCEPTION 'rationale_required: a withdrawal rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _d FROM public.supervisory_consequence_decision WHERE id = _decision_id FOR UPDATE;
  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'not_found: consequence decision' USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _d.entity_id);
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'aml_supervision','review')
          OR public.has_permission(_uid,'supervisory_spine','review')) THEN
    RAISE EXCEPTION 'not_authorized: supervisory review authority is required to withdraw a consequence decision' USING ERRCODE = '42501';
  END IF;
  IF _d.status <> 'RECORDED' THEN
    RAISE EXCEPTION 'state_not_eligible: this decision is already %', _d.status USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.supervisory_consequence_writer','governed', true);
  UPDATE public.supervisory_consequence_decision
     SET status = 'WITHDRAWN', withdrawn_by = _uid, withdrawn_at = now(), withdrawal_reason = btrim(_rationale)
   WHERE id = _decision_id;
  PERFORM set_config('app.supervisory_consequence_writer','', true);

  PERFORM public.log_compliance_audit('OVERRIDE'::public.compliance_audit_action,
    'supervisory_consequence_decision', _decision_id::text, to_jsonb(_d),
    jsonb_build_object('status','WITHDRAWN'), btrim(_rationale), NULL::text, NULL::inet, _d.lineage);

  RETURN jsonb_build_object('decision_id', _decision_id, 'status','WITHDRAWN');
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_consequence_record(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_consequence_withdraw(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_consequence_record(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_consequence_withdraw(uuid, text) TO authenticated, service_role;

COMMENT ON TABLE public.supervisory_consequence_decision IS
  'AML-08 append-only supervisory consequence decision. Source publication/risk-of-record, actor, rationale and lineage are immutable; corrections use withdrawal or supersession. Targets are canonical downstream records created or linked through their own governed operations.';