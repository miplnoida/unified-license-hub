CREATE OR REPLACE FUNCTION public.apply_entity_change_set(_change_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           WHERE owned_party_id = COALESCE(NULLIF(v_pv->>'owned_party_id','')::uuid, v_ent.party_id)
             AND owner_party_id = v_party
             AND effective_to IS NULL
             AND COALESCE(ownership_type_id::text,'') = COALESCE(NULLIF(v_pv->>'ownership_type_id','')::text,COALESCE(ownership_type_id::text,''))
             AND COALESCE(share_class_id::text,'') = COALESCE(NULLIF(v_pv->>'share_class_id','')::text,COALESCE(share_class_id::text,''));
          INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
            share_class_id, shares_held, total_shares, economic_interest_percentage, voting_rights_percentage,
            beneficial_interest_percentage, is_direct, is_controller, is_ubo, control_determination,
            effective_from, approval_status, approved_by, approved_at, source_submission_id,
            source_form_version_id, source_change_set_id)
          VALUES (v_party,
            COALESCE(NULLIF(v_pv->>'owned_party_id','')::uuid, v_ent.party_id),
            NULLIF(v_pv->>'ownership_type_id','')::uuid,
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
END $function$;