CREATE OR REPLACE FUNCTION public.supervisory_evidence_policy_authoring_options(_component_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Evidence kinds come from the platform's evidence basis type register.
  -- The identifying column on that register is `code`.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', t.code,
           'label', COALESCE(t.label, t.code),
           'requires_source_object', t.requires_source_object)
           ORDER BY t.sort_order, t.code), '[]'::jsonb)
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
END $function$;