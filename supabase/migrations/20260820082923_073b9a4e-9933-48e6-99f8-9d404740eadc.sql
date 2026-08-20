
-- concurrency baseline for structural state
ALTER TABLE public.licensees ADD COLUMN IF NOT EXISTS structure_version integer NOT NULL DEFAULT 0;

-- ============ authorization helpers ============
CREATE OR REPLACE FUNCTION public.wb_membership_capability(_entity_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
      JOIN public.entity_membership_role_permissions c ON c.membership_role_id = m.membership_role_id
     WHERE m.entity_id = _entity_id AND m.user_id = auth.uid()
       AND upper(COALESCE(m.status,'')) = 'APPROVED'
       AND c.capability = _capability);
$$;
REVOKE EXECUTE ON FUNCTION public.wb_membership_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wb_membership_capability(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wb_require(_module text, _action text, _entity_id uuid DEFAULT NULL, _capability text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.has_permission(auth.uid(), _module, _action) THEN RETURN; END IF;
  IF _entity_id IS NOT NULL AND _capability IS NOT NULL
     AND public.wb_membership_capability(_entity_id, _capability) THEN RETURN; END IF;
  RAISE EXCEPTION 'Not authorized: %.%', _module, _action USING ERRCODE = '42501';
END $$;
REVOKE EXECUTE ON FUNCTION public.wb_require(text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wb_require(text,text,uuid,text) TO authenticated, service_role;

-- ============ 13. FORM VERSION IMMUTABILITY ============
CREATE OR REPLACE FUNCTION public.form_version_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(current_setting('app.form_publish_context', true),'') = 'trusted' THEN RETURN NEW; END IF;
  IF OLD.status = 'published' THEN
    IF NEW.schema_snapshot IS DISTINCT FROM OLD.schema_snapshot
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.template_id IS DISTINCT FROM OLD.template_id THEN
      RAISE EXCEPTION 'Published form version % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_form_version_immutable ON public.form_versions;
CREATE TRIGGER trg_form_version_immutable BEFORE UPDATE ON public.form_versions
FOR EACH ROW EXECUTE FUNCTION public.form_version_immutable_guard();

CREATE OR REPLACE FUNCTION public.form_fields_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_version uuid; v_status text;
BEGIN
  IF COALESCE(current_setting('app.form_publish_context', true),'') = 'trusted' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_version := COALESCE(NEW.version_id, OLD.version_id);
  SELECT status INTO v_status FROM public.form_versions WHERE id = v_version;
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'Fields of a published form version cannot be changed (version %)', v_version;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_form_fields_immutable ON public.form_fields;
CREATE TRIGGER trg_form_fields_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.form_fields
FOR EACH ROW EXECUTE FUNCTION public.form_fields_immutable_guard();

-- ============ form lifecycle RPCs ============
CREATE OR REPLACE FUNCTION public.form_save_draft(_template_id uuid, _fields jsonb, _change_notes text DEFAULT NULL, _version_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_version record; v_f jsonb; v_def_id uuid; v_next int; v_key text;
BEGIN
  PERFORM public.wb_require('form_management','edit');
  IF NOT EXISTS (SELECT 1 FROM public.form_templates WHERE id = _template_id) THEN
    RAISE EXCEPTION 'Form definition not found';
  END IF;

  IF _version_id IS NOT NULL THEN
    SELECT * INTO v_version FROM public.form_versions WHERE id = _version_id FOR UPDATE;
    IF v_version.status = 'published' THEN
      RAISE EXCEPTION 'Published form versions are immutable; branch a new version instead';
    END IF;
  ELSE
    SELECT * INTO v_version FROM public.form_versions
      WHERE template_id = _template_id AND status = 'draft'
      ORDER BY version DESC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_version.id IS NULL THEN
    SELECT COALESCE(MAX(version),0) + 1 INTO v_next FROM public.form_versions WHERE template_id = _template_id;
    INSERT INTO public.form_versions (template_id, version, status, change_notes, created_by, schema_snapshot)
    VALUES (_template_id, v_next, 'draft', _change_notes, auth.uid(), COALESCE(_fields,'[]'::jsonb))
    RETURNING * INTO v_version;
  ELSE
    UPDATE public.form_versions
       SET schema_snapshot = COALESCE(_fields, schema_snapshot),
           change_notes = COALESCE(_change_notes, change_notes)
     WHERE id = v_version.id RETURNING * INTO v_version;
    DELETE FROM public.form_fields WHERE version_id = v_version.id;
  END IF;

  FOR v_f IN SELECT * FROM jsonb_array_elements(COALESCE(_fields,'[]'::jsonb)) LOOP
    v_key := COALESCE(NULLIF(v_f->>'field_key',''), NULLIF(v_f->>'field_name',''));
    v_def_id := NULL;
    IF v_key IS NOT NULL THEN
      SELECT id INTO v_def_id FROM public.form_field_definitions
       WHERE template_id = _template_id AND field_key = v_key;
      IF v_def_id IS NULL THEN
        INSERT INTO public.form_field_definitions (template_id, field_key, data_concept_id, label_hint)
        VALUES (_template_id, v_key, NULLIF(v_f->>'data_concept_id','')::uuid, v_f->>'label')
        RETURNING id INTO v_def_id;
      ELSE
        UPDATE public.form_field_definitions
           SET data_concept_id = COALESCE(NULLIF(v_f->>'data_concept_id','')::uuid, data_concept_id),
               label_hint = COALESCE(v_f->>'label', label_hint)
         WHERE id = v_def_id;
      END IF;
    END IF;

    INSERT INTO public.form_fields (version_id, form_field_definition_id, section_id, section_title,
      section_order, field_type, label, field_name, required, placeholder, help_text, default_value,
      options, validation, sort_order, calculated_expression)
    VALUES (v_version.id, v_def_id, v_f->>'section_id', v_f->>'section_title',
      COALESCE((v_f->>'section_order')::int,0), COALESCE(v_f->>'field_type','text'), v_f->>'label', v_key,
      COALESCE((v_f->>'required')::boolean,false), v_f->>'placeholder', v_f->>'help_text', v_f->>'default_value',
      v_f->'options', v_f->'validation', COALESCE((v_f->>'sort_order')::int,0), v_f->>'calculated_expression');
  END LOOP;

  PERFORM public.create_audit_log(auth.uid(),'form.definition.updated','form_version', v_version.id::text, NULL,
    jsonb_build_object('template_id',_template_id,'version',v_version.version), NULL);
  RETURN jsonb_build_object('success',true,'version_id',v_version.id,'version',v_version.version);
END $$;

CREATE OR REPLACE FUNCTION public.publish_form_version(_version_id uuid, _effective_from timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_version record; v_missing int;
BEGIN
  PERFORM public.wb_require('form_management','publish');
  SELECT * INTO v_version FROM public.form_versions WHERE id = _version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form version not found'; END IF;
  IF v_version.status = 'published' THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'version_id',_version_id);
  END IF;

  -- 9. calculation integrity: every referenced logical field must exist in this version
  SELECT count(*) INTO v_missing FROM public.form_fields f
   WHERE f.version_id = _version_id
     AND COALESCE(f.calculated_expression,'') <> ''
     AND EXISTS (
       SELECT 1 FROM regexp_matches(f.calculated_expression, '[A-Za-z_][A-Za-z0-9_]*', 'g') AS t(tok)
        WHERE tok[1] NOT IN ('and','or','not','if','then','else','sum','abs','min','max','round')
          AND NOT EXISTS (SELECT 1 FROM public.form_fields g
                           WHERE g.version_id = _version_id AND g.field_name = tok[1]));
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Cannot publish: % calculated field(s) reference unknown fields', v_missing;
  END IF;

  PERFORM set_config('app.form_publish_context','trusted', true);
  UPDATE public.form_versions
     SET status = 'published', published_at = now(), effective_from = COALESCE(_effective_from, now())
   WHERE id = _version_id;
  UPDATE public.form_versions SET status = 'archived'
   WHERE template_id = v_version.template_id AND id <> _version_id AND status = 'published';
  UPDATE public.form_templates SET status = 'published', updated_at = now() WHERE id = v_version.template_id;
  UPDATE public.form_field_definitions d SET is_published = true
   WHERE d.template_id = v_version.template_id
     AND EXISTS (SELECT 1 FROM public.form_fields f WHERE f.version_id = _version_id AND f.form_field_definition_id = d.id);

  PERFORM public.create_audit_log(auth.uid(),'form.version.published','form_version',_version_id::text,NULL,
    jsonb_build_object('template_id',v_version.template_id,'version',v_version.version),NULL);
  RETURN jsonb_build_object('success',true,'version_id',_version_id,'version',v_version.version);
END $$;

CREATE OR REPLACE FUNCTION public.retire_form_definition(_template_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.wb_require('form_management','retire');
  PERFORM set_config('app.form_publish_context','trusted', true);
  UPDATE public.form_templates SET status = 'archived', updated_at = now() WHERE id = _template_id;
  UPDATE public.form_versions SET status = 'retired', effective_until = now()
   WHERE template_id = _template_id AND status IN ('published','draft');
  PERFORM public.create_audit_log(auth.uid(),'form.version.retired','form_template',_template_id::text,NULL,
    jsonb_build_object('reason',_reason),NULL);
  RETURN jsonb_build_object('success',true,'template_id',_template_id);
END $$;

CREATE OR REPLACE FUNCTION public.branch_form_version(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_src record; v_new record; v_next int;
BEGIN
  PERFORM public.wb_require('form_management','edit');
  SELECT * INTO v_src FROM public.form_versions WHERE id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form version not found'; END IF;
  SELECT COALESCE(MAX(version),0) + 1 INTO v_next FROM public.form_versions WHERE template_id = v_src.template_id;
  INSERT INTO public.form_versions (template_id, version, status, schema_snapshot, created_by, branched_from_version_id)
  VALUES (v_src.template_id, v_next, 'draft', v_src.schema_snapshot, auth.uid(), _version_id)
  RETURNING * INTO v_new;

  INSERT INTO public.form_fields (version_id, form_field_definition_id, section_id, section_title, section_order,
    section_description, section_is_repeatable, field_type, label, field_name, required, placeholder, help_text,
    default_value, options, validation, sort_order, content, table_columns, calculated_expression, line_code)
  SELECT v_new.id, form_field_definition_id, section_id, section_title, section_order,
    section_description, section_is_repeatable, field_type, label, field_name, required, placeholder, help_text,
    default_value, options, validation, sort_order, content, table_columns, calculated_expression, line_code
    FROM public.form_fields WHERE version_id = _version_id;

  RETURN jsonb_build_object('success',true,'version_id',v_new.id,'version',v_new.version);
END $$;

-- ============ 18. ONE APPLICABILITY RESOLVER ============
CREATE OR REPLACE FUNCTION public.resolve_applicable_form_package(_ctx jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rule record; v_items jsonb;
BEGIN
  SELECT r.*,
         ((CASE WHEN r.regulator_id IS NOT NULL THEN 16 ELSE 0 END)
        + (CASE WHEN r.category_id IS NOT NULL THEN 32 ELSE 0 END)
        + (CASE WHEN r.sub_sector_id IS NOT NULL THEN 16 ELSE 0 END)
        + (CASE WHEN r.sector_id IS NOT NULL THEN 8 ELSE 0 END)
        + (CASE WHEN r.license_type IS NOT NULL THEN 4 ELSE 0 END)
        + (CASE WHEN r.request_type_key IS NOT NULL THEN 4 ELSE 0 END)
        + (CASE WHEN r.lifecycle_key IS NOT NULL THEN 2 ELSE 0 END)
        + (CASE WHEN r.application_type IS NOT NULL THEN 1 ELSE 0 END)) AS specificity
    INTO v_rule
    FROM public.form_applicability_rules r
    JOIN public.form_packages p ON p.id = r.package_id
   WHERE r.is_active AND p.status = 'published' AND p.is_active
     AND r.effective_from <= now() AND (r.effective_to IS NULL OR r.effective_to > now())
     AND (r.regulator_id IS NULL OR r.regulator_id = NULLIF(_ctx->>'regulator_id','')::uuid)
     AND (r.sector_id IS NULL OR r.sector_id = NULLIF(_ctx->>'sector_id','')::uuid)
     AND (r.sub_sector_id IS NULL OR r.sub_sector_id = NULLIF(_ctx->>'sub_sector_id','')::uuid)
     AND (r.category_id IS NULL OR r.category_id = NULLIF(_ctx->>'category_id','')::uuid)
     AND (r.service_id IS NULL OR r.service_id = NULLIF(_ctx->>'service_id','')::uuid)
     AND (r.license_type IS NULL OR r.license_type = NULLIF(_ctx->>'license_type',''))
     AND (r.lifecycle_key IS NULL OR r.lifecycle_key = NULLIF(_ctx->>'lifecycle_key',''))
     AND (r.request_type_key IS NULL OR r.request_type_key = NULLIF(_ctx->>'request_type_key',''))
     AND (r.application_type IS NULL OR r.application_type = NULLIF(_ctx->>'application_type',''))
     AND (r.jurisdiction IS NULL OR r.jurisdiction = NULLIF(_ctx->>'jurisdiction',''))
   ORDER BY specificity DESC, r.priority DESC, r.effective_from DESC, r.id
   LIMIT 1;

  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('resolved', false, 'reason','NO_APPLICABLE_PACKAGE');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'template_id', i.template_id,
           'template_name', t.name,
           'is_required', i.is_required,
           'sequence', i.sequence,
           'form_version_id', pv.id,
           'form_version', pv.version)
         ORDER BY i.sequence, t.name)
    INTO v_items
    FROM public.form_package_items i
    JOIN public.form_templates t ON t.id = i.template_id
    LEFT JOIN LATERAL (
      SELECT v.id, v.version FROM public.form_versions v
       WHERE v.template_id = i.template_id AND v.status = 'published'
       ORDER BY v.version DESC LIMIT 1) pv ON true
   WHERE i.package_id = v_rule.package_id;

  RETURN jsonb_build_object('resolved', true,
    'package_id', v_rule.package_id,
    'applicability_rule_id', v_rule.id,
    'specificity', v_rule.specificity,
    'items', COALESCE(v_items,'[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_applicable_form_package(jsonb) TO authenticated, service_role;

-- ============ 19. PIN APPLICATION REQUIREMENTS ============
CREATE OR REPLACE FUNCTION public.application_pin_form_requirements(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_app record; v_res jsonb; v_item jsonb; v_count int := 0; v_missing int := 0;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF NOT (public.has_permission(auth.uid(),'application_management','view')
          OR v_app.applicant_id = auth.uid()
          OR public.wb_entity_member(v_app.entity_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.application_form_requirements WHERE application_id = _application_id) THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'application_id',_application_id);
  END IF;

  v_res := public.resolve_applicable_form_package(jsonb_build_object(
    'regulator_id', v_app.regulator_id,
    'sector_id', v_app.data->>'sector_id',
    'sub_sector_id', v_app.data->>'sub_sector_id',
    'category_id', v_app.data->>'category_id',
    'license_type', v_app.license_type,
    'lifecycle_key', 'applicant',
    'application_type', COALESCE(v_app.data->>'application_type','pre_license')));

  IF NOT (v_res->>'resolved')::boolean THEN
    RETURN jsonb_build_object('success',false,'code','NO_APPLICABLE_PACKAGE','application_id',_application_id);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_res->'items') LOOP
    IF NULLIF(v_item->>'form_version_id','') IS NULL THEN
      v_missing := v_missing + 1;  -- never pin an unpublished form
      CONTINUE;
    END IF;
    INSERT INTO public.application_form_requirements
      (application_id, template_id, form_version_id, package_id, applicability_rule_id, is_required, sequence)
    VALUES (_application_id, (v_item->>'template_id')::uuid, (v_item->>'form_version_id')::uuid,
            (v_res->>'package_id')::uuid, (v_res->>'applicability_rule_id')::uuid,
            COALESCE((v_item->>'is_required')::boolean,true), COALESCE((v_item->>'sequence')::int,0))
    ON CONFLICT (application_id, template_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.create_audit_log(auth.uid(),'form.applicability.changed','application',_application_id::text,NULL,
    jsonb_build_object('package_id', v_res->>'package_id','pinned', v_count,'skipped_unpublished', v_missing), NULL);
  RETURN jsonb_build_object('success',true,'application_id',_application_id,'pinned',v_count,
    'skipped_unpublished',v_missing,'package_id',v_res->>'package_id');
END $$;
GRANT EXECUTE ON FUNCTION public.application_pin_form_requirements(uuid) TO authenticated, service_role;
