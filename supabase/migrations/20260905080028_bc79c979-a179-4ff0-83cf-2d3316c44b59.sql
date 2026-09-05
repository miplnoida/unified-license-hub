-- ============================================================
-- OS-01 canonical supervisory activity contract
-- Server-owned engagement vocabulary + intervention execution contract.
-- No new business tables; existing objects only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.supervisory_engagement_types()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_agg(jsonb_build_object('value', v.value, 'label', v.label, 'mode', v.mode)
                   ORDER BY v.ord)
  FROM (VALUES
    ('FULL_SCOPE_ONSITE',    'Full-scope onsite examination', 'ONSITE',  1),
    ('TARGETED_ONSITE',      'Targeted onsite examination',   'ONSITE',  2),
    ('OFFSITE_REVIEW',       'Offsite review',                'OFFSITE', 3),
    ('FOLLOW_UP_REVIEW',     'Follow-up review',              'MIXED',   4),
    ('JOINT_EXAMINATION',    'Joint examination',             'ONSITE',  5),
    ('THEMATIC_EXAMINATION', 'Thematic examination',          'MIXED',   6)
  ) AS v(value, label, mode, ord)
$$;

COMMENT ON FUNCTION public.supervisory_engagement_types() IS
  'OS-01: canonical examination engagement vocabulary, matching examinations_engagement_type_chk. Single source for every UI.';

-- Execution contract for an intervention type: what activity object executes it,
-- and which canonical engagement types it may open.
CREATE OR REPLACE FUNCTION public.supervisory_intervention_execution_contract(_intervention_type text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE _t text := upper(btrim(coalesce(_intervention_type, '')));
        _kind text; _allowed text[]; _default text; _explicit boolean := false;
BEGIN
  CASE _t
    WHEN 'TARGETED_EXAMINATION'    THEN _kind := 'EXAMINATION'; _allowed := ARRAY['TARGETED_ONSITE'];
    WHEN 'FULL_SCOPE_EXAMINATION'  THEN _kind := 'EXAMINATION'; _allowed := ARRAY['FULL_SCOPE_ONSITE'];
    WHEN 'OFFSITE_REVIEW'          THEN _kind := 'EXAMINATION'; _allowed := ARRAY['OFFSITE_REVIEW'];
    WHEN 'FOLLOW_UP_REVIEW'        THEN _kind := 'EXAMINATION'; _allowed := ARRAY['FOLLOW_UP_REVIEW'];
    WHEN 'THEMATIC_REVIEW'         THEN _kind := 'EXAMINATION'; _allowed := ARRAY['THEMATIC_EXAMINATION'];
    WHEN 'ONSITE_EXAMINATION'      THEN
      -- Semantically ambiguous between full-scope, targeted and joint onsite work:
      -- the officer must choose explicitly; the server never guesses.
      _kind := 'EXAMINATION';
      _allowed := ARRAY['FULL_SCOPE_ONSITE','TARGETED_ONSITE','JOINT_EXAMINATION'];
      _explicit := true;
    WHEN 'INVESTIGATION'           THEN _kind := 'INVESTIGATION'; _allowed := ARRAY[]::text[];
    WHEN 'FORMAL_INVESTIGATION'    THEN _kind := 'INVESTIGATION'; _allowed := ARRAY[]::text[];
    WHEN 'DESK_REVIEW'             THEN _kind := 'LIGHTWEIGHT';   _allowed := ARRAY[]::text[];
    WHEN 'SUPERVISORY_MEETING'     THEN _kind := 'LIGHTWEIGHT';   _allowed := ARRAY[]::text[];
    WHEN 'SUPERVISORY_ENGAGEMENT'  THEN _kind := 'LIGHTWEIGHT';   _allowed := ARRAY[]::text[];
    WHEN 'INFORMATION_REQUEST'     THEN _kind := 'LIGHTWEIGHT';   _allowed := ARRAY[]::text[];
    WHEN 'ENHANCED_MONITORING'     THEN _kind := 'LIGHTWEIGHT';   _allowed := ARRAY[]::text[];
    WHEN 'REMEDIATION_FOLLOWUP'    THEN _kind := 'LIGHTWEIGHT';   _allowed := ARRAY[]::text[];
    WHEN 'FORMAL_FINDING'          THEN _kind := 'REFERRAL';      _allowed := ARRAY[]::text[];
    WHEN 'ESCALATION_REFERRAL'     THEN _kind := 'REFERRAL';      _allowed := ARRAY[]::text[];
    WHEN 'ENFORCEMENT_REFERRAL'    THEN _kind := 'REFERRAL';      _allowed := ARRAY[]::text[];
    ELSE _kind := 'UNKNOWN'; _allowed := ARRAY[]::text[];
  END CASE;

  IF array_length(_allowed, 1) = 1 AND NOT _explicit THEN
    _default := _allowed[1];
  END IF;

  RETURN jsonb_build_object(
    'intervention_type', _t,
    'execution_kind', _kind,
    'allowed_engagement_types', to_jsonb(_allowed),
    'default_engagement_type', _default,
    'requires_explicit_engagement', _explicit
  );
END;
$$;

COMMENT ON FUNCTION public.supervisory_intervention_execution_contract(text) IS
  'OS-01: intervention type -> execution kind and canonical engagement types. Business-label to canonical-value only, no guessing.';

-- Governed read: what can actually be done with this intervention right now.
CREATE OR REPLACE FUNCTION public.supervisory_intervention_execution_capabilities(_intervention_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
        _iv public.supervisory_intervention;
        _c jsonb; _kind text; _allowed text[];
        _activity_id uuid; _activity_kind text; _activity_route text;
        _can boolean := false; _block text;
        _status text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _iv FROM public.supervisory_intervention WHERE id = _intervention_id;
  IF _iv.id IS NULL THEN
    RAISE EXCEPTION 'not_found: intervention' USING ERRCODE = '22023';
  END IF;
  IF _iv.licensee_id IS NOT NULL THEN
    PERFORM public.supervisory_entity_scope_check(_uid, _iv.licensee_id);
  END IF;

  _c := public.supervisory_intervention_execution_contract(_iv.intervention_type);
  _kind := _c->>'execution_kind';
  SELECT array_agg(x) INTO _allowed
    FROM jsonb_array_elements_text(_c->'allowed_engagement_types') AS t(x);
  _allowed := coalesce(_allowed, ARRAY[]::text[]);
  _status := upper(coalesce(_iv.status, ''));

  IF _iv.examination_id IS NOT NULL THEN
    _activity_id := _iv.examination_id; _activity_kind := 'EXAMINATION';
    _activity_route := '/supervision/examinations/' || _iv.examination_id::text;
  ELSIF _iv.investigation_id IS NOT NULL THEN
    _activity_id := _iv.investigation_id; _activity_kind := 'INVESTIGATION';
  ELSIF _iv.thematic_review_id IS NOT NULL THEN
    _activity_id := _iv.thematic_review_id; _activity_kind := 'THEMATIC_REVIEW';
  END IF;

  IF _kind <> 'EXAMINATION' THEN
    _block := CASE _kind
      WHEN 'LIGHTWEIGHT' THEN 'This intervention is a lightweight supervisory action, not a formal examination. Complete or decide it, request information, or escalate it to a formal offsite review or examination.'
      WHEN 'INVESTIGATION' THEN 'This intervention is executed as an investigation, not an examination.'
      WHEN 'REFERRAL' THEN 'This intervention is a referral and has no examination execution.'
      ELSE 'This intervention type has no recognised execution object.'
    END;
  ELSIF _activity_id IS NOT NULL THEN
    _block := 'A supervisory activity has already been opened for this intervention.';
  ELSIF _status NOT IN ('ENDORSED','ACTIVE') THEN
    _block := 'The intervention must be endorsed before an examination is opened (current ' || _status || ').';
  ELSE
    _can := true;
  END IF;

  RETURN jsonb_build_object(
    'intervention_id', _iv.id,
    'intervention_type', _iv.intervention_type,
    'status', _iv.status,
    'domain_code', _iv.domain_code,
    'execution_kind', _kind,
    'can_open_examination', _can,
    'allowed_engagement_types', to_jsonb(_allowed),
    'default_engagement_type', _c->>'default_engagement_type',
    'requires_explicit_engagement', (_c->>'requires_explicit_engagement')::boolean,
    'block_reason', _block,
    'existing_activity_id', _activity_id,
    'existing_activity_kind', _activity_kind,
    'existing_activity_route', _activity_route,
    'engagement_vocabulary', public.supervisory_engagement_types()
  );
END;
$$;

COMMENT ON FUNCTION public.supervisory_intervention_execution_capabilities(uuid) IS
  'OS-01: governed capability read so no UI has to guess which interventions open an examination or which engagement types are valid.';

GRANT EXECUTE ON FUNCTION public.supervisory_engagement_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_execution_contract(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_execution_capabilities(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Enforce the contract inside the governed examination opener.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_examination_open(
  _intervention_id uuid,
  _title text,
  _engagement_type text,
  _domain_code text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _origin_assessment_ids uuid[] DEFAULT NULL,
  _risk_focus_dimension_ids uuid[] DEFAULT NULL,
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL,
  _lead_examiner_id uuid DEFAULT NULL,
  _methodology_id uuid DEFAULT NULL,
  _trigger_type text DEFAULT 'PLANNED_SUPERVISION'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _iv public.supervisory_intervention; _entity uuid; _domain text;
        _id uuid; _ref text; _a uuid; _d uuid;
        _contract jsonb; _kind text; _allowed text[]; _eng text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create','aml_supervision.examine',
    'prudential_supervision.manage_examination','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  SELECT * INTO _iv FROM public.supervisory_intervention WHERE id = _intervention_id;
  IF _iv.id IS NULL THEN RAISE EXCEPTION 'not_found: intervention' USING ERRCODE = '22023'; END IF;
  IF _iv.status NOT IN ('ENDORSED','ACTIVE') THEN
    RAISE EXCEPTION 'intervention must be endorsed before an examination is opened (current %)', _iv.status
      USING ERRCODE = '55000'; END IF;
  IF _engagement_type IS NULL THEN
    RAISE EXCEPTION 'an engagement type is required' USING ERRCODE = '22023'; END IF;

  _eng := upper(btrim(_engagement_type));

  -- Canonical vocabulary only: display aliases such as 'targeted' are rejected.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.supervisory_engagement_types()) AS t(v)
    WHERE t.v->>'value' = _eng
  ) THEN
    RAISE EXCEPTION 'engagement_type_not_canonical: % is not an official examination engagement type', _engagement_type
      USING ERRCODE = '22023';
  END IF;

  _contract := public.supervisory_intervention_execution_contract(_iv.intervention_type);
  _kind := _contract->>'execution_kind';
  SELECT array_agg(x) INTO _allowed
    FROM jsonb_array_elements_text(_contract->'allowed_engagement_types') AS t(x);
  _allowed := coalesce(_allowed, ARRAY[]::text[]);

  IF _kind <> 'EXAMINATION' THEN
    RAISE EXCEPTION 'intervention_not_examination_backed: % is executed as % and cannot open an examination',
      _iv.intervention_type, _kind USING ERRCODE = '55000';
  END IF;
  IF NOT (_eng = ANY (_allowed)) THEN
    RAISE EXCEPTION 'engagement_type_not_allowed_for_intervention: % cannot be opened as % (allowed: %)',
      _iv.intervention_type, _eng, array_to_string(_allowed, ', ') USING ERRCODE = '22023';
  END IF;

  _entity := COALESCE(_entity_id, _iv.licensee_id);
  IF _entity IS NULL THEN RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity);
  _domain := COALESCE(_domain_code, _iv.domain_code);

  INSERT INTO public.examinations(entity_id, regulator_id, sector_id, title, examination_type,
    engagement_type, stage, period_under_review_start, period_under_review_end, lead_examiner_id,
    domain_code, intervention_id, plan_id, methodology_id, trigger_type, origin_provenance, created_by)
  VALUES (_entity, _iv.regulator_id, _iv.sector_id, btrim(_title), _eng,
    _eng, 'planned', _period_start, _period_end, COALESCE(_lead_examiner_id,_uid),
    _domain, _intervention_id, _iv.plan_id, _methodology_id, _trigger_type, 'GOVERNED', _uid)
  RETURNING id, reference INTO _id, _ref;

  IF _origin_assessment_ids IS NOT NULL THEN
    FOREACH _a IN ARRAY _origin_assessment_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment WHERE id = _a) THEN
        RAISE EXCEPTION 'not_found: originating assessment %', _a USING ERRCODE = '22023'; END IF;
      INSERT INTO public.examination_origin(examination_id, assessment_id, origin_role, created_by)
      VALUES (_id, _a, 'DRIVING_ASSESSMENT', _uid) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  IF _risk_focus_dimension_ids IS NOT NULL THEN
    FOREACH _d IN ARRAY _risk_focus_dimension_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension WHERE id = _d) THEN
        RAISE EXCEPTION 'not_found: assessment dimension %', _d USING ERRCODE = '22023'; END IF;
      INSERT INTO public.examination_origin(examination_id, assessment_dimension_id, origin_role, created_by)
      VALUES (_id, _d, 'RISK_FOCUS', _uid);
    END LOOP;
  END IF;
  IF _iv.attention_id IS NOT NULL THEN
    INSERT INTO public.examination_origin(examination_id, attention_id, origin_role, created_by)
    VALUES (_id, _iv.attention_id, 'ATTENTION', _uid);
  END IF;

  PERFORM public.supervisory_intervention_link_activity(_intervention_id, 'examination', _id);

  PERFORM public.log_compliance_audit('CREATE','examination',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain,'engagement_type',_eng,
      'intervention_id',_intervention_id),
    'Examination ' || COALESCE(_ref,_id::text) || ' opened from intervention ' || _iv.reference);

  RETURN jsonb_build_object('id',_id,'reference',_ref,'domain_code',_domain,
    'engagement_type',_eng,'intervention_id',_intervention_id,'plan_id',_iv.plan_id);
END $$;

-- ------------------------------------------------------------
-- Direct register creation also records a canonical engagement type.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.examination_create(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid; _id uuid; _after jsonb; _eng text;
BEGIN
  _uid := public.conduct_require('prudential_supervision','manage_examination');
  IF nullif(_payload->>'entity_id','') IS NULL THEN
    RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023';
  END IF;

  _eng := upper(btrim(coalesce(nullif(_payload->>'engagement_type',''), nullif(_payload->>'examination_type',''), '')));
  IF _eng = '' THEN
    RAISE EXCEPTION 'an engagement type is required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.supervisory_engagement_types()) AS t(v)
    WHERE t.v->>'value' = _eng
  ) THEN
    RAISE EXCEPTION 'engagement_type_not_canonical: % is not an official examination engagement type', _eng
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.examinations (entity_id, regulator_id, sector_id, title, examination_type, engagement_type,
        stage, risk_rating, period_under_review_start, period_under_review_end, fieldwork_start, fieldwork_end,
        lead_examiner_id, created_by)
  VALUES ((_payload->>'entity_id')::uuid, nullif(_payload->>'regulator_id','')::uuid, nullif(_payload->>'sector_id','')::uuid,
          nullif(_payload->>'title',''), _eng, _eng,
          coalesce(nullif(_payload->>'stage',''),'planned'), nullif(_payload->>'risk_rating',''),
          nullif(_payload->>'period_under_review_start','')::date, nullif(_payload->>'period_under_review_end','')::date,
          nullif(_payload->>'fieldwork_start','')::date, nullif(_payload->>'fieldwork_end','')::date,
          coalesce(nullif(_payload->>'lead_examiner_id','')::uuid, _uid), _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(e) INTO _after FROM public.examinations e WHERE e.id=_id;
  PERFORM public.prudential_audit_event('examination_created','examination',_id,
    NULL, _after, jsonb_build_object('examination_id',_id,'entity_id',(_payload->>'entity_id')::uuid),
    NULL, 'CREATE'::public.compliance_audit_action);
  RETURN _after;
END; $$;