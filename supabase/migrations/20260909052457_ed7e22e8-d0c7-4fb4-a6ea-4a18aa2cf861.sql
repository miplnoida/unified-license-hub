
-- ===================================================================
-- AML-03 (2/3) — policy profile integration + MIPL reference package
-- ===================================================================

UPDATE public.supervisory_policy_component_type
   SET is_available = true, component_table = 'supervisory_assessment_programme_set'
 WHERE component_type = 'ASSESSMENT_PROGRAMME';

INSERT INTO public.supervisory_policy_domain_component_requirement(
  domain_code, component_type, requirement, required_for_approval, required_for_activation, is_locked, rationale)
VALUES ('AML_CFT','ASSESSMENT_PROGRAMME','REQUIRED', true, true, true,
  'An AML/CFT policy profile must state which assessment programmes the regulator runs and how their periods and triggers are governed.')
ON CONFLICT (domain_code, component_type) DO UPDATE
  SET requirement='REQUIRED', required_for_approval=true, required_for_activation=true,
      is_locked=true, rationale=EXCLUDED.rationale, updated_at=now();

-- ---------- component probe: assessment programme sets ----------
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_probe(_component_type text, _component_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _out jsonb;
BEGIN
  SELECT * INTO _t FROM public.supervisory_policy_component_type
   WHERE component_type = upper(btrim(COALESCE(_component_type,'')));
  IF _t.component_type IS NULL THEN
    RAISE EXCEPTION 'unknown_component_type: %', _component_type USING ERRCODE = '22023'; END IF;
  IF NOT _t.is_available THEN
    RAISE EXCEPTION 'component_type_not_implemented: % is registered in the component catalogue but its architecture does not exist yet, so it cannot be bound', _t.component_type
      USING ERRCODE = '22023'; END IF;

  IF _t.component_type = 'METHODOLOGY' THEN
    SELECT jsonb_build_object(
             'component_id', m.id, 'component_table', 'supervisory_methodology',
             'component_code', m.code, 'component_version', m.version,
             'component_status', m.status, 'domain_code', m.domain_code,
             'regulator_id', m.regulator_id, 'sector_id', m.sector_id, 'origin', m.origin,
             'label', m.code || ' ' || m.version)
      INTO _out FROM public.supervisory_methodology m WHERE m.id = _component_id;

  ELSIF _t.component_type = 'CALCULATION_CONFIG' THEN
    SELECT jsonb_build_object(
             'component_id', c.id, 'component_table', 'supervisory_calculation_config',
             'component_code', m.code || '/calc', 'component_version', c.config_version::text,
             'component_status', c.status, 'domain_code', m.domain_code,
             'regulator_id', m.regulator_id, 'sector_id', m.sector_id, 'origin', m.origin,
             'label', m.code || ' ' || m.version || ' calculation v' || c.config_version)
      INTO _out
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology m ON m.id = c.methodology_id
     WHERE c.id = _component_id;

  ELSIF _t.component_type = 'ASSESSMENT_PROGRAMME' THEN
    SELECT jsonb_build_object(
             'component_id', s.id, 'component_table', 'supervisory_assessment_programme_set',
             'component_code', s.code, 'component_version', s.set_version,
             'component_status', s.status, 'domain_code', s.domain_code,
             'regulator_id', s.regulator_id, 'sector_id', NULL, 'origin', s.origin,
             'label', s.code || ' ' || s.set_version)
      INTO _out FROM public.supervisory_assessment_programme_set s WHERE s.id = _component_id;
  END IF;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'not_found: no % component exists with id %', _t.component_type, _component_id
      USING ERRCODE = '22023'; END IF;
  RETURN _out;
END $$;

-- ---------- MIPL reference AML/CFT programme package ----------
-- This is a mechanical lift of the behaviour previously hard-coded in the New
-- AML/CFT Assessment dialog: four assessment types, five trigger codes, a
-- trailing 365-day period ending yesterday. It is reference content in DRAFT,
-- owned by no regulator, and it is not regulator policy.
DO $$
DECLARE _set uuid; _p uuid; _prof uuid; _probe jsonb;
BEGIN
  SELECT id INTO _set FROM public.supervisory_assessment_programme_set
   WHERE code = 'MIPL-AML-ASSESSMENT-PROGRAMMES' AND set_version = '1.0';
  IF _set IS NULL THEN
    INSERT INTO public.supervisory_assessment_programme_set(
      code, set_version, name, description, domain_code, regulator_id, origin, status, notes)
    VALUES ('MIPL-AML-ASSESSMENT-PROGRAMMES','1.0','MIPL AML/CFT Assessment Programmes',
      'Reference package reproducing the platform''s previous built-in AML/CFT assessment choices, review-period default and trigger vocabulary. Reference content only; it carries no regulator approval.',
      'AML_CFT', NULL, 'MIPL_REFERENCE','DRAFT',
      'Mechanically lifted from the pre-AML-03 New AML/CFT Assessment dialog. No new supervisory policy was invented.')
    RETURNING id INTO _set;

    INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, to_status, rationale, detail)
    VALUES (_set,'CREATED','DRAFT',
      'Reference package created by mechanically lifting existing hard-coded runtime behaviour into governed configuration.',
      jsonb_build_object('origin','MIPL_REFERENCE','lifted_from','AmlNewAssessmentDialog.tsx'));

    -- Periodic
    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, sort_order,
      period_rule, period_value, end_offset_days, allow_manual_override,
      question_class_scope, guidance)
    VALUES (_set,'PERIODIC','Periodic AML/CFT assessment',
      'The regular AML/CFT risk assessment cycle.','PERIODIC',10,
      'TRAILING_DAYS',365,1,true, ARRAY['CORE','CONDITIONAL','ENHANCED']::text[],
      'Reproduces the previous default: a trailing twelve-month review period ending the day before the assessment is started.')
    RETURNING id INTO _p;
    INSERT INTO public.supervisory_assessment_programme_trigger(programme_id, trigger_code, label, is_default, sort_order)
    VALUES (_p,'PERIODIC','Periodic cycle',true,10),
           (_p,'REASSESSMENT','Reassessment requirement',false,20),
           (_p,'THEMATIC','Thematic review',false,30);

    -- Initial baseline
    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, sort_order,
      period_rule, period_value, end_offset_days, allow_manual_override,
      question_class_scope, guidance)
    VALUES (_set,'INITIAL_BASELINE','Initial baseline AML/CFT assessment',
      'The first AML/CFT assessment of a supervised entity.','INITIAL_BASELINE',20,
      'TRAILING_DAYS',365,1,true, ARRAY['CORE','CONDITIONAL','ENHANCED']::text[],
      'Used where no prior AML/CFT assessment of record exists.')
    RETURNING id INTO _p;
    INSERT INTO public.supervisory_assessment_programme_trigger(programme_id, trigger_code, label, is_default, sort_order)
    VALUES (_p,'PERIODIC','Periodic cycle',true,10),
           (_p,'EVENT_DRIVEN','Event or intelligence',false,20);

    -- Follow-up
    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, sort_order,
      period_rule, period_value, end_offset_days, allow_manual_override,
      requires_prior_assessment, question_class_scope, guidance)
    VALUES (_set,'FOLLOW_UP','Follow-up AML/CFT assessment',
      'A follow-up on a previous AML/CFT assessment.','FOLLOW_UP',30,
      'TRAILING_DAYS',365,1,true,true, ARRAY['CORE','CONDITIONAL','ENHANCED']::text[],
      'Reproduces the previous rule that a follow-up is linked to the entity''s prior assessment.')
    RETURNING id INTO _p;
    INSERT INTO public.supervisory_assessment_programme_trigger(programme_id, trigger_code, label, is_default, sort_order, requires_prior_assessment)
    VALUES (_p,'FOLLOW_UP','Follow-up of prior assessment',true,10,true),
           (_p,'REASSESSMENT','Reassessment requirement',false,20,false);

    -- Event driven
    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, sort_order,
      period_rule, period_value, end_offset_days, allow_manual_override,
      question_class_scope, guidance)
    VALUES (_set,'EVENT_DRIVEN','Event-driven AML/CFT assessment',
      'An assessment prompted by an event or supervisory intelligence.','EVENT_DRIVEN',40,
      'TRAILING_DAYS',365,1,true, ARRAY['CORE','CONDITIONAL','ENHANCED']::text[],
      'Reproduces the previous event-driven choice. Whether a recorded signal is mandatory is regulator configuration, not a platform default.')
    RETURNING id INTO _p;
    INSERT INTO public.supervisory_assessment_programme_trigger(programme_id, trigger_code, label, is_default, sort_order)
    VALUES (_p,'EVENT_DRIVEN','Event or intelligence',true,10),
           (_p,'THEMATIC','Thematic review',false,20);
  END IF;

  -- bind the reference package to the existing MIPL reference AML policy profile
  SELECT id INTO _prof FROM public.supervisory_policy_profile
   WHERE code='AML-CFT-POLICY' AND origin='MIPL_REFERENCE' AND domain_code='AML_CFT'
   ORDER BY created_at DESC LIMIT 1;
  IF _prof IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.supervisory_policy_profile_binding
        WHERE profile_id=_prof AND component_type='ASSESSMENT_PROGRAMME') THEN
    _probe := public.supervisory_policy_component_probe('ASSESSMENT_PROGRAMME', _set);
    INSERT INTO public.supervisory_policy_profile_binding(
      profile_id, component_type, component_table, component_id, component_code,
      component_version, component_status, rationale)
    VALUES (_prof,'ASSESSMENT_PROGRAMME', _probe->>'component_table', _set,
      _probe->>'component_code', _probe->>'component_version', _probe->>'component_status',
      'Reference composition: the MIPL AML/CFT reference profile states the reference assessment programme package.');
    INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, detail)
    VALUES (_prof,'COMPONENT_BOUND','DRAFT',
      'Reference assessment programme package bound to the MIPL reference profile.',
      jsonb_build_object('component_type','ASSESSMENT_PROGRAMME','component_id',_set));
  END IF;
END $$;

-- ---------- policy profile adoption also adopts the programme package ----------
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_adopt_reference(
  _reference_profile_id uuid, _regulator_id uuid, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _src public.supervisory_policy_profile; _new_id uuid; _regcode text; _ver text;
        _b record; _probe jsonb; _adopted_id uuid; _adopted jsonb; _adoptions jsonb := '[]'::jsonb; _via text;
BEGIN
  SELECT * INTO _src FROM public.supervisory_policy_profile WHERE id = _reference_profile_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF _src.origin <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'not_a_reference_profile: % % has origin %', _src.code, _src.profile_version, _src.origin
      USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_domain_require_manage_for_regulator(_src.domain_code, _regulator_id);

  SELECT code INTO _regcode FROM public.regulators WHERE id = _regulator_id;
  _ver := _src.profile_version || '+' || _regcode;
  IF EXISTS (SELECT 1 FROM public.supervisory_policy_profile
              WHERE code = _src.code AND profile_version = _ver) THEN
    RAISE EXCEPTION 'already_adopted: % % is already adopted by %', _src.code, _src.profile_version, _regcode
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_policy_profile(
    code, profile_version, domain_code, regulator_id, sector_id, name, title, purpose,
    status, origin, adopted_from_id, notes, created_by)
  VALUES (_src.code, _ver, _src.domain_code, _regulator_id, _src.sector_id,
          _src.name, _src.title, _src.purpose, 'DRAFT', 'REGULATOR_ADOPTED', _src.id, _src.notes, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_policy_profile_requirement(profile_id, component_type, requirement, rationale, set_by)
  SELECT _new_id, component_type, requirement, rationale, _uid
    FROM public.supervisory_policy_profile_requirement WHERE profile_id = _src.id;

  -- Each reference component binding is adopted through that component's own
  -- governed adoption operation. No MIPL reference component is ever bound into
  -- regulator policy, and no adoption logic is duplicated here. The whole
  -- function is one transaction: any failure below leaves no adopted profile.
  FOR _b IN SELECT * FROM public.supervisory_policy_profile_binding WHERE profile_id = _src.id
  LOOP
    _probe := public.supervisory_policy_component_probe(_b.component_type, _b.component_id);

    IF _b.component_type = 'METHODOLOGY' THEN
      _via := 'supervisory_methodology_adopt_reference';
      IF (_probe->>'origin') = 'MIPL_REFERENCE' THEN
        _adopted_id := public.supervisory_methodology_adopt_reference(_b.component_id, _regulator_id, btrim(_rationale));
      ELSE
        _adopted_id := _b.component_id;
      END IF;

    ELSIF _b.component_type = 'ASSESSMENT_PROGRAMME' THEN
      _via := 'supervisory_assessment_programme_adopt_reference';
      IF (_probe->>'origin') = 'MIPL_REFERENCE' THEN
        _adopted_id := public.supervisory_assessment_programme_adopt_reference(_b.component_id, _regulator_id, btrim(_rationale));
      ELSE
        _adopted_id := _b.component_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'component_adoption_not_implemented: % has no governed adoption operation yet; the reference profile must not bind it',
        _b.component_type USING ERRCODE = '22023';
    END IF;

    _adopted := public.supervisory_policy_component_probe(_b.component_type, _adopted_id);
    IF (_adopted->>'origin') = 'MIPL_REFERENCE' THEN
      RAISE EXCEPTION 'adoption_integrity: a MIPL reference % cannot be bound as regulator policy', _b.component_type
        USING ERRCODE = '42501'; END IF;
    IF (_adopted->>'regulator_id') IS DISTINCT FROM _regulator_id::text THEN
      RAISE EXCEPTION 'adoption_integrity: the adopted % does not belong to the adopting regulator', _b.component_type
        USING ERRCODE = '42501'; END IF;

    INSERT INTO public.supervisory_policy_profile_binding(
      profile_id, component_type, component_table, component_id, component_code,
      component_version, component_status, rationale, bound_by)
    VALUES (_new_id, _b.component_type, _adopted->>'component_table', _adopted_id,
            _adopted->>'component_code', _adopted->>'component_version',
            _adopted->>'component_status',
            'Bound by governed policy profile adoption of ' || _src.code || ' ' || _src.profile_version, _uid);

    _adoptions := _adoptions || jsonb_build_object(
      'component_type', _b.component_type, 'reference_component', _probe,
      'adopted_component', _adopted, 'via', _via);

    INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
    VALUES (_new_id, 'COMPONENT_ADOPTED', 'DRAFT', btrim(_rationale), _uid,
            jsonb_build_object('component_type', _b.component_type,
                               'reference_component', _probe, 'adopted_component', _adopted, 'via', _via));
  END LOOP;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'ADOPTED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('adopted_from', _src.id, 'reference_version', _src.profile_version,
                             'regulator_id', _regulator_id, 'component_adoptions', _adoptions));

  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action, 'supervisory_policy_profile', _new_id::text,
          NULL, jsonb_build_object('adopted_from', _src.id, 'profile_version', _ver,
                                   'regulator_id', _regulator_id, 'component_adoptions', _adoptions),
          btrim(_rationale), NULL, NULL, '{}'::jsonb);
  RETURN _new_id;
END $$;
