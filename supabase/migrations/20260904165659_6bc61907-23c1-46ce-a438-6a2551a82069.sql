-- =====================================================================
-- Supervisory Methodology Administration — comparison, readiness and the
-- server capability contract.
--
-- The capability contract MIRRORS the enforcing backend functions by
-- calling the very same authority helpers
-- (supervisory_domain_authority, is_super_admin, has_permission,
-- user_has_regulator_authority). It never widens them and it is never
-- the enforcement point: the governed action RPCs remain the authority.
-- =====================================================================

-- =====================================================================
-- 13. VERSION COMPARISON
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_compare(
  _methodology_id uuid,
  _baseline_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _t record;
  _b record;
  _bid uuid;
  _out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _t FROM supervisory_methodology WHERE id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  _bid := COALESCE(
    _baseline_id,
    _t.supersedes_id,
    (SELECT b.id FROM supervisory_methodology b
      WHERE b.code = _t.code AND b.domain_code = _t.domain_code AND b.id <> _t.id
        AND EXISTS (SELECT 1 FROM supervisory_methodology_question q
                     WHERE q.methodology_id = b.id AND q.active)
      ORDER BY b.version DESC LIMIT 1)
  );

  SELECT * INTO _b FROM supervisory_methodology WHERE id = _bid;
  IF _b.id IS NULL THEN
    RETURN jsonb_build_object(
      'comparable', false,
      'reason', 'No predecessor version is recorded for this methodology.',
      'target', jsonb_build_object('id', _t.id, 'code', _t.code, 'version', _t.version));
  END IF;

  WITH target AS (
    SELECT q.id, q.question_code, q.prompt, q.change_classification,
           q.predecessor_mapping, q.question_class, q.axis,
           d.dimension_code, d.label AS dimension_label
      FROM supervisory_methodology_question q
      JOIN supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
     WHERE q.methodology_id = _t.id AND q.active
  ),
  baseline AS (
    SELECT q.id, q.question_code, q.prompt,
           d.dimension_code, d.label AS dimension_label,
           d.dimension_code || '.' || q.question_code AS mapping_key
      FROM supervisory_methodology_question q
      JOIN supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
     WHERE q.methodology_id = _b.id AND q.active
  ),
  tokens AS (
    SELECT t.id AS target_id,
           btrim(tok) AS mapping_key
      FROM target t
      CROSS JOIN LATERAL regexp_split_to_table(COALESCE(t.predecessor_mapping, ''), ',') AS tok
     WHERE btrim(tok) ~ '^[A-Z0-9_]+\.[A-Za-z0-9_-]+$'
  ),
  linked AS (
    SELECT t.*,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'question_code', b.question_code,
                       'prompt', b.prompt,
                       'dimension_code', b.dimension_code,
                       'dimension_label', b.dimension_label)
                     ORDER BY b.question_code)
                     FROM tokens k JOIN baseline b ON b.mapping_key = k.mapping_key
                    WHERE k.target_id = t.id), '[]'::jsonb) AS predecessors
      FROM target t
  ),
  retired AS (
    SELECT b.* FROM baseline b
     WHERE NOT EXISTS (SELECT 1 FROM tokens k WHERE k.mapping_key = b.mapping_key)
  )
  SELECT jsonb_build_object(
    'comparable', true,
    'baseline', jsonb_build_object(
      'id', _b.id, 'code', _b.code, 'name', COALESCE(_b.title, _b.name),
      'version', _b.version, 'status', _b.status, 'origin', _b.origin,
      'origin_label', supervisory_methodology_origin_label(_b.origin),
      'dimension_count', (SELECT count(*) FROM supervisory_methodology_dimension d WHERE d.methodology_id = _b.id),
      'question_count', (SELECT count(*) FROM baseline)),
    'target', jsonb_build_object(
      'id', _t.id, 'code', _t.code, 'name', COALESCE(_t.title, _t.name),
      'version', _t.version, 'status', _t.status, 'origin', _t.origin,
      'origin_label', supervisory_methodology_origin_label(_t.origin),
      'dimension_count', (SELECT count(*) FROM supervisory_methodology_dimension d WHERE d.methodology_id = _t.id),
      'question_count', (SELECT count(*) FROM target)),
    'summary', (SELECT COALESCE(jsonb_object_agg(s.k, s.n), '{}'::jsonb) FROM (
        SELECT COALESCE(l.change_classification, 'UNCLASSIFIED') k, count(*) n
          FROM linked l GROUP BY 1
        UNION ALL
        SELECT 'RETIRED', count(*) FROM retired HAVING count(*) > 0) s),
    'groups', (SELECT COALESCE(jsonb_agg(g ORDER BY g->>'change_classification'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'change_classification', COALESCE(l.change_classification, 'UNCLASSIFIED'),
                 'count', count(*),
                 'questions', jsonb_agg(jsonb_build_object(
                    'id', l.id,
                    'question_code', l.question_code,
                    'prompt', l.prompt,
                    'question_class', l.question_class,
                    'axis', l.axis,
                    'dimension_code', l.dimension_code,
                    'dimension_label', l.dimension_label,
                    'predecessors', l.predecessors,
                    'dimension_changed', (
                      l.predecessors <> '[]'::jsonb
                      AND NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(l.predecessors) p
                         WHERE p->>'dimension_code' = l.dimension_code))
                 ) ORDER BY l.question_code)) AS g
          FROM linked l
         GROUP BY COALESCE(l.change_classification, 'UNCLASSIFIED')
        UNION ALL
        SELECT jsonb_build_object(
                 'change_classification', 'RETIRED',
                 'count', count(*),
                 'questions', jsonb_agg(jsonb_build_object(
                    'question_code', r.question_code,
                    'prompt', r.prompt,
                    'dimension_code', r.dimension_code,
                    'dimension_label', r.dimension_label,
                    'predecessors', '[]'::jsonb,
                    'dimension_changed', false) ORDER BY r.dimension_code, r.question_code))
          FROM retired r HAVING count(*) > 0) x),
    'note', 'Question mapping only. No historical assessment response was migrated between versions.'
  ) INTO _out;

  RETURN _out;
END
$fn$;

-- Non-sensitive governance aggregate: how many legacy assessment dimension
-- rows still carry the retired STR_SAR_GOVERNANCE code. SECURITY DEFINER so
-- the readiness panel reports the truth rather than the caller's row slice.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_legacy_str_row_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.supervisory_assessment_dimension
   WHERE dimension_code = 'STR_SAR_GOVERNANCE'
$$;

-- =====================================================================
-- 14. LAYERED REVIEW READINESS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_review_readiness(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _m record;
  _dims int; _qs int; _profiles int;
  _facts int; _facts_pending int;
  _params int; _params_unapproved int; _params_valued int;
  _decisions int; _decisions_approved int; _decisions_reg_approved int;
  _adoptions int;
  _approval record;
  _calc_total int; _calc_active int; _calc_scores int; _calc_bands int; _calc_matrix int;
  _legacy int; _legacy_decision text;
  _layers jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM supervisory_methodology WHERE id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _dims FROM supervisory_methodology_dimension WHERE methodology_id = _m.id;
  SELECT count(*) INTO _qs FROM supervisory_methodology_question WHERE methodology_id = _m.id AND active;
  SELECT count(*) INTO _profiles FROM supervisory_methodology_semantic_profile WHERE methodology_id = _m.id;

  SELECT count(*), count(*) FILTER (WHERE definition_status <> 'COMPLETE')
    INTO _facts, _facts_pending
    FROM supervisory_methodology_fact_requirement WHERE methodology_id = _m.id;

  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(approval_status, 'UNAPPROVED') <> 'APPROVED'),
         count(*) FILTER (WHERE value_numeric IS NOT NULL OR value_text IS NOT NULL)
    INTO _params, _params_unapproved, _params_valued
    FROM supervisory_methodology_parameter WHERE methodology_id = _m.id;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'REFERENCE_APPROVED'),
         count(*) FILTER (WHERE regulator_approval_recorded)
    INTO _decisions, _decisions_approved, _decisions_reg_approved
    FROM supervisory_methodology_reference_decision WHERE methodology_id = _m.id;

  SELECT count(*) INTO _adoptions FROM supervisory_methodology WHERE adopted_from_id = _m.id;

  SELECT * INTO _approval FROM supervisory_methodology_regulator_approval
   WHERE methodology_id = _m.id AND is_current;

  SELECT count(*), count(*) FILTER (WHERE status = 'ACTIVE')
    INTO _calc_total, _calc_active
    FROM supervisory_calculation_config WHERE methodology_id = _m.id;
  SELECT count(*) INTO _calc_scores FROM supervisory_calculation_response_score s
    WHERE s.config_id IN (SELECT id FROM supervisory_calculation_config WHERE methodology_id = _m.id);
  SELECT count(*) INTO _calc_bands FROM supervisory_calculation_band b
    WHERE b.config_id IN (SELECT id FROM supervisory_calculation_config WHERE methodology_id = _m.id);
  SELECT count(*) INTO _calc_matrix FROM supervisory_calculation_matrix_cell c
    WHERE c.config_id IN (SELECT id FROM supervisory_calculation_config WHERE methodology_id = _m.id);

  _legacy := supervisory_methodology_legacy_str_row_count();
  SELECT status INTO _legacy_decision FROM supervisory_methodology_reference_decision
   WHERE methodology_id = _m.id AND decision_code = 'AML-METH-08';

  _layers := jsonb_build_array(
    jsonb_build_object(
      'key', 'CONTENT', 'label', 'Methodology content',
      'state', CASE WHEN _dims > 0 AND _qs > 0 THEN 'COMPLETE' ELSE 'INCOMPLETE' END,
      'headline', CASE WHEN _dims > 0 AND _qs > 0
                       THEN _dims || ' dimensions, ' || _qs || ' questions, ' || _profiles || ' response semantic profiles'
                       ELSE 'Content not populated' END,
      'metrics', jsonb_build_object('dimensions', _dims, 'questions', _qs, 'semantic_profiles', _profiles)),

    jsonb_build_object(
      'key', 'REFERENCE_GOVERNANCE', 'label', 'MIPL reference approval',
      'state', CASE WHEN _decisions > 0 AND _decisions_approved = _decisions THEN 'COMPLETE'
                    WHEN _decisions > 0 THEN 'PARTIAL' ELSE 'NOT_APPLICABLE' END,
      'headline', CASE WHEN _decisions = 0 THEN 'No reference decision recorded'
                       ELSE _decisions_approved || ' of ' || _decisions || ' reference decisions approved' END,
      'metrics', jsonb_build_object('decisions', _decisions, 'reference_approved', _decisions_approved,
                                    'regulator_approved', _decisions_reg_approved)),

    jsonb_build_object(
      'key', 'REGULATOR_ADOPTION', 'label', 'Regulator adoption',
      'state', CASE WHEN _m.origin = 'REGULATOR_ADOPTED' THEN 'COMPLETE'
                    WHEN _m.origin = 'MIPL_REFERENCE' AND _adoptions > 0 THEN 'COMPLETE'
                    WHEN _m.origin = 'MIPL_REFERENCE' THEN 'NOT_DONE'
                    ELSE 'NOT_APPLICABLE' END,
      'headline', CASE WHEN _m.origin = 'REGULATOR_ADOPTED' THEN 'This version is a regulator adoption'
                       WHEN _m.origin = 'MIPL_REFERENCE' AND _adoptions > 0 THEN _adoptions || ' regulator adoption(s) recorded'
                       WHEN _m.origin = 'MIPL_REFERENCE' THEN 'No regulator has adopted this reference'
                       ELSE 'Regulator-authored version' END,
      'metrics', jsonb_build_object('adoptions', _adoptions, 'origin', _m.origin)),

    jsonb_build_object(
      'key', 'REGULATOR_APPROVAL', 'label', 'Regulator methodology approval',
      'state', CASE WHEN _m.origin = 'MIPL_REFERENCE' THEN 'NOT_APPLICABLE'
                    WHEN _approval.id IS NULL THEN 'NOT_RECORDED'
                    WHEN _approval.decision = 'APPROVED' THEN 'COMPLETE'
                    ELSE 'REVOKED' END,
      'headline', CASE WHEN _m.origin = 'MIPL_REFERENCE'
                        THEN 'A reference template can never carry a regulator approval'
                       WHEN _approval.id IS NULL THEN 'No regulator decision recorded'
                       ELSE _approval.decision || ' on ' || to_char(_approval.decided_at, 'DD Mon YYYY') END,
      'metrics', jsonb_build_object('decision', _approval.decision, 'decided_at', _approval.decided_at)),

    jsonb_build_object(
      'key', 'FACT_DEFINITIONS', 'label', 'Fact definitions',
      'state', CASE WHEN _facts = 0 THEN 'NOT_APPLICABLE'
                    WHEN _facts_pending = 0 THEN 'COMPLETE' ELSE 'PENDING' END,
      'headline', CASE WHEN _facts = 0 THEN 'No fact requirement recorded'
                       ELSE _facts_pending || ' of ' || _facts || ' fact definitions pending attributes' END,
      'blocks_approval', false,
      'metrics', jsonb_build_object('facts', _facts, 'pending', _facts_pending)),

    jsonb_build_object(
      'key', 'MATERIALITY_POLICY', 'label', 'Materiality parameter policy',
      'state', CASE WHEN _params = 0 THEN 'NOT_APPLICABLE'
                    WHEN _params_unapproved = 0 AND _params_valued = _params THEN 'COMPLETE'
                    ELSE 'NOT_APPROVED' END,
      'headline', CASE WHEN _params = 0 THEN 'No materiality parameter defined'
                       ELSE _params_unapproved || ' unapproved, ' || (_params - _params_valued) || ' without a value, of ' || _params END,
      'blocks_approval', false,
      'metrics', jsonb_build_object('parameters', _params, 'unapproved', _params_unapproved, 'valued', _params_valued)),

    jsonb_build_object(
      'key', 'CALCULATION_POLICY', 'label', 'Calculation policy',
      'state', CASE WHEN _calc_active > 0 THEN 'ACTIVE'
                    WHEN _calc_total > 0 THEN 'NOT_ACTIVE' ELSE 'NOT_CONFIGURED' END,
      'headline', CASE WHEN _calc_active > 0 THEN 'An approved calculation configuration is active'
                       WHEN _calc_total > 0 THEN _calc_total || ' configuration(s), none active or approved'
                       ELSE 'No calculation configuration, scores, bands or residual matrix' END,
      'metrics', jsonb_build_object('configs', _calc_total, 'active', _calc_active,
                                    'response_scores', _calc_scores, 'bands', _calc_bands,
                                    'matrix_cells', _calc_matrix)),

    jsonb_build_object(
      'key', 'LEGACY_DATA_REPAIR', 'label', 'Legacy data repair',
      'state', CASE WHEN _legacy_decision IS NULL THEN 'NOT_APPLICABLE'
                    WHEN _legacy > 0 THEN 'APPROVED_NOT_EXECUTED' ELSE 'EXECUTED' END,
      'headline', CASE WHEN _legacy_decision IS NULL THEN 'No legacy repair decision recorded'
                       WHEN _legacy > 0 THEN _legacy || ' STR_SAR_GOVERNANCE rows remain; relink approved as a reference decision, not executed'
                       ELSE 'No STR_SAR_GOVERNANCE rows remain' END,
      'metrics', jsonb_build_object('legacy_rows', _legacy, 'reference_decision_status', _legacy_decision)),

    jsonb_build_object(
      'key', 'ASSESSMENT_ELIGIBILITY', 'label', 'Assessment eligibility',
      'state', CASE WHEN _m.origin = 'MIPL_REFERENCE' THEN 'NOT_ELIGIBLE'
                    WHEN _m.status = 'ACTIVE' THEN 'ELIGIBLE' ELSE 'NOT_ELIGIBLE' END,
      'headline', CASE WHEN _m.origin = 'MIPL_REFERENCE'
                        THEN 'No — reference draft; a regulator must adopt it first'
                       WHEN _m.status = 'ACTIVE' THEN 'Yes — active version'
                       ELSE 'No — status is ' || _m.status END,
      'metrics', jsonb_build_object('status', _m.status, 'origin', _m.origin)),

    jsonb_build_object(
      'key', 'CERTIFICATION', 'label', 'Module certification',
      'state', 'NOT_CERTIFIED',
      'headline', 'Not certified — certification is a separate governance outcome and is not recorded against a methodology version',
      'metrics', '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'methodology_id', _m.id,
    'generated_at', now(),
    'layers', _layers,
    'note', 'Readiness is layered. A layer marked pending is not automatically a blocker on another layer.'
  );
END
$fn$;

-- =====================================================================
-- 15. ACTION CAPABILITY CONTRACT
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_action_capabilities(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _m record;
  _manage_perm text;
  _approve_perm text;
  _domain_registered boolean := false;
  _super boolean;
  _can_manage_domain boolean := false;
  _can_manage_regulator boolean := false;
  _can_approve_regulator boolean := false;
  _adoption_targets int := 0;
  _out jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM supervisory_methodology WHERE id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT true, manage_config_permission, methodology_approval_permission
    INTO _domain_registered, _manage_perm, _approve_perm
    FROM supervisory_domain_authority WHERE domain_code = _m.domain_code;

  _super := is_super_admin(_uid);

  -- Domain configuration authority (mirrors supervisory_domain_require_manage).
  IF COALESCE(_domain_registered, false) THEN
    _can_manage_domain := _super
      OR (_manage_perm IS NOT NULL
          AND has_permission(_uid, split_part(_manage_perm, '.', 1), split_part(_manage_perm, '.', 2)));
  END IF;

  -- Configuration authority for THIS version's regulator
  -- (mirrors supervisory_domain_require_manage_for_regulator).
  IF _can_manage_domain THEN
    _can_manage_regulator := _super
      OR (_m.regulator_id IS NULL AND _manage_perm IS NOT NULL
          AND has_permission(_uid, split_part(_manage_perm, '.', 1), split_part(_manage_perm, '.', 2)))
      OR (_m.regulator_id IS NOT NULL AND _manage_perm IS NOT NULL
          AND user_has_regulator_authority(_uid, split_part(_manage_perm, '.', 1),
                                           split_part(_manage_perm, '.', 2), _m.regulator_id));
  END IF;

  -- Substantive methodology approval authority. NO super-administrator escape
  -- (mirrors supervisory_methodology_require_regulator_approval).
  IF _approve_perm IS NOT NULL THEN
    _can_approve_regulator := user_has_regulator_authority(
      _uid, split_part(_approve_perm, '.', 1), split_part(_approve_perm, '.', 2), _m.regulator_id);
  END IF;

  IF _m.origin = 'MIPL_REFERENCE' AND _can_manage_domain THEN
    SELECT count(*) INTO _adoption_targets FROM regulators r
     WHERE _super
        OR (_manage_perm IS NOT NULL
            AND user_has_regulator_authority(_uid, split_part(_manage_perm, '.', 1),
                                              split_part(_manage_perm, '.', 2), r.id));
  END IF;

  _out := jsonb_build_object(
    'methodology_id', _m.id,
    'status', _m.status,
    'origin', _m.origin,
    'domain_code', _m.domain_code,
    'is_platform_administrator', _super,

    'can_edit', jsonb_build_object(
      'allowed', _can_manage_regulator AND _m.status IN ('DRAFT', 'REVIEW'),
      'reason', CASE
        WHEN NOT COALESCE(_domain_registered, false)
          THEN 'No configuration authority is registered for this supervisory domain.'
        WHEN NOT _can_manage_domain
          THEN 'You do not hold methodology configuration authority for this domain.'
        WHEN NOT _can_manage_regulator
          THEN 'You do not hold configuration authority for this version''s regulator.'
        WHEN _m.status NOT IN ('DRAFT', 'REVIEW')
          THEN 'Only a draft or in-review version can be edited.'
        ELSE NULL END),

    'can_adopt', jsonb_build_object(
      'allowed', _m.origin = 'MIPL_REFERENCE' AND _can_manage_domain AND _adoption_targets > 0,
      'reason', CASE
        WHEN _m.origin <> 'MIPL_REFERENCE'
          THEN 'Only a MIPL reference template can be adopted.'
        WHEN NOT _can_manage_domain
          THEN 'You do not hold methodology configuration authority for this domain.'
        WHEN _adoption_targets = 0
          THEN 'You hold no regulator within your configuration scope to adopt for.'
        ELSE NULL END,
      'target_count', _adoption_targets),

    'can_submit_review', jsonb_build_object(
      'allowed', _can_manage_regulator AND _m.status = 'DRAFT',
      'reason', CASE
        WHEN NOT _can_manage_regulator
          THEN 'You do not hold configuration authority for this version''s regulator.'
        WHEN _m.status <> 'DRAFT'
          THEN 'Only a DRAFT version can be submitted for review.'
        ELSE NULL END),

    'can_return_to_draft', jsonb_build_object(
      'allowed', _can_manage_regulator AND _m.status = 'REVIEW',
      'reason', CASE
        WHEN NOT _can_manage_regulator
          THEN 'You do not hold configuration authority for this version''s regulator.'
        WHEN _m.status <> 'REVIEW'
          THEN 'Only a version in REVIEW can be returned to draft.'
        ELSE NULL END),

    'can_approve', jsonb_build_object(
      'allowed', _m.status = 'REVIEW'
                 AND _m.origin <> 'MIPL_REFERENCE'
                 AND _approve_perm IS NOT NULL
                 AND _can_approve_regulator
                 AND _m.created_by IS DISTINCT FROM _uid
                 AND _m.reviewed_by IS DISTINCT FROM _uid,
      'reason', CASE
        WHEN _m.origin = 'MIPL_REFERENCE'
          THEN 'A MIPL reference template cannot be approved in place. A regulator must adopt it first.'
        WHEN _m.status <> 'REVIEW'
          THEN 'Only a version in REVIEW can be approved.'
        WHEN _approve_perm IS NULL
          THEN 'No methodology approval authority is registered for this supervisory domain.'
        WHEN _m.created_by = _uid
          THEN 'You prepared this version and cannot approve it.'
        WHEN _m.reviewed_by = _uid
          THEN 'You submitted this version for review and cannot approve it.'
        WHEN NOT _can_approve_regulator
          THEN 'You do not hold methodology approval authority for this regulator. Assessment approval and platform administration do not substitute.'
        ELSE NULL END,
      'requires_rationale', true),

    'can_activate', jsonb_build_object(
      'allowed', false,
      'reason', 'Operational activation is not included in this review wave.'),

    'maker_checker', jsonb_build_object(
      'author_id', _m.created_by,
      'author_name', app_actor_display_name(_m.created_by),
      'submitted_by', _m.reviewed_by,
      'submitted_by_name', app_actor_display_name(_m.reviewed_by),
      'submitted_at', _m.reviewed_at,
      'actor_is_author', _m.created_by IS NOT DISTINCT FROM _uid,
      'actor_is_submitter', _m.reviewed_by IS NOT DISTINCT FROM _uid)
  );

  RETURN _out;
END
$fn$;

-- =====================================================================
-- 16. ADOPTION TARGETS (server-scoped; never a client-side filter)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_adoption_targets(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _m record;
  _manage_perm text;
  _domain_registered boolean := false;
  _super boolean;
  _rows jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM supervisory_methodology WHERE id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  IF _m.origin <> 'MIPL_REFERENCE' THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0,
      'reason', 'Only a MIPL reference template can be adopted.');
  END IF;

  SELECT true, manage_config_permission INTO _domain_registered, _manage_perm
    FROM supervisory_domain_authority WHERE domain_code = _m.domain_code;

  IF NOT COALESCE(_domain_registered, false) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0,
      'reason', 'No configuration authority is registered for this supervisory domain.');
  END IF;

  _super := is_super_admin(_uid);

  IF NOT (_super OR (_manage_perm IS NOT NULL
        AND has_permission(_uid, split_part(_manage_perm, '.', 1), split_part(_manage_perm, '.', 2)))) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0,
      'reason', 'You do not hold methodology configuration authority for this domain.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'code', r.code, 'name', r.name,
           'already_adopted', EXISTS (SELECT 1 FROM supervisory_methodology c
                                       WHERE c.adopted_from_id = _m.id AND c.regulator_id = r.id),
           'resulting_version', _m.version || '+' || r.code
         ) ORDER BY r.name), '[]'::jsonb)
    INTO _rows
    FROM regulators r
   WHERE _super
      OR (_manage_perm IS NOT NULL
          AND user_has_regulator_authority(_uid, split_part(_manage_perm, '.', 1),
                                            split_part(_manage_perm, '.', 2), r.id));

  RETURN jsonb_build_object(
    'rows', _rows,
    'total_count', jsonb_array_length(_rows),
    'reference', jsonb_build_object('id', _m.id, 'code', _m.code, 'version', _m.version,
                                    'origin', _m.origin,
                                    'origin_label', supervisory_methodology_origin_label(_m.origin)),
    'reason', CASE WHEN jsonb_array_length(_rows) = 0
                   THEN 'You hold no regulator within your configuration scope to adopt for.'
                   ELSE NULL END
  );
END
$fn$;

-- =====================================================================
-- GRANTS — authenticated only. Anonymous access is refused.
-- =====================================================================
DO $do$
DECLARE _sig text;
BEGIN
  FOR _sig IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'supervisory_methodology_origin_label',
         'supervisory_methodology_register',
         'supervisory_methodology_register_options',
         'supervisory_methodology_detail',
         'supervisory_methodology_dimension_list',
         'supervisory_methodology_question_register',
         'supervisory_methodology_question_detail',
         'supervisory_methodology_semantic_register',
         'supervisory_methodology_fact_register',
         'supervisory_methodology_fact_detail',
         'supervisory_methodology_parameter_register',
         'supervisory_methodology_reference_decision_register',
         'supervisory_methodology_approval_register',
         'supervisory_methodology_audit_register',
         'supervisory_methodology_compare',
         'supervisory_methodology_review_readiness',
         'supervisory_methodology_legacy_str_row_count',
         'supervisory_methodology_action_capabilities',
         'supervisory_methodology_adoption_targets')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', _sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _sig);
  END LOOP;
END
$do$;