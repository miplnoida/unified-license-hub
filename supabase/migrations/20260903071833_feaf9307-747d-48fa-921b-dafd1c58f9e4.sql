-- =====================================================================
-- AML/CFT working file: governed mandatory supervisory question responses
-- =====================================================================

-- 1. Canonical, versioned question catalogue per methodology dimension
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  methodology_dimension_id uuid NOT NULL REFERENCES public.supervisory_methodology_dimension(id) ON DELETE CASCADE,
  question_code text NOT NULL,
  prompt text NOT NULL,
  guidance text,
  response_options text[] NOT NULL DEFAULT ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],
  mandatory boolean NOT NULL DEFAULT true,
  requires_observation boolean NOT NULL DEFAULT true,
  requires_evidence boolean NOT NULL DEFAULT false,
  min_evidence_count integer NOT NULL DEFAULT 0,
  allow_not_applicable boolean NOT NULL DEFAULT true,
  na_requires_rationale boolean NOT NULL DEFAULT true,
  question_version integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_methodology_question_uniq UNIQUE (methodology_dimension_id, question_code)
);

GRANT SELECT ON public.supervisory_methodology_question TO authenticated;
GRANT ALL ON public.supervisory_methodology_question TO service_role;
ALTER TABLE public.supervisory_methodology_question ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_methodology_question_read ON public.supervisory_methodology_question;
CREATE POLICY supervisory_methodology_question_read
  ON public.supervisory_methodology_question FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','prudential_supervision.view',
    'market_conduct.run_conduct_analytics','aml_supervision.view']));

DROP TRIGGER IF EXISTS supervisory_methodology_question_touch ON public.supervisory_methodology_question;
CREATE TRIGGER supervisory_methodology_question_touch
  BEFORE UPDATE ON public.supervisory_methodology_question
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_version_bump()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.prompt IS DISTINCT FROM OLD.prompt THEN
    NEW.question_version := OLD.question_version + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supervisory_methodology_question_version ON public.supervisory_methodology_question;
CREATE TRIGGER supervisory_methodology_question_version
  BEFORE UPDATE ON public.supervisory_methodology_question
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_methodology_question_version_bump();

-- 2. Governed responses, with full provenance snapshot
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_question_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id) ON DELETE SET NULL,
  methodology_id uuid NOT NULL,
  methodology_version text,
  methodology_dimension_id uuid NOT NULL,
  methodology_question_id uuid NOT NULL REFERENCES public.supervisory_methodology_question(id),
  dimension_code text NOT NULL,
  question_code text NOT NULL,
  question_text text NOT NULL,
  question_version integer NOT NULL DEFAULT 1,
  response text NOT NULL,
  observation text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_question_response_uniq UNIQUE (assessment_id, methodology_question_id),
  CONSTRAINT supervisory_assessment_question_response_chk
    CHECK (response = ANY (ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE']))
);

CREATE INDEX IF NOT EXISTS supervisory_assessment_question_response_assessment_idx
  ON public.supervisory_assessment_question_response(assessment_id);

GRANT SELECT ON public.supervisory_assessment_question_response TO authenticated;
GRANT ALL ON public.supervisory_assessment_question_response TO service_role;
ALTER TABLE public.supervisory_assessment_question_response ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisory_assessment_question_response_read ON public.supervisory_assessment_question_response;
CREATE POLICY supervisory_assessment_question_response_read
  ON public.supervisory_assessment_question_response FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','prudential_supervision.view',
    'market_conduct.run_conduct_analytics','aml_supervision.view']));

-- 3. Governed write operation
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_upsert(
  _assessment_id uuid,
  _question_id uuid,
  _response text,
  _observation text DEFAULT NULL,
  _evidence_refs jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _q public.supervisory_methodology_question;
        _m public.supervisory_methodology; _dim_code text; _dim_id uuid; _resp text; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment',
    'aml_supervision.create','aml_supervision.edit','aml_supervision.approve',
    'market_conduct.run_conduct_analytics']);

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  SELECT * INTO _q FROM public.supervisory_methodology_question WHERE id = _question_id;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology question' USING ERRCODE = '22023'; END IF;
  IF _a.methodology_id IS NOT NULL AND _q.methodology_id <> _a.methodology_id THEN
    RAISE EXCEPTION 'validation_required: the question does not belong to the methodology version attached to this assessment'
      USING ERRCODE = '22023'; END IF;

  _resp := upper(btrim(COALESCE(_response,'')));
  IF NOT (_resp = ANY (_q.response_options)) THEN
    RAISE EXCEPTION 'validation_required: % is not a permitted response for this question', _resp
      USING ERRCODE = '22023'; END IF;
  IF _resp = 'NOT_APPLICABLE' AND NOT _q.allow_not_applicable THEN
    RAISE EXCEPTION 'validation_required: the methodology does not permit Not Applicable for this question'
      USING ERRCODE = '22023'; END IF;

  SELECT d.dimension_code, d.id INTO _dim_code, _dim_id
    FROM public.supervisory_methodology_dimension d WHERE d.id = _q.methodology_dimension_id;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _q.methodology_id;

  INSERT INTO public.supervisory_assessment_question_response(
    assessment_id, assessment_dimension_id, methodology_id, methodology_version,
    methodology_dimension_id, methodology_question_id, dimension_code, question_code,
    question_text, question_version, response, observation, evidence_refs, recorded_by, updated_by)
  VALUES (_assessment_id,
    (SELECT id FROM public.supervisory_assessment_dimension
      WHERE assessment_id = _assessment_id AND dimension_code = _dim_code),
    _q.methodology_id, COALESCE(_a.methodology_version, _m.version),
    _dim_id, _q.id, _dim_code, _q.question_code, _q.prompt, _q.question_version,
    _resp, NULLIF(btrim(COALESCE(_observation,'')),''), COALESCE(_evidence_refs,'[]'::jsonb), _uid, _uid)
  ON CONFLICT (assessment_id, methodology_question_id) DO UPDATE
    SET response = EXCLUDED.response,
        observation = EXCLUDED.observation,
        evidence_refs = EXCLUDED.evidence_refs,
        assessment_dimension_id = COALESCE(EXCLUDED.assessment_dimension_id,
          supervisory_assessment_question_response.assessment_dimension_id),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id, 'assessment_id', _assessment_id,
    'question_code', _q.question_code, 'response', _resp);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_question_upsert(uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_upsert(uuid,uuid,text,text,jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jsonb_array_len_safe(_v jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN _v IS NULL OR jsonb_typeof(_v) <> 'array' THEN 0 ELSE jsonb_array_length(_v) END;
$$;

REVOKE ALL ON FUNCTION public.jsonb_array_len_safe(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsonb_array_len_safe(jsonb) TO authenticated, service_role;

-- 4. Outstanding mandatory question gaps (single source of truth for UI + backend)
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_gaps(_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH a AS (SELECT * FROM public.supervisory_assessment WHERE id = _assessment_id),
  q AS (
    SELECT qq.*, d.dimension_code, d.dimension_group, d.label AS dimension_label
      FROM public.supervisory_methodology_question qq
      JOIN public.supervisory_methodology_dimension d ON d.id = qq.methodology_dimension_id
      JOIN a ON a.methodology_id = qq.methodology_id
     WHERE qq.active AND qq.mandatory AND d.active
  ),
  gaps AS (
    SELECT q.dimension_code, q.dimension_group, q.dimension_label, q.question_code,
           q.prompt AS question_text, q.id AS question_id,
           CASE
             WHEN r.id IS NULL THEN 'unanswered'
             WHEN q.requires_observation
                  AND length(btrim(COALESCE(r.observation,''))) < 10
                  AND r.response <> 'NOT_APPLICABLE' THEN 'observation_missing'
             WHEN r.response = 'NOT_APPLICABLE' AND q.na_requires_rationale
                  AND length(btrim(COALESCE(r.observation,''))) < 10 THEN 'na_rationale_missing'
             WHEN q.requires_evidence AND r.response <> 'NOT_APPLICABLE'
                  AND public.jsonb_array_len_safe(r.evidence_refs) < GREATEST(q.min_evidence_count,1)
                  THEN 'evidence_missing'
             ELSE NULL
           END AS reason
      FROM q
      LEFT JOIN public.supervisory_assessment_question_response r
        ON r.assessment_id = _assessment_id AND r.methodology_question_id = q.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.dimension_group, g.dimension_code, g.question_code), '[]'::jsonb)
    FROM gaps g WHERE g.reason IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_question_gaps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_gaps(uuid) TO authenticated, service_role;