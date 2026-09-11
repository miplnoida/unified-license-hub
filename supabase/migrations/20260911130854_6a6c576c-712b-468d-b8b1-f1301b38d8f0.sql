-- =====================================================================
-- PCOMP-R2A-C — governed read models for the evidence policy experience.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_policy_view(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment;
        _eval jsonb; _exc jsonb; _can_decide boolean := false; _can_request boolean := false;
        _actions text[];
BEGIN
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  _eval := public.supervisory_assessment_evidence_policy_internal(_assessment_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'rule_code', e.rule_code, 'scope_type', e.scope_type,
           'scope_reference', e.scope_reference,
           'question_id', e.methodology_question_id, 'question_code', q.question_code,
           'dimension_id', e.methodology_dimension_id, 'dimension_code', d.dimension_code,
           'status', e.status, 'rationale', e.rationale, 'deficiency', e.deficiency,
           'policy_component_version', e.policy_component_version,
           'requested_by', e.requested_by,
           'requested_by_name', rp.full_name,
           'requested_at', e.requested_at,
           'decided_by', e.decided_by,
           'decided_by_name', dp.full_name,
           'decided_at', e.decided_at,
           'decision_rationale', e.decision_rationale,
           'is_own_request', e.requested_by = _uid) ORDER BY e.requested_at DESC), '[]'::jsonb)
    INTO _exc
    FROM public.supervisory_assessment_evidence_exception e
    LEFT JOIN public.supervisory_methodology_question q ON q.id = e.methodology_question_id
    LEFT JOIN public.supervisory_methodology_dimension d ON d.id = e.methodology_dimension_id
    LEFT JOIN public.profiles rp ON rp.id = e.requested_by
    LEFT JOIN public.profiles dp ON dp.id = e.decided_by
   WHERE e.assessment_id = _assessment_id;

  _actions := public.supervisory_domain_actions(_a.domain_code, 'approve');
  _can_decide := public.is_super_admin(_uid) OR public.has_any_permission(_uid, _actions);

  BEGIN
    PERFORM public.supervisory_assessment_execution_require_edit(_assessment_id);
    _can_request := true;
  EXCEPTION WHEN OTHERS THEN
    _can_request := false;
  END;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'evaluation', _eval,
    'exceptions', _exc,
    'capabilities', jsonb_build_object(
      'can_request_exception', _can_request,
      'can_decide_exception', _can_decide),
    'viewer_id', _uid);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_policy_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_policy_view(uuid) TO authenticated;

-- --------------------------------------------- controlled authoring -----
CREATE OR REPLACE FUNCTION public.supervisory_evidence_policy_authoring_options(_component_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.supervisory_policy_component; _meth public.supervisory_methodology;
        _meth_id uuid; _source text; _warnings jsonb := '[]'::jsonb;
        _dims jsonb; _qs jsonb; _kinds jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _c FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF _c.component_type <> 'EVIDENCE_POLICY' THEN
    RAISE EXCEPTION 'invalid_request: authoring options are published for evidence policy only'
      USING ERRCODE = '22023';
  END IF;

  SELECT b2.component_id INTO _meth_id
    FROM public.supervisory_policy_profile_binding b
    JOIN public.supervisory_policy_profile_binding b2
      ON b2.profile_id = b.profile_id AND b2.component_type = 'METHODOLOGY'
    JOIN public.supervisory_policy_profile p ON p.id = b.profile_id
   WHERE b.component_type = 'EVIDENCE_POLICY' AND b.component_id = _component_id
   ORDER BY CASE p.status WHEN 'ACTIVE' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
            p.updated_at DESC
   LIMIT 1;
  IF _meth_id IS NOT NULL THEN _source := 'BOUND_POLICY_PROFILE'; END IF;

  IF _meth_id IS NULL THEN
    SELECT m.id INTO _meth_id FROM public.supervisory_methodology m
     WHERE m.domain_code = _c.domain_code AND m.status = 'ACTIVE'
       AND (_c.regulator_id IS NULL OR m.regulator_id IS NULL OR m.regulator_id = _c.regulator_id)
     ORDER BY m.activated_at DESC NULLS LAST, m.updated_at DESC LIMIT 1;
    IF _meth_id IS NOT NULL THEN
      _source := 'ACTIVE_DOMAIN_METHODOLOGY';
      _warnings := _warnings || jsonb_build_object('code','METHODOLOGY_NOT_BOUND_YET',
        'message','This evidence policy is not yet bound in a policy profile. The dimensions and questions offered come from the methodology currently active for this supervisory domain; check them again once the policy is bound.');
    END IF;
  END IF;

  IF _meth_id IS NULL THEN
    _warnings := _warnings || jsonb_build_object('code','NO_METHODOLOGY_AVAILABLE',
      'message','No methodology is available for this supervisory domain, so dimensions and questions cannot be offered. Evidence policy may only qualify a bound methodology.');
  ELSE
    SELECT * INTO _meth FROM public.supervisory_methodology WHERE id = _meth_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('code', upper(d.dimension_code), 'label', d.label)
             ORDER BY d.sort_order, d.dimension_code), '[]'::jsonb)
      INTO _dims FROM public.supervisory_methodology_dimension d
     WHERE d.methodology_id = _meth_id AND d.active;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', upper(q.question_code), 'label', q.prompt,
             'dimension_code', upper(d.dimension_code), 'dimension_label', d.label,
             'requires_evidence', q.requires_evidence)
             ORDER BY d.sort_order, q.sort_order, q.question_code), '[]'::jsonb)
      INTO _qs FROM public.supervisory_methodology_question q
      JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
     WHERE q.methodology_id = _meth_id AND q.active AND d.active;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', t.basis_type,
           'label', COALESCE(t.label, t.basis_type),
           'requires_source_object', t.requires_source_object) ORDER BY t.basis_type), '[]'::jsonb)
    INTO _kinds FROM public.supervisory_evidence_basis_type t WHERE COALESCE(t.active, true);

  RETURN jsonb_build_object(
    'component_id', _component_id,
    'component_code', _c.code,
    'component_version', _c.component_version,
    'scope_types', public.supervisory_policy_vocabulary('EVIDENCE_SCOPE', NULL),
    'evidence_requirements', jsonb_build_array('REQUIRED','OPTIONAL','NOT_REQUIRED'),
    'evidence_kinds', _kinds,
    'methodology_id', _meth_id,
    'methodology_code', _meth.code,
    'methodology_version', _meth.version,
    'methodology_source', _source,
    'dimensions', COALESCE(_dims, '[]'::jsonb),
    'questions', COALESCE(_qs, '[]'::jsonb),
    'warnings', _warnings);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_evidence_policy_authoring_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_evidence_policy_authoring_options(uuid) TO authenticated;