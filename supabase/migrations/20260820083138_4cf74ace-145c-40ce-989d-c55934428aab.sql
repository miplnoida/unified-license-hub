
-- ============ 29/30/31/32/59. ENTITY CHANGE SETS ============
CREATE OR REPLACE FUNCTION public.entity_change_set_create(
  _entity_id uuid, _items jsonb, _origin_type text DEFAULT 'FORM_SUBMISSION',
  _summary text DEFAULT NULL, _effective_date date DEFAULT NULL,
  _source_submission_id uuid DEFAULT NULL, _source_form_version_id uuid DEFAULT NULL,
  _application_id uuid DEFAULT NULL, _regulatory_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cs record; v_item jsonb; v_seq int := 0; v_baseline int;
BEGIN
  PERFORM public.wb_require('entity_structure','propose', _entity_id, 'submit_structural_form');
  SELECT structure_version INTO v_baseline FROM public.licensees WHERE id = _entity_id;
  IF v_baseline IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;

  INSERT INTO public.entity_change_sets (entity_id, origin_type, application_id, regulatory_request_id,
    source_submission_id, source_form_version_id, summary, effective_date, baseline_version, created_by,
    status)
  VALUES (_entity_id, _origin_type, _application_id, _regulatory_request_id, _source_submission_id,
    _source_form_version_id, _summary, _effective_date, v_baseline, auth.uid(), 'DRAFT')
  RETURNING * INTO v_cs;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) LOOP
    v_seq := v_seq + 1;
    INSERT INTO public.entity_change_items (change_set_id, change_type, operation, data_concept_id,
      target_table, target_record_id, current_value, proposed_value, effective_from, effective_to,
      source_submission_id, form_field_definition_id, sequence)
    VALUES (v_cs.id, v_item->>'change_type', COALESCE(v_item->>'operation','UPSERT'),
      NULLIF(v_item->>'data_concept_id','')::uuid, v_item->>'target_table',
      NULLIF(v_item->>'target_record_id','')::uuid, v_item->'current_value',
      COALESCE(v_item->'proposed_value','{}'::jsonb),
      NULLIF(v_item->>'effective_from','')::timestamptz, NULLIF(v_item->>'effective_to','')::timestamptz,
      _source_submission_id, NULLIF(v_item->>'form_field_definition_id','')::uuid, v_seq);
  END LOOP;

  PERFORM public.create_audit_log(auth.uid(),'entity.change_set.created','entity_change_set',v_cs.id::text,NULL,
    jsonb_build_object('entity_id',_entity_id,'items',v_seq,'origin',_origin_type),NULL);
  RETURN jsonb_build_object('success',true,'change_set_id',v_cs.id,'items',v_seq);
END $$;

CREATE OR REPLACE FUNCTION public.entity_change_set_transition(
  _change_set_id uuid, _action text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cs record;
BEGIN
  SELECT * INTO v_cs FROM public.entity_change_sets WHERE id = _change_set_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change set not found'; END IF;

  IF _action = 'submit' THEN
    PERFORM public.wb_require('entity_structure','propose', v_cs.entity_id, 'submit_structural_form');
    IF v_cs.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only draft change sets can be submitted'; END IF;
    UPDATE public.entity_change_sets SET status='SUBMITTED', submitted_by=auth.uid(), submitted_at=now(),
      updated_at=now() WHERE id=_change_set_id;

  ELSIF _action = 'review' THEN
    PERFORM public.wb_require('entity_structure','review');
    UPDATE public.entity_change_sets SET status='RECOMMENDED', reviewed_by=auth.uid(), reviewed_at=now(),
      review_notes=_notes, updated_at=now() WHERE id=_change_set_id AND status IN ('SUBMITTED','UNDER_REVIEW');

  ELSIF _action = 'approve' THEN
    PERFORM public.wb_require('entity_structure','approve');
    IF v_cs.status NOT IN ('SUBMITTED','UNDER_REVIEW','RECOMMENDED') THEN
      RAISE EXCEPTION 'Change set cannot be approved from status %', v_cs.status;
    END IF;
    UPDATE public.entity_change_sets SET status='APPROVED', approved_by=auth.uid(), approved_at=now(),
      updated_at=now() WHERE id=_change_set_id;
    PERFORM public.create_audit_log(auth.uid(),'entity.change_set.approved','entity_change_set',
      _change_set_id::text,NULL,jsonb_build_object('entity_id',v_cs.entity_id),NULL);

  ELSIF _action = 'reject' THEN
    PERFORM public.wb_require('entity_structure','approve');
    UPDATE public.entity_change_sets SET status='REJECTED', rejected_by=auth.uid(), rejected_at=now(),
      rejection_reason=_notes, updated_at=now() WHERE id=_change_set_id;
    PERFORM public.create_audit_log(auth.uid(),'entity.change_set.rejected','entity_change_set',
      _change_set_id::text,NULL,jsonb_build_object('reason',_notes),NULL);
  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  RETURN jsonb_build_object('success',true,'change_set_id',_change_set_id,'action',_action);
END $$;

CREATE OR REPLACE FUNCTION public.apply_entity_change_set(_change_set_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cs record; v_ent record; v_it record; v_applied int := 0; v_skipped int := 0;
  v_eff timestamptz; v_pv jsonb; v_new_id uuid; v_rt uuid; v_party uuid;
BEGIN
  PERFORM public.wb_require('entity_structure','apply');

  SELECT * INTO v_cs FROM public.entity_change_sets WHERE id = _change_set_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change set not found'; END IF;
  IF v_cs.status = 'APPLIED' THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'change_set_id',_change_set_id);
  END IF;
  IF v_cs.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Only approved change sets can be applied (status %)', v_cs.status;
  END IF;

  -- lock canonical entity + concurrency check
  SELECT * INTO v_ent FROM public.licensees WHERE id = v_cs.entity_id FOR UPDATE;
  IF v_ent.structure_version <> v_cs.baseline_version THEN
    RAISE EXCEPTION 'Stale change set: entity structure changed since proposal (baseline %, current %)',
      v_cs.baseline_version, v_ent.structure_version;
  END IF;

  v_eff := COALESCE(v_cs.effective_date::timestamptz, now());

  FOR v_it IN SELECT * FROM public.entity_change_items WHERE change_set_id = _change_set_id ORDER BY sequence LOOP
    v_pv := COALESCE(v_it.proposed_value,'{}'::jsonb);
    v_new_id := NULL;
    BEGIN
      IF v_it.change_type = 'ENTITY_FACT' OR v_it.change_type = 'CLASSIFICATION' THEN
        UPDATE public.entity_facts
           SET valid_to = COALESCE(v_it.effective_from, v_eff), superseded_at = now(),
               approval_status = 'SUPERSEDED'
         WHERE entity_id = v_cs.entity_id AND data_concept_id = v_it.data_concept_id
           AND valid_to IS NULL;
        INSERT INTO public.entity_facts (entity_id, data_concept_id, value_text, value_number, value_date,
          value_boolean, value_uuid, value_json, valid_from, source_submission_id, source_form_version_id,
          source_change_set_id, verified_by, verified_at, approval_status)
        VALUES (v_cs.entity_id, v_it.data_concept_id, v_pv->>'value_text',
          NULLIF(v_pv->>'value_number','')::numeric, NULLIF(v_pv->>'value_date','')::date,
          NULLIF(v_pv->>'value_boolean','')::boolean, NULLIF(v_pv->>'value_uuid','')::uuid, v_pv->'value_json',
          COALESCE(v_it.effective_from, v_eff), v_cs.source_submission_id, v_cs.source_form_version_id,
          _change_set_id, auth.uid(), now(), 'APPROVED')
        RETURNING id INTO v_new_id;

      ELSIF v_it.change_type = 'ORGANIZATION_NAME' THEN
        UPDATE public.organization_names
           SET effective_to = COALESCE(v_it.effective_from, v_eff), is_current = false,
               name_type = CASE WHEN name_type = 'LEGAL' THEN 'FORMER_LEGAL' ELSE name_type END
         WHERE party_id = v_ent.party_id AND is_current
           AND name_type = COALESCE(v_pv->>'name_type','LEGAL');
        INSERT INTO public.organization_names (party_id, name_type, name, effective_from, is_current,
          source_submission_id, source_change_set_id)
        VALUES (v_ent.party_id, COALESCE(v_pv->>'name_type','LEGAL'), v_pv->>'name',
          COALESCE(v_it.effective_from, v_eff), true, v_cs.source_submission_id, _change_set_id)
        RETURNING id INTO v_new_id;
        IF COALESCE(v_pv->>'name_type','LEGAL') = 'LEGAL' THEN
          UPDATE public.organizations SET legal_name = v_pv->>'name', updated_at = now()
           WHERE party_id = v_ent.party_id;
          UPDATE public.licensees SET name = v_pv->>'name', updated_at = now() WHERE id = v_cs.entity_id;
          PERFORM public.create_audit_log(auth.uid(),'entity.name.changed','licensee',v_cs.entity_id::text,
            jsonb_build_object('name', v_ent.name), jsonb_build_object('name', v_pv->>'name'), NULL);
        END IF;

      ELSIF v_it.change_type = 'OWNERSHIP' THEN
        IF v_it.operation = 'CLOSE' THEN
          UPDATE public.ownership_interests
             SET effective_to = COALESCE(v_it.effective_from, v_eff), superseded_at = now(),
                 approval_status = 'SUPERSEDED', source_change_set_id = _change_set_id
           WHERE id = v_it.target_record_id AND effective_to IS NULL
          RETURNING id INTO v_new_id;
        ELSE
          v_party := NULLIF(v_pv->>'owner_party_id','')::uuid;
          IF v_party IS NULL THEN RAISE EXCEPTION 'owner_party_id required for ownership change'; END IF;
          UPDATE public.ownership_interests
             SET effective_to = COALESCE(v_it.effective_from, v_eff), superseded_at = now(),
                 approval_status = 'SUPERSEDED'
           WHERE owned_entity_id = v_cs.entity_id AND owner_party_id = v_party
             AND effective_to IS NULL
             AND COALESCE(ownership_type_id::text,'') = COALESCE(NULLIF(v_pv->>'ownership_type_id','')::text,COALESCE(ownership_type_id::text,''))
             AND COALESCE(share_class_id::text,'') = COALESCE(NULLIF(v_pv->>'share_class_id','')::text,COALESCE(share_class_id::text,''));
          INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, ownership_type_id,
            share_class_id, shares_held, total_shares, economic_interest_percentage, voting_rights_percentage,
            beneficial_interest_percentage, is_direct, is_controller, is_ubo, control_determination,
            effective_from, approval_status, approved_by, approved_at, source_submission_id,
            source_form_version_id, source_change_set_id)
          VALUES (v_party, v_cs.entity_id, NULLIF(v_pv->>'ownership_type_id','')::uuid,
            NULLIF(v_pv->>'share_class_id','')::uuid, NULLIF(v_pv->>'shares_held','')::numeric,
            NULLIF(v_pv->>'total_shares','')::numeric, NULLIF(v_pv->>'economic_interest_percentage','')::numeric,
            NULLIF(v_pv->>'voting_rights_percentage','')::numeric,
            NULLIF(v_pv->>'beneficial_interest_percentage','')::numeric,
            COALESCE((v_pv->>'is_direct')::boolean,true), COALESCE((v_pv->>'is_controller')::boolean,false),
            COALESCE((v_pv->>'is_ubo')::boolean,false),
            CASE WHEN COALESCE((v_pv->>'is_controller')::boolean,false) OR COALESCE((v_pv->>'is_ubo')::boolean,false)
                 THEN 'VERIFIED' ELSE 'NOT_ASSESSED' END,
            COALESCE(v_it.effective_from, v_eff), 'APPROVED', auth.uid(), now(), v_cs.source_submission_id,
            v_cs.source_form_version_id, _change_set_id)
          RETURNING id INTO v_new_id;
        END IF;
        PERFORM public.create_audit_log(auth.uid(),'entity.ownership.changed','licensee',v_cs.entity_id::text,
          v_it.current_value, v_pv, jsonb_build_object('change_set_id',_change_set_id));

      ELSIF v_it.change_type = 'APPOINTMENT' THEN
        IF v_it.operation = 'CLOSE' THEN
          UPDATE public.entity_appointments
             SET effective_to = COALESCE(v_it.effective_from, v_eff), status='ENDED',
                 superseded_at = now(), source_change_set_id = _change_set_id
           WHERE id = v_it.target_record_id AND effective_to IS NULL
          RETURNING id INTO v_new_id;
        ELSE
          v_party := NULLIF(v_pv->>'person_party_id','')::uuid;
          SELECT id INTO v_rt FROM public.role_types
           WHERE id = NULLIF(v_pv->>'role_type_id','')::uuid
              OR key = NULLIF(v_pv->>'role_type_key','') LIMIT 1;
          IF v_party IS NULL OR v_rt IS NULL THEN
            RAISE EXCEPTION 'person_party_id and a configured role type are required for an appointment';
          END IF;
          INSERT INTO public.entity_appointments (entity_id, person_party_id, role_type_id, appointment_date,
            effective_from, is_executive, status, regulatory_approval_status, fp_individual_id,
            source_submission_id, source_form_version_id, source_change_set_id)
          VALUES (v_cs.entity_id, v_party, v_rt, NULLIF(v_pv->>'appointment_date','')::date,
            COALESCE(v_it.effective_from, v_eff), NULLIF(v_pv->>'is_executive','')::boolean, 'ACTIVE',
            CASE WHEN (SELECT requires_fit_and_proper FROM public.role_types WHERE id = v_rt)
                 THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
            NULLIF(v_pv->>'fp_individual_id','')::uuid, v_cs.source_submission_id,
            v_cs.source_form_version_id, _change_set_id)
          RETURNING id INTO v_new_id;
        END IF;
        PERFORM public.create_audit_log(auth.uid(),'entity.appointment.changed','licensee',v_cs.entity_id::text,
          v_it.current_value, v_pv, jsonb_build_object('change_set_id',_change_set_id));

      ELSIF v_it.change_type = 'RELATIONSHIP' THEN
        IF v_it.operation = 'CLOSE' THEN
          UPDATE public.party_relationships
             SET effective_to = COALESCE(v_it.effective_from, v_eff), status='ENDED',
                 superseded_at = now(), source_change_set_id = _change_set_id
           WHERE id = v_it.target_record_id AND effective_to IS NULL
          RETURNING id INTO v_new_id;
        ELSE
          SELECT id INTO v_rt FROM public.relationship_types
           WHERE id = NULLIF(v_pv->>'relationship_type_id','')::uuid
              OR key = NULLIF(v_pv->>'relationship_type_key','') LIMIT 1;
          IF v_rt IS NULL THEN RAISE EXCEPTION 'A configured relationship type is required'; END IF;
          INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id,
            entity_id, effective_from, status, notes, source_submission_id, source_form_version_id,
            source_change_set_id)
          VALUES (COALESCE(NULLIF(v_pv->>'source_party_id','')::uuid, v_ent.party_id),
            NULLIF(v_pv->>'target_party_id','')::uuid, v_rt, v_cs.entity_id,
            COALESCE(v_it.effective_from, v_eff), 'ACTIVE', v_pv->>'notes',
            v_cs.source_submission_id, v_cs.source_form_version_id, _change_set_id)
          RETURNING id INTO v_new_id;
        END IF;
        PERFORM public.create_audit_log(auth.uid(),'entity.relationship.changed','licensee',v_cs.entity_id::text,
          v_it.current_value, v_pv, jsonb_build_object('change_set_id',_change_set_id));
      ELSE
        RAISE EXCEPTION 'Unsupported change type %', v_it.change_type;
      END IF;

      UPDATE public.entity_change_items SET apply_status='APPLIED', applied_record_id=v_new_id
       WHERE id = v_it.id;
      v_applied := v_applied + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.entity_change_items SET apply_status='FAILED', apply_error=SQLERRM WHERE id = v_it.id;
      RAISE;
    END;
  END LOOP;

  UPDATE public.licensees SET structure_version = structure_version + 1, updated_at = now()
   WHERE id = v_cs.entity_id;
  UPDATE public.entity_change_sets SET status='APPLIED', applied_by=auth.uid(), applied_at=now(),
    updated_at=now() WHERE id = _change_set_id;

  PERFORM public.create_audit_log(auth.uid(),'entity.change_set.applied','entity_change_set',
    _change_set_id::text, NULL,
    jsonb_build_object('entity_id',v_cs.entity_id,'applied',v_applied,'skipped',v_skipped), NULL);

  RETURN jsonb_build_object('success',true,'change_set_id',_change_set_id,'applied',v_applied);
END $$;

-- ============ 34-37. REGULATORY REQUESTS ============
CREATE OR REPLACE FUNCTION public.regulatory_request_start(
  _entity_id uuid, _request_type_key text, _effective_date date DEFAULT NULL, _summary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_type record; v_req record; v_res jsonb; v_item jsonb; v_pinned int := 0; v_missing int := 0;
BEGIN
  SELECT * INTO v_type FROM public.regulatory_request_types
   WHERE key = _request_type_key AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive request type %', _request_type_key; END IF;

  PERFORM public.wb_require('regulatory_requests','create', _entity_id,
    COALESCE(v_type.min_membership_capability,'start_regulatory_request'));

  INSERT INTO public.regulatory_requests (entity_id, request_type_id, status, effective_date, summary, created_by)
  VALUES (_entity_id, v_type.id, 'DRAFT', _effective_date, _summary, auth.uid())
  RETURNING * INTO v_req;

  v_res := public.resolve_applicable_form_package(jsonb_build_object(
    'request_type_key', _request_type_key,
    'lifecycle_key', 'authorised',
    'regulator_id', (SELECT regulator_id::text FROM public.licensees WHERE id = _entity_id),
    'sector_id', (SELECT sector_id::text FROM public.licensees WHERE id = _entity_id),
    'sub_sector_id', (SELECT sub_sector_id::text FROM public.licensees WHERE id = _entity_id),
    'category_id', (SELECT category_id::text FROM public.licensees WHERE id = _entity_id)));

  IF (v_res->>'resolved')::boolean THEN
    UPDATE public.regulatory_requests SET package_id = (v_res->>'package_id')::uuid WHERE id = v_req.id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_res->'items') LOOP
      IF NULLIF(v_item->>'form_version_id','') IS NULL THEN v_missing := v_missing + 1; CONTINUE; END IF;
      INSERT INTO public.regulatory_request_form_requirements
        (request_id, template_id, form_version_id, package_id, is_required, sequence)
      VALUES (v_req.id, (v_item->>'template_id')::uuid, (v_item->>'form_version_id')::uuid,
              (v_res->>'package_id')::uuid, COALESCE((v_item->>'is_required')::boolean,true),
              COALESCE((v_item->>'sequence')::int,0))
      ON CONFLICT (request_id, template_id) DO NOTHING;
      v_pinned := v_pinned + 1;
    END LOOP;
  END IF;

  PERFORM public.create_audit_log(auth.uid(),'regulatory_request.created','regulatory_request',
    v_req.id::text, NULL, jsonb_build_object('entity_id',_entity_id,'type',_request_type_key,
    'pinned_forms',v_pinned,'skipped_unpublished',v_missing), NULL);

  RETURN jsonb_build_object('success',true,'request_id',v_req.id,'request_number',v_req.request_number,
    'pinned_forms',v_pinned,'skipped_unpublished',v_missing,'package_resolved',(v_res->>'resolved')::boolean);
END $$;

CREATE OR REPLACE FUNCTION public.regulatory_request_transition(
  _request_id uuid, _action text, _notes text DEFAULT NULL, _assignee uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_req record; v_evt text;
BEGIN
  SELECT * INTO v_req FROM public.regulatory_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Regulatory request not found'; END IF;

  IF _action = 'submit' THEN
    PERFORM public.wb_require('regulatory_requests','create', v_req.entity_id, 'start_regulatory_request');
    IF v_req.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only draft requests can be submitted'; END IF;
    UPDATE public.regulatory_requests SET status='SUBMITTED', submitted_by=auth.uid(), submitted_at=now(),
      updated_at=now() WHERE id=_request_id;
    v_evt := 'regulatory_request.submitted';
  ELSIF _action = 'assign' THEN
    PERFORM public.wb_require('regulatory_requests','assign');
    UPDATE public.regulatory_requests SET assigned_to=_assignee, assigned_by=auth.uid(), assigned_at=now(),
      status = CASE WHEN status='SUBMITTED' THEN 'UNDER_REVIEW' ELSE status END, updated_at=now()
     WHERE id=_request_id;
    v_evt := NULL;
  ELSIF _action = 'review' THEN
    PERFORM public.wb_require('regulatory_requests','review');
    UPDATE public.regulatory_requests SET status='UNDER_REVIEW', updated_at=now() WHERE id=_request_id;
    v_evt := NULL;
  ELSIF _action = 'approve' THEN
    PERFORM public.wb_require('regulatory_requests','approve');
    UPDATE public.regulatory_requests SET status='APPROVED', decided_by=auth.uid(), decided_at=now(),
      decision_rationale=_notes, updated_at=now() WHERE id=_request_id;
    v_evt := 'regulatory_request.approved';
  ELSIF _action = 'reject' THEN
    PERFORM public.wb_require('regulatory_requests','reject');
    UPDATE public.regulatory_requests SET status='REJECTED', decided_by=auth.uid(), decided_at=now(),
      decision_rationale=_notes, updated_at=now() WHERE id=_request_id;
    v_evt := 'regulatory_request.rejected';
  ELSIF _action = 'close' THEN
    PERFORM public.wb_require('regulatory_requests','close');
    UPDATE public.regulatory_requests SET status='CLOSED', closed_by=auth.uid(), closed_at=now(),
      updated_at=now() WHERE id=_request_id;
    v_evt := 'regulatory_request.closed';
  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  IF v_evt IS NOT NULL THEN
    PERFORM public.create_audit_log(auth.uid(), v_evt, 'regulatory_request', _request_id::text, NULL,
      jsonb_build_object('entity_id',v_req.entity_id,'notes',_notes), NULL);
  END IF;
  RETURN jsonb_build_object('success',true,'request_id',_request_id,'action',_action);
END $$;

CREATE OR REPLACE FUNCTION public.regulatory_request_available_types(_entity_id uuid)
RETURNS TABLE(key text, label text, description text, requires_change_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.key, t.label, t.description, t.requires_change_set
    FROM public.regulatory_request_types t
   WHERE t.is_active
     AND (public.has_permission(auth.uid(),'regulatory_requests','create')
          OR (t.external_startable
              AND public.wb_membership_capability(_entity_id, COALESCE(t.min_membership_capability,'start_regulatory_request'))))
   ORDER BY t.sort_order, t.label;
$$;
GRANT EXECUTE ON FUNCTION public.regulatory_request_available_types(uuid) TO authenticated, service_role;

-- ============ 20. DETERMINISTIC PERSON LINKING ============
CREATE OR REPLACE FUNCTION public.fp_link_persons_deterministic()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_i record; v_party uuid; v_linked int := 0; v_ambiguous int := 0; v_method text;
BEGIN
  PERFORM public.wb_require('fit_and_proper','edit');
  FOR v_i IN SELECT * FROM public.fp_individuals f
              WHERE NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links l WHERE l.fp_individual_id = f.id)
  LOOP
    v_party := NULL; v_method := NULL;
    -- only exact identity-document / user-account matches are deterministic
    IF COALESCE(v_i.national_id,'') <> '' THEN
      SELECT p.id INTO v_party FROM public.parties p JOIN public.persons pe ON pe.party_id = p.id
        JOIN public.entity_identifiers ei ON ei.party_id = p.id
       WHERE ei.normalized_value = upper(regexp_replace(v_i.national_id,'[^A-Za-z0-9]','','g')) LIMIT 1;
      IF v_party IS NOT NULL THEN v_method := 'NATIONAL_ID'; END IF;
    END IF;
    IF v_party IS NULL THEN
      -- unresolved people are reported, never guessed
      v_ambiguous := v_ambiguous + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.fp_individual_party_links (fp_individual_id, person_party_id, match_method, linked_by)
    VALUES (v_i.id, v_party, v_method, auth.uid())
    ON CONFLICT (fp_individual_id) DO NOTHING;
    v_linked := v_linked + 1;
  END LOOP;
  RETURN jsonb_build_object('linked',v_linked,'unresolved',v_ambiguous);
END $$;

CREATE OR REPLACE FUNCTION public.person_upsert_for_appointment(_full_name text, _fp_individual_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_party uuid;
BEGIN
  PERFORM public.wb_require('entity_structure','propose');
  IF COALESCE(trim(_full_name),'') = '' THEN RAISE EXCEPTION 'Person name is required'; END IF;

  IF _fp_individual_id IS NOT NULL THEN
    SELECT person_party_id INTO v_party FROM public.fp_individual_party_links
     WHERE fp_individual_id = _fp_individual_id;
  END IF;

  IF v_party IS NULL THEN
    INSERT INTO public.parties (party_kind, display_name) VALUES ('PERSON', trim(_full_name))
    RETURNING id INTO v_party;
    INSERT INTO public.persons (party_id, full_name) VALUES (v_party, trim(_full_name))
    ON CONFLICT (party_id) DO NOTHING;
    IF _fp_individual_id IS NOT NULL THEN
      INSERT INTO public.fp_individual_party_links (fp_individual_id, person_party_id, match_method, match_confidence, linked_by)
      VALUES (_fp_individual_id, v_party, 'MANUAL', 'MANUAL', auth.uid())
      ON CONFLICT (fp_individual_id) DO NOTHING;
    END IF;
  END IF;
  RETURN jsonb_build_object('person_party_id', v_party);
END $$;

-- ============ 60. INTEGRITY REPORT ============
CREATE OR REPLACE FUNCTION public.wave_b_integrity_report()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'forms_without_purpose', (SELECT count(*) FROM public.form_templates WHERE form_purpose_id IS NULL),
    'forms_without_lifecycle', (SELECT count(*) FROM public.form_templates t
        WHERE NOT EXISTS (SELECT 1 FROM public.form_lifecycle_applicability l WHERE l.template_id = t.id)),
    'forms_without_domain', (SELECT count(*) FROM public.form_templates t
        WHERE NOT EXISTS (SELECT 1 FROM public.form_data_domains d WHERE d.template_id = t.id)),
    'legacy_mapping', (SELECT jsonb_object_agg(legacy_mapping_status, c) FROM
        (SELECT legacy_mapping_status, count(*) c FROM public.form_templates GROUP BY 1) s),
    'unmapped_logical_fields', (SELECT count(*) FROM public.form_fields WHERE form_field_definition_id IS NULL),
    'field_definitions_without_concept', (SELECT count(*) FROM public.form_field_definitions WHERE data_concept_id IS NULL),
    'duplicate_field_names_in_version', (SELECT count(*) FROM
        (SELECT version_id, field_name FROM public.form_fields WHERE field_name IS NOT NULL
          GROUP BY 1,2 HAVING count(*) > 1) d),
    'submissions_without_version', (SELECT count(*) FROM public.form_responses WHERE version_id IS NULL),
    'applications_without_pinned_version', (SELECT count(*) FROM public.applications a
        WHERE a.submitted_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.application_form_requirements r WHERE r.application_id = a.id)),
    'requirements_without_version', (SELECT count(*) FROM public.application_form_requirements WHERE form_version_id IS NULL),
    'packages_with_unpublished_forms', (SELECT count(DISTINCT i.package_id) FROM public.form_package_items i
        WHERE NOT EXISTS (SELECT 1 FROM public.form_versions v
                           WHERE v.template_id = i.template_id AND v.status = 'published')),
    'packages_without_applicability', (SELECT count(*) FROM public.form_packages p
        WHERE NOT EXISTS (SELECT 1 FROM public.form_applicability_rules r WHERE r.package_id = p.id)),
    'ownership_via_generic_relationships', (SELECT count(*) FROM public.entity_relationships
        WHERE COALESCE(ownership_percentage,0) > 0),
    'ownership_interests_current', (SELECT count(*) FROM public.ownership_interests WHERE effective_to IS NULL),
    'appointments_current', (SELECT count(*) FROM public.entity_appointments WHERE effective_to IS NULL),
    'fp_individuals_unlinked', (SELECT count(*) FROM public.fp_individuals f
        WHERE NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links l WHERE l.fp_individual_id = f.id)),
    'change_sets_stale_pending', (SELECT count(*) FROM public.entity_change_sets cs
        JOIN public.licensees l ON l.id = cs.entity_id
       WHERE cs.status IN ('SUBMITTED','UNDER_REVIEW','RECOMMENDED','APPROVED')
         AND cs.baseline_version <> l.structure_version),
    'concepts_without_domain', (SELECT count(*) FROM public.data_concepts WHERE data_domain_id IS NULL)
  );
$$;
GRANT EXECUTE ON FUNCTION public.wave_b_integrity_report() TO authenticated, service_role;
