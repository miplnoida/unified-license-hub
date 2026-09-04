-- =====================================================================
-- Supervisory Methodology Administration — governed read models.
--
-- READ-ONLY WAVE. No policy value, score, band, matrix cell, adoption,
-- approval or activation is created here. Every function is
-- SECURITY INVOKER so the existing RLS policies on
-- supervisory_methodology* remain the authority; the authority helpers
-- they call (has_permission, is_super_admin,
-- user_has_regulator_authority, supervisory_methodology_oversight_reader)
-- are already SECURITY DEFINER.
-- =====================================================================

-- ------------------------------------------------------------------ labels
CREATE OR REPLACE FUNCTION public.supervisory_methodology_origin_label(_origin text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _origin
    WHEN 'MIPL_REFERENCE'     THEN 'MIPL Reference'
    WHEN 'REGULATOR_ADOPTED'  THEN 'Regulator Adopted'
    WHEN 'REGULATOR_AUTHORED' THEN 'Regulator Authored'
    ELSE COALESCE(_origin, 'Unspecified')
  END
$$;

-- =====================================================================
-- 1. REGISTER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_register(
  _search         text  DEFAULT NULL,
  _domain_code    text  DEFAULT NULL,
  _origin         text  DEFAULT NULL,
  _status         text  DEFAULT NULL,
  _regulator_id   uuid  DEFAULT NULL,
  _sector_id      uuid  DEFAULT NULL,
  _approval_state text  DEFAULT NULL,
  _sort           text  DEFAULT 'domain',
  _dir            text  DEFAULT 'asc',
  _limit          int   DEFAULT 25,
  _offset         int   DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _lim   int    := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  _off   int    := GREATEST(COALESCE(_offset, 0), 0);
  _d     text   := CASE WHEN lower(COALESCE(_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  _s     text   := COALESCE(NULLIF(_sort, ''), 'domain');
  _q     text   := NULLIF(btrim(COALESCE(_search, '')), '');
  _total bigint := 0;
  _rows  jsonb  := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT m.id, m.code, m.name, m.title, m.version, m.status, m.origin,
           m.domain_code, m.regulator_id, m.sector_id, m.applicable_sector_ids,
           m.applicable_entity_types, m.effective_from, m.effective_to,
           m.supersedes_id, m.adopted_from_id, m.updated_at, m.created_at,
           r.code AS regulator_code, r.name AS regulator_name,
           a.decision AS approval_decision, a.decided_at AS approval_decided_at,
           (SELECT count(*) FROM supervisory_methodology_dimension d
              WHERE d.methodology_id = m.id)                       AS dimension_count,
           (SELECT count(*) FROM supervisory_methodology_question q
              WHERE q.methodology_id = m.id AND q.active)          AS question_count
      FROM supervisory_methodology m
      LEFT JOIN regulators r ON r.id = m.regulator_id
      LEFT JOIN supervisory_methodology_regulator_approval a
             ON a.methodology_id = m.id AND a.is_current
  ),
  labelled AS (
    SELECT b.*,
           COALESCE(b.approval_decision, 'NOT_RECORDED') AS approval_state,
           supervisory_methodology_origin_label(b.origin) AS origin_label,
           CASE
             WHEN COALESCE(array_length(b.applicable_sector_ids, 1), 0) > 0 THEN (
               SELECT string_agg(s.name, ', ' ORDER BY s.name)
                 FROM sectors s WHERE s.id = ANY (b.applicable_sector_ids))
             WHEN b.sector_id IS NOT NULL THEN
               (SELECT s.name FROM sectors s WHERE s.id = b.sector_id)
             ELSE NULL
           END AS sector_summary,
           COALESCE(array_length(b.applicable_sector_ids, 1), 0) AS sector_count
      FROM base b
  ),
  filtered AS (
    SELECT l.*,
           CASE _s
             WHEN 'methodology' THEN lower(COALESCE(l.title, l.name, l.code))
             WHEN 'domain'      THEN l.domain_code
             WHEN 'version'     THEN l.version
             WHEN 'origin'      THEN l.origin
             WHEN 'regulator'   THEN lower(l.regulator_name)
             WHEN 'sector'      THEN lower(l.sector_summary)
             WHEN 'status'      THEN l.status
             WHEN 'questions'   THEN lpad(l.question_count::text, 7, '0')
             WHEN 'effective'   THEN to_char(l.effective_from, 'YYYY-MM-DD')
             WHEN 'approval'    THEN l.approval_state
             WHEN 'updated'     THEN to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS')
             ELSE l.domain_code
           END AS sort_key
      FROM labelled l
     WHERE (_domain_code IS NULL  OR l.domain_code = _domain_code)
       AND (_origin IS NULL       OR l.origin = _origin)
       AND (_status IS NULL       OR l.status = _status)
       AND (_regulator_id IS NULL OR l.regulator_id = _regulator_id)
       AND (_approval_state IS NULL OR l.approval_state = _approval_state)
       AND (_sector_id IS NULL OR l.sector_id = _sector_id
            OR _sector_id = ANY (COALESCE(l.applicable_sector_ids, '{}'::uuid[])))
       AND (_q IS NULL
            OR l.code ILIKE '%' || _q || '%'
            OR COALESCE(l.name, '')  ILIKE '%' || _q || '%'
            OR COALESCE(l.title, '') ILIKE '%' || _q || '%'
            OR l.version ILIKE '%' || _q || '%'
            OR COALESCE(l.regulator_name, '') ILIKE '%' || _q || '%')
  ),
  page AS (
    SELECT f.*,
           count(*) OVER () AS total_count,
           row_number() OVER (
             ORDER BY CASE WHEN _d = 'asc'  THEN f.sort_key END ASC  NULLS LAST,
                      CASE WHEN _d = 'desc' THEN f.sort_key END DESC NULLS LAST,
                      f.code ASC, f.version ASC, f.id ASC) AS rn
      FROM filtered f
     ORDER BY CASE WHEN _d = 'asc'  THEN f.sort_key END ASC  NULLS LAST,
              CASE WHEN _d = 'desc' THEN f.sort_key END DESC NULLS LAST,
              f.code ASC, f.version ASC, f.id ASC
     LIMIT _lim OFFSET _off
  )
  SELECT COALESCE(max(p.total_count), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id',                p.id,
           'code',              p.code,
           'name',              COALESCE(p.title, p.name),
           'version',           p.version,
           'status',            p.status,
           'origin',            p.origin,
           'origin_label',      p.origin_label,
           'domain_code',       p.domain_code,
           'regulator_id',      p.regulator_id,
           'regulator_code',    p.regulator_code,
           'regulator_name',    p.regulator_name,
           'sector_summary',    p.sector_summary,
           'sector_count',      p.sector_count,
           'entity_types',      to_jsonb(COALESCE(p.applicable_entity_types, '{}'::text[])),
           'dimension_count',   p.dimension_count,
           'question_count',    p.question_count,
           'effective_from',    p.effective_from,
           'effective_to',      p.effective_to,
           'approval_state',    p.approval_state,
           'approval_decided_at', p.approval_decided_at,
           'has_lineage',       (p.adopted_from_id IS NOT NULL OR p.supersedes_id IS NOT NULL),
           'updated_at',        p.updated_at
         ) ORDER BY p.rn), '[]'::jsonb)
    INTO _total, _rows
    FROM page p;

  RETURN jsonb_build_object(
    'total_count', _total,
    'rows', _rows,
    'page', jsonb_build_object('limit', _lim, 'offset', _off, 'sort', _s, 'dir', _d)
  );
END
$fn$;

-- =====================================================================
-- 2. REGISTER FILTER OPTIONS (server-derived, authorised rows only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_register_options()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'domains', (SELECT COALESCE(jsonb_agg(DISTINCT m.domain_code), '[]'::jsonb)
                  FROM supervisory_methodology m),
    'origins', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                          'value', m.origin,
                          'label', supervisory_methodology_origin_label(m.origin))), '[]'::jsonb)
                  FROM supervisory_methodology m WHERE m.origin IS NOT NULL),
    'statuses', (SELECT COALESCE(jsonb_agg(DISTINCT m.status), '[]'::jsonb)
                   FROM supervisory_methodology m),
    'regulators', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                            'id', r.id, 'code', r.code, 'name', r.name)), '[]'::jsonb)
                     FROM supervisory_methodology m JOIN regulators r ON r.id = m.regulator_id),
    'sectors', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                         'id', s.id, 'name', s.name)), '[]'::jsonb)
                  FROM supervisory_methodology m
                  JOIN sectors s ON s.id = m.sector_id
                                 OR s.id = ANY (COALESCE(m.applicable_sector_ids, '{}'::uuid[]))),
    'approval_states', jsonb_build_array('NOT_RECORDED', 'APPROVED', 'REVOKED')
  ) INTO _out;

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 3. DETAIL (header + live composition counts + lineage)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_detail(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _m   record;
  _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO _m FROM supervisory_methodology m WHERE m.id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', _m.id,
    'code', _m.code,
    'name', COALESCE(_m.title, _m.name),
    'version', _m.version,
    'status', _m.status,
    'origin', _m.origin,
    'origin_label', supervisory_methodology_origin_label(_m.origin),
    'domain_code', _m.domain_code,
    'domain_module', supervisory_domain_module(_m.domain_code),
    'regulator', (SELECT jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name)
                    FROM regulators r WHERE r.id = _m.regulator_id),
    'sector_summary', CASE
        WHEN COALESCE(array_length(_m.applicable_sector_ids, 1), 0) > 0 THEN
          (SELECT string_agg(s.name, ', ' ORDER BY s.name) FROM sectors s
            WHERE s.id = ANY (_m.applicable_sector_ids))
        WHEN _m.sector_id IS NOT NULL THEN (SELECT s.name FROM sectors s WHERE s.id = _m.sector_id)
        ELSE NULL END,
    'entity_types', to_jsonb(COALESCE(_m.applicable_entity_types, '{}'::text[])),
    'effective_from', _m.effective_from,
    'effective_to', _m.effective_to,
    'assessment_frequency_months', _m.assessment_frequency_months,
    'approval_required', _m.approval_required,
    'created_at', _m.created_at,
    'updated_at', _m.updated_at,
    'reviewed_at', _m.reviewed_at,
    'approved_at', _m.approved_at,
    'activated_at', _m.activated_at,
    'retired_at', _m.retired_at,
    'supersedes', (SELECT jsonb_build_object('id', p.id, 'code', p.code, 'version', p.version,
                                             'status', p.status, 'origin', p.origin)
                     FROM supervisory_methodology p WHERE p.id = _m.supersedes_id),
    'adopted_from', (SELECT jsonb_build_object('id', p.id, 'code', p.code, 'version', p.version,
                                               'status', p.status, 'origin', p.origin,
                                               'origin_label', supervisory_methodology_origin_label(p.origin))
                       FROM supervisory_methodology p WHERE p.id = _m.adopted_from_id),
    'superseded_by', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                'id', c.id, 'version', c.version, 'status', c.status,
                                'origin', c.origin) ORDER BY c.version), '[]'::jsonb)
                        FROM supervisory_methodology c WHERE c.supersedes_id = _m.id),
    'adoptions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                              'id', c.id, 'version', c.version, 'status', c.status,
                              'regulator_id', c.regulator_id,
                              'regulator_name', (SELECT r.name FROM regulators r WHERE r.id = c.regulator_id))
                              ORDER BY c.version), '[]'::jsonb)
                    FROM supervisory_methodology c WHERE c.adopted_from_id = _m.id),
    'counts', jsonb_build_object(
       'dimensions',        (SELECT count(*) FROM supervisory_methodology_dimension d WHERE d.methodology_id = _m.id),
       'dimensions_inherent',(SELECT count(*) FROM supervisory_methodology_dimension d WHERE d.methodology_id = _m.id AND d.dimension_kind = 'INHERENT'),
       'dimensions_control', (SELECT count(*) FROM supervisory_methodology_dimension d WHERE d.methodology_id = _m.id AND d.dimension_kind = 'CONTROL'),
       'questions',         (SELECT count(*) FROM supervisory_methodology_question q WHERE q.methodology_id = _m.id AND q.active),
       'semantic_profiles', (SELECT count(*) FROM supervisory_methodology_semantic_profile p WHERE p.methodology_id = _m.id),
       'fact_requirements', (SELECT count(*) FROM supervisory_methodology_fact_requirement f WHERE f.methodology_id = _m.id),
       'parameters',        (SELECT count(*) FROM supervisory_methodology_parameter p WHERE p.methodology_id = _m.id),
       'reference_decisions',(SELECT count(*) FROM supervisory_methodology_reference_decision rd WHERE rd.methodology_id = _m.id),
       'regulator_approvals',(SELECT count(*) FROM supervisory_methodology_regulator_approval a WHERE a.methodology_id = _m.id),
       'events',            (SELECT count(*) FROM supervisory_methodology_event e WHERE e.methodology_id = _m.id)
    ),
    'composition', jsonb_build_object(
      'by_class',  (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
                      SELECT COALESCE(q.question_class, 'UNCLASSIFIED') k, count(*) n
                        FROM supervisory_methodology_question q
                       WHERE q.methodology_id = _m.id AND q.active GROUP BY 1) t),
      'by_axis',   (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
                      SELECT COALESCE(q.axis, 'UNCLASSIFIED') k, count(*) n
                        FROM supervisory_methodology_question q
                       WHERE q.methodology_id = _m.id AND q.active GROUP BY 1) t),
      'by_focus',  (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
                      SELECT COALESCE(q.effectiveness_focus, 'UNCLASSIFIED') k, count(*) n
                        FROM supervisory_methodology_question q
                       WHERE q.methodology_id = _m.id AND q.active GROUP BY 1) t),
      'by_participation', (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
                      SELECT COALESCE(q.calculation_participation, 'UNCLASSIFIED') k, count(*) n
                        FROM supervisory_methodology_question q
                       WHERE q.methodology_id = _m.id AND q.active GROUP BY 1) t),
      'by_change', (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
                      SELECT COALESCE(q.change_classification, 'UNCLASSIFIED') k, count(*) n
                        FROM supervisory_methodology_question q
                       WHERE q.methodology_id = _m.id AND q.active GROUP BY 1) t),
      'scored_inherent', (SELECT count(*) FROM supervisory_methodology_question q
                            WHERE q.methodology_id = _m.id AND q.active
                              AND q.axis = 'INHERENT_EXPOSURE' AND q.calculation_participation = 'SCORED'),
      'contextual_inherent', (SELECT count(*) FROM supervisory_methodology_question q
                            WHERE q.methodology_id = _m.id AND q.active
                              AND q.axis = 'INHERENT_EXPOSURE' AND q.calculation_participation = 'CONTEXTUAL_NOT_SCORED'),
      'evidence_required', (SELECT count(*) FROM supervisory_methodology_question q
                            WHERE q.methodology_id = _m.id AND q.active AND q.requires_evidence),
      'na_allowed', (SELECT count(*) FROM supervisory_methodology_question q
                            WHERE q.methodology_id = _m.id AND q.active AND q.allow_not_applicable),
      'auto_prefill_possible', (SELECT count(*) FROM supervisory_methodology_question q
                            WHERE q.methodology_id = _m.id AND q.active AND q.factual_auto_prefill_possible),
      'judgement_required', (SELECT count(*) FROM supervisory_methodology_question q
                            WHERE q.methodology_id = _m.id AND q.active AND q.supervisory_judgement_required)
    )
  ) INTO _out;

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 4. DIMENSION LIST
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_dimension_list(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'dimension_code', d.dimension_code,
           'label', d.label,
           'description', d.description,
           'dimension_kind', d.dimension_kind,
           'dimension_group', d.dimension_group,
           'weight', d.weight,
           'evidence_required', d.evidence_required,
           'sort_order', d.sort_order,
           'question_count', (SELECT count(*) FROM supervisory_methodology_question q
                                WHERE q.methodology_dimension_id = d.id AND q.active)
         ) ORDER BY d.dimension_kind DESC, d.sort_order, d.dimension_code), '[]'::jsonb)
    INTO _out
    FROM supervisory_methodology_dimension d
   WHERE d.methodology_id = _methodology_id AND d.active;

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 5. QUESTION REGISTER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_register(
  _methodology_id uuid,
  _search               text DEFAULT NULL,
  _dimension_id         uuid DEFAULT NULL,
  _question_class       text DEFAULT NULL,
  _axis                 text DEFAULT NULL,
  _effectiveness_focus  text DEFAULT NULL,
  _participation        text DEFAULT NULL,
  _sector_classification text DEFAULT NULL,
  _change_classification text DEFAULT NULL,
  _na_allowed           boolean DEFAULT NULL,
  _evidence_required    boolean DEFAULT NULL,
  _auto_prefill         boolean DEFAULT NULL,
  _judgement_required   boolean DEFAULT NULL,
  _sort  text DEFAULT 'code',
  _dir   text DEFAULT 'asc',
  _limit int  DEFAULT 25,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _lim   int    := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  _off   int    := GREATEST(COALESCE(_offset, 0), 0);
  _d     text   := CASE WHEN lower(COALESCE(_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  _s     text   := COALESCE(NULLIF(_sort, ''), 'code');
  _q     text   := NULLIF(btrim(COALESCE(_search, '')), '');
  _total bigint := 0;
  _rows  jsonb  := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT q.id, q.question_code, q.prompt, q.question_class, q.axis,
           q.effectiveness_focus, q.calculation_participation,
           q.response_semantics_code, q.requires_evidence, q.min_evidence_count,
           q.allow_not_applicable, q.na_requires_rationale, q.mandatory,
           q.requires_observation, q.factual_auto_prefill_possible,
           q.supervisory_judgement_required, q.sector_classification,
           q.sector_applicability, q.change_classification, q.predecessor_mapping,
           q.trigger_condition, q.sort_order, q.methodology_dimension_id,
           d.dimension_code, d.label AS dimension_label, d.dimension_kind,
           d.sort_order AS dimension_sort,
           (SELECT count(*) FROM supervisory_methodology_question_fact qf
             WHERE qf.question_id = q.id) AS fact_count
      FROM supervisory_methodology_question q
      JOIN supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
     WHERE q.methodology_id = _methodology_id AND q.active
  ),
  filtered AS (
    SELECT b.*,
           CASE _s
             WHEN 'code'      THEN b.question_code
             WHEN 'dimension' THEN b.dimension_code
             WHEN 'class'     THEN b.question_class
             WHEN 'axis'      THEN b.axis
             WHEN 'focus'     THEN b.effectiveness_focus
             WHEN 'semantics' THEN b.response_semantics_code
             WHEN 'evidence'  THEN CASE WHEN b.requires_evidence THEN '1' ELSE '0' END
             WHEN 'applicability' THEN b.sector_applicability
             WHEN 'change'    THEN b.change_classification
             ELSE b.question_code
           END AS sort_key
      FROM base b
     WHERE (_dimension_id IS NULL OR b.methodology_dimension_id = _dimension_id)
       AND (_question_class IS NULL OR b.question_class = _question_class)
       AND (_axis IS NULL OR b.axis = _axis)
       AND (_effectiveness_focus IS NULL OR b.effectiveness_focus = _effectiveness_focus)
       AND (_participation IS NULL OR b.calculation_participation = _participation)
       AND (_sector_classification IS NULL OR b.sector_classification = _sector_classification)
       AND (_change_classification IS NULL OR b.change_classification = _change_classification)
       AND (_na_allowed IS NULL OR b.allow_not_applicable = _na_allowed)
       AND (_evidence_required IS NULL OR b.requires_evidence = _evidence_required)
       AND (_auto_prefill IS NULL OR b.factual_auto_prefill_possible = _auto_prefill)
       AND (_judgement_required IS NULL OR b.supervisory_judgement_required = _judgement_required)
       AND (_q IS NULL
            OR b.question_code ILIKE '%' || _q || '%'
            OR b.prompt ILIKE '%' || _q || '%'
            OR COALESCE(b.dimension_label, '') ILIKE '%' || _q || '%')
  ),
  page AS (
    SELECT f.*, count(*) OVER () AS total_count,
           row_number() OVER (
             ORDER BY CASE WHEN _d = 'asc'  THEN f.sort_key END ASC  NULLS LAST,
                      CASE WHEN _d = 'desc' THEN f.sort_key END DESC NULLS LAST,
                      f.question_code ASC, f.id ASC) AS rn
      FROM filtered f
     ORDER BY CASE WHEN _d = 'asc'  THEN f.sort_key END ASC  NULLS LAST,
              CASE WHEN _d = 'desc' THEN f.sort_key END DESC NULLS LAST,
              f.question_code ASC, f.id ASC
     LIMIT _lim OFFSET _off
  )
  SELECT COALESCE(max(p.total_count), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'question_code', p.question_code,
           'prompt', p.prompt,
           'dimension_id', p.methodology_dimension_id,
           'dimension_code', p.dimension_code,
           'dimension_label', p.dimension_label,
           'dimension_kind', p.dimension_kind,
           'question_class', p.question_class,
           'axis', p.axis,
           'effectiveness_focus', p.effectiveness_focus,
           'calculation_participation', p.calculation_participation,
           'response_semantics_code', p.response_semantics_code,
           'requires_evidence', p.requires_evidence,
           'min_evidence_count', p.min_evidence_count,
           'allow_not_applicable', p.allow_not_applicable,
           'sector_classification', p.sector_classification,
           'sector_applicability', p.sector_applicability,
           'change_classification', p.change_classification,
           'trigger_condition', p.trigger_condition,
           'fact_count', p.fact_count
         ) ORDER BY p.rn), '[]'::jsonb)
    INTO _total, _rows
    FROM page p;

  RETURN jsonb_build_object('total_count', _total, 'rows', _rows);
END
$fn$;

-- =====================================================================
-- 6. QUESTION DETAIL
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_detail(_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', q.id,
    'methodology_id', q.methodology_id,
    'question_code', q.question_code,
    'prompt', q.prompt,
    'supervisory_intent', q.supervisory_intent,
    'guidance', q.guidance,
    'question_class', q.question_class,
    'mandatory', q.mandatory,
    'axis', q.axis,
    'effectiveness_focus', q.effectiveness_focus,
    'calculation_participation', q.calculation_participation,
    'response_semantics_code', q.response_semantics_code,
    'response_options', to_jsonb(COALESCE(q.response_options, '{}'::text[])),
    'allow_not_applicable', q.allow_not_applicable,
    'na_conditions', q.na_conditions,
    'na_requires_rationale', q.na_requires_rationale,
    'requires_observation', q.requires_observation,
    'requires_evidence', q.requires_evidence,
    'min_evidence_count', q.min_evidence_count,
    'minimum_evidence_note', q.minimum_evidence_note,
    'evidence_basis_types', to_jsonb(COALESCE(q.evidence_basis_types, '{}'::text[])),
    'supervisory_judgement_required', q.supervisory_judgement_required,
    'factual_auto_prefill_possible', q.factual_auto_prefill_possible,
    'sector_classification', q.sector_classification,
    'sector_applicability', q.sector_applicability,
    'sector_notes', q.sector_notes,
    'trigger_condition', q.trigger_condition,
    'applicability_rule', q.applicability_rule,
    'standards_reference', q.standards_reference,
    'standards_reference_strength', q.standards_reference_strength,
    'standards_reference_review', q.standards_reference_review,
    'predecessor_mapping', q.predecessor_mapping,
    'change_classification', q.change_classification,
    'question_version', q.question_version,
    'provenance', q.provenance,
    'dimension', jsonb_build_object(
      'id', d.id, 'dimension_code', d.dimension_code, 'label', d.label,
      'dimension_kind', d.dimension_kind),
    'semantic_profile', (SELECT jsonb_build_object(
        'id', sp.id, 'semantic_code', sp.semantic_code, 'label', sp.label,
        'description', sp.description, 'profile_version', sp.profile_version,
        'response_meaning', sp.response_meaning)
      FROM supervisory_methodology_semantic_profile sp
      WHERE sp.id = q.response_semantics_profile_id),
    'fact_requirements', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', fr.id, 'fact_code', fr.fact_code, 'label', fr.label,
        'data_type', fr.data_type, 'unit', fr.unit,
        'definition_status', fr.definition_status,
        'is_required', qf.is_required) ORDER BY fr.fact_code), '[]'::jsonb)
      FROM supervisory_methodology_question_fact qf
      JOIN supervisory_methodology_fact_requirement fr ON fr.id = qf.fact_requirement_id
      WHERE qf.question_id = q.id)
  ) INTO _out
  FROM supervisory_methodology_question q
  JOIN supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
  WHERE q.id = _question_id;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'Question not found or not visible' USING ERRCODE = '42501';
  END IF;
  RETURN _out;
END
$fn$;

-- =====================================================================
-- 7. SEMANTIC PROFILES (version-owned)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_semantic_register(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', sp.id,
      'semantic_code', sp.semantic_code,
      'label', sp.label,
      'description', sp.description,
      'profile_version', sp.profile_version,
      'response_meaning', sp.response_meaning,
      'owner', jsonb_build_object(
        'methodology_id', m.id, 'code', m.code, 'version', m.version,
        'origin', m.origin, 'origin_label', supervisory_methodology_origin_label(m.origin)),
      'question_count', (SELECT count(*) FROM supervisory_methodology_question q
                          WHERE q.response_semantics_profile_id = sp.id AND q.active)
    ) ORDER BY sp.semantic_code), '[]'::jsonb)
  INTO _out
  FROM supervisory_methodology_semantic_profile sp
  JOIN supervisory_methodology m ON m.id = sp.methodology_id
  WHERE sp.methodology_id = _methodology_id;

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 8. FACT REQUIREMENT REGISTER + DETAIL
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_fact_register(
  _methodology_id uuid,
  _search text DEFAULT NULL,
  _definition_status text DEFAULT NULL,
  _required boolean DEFAULT NULL,
  _sort text DEFAULT 'fact_code',
  _dir  text DEFAULT 'asc',
  _limit int DEFAULT 25,
  _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _lim int := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
  _d text := CASE WHEN lower(COALESCE(_dir,'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  _s text := COALESCE(NULLIF(_sort,''), 'fact_code');
  _q text := NULLIF(btrim(COALESCE(_search,'')), '');
  _total bigint := 0;
  _rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT f.*,
           (SELECT count(*) FROM supervisory_methodology_question_fact qf
             WHERE qf.fact_requirement_id = f.id) AS question_count
      FROM supervisory_methodology_fact_requirement f
     WHERE f.methodology_id = _methodology_id
  ),
  filtered AS (
    SELECT b.*,
           CASE _s
             WHEN 'fact_code' THEN b.fact_code
             WHEN 'label'     THEN lower(b.label)
             WHEN 'data_type' THEN b.data_type
             WHEN 'unit'      THEN b.unit
             WHEN 'required'  THEN CASE WHEN b.is_required THEN '1' ELSE '0' END
             WHEN 'status'    THEN b.definition_status
             WHEN 'parameter' THEN b.materiality_parameter_code
             WHEN 'questions' THEN lpad(b.question_count::text, 7, '0')
             ELSE b.fact_code
           END AS sort_key
      FROM base b
     WHERE (_definition_status IS NULL OR b.definition_status = _definition_status)
       AND (_required IS NULL OR b.is_required = _required)
       AND (_q IS NULL OR b.fact_code ILIKE '%'||_q||'%' OR COALESCE(b.label,'') ILIKE '%'||_q||'%')
  ),
  page AS (
    SELECT f.*, count(*) OVER () AS total_count,
           row_number() OVER (
             ORDER BY CASE WHEN _d='asc'  THEN f.sort_key END ASC  NULLS LAST,
                      CASE WHEN _d='desc' THEN f.sort_key END DESC NULLS LAST,
                      f.fact_code ASC, f.id ASC) AS rn
      FROM filtered f
     ORDER BY CASE WHEN _d='asc'  THEN f.sort_key END ASC  NULLS LAST,
              CASE WHEN _d='desc' THEN f.sort_key END DESC NULLS LAST,
              f.fact_code ASC, f.id ASC
     LIMIT _lim OFFSET _off
  )
  SELECT COALESCE(max(p.total_count), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'fact_code', p.fact_code, 'label', p.label,
           'data_type', p.data_type, 'unit', p.unit,
           'is_required', p.is_required,
           'auto_prefill_allowed', p.auto_prefill_allowed,
           'officer_edit_allowed', p.officer_edit_allowed,
           'definition_status', p.definition_status,
           'materiality_parameter_code', p.materiality_parameter_code,
           'question_count', p.question_count
         ) ORDER BY p.rn), '[]'::jsonb)
    INTO _total, _rows FROM page p;

  RETURN jsonb_build_object(
    'total_count', _total,
    'rows', _rows,
    'status_summary', (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
        SELECT COALESCE(f.definition_status,'UNSPECIFIED') k, count(*) n
          FROM supervisory_methodology_fact_requirement f
         WHERE f.methodology_id = _methodology_id GROUP BY 1) t)
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_fact_detail(_fact_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', f.id, 'methodology_id', f.methodology_id,
    'fact_code', f.fact_code, 'label', f.label,
    'data_type', f.data_type, 'unit', f.unit,
    'numerator_basis', f.numerator_basis,
    'denominator_basis', f.denominator_basis,
    'period_expectation', f.period_expectation,
    'source_type_expectation', f.source_type_expectation,
    'materiality_parameter_code', f.materiality_parameter_code,
    'materiality_parameter', (SELECT jsonb_build_object(
        'id', p.id, 'parameter_code', p.parameter_code, 'label', p.label,
        'parameter_kind', p.parameter_kind, 'data_type', p.data_type,
        'unit', p.unit, 'approval_status', p.approval_status,
        'value_numeric', p.value_numeric, 'value_text', p.value_text)
      FROM supervisory_methodology_parameter p
      WHERE p.methodology_id = f.methodology_id
        AND p.parameter_code = f.materiality_parameter_code),
    'is_required', f.is_required,
    'auto_prefill_allowed', f.auto_prefill_allowed,
    'officer_edit_allowed', f.officer_edit_allowed,
    'attribute_source', f.attribute_source,
    'definition_status', f.definition_status,
    'provenance', f.provenance,
    'questions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', q.id, 'question_code', q.question_code, 'prompt', q.prompt,
        'is_required', qf.is_required) ORDER BY q.question_code), '[]'::jsonb)
      FROM supervisory_methodology_question_fact qf
      JOIN supervisory_methodology_question q ON q.id = qf.question_id
      WHERE qf.fact_requirement_id = f.id)
  ) INTO _out
  FROM supervisory_methodology_fact_requirement f
  WHERE f.id = _fact_id;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'Fact requirement not found or not visible' USING ERRCODE = '42501';
  END IF;
  RETURN _out;
END
$fn$;

-- =====================================================================
-- 9. MATERIALITY PARAMETER REGISTER (read-only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_parameter_register(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM supervisory_methodology_parameter p
                     WHERE p.methodology_id = _methodology_id),
    'unapproved_count', (SELECT count(*) FROM supervisory_methodology_parameter p
                     WHERE p.methodology_id = _methodology_id
                       AND COALESCE(p.approval_status,'UNAPPROVED') <> 'APPROVED'),
    'valued_count', (SELECT count(*) FROM supervisory_methodology_parameter p
                     WHERE p.methodology_id = _methodology_id
                       AND (p.value_numeric IS NOT NULL OR p.value_text IS NOT NULL)),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'parameter_code', p.parameter_code,
        'label', p.label,
        'parameter_kind', p.parameter_kind,
        'data_type', p.data_type,
        'unit', p.unit,
        'approval_status', COALESCE(p.approval_status, 'UNAPPROVED'),
        'value_numeric', p.value_numeric,
        'value_text', p.value_text,
        'has_value', (p.value_numeric IS NOT NULL OR p.value_text IS NOT NULL),
        'referenced_by', (SELECT COALESCE(jsonb_agg(f.fact_code ORDER BY f.fact_code), '[]'::jsonb)
                            FROM supervisory_methodology_fact_requirement f
                           WHERE f.methodology_id = p.methodology_id
                             AND f.materiality_parameter_code = p.parameter_code),
        'referenced_by_count', (SELECT count(*) FROM supervisory_methodology_fact_requirement f
                           WHERE f.methodology_id = p.methodology_id
                             AND f.materiality_parameter_code = p.parameter_code)
      ) ORDER BY p.parameter_code)
      FROM supervisory_methodology_parameter p
     WHERE p.methodology_id = _methodology_id), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 10. MIPL REFERENCE DECISIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_reference_decision_register(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM supervisory_methodology_reference_decision rd
                     WHERE rd.methodology_id = _methodology_id),
    'regulator_approved_count', (SELECT count(*) FROM supervisory_methodology_reference_decision rd
                     WHERE rd.methodology_id = _methodology_id AND rd.regulator_approval_recorded),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', rd.id,
        'decision_code', rd.decision_code,
        'title', rd.title,
        'decision_text', rd.decision_text,
        'rationale', rd.rationale,
        'approval_scope', rd.approval_scope,
        'decision_source', rd.decision_source,
        'status', rd.status,
        'regulator_approval_recorded', rd.regulator_approval_recorded,
        'customer_adoption_recorded', rd.customer_adoption_recorded,
        'recorded_at', rd.recorded_at,
        'recorded_by', rd.recorded_by,
        'recorded_by_name', app_actor_display_name(rd.recorded_by),
        'methodology_code', rd.methodology_code,
        'methodology_version', rd.methodology_version
      ) ORDER BY rd.decision_code)
      FROM supervisory_methodology_reference_decision rd
     WHERE rd.methodology_id = _methodology_id), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 11. REGULATOR APPROVAL REGISTER (regulator-scoped by RLS)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_approval_register(
  _methodology_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _decision text DEFAULT NULL,
  _current_only boolean DEFAULT NULL,
  _sort text DEFAULT 'decided_at',
  _dir  text DEFAULT 'desc',
  _limit int DEFAULT 25,
  _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _lim int := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
  _d text := CASE WHEN lower(COALESCE(_dir,'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  _s text := COALESCE(NULLIF(_sort,''), 'decided_at');
  _total bigint := 0;
  _rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT a.id, a.methodology_id, a.regulator_id, a.decision, a.rationale,
           a.submitted_by, a.decided_by, a.decided_at, a.is_current, a.created_at,
           m.code AS methodology_code, m.version AS methodology_version,
           COALESCE(m.title, m.name) AS methodology_name,
           m.domain_code, m.origin,
           r.code AS regulator_code, r.name AS regulator_name,
           app_actor_display_name(a.submitted_by) AS submitted_by_name,
           app_actor_display_name(a.decided_by) AS decided_by_name
      FROM supervisory_methodology_regulator_approval a
      JOIN supervisory_methodology m ON m.id = a.methodology_id
      LEFT JOIN regulators r ON r.id = a.regulator_id
  ),
  filtered AS (
    SELECT b.*,
      CASE _s
        WHEN 'methodology' THEN lower(b.methodology_name)
        WHEN 'version'     THEN b.methodology_version
        WHEN 'regulator'   THEN lower(b.regulator_name)
        WHEN 'decision'    THEN b.decision
        WHEN 'submitted_by' THEN lower(b.submitted_by_name)
        WHEN 'decided_by'  THEN lower(b.decided_by_name)
        WHEN 'current'     THEN CASE WHEN b.is_current THEN '1' ELSE '0' END
        ELSE to_char(b.decided_at, 'YYYY-MM-DD HH24:MI:SS')
      END AS sort_key
      FROM base b
     WHERE (_methodology_id IS NULL OR b.methodology_id = _methodology_id)
       AND (_regulator_id IS NULL OR b.regulator_id = _regulator_id)
       AND (_decision IS NULL OR b.decision = _decision)
       AND (_current_only IS NOT TRUE OR b.is_current)
  ),
  page AS (
    SELECT f.*, count(*) OVER () AS total_count,
           row_number() OVER (
             ORDER BY CASE WHEN _d='asc'  THEN f.sort_key END ASC  NULLS LAST,
                      CASE WHEN _d='desc' THEN f.sort_key END DESC NULLS LAST,
                      f.created_at DESC, f.id ASC) AS rn
      FROM filtered f
     ORDER BY CASE WHEN _d='asc'  THEN f.sort_key END ASC  NULLS LAST,
              CASE WHEN _d='desc' THEN f.sort_key END DESC NULLS LAST,
              f.created_at DESC, f.id ASC
     LIMIT _lim OFFSET _off
  )
  SELECT COALESCE(max(p.total_count), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'methodology_id', p.methodology_id,
           'methodology_code', p.methodology_code,
           'methodology_name', p.methodology_name,
           'methodology_version', p.methodology_version,
           'domain_code', p.domain_code,
           'regulator_id', p.regulator_id,
           'regulator_code', p.regulator_code,
           'regulator_name', p.regulator_name,
           'decision', p.decision,
           'rationale', p.rationale,
           'submitted_by', p.submitted_by,
           'submitted_by_name', p.submitted_by_name,
           'decided_by', p.decided_by,
           'decided_by_name', p.decided_by_name,
           'decided_at', p.decided_at,
           'is_current', p.is_current
         ) ORDER BY p.rn), '[]'::jsonb)
    INTO _total, _rows FROM page p;

  RETURN jsonb_build_object('total_count', _total, 'rows', _rows);
END
$fn$;

-- =====================================================================
-- 12. AUDIT / EVENT HISTORY
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_audit_register(
  _methodology_id uuid,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 100);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
  _total bigint := 0;
  _rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  WITH page AS (
    SELECT e.*, count(*) OVER () AS total_count,
           row_number() OVER (ORDER BY e.created_at DESC, e.id) AS rn
      FROM supervisory_methodology_event e
     WHERE e.methodology_id = _methodology_id
     ORDER BY e.created_at DESC, e.id
     LIMIT _lim OFFSET _off
  )
  SELECT COALESCE(max(p.total_count), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'event_type', p.event_type,
           'from_status', p.from_status,
           'to_status', p.to_status,
           'rationale', p.rationale,
           'detail', p.detail,
           'actor_id', p.actor_id,
           'actor_name', app_actor_display_name(p.actor_id),
           'created_at', p.created_at
         ) ORDER BY p.rn), '[]'::jsonb)
    INTO _total, _rows FROM page p;

  RETURN jsonb_build_object('total_count', _total, 'rows', _rows);
END
$fn$;