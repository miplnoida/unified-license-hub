-- PCOMP-R2D (2) — SLA_POLICY runtime: governed supervisory response deadlines.
-- Canonical owner of every deadline, pause, breach and escalation remains the
-- platform SLA stage engine. SLA policy states duration, day basis, pause
-- permission and escalation profile only.

-- ---------------------------------------------------------------------------
-- 1. Additive extension of the canonical stage opener. The existing seven
--    argument signature is preserved exactly and now delegates, so every
--    existing caller and its behaviour are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sla_stage_open(
  _process_type text, _entity_type text, _entity_id uuid,
  _workflow_instance_id uuid, _step_id uuid, _stage_name text,
  _started_at timestamp with time zone,
  _sla_hours_override numeric, _calendar_profile_override uuid,
  _sla_source_override text, _metadata jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_res RECORD;
  v_id uuid;
  v_start timestamptz := COALESCE(_started_at, now());
  v_name text := COALESCE(_stage_name, (SELECT name FROM public.approval_steps WHERE id = _step_id));
  v_hours numeric; v_cal uuid; v_src text; v_cfg uuid;
BEGIN
  -- Close any still-open stage for the same workflow instance.
  PERFORM public.sla_stage_complete(id, 'superseded')
  FROM public.sla_stage_instances
  WHERE state IN ('active','paused','breached')
    AND (
      (_workflow_instance_id IS NOT NULL AND workflow_instance_id = _workflow_instance_id)
      OR (_workflow_instance_id IS NULL AND entity_type = _entity_type AND entity_id = _entity_id)
    );

  SELECT * INTO v_res FROM public.resolve_stage_sla(_process_type, v_name, _step_id);

  IF _sla_hours_override IS NOT NULL THEN
    v_hours := _sla_hours_override;
    v_cal   := _calendar_profile_override;
    v_src   := COALESCE(_sla_source_override, 'policy');
    v_cfg   := NULL;
  ELSE
    v_hours := v_res.sla_hours;
    v_cal   := COALESCE(_calendar_profile_override, v_res.calendar_profile_id);
    v_src   := COALESCE(_sla_source_override, v_res.sla_source, 'step');
    v_cfg   := v_res.sla_config_id;
  END IF;

  INSERT INTO public.sla_stage_instances(
    process_type, entity_type, entity_id, workflow_instance_id, step_id, stage_name,
    sla_config_id, sla_hours, sla_source, calendar_profile_id, started_at, due_at, state, metadata
  ) VALUES (
    _process_type, _entity_type, _entity_id, _workflow_instance_id, _step_id, v_name,
    v_cfg, v_hours, v_src, v_cal,
    v_start, public.sla_add_duration(v_start, v_hours, v_cal), 'active',
    COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  PERFORM public.sla_stage_log_event(v_id, 'started', NULL, 'active', NULL,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object('sla_hours', v_hours, 'sla_source', v_src));
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.sla_stage_open(
  _process_type text, _entity_type text, _entity_id uuid,
  _workflow_instance_id uuid DEFAULT NULL::uuid, _step_id uuid DEFAULT NULL::uuid,
  _stage_name text DEFAULT NULL::text,
  _started_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.sla_stage_open(_process_type, _entity_type, _entity_id, _workflow_instance_id,
                               _step_id, _stage_name, _started_at,
                               NULL::numeric, NULL::uuid, NULL::text, NULL::jsonb);
$function$;

REVOKE ALL ON FUNCTION public.sla_stage_open(text,text,uuid,uuid,uuid,text,timestamptz,numeric,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_stage_open(text,text,uuid,uuid,uuid,text,timestamptz,numeric,uuid,text,jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Immutable governed obligation record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisory_response_sla_obligation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL UNIQUE REFERENCES public.supervisory_consequence_decision(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL,
  domain_code text NOT NULL,
  assessment_id uuid,
  source_rating text,
  action_type text NOT NULL,
  obligation_key uuid NOT NULL UNIQUE,
  stage_instance_id uuid REFERENCES public.sla_stage_instances(id) ON DELETE SET NULL,
  process_type text,
  stage_name text,
  sla_policy_basis_status text NOT NULL,
  sla_policy_reason_code text,
  sla_policy_component_id uuid,
  sla_policy_code text,
  sla_policy_version text,
  sla_policy_content_hash text,
  sla_policy_profile_code text,
  sla_policy_profile_version text,
  sla_policy_rule_code text,
  sla_duration_days numeric,
  sla_calendar_mode text,
  sla_hours numeric,
  calendar_profile_id uuid,
  calendar_resolution text,
  pause_permitted boolean NOT NULL DEFAULT false,
  pause_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  warning_percentage numeric,
  escalation_tier_profile text,
  breach_severity text,
  response_policy_rule_code text,
  response_policy_advisory_timeframe_days integer,
  due_at timestamptz,
  outcome text NOT NULL DEFAULT 'PENDING',
  closed_at timestamptz,
  closure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT srso_outcome_chk CHECK (outcome IN ('PENDING','ON_TIME','LATE','NOT_APPLICABLE')),
  CONSTRAINT srso_basis_chk CHECK (sla_policy_basis_status IN ('EVALUATED','NOT_GOVERNED','UNAVAILABLE'))
);

CREATE INDEX IF NOT EXISTS srso_entity_idx ON public.supervisory_response_sla_obligation(entity_id, domain_code);
CREATE INDEX IF NOT EXISTS srso_outcome_idx ON public.supervisory_response_sla_obligation(outcome);

GRANT SELECT ON public.supervisory_response_sla_obligation TO authenticated;
GRANT ALL ON public.supervisory_response_sla_obligation TO service_role;

ALTER TABLE public.supervisory_response_sla_obligation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS srso_internal_read ON public.supervisory_response_sla_obligation;
CREATE POLICY srso_internal_read ON public.supervisory_response_sla_obligation
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid()));

DROP POLICY IF EXISTS srso_no_client_insert ON public.supervisory_response_sla_obligation;
CREATE POLICY srso_no_client_insert ON public.supervisory_response_sla_obligation
  FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS srso_no_client_update ON public.supervisory_response_sla_obligation;
CREATE POLICY srso_no_client_update ON public.supervisory_response_sla_obligation
  FOR UPDATE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS srso_no_client_delete ON public.supervisory_response_sla_obligation;
CREATE POLICY srso_no_client_delete ON public.supervisory_response_sla_obligation
  FOR DELETE TO anon, authenticated USING (false);

-- Provenance is immutable: only outcome/closure may ever advance, once.
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_obligation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable: supervisory response deadline records cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF OLD.outcome <> 'PENDING' THEN
    RAISE EXCEPTION 'immutable: this supervisory response deadline is already closed as %', OLD.outcome USING ERRCODE = '42501';
  END IF;
  IF NEW.decision_id <> OLD.decision_id
     OR NEW.obligation_key <> OLD.obligation_key
     OR NEW.action_type <> OLD.action_type
     OR NEW.sla_policy_basis_status <> OLD.sla_policy_basis_status
     OR COALESCE(NEW.sla_policy_component_id::text,'') <> COALESCE(OLD.sla_policy_component_id::text,'')
     OR COALESCE(NEW.sla_policy_rule_code,'') <> COALESCE(OLD.sla_policy_rule_code,'')
     OR COALESCE(NEW.sla_policy_version,'') <> COALESCE(OLD.sla_policy_version,'')
     OR COALESCE(NEW.sla_duration_days::text,'') <> COALESCE(OLD.sla_duration_days::text,'')
     OR COALESCE(NEW.due_at::text,'') <> COALESCE(OLD.due_at::text,'')
     OR COALESCE(NEW.stage_instance_id::text,'') <> COALESCE(OLD.stage_instance_id::text,'')
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'immutable: the policy basis of a supervisory response deadline cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS srso_immutable_guard ON public.supervisory_response_sla_obligation;
CREATE TRIGGER srso_immutable_guard
  BEFORE UPDATE OR DELETE ON public.supervisory_response_sla_obligation
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_response_sla_obligation_guard();

CREATE OR REPLACE FUNCTION public.supervisory_response_sla_writer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('supervisory.sla_writer', true) <> 'on' THEN
    RAISE EXCEPTION 'not_authorized: supervisory response deadlines are recorded by the platform SLA runtime only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS srso_writer_guard ON public.supervisory_response_sla_obligation;
CREATE TRIGGER srso_writer_guard
  BEFORE INSERT OR UPDATE ON public.supervisory_response_sla_obligation
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_response_sla_writer_guard();

COMMENT ON TABLE public.supervisory_response_sla_obligation IS
'PCOMP-R2D. Immutable link between one AML/CFT supervisory consequence decision and the governed deadline the platform SLA stage engine opened for it, with the exact SLA policy version and rule the deadline was judged against. Not a second SLA engine: every clock, pause, breach and escalation lives in sla_stage_instances / sla_stage_events / sla_escalation_dispatches.';

-- ---------------------------------------------------------------------------
-- 3. Server-owned SLA policy evaluation, resolved only through the immutable
--    Policy Basis of the assessment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_sla_policy_internal(
  _assessment_id uuid, _action text, _rating text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _bound jsonb; _cid uuid; _comp public.supervisory_policy_component;
        _rules jsonb; _rule jsonb; _act text; _band text;
        _status text; _reason_code text; _reason text; _governed boolean := false;
        _hours numeric; _cal uuid; _calres text; _prof jsonb;
BEGIN
  _act  := NULLIF(upper(btrim(COALESCE(_action,''))),'');
  _band := NULLIF(upper(btrim(COALESCE(_rating,''))),'');

  IF _assessment_id IS NOT NULL THEN
    SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  END IF;

  IF _a.id IS NULL THEN
    _status := 'NOT_GOVERNED'; _reason_code := 'NO_ASSESSMENT_SOURCE';
    _reason := 'This supervisory response has no authoritative assessment source, so no SLA policy governs when it is due. Existing platform SLA configuration and supervisory judgement continue to apply.';
  ELSE
    SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _a.id;
    IF _snap.id IS NULL THEN
      _status := 'NOT_GOVERNED'; _reason_code := 'NO_POLICY_BASIS';
      _reason := 'This assessment carries no policy basis, so no SLA policy governs the timing of responses drawn from it.';
    ELSE
      SELECT x INTO _bound FROM jsonb_array_elements(_snap.components) x
       WHERE x->>'component_type' = 'SLA_POLICY';
      IF _bound IS NULL THEN
        _status := 'NOT_GOVERNED'; _reason_code := 'SLA_POLICY_NOT_BOUND';
        _reason := 'The policy profile governing this assessment binds no SLA policy, so response timing remains advisory and subject to supervisory judgement.';
      ELSE
        _cid := NULLIF(_bound->>'component_id','')::uuid;
        SELECT * INTO _comp FROM public.supervisory_policy_component WHERE id = _cid;
        IF _comp.id IS NULL THEN
          _status := 'UNAVAILABLE'; _reason_code := 'PINNED_POLICY_MISSING';
          _reason := 'The exact SLA policy version recorded in this assessment''s policy basis can no longer be read, so no governed deadline can be established from it.';
        ELSE
          _rules := public.supervisory_sla_policy_rules(_comp.content);

          SELECT r INTO _rule FROM jsonb_array_elements(_rules) r
           WHERE (r->>'applies_to_action' IS NULL OR r->>'applies_to_action' = _act)
             AND (r->>'risk_band' IS NULL OR r->>'risk_band' = _band)
           ORDER BY (CASE WHEN r->>'applies_to_action' = _act THEN 0 ELSE 1 END)
                  + (CASE WHEN r->>'risk_band' = _band THEN 0 ELSE 1 END)
           LIMIT 1;

          IF _rule IS NULL THEN
            _status := 'NOT_GOVERNED'; _reason_code := 'NO_MATCHING_SLA_RULE';
            _reason := 'The bound SLA policy states no deadline for this supervisory response at this risk rating, so its timing remains a matter of supervisory judgement.';
          ELSE
            _status := 'EVALUATED'; _governed := true;
            _hours := (_rule->>'duration_days')::numeric * 24.0;
            IF _rule->>'calendar_mode' = 'BUSINESS_DAYS' THEN
              SELECT id INTO _cal FROM public.business_calendar_profiles
               ORDER BY COALESCE(is_default,false) DESC, created_at ASC LIMIT 1;
              _calres := CASE WHEN _cal IS NULL
                THEN 'NO_BUSINESS_CALENDAR_CONFIGURED' ELSE 'BUSINESS_CALENDAR' END;
            ELSE
              _cal := NULL; _calres := 'CALENDAR_DAYS';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF _snap.id IS NOT NULL THEN
    _prof := jsonb_build_object(
      'profile_id', _snap.profile_id,
      'code', _snap.profile_code,
      'version', _snap.profile_version);
  END IF;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'action', _act,
    'source_rating', _band,
    'status', _status,
    'governed', _governed,
    'reason_code', _reason_code,
    'reason', _reason,
    'evaluated_at', now(),
    'policy', CASE WHEN _comp.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
      'component_id', _comp.id, 'code', _comp.code, 'component_version', _comp.component_version,
      'name', _comp.name, 'origin', _comp.origin, 'status', _comp.status,
      'content_hash', _comp.content_hash) END,
    'policy_profile', _prof,
    'rule', _rule,
    'resolved', CASE WHEN NOT _governed THEN NULL::jsonb ELSE jsonb_build_object(
      'sla_hours', _hours,
      'calendar_profile_id', _cal,
      'calendar_resolution', _calres) END,
    'timing_authority','SLA_POLICY',
    'engine','PLATFORM_SLA_STAGE_ENGINE',
    'automation','SLA policy establishes when a recorded supervisory response is due, overdue and escalated. It never creates, approves or closes a supervisory action, finding or enforcement case.');
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Opening a governed deadline for a recorded supervisory consequence.
--    Total by design: SLA policy governs timing and must never prevent a
--    supervisory consequence from being recorded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_open(_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _d public.supervisory_consequence_decision; _eval jsonb; _rule jsonb;
        _key uuid := gen_random_uuid(); _stage uuid; _proc text; _oid uuid;
BEGIN
  SELECT * INTO _d FROM public.supervisory_consequence_decision WHERE id = _decision_id;
  IF _d.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_response_sla_obligation WHERE decision_id = _decision_id) THEN
    RETURN NULL;
  END IF;

  _eval := public.supervisory_sla_policy_internal(_d.assessment_id, _d.action_type, _d.source_rating);
  _rule := _eval->'rule';
  _proc := COALESCE(NULLIF(_rule->>'escalation_tier_profile',''), 'aml_supervisory_response');

  IF COALESCE((_eval->>'governed')::boolean, false) THEN
    _stage := public.sla_stage_open(
      _proc, 'aml_supervisory_response', _key, _key, NULL,
      COALESCE(NULLIF(_rule->>'stage',''), _d.action_type), _d.decided_at,
      (_eval->'resolved'->>'sla_hours')::numeric,
      NULLIF(_eval->'resolved'->>'calendar_profile_id','')::uuid,
      'policy',
      jsonb_build_object(
        'sla_policy_code', _eval->'policy'->>'code',
        'sla_policy_version', _eval->'policy'->>'component_version',
        'sla_policy_rule_code', _rule->>'rule_code',
        'sla_calendar_mode', _rule->>'calendar_mode',
        'supervisory_decision_id', _d.id,
        'supervisory_entity_id', _d.entity_id,
        'supervisory_action', _d.action_type));
  END IF;

  PERFORM set_config('supervisory.sla_writer','on', true);
  INSERT INTO public.supervisory_response_sla_obligation(
    decision_id, entity_id, domain_code, assessment_id, source_rating, action_type,
    obligation_key, stage_instance_id, process_type, stage_name,
    sla_policy_basis_status, sla_policy_reason_code,
    sla_policy_component_id, sla_policy_code, sla_policy_version, sla_policy_content_hash,
    sla_policy_profile_code, sla_policy_profile_version, sla_policy_rule_code,
    sla_duration_days, sla_calendar_mode, sla_hours, calendar_profile_id, calendar_resolution,
    pause_permitted, pause_reasons, warning_percentage, escalation_tier_profile, breach_severity,
    response_policy_rule_code, response_policy_advisory_timeframe_days,
    due_at, outcome)
  VALUES (
    _d.id, _d.entity_id, _d.domain_code, _d.assessment_id, _d.source_rating, _d.action_type,
    _key, _stage, CASE WHEN _stage IS NULL THEN NULL ELSE _proc END,
    NULLIF(_rule->>'stage',''),
    _eval->>'status', _eval->>'reason_code',
    NULLIF(_eval->'policy'->>'component_id','')::uuid,
    _eval->'policy'->>'code', _eval->'policy'->>'component_version',
    _eval->'policy'->>'content_hash',
    _eval->'policy_profile'->>'code', _eval->'policy_profile'->>'version',
    _rule->>'rule_code',
    NULLIF(_rule->>'duration_days','')::numeric, _rule->>'calendar_mode',
    (_eval->'resolved'->>'sla_hours')::numeric,
    NULLIF(_eval->'resolved'->>'calendar_profile_id','')::uuid,
    _eval->'resolved'->>'calendar_resolution',
    COALESCE((_rule->>'pause_permitted')::boolean,false),
    COALESCE(_rule->'pause_reasons','[]'::jsonb),
    NULLIF(_rule->>'warning_percentage','')::numeric,
    NULLIF(_rule->>'escalation_tier_profile',''), _rule->>'breach_severity',
    _d.response_policy_rule_code, _d.response_policy_advisory_timeframe_days,
    (SELECT due_at FROM public.sla_stage_instances WHERE id = _stage),
    CASE WHEN _stage IS NULL THEN 'NOT_APPLICABLE' ELSE 'PENDING' END)
  RETURNING id INTO _oid;
  PERFORM set_config('supervisory.sla_writer','off', true);

  RETURN _oid;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('supervisory.sla_writer','off', true);
  RAISE WARNING 'PCOMP-R2D: governed SLA could not be opened for consequence % (%)', _decision_id, SQLERRM;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_sla_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_open(uuid) TO service_role;

-- Closure on withdrawal / supersession, and automatic opening on record.
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _o public.supervisory_response_sla_obligation;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.supervisory_response_sla_open(NEW.id);
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status,'') = COALESCE(OLD.status,'')
     AND COALESCE(NEW.withdrawn_at::text,'') = COALESCE(OLD.withdrawn_at::text,'') THEN
    RETURN NEW;
  END IF;
  IF upper(COALESCE(NEW.status,'')) NOT IN ('WITHDRAWN','SUPERSEDED') THEN RETURN NEW; END IF;

  SELECT * INTO _o FROM public.supervisory_response_sla_obligation WHERE decision_id = NEW.id;
  IF _o.id IS NULL OR _o.outcome <> 'PENDING' THEN RETURN NEW; END IF;

  IF _o.stage_instance_id IS NOT NULL THEN
    PERFORM public.sla_stage_complete(_o.stage_instance_id,
      'supervisory consequence ' || lower(NEW.status));
  END IF;

  PERFORM set_config('supervisory.sla_writer','on', true);
  UPDATE public.supervisory_response_sla_obligation
     SET outcome = 'NOT_APPLICABLE', closed_at = now(),
         closure_reason = 'The supervisory consequence was ' || lower(NEW.status) || ', so its governed deadline no longer applies.'
   WHERE id = _o.id;
  PERFORM set_config('supervisory.sla_writer','off', true);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS scd_sla_sync ON public.supervisory_consequence_decision;
CREATE TRIGGER scd_sla_sync
  AFTER INSERT OR UPDATE ON public.supervisory_consequence_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_response_sla_sync();

-- ---------------------------------------------------------------------------
-- 5. Governed pause / resume / completion. Policy decides whether the clock
--    may stop; the canonical engine performs and records the transition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_pause(
  _obligation_id uuid, _reason text, _resume boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _o public.supervisory_response_sla_obligation;
        _r text := btrim(COALESCE(_reason,''));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.supervisory_response_sla_obligation WHERE id = _obligation_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'not_found: supervisory response deadline' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _o.entity_id);
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'aml_supervision','review')
          OR public.has_permission(_uid,'supervisory_spine','review')) THEN
    RAISE EXCEPTION 'not_authorized: supervisory review authority is required to hold a supervisory deadline' USING ERRCODE = '42501';
  END IF;
  IF _o.stage_instance_id IS NULL OR _o.outcome <> 'PENDING' THEN
    RAISE EXCEPTION 'sla_not_open: this supervisory response has no open governed deadline' USING ERRCODE = '22023';
  END IF;
  IF length(_r) < 10 THEN
    RAISE EXCEPTION 'rationale_required: a written reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  IF NOT _resume THEN
    IF NOT _o.pause_permitted THEN
      RAISE EXCEPTION 'sla_pause_prohibited: the SLA policy governing this response (rule %) does not permit its deadline to be paused',
        COALESCE(_o.sla_policy_rule_code,'-') USING ERRCODE = '42501';
    END IF;
    IF jsonb_array_length(_o.pause_reasons) > 0
       AND NOT (_o.pause_reasons @> to_jsonb(upper(_r))) THEN
      RAISE EXCEPTION 'sla_pause_reason_not_permitted: the SLA policy governing this response permits a hold only for %',
        (SELECT string_agg(v, ', ') FROM jsonb_array_elements_text(_o.pause_reasons) v) USING ERRCODE = '42501';
    END IF;
    PERFORM public.sla_stage_pause('aml_supervisory_response', _o.obligation_key, _r,
      jsonb_build_object('sla_policy_rule_code', _o.sla_policy_rule_code, 'actor_id', _uid));
  ELSE
    PERFORM public.sla_stage_resume('aml_supervisory_response', _o.obligation_key, _r,
      jsonb_build_object('sla_policy_rule_code', _o.sla_policy_rule_code, 'actor_id', _uid));
  END IF;

  RETURN (SELECT jsonb_build_object('obligation_id', _o.id, 'state', s.state,
                 'due_at', s.due_at, 'pause_seconds', s.pause_seconds)
            FROM public.sla_stage_instances s WHERE s.id = _o.stage_instance_id);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_sla_pause(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_pause(uuid, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_response_sla_complete(
  _obligation_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _o public.supervisory_response_sla_obligation;
        _s public.sla_stage_instances; _outcome text; _r text := btrim(COALESCE(_reason,''));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.supervisory_response_sla_obligation WHERE id = _obligation_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'not_found: supervisory response deadline' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _o.entity_id);
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'aml_supervision','review')
          OR public.has_permission(_uid,'supervisory_spine','review')) THEN
    RAISE EXCEPTION 'not_authorized: supervisory review authority is required to close a supervisory deadline' USING ERRCODE = '42501';
  END IF;
  IF _o.outcome <> 'PENDING' OR _o.stage_instance_id IS NULL THEN
    RAISE EXCEPTION 'sla_not_open: this supervisory response has no open governed deadline' USING ERRCODE = '22023';
  END IF;
  IF length(_r) < 10 THEN
    RAISE EXCEPTION 'rationale_required: a written completion note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _s FROM public.sla_stage_instances WHERE id = _o.stage_instance_id;
  _outcome := CASE
    WHEN _s.state = 'breached' THEN 'LATE'
    WHEN _s.due_at IS NOT NULL AND now() > _s.due_at THEN 'LATE'
    ELSE 'ON_TIME' END;

  PERFORM public.sla_stage_complete(_o.stage_instance_id, _r);

  PERFORM set_config('supervisory.sla_writer','on', true);
  UPDATE public.supervisory_response_sla_obligation
     SET outcome = _outcome, closed_at = now(), closure_reason = _r
   WHERE id = _o.id;
  PERFORM set_config('supervisory.sla_writer','off', true);

  RETURN jsonb_build_object('obligation_id', _o.id, 'outcome', _outcome,
                            'due_at', _s.due_at, 'closed_at', now());
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_sla_complete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_complete(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Authenticated read model.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_view(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT'::text, _assessment_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d text := upper(COALESCE(NULLIF(_domain_code,''),'AML_CFT'));
        _view jsonb; _src jsonb; _aid uuid; _rating text; _exp jsonb := '[]'::jsonb;
        _m jsonb; _e jsonb; _obl jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _view   := public.supervisory_consequence_view(_entity_id, _d, _assessment_id);
  _src    := _view->'source';
  _aid    := COALESCE(_assessment_id, NULLIF(_src->'assessment'->>'id','')::uuid);
  _rating := _src->>'current_rating';

  FOR _m IN SELECT x FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) x LOOP
    _e := public.supervisory_sla_policy_internal(_aid, _m->>'policy_action', _rating);
    _exp := _exp || jsonb_build_object(
      'action', _m->>'policy_action',
      'label', _m->>'label',
      'status', _e->>'status',
      'governed', (_e->>'governed')::boolean,
      'reason_code', _e->>'reason_code',
      'reason', _e->>'reason',
      'rule_code', _e->'rule'->>'rule_code',
      'stage', _e->'rule'->>'stage',
      'duration_days', NULLIF(_e->'rule'->>'duration_days','')::numeric,
      'calendar_mode', _e->'rule'->>'calendar_mode',
      'pause_permitted', COALESCE((_e->'rule'->>'pause_permitted')::boolean,false),
      'pause_reasons', COALESCE(_e->'rule'->'pause_reasons','[]'::jsonb),
      'warning_percentage', NULLIF(_e->'rule'->>'warning_percentage','')::numeric,
      'escalation_tier_profile', _e->'rule'->>'escalation_tier_profile',
      'breach_severity', _e->'rule'->>'breach_severity',
      'policy_note', _e->'rule'->>'policy_note',
      'policy', _e->'policy',
      'policy_profile', _e->'policy_profile');
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'obligation_id', o.id, 'decision_id', o.decision_id,
           'action_type', o.action_type, 'stage_name', o.stage_name,
           'sla_policy_basis_status', o.sla_policy_basis_status,
           'sla_policy_reason_code', o.sla_policy_reason_code,
           'sla_policy_code', o.sla_policy_code,
           'sla_policy_version', o.sla_policy_version,
           'sla_policy_rule_code', o.sla_policy_rule_code,
           'sla_duration_days', o.sla_duration_days,
           'sla_calendar_mode', o.sla_calendar_mode,
           'calendar_resolution', o.calendar_resolution,
           'pause_permitted', o.pause_permitted,
           'pause_reasons', o.pause_reasons,
           'breach_severity', o.breach_severity,
           'escalation_tier_profile', o.escalation_tier_profile,
           'due_at', o.due_at, 'outcome', o.outcome, 'closed_at', o.closed_at,
           'recorded_at', o.created_at,
           'stage', CASE WHEN s.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
             'stage_instance_id', s.id, 'state', s.state, 'started_at', s.started_at,
             'due_at', s.due_at, 'paused_at', s.paused_at, 'pause_seconds', s.pause_seconds,
             'breached_at', s.breached_at, 'completed_at', s.completed_at,
             'sla_hours', s.sla_hours, 'sla_source', s.sla_source,
             'first_breach_notified_at', s.first_breach_notified_at) END,
           'escalations', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('tier', x.tier, 'dispatched_at', x.created_at,
                                                 'recipients', x.recipients) ORDER BY x.tier)
               FROM public.sla_escalation_dispatches x
              WHERE x.workflow_instance_id = o.obligation_key), '[]'::jsonb))
         ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO _obl
    FROM public.supervisory_response_sla_obligation o
    LEFT JOIN public.sla_stage_instances s ON s.id = o.stage_instance_id
   WHERE o.entity_id = _entity_id AND o.domain_code = _d;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d,
    'assessment_id', _aid, 'source_rating', _rating,
    'expectations', _exp,
    'obligations', _obl,
    'timing_authority','SLA_POLICY',
    'engine','PLATFORM_SLA_STAGE_ENGINE',
    'automation','Deadlines, holds, breaches and escalation are recorded by the platform SLA engine. No supervisory action, finding or enforcement case is ever created or closed automatically.');
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_sla_view(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_response_sla_view(uuid, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Capability promotion — server-owned truth.
-- ---------------------------------------------------------------------------
UPDATE public.supervisory_policy_component_type
   SET is_runtime_consumed = true,
       canonical_owner = 'Platform SLA stage engine (sla_stage_instances / sla_stage_events / sla_escalation_tiers) with governed supervisory response deadlines',
       capability_note = 'PCOMP-R2D. SLA policy is consumed at runtime: a governed deadline is opened for every recorded AML/CFT supervisory consequence through the assessment''s immutable policy basis. Deadlines, holds, breaches and escalation are calculated and recorded by the platform SLA engine; the policy states duration, day basis, pause permission, warning threshold and escalation profile. Nothing is executed automatically.',
       updated_at = now()
 WHERE component_type = 'SLA_POLICY';