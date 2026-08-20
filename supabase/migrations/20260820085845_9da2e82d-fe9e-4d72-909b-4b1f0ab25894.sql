-- ============================================================
-- Wave B completion: data domain cleanup
-- ============================================================
INSERT INTO public.data_domains (key, label, description, sort_order, is_system, is_active)
VALUES
  ('person_identity', 'Person Identity', 'Canonical natural-person identity attributes (name, date of birth, nationality, identity documents).', 80, true, true),
  ('party_relationships', 'Party Relationships', 'Relationships between parties: group structure, affiliation, control links and related-party connections.', 90, true, true)
ON CONFLICT (key) DO NOTHING;

UPDATE public.data_concepts c
SET data_domain_id = d.id, updated_at = now()
FROM public.data_domains d
WHERE c.data_domain_id IS NULL
  AND d.key = CASE
    WHEN c.code LIKE 'PERSON.%' THEN 'person_identity'
    WHEN c.code LIKE 'RELATIONSHIP.%' THEN 'party_relationships'
    ELSE NULL
  END;

-- ============================================================
-- Migration decision audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rdm_migration_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid,
  decision text NOT NULL,
  legacy_value jsonb,
  canonical_value jsonb,
  evidence jsonb,
  reason text,
  affected_rows integer NOT NULL DEFAULT 0,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rdm_migration_decisions TO authenticated;
GRANT ALL ON public.rdm_migration_decisions TO service_role;
ALTER TABLE public.rdm_migration_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "migration decisions readable" ON public.rdm_migration_decisions;
CREATE POLICY "migration decisions readable"
  ON public.rdm_migration_decisions FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'regulatory_data_model', 'view')
    OR public.has_permission(auth.uid(), 'form_management', 'view')
  );

CREATE INDEX IF NOT EXISTS rdm_migration_decisions_target_idx
  ON public.rdm_migration_decisions (target_type, target_id, decided_at DESC);

-- ============================================================
-- Application requirement migration classification
-- ============================================================
CREATE TABLE IF NOT EXISTS public.application_requirement_migration_status (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  classification text NOT NULL,
  evidence jsonb,
  requirements_created integer NOT NULL DEFAULT 0,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.application_requirement_migration_status TO authenticated;
GRANT ALL ON public.application_requirement_migration_status TO service_role;
ALTER TABLE public.application_requirement_migration_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application requirement migration status readable" ON public.application_requirement_migration_status;
CREATE POLICY "application requirement migration status readable"
  ON public.application_requirement_migration_status FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'license_management', 'view')
    OR public.has_permission(auth.uid(), 'form_management', 'view')
    OR public.has_permission(auth.uid(), 'regulatory_data_model', 'view')
  );

-- ============================================================
-- Guard helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.rdm_require(_module text, _action text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(v_uid, _module, _action) THEN
    RAISE EXCEPTION 'Not permitted: %.%', _module, _action USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END $$;

-- ============================================================
-- Migration / integrity report
-- ============================================================
CREATE OR REPLACE FUNCTION public.rdm_wave_b_migration_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.rdm_require('form_management', 'view');

  SELECT jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'templates_total', (SELECT count(*) FROM public.form_templates),
      'templates_legacy_only', (SELECT count(*) FROM public.form_templates WHERE legacy_mapping_status = 'LEGACY_ONLY'),
      'templates_ambiguous', (SELECT count(*) FROM public.form_templates WHERE legacy_mapping_status = 'AMBIGUOUS'),
      'templates_partially_mapped', (SELECT count(*) FROM public.form_templates WHERE legacy_mapping_status = 'PARTIALLY_MAPPED'),
      'templates_exactly_mapped', (SELECT count(*) FROM public.form_templates WHERE legacy_mapping_status = 'EXACTLY_MAPPED'),
      'templates_unclassified', (SELECT count(*) FROM public.form_templates WHERE legacy_mapping_status IS NULL OR legacy_mapping_status = 'UNCLASSIFIED'),
      'fields_total', (SELECT count(*) FROM public.form_fields),
      'fields_without_definition', (SELECT count(*) FROM public.form_fields WHERE form_field_definition_id IS NULL),
      'definitions_total', (SELECT count(*) FROM public.form_field_definitions),
      'definitions_without_concept', (SELECT count(*) FROM public.form_field_definitions WHERE data_concept_id IS NULL),
      'applications_submitted', (SELECT count(*) FROM public.applications WHERE status <> 'draft'),
      'applications_missing_requirements', (
        SELECT count(*) FROM public.applications a
        WHERE a.status <> 'draft'
          AND NOT EXISTS (SELECT 1 FROM public.application_form_requirements r WHERE r.application_id = a.id)),
      'applications_migrated_with_evidence', (
        SELECT count(*) FROM public.application_requirement_migration_status WHERE classification = 'MIGRATED_WITH_EVIDENCE'),
      'applications_legacy_unknown', (
        SELECT count(*) FROM public.application_requirement_migration_status WHERE classification = 'LEGACY_REQUIREMENTS_UNKNOWN'),
      'concepts_without_domain', (SELECT count(*) FROM public.data_concepts WHERE data_domain_id IS NULL AND is_active),
      'fp_individuals_unlinked', (
        SELECT count(*) FROM public.fp_individuals i
        WHERE NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links l WHERE l.fp_individual_id = i.id)),
      'packages_total', (SELECT count(*) FROM public.form_packages),
      'legacy_registration_schemas', (SELECT count(*) FROM public.registration_form_configs)
    ),
    'legacy_templates', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
        SELECT jsonb_build_object(
          'id', t.id, 'name', t.name, 'legacy_form_type', t.form_type,
          'status', t.status,
          'mapping_status', COALESCE(t.legacy_mapping_status, 'UNCLASSIFIED'),
          'purpose_id', t.form_purpose_id,
          'purpose_key', fp.key,
          'trigger_key', tt.key,
          'domains', COALESCE((SELECT count(*) FROM public.form_data_domains d WHERE d.template_id = t.id), 0),
          'lifecycles', COALESCE((SELECT count(*) FROM public.form_lifecycle_applicability l WHERE l.template_id = t.id), 0),
          'field_count', COALESCE((SELECT count(*) FROM public.form_fields f JOIN public.form_versions v ON v.id = f.version_id WHERE v.template_id = t.id), 0),
          'suggested_purpose_key', (SELECT p2.key FROM public.form_purposes p2 WHERE p2.legacy_form_type = t.form_type AND p2.is_active LIMIT 1),
          'suggested_lifecycle', CASE t.form_type
              WHEN 'pre_license' THEN 'pre_authorisation'
              WHEN 'post_license' THEN 'post_authorisation'
              ELSE NULL END,
          'evidence', jsonb_build_object('source', 'form_templates.form_type', 'value', t.form_type)
        ) AS x
        FROM public.form_templates t
        LEFT JOIN public.form_purposes fp ON fp.id = t.form_purpose_id
        LEFT JOIN public.form_trigger_types tt ON tt.id = t.trigger_type_id
      ) s), '[]'::jsonb),
    'unmapped_fields_by_template', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
          'template_id', v.template_id,
          'template_name', t.name,
          'fields_without_definition', count(*) FILTER (WHERE f.form_field_definition_id IS NULL),
          'fields_total', count(*)
        ) AS x
        FROM public.form_fields f
        JOIN public.form_versions v ON v.id = f.version_id
        JOIN public.form_templates t ON t.id = v.template_id
        GROUP BY v.template_id, t.name
        HAVING count(*) FILTER (WHERE f.form_field_definition_id IS NULL) > 0
      ) s), '[]'::jsonb),
    'applications_missing_requirements_detail', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
          'application_id', a.id,
          'application_number', a.application_number,
          'status', a.status,
          'submitted_at', a.submitted_at,
          'evidence_versions', (
            SELECT count(*) FROM public.application_form_versions v WHERE v.application_id = a.id AND v.version_id IS NOT NULL),
          'evidence_responses', (
            SELECT count(*) FROM public.form_responses fr WHERE fr.entity_id = a.id AND fr.version_id IS NOT NULL),
          'classification', COALESCE(ms.classification,
            CASE WHEN EXISTS (SELECT 1 FROM public.application_form_versions v WHERE v.application_id = a.id AND v.version_id IS NOT NULL)
                   OR EXISTS (SELECT 1 FROM public.form_responses fr WHERE fr.entity_id = a.id AND fr.version_id IS NOT NULL)
                 THEN 'DERIVABLE_WITH_EVIDENCE'
                 ELSE 'LEGACY_REQUIREMENTS_UNKNOWN' END)
        ) AS x
        FROM public.applications a
        LEFT JOIN public.application_requirement_migration_status ms ON ms.application_id = a.id
        WHERE a.status <> 'draft'
          AND NOT EXISTS (SELECT 1 FROM public.application_form_requirements r WHERE r.application_id = a.id)
        ORDER BY a.submitted_at DESC NULLS LAST
        LIMIT 300
      ) s), '[]'::jsonb),
    'concepts_without_domain_detail', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'canonical_target', c.canonical_target))
      FROM public.data_concepts c WHERE c.data_domain_id IS NULL AND c.is_active), '[]'::jsonb),
    'sensitive_fields', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
          'definition_id', d.id, 'template_id', d.template_id, 'field_key', d.field_key,
          'concept_code', c.code, 'sensitivity', c.sensitivity_classification) AS x
        FROM public.form_field_definitions d
        JOIN public.data_concepts c ON c.id = d.data_concept_id
        WHERE c.sensitivity_classification IN ('CONFIDENTIAL', 'RESTRICTED', 'SENSITIVE')
        LIMIT 200
      ) s), '[]'::jsonb),
    'recent_decisions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', md.id, 'target_type', md.target_type, 'target_id', md.target_id,
        'decision', md.decision, 'reason', md.reason, 'affected_rows', md.affected_rows,
        'decided_at', md.decided_at, 'decided_by', md.decided_by))
      FROM (SELECT * FROM public.rdm_migration_decisions ORDER BY decided_at DESC LIMIT 50) md), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.rdm_wave_b_migration_report() TO authenticated;

-- ============================================================
-- Governed migration decision
-- ============================================================
CREATE OR REPLACE FUNCTION public.rdm_migration_decide(
  _target_type text,
  _target_id uuid,
  _decision text,
  _canonical jsonb DEFAULT '{}'::jsonb,
  _reason text DEFAULT NULL,
  _evidence jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_rows integer := 0;
  v_legacy jsonb;
  v_purpose uuid;
  v_trigger uuid;
BEGIN
  v_uid := public.rdm_require('form_management', 'edit');

  IF _decision NOT IN ('EXACTLY_MAPPED','PARTIALLY_MAPPED','AMBIGUOUS','LEGACY_ONLY','CONCEPT_BOUND','CONCEPT_CAPTURE_ONLY') THEN
    RAISE EXCEPTION 'Unknown migration decision %', _decision;
  END IF;

  IF _target_type = 'form_template' THEN
    SELECT to_jsonb(t) - 'created_at' - 'updated_at' INTO v_legacy FROM public.form_templates t WHERE t.id = _target_id;
    IF v_legacy IS NULL THEN RAISE EXCEPTION 'Form definition not found'; END IF;

    IF COALESCE(_canonical->>'purpose_key','') <> '' THEN
      SELECT id INTO v_purpose FROM public.form_purposes WHERE key = _canonical->>'purpose_key';
      IF v_purpose IS NULL THEN RAISE EXCEPTION 'Unknown form purpose %', _canonical->>'purpose_key'; END IF;
    END IF;
    IF COALESCE(_canonical->>'trigger_key','') <> '' THEN
      SELECT id INTO v_trigger FROM public.form_trigger_types WHERE key = _canonical->>'trigger_key';
      IF v_trigger IS NULL THEN RAISE EXCEPTION 'Unknown trigger type %', _canonical->>'trigger_key'; END IF;
    END IF;

    UPDATE public.form_templates
       SET legacy_mapping_status = _decision,
           form_purpose_id = COALESCE(v_purpose, form_purpose_id),
           trigger_type_id = COALESCE(v_trigger, trigger_type_id),
           updated_at = now()
     WHERE id = _target_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF COALESCE(_canonical->>'lifecycle_key','') <> '' THEN
      INSERT INTO public.form_lifecycle_applicability (template_id, lifecycle_key, lifecycle_stage_id)
      SELECT _target_id, _canonical->>'lifecycle_key',
             (SELECT ls.id FROM public.lifecycle_stages ls WHERE ls.key = _canonical->>'lifecycle_key' LIMIT 1)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.form_lifecycle_applicability
        WHERE template_id = _target_id AND lifecycle_key = _canonical->>'lifecycle_key');
    END IF;

    IF COALESCE(_canonical->>'data_domain_key','') <> '' THEN
      INSERT INTO public.form_data_domains (template_id, data_domain_id, is_primary)
      SELECT _target_id, d.id, true FROM public.data_domains d
      WHERE d.key = _canonical->>'data_domain_key'
        AND NOT EXISTS (SELECT 1 FROM public.form_data_domains fd WHERE fd.template_id = _target_id AND fd.data_domain_id = d.id);
    END IF;

  ELSIF _target_type = 'form_field_definition' THEN
    SELECT to_jsonb(d) INTO v_legacy FROM public.form_field_definitions d WHERE d.id = _target_id;
    IF v_legacy IS NULL THEN RAISE EXCEPTION 'Logical field not found'; END IF;

    IF _decision = 'CONCEPT_BOUND' THEN
      IF COALESCE(_canonical->>'data_concept_id','') = '' THEN RAISE EXCEPTION 'data_concept_id required'; END IF;
      UPDATE public.form_field_definitions
         SET data_concept_id = (_canonical->>'data_concept_id')::uuid, updated_at = now()
       WHERE id = _target_id;
    ELSE
      UPDATE public.form_field_definitions SET updated_at = now() WHERE id = _target_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

  ELSIF _target_type = 'application' THEN
    IF _decision <> 'LEGACY_ONLY' THEN
      RAISE EXCEPTION 'Applications may only be marked LEGACY_ONLY manually; requirements are reconstructed from evidence';
    END IF;
    INSERT INTO public.application_requirement_migration_status
      (application_id, classification, evidence, requirements_created, decided_by, decided_at)
    VALUES (_target_id, 'LEGACY_REQUIREMENTS_UNKNOWN', _evidence, 0, v_uid, now())
    ON CONFLICT (application_id) DO UPDATE
      SET classification = EXCLUDED.classification, evidence = EXCLUDED.evidence,
          decided_by = EXCLUDED.decided_by, decided_at = now();
    v_rows := 1;
  ELSE
    RAISE EXCEPTION 'Unsupported migration target %', _target_type;
  END IF;

  INSERT INTO public.rdm_migration_decisions
    (target_type, target_id, decision, legacy_value, canonical_value, evidence, reason, affected_rows, decided_by)
  VALUES (_target_type, _target_id, _decision, v_legacy, _canonical, _evidence, _reason, v_rows, v_uid);

  RETURN jsonb_build_object('ok', true, 'affected_rows', v_rows, 'decision', _decision);
END $$;

GRANT EXECUTE ON FUNCTION public.rdm_migration_decide(text, uuid, text, jsonb, text, jsonb) TO authenticated;

-- ============================================================
-- Backfill: stable logical field identity (deterministic only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rdm_backfill_field_definitions(_template_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_created integer := 0;
  v_linked integer := 0;
BEGIN
  v_uid := public.rdm_require('form_management', 'edit');
  PERFORM set_config('app.form_publish_context', 'trusted', true);

  INSERT INTO public.form_field_definitions (template_id, field_key, label_hint, is_published, is_active)
  SELECT DISTINCT ON (v.template_id, f.field_name)
         v.template_id, f.field_name, f.label,
         EXISTS (SELECT 1 FROM public.form_versions v2 WHERE v2.template_id = v.template_id AND v2.status = 'published'),
         true
  FROM public.form_fields f
  JOIN public.form_versions v ON v.id = f.version_id
  WHERE COALESCE(f.field_name, '') <> ''
    AND (_template_id IS NULL OR v.template_id = _template_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.form_field_definitions d
      WHERE d.template_id = v.template_id AND d.field_key = f.field_name)
  ORDER BY v.template_id, f.field_name, f.created_at;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  UPDATE public.form_fields f
     SET form_field_definition_id = d.id
  FROM public.form_versions v, public.form_field_definitions d
  WHERE v.id = f.version_id
    AND d.template_id = v.template_id
    AND d.field_key = f.field_name
    AND f.form_field_definition_id IS NULL
    AND (_template_id IS NULL OR v.template_id = _template_id);
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  INSERT INTO public.rdm_migration_decisions
    (target_type, target_id, decision, canonical_value, reason, affected_rows, decided_by)
  VALUES ('form_field_backfill', _template_id, 'EXACTLY_MAPPED',
          jsonb_build_object('definitions_created', v_created, 'fields_linked', v_linked),
          'Deterministic backfill: template + field_name identity', v_created + v_linked, v_uid);

  RETURN jsonb_build_object('definitions_created', v_created, 'fields_linked', v_linked);
END $$;

GRANT EXECUTE ON FUNCTION public.rdm_backfill_field_definitions(uuid) TO authenticated;

-- ============================================================
-- Backfill: application form requirements (evidence only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rdm_backfill_application_requirements(_application_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_created integer := 0;
  v_with_evidence integer := 0;
  v_unknown integer := 0;
BEGIN
  v_uid := public.rdm_require('form_management', 'edit');

  WITH candidates AS (
    SELECT a.id AS application_id
    FROM public.applications a
    WHERE a.status <> 'draft'
      AND (_application_id IS NULL OR a.id = _application_id)
      AND NOT EXISTS (SELECT 1 FROM public.application_form_requirements r WHERE r.application_id = a.id)
  ), evidence AS (
    SELECT c.application_id, v.template_id, v.version_id, 'application_form_versions'::text AS source
    FROM candidates c
    JOIN public.application_form_versions v ON v.application_id = c.application_id
    WHERE v.version_id IS NOT NULL AND v.template_id IS NOT NULL
    UNION
    SELECT c.application_id, fr.template_id, fr.version_id, 'form_responses'::text
    FROM candidates c
    JOIN public.form_responses fr ON fr.entity_id = c.application_id
    WHERE fr.version_id IS NOT NULL AND fr.template_id IS NOT NULL
  ), ins AS (
    INSERT INTO public.application_form_requirements
      (application_id, template_id, form_version_id, is_required, status, pinned_at)
    SELECT DISTINCT ON (e.application_id, e.template_id)
           e.application_id, e.template_id, e.version_id, true, 'MIGRATED_WITH_EVIDENCE', now()
    FROM evidence e
    ORDER BY e.application_id, e.template_id, e.source
    ON CONFLICT (application_id, template_id) DO NOTHING
    RETURNING application_id
  )
  SELECT count(*) INTO v_created FROM ins;

  INSERT INTO public.application_requirement_migration_status
    (application_id, classification, evidence, requirements_created, decided_by)
  SELECT a.id,
         CASE WHEN EXISTS (SELECT 1 FROM public.application_form_requirements r
                            WHERE r.application_id = a.id AND r.status = 'MIGRATED_WITH_EVIDENCE')
              THEN 'MIGRATED_WITH_EVIDENCE' ELSE 'LEGACY_REQUIREMENTS_UNKNOWN' END,
         jsonb_build_object(
           'application_form_versions', (SELECT count(*) FROM public.application_form_versions v WHERE v.application_id = a.id AND v.version_id IS NOT NULL),
           'form_responses', (SELECT count(*) FROM public.form_responses fr WHERE fr.entity_id = a.id AND fr.version_id IS NOT NULL)),
         (SELECT count(*) FROM public.application_form_requirements r WHERE r.application_id = a.id AND r.status = 'MIGRATED_WITH_EVIDENCE'),
         v_uid
  FROM public.applications a
  WHERE a.status <> 'draft'
    AND (_application_id IS NULL OR a.id = _application_id)
  ON CONFLICT (application_id) DO UPDATE
    SET classification = EXCLUDED.classification,
        evidence = EXCLUDED.evidence,
        requirements_created = EXCLUDED.requirements_created,
        decided_by = EXCLUDED.decided_by,
        decided_at = now();

  SELECT count(*) FILTER (WHERE classification = 'MIGRATED_WITH_EVIDENCE'),
         count(*) FILTER (WHERE classification = 'LEGACY_REQUIREMENTS_UNKNOWN')
    INTO v_with_evidence, v_unknown
  FROM public.application_requirement_migration_status;

  INSERT INTO public.rdm_migration_decisions
    (target_type, target_id, decision, canonical_value, reason, affected_rows, decided_by)
  VALUES ('application_requirements_backfill', _application_id, 'EXACTLY_MAPPED',
          jsonb_build_object('requirements_created', v_created,
                             'migrated_with_evidence', v_with_evidence,
                             'legacy_unknown', v_unknown),
          'Evidence-only reconstruction from stored form_version_id references', v_created, v_uid);

  RETURN jsonb_build_object('requirements_created', v_created,
                            'migrated_with_evidence', v_with_evidence,
                            'legacy_requirements_unknown', v_unknown);
END $$;

GRANT EXECUTE ON FUNCTION public.rdm_backfill_application_requirements(uuid) TO authenticated;

-- ============================================================
-- Data concept governed writes
-- ============================================================
CREATE OR REPLACE FUNCTION public.rdm_save_data_concept(_values jsonb, _id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid; v_id uuid; v_existing public.data_concepts;
BEGIN
  v_uid := public.rdm_require('regulatory_data_model', 'manage');

  IF _id IS NULL THEN
    INSERT INTO public.data_concepts (code, name, description, data_domain_id, data_type, cardinality,
      sensitivity_classification, value_source_type, master_data_source, canonical_target,
      projection_strategy, is_system, is_active)
    VALUES (
      upper(trim(_values->>'code')), _values->>'name', _values->>'description',
      NULLIF(_values->>'data_domain_id','')::uuid, COALESCE(_values->>'data_type','TEXT'),
      COALESCE(_values->>'cardinality','SINGLE'), COALESCE(_values->>'sensitivity_classification','INTERNAL'),
      _values->>'value_source_type', _values->>'master_data_source', _values->>'canonical_target',
      _values->>'projection_strategy', false, COALESCE((_values->>'is_active')::boolean, true))
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing FROM public.data_concepts WHERE id = _id;
    IF v_existing.id IS NULL THEN RAISE EXCEPTION 'Data concept not found'; END IF;
    IF COALESCE(_values->>'code','') <> '' AND upper(trim(_values->>'code')) IS DISTINCT FROM v_existing.code THEN
      RAISE EXCEPTION 'Concept code is immutable once created';
    END IF;
    UPDATE public.data_concepts SET
      name = COALESCE(_values->>'name', name),
      description = COALESCE(_values->>'description', description),
      data_domain_id = COALESCE(NULLIF(_values->>'data_domain_id','')::uuid, data_domain_id),
      data_type = COALESCE(_values->>'data_type', data_type),
      cardinality = COALESCE(_values->>'cardinality', cardinality),
      sensitivity_classification = COALESCE(_values->>'sensitivity_classification', sensitivity_classification),
      value_source_type = COALESCE(_values->>'value_source_type', value_source_type),
      master_data_source = COALESCE(_values->>'master_data_source', master_data_source),
      canonical_target = COALESCE(_values->>'canonical_target', canonical_target),
      projection_strategy = COALESCE(_values->>'projection_strategy', projection_strategy),
      is_active = COALESCE((_values->>'is_active')::boolean, is_active),
      updated_at = now()
    WHERE id = _id
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.rdm_migration_decisions
    (target_type, target_id, decision, canonical_value, reason, affected_rows, decided_by)
  VALUES ('data_concept', v_id, 'EXACTLY_MAPPED', _values,
          CASE WHEN _id IS NULL THEN 'Data concept created' ELSE 'Data concept updated' END, 1, v_uid);

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.rdm_save_data_concept(jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rdm_retire_data_concept(_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := public.rdm_require('regulatory_data_model', 'manage');
  UPDATE public.data_concepts
     SET is_active = false, effective_to = COALESCE(effective_to, now()), updated_at = now()
   WHERE id = _id;
  INSERT INTO public.rdm_migration_decisions
    (target_type, target_id, decision, reason, affected_rows, decided_by)
  VALUES ('data_concept', _id, 'LEGACY_ONLY', COALESCE(_reason, 'Concept retired'), 1, v_uid);
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.rdm_retire_data_concept(uuid, text) TO authenticated;

-- ============================================================
-- Form package + applicability governed writes
-- ============================================================
CREATE OR REPLACE FUNCTION public.form_package_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid; v_id uuid := NULLIF(_payload->>'id','')::uuid; v_status text := COALESCE(_payload->>'status','draft');
BEGIN
  v_uid := public.rdm_require('form_management', 'manage_packages');
  IF v_status <> 'draft' THEN
    PERFORM public.rdm_require('form_management', 'publish');
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.form_packages (code, name, description, regulator_id, status, is_active, created_by)
    VALUES (upper(trim(_payload->>'code')), _payload->>'name', _payload->>'description',
            NULLIF(_payload->>'regulator_id','')::uuid, v_status,
            COALESCE((_payload->>'is_active')::boolean, true), v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.form_packages SET
      name = COALESCE(_payload->>'name', name),
      description = COALESCE(_payload->>'description', description),
      regulator_id = NULLIF(_payload->>'regulator_id','')::uuid,
      status = v_status,
      published_at = CASE WHEN v_status = 'active' AND published_at IS NULL THEN now() ELSE published_at END,
      published_by = CASE WHEN v_status = 'active' AND published_by IS NULL THEN v_uid ELSE published_by END,
      is_active = COALESCE((_payload->>'is_active')::boolean, is_active),
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.form_package_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.form_package_item_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.rdm_require('form_management', 'manage_packages');
  INSERT INTO public.form_package_items (package_id, template_id, is_required, sequence, notes)
  VALUES ((_payload->>'package_id')::uuid, (_payload->>'template_id')::uuid,
          COALESCE((_payload->>'is_required')::boolean, true),
          COALESCE((_payload->>'sequence')::int, 0), _payload->>'notes')
  ON CONFLICT (package_id, template_id) DO UPDATE
    SET is_required = EXCLUDED.is_required, sequence = EXCLUDED.sequence, notes = EXCLUDED.notes
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.form_package_item_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.form_package_item_delete(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rdm_require('form_management', 'manage_packages');
  DELETE FROM public.form_package_items WHERE id = _id;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.form_package_item_delete(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.form_applicability_rule_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid := NULLIF(_payload->>'id','')::uuid;
BEGIN
  PERFORM public.rdm_require('form_management', 'manage_applicability');

  IF v_id IS NULL THEN
    INSERT INTO public.form_applicability_rules
      (package_id, regulator_id, jurisdiction, sector_id, sub_sector_id, category_id, service_id,
       license_type, entity_classification_value_id, lifecycle_key, request_type_key, application_type,
       effective_from, effective_to, priority, is_active)
    VALUES (
      (_payload->>'package_id')::uuid, NULLIF(_payload->>'regulator_id','')::uuid, NULLIF(_payload->>'jurisdiction',''),
      NULLIF(_payload->>'sector_id','')::uuid, NULLIF(_payload->>'sub_sector_id','')::uuid,
      NULLIF(_payload->>'category_id','')::uuid, NULLIF(_payload->>'service_id','')::uuid,
      NULLIF(_payload->>'license_type',''), NULLIF(_payload->>'entity_classification_value_id','')::uuid,
      NULLIF(_payload->>'lifecycle_key',''), NULLIF(_payload->>'request_type_key',''), NULLIF(_payload->>'application_type',''),
      COALESCE(NULLIF(_payload->>'effective_from','')::timestamptz, now()),
      NULLIF(_payload->>'effective_to','')::timestamptz,
      COALESCE((_payload->>'priority')::int, 100),
      COALESCE((_payload->>'is_active')::boolean, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.form_applicability_rules SET
      package_id = COALESCE(NULLIF(_payload->>'package_id','')::uuid, package_id),
      regulator_id = NULLIF(_payload->>'regulator_id','')::uuid,
      jurisdiction = NULLIF(_payload->>'jurisdiction',''),
      sector_id = NULLIF(_payload->>'sector_id','')::uuid,
      sub_sector_id = NULLIF(_payload->>'sub_sector_id','')::uuid,
      category_id = NULLIF(_payload->>'category_id','')::uuid,
      service_id = NULLIF(_payload->>'service_id','')::uuid,
      license_type = NULLIF(_payload->>'license_type',''),
      entity_classification_value_id = NULLIF(_payload->>'entity_classification_value_id','')::uuid,
      lifecycle_key = NULLIF(_payload->>'lifecycle_key',''),
      request_type_key = NULLIF(_payload->>'request_type_key',''),
      application_type = NULLIF(_payload->>'application_type',''),
      effective_from = COALESCE(NULLIF(_payload->>'effective_from','')::timestamptz, effective_from),
      effective_to = NULLIF(_payload->>'effective_to','')::timestamptz,
      priority = COALESCE((_payload->>'priority')::int, priority),
      is_active = COALESCE((_payload->>'is_active')::boolean, is_active),
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.form_applicability_rule_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.form_applicability_rule_delete(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rdm_require('form_management', 'manage_applicability');
  DELETE FROM public.form_applicability_rules WHERE id = _id;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.form_applicability_rule_delete(uuid) TO authenticated;

-- ============================================================
-- Entity structure consolidated read
-- ============================================================
CREATE OR REPLACE FUNCTION public.entity_structure_overview(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    public.has_permission(v_uid, 'entity_membership', 'view')
    OR public.has_permission(v_uid, 'license_management', 'view')
    OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                WHERE m.user_id = v_uid AND m.entity_id = _entity_id AND m.status = 'APPROVED')
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'entity_id', l.id,
    'name', l.name,
    'party_id', l.party_id,
    'sector_id', l.sector_id,
    'sub_sector_id', l.sub_sector_id,
    'category_id', l.category_id,
    'status', l.status,
    'lifecycle_stage_id', l.lifecycle_stage_id,
    'identity_status_id', l.identity_status_id,
    'merged_into_entity_id', l.merged_into_entity_id,
    'structure_version', l.structure_version,
    'licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('license_id', el.license_id, 'is_primary', el.is_primary,
                                          'effective_from', el.effective_from, 'effective_to', el.effective_to)
             ORDER BY el.effective_from DESC)
      FROM public.entity_licenses el WHERE el.entity_id = l.id), '[]'::jsonb),
    'ownership_count', (SELECT count(*) FROM public.ownership_interests o WHERE o.owned_entity_id = l.id AND o.effective_to IS NULL),
    'controller_count', (SELECT count(*) FROM public.ownership_interests o WHERE o.owned_entity_id = l.id AND o.effective_to IS NULL AND o.is_controller),
    'ubo_count', (SELECT count(*) FROM public.ownership_interests o WHERE o.owned_entity_id = l.id AND o.effective_to IS NULL AND o.is_ubo),
    'relationship_count', (SELECT count(*) FROM public.party_relationships r WHERE r.entity_id = l.id AND r.effective_to IS NULL),
    'board_count', (SELECT count(*) FROM public.entity_appointments a JOIN public.role_types rt ON rt.id = a.role_type_id
                     WHERE a.entity_id = l.id AND a.effective_to IS NULL AND rt.is_governance),
    'key_function_count', (SELECT count(*) FROM public.entity_appointments a JOIN public.role_types rt ON rt.id = a.role_type_id
                     WHERE a.entity_id = l.id AND a.effective_to IS NULL AND NOT rt.is_governance),
    'open_requests', (SELECT count(*) FROM public.regulatory_requests r WHERE r.entity_id = l.id AND r.status NOT IN ('CLOSED','REJECTED','WITHDRAWN')),
    'pending_change_sets', (SELECT count(*) FROM public.entity_change_sets cs WHERE cs.entity_id = l.id AND cs.status NOT IN ('APPLIED','REJECTED','WITHDRAWN')),
    'names', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', n.name, 'name_type', n.name_type, 'is_current', n.is_current,
                                          'effective_from', n.effective_from, 'effective_to', n.effective_to)
             ORDER BY n.effective_from DESC)
      FROM public.organization_names n WHERE n.party_id = l.party_id), '[]'::jsonb)
  ) INTO v_out
  FROM public.licensees l
  WHERE l.id = _entity_id;

  IF v_out IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;
  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.entity_structure_overview(uuid) TO authenticated;