-- PCOMP-R2C (2): RESPONSE_POLICY runtime — evaluation, provenance and prohibition enforcement.

-- 1. Immutable response-policy provenance on every supervisory consequence decision.
ALTER TABLE public.supervisory_consequence_decision
  ADD COLUMN IF NOT EXISTS response_policy_basis_status text,
  ADD COLUMN IF NOT EXISTS response_policy_component_id uuid,
  ADD COLUMN IF NOT EXISTS response_policy_code text,
  ADD COLUMN IF NOT EXISTS response_policy_version text,
  ADD COLUMN IF NOT EXISTS response_policy_content_hash text,
  ADD COLUMN IF NOT EXISTS response_policy_profile_code text,
  ADD COLUMN IF NOT EXISTS response_policy_profile_version text,
  ADD COLUMN IF NOT EXISTS response_policy_rule_code text,
  ADD COLUMN IF NOT EXISTS response_policy_level text,
  ADD COLUMN IF NOT EXISTS response_policy_advisory_timeframe_days integer;

COMMENT ON COLUMN public.supervisory_consequence_decision.response_policy_basis_status IS
  'EVALUATED / NOT_GOVERNED / UNAVAILABLE at the moment this consequence was recorded.';
COMMENT ON COLUMN public.supervisory_consequence_decision.response_policy_level IS
  'Policy expectation for this action at the source rating: REQUIRED, RECOMMENDED or PERMITTED. Never a trigger — a supervisor decided.';
COMMENT ON COLUMN public.supervisory_consequence_decision.response_policy_advisory_timeframe_days IS
  'Advisory only. Due, overdue and escalation timing is owned by SLA policy, not response policy.';

-- 2. Server-owned evaluator, resolved only through the assessment policy basis snapshot.
CREATE OR REPLACE FUNCTION public.supervisory_response_policy_internal(_assessment_id uuid, _rating text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _bound jsonb; _cid uuid; _comp public.supervisory_policy_component;
        _rules jsonb; _rule jsonb; _map jsonb; _m jsonb; _band text;
        _status text; _reason_code text; _reason text; _governed boolean := false;
        _exp jsonb := '[]'::jsonb; _level text; _required jsonb := '[]'::jsonb;
BEGIN
  _band := NULLIF(upper(btrim(COALESCE(_rating,''))),'');
  _map  := public.supervisory_response_policy_action_map();

  IF _assessment_id IS NOT NULL THEN
    SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  END IF;

  IF _a.id IS NULL THEN
    _status := 'NOT_GOVERNED'; _reason_code := 'NO_ASSESSMENT_SOURCE';
    _reason := 'This supervisory consequence has no authoritative assessment source, so no response policy governs it. Supervisory judgement and the platform''s own controls apply.';
  ELSE
    SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _a.id;
    IF _snap.id IS NULL THEN
      _status := 'NOT_GOVERNED'; _reason_code := 'NO_POLICY_BASIS';
      _reason := 'This assessment has no policy basis snapshot, so no supervisory response policy governs the consequences drawn from it.';
    ELSE
      SELECT x INTO _bound FROM jsonb_array_elements(_snap.components) x
       WHERE x->>'component_type' = 'RESPONSE_POLICY';
      IF _bound IS NULL THEN
        _status := 'NOT_GOVERNED'; _reason_code := 'RESPONSE_POLICY_NOT_BOUND';
        _reason := 'The policy profile governing this assessment binds no supervisory response policy, so every canonical supervisory action remains available to supervisory judgement.';
      ELSE
        _cid := NULLIF(_bound->>'component_id','')::uuid;
        SELECT * INTO _comp FROM public.supervisory_policy_component WHERE id = _cid;
        IF _comp.id IS NULL THEN
          _status := 'UNAVAILABLE'; _reason_code := 'PINNED_POLICY_MISSING';
          _reason := 'The exact supervisory response policy version recorded in this assessment''s policy basis can no longer be read, so no supervisory consequence may be recorded against it until it is restored.';
        ELSE
          _status := 'EVALUATED'; _governed := true;
          _rules := public.supervisory_response_policy_rules(_comp.content);
        END IF;
      END IF;
    END IF;
  END IF;

  FOR _m IN SELECT x FROM jsonb_array_elements(_map) x LOOP
    _rule := NULL;
    IF _governed AND _band IS NOT NULL THEN
      SELECT r INTO _rule FROM jsonb_array_elements(_rules) r
       WHERE r->>'risk_band' = _band AND r->>'action' = _m->>'policy_action'
       ORDER BY CASE r->>'response_level'
                  WHEN 'PROHIBITED' THEN 1 WHEN 'REQUIRED' THEN 2
                  WHEN 'RECOMMENDED' THEN 3 ELSE 4 END
       LIMIT 1;
    END IF;
    _level := CASE
      WHEN _status = 'UNAVAILABLE' THEN 'UNAVAILABLE'
      WHEN _rule IS NOT NULL THEN _rule->>'response_level'
      ELSE 'PERMITTED' END;

    _exp := _exp || jsonb_build_object(
      'action', _m->>'policy_action',
      'operational_action', _m->>'operational_action',
      'label', _m->>'label',
      'governed', _rule IS NOT NULL,
      'response_level', _level,
      'prohibited', _level = 'PROHIBITED',
      'blocked', _level IN ('PROHIBITED','UNAVAILABLE'),
      'rule_code', _rule->>'rule_code',
      'policy_note', _rule->>'policy_note',
      'rationale_required', true,
      'deferral_allowed', COALESCE((_rule->>'deferral_allowed')::boolean, false),
      'advisory_timeframe_days', NULLIF(_rule->>'advisory_timeframe_days','')::int,
      'timing_authority', 'ADVISORY_UNTIL_SLA_POLICY',
      'prerequisite', _m->>'prerequisite');

    IF _level = 'REQUIRED' THEN
      _required := _required || jsonb_build_object(
        'action', _m->>'policy_action', 'rule_code', _rule->>'rule_code',
        'advisory_timeframe_days', NULLIF(_rule->>'advisory_timeframe_days','')::int);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'source_rating', _band,
    'status', _status,
    'governed', _governed,
    'reason_code', _reason_code,
    'reason', _reason,
    'evaluated_at', now(),
    'policy', CASE WHEN _comp.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
        'component_id', _comp.id, 'code', _comp.code, 'component_version', _comp.component_version,
        'name', _comp.name, 'origin', _comp.origin, 'status', _comp.status,
        'content_hash', _bound->>'content_hash') END,
    'policy_profile', CASE WHEN _snap.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
        'profile_id', _snap.policy_profile_id, 'code', _snap.policy_profile_code,
        'version', _snap.policy_profile_version, 'origin', _snap.policy_profile_origin) END,
    'expectations', _exp,
    'required_responses', _required,
    'timing_ownership', 'Response policy states the expected supervisory response. When an action is due, overdue or escalated is owned by SLA policy.',
    'automation', 'No supervisory action, finding or enforcement case is ever created automatically from a rating. Every consequence is a recorded supervisory decision with a written reason.');
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_response_policy_internal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_internal(uuid, text) TO service_role;
COMMENT ON FUNCTION public.supervisory_response_policy_internal(uuid, text) IS
  'PCOMP-R2C: server-owned supervisory response policy evaluation, pinned to the assessment policy basis snapshot. Internal only; consumed by the AML-08 consequence engine and its read model.';

-- 3. Authenticated read model over the AML-08 consequence source.
CREATE OR REPLACE FUNCTION public.supervisory_consequence_response_policy_view(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT', _assessment_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d text := upper(COALESCE(NULLIF(_domain_code,''),'AML_CFT'));
        _view jsonb; _src jsonb; _eval jsonb; _hist jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _view := public.supervisory_consequence_view(_entity_id, _d, _assessment_id);
  _src  := _view->'source';
  _eval := public.supervisory_response_policy_internal(
             COALESCE(_assessment_id, NULLIF(_src->'assessment'->>'id','')::uuid),
             _src->>'current_rating');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'decision_id', d.id, 'action_type', d.action_type, 'status', d.status,
           'recorded_at', d.created_at,
           'response_policy_basis_status', d.response_policy_basis_status,
           'response_policy_code', d.response_policy_code,
           'response_policy_version', d.response_policy_version,
           'response_policy_rule_code', d.response_policy_rule_code,
           'response_policy_level', d.response_policy_level,
           'response_policy_advisory_timeframe_days', d.response_policy_advisory_timeframe_days)
         ORDER BY d.created_at DESC), '[]'::jsonb)
    INTO _hist
    FROM public.supervisory_consequence_decision d
   WHERE d.entity_id = _entity_id AND d.domain_code = _d;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d,
    'source', _src,
    'evaluation', _eval,
    'decisions', _hist);
END $function$;

GRANT EXECUTE ON FUNCTION public.supervisory_consequence_response_policy_view(uuid, text, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.supervisory_consequence_response_policy_view(uuid, text, uuid) IS
  'PCOMP-R2C: policy-aware presentation of AML-08 next supervisory steps. Read-only; states policy expectation per canonical action and the recorded response-policy provenance of past decisions.';

-- 4. Enforce prohibitions and record provenance inside the canonical AML-08 operation,
--    by patching the live definition in place (no second consequence engine).
DO $mig$
DECLARE _def text; _new text; _needle text; _repl text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_consequence_record' AND pronargs = 1;
  IF _def IS NULL THEN RAISE EXCEPTION 'supervisory_consequence_record not found'; END IF;
  _new := _def;

  -- 4a. declarations
  _needle := '  _plan uuid; _iv uuid; _finding uuid; _priority text; _due date; _owner uuid; _title text;';
  IF position(_needle in _new) = 0 THEN RAISE EXCEPTION 'R2C patch 4a: declaration block not found'; END IF;
  _new := replace(_new, _needle, _needle || E'\n  _resp jsonb; _rexp jsonb;');

  -- 4b. response policy gate, immediately after the canonical availability check
  _needle := E'  IF NOT COALESCE((_act->>\'available\')::boolean,false) THEN\n    RAISE EXCEPTION \'action_blocked: % (%)\', _act->>\'reason\', _act->>\'reason_code\' USING ERRCODE = \'42501\';\n  END IF;';
  IF position(_needle in _new) = 0 THEN RAISE EXCEPTION 'R2C patch 4b: availability check not found'; END IF;
  _repl := _needle || E'\n\n'
    || '  -- PCOMP-R2C: supervisory response policy is consulted, never executed.' || E'\n'
    || '  _resp := public.supervisory_response_policy_internal(' || E'\n'
    || '             COALESCE(_assessment, NULLIF(_src->''assessment''->>''id'','''')::uuid),' || E'\n'
    || '             _src->>''current_rating'');' || E'\n'
    || '  SELECT x INTO _rexp FROM jsonb_array_elements(_resp->''expectations'') x' || E'\n'
    || '   WHERE x->>''action'' = _action;' || E'\n'
    || '  IF _resp->>''status'' = ''UNAVAILABLE'' THEN' || E'\n'
    || '    RAISE EXCEPTION ''response_policy_unavailable: %'', _resp->>''reason'' USING ERRCODE = ''42501'';' || E'\n'
    || '  END IF;' || E'\n'
    || '  IF COALESCE((_rexp->>''prohibited'')::boolean, false) THEN' || E'\n'
    || '    RAISE EXCEPTION ''response_prohibited: the supervisory response policy governing this assessment prohibits % at rating % (rule %)'',' || E'\n'
    || '      _action, COALESCE(_resp->>''source_rating'',''(unavailable)''), COALESCE(_rexp->>''rule_code'',''-'') USING ERRCODE = ''42501'';' || E'\n'
    || '  END IF;';
  _new := replace(_new, _needle, _repl);

  -- 4c. provenance columns
  _needle := '    lineage, idempotency_key, decided_by)';
  IF position(_needle in _new) = 0 THEN RAISE EXCEPTION 'R2C patch 4c: insert column list not found'; END IF;
  _new := replace(_new, _needle,
    '    lineage, idempotency_key, decided_by,' || E'\n'
 || '    response_policy_basis_status, response_policy_component_id, response_policy_code,' || E'\n'
 || '    response_policy_version, response_policy_content_hash, response_policy_profile_code,' || E'\n'
 || '    response_policy_profile_version, response_policy_rule_code, response_policy_level,' || E'\n'
 || '    response_policy_advisory_timeframe_days)');

  -- 4d. provenance values
  _needle := '    _priority, _due, _owner, _lineage, _key, _uid)';
  IF position(_needle in _new) = 0 THEN RAISE EXCEPTION 'R2C patch 4d: insert value list not found'; END IF;
  _new := replace(_new, _needle,
    '    _priority, _due, _owner, _lineage, _key, _uid,' || E'\n'
 || '    _resp->>''status'', NULLIF(_resp->''policy''->>''component_id'','''')::uuid,' || E'\n'
 || '    _resp->''policy''->>''code'', _resp->''policy''->>''component_version'',' || E'\n'
 || '    _resp->''policy''->>''content_hash'', _resp->''policy_profile''->>''code'',' || E'\n'
 || '    _resp->''policy_profile''->>''version'', _rexp->>''rule_code'', _rexp->>''response_level'',' || E'\n'
 || '    NULLIF(_rexp->>''advisory_timeframe_days'','''')::int)');

  EXECUTE _new;
END $mig$;

COMMENT ON FUNCTION public.supervisory_consequence_record(jsonb) IS
  'AML-08 canonical supervisory consequence operation. PCOMP-R2C: consults the governing supervisory response policy, refuses prohibited responses and responses whose pinned policy cannot be read, and records immutable response-policy provenance. It never creates or escalates anything automatically.';