-- F5-B5X part 2: variation / surrender catalogue, lifecycle input completeness,
-- server-authoritative request classification, form resolver repair.

-- 1. widen effect kinds -------------------------------------------------------
ALTER TABLE public.post_license_effect_map
  DROP CONSTRAINT post_license_effect_map_effect_kind_check;
ALTER TABLE public.post_license_effect_map
  ADD CONSTRAINT post_license_effect_map_effect_kind_check
  CHECK (effect_kind = ANY (ARRAY['RENEWAL'::text,'ENTITY_CHANGE'::text,'NOTIFICATION_ACK'::text,
                                  'ESTABLISHMENT_OPEN'::text,'ESTABLISHMENT_CLOSE'::text,
                                  'LICENCE_VARIATION'::text,'LICENCE_SURRENDER'::text,
                                  'UNSUPPORTED'::text]));

-- 2. canonical licence lifecycle data concepts --------------------------------
INSERT INTO public.data_domains (key, label, description, default_authority, sort_order, is_system, is_active)
VALUES ('licence_lifecycle','Licence lifecycle',
        'Canonical data captured for licence variation, surrender and other lifecycle matters.',
        'SUPTECH',110,true,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.data_concepts
  (code, name, description, data_domain_id, data_type, cardinality, sensitivity_classification,
   value_source_type, canonical_target, projection_strategy, is_system, is_active)
SELECT x.code, x.name, x.description, d.id, x.data_type, x.cardinality, 'INTERNAL',
       'FREE_INPUT', 'licenses', 'CAPTURE_ONLY', true, true
FROM public.data_domains d,
     (VALUES
        ('LICENCE.VARIATION_TYPE','Licence variation type','Nature of the variation requested by the licensee','TEXT','SINGLE'),
        ('LICENCE.VARIATION_RATIONALE','Licence variation rationale','Reason the licensee requires the variation','TEXT','SINGLE'),
        ('LICENCE.VARIATION_ITEMS','Licence variation items','Structured list of licence elements proposed for variation','JSON','MULTIPLE'),
        ('LICENCE.SURRENDER_REASON','Licence surrender reason','Reason the licensee wishes to surrender the licence','TEXT','SINGLE'),
        ('LICENCE.SURRENDER_EFFECTIVE_DATE','Licence surrender effective date','Date from which the surrender is to take effect','DATE','SINGLE'),
        ('LICENCE.SURRENDER_LEGAL_BASIS','Licence surrender legal basis','Legal provision relied on for accepting the surrender','TEXT','SINGLE')
     ) AS x(code,name,description,data_type,cardinality)
WHERE d.key = 'licence_lifecycle'
ON CONFLICT (code) DO NOTHING;

-- 3. canonical service catalogue rows ----------------------------------------
INSERT INTO public.services
  (sector_id, sub_sector_id, name, status, regulator_id, regulatory_function_id, code,
   description, lifecycle_stage, workflow_id, decision_type, requires_fit_and_proper,
   sla_days, fee_reference)
SELECT s.sector_id, s.sub_sector_id, x.name, 'active', s.regulator_id, s.regulatory_function_id,
       x.code, x.description, 'post_license', s.workflow_id, 'approval', false, NULL, NULL
FROM public.services s
CROSS JOIN (VALUES
   ('PLS_LICENCE_VARIATION','Licence Variation',
    'Application by a licensee to vary the scope, conditions or particulars of an existing licence.'),
   ('PLS_VOLUNTARY_SURRENDER','Voluntary Surrender',
    'Application by a licensee to voluntarily surrender an existing licence.')
) AS x(code,name,description)
WHERE s.code = 'PLS_NEW_BRANCH'
ON CONFLICT (sector_id, sub_sector_id, name) DO NOTHING;

-- 4. governed effect mapping --------------------------------------------------
INSERT INTO public.post_license_effect_map
  (service_code, effect_kind, canonical_target, handler, is_supported, notes)
VALUES
  ('PLS_LICENCE_VARIATION','LICENCE_VARIATION',
   'license_lifecycle_matters + license_variation_operation',
   'license_lifecycle_step', true,
   'Executes the F4-certified licence lifecycle engine (APPLY_VARIATION / APPROVE_VARIATION); no parallel variation engine.'),
  ('PLS_VOLUNTARY_SURRENDER','LICENCE_SURRENDER',
   'license_lifecycle_matters + licenses.status',
   'license_lifecycle_step', true,
   'Executes the F4-certified licence lifecycle engine (BEGIN_SURRENDER / COMPLETE_SURRENDER_REVIEW / ACCEPT_SURRENDER).')
ON CONFLICT (service_code) DO UPDATE
  SET effect_kind = EXCLUDED.effect_kind,
      canonical_target = EXCLUDED.canonical_target,
      handler = EXCLUDED.handler,
      is_supported = true,
      bcr_reason = NULL,
      blocker_class = NULL,
      notes = EXCLUDED.notes,
      updated_at = now();

INSERT INTO public.post_license_effect_service_bindings (service_id, service_code, rationale)
SELECT s.id, s.code,
       'F5-B5X canonical licence lifecycle journey bound to the F4-certified lifecycle engine.'
  FROM public.services s
 WHERE s.code IN ('PLS_LICENCE_VARIATION','PLS_VOLUNTARY_SURRENDER')
ON CONFLICT (service_id) DO NOTHING;

-- 5. request forms (one published template per sector service) ----------------
DO $seed$
DECLARE
  r record;
  v_tpl uuid;
  v_ver uuid;
  v_detail_title text;
  v_def uuid;
  f record;
BEGIN
  FOR r IN
    SELECT s.id AS service_id, s.code, s.name AS service_name, s.sector_id, s.sub_sector_id,
           sec.name AS sector_name, sub.name AS sub_sector_name
      FROM public.services s
      JOIN public.sectors sec ON sec.id = s.sector_id
      JOIN public.sub_sectors sub ON sub.id = s.sub_sector_id
     WHERE s.code IN ('PLS_LICENCE_VARIATION','PLS_VOLUNTARY_SURRENDER')
  LOOP
    IF EXISTS (SELECT 1 FROM public.form_templates t WHERE t.service_id = r.service_id) THEN
      CONTINUE;
    END IF;

    v_detail_title := CASE WHEN r.code = 'PLS_LICENCE_VARIATION'
                           THEN 'Variation Details' ELSE 'Surrender Details' END;

    INSERT INTO public.form_templates
      (name, description, form_type, sector, sub_sector, category, service,
       is_reusable, status, sector_id, sub_sector_id, service_id, form_order)
    VALUES ('PLS - ' || r.sub_sector_name || ' - ' || r.service_name,
            r.service_name || ' request form for ' || r.sub_sector_name || ' licensees.',
            'post_license', r.sector_name, r.sub_sector_name, '', r.service_name,
            true, 'published', r.sector_id, r.sub_sector_id, r.service_id, 0)
    RETURNING id INTO v_tpl;

    INSERT INTO public.form_versions (template_id, version, status, semantic_version, change_notes)
    VALUES (v_tpl, 1, 'draft', '1.0',
            'F5-B5X: initial published version for governed licence lifecycle journey')
    RETURNING id INTO v_ver;

    INSERT INTO public.form_fields
      (version_id, section_id, section_title, section_order, field_type, label, field_name, required, sort_order)
    VALUES
      (v_ver,'sec_entity','Licensee & Licence Details',0,'text','Licensee Legal Name','licensee_legal_name',true,1),
      (v_ver,'sec_entity','Licensee & Licence Details',0,'text','Licence Number','license_number',true,2),
      (v_ver,'sec_entity','Licensee & Licence Details',0,'text','Sector / Sub-Sector','entity_sector',false,3),
      (v_ver,'sec_docs','Supporting Documents',2,'file','Primary Supporting Document','supporting_document',true,1),
      (v_ver,'sec_docs','Supporting Documents',2,'file','Board Resolution','board_resolution_doc',false,2),
      (v_ver,'sec_decl','Declaration',3,'text','Authorised Signatory Name','signatory_name',true,1),
      (v_ver,'sec_decl','Declaration',3,'text','Position / Title','signatory_position',true,2),
      (v_ver,'sec_decl','Declaration',3,'date','Date of Declaration','declaration_date',true,3),
      (v_ver,'sec_decl','Declaration',3,'textarea','Attestation','attestation_statement',true,4);

    FOR f IN
      SELECT * FROM (VALUES
        ('PLS_LICENCE_VARIATION','variation_type','Variation Type','text','LICENCE.VARIATION_TYPE',true,1),
        ('PLS_LICENCE_VARIATION','variation_rationale','Rationale for Variation','textarea','LICENCE.VARIATION_RATIONALE',true,2),
        ('PLS_LICENCE_VARIATION','variation_items','Licence Elements to Vary','textarea','LICENCE.VARIATION_ITEMS',false,3),
        ('PLS_VOLUNTARY_SURRENDER','surrender_reason','Reason for Surrender','textarea','LICENCE.SURRENDER_REASON',true,1),
        ('PLS_VOLUNTARY_SURRENDER','surrender_effective_date','Requested Effective Date of Surrender','date','LICENCE.SURRENDER_EFFECTIVE_DATE',true,2),
        ('PLS_VOLUNTARY_SURRENDER','surrender_legal_basis','Legal Basis Relied On','text','LICENCE.SURRENDER_LEGAL_BASIS',false,3)
      ) AS t(code,field_name,label,field_type,concept,required,sort_order)
      WHERE t.code = r.code
    LOOP
      INSERT INTO public.form_field_definitions
        (template_id, field_key, data_concept_id, label_hint, is_published, is_active)
      SELECT v_tpl, f.field_name, dc.id, f.label, true, true
        FROM public.data_concepts dc WHERE dc.code = f.concept
      RETURNING id INTO v_def;

      INSERT INTO public.form_fields
        (version_id, section_id, section_title, section_order, field_type, label, field_name,
         required, sort_order, form_field_definition_id)
      VALUES (v_ver,'sec_detail', v_detail_title, 1, f.field_type, f.label, f.field_name,
              f.required, f.sort_order, v_def);
    END LOOP;

    UPDATE public.form_versions
       SET status = 'published', published_at = now()
     WHERE id = v_ver;
  END LOOP;
END $seed$;

-- 6. surrender/variation input completeness ----------------------------------
CREATE OR REPLACE FUNCTION public.post_license_lifecycle_input(_application_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH v AS (
    SELECT dc.code, x.value_text, x.value_date, x.value_json
      FROM public.form_submission_values x
      JOIN public.form_responses r ON r.id = x.response_id
      JOIN public.data_concepts dc ON dc.id = x.data_concept_id
     WHERE r.entity_type = 'application' AND r.entity_id = _application_id
       AND dc.code LIKE 'LICENCE.%'
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'variation_type', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.VARIATION_TYPE' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'variation_rationale', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.VARIATION_RATIONALE' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'variation_items', (SELECT value_json FROM v
        WHERE code = 'LICENCE.VARIATION_ITEMS' AND jsonb_typeof(value_json) = 'array' LIMIT 1),
    'surrender_reason', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.SURRENDER_REASON' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'surrender_effective_date', (SELECT value_date FROM v
        WHERE code = 'LICENCE.SURRENDER_EFFECTIVE_DATE' AND value_date IS NOT NULL LIMIT 1),
    'surrender_legal_basis', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.SURRENDER_LEGAL_BASIS' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1)
  ))
$fn$;

-- 7. server-authoritative request classification ------------------------------
CREATE OR REPLACE FUNCTION public.derive_application_request_kind(_data jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.licenses l
       WHERE NULLIF(btrim(COALESCE(_data->>'license_id','')),'') ~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND l.id = (btrim(_data->>'license_id'))::uuid)
      THEN 'POST_LICENSE'
    WHEN EXISTS (
      SELECT 1 FROM public.services s
       WHERE NULLIF(btrim(COALESCE(_data->>'service_id','')),'') ~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND s.id = (btrim(_data->>'service_id'))::uuid
         AND lower(COALESCE(s.status,'')) = 'active'
         AND lower(COALESCE(s.lifecycle_stage,'')) IN ('post_license','renewal'))
      THEN 'POST_LICENSE'
    ELSE 'INITIAL'
  END
$fn$;

CREATE OR REPLACE FUNCTION public.applications_set_request_kind()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  NEW.request_kind := public.derive_application_request_kind(COALESCE(NEW.data,'{}'::jsonb));
  IF TG_OP = 'UPDATE' AND OLD.request_kind = 'POST_LICENSE' THEN
    NEW.request_kind := 'POST_LICENSE';
  END IF;
  RETURN NEW;
END $fn$;

-- 8. post-licensing form resolver repair --------------------------------------
CREATE OR REPLACE FUNCTION public.post_license_service_form_set(_service_id uuid, _license_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_ctx record;
  v_applicability text;
  v_set jsonb;
  v_forms jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_applicability := public.post_license_service_applicability(_service_id, _license_id);
  IF v_applicability <> 'OK' THEN
    RETURN jsonb_build_object('state', v_applicability,
      'message', public.post_license_applicability_message(v_applicability),
      'forms','[]'::jsonb);
  END IF;

  SELECT * INTO v_ctx FROM public.resolve_post_license_intake_context(_license_id, _service_id);
  IF v_ctx.entity_id IS NULL THEN
    RETURN jsonb_build_object('state','LICENSE_NOT_FOUND','forms','[]'::jsonb);
  END IF;

  v_set := public.application_resolve_form_set(
             v_ctx.regulator_id, v_ctx.sector_id, v_ctx.sub_sector_id, v_ctx.category_id,
             NULL, 'post_license');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'form_id', x->>'template_id',
           'form_version_id', x->>'form_version_id',
           'name', x->>'template_name',
           'is_mandatory', COALESCE((x->>'is_required')::boolean, true),
           'display_order', COALESCE((x->>'sequence')::int, 0))
         ORDER BY COALESCE((x->>'sequence')::int, 0), x->>'template_name'), '[]'::jsonb)
    INTO v_forms
    FROM jsonb_array_elements(COALESCE(v_set->'items','[]'::jsonb)) x;

  RETURN jsonb_build_object(
    'state', CASE WHEN jsonb_array_length(v_forms) > 0 THEN 'OK' ELSE 'NO_APPLICABLE_FORMS' END,
    'license_id', _license_id,
    'service_id', _service_id,
    'entity_id', v_ctx.entity_id,
    'sector_id', v_ctx.sector_id,
    'sub_sector_id', v_ctx.sub_sector_id,
    'category_id', v_ctx.category_id,
    'resolution_source', v_set->>'source',
    'forms', v_forms);
END $fn$;

REVOKE ALL ON FUNCTION public.post_license_service_form_set(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_license_service_form_set(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.post_license_lifecycle_input(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_license_lifecycle_input(uuid) TO authenticated;