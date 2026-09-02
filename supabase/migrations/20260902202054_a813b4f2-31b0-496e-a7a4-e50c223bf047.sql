-- =====================================================================
-- EPIC 3 / MIGRATION A — AML/CFT RBAC + versioned methodology engine
-- =====================================================================

-- ---------------------------------------------------------------- 1. RBAC
DO $$
DECLARE
  v_module_id uuid;
  v_sec_module_id uuid;
  v_action record;
  v_action_id uuid;
  v_sec_perm_id uuid;
  v_perm_id uuid;
  v_role_id uuid;
  v_tpl record;
BEGIN
  SELECT id INTO v_module_id FROM public.permission_modules WHERE key = 'aml_supervision';
  IF v_module_id IS NULL THEN
    INSERT INTO public.permission_modules (key, label, description, audience, sort_order, is_system, is_active)
    VALUES ('aml_supervision', 'AML/CFT Supervision',
            'AML/CFT risk assessment, examination, findings and remediation supervision.',
            'internal', 330, true, true)
    RETURNING id INTO v_module_id;
  END IF;

  SELECT id INTO v_sec_module_id FROM public.sec_modules WHERE key = 'aml_supervision';
  IF v_sec_module_id IS NULL THEN
    INSERT INTO public.sec_modules (key, label, description, module_type, audience, sort_order, is_system, is_active)
    VALUES ('aml_supervision', 'AML/CFT Supervision',
            'AML/CFT risk assessment, examination, findings and remediation supervision.',
            'supervision', 'internal', 330, true, true)
    RETURNING id INTO v_sec_module_id;
  END IF;

  FOR v_action IN
    SELECT * FROM (VALUES
      ('view',                'View AML/CFT Supervision',        10),
      ('view_confidential',   'View Confidential AML Material',  20),
      ('create',              'Create AML/CFT Assessment',       30),
      ('edit',                'Edit AML/CFT Assessment',         40),
      ('submit',              'Submit AML/CFT Assessment',       50),
      ('review',              'Review AML/CFT Assessment',       60),
      ('approve',             'Approve AML/CFT Assessment',      70),
      ('assign',              'Assign AML/CFT Work',             80),
      ('examine',             'Conduct AML/CFT Examination',     90),
      ('finding_manage',      'Manage AML/CFT Findings',        100),
      ('remediation_manage',  'Manage AML/CFT Remediation',     110),
      ('manage_config',       'Configure AML/CFT Methodology',  120)
    ) AS t(action_key, action_label, ord)
  LOOP
    -- authoritative security catalogue
    SELECT id INTO v_sec_perm_id FROM public.sec_permissions
     WHERE module_id = v_sec_module_id AND key = v_action.action_key;
    IF v_sec_perm_id IS NULL THEN
      INSERT INTO public.sec_permissions (module_id, key, label, sort_order,
                                          is_sensitive, is_enforced, is_system, is_active)
      VALUES (v_sec_module_id, v_action.action_key, v_action.action_label, v_action.ord,
              v_action.action_key = 'view_confidential', true, true, true);
    ELSE
      UPDATE public.sec_permissions SET is_active = true, is_enforced = true WHERE id = v_sec_perm_id;
    END IF;

    SELECT id INTO v_action_id FROM public.permission_actions
     WHERE module_id = v_module_id AND key = v_action.action_key;
    IF v_action_id IS NULL THEN
      INSERT INTO public.permission_actions (module_id, key, label, audience, sort_order, is_system, is_active)
      VALUES (v_module_id, v_action.action_key, v_action.action_label, 'internal', v_action.ord, true, true)
      RETURNING id INTO v_action_id;
    END IF;

    SELECT id INTO v_perm_id FROM public.permissions
     WHERE module = 'aml_supervision' AND name = v_action.action_key;
    IF v_perm_id IS NULL THEN
      INSERT INTO public.permissions (module, name, description, action_id, enforced, deprecated)
      VALUES ('aml_supervision', v_action.action_key,
              v_action.action_label || ' (AML/CFT Supervision)', v_action_id, true, false);
    ELSE
      UPDATE public.permissions SET action_id = v_action_id, enforced = true WHERE id = v_perm_id;
    END IF;
  END LOOP;

  -- super_admin: full authority
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'super_admin';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id FROM public.permissions p
     WHERE p.module = 'aml_supervision'
       AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                        WHERE rp.role_id = v_role_id AND rp.permission_id = p.id);
  END IF;

  -- new personas
  INSERT INTO public.sec_role_templates (key, name, description, role_type, dashboard_tier, sort_order, is_system, is_active)
  VALUES
    ('aml_senior_analyst', 'Senior AML/CFT Analyst',
     'Prepares and reviews AML/CFT risk assessments, examinations and findings; cannot approve.',
     'internal', 'operational', 195, true, true),
    ('aml_head', 'Head of AML/CFT',
     'Owns the AML/CFT supervisory programme: methodology configuration, approval and confidential material.',
     'internal', 'supervisory', 196, true, true)
  ON CONFLICT (key) DO NOTHING;

  -- persona -> AML action matrix (least privilege; maker/checker preserved)
  FOR v_tpl IN
    SELECT * FROM (VALUES
      ('aml_supervision_officer',    ARRAY['view','create','edit','submit','examine','finding_manage','remediation_manage']),
      ('aml_senior_analyst',         ARRAY['view','create','edit','submit','review','assign','examine','finding_manage','remediation_manage']),
      ('aml_supervision_supervisor', ARRAY['view','view_confidential','review','approve','assign','examine','finding_manage','remediation_manage']),
      ('aml_head',                   ARRAY['view','view_confidential','create','edit','review','approve','assign','examine','finding_manage','remediation_manage','manage_config']),
      ('inspector',                  ARRAY['view','examine','finding_manage']),
      ('inspection_supervisor',      ARRAY['view','review','examine','finding_manage','remediation_manage']),
      ('enforcement_officer',        ARRAY['view']),
      ('enforcement_supervisor',     ARRAY['view','view_confidential'])
    ) AS t(tpl_key, actions)
  LOOP
    INSERT INTO public.sec_role_template_permissions (template_id, permission_id)
    SELECT t.id, p.id
      FROM public.sec_role_templates t
      JOIN public.sec_permissions p ON p.module_id = v_sec_module_id AND p.key = ANY (v_tpl.actions)
     WHERE t.key = v_tpl.tpl_key
       AND NOT EXISTS (SELECT 1 FROM public.sec_role_template_permissions x
                        WHERE x.template_id = t.id AND x.permission_id = p.id);

    -- widen live roles materialised from the template (never narrow)
    INSERT INTO public.sec_role_permissions (role_id, permission_id)
    SELECT r.id, p.id
      FROM public.sec_roles r
      JOIN public.sec_permissions p ON p.module_id = v_sec_module_id AND p.key = ANY (v_tpl.actions)
     WHERE r.key = v_tpl.tpl_key
       AND NOT EXISTS (SELECT 1 FROM public.sec_role_permissions x
                        WHERE x.role_id = r.id AND x.permission_id = p.id);
  END LOOP;
END $$;

-- ------------------------------------------------- 2. canonical rating scale
CREATE TABLE IF NOT EXISTS public.supervisory_rating_scale (
  code           text PRIMARY KEY,
  label          text NOT NULL,
  ordinal        integer NOT NULL,
  band           text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisory_rating_scale TO authenticated;
GRANT ALL ON public.supervisory_rating_scale TO service_role;
ALTER TABLE public.supervisory_rating_scale ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_rating_scale_read ON public.supervisory_rating_scale;
CREATE POLICY supervisory_rating_scale_read ON public.supervisory_rating_scale
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.supervisory_rating_scale(code, label, ordinal, band) VALUES
  ('LOW',         'Low',         1, 'ACCEPTABLE'),
  ('MODERATE',    'Moderate',    2, 'ACCEPTABLE'),
  ('MEDIUM_HIGH', 'Medium-High', 3, 'ELEVATED'),
  ('HIGH',        'High',        4, 'ELEVATED'),
  ('SEVERE',      'Severe',      5, 'CRITICAL')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.supervisory_rating_valid(_rating text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _rating IS NULL
      OR EXISTS (SELECT 1 FROM public.supervisory_rating_scale s
                  WHERE s.code = upper(_rating) AND s.is_active);
$$;

REVOKE ALL ON FUNCTION public.supervisory_rating_valid(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_rating_valid(text) TO authenticated, service_role;

-- ------------------------------------------------- 3. methodology extensions
ALTER TABLE public.supervisory_methodology
  ADD COLUMN IF NOT EXISTS title                     text,
  ADD COLUMN IF NOT EXISTS assessment_frequency_months integer,
  ADD COLUMN IF NOT EXISTS applicable_entity_types   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_sector_ids     uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scoring_scale             jsonb  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS override_threshold        text,
  ADD COLUMN IF NOT EXISTS approval_required         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_review_rule          jsonb  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calculation_guidance      text,
  ADD COLUMN IF NOT EXISTS supersedes_id             uuid REFERENCES public.supervisory_methodology(id),
  ADD COLUMN IF NOT EXISTS reviewed_by               uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by               uuid,
  ADD COLUMN IF NOT EXISTS approved_at               timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at              timestamptz,
  ADD COLUMN IF NOT EXISTS retired_at                timestamptz;

ALTER TABLE public.supervisory_methodology DROP CONSTRAINT IF EXISTS supervisory_methodology_status_chk;
ALTER TABLE public.supervisory_methodology ADD CONSTRAINT supervisory_methodology_status_chk
  CHECK (status = ANY (ARRAY['DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED']));

ALTER TABLE public.supervisory_methodology_dimension
  ADD COLUMN IF NOT EXISTS dimension_kind        text,
  ADD COLUMN IF NOT EXISTS scoring_guidance      text,
  ADD COLUMN IF NOT EXISTS mandatory_questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_sources          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_requirements text,
  ADD COLUMN IF NOT EXISTS min_evidence_count    integer NOT NULL DEFAULT 0;

UPDATE public.supervisory_methodology_dimension
   SET dimension_kind = CASE dimension_group
         WHEN 'INHERENT_RISK' THEN 'INHERENT'
         WHEN 'CONTROL_EFFECTIVENESS' THEN 'CONTROL'
         ELSE 'COMPOSITE' END
 WHERE dimension_kind IS NULL;

ALTER TABLE public.supervisory_methodology_dimension
  DROP CONSTRAINT IF EXISTS supervisory_methodology_dimension_kind_chk;
ALTER TABLE public.supervisory_methodology_dimension
  ADD CONSTRAINT supervisory_methodology_dimension_kind_chk
  CHECK (dimension_kind IS NULL OR dimension_kind = ANY (ARRAY['INHERENT','CONTROL','COMPOSITE']));

-- methodology change history
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  from_status    text,
  to_status      text,
  rationale      text,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id       uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sup_method_event_method ON public.supervisory_methodology_event(methodology_id, created_at DESC);

GRANT SELECT ON public.supervisory_methodology_event TO authenticated;
GRANT ALL ON public.supervisory_methodology_event TO service_role;
ALTER TABLE public.supervisory_methodology_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_methodology_event_read ON public.supervisory_methodology_event;
CREATE POLICY supervisory_methodology_event_read ON public.supervisory_methodology_event
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_any_permission(auth.uid(), ARRAY[
         'supervisory_spine.view','prudential_supervision.view',
         'market_conduct.run_conduct_analytics','aml_supervision.view'])
  );

-- ------------------------------------------------- 4. governed operations
CREATE OR REPLACE FUNCTION public.supervisory_methodology_save(
  _payload jsonb, _methodology_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _status text; _domain text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);

  IF _methodology_id IS NULL THEN
    _domain := upper(COALESCE(_payload->>'domain_code',''));
    IF NOT public.supervisory_domain_valid(_domain) THEN
      RAISE EXCEPTION 'invalid_domain: %', _domain USING ERRCODE = '22023'; END IF;

    INSERT INTO public.supervisory_methodology(
      code, domain_code, name, title, version, status, sector_id, regulator_id,
      effective_from, effective_to, definition, assessment_frequency_months,
      applicable_entity_types, applicable_sector_ids, scoring_scale, override_threshold,
      approval_required, next_review_rule, calculation_guidance, created_by)
    VALUES (
      COALESCE(_payload->>'code', 'METH-' || substr(md5(random()::text),1,8)),
      _domain,
      COALESCE(_payload->>'name','Untitled methodology'),
      _payload->>'title',
      COALESCE(_payload->>'version','1.0'),
      'DRAFT',
      NULLIF(_payload->>'sector_id','')::uuid,
      NULLIF(_payload->>'regulator_id','')::uuid,
      NULLIF(_payload->>'effective_from','')::date,
      NULLIF(_payload->>'effective_to','')::date,
      COALESCE(_payload->'definition','{}'::jsonb),
      NULLIF(_payload->>'assessment_frequency_months','')::integer,
      COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_payload->'applicable_entity_types','[]'::jsonb)) AS value), '{}'),
      '{}',
      COALESCE(_payload->'scoring_scale','[]'::jsonb),
      _payload->>'override_threshold',
      COALESCE((_payload->>'approval_required')::boolean, true),
      COALESCE(_payload->'next_review_rule','{}'::jsonb),
      _payload->>'calculation_guidance',
      _uid)
    RETURNING id INTO _id;

    INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id)
    VALUES (_id, 'CREATED', 'DRAFT', 'Methodology version created', _uid);
    RETURN _id;
  END IF;

  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN
    RAISE EXCEPTION 'methodology_immutable: only a DRAFT version may be edited; create a new version instead'
      USING ERRCODE = '22023'; END IF;

  UPDATE public.supervisory_methodology SET
    name = COALESCE(_payload->>'name', name),
    title = COALESCE(_payload->>'title', title),
    version = COALESCE(_payload->>'version', version),
    sector_id = COALESCE(NULLIF(_payload->>'sector_id','')::uuid, sector_id),
    effective_from = COALESCE(NULLIF(_payload->>'effective_from','')::date, effective_from),
    effective_to = COALESCE(NULLIF(_payload->>'effective_to','')::date, effective_to),
    definition = COALESCE(_payload->'definition', definition),
    assessment_frequency_months = COALESCE(NULLIF(_payload->>'assessment_frequency_months','')::integer, assessment_frequency_months),
    scoring_scale = COALESCE(_payload->'scoring_scale', scoring_scale),
    override_threshold = COALESCE(_payload->>'override_threshold', override_threshold),
    approval_required = COALESCE((_payload->>'approval_required')::boolean, approval_required),
    next_review_rule = COALESCE(_payload->'next_review_rule', next_review_rule),
    calculation_guidance = COALESCE(_payload->>'calculation_guidance', calculation_guidance),
    updated_at = now()
  WHERE id = _methodology_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_methodology_id, 'UPDATED', 'DRAFT', 'Draft methodology updated', _uid, _payload);
  RETURN _methodology_id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_save(
  _methodology_id uuid, _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _status text; _id uuid; _code text; _group text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  _code  := upper(COALESCE(_payload->>'dimension_code',''));
  _group := upper(COALESCE(_payload->>'dimension_group','OTHER'));
  IF _code = '' THEN RAISE EXCEPTION 'dimension_code required' USING ERRCODE = '22023'; END IF;

  -- an ACTIVE/APPROVED version may only toggle activation, never re-score history
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    IF (_payload ? 'weight') OR (_payload ? 'dimension_group') OR (_payload ? 'label') THEN
      RAISE EXCEPTION 'methodology_immutable: create a new methodology version to change dimension scoring'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_methodology_dimension
       SET active = COALESCE((_payload->>'active')::boolean, active), updated_at = now()
     WHERE methodology_id = _methodology_id AND dimension_code = _code
     RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'not_found: dimension' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
    VALUES (_methodology_id, 'DIMENSION_TOGGLED', 'Dimension activation changed', _uid, _payload);
    RETURN _id;
  END IF;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count)
  VALUES (
    _methodology_id, _code, _group,
    COALESCE(_payload->>'dimension_kind',
      CASE _group WHEN 'INHERENT_RISK' THEN 'INHERENT'
                  WHEN 'CONTROL_EFFECTIVENESS' THEN 'CONTROL' ELSE 'COMPOSITE' END),
    COALESCE(_payload->>'label', _code),
    _payload->>'description',
    NULLIF(_payload->>'weight','')::numeric,
    COALESCE((_payload->>'evidence_required')::boolean, false),
    COALESCE(NULLIF(_payload->>'sort_order','')::integer, 100),
    COALESCE((_payload->>'active')::boolean, true),
    _payload->>'scoring_guidance',
    COALESCE(_payload->'mandatory_questions','[]'::jsonb),
    COALESCE(_payload->'data_sources','[]'::jsonb),
    _payload->>'evidence_requirements',
    COALESCE(NULLIF(_payload->>'min_evidence_count','')::integer, 0))
  ON CONFLICT (methodology_id, dimension_code) DO UPDATE SET
    dimension_group = EXCLUDED.dimension_group,
    dimension_kind = EXCLUDED.dimension_kind,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    weight = EXCLUDED.weight,
    evidence_required = EXCLUDED.evidence_required,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active,
    scoring_guidance = EXCLUDED.scoring_guidance,
    mandatory_questions = EXCLUDED.mandatory_questions,
    data_sources = EXCLUDED.data_sources,
    evidence_requirements = EXCLUDED.evidence_requirements,
    min_evidence_count = EXCLUDED.min_evidence_count,
    updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_lifecycle(
  _methodology_id uuid, _to_status text, _rationale text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.supervisory_methodology; _allowed boolean; _to text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  _to := upper(COALESCE(_to_status,''));
  SELECT * INTO _row FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  _allowed := CASE _row.status
    WHEN 'DRAFT'    THEN _to = 'REVIEW'
    WHEN 'REVIEW'   THEN _to IN ('APPROVED','DRAFT')
    WHEN 'APPROVED' THEN _to = 'ACTIVE'
    WHEN 'ACTIVE'   THEN _to = 'RETIRED'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','RETIRED') AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  -- maker/checker: the author may not approve their own methodology version
  IF _to = 'APPROVED' AND NOT public.is_super_admin(_uid) AND _row.created_by = _uid THEN
    RAISE EXCEPTION 'not_authorized: the author of a methodology version cannot approve it'
      USING ERRCODE = '42501'; END IF;

  IF _to = 'ACTIVE' THEN
    UPDATE public.supervisory_methodology
       SET status = 'SUPERSEDED', effective_to = COALESCE(effective_to, current_date), updated_at = now()
     WHERE domain_code = _row.domain_code
       AND COALESCE(sector_id::text,'*') = COALESCE(_row.sector_id::text,'*')
       AND status = 'ACTIVE' AND id <> _methodology_id;
  END IF;

  UPDATE public.supervisory_methodology SET
    status = _to,
    reviewed_by  = CASE WHEN _to = 'REVIEW'   THEN _uid ELSE reviewed_by END,
    reviewed_at  = CASE WHEN _to = 'REVIEW'   THEN now() ELSE reviewed_at END,
    approved_by  = CASE WHEN _to = 'APPROVED' THEN _uid ELSE approved_by END,
    approved_at  = CASE WHEN _to = 'APPROVED' THEN now() ELSE approved_at END,
    activated_at = CASE WHEN _to = 'ACTIVE'   THEN now() ELSE activated_at END,
    retired_at   = CASE WHEN _to = 'RETIRED'  THEN now() ELSE retired_at END,
    effective_from = CASE WHEN _to = 'ACTIVE' THEN COALESCE(effective_from, current_date) ELSE effective_from END,
    updated_at = now()
  WHERE id = _methodology_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_methodology_id, 'STATUS_CHANGE', _row.status, _to, btrim(COALESCE(_rationale,'')), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'supervisory_methodology', _methodology_id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to),
    'Methodology ' || _row.code || ' ' || _row.version || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id', _methodology_id, 'from_status', _row.status, 'to_status', _to);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_new_version(
  _methodology_id uuid, _new_version text, _rationale text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _src public.supervisory_methodology; _new_id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT * INTO _src FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology(
    code, domain_code, name, title, version, status, sector_id, regulator_id,
    definition, assessment_frequency_months, applicable_entity_types, applicable_sector_ids,
    scoring_scale, override_threshold, approval_required, next_review_rule,
    calculation_guidance, supersedes_id, created_by)
  VALUES (_src.code, _src.domain_code, _src.name, _src.title, _new_version, 'DRAFT',
    _src.sector_id, _src.regulator_id, _src.definition, _src.assessment_frequency_months,
    _src.applicable_entity_types, _src.applicable_sector_ids, _src.scoring_scale,
    _src.override_threshold, _src.approval_required, _src.next_review_rule,
    _src.calculation_guidance, _src.id, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count)
  SELECT _new_id, dimension_code, dimension_group, dimension_kind, label, description,
         weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
         data_sources, evidence_requirements, min_evidence_count
    FROM public.supervisory_methodology_dimension WHERE methodology_id = _methodology_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'VERSION_CREATED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('supersedes_id', _methodology_id, 'version', _new_version));

  RETURN _new_id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_resolve(
  _domain_code text, _sector_id uuid DEFAULT NULL, _as_of date DEFAULT NULL
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id
    FROM public.supervisory_methodology m
   WHERE m.domain_code = upper(_domain_code)
     AND m.status = 'ACTIVE'
     AND (m.effective_from IS NULL OR m.effective_from <= COALESCE(_as_of, current_date))
     AND (m.effective_to   IS NULL OR m.effective_to   >= COALESCE(_as_of, current_date))
     AND (m.sector_id IS NULL OR _sector_id IS NULL OR m.sector_id = _sector_id)
   ORDER BY (m.sector_id IS NOT NULL AND m.sector_id = _sector_id) DESC,
            m.effective_from DESC NULLS LAST
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_save(jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_dimension_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_lifecycle(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_new_version(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve(text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_save(jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_dimension_save(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_lifecycle(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_new_version(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_resolve(text, uuid, date) TO authenticated, service_role;

-- ------------------------------------------------- 5. seed AML/CFT baseline
DO $$
DECLARE _m uuid; _d record;
BEGIN
  SELECT id INTO _m FROM public.supervisory_methodology
   WHERE domain_code = 'AML_CFT' AND code = 'AML-CFT-RBA' AND version = '1.0';

  IF _m IS NULL THEN
    INSERT INTO public.supervisory_methodology(
      code, domain_code, name, title, version, status, effective_from, definition,
      assessment_frequency_months, applicable_entity_types, scoring_scale,
      override_threshold, approval_required, next_review_rule, calculation_guidance)
    VALUES ('AML-CFT-RBA', 'AML_CFT',
      'AML/CFT Risk-Based Supervision Methodology',
      'Inherent ML/TF risk, control effectiveness and residual risk determination',
      '1.0', 'ACTIVE', date '2026-01-01',
      jsonb_build_object(
        'residual_matrix', 'inherent x control',
        'rating_scale_ref', 'supervisory_rating_scale',
        'control_scale', jsonb_build_array('STRONG','SATISFACTORY','NEEDS_IMPROVEMENT','WEAK')),
      12,
      ARRAY['BANK','CREDIT_UNION','INSURANCE','MONEY_SERVICES','TRUST_COMPANY','VIRTUAL_ASSET','OTHER'],
      (SELECT jsonb_agg(jsonb_build_object('code', code, 'label', label, 'ordinal', ordinal) ORDER BY ordinal)
         FROM public.supervisory_rating_scale),
      'MEDIUM_HIGH', true,
      jsonb_build_object('LOW', 36, 'MODERATE', 24, 'MEDIUM_HIGH', 18, 'HIGH', 12, 'SEVERE', 6),
      'Weighted inherent risk is combined with weighted control effectiveness to recommend residual '
      || 'ML/TF risk. The recommendation is advisory only; the approved supervisory judgment is authoritative.')
    RETURNING id INTO _m;
  END IF;

  FOR _d IN
    SELECT * FROM (VALUES
      -- INHERENT ML/TF RISK
      ('CUSTOMER_RISK',            'INHERENT_RISK', 'Customer Risk', 20, 10, true),
      ('GEOGRAPHIC_RISK',          'INHERENT_RISK', 'Geographic Risk', 18, 20, true),
      ('PRODUCTS_SERVICES_RISK',   'INHERENT_RISK', 'Products and Services Risk', 18, 30, true),
      ('DELIVERY_CHANNEL_RISK',    'INHERENT_RISK', 'Delivery Channel Risk', 14, 40, true),
      ('TRANSACTION_PROFILE_RISK', 'INHERENT_RISK', 'Transaction and Activity Profile Risk', 18, 50, true),
      ('BUSINESS_MODEL_RISK',      'INHERENT_RISK', 'Ownership and Business Model Risk', 12, 60, true),
      -- CONTROL EFFECTIVENESS
      ('GOVERNANCE',               'CONTROL_EFFECTIVENESS', 'Governance, Board and Senior Management', 8, 100, true),
      ('ENTERPRISE_RISK_ASSESSMENT','CONTROL_EFFECTIVENESS','Enterprise ML/TF Risk Assessment', 7, 110, true),
      ('MLRO_FUNCTION',            'CONTROL_EFFECTIVENESS', 'MLRO and Compliance Function', 7, 120, true),
      ('POLICIES_PROCEDURES',      'CONTROL_EFFECTIVENESS', 'Policies, Procedures and Internal Controls', 6, 130, true),
      ('CDD_KYC',                  'CONTROL_EFFECTIVENESS', 'Customer Due Diligence / KYC', 8, 140, true),
      ('BENEFICIAL_OWNERSHIP',     'CONTROL_EFFECTIVENESS', 'Beneficial Ownership Identification', 6, 150, true),
      ('EDD',                      'CONTROL_EFFECTIVENESS', 'Enhanced Due Diligence', 6, 160, true),
      ('PEP_CONTROLS',             'CONTROL_EFFECTIVENESS', 'PEP Identification and Controls', 5, 170, true),
      ('SANCTIONS_CONTROLS',       'CONTROL_EFFECTIVENESS', 'Sanctions Screening Controls', 5, 180, true),
      ('TRANSACTION_MONITORING',   'CONTROL_EFFECTIVENESS', 'Transaction Monitoring', 9, 190, true),
      ('ALERT_INVESTIGATION',      'CONTROL_EFFECTIVENESS', 'Alert Investigation and Disposition', 6, 200, true),
      ('STR_IDENTIFICATION',       'CONTROL_EFFECTIVENESS', 'STR/SAR Identification and Escalation', 7, 210, true),
      ('STR_GOVERNANCE',           'CONTROL_EFFECTIVENESS', 'STR/SAR Governance, Quality and Timeliness', 6, 220, true),
      ('RECORD_KEEPING',           'CONTROL_EFFECTIVENESS', 'Record Keeping', 4, 230, true),
      ('TRAINING',                 'CONTROL_EFFECTIVENESS', 'Employee Training and Awareness', 4, 240, true),
      ('INDEPENDENT_TESTING',      'CONTROL_EFFECTIVENESS', 'Independent Testing / Internal Audit', 6, 250, true),
      ('THIRD_PARTY_OVERSIGHT',    'CONTROL_EFFECTIVENESS', 'Agent, Intermediary and Third-Party Oversight', 5, 260, true),
      ('AML_DATA_QUALITY',         'CONTROL_EFFECTIVENESS', 'AML Data Quality', 4, 270, true),
      ('MODEL_GOVERNANCE',         'CONTROL_EFFECTIVENESS', 'Monitoring Technology and Model Governance', 4, 280, true),
      ('REMEDIATION_TRACKING',     'CONTROL_EFFECTIVENESS', 'Remediation and Issue Management', 4, 290, true)
    ) AS t(dcode, dgroup, dlabel, dweight, dorder, devidence)
  LOOP
    INSERT INTO public.supervisory_methodology_dimension(
      methodology_id, dimension_code, dimension_group, dimension_kind, label,
      weight, evidence_required, sort_order, active, min_evidence_count)
    VALUES (_m, _d.dcode, _d.dgroup,
      CASE _d.dgroup WHEN 'INHERENT_RISK' THEN 'INHERENT' ELSE 'CONTROL' END,
      _d.dlabel, _d.dweight, _d.devidence, _d.dorder, true, CASE WHEN _d.devidence THEN 1 ELSE 0 END)
    ON CONFLICT (methodology_id, dimension_code) DO UPDATE
      SET label = EXCLUDED.label, weight = EXCLUDED.weight,
          dimension_kind = EXCLUDED.dimension_kind, sort_order = EXCLUDED.sort_order,
          updated_at = now();
  END LOOP;
END $$;