-- ============================================================================
-- AML/CFT — STRUCTURAL AUTHORITY FINAL CLOSURE
-- Engineering integrity only. No policy values, no methodology version change,
-- no rating/score/band/matrix change, no effective-date rule.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical methodology resolution — server authoritative
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_resolve_detail(
  _domain_code text,
  _sector_id uuid DEFAULT NULL,
  _as_of date DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d text; _asof date;
  _total int := 0; _top int := 0; _id uuid; _ver text; _cands jsonb;
BEGIN
  _d := upper(btrim(COALESCE(_domain_code,'')));
  _asof := COALESCE(_as_of, current_date);

  WITH elig AS (
    SELECT m.id, m.version, m.effective_from, m.effective_to,
           m.sector_id, m.regulator_id,
           (CASE WHEN m.sector_id IS NOT NULL THEN 2
                 WHEN COALESCE(array_length(m.applicable_sector_ids,1),0) > 0 THEN 1
                 ELSE 0 END)
         + (CASE WHEN m.regulator_id IS NOT NULL THEN 2 ELSE 0 END) AS specificity
      FROM public.supervisory_methodology m
     WHERE m.domain_code = _d
       AND m.status = 'ACTIVE'
       AND (m.effective_from IS NULL OR m.effective_from <= _asof)
       AND (m.effective_to   IS NULL OR m.effective_to   >= _asof)
       -- Sector applicability. A NULL entity sector is NOT a wildcard: only a
       -- genuinely global version may be selected for it.
       AND (CASE
              WHEN _sector_id IS NULL THEN
                m.sector_id IS NULL
                AND COALESCE(array_length(m.applicable_sector_ids,1),0) = 0
              ELSE
                m.sector_id = _sector_id
                OR (m.sector_id IS NULL
                    AND (COALESCE(array_length(m.applicable_sector_ids,1),0) = 0
                         OR _sector_id = ANY (m.applicable_sector_ids)))
            END)
       -- Regulator applicability. A NULL caller regulator is NOT a wildcard
       -- for a regulator-scoped version.
       AND (m.regulator_id IS NULL OR m.regulator_id = _regulator_id)
  ), ranked AS (
    SELECT e.*, rank() OVER (ORDER BY e.specificity DESC,
                                      e.effective_from DESC NULLS LAST) AS rnk
      FROM elig e
  )
  SELECT count(*),
         count(*) FILTER (WHERE rnk = 1),
         min(id)      FILTER (WHERE rnk = 1),
         min(version) FILTER (WHERE rnk = 1),
         COALESCE(jsonb_agg(jsonb_build_object(
             'methodology_id', id, 'version', version, 'rank', rnk,
             'specificity', specificity, 'effective_from', effective_from,
             'sector_id', sector_id, 'regulator_id', regulator_id)
           ORDER BY rnk, id), '[]'::jsonb)
    INTO _total, _top, _id, _ver, _cands
    FROM ranked;

  IF _total = 0 THEN
    RETURN jsonb_build_object('status','NONE_APPLICABLE','methodology_id',NULL,
      'methodology_version',NULL,'domain_code',_d,'sector_id',_sector_id,
      'regulator_id',_regulator_id,'as_of',_asof,
      'candidate_count',0,'candidates','[]'::jsonb,
      'reason','no ACTIVE methodology version of this domain applies to this sector, regulator and date');
  END IF;

  IF _top > 1 THEN
    RETURN jsonb_build_object('status','AMBIGUOUS','methodology_id',NULL,
      'methodology_version',NULL,'domain_code',_d,'sector_id',_sector_id,
      'regulator_id',_regulator_id,'as_of',_asof,
      'candidate_count',_total,'candidates',_cands,
      'reason','more than one methodology version applies with equal specificity and effective date; a methodology owner must scope or supersede one of them');
  END IF;

  RETURN jsonb_build_object('status','RESOLVED','methodology_id',_id,
    'methodology_version',_ver,'domain_code',_d,'sector_id',_sector_id,
    'regulator_id',_regulator_id,'as_of',_asof,
    'candidate_count',_total,'candidates',_cands);
END
$function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve_detail(text, uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve_detail(text, uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_resolve_detail(text, uuid, date, uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.supervisory_methodology_resolve(text, uuid, date);

CREATE OR REPLACE FUNCTION public.supervisory_methodology_resolve(
  _domain_code text,
  _sector_id uuid DEFAULT NULL,
  _as_of date DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _r jsonb;
BEGIN
  _r := public.supervisory_methodology_resolve_detail(_domain_code, _sector_id, _as_of, _regulator_id);
  IF _r->>'status' = 'AMBIGUOUS' THEN
    RAISE EXCEPTION 'methodology_ambiguous: %', _r->>'reason' USING ERRCODE = '22023';
  END IF;
  RETURN NULLIF(_r->>'methodology_id','')::uuid;
END
$function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve(text, uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_methodology_resolve(text, uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_resolve(text, uuid, date, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Assessment creation binds the server-resolved methodology only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_create(
  _entity_id uuid, _domain_code text, _assessment_type text DEFAULT 'PERIODIC'::text,
  _period_start date DEFAULT NULL::date, _period_end date DEFAULT NULL::date,
  _methodology_id uuid DEFAULT NULL::uuid, _trigger_type text DEFAULT 'PERIODIC'::text,
  _trigger_signal_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text,
  _owner_id uuid DEFAULT NULL::uuid, _supersedes_id uuid DEFAULT NULL::uuid,
  _confidentiality text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _mv text; _struct jsonb;
  _res jsonb; _resolved uuid; _asof date;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.create','aml_supervision.create',
    'prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics',
    'aml_supervision.approve']);
  IF _entity_id IS NULL THEN
    RAISE EXCEPTION 'an entity is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.supervisory_domain_valid(_domain_code) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _domain_code USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  IF NOT public.supervisory_domain_applicable(_entity_id, _domain_code) THEN
    RAISE EXCEPTION 'domain_not_applicable: % supervision has been determined not to apply to this entity; record a governed perimeter determination before assessing it', _domain_code
      USING ERRCODE = '22023';
  END IF;

  SELECT l.sector_id, s.regulator_id INTO _sector, _reg
    FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id
   WHERE l.id = _entity_id;

  -- The methodology version is the server's determination. A caller-supplied
  -- id is a consistency assertion only, never a selection.
  _asof := COALESCE(_period_end, current_date);
  _res := public.supervisory_methodology_resolve_detail(_domain_code, _sector, _asof, _reg);

  IF _res->>'status' = 'AMBIGUOUS' THEN
    RAISE EXCEPTION 'methodology_ambiguous: %', _res->>'reason' USING ERRCODE = '22023';
  END IF;

  _resolved := NULLIF(_res->>'methodology_id','')::uuid;

  IF _resolved IS NULL THEN
    RAISE EXCEPTION 'methodology_unavailable: no ACTIVE % methodology version applies to this entity on %; a methodology owner must publish an applicable version before an assessment can be created',
      upper(_domain_code), _asof USING ERRCODE = '22023';
  END IF;

  IF _methodology_id IS NOT NULL AND _methodology_id <> _resolved THEN
    RAISE EXCEPTION 'methodology_selection_mismatch: the supplied methodology version is not the version the canonical resolver selects for this entity, sector, regulator and date (resolved %)', _resolved
      USING ERRCODE = '22023';
  END IF;

  _methodology_id := _resolved;
  _mv := _res->>'methodology_version';

  _ref := 'SUP-' || _domain_code || '-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.supervisory_assessment_ref_seq')::text, 5, '0');

  INSERT INTO public.supervisory_assessment(
    reference, entity_id, domain_code, assessment_type, methodology_id, methodology_version,
    period_start, period_end, trigger_type, trigger_signal_id, summary, owner_id,
    regulator_id, sector_id, supersedes_id, confidentiality, origin_provenance, created_by)
  VALUES (_ref, _entity_id, _domain_code, COALESCE(_assessment_type,'PERIODIC'), _methodology_id, _mv,
    _period_start, _period_end, COALESCE(_trigger_type,'PERIODIC'), _trigger_signal_id, _summary,
    COALESCE(_owner_id,_uid), _reg, _sector, _supersedes_id,
    COALESCE(_confidentiality, CASE WHEN _domain_code = 'AML_CFT' THEN 'CONFIDENTIAL' ELSE 'STANDARD' END),
    'GOVERNED', _uid)
  RETURNING id INTO _id;

  -- Structural completion: the working file exists in full from creation.
  _struct := public.supervisory_assessment_dimension_materialise_internal(_id, _uid);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'draft', _summary,
    jsonb_build_object('domain_code',_domain_code,'trigger_type',_trigger_type,'supersedes_id',_supersedes_id,
      'structure',_struct,'methodology_resolution',_res - 'candidates'), _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_assessment',_id, NULL,
    jsonb_build_object('reference',_ref,'domain_code',_domain_code,'entity_id',_entity_id,
      'methodology_id',_methodology_id,'methodology_version',_mv,
      'methodology_resolution','SERVER_RESOLVED',
      'dimensions_materialised',_struct->'created'),
    'Supervisory assessment ' || _ref || ' created');

  RETURN jsonb_build_object('id',_id,'reference',_ref,'status','draft','domain_code',_domain_code,
    'methodology_id',_methodology_id,'methodology_version',_mv,
    'methodology_resolution',_res - 'candidates',
    'structure',_struct);
END
$function$;

-- ---------------------------------------------------------------------------
-- 3. Materialisation is concurrency safe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_materialise_internal(
  _assessment_id uuid, _actor uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _created int := 0; _expected int := 0;
        _existing int := 0; _codes text[] := '{}';
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023';
  END IF;
  IF _a.methodology_id IS NULL THEN
    RETURN jsonb_build_object('status','NO_METHODOLOGY','assessment_id',_assessment_id,
      'expected',0,'existing',0,'created',0,'created_codes','[]'::jsonb,
      'reason','the assessment is not bound to a methodology version, so no dimension universe is defined');
  END IF;

  SELECT count(*) INTO _expected FROM public.supervisory_methodology_dimension md
   WHERE md.methodology_id = _a.methodology_id AND md.active;
  SELECT count(*) INTO _existing FROM public.supervisory_assessment_dimension sad
   WHERE sad.assessment_id = _assessment_id;

  WITH ins AS (
    INSERT INTO public.supervisory_assessment_dimension(
      assessment_id, methodology_dimension_id, dimension_code, dimension_group,
      weight, is_applicable, created_by)
    SELECT _assessment_id, md.id, md.dimension_code,
           COALESCE(md.dimension_group,'OTHER'), md.weight, true, _actor
      FROM public.supervisory_methodology_dimension md
     WHERE md.methodology_id = _a.methodology_id
       AND md.active
     ORDER BY md.dimension_code
    ON CONFLICT (assessment_id, dimension_code) DO NOTHING
    RETURNING dimension_code)
  SELECT count(*), COALESCE(array_agg(dimension_code ORDER BY dimension_code),'{}')
    INTO _created, _codes FROM ins;

  RETURN jsonb_build_object('status', CASE WHEN _created > 0 THEN 'MATERIALISED' ELSE 'ALREADY_COMPLETE' END,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,
    'expected',_expected,'existing',_existing,'created',_created,
    'created_codes', to_jsonb(_codes));
END
$function$;

-- ---------------------------------------------------------------------------
-- 4. Methodology version immutability — no structural change outside DRAFT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_save(
  _methodology_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _status text; _id uuid; _code text; _group text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  _code  := upper(COALESCE(_payload->>'dimension_code',''));
  _group := upper(COALESCE(_payload->>'dimension_group','OTHER'));
  IF _code = '' THEN RAISE EXCEPTION 'dimension_code required' USING ERRCODE = '22023'; END IF;

  -- An APPROVED / ACTIVE / SUPERSEDED / RETIRED version is structurally frozen:
  -- no addition, no removal, no weight, group, label, question or activation
  -- change. Structural change requires supervisory_methodology_new_version().
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen; create a new methodology version to change dimensions, weights, questions or activation', _status
      USING ERRCODE = '22023';
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

  IF _payload ? 'mandatory_questions' THEN
    PERFORM public.supervisory_methodology_question_sync(_id, _payload->'mandatory_questions');
  END IF;

  RETURN _id;
END
$function$;

-- Defence in depth: the question mirror refuses a frozen version even when
-- reached by a service-role path.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_sync(
  _dimension_id uuid, _questions jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d public.supervisory_methodology_dimension;
  _mstatus text;
  _n integer := 0;
  _codes text[] := ARRAY[]::text[];
  r record;
  _code text;
  _prompt text;
BEGIN
  SELECT * INTO _d FROM public.supervisory_methodology_dimension WHERE id = _dimension_id;
  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'not_found: methodology dimension' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO _mstatus FROM public.supervisory_methodology WHERE id = _d.methodology_id;
  IF _mstatus IS NOT NULL AND _mstatus NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen; the question set cannot be changed', _mstatus
      USING ERRCODE = '22023';
  END IF;

  IF _questions IS NULL OR jsonb_typeof(_questions) <> 'array'
     OR jsonb_array_length(_questions) = 0 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT elem, ord FROM jsonb_array_elements(_questions) WITH ORDINALITY AS t(elem, ord)
  LOOP
    IF jsonb_typeof(r.elem) = 'string' THEN
      _code := NULL;
      _prompt := btrim(r.elem #>> '{}');
    ELSE
      _code := NULLIF(btrim(upper(COALESCE(r.elem->>'question_code', r.elem->>'code',''))),'');
      _prompt := NULLIF(btrim(COALESCE(r.elem->>'prompt', r.elem->>'text',
                                       r.elem->>'question', r.elem->>'label','')),'');
    END IF;

    IF _prompt IS NULL OR _prompt = '' THEN
      CONTINUE;
    END IF;
    _code := COALESCE(_code, 'Q' || r.ord::text);
    _codes := _codes || _code;

    INSERT INTO public.supervisory_methodology_question(
      methodology_id, methodology_dimension_id, question_code, prompt, guidance,
      mandatory, requires_observation, requires_evidence, min_evidence_count,
      allow_not_applicable, na_requires_rationale, sort_order, active)
    VALUES (
      _d.methodology_id, _d.id, _code, _prompt,
      CASE WHEN jsonb_typeof(r.elem) = 'object' THEN r.elem->>'guidance' END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'mandatory')::boolean, true) ELSE true END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'requires_observation')::boolean, true) ELSE true END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'requires_evidence')::boolean, COALESCE(_d.evidence_required,false))
           ELSE COALESCE(_d.evidence_required,false) END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'min_evidence_count')::integer, COALESCE(_d.min_evidence_count,0))
           ELSE COALESCE(_d.min_evidence_count,0) END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'allow_not_applicable')::boolean, true) ELSE true END,
      CASE WHEN jsonb_typeof(r.elem) = 'object'
           THEN COALESCE((r.elem->>'na_requires_rationale')::boolean, true) ELSE true END,
      (r.ord * 10)::integer,
      true)
    ON CONFLICT (methodology_dimension_id, question_code) DO UPDATE SET
      prompt = EXCLUDED.prompt,
      guidance = EXCLUDED.guidance,
      mandatory = EXCLUDED.mandatory,
      requires_observation = EXCLUDED.requires_observation,
      requires_evidence = EXCLUDED.requires_evidence,
      min_evidence_count = EXCLUDED.min_evidence_count,
      allow_not_applicable = EXCLUDED.allow_not_applicable,
      na_requires_rationale = EXCLUDED.na_requires_rationale,
      sort_order = EXCLUDED.sort_order,
      active = true,
      updated_at = now();

    _n := _n + 1;
  END LOOP;

  UPDATE public.supervisory_methodology_question
     SET active = false, updated_at = now()
   WHERE methodology_dimension_id = _d.id
     AND active
     AND NOT (question_code = ANY (_codes));

  RETURN _n;
END
$function$;

-- ---------------------------------------------------------------------------
-- 5. Canonical write authority — RPC only for every API role
-- ---------------------------------------------------------------------------
DO $lock$
DECLARE
  t text;
  p record;
  _tables text[] := ARRAY[
    'supervisory_methodology',
    'supervisory_methodology_dimension',
    'supervisory_methodology_question',
    'supervisory_methodology_event',
    'supervisory_assessment',
    'supervisory_assessment_dimension',
    'supervisory_assessment_question_response',
    'supervisory_assessment_event'];
BEGIN
  FOREACH t IN ARRAY _tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    -- Drop every direct-write policy: mutation is only reachable through the
    -- governed SECURITY DEFINER operations, which bypass RLS by design.
    FOR p IN
      SELECT pol.polname, pol.polcmd
        FROM pg_policy pol
       WHERE pol.polrelid = ('public.' || t)::regclass
         AND pol.polcmd IN ('a','w','d','*')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.polname, t);
    END LOOP;

    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$lock$;
