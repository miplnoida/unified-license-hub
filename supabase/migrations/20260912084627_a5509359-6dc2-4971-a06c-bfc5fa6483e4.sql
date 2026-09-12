-- PCOMP-R2E — integrated policy chain trace (read model only).
-- Composes the four certified runtime read models plus the rating chain into
-- one server-owned answer. It decides nothing: every status, version and
-- content hash is taken from the existing governed contracts.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_trace(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _a public.supervisory_assessment;
  _basis jsonb;
  _ev jsonb; _ju jsonb; _re jsonb; _sla jsonb;
  _links jsonb := '[]'::jsonb;
  _run public.supervisory_assessment_calculation_run;
  _dec public.supervisory_assessment_approval_decision;
  _pub public.supervisory_assessment_risk_publication;
  _state public.entity_risk_state;
  _cons int; _obl int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.has_any_permission(_uid, public.supervisory_domain_actions(_a.domain_code, 'view')) THEN
    RAISE EXCEPTION 'not_authorized: % required',
      array_to_string(public.supervisory_domain_actions(_a.domain_code, 'view'), ' or ')
      USING ERRCODE = '42501'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  _basis := public.supervisory_assessment_policy_basis(_assessment_id);

  -- Evidence policy (flat version keys on its own evaluation contract).
  BEGIN
    _ev := public.supervisory_assessment_evidence_policy_view(_assessment_id)->'evaluation';
  EXCEPTION WHEN OTHERS THEN _ev := NULL; END;
  _links := _links || jsonb_build_array(jsonb_build_object(
    'stage','EVIDENCE','component_type','EVIDENCE_POLICY',
    'status', COALESCE(_ev->>'status','UNAVAILABLE'),
    'reason_code', _ev->>'reason_code',
    'reason', _ev->>'reason',
    'policy_component_code', _ev->>'policy_component_code',
    'policy_component_version', _ev->>'policy_component_version',
    'policy_content_hash', _ev->>'policy_content_hash',
    'policy_profile_version', _ev->>'policy_profile_version',
    'blocking_count', COALESCE((_ev->>'blocking_count')::int, 0),
    'measure', CASE WHEN _ev IS NULL THEN NULL ELSE
      format('%s requirement(s), %s satisfied', COALESCE(_ev->>'decision_count','0'),
             COALESCE(_ev->>'satisfied_count','0')) END));

  -- Judgement policy.
  BEGIN
    _ju := public.supervisory_assessment_judgement_policy_view(_assessment_id)->'evaluation';
  EXCEPTION WHEN OTHERS THEN _ju := NULL; END;
  _links := _links || jsonb_build_array(jsonb_build_object(
    'stage','JUDGEMENT','component_type','JUDGEMENT_POLICY',
    'status', COALESCE(_ju->>'status','UNAVAILABLE'),
    'reason_code', _ju->>'reason_code',
    'reason', _ju->>'reason',
    'policy_component_code', (_ju->'policy')->>'code',
    'policy_component_version', (_ju->'policy')->>'component_version',
    'policy_content_hash', (_ju->'policy')->>'content_hash',
    'policy_profile_version', (_ju->'policy_profile')->>'version',
    'blocking_count', 0,
    'measure', CASE WHEN _ju IS NULL THEN NULL ELSE
      format('departure %s, at most %s band step(s)',
             CASE WHEN COALESCE((_ju->>'override_permitted')::boolean,false)
                  THEN 'available' ELSE 'not available' END,
             COALESCE(_ju->>'max_band_steps','-')) END));

  -- Response policy, judged on the operative rating for this assessment.
  BEGIN
    _re := public.supervisory_consequence_response_policy_view(
             _a.entity_id, _a.domain_code, _assessment_id)->'evaluation';
  EXCEPTION WHEN OTHERS THEN _re := NULL; END;
  _links := _links || jsonb_build_array(jsonb_build_object(
    'stage','RESPONSE','component_type','RESPONSE_POLICY',
    'status', COALESCE(_re->>'status','UNAVAILABLE'),
    'reason_code', _re->>'reason_code',
    'reason', _re->>'reason',
    'policy_component_code', (_re->'policy')->>'code',
    'policy_component_version', (_re->'policy')->>'component_version',
    'policy_content_hash', (_re->'policy')->>'content_hash',
    'policy_profile_version', (_re->'policy_profile')->>'version',
    'blocking_count', 0,
    'measure', CASE WHEN _re IS NULL THEN NULL ELSE
      format('%s expected response(s) at rating %s',
             COALESCE(jsonb_array_length(_re->'expectations'),0),
             COALESCE(_re->>'source_rating','-')) END));

  -- SLA policy: the governed deadlines already recorded for this assessment.
  BEGIN
    _sla := public.supervisory_response_sla_view(_a.entity_id, _a.domain_code, _assessment_id);
  EXCEPTION WHEN OTHERS THEN _sla := NULL; END;
  _links := _links || jsonb_build_array(jsonb_build_object(
    'stage','SLA','component_type','SLA_POLICY',
    'status', CASE
      WHEN _sla IS NULL THEN 'UNAVAILABLE'
      WHEN jsonb_array_length(COALESCE(_sla->'expectations','[]'::jsonb)) > 0
        OR jsonb_array_length(COALESCE(_sla->'obligations','[]'::jsonb)) > 0 THEN 'EVALUATED'
      ELSE 'NOT_GOVERNED' END,
    'reason_code', NULL,
    'reason', NULL,
    'policy_component_code', ((_sla->'expectations')->0->'policy')->>'code',
    'policy_component_version', ((_sla->'expectations')->0->'policy')->>'component_version',
    'policy_content_hash', ((_sla->'expectations')->0->'policy')->>'content_hash',
    'policy_profile_version', ((_sla->'expectations')->0->'policy_profile')->>'version',
    'blocking_count', 0,
    'measure', CASE WHEN _sla IS NULL THEN NULL ELSE
      format('%s governed deadline(s) recorded',
             COALESCE(jsonb_array_length(_sla->'obligations'),0)) END));

  SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;
  SELECT * INTO _dec FROM public.supervisory_assessment_approval_decision
   WHERE assessment_id = _assessment_id AND decision = 'approved'
   ORDER BY decided_at DESC LIMIT 1;
  SELECT * INTO _pub FROM public.supervisory_assessment_risk_publication
   WHERE assessment_id = _assessment_id ORDER BY published_at DESC LIMIT 1;
  SELECT * INTO _state FROM public.entity_risk_state
   WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code;

  SELECT count(*) INTO _cons FROM public.supervisory_consequence_decision
   WHERE assessment_id = _assessment_id;
  SELECT count(*) INTO _obl FROM public.supervisory_response_sla_obligation
   WHERE assessment_id = _assessment_id;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'assessment_reference', _a.reference,
    'assessment_status', _a.status,
    'entity_id', _a.entity_id,
    'domain_code', _a.domain_code,
    'policy_basis', _basis,
    'links', _links,
    'rating', jsonb_build_object(
      'calculation_run_id', _run.id,
      'calculation_status', _run.status,
      'calculated_rating', _run.residual_rating,
      'calculated_at', _run.calculated_at,
      'result_hash', _run.result_hash,
      'approved_rating', _dec.final_rating,
      'approved_rating_source', _dec.final_rating_source,
      'approved_at', _dec.decided_at,
      'published_rating', _pub.published_rating,
      'published_at', _pub.published_at,
      'operative_rating', _state.residual_rating,
      'operative_inherent_rating', _state.inherent_rating,
      'operative_control_rating', _state.control_rating),
    'downstream', jsonb_build_object(
      'consequence_decisions', _cons,
      'sla_obligations', _obl),
    'authority', 'Every status, version and rating in this trail is decided by the platform from the policy package pinned to this assessment. Nothing here is calculated in the browser.',
    'generated_at', now());
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_trace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_trace(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_policy_trace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_policy_trace(uuid) TO service_role;