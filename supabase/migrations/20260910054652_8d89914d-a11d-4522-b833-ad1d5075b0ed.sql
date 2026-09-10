-- AML-09 — RISK SURVEILLANCE, REVIEW-CYCLE STATUS AND GOVERNED REASSESSMENT TRIGGERING
-- Append-only monitoring decision history. No parallel reassessment, alert, task or
-- scheduling record is created: reassessment reuses supervisory_reassessment_require,
-- events reuse canonical findings/examinations/enforcement, and the risk-of-record is
-- read through the AML-08 source resolver. Nothing here changes an entity's risk.

CREATE TABLE IF NOT EXISTS public.supervisory_risk_monitoring_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  domain_code text NOT NULL,
  regulator_id uuid,
  decision_kind text NOT NULL,
  monitoring_state text,
  due_date_basis text,
  basis_source_kind text,
  basis_source_id uuid,
  programme_id uuid REFERENCES public.supervisory_assessment_programme(id) ON DELETE RESTRICT,
  programme_code text,
  programme_version text,
  original_due_date date,
  revised_due_date date,
  disposition text,
  event_type text,
  event_source_kind text,
  event_source_id uuid,
  event_date date,
  risk_state_id uuid REFERENCES public.entity_risk_state(id) ON DELETE RESTRICT,
  publication_id uuid REFERENCES public.supervisory_assessment_risk_publication(id) ON DELETE RESTRICT,
  assessment_id uuid REFERENCES public.supervisory_assessment(id) ON DELETE RESTRICT,
  reassessment_requirement_id uuid REFERENCES public.supervisory_reassessment_requirement(id) ON DELETE RESTRICT,
  rationale text NOT NULL,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT srmd_kind CHECK (decision_kind = ANY (ARRAY['REASSESSMENT_TRIGGERED','RESCHEDULE'])),
  CONSTRAINT srmd_disposition CHECK (disposition IS NULL OR disposition = ANY (ARRAY['RESCHEDULED','DEFERRED'])),
  CONSTRAINT srmd_rationale CHECK (length(btrim(rationale)) >= 20),
  CONSTRAINT srmd_domain CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT srmd_reschedule_shape CHECK (
    decision_kind <> 'RESCHEDULE' OR (disposition IS NOT NULL AND revised_due_date IS NOT NULL)),
  CONSTRAINT srmd_trigger_shape CHECK (
    decision_kind <> 'REASSESSMENT_TRIGGERED' OR reassessment_requirement_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS srmd_idempotency_uidx ON public.supervisory_risk_monitoring_decision(idempotency_key);
CREATE INDEX IF NOT EXISTS srmd_entity_idx ON public.supervisory_risk_monitoring_decision(entity_id, domain_code, decided_at DESC);
CREATE INDEX IF NOT EXISTS srmd_kind_idx ON public.supervisory_risk_monitoring_decision(entity_id, domain_code, decision_kind, decided_at DESC);

GRANT SELECT ON public.supervisory_risk_monitoring_decision TO authenticated;
GRANT ALL ON public.supervisory_risk_monitoring_decision TO service_role;
ALTER TABLE public.supervisory_risk_monitoring_decision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS srmd_read ON public.supervisory_risk_monitoring_decision;
CREATE POLICY srmd_read ON public.supervisory_risk_monitoring_decision FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_writer_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF current_setting('app.supervisory_risk_monitoring_writer', true) IS DISTINCT FROM 'governed' THEN
    RAISE EXCEPTION '% is written only by a governed supervisory monitoring operation', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  RAISE EXCEPTION 'immutable: a recorded supervisory monitoring decision is append-only - record a further governed decision instead' USING ERRCODE = '42501';
END $fn$;

DROP TRIGGER IF EXISTS srmd_writer_guard ON public.supervisory_risk_monitoring_decision;
CREATE TRIGGER srmd_writer_guard BEFORE INSERT ON public.supervisory_risk_monitoring_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_risk_monitoring_writer_guard();
DROP TRIGGER IF EXISTS srmd_immutable_guard ON public.supervisory_risk_monitoring_decision;
CREATE TRIGGER srmd_immutable_guard BEFORE UPDATE OR DELETE ON public.supervisory_risk_monitoring_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_risk_monitoring_immutable_guard();

REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_writer_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_immutable_guard() FROM PUBLIC;

/* ------------------------------------------------------- schedule resolution */

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_schedule_internal(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _rs public.entity_risk_state;
  _asmt public.supervisory_assessment;
  _prog public.supervisory_assessment_programme;
  _set public.supervisory_assessment_programme_set;
  _sched public.supervisory_risk_monitoring_decision;
  _due date; _basis text; _basis_kind text; _basis_id uuid; _detail text;
BEGIN
  SELECT * INTO _rs FROM public.entity_risk_state WHERE entity_id = _entity_id AND domain_code = _d;

  SELECT * INTO _asmt FROM public.supervisory_assessment
   WHERE entity_id = _entity_id AND domain_code = _d AND status IN ('APPROVED','SUPERSEDED')
   ORDER BY COALESCE(approved_at, updated_at) DESC LIMIT 1;

  IF _asmt.assessment_programme_id IS NOT NULL THEN
    SELECT * INTO _prog FROM public.supervisory_assessment_programme WHERE id = _asmt.assessment_programme_id;
    IF _prog.programme_set_id IS NOT NULL THEN
      SELECT * INTO _set FROM public.supervisory_assessment_programme_set WHERE id = _prog.programme_set_id;
    END IF;
  END IF;

  SELECT * INTO _sched FROM public.supervisory_risk_monitoring_decision
   WHERE entity_id = _entity_id AND domain_code = _d AND decision_kind = 'RESCHEDULE'
   ORDER BY decided_at DESC LIMIT 1;

  IF _sched.id IS NOT NULL AND _sched.revised_due_date IS NOT NULL THEN
    _due := _sched.revised_due_date; _basis := 'EXPLICIT_SCHEDULE_DECISION';
    _basis_kind := 'MONITORING_DECISION'; _basis_id := _sched.id;
    _detail := 'An approved supervisory schedule decision fixes the next review date.';
  ELSIF _prog.id IS NOT NULL AND _prog.recurrence_months IS NOT NULL
        AND COALESCE(_asmt.assessment_date, _rs.last_review_date) IS NOT NULL THEN
    _due := (COALESCE(_asmt.assessment_date, _rs.last_review_date)
             + make_interval(months => _prog.recurrence_months))::date;
    _basis := 'PROGRAMME_CYCLE'; _basis_kind := 'ASSESSMENT_PROGRAMME'; _basis_id := _prog.id;
    _detail := 'The bound assessment programme cycle of ' || _prog.recurrence_months
               || ' months applies from the last completed assessment.';
  ELSIF _asmt.next_review_date IS NOT NULL THEN
    _due := _asmt.next_review_date; _basis := 'ASSESSMENT_REVIEW_PERIOD';
    _basis_kind := 'SUPERVISORY_ASSESSMENT'; _basis_id := _asmt.id;
    _detail := 'The next review date recorded on the last completed assessment applies.';
  ELSIF _rs.next_review_date IS NOT NULL THEN
    _due := _rs.next_review_date; _basis := 'RISK_STATE_REVIEW_DATE';
    _basis_kind := 'ENTITY_RISK_STATE'; _basis_id := _rs.id;
    _detail := 'The review date held on the entity risk-of-record applies. No later canonical schedule exists.';
  ELSE
    _due := NULL; _basis := 'UNSCHEDULED'; _basis_kind := NULL; _basis_id := NULL;
    _detail := 'No canonical review schedule exists. No default review interval is assumed.';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'next_review_date', _due,
    'due_date_basis', _basis,
    'due_date_basis_detail', _detail,
    'basis_source_kind', _basis_kind,
    'basis_source_id', _basis_id,
    'schedule_decision', CASE WHEN _sched.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', _sched.id, 'disposition', _sched.disposition,
        'original_due_date', _sched.original_due_date, 'revised_due_date', _sched.revised_due_date,
        'rationale', _sched.rationale, 'decided_by', _sched.decided_by, 'decided_at', _sched.decided_at) END,
    'last_completed_assessment', CASE WHEN _asmt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', _asmt.id, 'reference', _asmt.reference, 'status', _asmt.status,
        'assessment_type', _asmt.assessment_type, 'assessment_date', _asmt.assessment_date,
        'approved_at', _asmt.approved_at, 'next_review_date', _asmt.next_review_date,
        'methodology_id', _asmt.methodology_id, 'methodology_version', _asmt.methodology_version,
        'route', '/supervision/aml/assessments/' || _asmt.id::text) END,
    'programme', CASE WHEN _prog.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', _prog.id, 'programme_code', _prog.programme_code, 'label', _prog.label,
        'assessment_type', _prog.assessment_type, 'recurrence_months', _prog.recurrence_months,
        'provenance', _prog.provenance, 'set_id', _set.id, 'set_code', _set.code,
        'set_version', _set.set_version, 'set_status', _set.status) END,
    'last_review_date', COALESCE(_asmt.assessment_date, _rs.last_review_date),
    'risk_state_id', _rs.id));
END $fn$;

/* --------------------------------------------------------- canonical events */

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_events_internal(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT', _since timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _from timestamptz := COALESCE(_since, '-infinity'::timestamptz);
  _events jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(_events || jsonb_agg(e), _events) INTO _events FROM (
    SELECT jsonb_build_object(
             'event_type','FINDING_RAISED', 'source_kind','SUPERVISORY_FINDING', 'source_id', f.id,
             'reference', f.reference, 'title', f.title, 'severity', f.severity, 'status', f.status,
             'event_date', COALESCE(f.issued_at, f.created_at)::date,
             'reason','A ' || lower(f.severity) || ' severity AML/CFT finding was raised after the current risk-of-record took effect.',
             'route','/supervision/findings/' || f.id::text) AS e
      FROM public.supervisory_finding f
     WHERE f.entity_id = _entity_id AND upper(COALESCE(f.domain_code,'')) = _d
       AND f.status NOT IN ('CLOSED','SUPERSEDED','DRAFT')
       AND upper(COALESCE(f.severity,'')) IN ('HIGH','CRITICAL')
       AND COALESCE(f.issued_at, f.created_at) > _from
  ) s;

  SELECT COALESCE(_events || jsonb_agg(e), _events) INTO _events FROM (
    SELECT jsonb_build_object(
             'event_type','EXAMINATION_CONCLUDED', 'source_kind','EXAMINATION', 'source_id', x.id,
             'reference', x.reference, 'title', x.title, 'status', x.stage,
             'event_date', COALESCE(x.closed_at::date, x.fieldwork_end),
             'reason', CASE WHEN COALESCE(x.reassessment_required,false)
                 THEN 'A concluded AML/CFT examination records that a reassessment is required.'
                 ELSE 'An AML/CFT examination concluded after the current risk-of-record took effect.' END,
             'route','/supervision/examinations/' || x.id::text) AS e
      FROM public.examinations x
     WHERE x.entity_id = _entity_id AND upper(COALESCE(x.domain_code,'')) = _d
       AND (x.closed_at IS NOT NULL OR COALESCE(x.reassessment_required,false))
       AND COALESCE(x.closed_at, x.updated_at) > _from
  ) s;

  SELECT COALESCE(_events || jsonb_agg(e), _events) INTO _events FROM (
    SELECT jsonb_build_object(
             'event_type','ENFORCEMENT_OPENED', 'source_kind','ENFORCEMENT_ACTION', 'source_id', a.id,
             'reference', a.case_number, 'title', a.description, 'status', a.status,
             'event_date', a.date_opened,
             'reason','An enforcement case is open against this entity after the current risk-of-record took effect.',
             'route','/enforcement/' || a.id::text) AS e
      FROM public.enforcement_actions a
     WHERE a.entity_id = _entity_id
       AND lower(COALESCE(a.status,'')) NOT IN ('closed','withdrawn')
       AND COALESCE(a.date_opened::timestamptz, a.created_at) > _from
  ) s;

  RETURN _events;
END $fn$;

/* ------------------------------------------------------------- governed view */

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_view(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _src jsonb; _sched jsonb; _events jsonb := '[]'::jsonb; _ev jsonb; _out jsonb := '[]'::jsonb;
  _open public.supervisory_reassessment_requirement;
  _state text; _reason text; _explain text; _blockers jsonb; _due date;
  _may_reassess boolean; _may_reschedule boolean; _consider boolean := false;
  _since timestamptz; _entity record; _history jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  SELECT l.id, l.name, l.lead_regulator_id, l.sector_id INTO _entity
    FROM public.licensees l WHERE l.id = _entity_id;

  _src := public.supervisory_consequence_source_internal(_entity_id, _d, NULL);
  _sched := public.supervisory_risk_monitoring_schedule_internal(_entity_id, _d);
  _blockers := COALESCE(_src->'blockers','[]'::jsonb);
  _due := NULLIF(_sched->>'next_review_date','')::date;

  _since := COALESCE(
    NULLIF(_src->'risk_state'->>'effective_from','')::timestamptz,
    NULLIF(_src->'publication'->>'published_at','')::timestamptz,
    NULLIF(_sched->'last_completed_assessment'->>'approved_at','')::timestamptz);

  _events := public.supervisory_risk_monitoring_events_internal(_entity_id, _d, _since);

  SELECT * INTO _open FROM public.supervisory_reassessment_requirement
   WHERE entity_id = _entity_id AND domain_code = _d
     AND status NOT IN ('FULFILLED','CANCELLED')
   ORDER BY created_at DESC LIMIT 1;

  _may_reassess := public.is_super_admin(_uid)
    OR public.has_permission(_uid,'aml_supervision','review')
    OR public.has_permission(_uid,'supervisory_spine','review');
  _may_reschedule := public.is_super_admin(_uid)
    OR public.has_permission(_uid,'aml_supervision','approve');

  _consider := jsonb_array_length(_events) > 0;

  IF (_src->>'source_kind') = 'NONE' THEN
    _state := 'BLOCKED'; _reason := 'NO_RISK_OF_RECORD';
    _explain := 'No AML/CFT risk-of-record exists for this entity, so no review cycle can be established.';
  ELSIF _consider AND _open.id IS NULL THEN
    _state := 'EVENT_TRIGGERED'; _reason := 'EVENT_REQUIRES_CONSIDERATION';
    _explain := 'A canonical supervisory event has occurred since the current risk-of-record took effect. A supervisor must consider whether reassessment is required. Nothing is created automatically.';
  ELSIF (_src->>'source_kind') = 'LEGACY_RISK_RECORD' THEN
    _state := 'LEGACY'; _reason := 'LEGACY_RISK_RECORD';
    _explain := 'The current risk-of-record predates governed publication. Its review basis is read from legacy canonical data only.';
  ELSIF _due IS NULL THEN
    _state := 'UNSCHEDULED'; _reason := 'NO_CANONICAL_REVIEW_SCHEDULE';
    _explain := 'No canonical review schedule exists for this entity. No default review interval is assumed.';
  ELSIF _due < current_date THEN
    _state := 'OVERDUE'; _reason := 'REVIEW_DATE_PASSED';
    _explain := 'The next review date has passed. The current risk rating is unchanged: this is a workflow condition, not a new rating.';
  ELSIF _due = current_date THEN
    _state := 'DUE'; _reason := 'REVIEW_DUE_TODAY';
    _explain := 'The review is due today. The current risk rating is unchanged.';
  ELSE
    _state := 'CURRENT'; _reason := 'REVIEW_NOT_YET_DUE';
    _explain := 'The review remains current.';
  END IF;

  FOR _ev IN SELECT e FROM jsonb_array_elements(_events) e LOOP
    _out := _out || jsonb_build_array(_ev || jsonb_build_object(
      'requires_consideration', true,
      'reassessment_available', (_may_reassess AND _open.id IS NULL AND (_src->>'source_kind') <> 'NONE'),
      'required_permission','aml_supervision.review',
      'existing_reassessment_id', _open.id,
      'blocker', CASE
        WHEN (_src->>'source_kind') = 'NONE' THEN 'NO_RISK_OF_RECORD'
        WHEN NOT _may_reassess THEN 'PERMISSION_MISSING'
        WHEN _open.id IS NOT NULL THEN 'REASSESSMENT_ALREADY_OPEN'
        ELSE NULL END));
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', h.id, 'decision_kind', h.decision_kind, 'monitoring_state', h.monitoring_state,
           'due_date_basis', h.due_date_basis, 'original_due_date', h.original_due_date,
           'revised_due_date', h.revised_due_date, 'disposition', h.disposition,
           'event_type', h.event_type, 'event_source_kind', h.event_source_kind,
           'event_source_id', h.event_source_id,
           'reassessment_requirement_id', h.reassessment_requirement_id,
           'rationale', h.rationale, 'lineage', h.lineage,
           'decided_by', h.decided_by, 'decided_at', h.decided_at) ORDER BY h.decided_at DESC), '[]'::jsonb)
    INTO _history FROM public.supervisory_risk_monitoring_decision h
   WHERE h.entity_id = _entity_id AND h.domain_code = _d;

  RETURN jsonb_build_object(
    'entity', jsonb_build_object('id', _entity_id, 'name', _entity.name,
       'regulator_id', _entity.lead_regulator_id, 'sector_id', _entity.sector_id),
    'domain_code', _d,
    'as_of', current_date,
    'generated_at', now(),
    'risk', jsonb_build_object(
      'source_kind', _src->>'source_kind',
      'current_rating', _src->>'current_rating',
      'inherent_rating', _src->'risk_state'->>'inherent_rating',
      'control_rating', _src->'risk_state'->>'control_rating',
      'effective_from', _src->>'effective_from',
      'rating_provenance', _src->>'rating_provenance',
      'calculation_availability', _src->>'calculation_availability',
      'publication_id', _src->'publication'->>'id',
      'assessment_id', _src->'assessment'->>'id',
      'risk_state_id', _src->'risk_state'->>'id'),
    'schedule', _sched,
    'monitoring_state', _state,
    'reason_code', _reason,
    'reason', _explain,
    'blockers', _blockers,
    'events', _out,
    'open_reassessment', CASE WHEN _open.id IS NULL THEN NULL ELSE jsonb_build_object(
       'id', _open.id, 'status', _open.status, 'trigger_kind', _open.trigger_kind,
       'requested_type', _open.requested_type, 'trigger_rationale', _open.trigger_rationale,
       'due_date', _open.due_date, 'created_at', _open.created_at,
       'previous_assessment_id', _open.previous_assessment_id) END,
    'permitted_actions', jsonb_build_array(
      jsonb_build_object('action','REQUIRE_REASSESSMENT',
        'label','Require a reassessment',
        'required_permission','aml_supervision.review',
        'available', (_may_reassess AND _open.id IS NULL AND (_src->>'source_kind') <> 'NONE'),
        'reason_code', CASE
          WHEN (_src->>'source_kind') = 'NONE' THEN 'NO_RISK_OF_RECORD'
          WHEN NOT _may_reassess THEN 'PERMISSION_MISSING'
          WHEN _open.id IS NOT NULL THEN 'REASSESSMENT_ALREADY_OPEN'
          ELSE 'OK' END,
        'reason', CASE
          WHEN (_src->>'source_kind') = 'NONE' THEN 'No AML/CFT risk-of-record exists to reassess.'
          WHEN NOT _may_reassess THEN 'You do not hold aml_supervision.review.'
          WHEN _open.id IS NOT NULL THEN 'A reassessment is already open for this entity and domain.'
          ELSE 'Available' END),
      jsonb_build_object('action','RESCHEDULE_REVIEW',
        'label','Reschedule or defer the next review',
        'required_permission','aml_supervision.approve',
        'available', (_may_reschedule AND (_src->>'source_kind') <> 'NONE'),
        'reason_code', CASE
          WHEN (_src->>'source_kind') = 'NONE' THEN 'NO_RISK_OF_RECORD'
          WHEN NOT _may_reschedule THEN 'PERMISSION_MISSING'
          ELSE 'OK' END,
        'reason', CASE
          WHEN (_src->>'source_kind') = 'NONE' THEN 'No AML/CFT risk-of-record exists to schedule.'
          WHEN NOT _may_reschedule THEN 'You do not hold aml_supervision.approve.'
          ELSE 'Available' END),
      jsonb_build_object('action','WAIVE_REVIEW',
        'label','Waive the review obligation',
        'required_permission', NULL,
        'available', false,
        'reason_code','UNSUPPORTED_NO_CANONICAL_AUTHORITY',
        'reason','No canonical regulator authority or business rule for waiving an AML/CFT review exists, so waiver is not offered.')),
    'history', _history,
    'lineage', jsonb_strip_nulls(jsonb_build_object(
      'risk_state_id', _src->'risk_state'->>'id',
      'publication_id', _src->'publication'->>'id',
      'assessment_id', _src->'assessment'->>'id',
      'approval_decision_id', _src->'approval_decision'->>'id',
      'methodology_id', _src->'approval_decision'->>'methodology_id',
      'methodology_version', _src->'approval_decision'->>'methodology_version',
      'programme_id', _sched->'programme'->>'id',
      'programme_code', _sched->'programme'->>'programme_code',
      'programme_set_version', _sched->'programme'->>'set_version',
      'due_date_basis', _sched->>'due_date_basis',
      'basis_source_kind', _sched->>'basis_source_kind',
      'basis_source_id', _sched->>'basis_source_id',
      'rating_provenance', _src->>'rating_provenance',
      'calculation_availability', _src->>'calculation_availability')));
END $fn$;

/* -------------------------------------------------- operational due-review list */

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_due_list(
  _domain_code text DEFAULT 'AML_CFT', _state text DEFAULT NULL, _limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _rows jsonb := '[]'::jsonb; _rec record; _v jsonb; _n integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;

  FOR _rec IN
    SELECT DISTINCT s.entity_id, l.name, l.lead_regulator_id, l.sector_id
      FROM public.entity_risk_state s
      JOIN public.licensees l ON l.id = s.entity_id
     WHERE s.domain_code = _d
     ORDER BY l.name
  LOOP
    IF NOT public.supervisory_monitoring_scope_admits(_uid, _d, _rec.entity_id,
             _rec.lead_regulator_id, _rec.sector_id) THEN
      CONTINUE;
    END IF;
    _v := public.supervisory_risk_monitoring_view(_rec.entity_id, _d);
    IF _state IS NOT NULL AND upper(_state) <> (_v->>'monitoring_state') THEN
      CONTINUE;
    END IF;
    _rows := _rows || jsonb_build_array(jsonb_build_object(
      'entity_id', _rec.entity_id, 'entity_name', _rec.name,
      'regulator_id', _rec.lead_regulator_id,
      'current_rating', _v->'risk'->>'current_rating',
      'rating_provenance', _v->'risk'->>'rating_provenance',
      'last_review_date', _v->'schedule'->>'last_review_date',
      'next_review_date', _v->'schedule'->>'next_review_date',
      'due_date_basis', _v->'schedule'->>'due_date_basis',
      'monitoring_state', _v->>'monitoring_state',
      'reason_code', _v->>'reason_code',
      'event_count', jsonb_array_length(COALESCE(_v->'events','[]'::jsonb)),
      'open_reassessment_id', _v->'open_reassessment'->>'id',
      'route','/supervision/aml/entities/' || _rec.entity_id::text));
    _n := _n + 1;
    EXIT WHEN _n >= GREATEST(COALESCE(_limit,100), 1);
  END LOOP;

  RETURN jsonb_build_object('domain_code', _d, 'as_of', current_date,
    'state_filter', CASE WHEN _state IS NULL THEN NULL ELSE upper(_state) END,
    'count', jsonb_array_length(_rows), 'items', _rows);
END $fn$;

/* ------------------------------------------- governed reassessment triggering */

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_require_reassessment(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _entity uuid := NULLIF(_payload->>'entity_id','')::uuid;
  _d text := upper(COALESCE(NULLIF(_payload->>'domain_code',''),'AML_CFT'));
  _rationale text := btrim(COALESCE(_payload->>'rationale',''));
  _event_type text := NULLIF(upper(COALESCE(_payload->>'event_type','')),'');
  _event_id uuid := NULLIF(_payload->>'event_source_id','')::uuid;
  _requested text := COALESCE(NULLIF(_payload->>'requested_type',''),'TARGETED');
  _due date := NULLIF(_payload->>'due_date','')::date;
  _v jsonb; _act jsonb; _ev jsonb; _key text; _req uuid; _reg uuid;
  _existing public.supervisory_risk_monitoring_decision;
  _open public.supervisory_reassessment_requirement;
  _finding uuid; _exam uuid; _enf uuid;
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

  _v := public.supervisory_risk_monitoring_view(_entity, _d);
  SELECT a INTO _act FROM jsonb_array_elements(_v->'permitted_actions') a
   WHERE a->>'action' = 'REQUIRE_REASSESSMENT';

  IF _event_type IS NOT NULL THEN
    SELECT e INTO _ev FROM jsonb_array_elements(_v->'events') e
     WHERE e->>'event_type' = _event_type
       AND (_event_id IS NULL OR (e->>'source_id')::uuid = _event_id);
    IF _ev IS NULL THEN
      RAISE EXCEPTION 'not_found: no recognised canonical % event is available for this entity', _event_type USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO _open FROM public.supervisory_reassessment_requirement
   WHERE entity_id = _entity AND domain_code = _d AND status NOT IN ('FULFILLED','CANCELLED')
   ORDER BY created_at DESC LIMIT 1;
  IF _open.id IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'duplicate', true,
      'reason_code','REASSESSMENT_ALREADY_OPEN',
      'reason','A reassessment is already open for this entity and domain. The existing requirement is returned rather than a second one being created.',
      'requirement_id', _open.id, 'status', _open.status, 'due_date', _open.due_date);
  END IF;

  IF NOT COALESCE((_act->>'available')::boolean,false) THEN
    RAISE EXCEPTION 'action_blocked: % (%)', _act->>'reason', _act->>'reason_code' USING ERRCODE = '42501';
  END IF;

  _key := md5(concat_ws('|','REASSESSMENT_TRIGGERED', _uid::text, _entity::text, _d,
    COALESCE(_event_type,'-'), COALESCE(_event_id::text,'-'),
    COALESCE(NULLIF(_payload->>'idempotency_key',''), _rationale)));
  SELECT * INTO _existing FROM public.supervisory_risk_monitoring_decision WHERE idempotency_key = _key;
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'idempotent', true,
      'decision_id', _existing.id, 'requirement_id', _existing.reassessment_requirement_id);
  END IF;

  PERFORM 1 FROM public.entity_risk_state WHERE entity_id = _entity AND domain_code = _d FOR UPDATE;

  SELECT * INTO _open FROM public.supervisory_reassessment_requirement
   WHERE entity_id = _entity AND domain_code = _d AND status NOT IN ('FULFILLED','CANCELLED')
   ORDER BY created_at DESC LIMIT 1;
  IF _open.id IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'duplicate', true,
      'reason_code','REASSESSMENT_ALREADY_OPEN',
      'reason','A reassessment is already open for this entity and domain.',
      'requirement_id', _open.id, 'status', _open.status);
  END IF;

  IF (_ev->>'source_kind') = 'SUPERVISORY_FINDING' THEN _finding := (_ev->>'source_id')::uuid; END IF;
  IF (_ev->>'source_kind') = 'EXAMINATION' THEN _exam := (_ev->>'source_id')::uuid; END IF;
  IF (_ev->>'source_kind') = 'ENFORCEMENT_ACTION' THEN _enf := (_ev->>'source_id')::uuid; END IF;

  IF _event_type IS NULL AND (_v->'schedule'->'last_completed_assessment'->>'id') IS NULL THEN
    RAISE EXCEPTION 'action_blocked: no canonical provenance exists for a reassessment requirement (no recognised event and no completed assessment)' USING ERRCODE = '42501';
  END IF;

  _req := public.supervisory_reassessment_require(
    _entity, _d,
    CASE _event_type
      WHEN 'FINDING_RAISED' THEN 'MATERIAL_FINDING'
      WHEN 'EXAMINATION_CONCLUDED' THEN 'EXAMINATION_CONCLUSION'
      WHEN 'ENFORCEMENT_OPENED' THEN 'ENFORCEMENT_OUTCOME'
      ELSE 'SUPERVISORY_DIRECTION' END,
    _rationale, _requested, _due,
    NULLIF(_v->'schedule'->'last_completed_assessment'->>'id','')::uuid,
    _finding, NULL::uuid, NULL::uuid, _exam, NULL::uuid, _enf, NULL::uuid);

  SELECT l.lead_regulator_id INTO _reg FROM public.licensees l WHERE l.id = _entity;

  PERFORM set_config('app.supervisory_risk_monitoring_writer','governed', true);
  INSERT INTO public.supervisory_risk_monitoring_decision(
    entity_id, domain_code, regulator_id, decision_kind, monitoring_state, due_date_basis,
    basis_source_kind, basis_source_id, programme_id, programme_code, programme_version,
    original_due_date, event_type, event_source_kind, event_source_id, event_date,
    risk_state_id, publication_id, assessment_id, reassessment_requirement_id,
    rationale, lineage, idempotency_key, decided_by)
  VALUES (_entity, _d, _reg, 'REASSESSMENT_TRIGGERED', _v->>'monitoring_state',
    _v->'schedule'->>'due_date_basis', _v->'schedule'->>'basis_source_kind',
    NULLIF(_v->'schedule'->>'basis_source_id','')::uuid,
    NULLIF(_v->'schedule'->'programme'->>'id','')::uuid,
    _v->'schedule'->'programme'->>'programme_code',
    _v->'schedule'->'programme'->>'set_version',
    NULLIF(_v->'schedule'->>'next_review_date','')::date,
    _event_type, _ev->>'source_kind', NULLIF(_ev->>'source_id','')::uuid,
    NULLIF(_ev->>'event_date','')::date,
    NULLIF(_v->'risk'->>'risk_state_id','')::uuid,
    NULLIF(_v->'risk'->>'publication_id','')::uuid,
    NULLIF(_v->'risk'->>'assessment_id','')::uuid,
    _req, _rationale, _v->'lineage', _key, _uid);
  PERFORM set_config('app.supervisory_risk_monitoring_writer','', true);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::public.compliance_audit_action,
    'supervisory_reassessment_requirement', _req::text, NULL::jsonb,
    jsonb_build_object('entity_id', _entity, 'domain_code', _d,
      'monitoring_state', _v->>'monitoring_state', 'event_type', _event_type,
      'requirement_id', _req),
    _rationale, NULL::text, NULL::text, _v->'lineage');

  RETURN jsonb_build_object('created', true, 'duplicate', false,
    'requirement_id', _req, 'monitoring_state', _v->>'monitoring_state',
    'event_type', _event_type, 'lineage', _v->'lineage');
END $fn$;

/* ------------------------------------------------- governed rescheduling only */

CREATE OR REPLACE FUNCTION public.supervisory_risk_monitoring_reschedule(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _entity uuid := NULLIF(_payload->>'entity_id','')::uuid;
  _d text := upper(COALESCE(NULLIF(_payload->>'domain_code',''),'AML_CFT'));
  _rationale text := btrim(COALESCE(_payload->>'rationale',''));
  _disposition text := upper(COALESCE(NULLIF(_payload->>'disposition',''),'RESCHEDULED'));
  _revised date := NULLIF(_payload->>'revised_due_date','')::date;
  _v jsonb; _act jsonb; _key text; _reg uuid; _id uuid;
  _existing public.supervisory_risk_monitoring_decision;
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
  IF _disposition = 'WAIVED' THEN
    RAISE EXCEPTION 'unsupported_disposition: waiving an AML/CFT review is not supported - no canonical regulator authority exists' USING ERRCODE = '22023';
  END IF;
  IF _disposition NOT IN ('RESCHEDULED','DEFERRED') THEN
    RAISE EXCEPTION 'unsupported_disposition: %', _disposition USING ERRCODE = '22023';
  END IF;
  IF _revised IS NULL THEN
    RAISE EXCEPTION 'revised_due_date is required for a governed schedule decision' USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity);

  _v := public.supervisory_risk_monitoring_view(_entity, _d);
  SELECT a INTO _act FROM jsonb_array_elements(_v->'permitted_actions') a
   WHERE a->>'action' = 'RESCHEDULE_REVIEW';
  IF NOT COALESCE((_act->>'available')::boolean,false) THEN
    RAISE EXCEPTION 'action_blocked: % (%)', _act->>'reason', _act->>'reason_code' USING ERRCODE = '42501';
  END IF;

  _key := md5(concat_ws('|','RESCHEDULE', _uid::text, _entity::text, _d, _disposition,
    _revised::text, COALESCE(NULLIF(_payload->>'idempotency_key',''), _rationale)));
  SELECT * INTO _existing FROM public.supervisory_risk_monitoring_decision WHERE idempotency_key = _key;
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'idempotent', true, 'decision_id', _existing.id,
      'revised_due_date', _existing.revised_due_date, 'disposition', _existing.disposition);
  END IF;

  SELECT l.lead_regulator_id INTO _reg FROM public.licensees l WHERE l.id = _entity;

  PERFORM set_config('app.supervisory_risk_monitoring_writer','governed', true);
  INSERT INTO public.supervisory_risk_monitoring_decision(
    entity_id, domain_code, regulator_id, decision_kind, monitoring_state, due_date_basis,
    basis_source_kind, basis_source_id, programme_id, programme_code, programme_version,
    original_due_date, revised_due_date, disposition,
    risk_state_id, publication_id, assessment_id, rationale, lineage, idempotency_key, decided_by)
  VALUES (_entity, _d, _reg, 'RESCHEDULE', _v->>'monitoring_state',
    _v->'schedule'->>'due_date_basis', _v->'schedule'->>'basis_source_kind',
    NULLIF(_v->'schedule'->>'basis_source_id','')::uuid,
    NULLIF(_v->'schedule'->'programme'->>'id','')::uuid,
    _v->'schedule'->'programme'->>'programme_code',
    _v->'schedule'->'programme'->>'set_version',
    NULLIF(_v->'schedule'->>'next_review_date','')::date, _revised, _disposition,
    NULLIF(_v->'risk'->>'risk_state_id','')::uuid,
    NULLIF(_v->'risk'->>'publication_id','')::uuid,
    NULLIF(_v->'risk'->>'assessment_id','')::uuid,
    _rationale, _v->'lineage', _key, _uid)
  RETURNING id INTO _id;
  PERFORM set_config('app.supervisory_risk_monitoring_writer','', true);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::public.compliance_audit_action,
    'supervisory_risk_monitoring_decision', _id::text, NULL::jsonb,
    jsonb_build_object('entity_id', _entity, 'domain_code', _d, 'disposition', _disposition,
      'original_due_date', _v->'schedule'->>'next_review_date', 'revised_due_date', _revised),
    _rationale, NULL::text, NULL::text, _v->'lineage');

  RETURN jsonb_build_object('created', true, 'decision_id', _id,
    'disposition', _disposition, 'original_due_date', _v->'schedule'->>'next_review_date',
    'revised_due_date', _revised);
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_schedule_internal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_events_internal(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_view(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_due_list(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_require_reassessment(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_risk_monitoring_reschedule(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_risk_monitoring_schedule_internal(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_risk_monitoring_events_internal(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_risk_monitoring_view(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_risk_monitoring_due_list(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_risk_monitoring_require_reassessment(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_risk_monitoring_reschedule(jsonb) TO authenticated, service_role;

COMMENT ON TABLE public.supervisory_risk_monitoring_decision IS
  'AML-09 append-only supervisory monitoring decision history: governed reassessment triggers and governed schedule decisions with their due-date basis, programme snapshot and lineage. Rows are never updated or deleted; a later governed decision supersedes an earlier one. No risk rating is changed here.';
