-- =====================================================================
-- F5-B5X part 2: licence variation / voluntary surrender effects and a
-- fee-aware post-licensing submission boundary.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.post_license_effect_plan(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app        public.applications;
  v_license_id uuid;
  v_service_id uuid;
  v_applicability text;
  v_svc        public.services;
  v_lic        public.licenses;
  v_key        text;
  v_map        public.post_license_effect_map;
  v_items      jsonb := '[]'::jsonb;
  v_blockers   jsonb := '[]'::jsonb;
  v_state      text;
  v_fp_req     boolean := false;
  v_fp_ok      boolean := false;
  v_existing   public.post_license_effects;
  v_actor      uuid := public.workflow_effect_actor();
  v_est_in     jsonb := '{}'::jsonb;
  v_est        public.regulated_establishments;
  v_est_code   text;
  v_fp         jsonb;
  v_fp_code    text;
  v_lc_in      jsonb := '{}'::jsonb;
  v_lc_cfg     jsonb;
  v_open_matters int := 0;
  v_uid        uuid := auth.uid();
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('state','FAIL_CLOSED','code','APPLICATION_NOT_FOUND',
                              'is_post_license', false, 'blockers',
                              jsonb_build_array(jsonb_build_object('code','APPLICATION_NOT_FOUND')));
  END IF;

  v_license_id := NULLIF(v_app.data->>'license_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;

  v_applicability := public.post_license_service_applicability(v_service_id, v_license_id);
  IF v_applicability <> 'OK' THEN
    RETURN jsonb_build_object(
      'application_id', _application_id,
      'is_post_license', false,
      'state','NOT_POST_LICENSE',
      'code', v_applicability,
      'blockers','[]'::jsonb);
  END IF;

  SELECT * INTO v_svc FROM public.services  WHERE id = v_service_id;
  SELECT * INTO v_lic FROM public.licenses  WHERE id = v_license_id;
  v_fp_req := COALESCE(v_svc.requires_fit_and_proper, false);

  v_key := public.post_license_effect_key(v_service_id);
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_map FROM public.post_license_effect_map WHERE service_code = v_key;
  END IF;

  SELECT * INTO v_existing FROM public.post_license_effects WHERE application_id = _application_id;

  IF v_key IS NULL OR v_map.id IS NULL THEN
    RETURN jsonb_build_object(
      'application_id', _application_id,
      'license_id', v_license_id,
      'service_id', v_service_id,
      'service_code', v_key,
      'entity_id', v_lic.holder_id,
      'is_post_license', true,
      'effect_kind','UNKNOWN',
      'canonical_target', NULL,
      'handler', NULL,
      'fp_required', v_fp_req,
      'state','FAIL_CLOSED',
      'code','EFFECT_MAPPING_MISSING',
      'blockers', jsonb_build_array(jsonb_build_object(
        'code','EFFECT_MAPPING_MISSING',
        'label','No governed post-approval effect is mapped for this service',
        'detail', COALESCE(v_key, 'service has no canonical code, no explicit binding and is not a renewal service'))));
  END IF;

  IF NOT v_map.is_supported THEN
    RETURN jsonb_build_object(
      'application_id', _application_id,
      'license_id', v_license_id,
      'service_id', v_service_id,
      'service_code', v_key,
      'entity_id', v_lic.holder_id,
      'is_post_license', true,
      'effect_kind', v_map.effect_kind,
      'canonical_target', v_map.canonical_target,
      'handler', v_map.handler,
      'fp_required', v_fp_req,
      'blocker_class', COALESCE(v_map.blocker_class,'BUSINESS_CONFIGURATION_REQUIRED'),
      'state', COALESCE(v_map.blocker_class,'BUSINESS_CONFIGURATION_REQUIRED'),
      'code', COALESCE(v_map.blocker_class,'BUSINESS_CONFIGURATION_REQUIRED'),
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', COALESCE(v_map.blocker_class,'BUSINESS_CONFIGURATION_REQUIRED'),
        'label', CASE WHEN v_map.blocker_class = 'PRODUCT_GAP'
                      THEN 'The canonical regulatory register required by this service does not exist'
                      ELSE 'No authoritative regulatory target is configured for this service' END,
        'detail', v_map.bcr_reason)));
  END IF;

  IF v_lic.holder_id IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','ENTITY_NOT_RESOLVED','label','The licence has no canonical holder entity');
  END IF;

  IF v_fp_req THEN
    v_fp := public.post_license_fp_readiness(_application_id);
    v_fp_ok := COALESCE((v_fp->>'satisfied')::boolean, false);
    IF NOT v_fp_ok THEN
      v_fp_code := COALESCE(v_fp->>'state','FP_DETERMINATION_REQUIRED');
      v_blockers := v_blockers || jsonb_build_object(
        'code', v_fp_code,
        'label', CASE v_fp_code
                   WHEN 'FP_SUBJECT_REQUIRED' THEN
                     'No canonical fit-and-proper subject was identified on this filing'
                   WHEN 'FP_SUBJECT_NOT_CANONICAL' THEN
                     'The person named on this filing is not a canonically identified fit-and-proper individual'
                   WHEN 'FP_LINK_REQUIRED' THEN
                     'One or more proposed subjects have no explicit fit-and-proper assessment linked to this filing'
                   ELSE
                     'A current positive fit-and-proper determination is required before this effect may apply'
                 END,
        'subject_count', v_fp->'subject_count',
        'linked_subjects', v_fp->'linked_subjects',
        'positive_count', v_fp->'positive_count',
        'phase','F5-B4');
    END IF;
  END IF;

  IF v_map.effect_kind = 'ENTITY_CHANGE' THEN
    v_items := public.post_license_change_items(_application_id);
    IF jsonb_array_length(v_items) = 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','ENTITY_CHANGE_INPUT_MISSING',
        'label','No normalized data-concept values were submitted, so no governed change set can be derived');
    END IF;
    IF NOT public.has_permission(v_actor,'entity_structure','apply')
       OR NOT public.has_permission(v_actor,'entity_structure','approve') THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','ENTITY_STRUCTURE_AUTHORITY_MISSING',
        'label','The deciding officer lacks entity_structure approve/apply authority');
    END IF;
  END IF;

  IF v_map.effect_kind IN ('ESTABLISHMENT_OPEN','ESTABLISHMENT_CLOSE') THEN
    v_est_in := public.post_license_establishment_input(_application_id);
  END IF;

  IF v_map.effect_kind = 'ESTABLISHMENT_OPEN' THEN
    IF COALESCE(v_est_in->>'name','') = ''
       OR (COALESCE(v_est_in->>'address_text','') = '' AND (v_est_in->'address') IS NULL) THEN
      v_est_code := 'ESTABLISHMENT_DATA_REQUIRED';
      v_blockers := v_blockers || jsonb_build_object(
        'code', v_est_code,
        'label','Mandatory establishment data (name and location) was not captured by the configured form',
        'detail','required canonical concepts: ESTABLISHMENT.NAME, ESTABLISHMENT.ADDRESS');
    END IF;
  ELSIF v_map.effect_kind = 'ESTABLISHMENT_CLOSE' THEN
    IF (v_est_in->>'target_establishment_id') IS NULL THEN
      v_est_code := 'ESTABLISHMENT_TARGET_REQUIRED';
      v_blockers := v_blockers || jsonb_build_object(
        'code', v_est_code,
        'label','No canonical establishment was bound to this closure request');
    ELSE
      SELECT * INTO v_est FROM public.regulated_establishments
       WHERE id = (v_est_in->>'target_establishment_id')::uuid;
      IF v_est.id IS NULL
         OR v_est.entity_id IS DISTINCT FROM v_lic.holder_id
         OR (v_est.license_id IS NOT NULL AND v_est.license_id <> v_lic.id) THEN
        v_est_code := 'ESTABLISHMENT_NOT_APPLICABLE';
        v_blockers := v_blockers || jsonb_build_object(
          'code', v_est_code,
          'label','The selected establishment does not belong to this licence holder');
      ELSIF v_est.status <> 'ACTIVE' THEN
        v_est_code := 'ESTABLISHMENT_ALREADY_CLOSED';
        v_blockers := v_blockers || jsonb_build_object(
          'code', v_est_code,
          'label','The selected establishment is already closed');
      END IF;
    END IF;
  END IF;

  -- F5-B5X: governed licence lifecycle journeys (variation / voluntary
  -- surrender) executed through the certified lifecycle engine.
  IF v_map.effect_kind IN ('LICENCE_VARIATION','LICENCE_SURRENDER') THEN
    v_lc_in := public.post_license_lifecycle_input(_application_id);
    v_lc_cfg := public.license_lifecycle_config_resolve(
                  v_lic.id,
                  CASE WHEN v_map.effect_kind = 'LICENCE_VARIATION' THEN 'variation' ELSE 'surrender' END);

    SELECT count(*) INTO v_open_matters FROM public.license_lifecycle_matters m
     WHERE m.license_id = v_lic.id AND m.status = 'open';

    IF v_lic.status <> 'active' THEN
      v_est_code := 'LICENCE_NOT_ACTIVE';
      v_blockers := v_blockers || jsonb_build_object(
        'code','LICENCE_NOT_ACTIVE',
        'label','Only an active licence can be varied or surrendered',
        'detail','licence status = ' || COALESCE(v_lic.status,'null'));
    END IF;

    IF v_open_matters > 0 THEN
      v_est_code := COALESCE(v_est_code,'LICENCE_MATTER_IN_PROGRESS');
      v_blockers := v_blockers || jsonb_build_object(
        'code','LICENCE_MATTER_IN_PROGRESS',
        'label','Another licence lifecycle matter is already open for this licence',
        'open_matters', v_open_matters);
    END IF;

    IF jsonb_array_length(public.license_lifecycle_gates(v_lic.id, NULL)) > 0 THEN
      v_est_code := COALESCE(v_est_code,'LICENCE_LIFECYCLE_GATE_OPEN');
      v_blockers := v_blockers || jsonb_build_object(
        'code','LICENCE_LIFECYCLE_GATE_OPEN',
        'label','Outstanding blocking fees or incomplete verification prevent a lifecycle decision');
    END IF;

    IF v_map.effect_kind = 'LICENCE_VARIATION' THEN
      IF NOT (public.has_permission(v_actor,'license_management','workflow_action')
              AND public.has_permission(v_actor,'license_management','approve')
              AND (v_uid IS NULL OR (public.has_permission(v_uid,'license_management','workflow_action')
                                     AND public.has_permission(v_uid,'license_management','approve')))) THEN
        v_est_code := COALESCE(v_est_code,'LICENCE_LIFECYCLE_AUTHORITY_MISSING');
        v_blockers := v_blockers || jsonb_build_object(
          'code','LICENCE_LIFECYCLE_AUTHORITY_MISSING',
          'label','The deciding officer lacks licence_management workflow/approve authority');
      END IF;
      IF COALESCE(v_lc_in->>'variation_type','') = ''
         OR COALESCE(v_lc_in->>'variation_rationale','') = '' THEN
        v_est_code := COALESCE(v_est_code,'VARIATION_INPUT_REQUIRED');
        v_blockers := v_blockers || jsonb_build_object(
          'code','VARIATION_INPUT_REQUIRED',
          'label','The variation type and rationale were not captured by the configured form',
          'detail','required canonical concepts: LICENCE.VARIATION_TYPE, LICENCE.VARIATION_RATIONALE');
      END IF;
    ELSE
      IF NOT (public.has_permission(v_actor,'license_management','workflow_action')
              AND public.has_permission(v_actor,'license_management','manage_license_actions')
              AND (v_uid IS NULL OR (public.has_permission(v_uid,'license_management','workflow_action')
                                     AND public.has_permission(v_uid,'license_management','manage_license_actions')))) THEN
        v_est_code := COALESCE(v_est_code,'LICENCE_LIFECYCLE_AUTHORITY_MISSING');
        v_blockers := v_blockers || jsonb_build_object(
          'code','LICENCE_LIFECYCLE_AUTHORITY_MISSING',
          'label','The deciding officer lacks licence_management workflow/licence-action authority');
      END IF;
      IF COALESCE(v_lc_in->>'surrender_reason','') = ''
         OR (v_lc_in->>'surrender_effective_date') IS NULL THEN
        v_est_code := COALESCE(v_est_code,'SURRENDER_INPUT_REQUIRED');
        v_blockers := v_blockers || jsonb_build_object(
          'code','SURRENDER_INPUT_REQUIRED',
          'label','The surrender reason and effective date were not captured by the configured form',
          'detail','required canonical concepts: LICENCE.SURRENDER_REASON, LICENCE.SURRENDER_EFFECTIVE_DATE');
      END IF;
      IF COALESCE((v_lc_cfg->>'legal_basis_required')::boolean, true)
         AND COALESCE(v_lc_in->>'surrender_legal_basis','') = '' THEN
        v_est_code := COALESCE(v_est_code,'SURRENDER_LEGAL_BASIS_REQUIRED');
        v_blockers := v_blockers || jsonb_build_object(
          'code','SURRENDER_LEGAL_BASIS_REQUIRED',
          'label','Regulator policy requires a legal basis for accepting a surrender, and none was captured',
          'detail','required canonical concept: LICENCE.SURRENDER_LEGAL_BASIS');
      END IF;
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    v_state := 'APPLIED';
  ELSIF jsonb_array_length(v_blockers) > 0 THEN
    v_state := COALESCE(v_est_code, 'BLOCKED');
  ELSE
    v_state := 'READY';
  END IF;

  RETURN jsonb_build_object(
    'application_id', _application_id,
    'license_id', v_license_id,
    'service_id', v_service_id,
    'service_code', v_key,
    'service_name', v_svc.name,
    'entity_id', v_lic.holder_id,
    'is_post_license', true,
    'effect_kind', v_map.effect_kind,
    'canonical_target', v_map.canonical_target,
    'handler', v_map.handler,
    'fp_required', v_fp_req,
    'fp_satisfied', CASE WHEN v_fp_req THEN v_fp_ok ELSE NULL END,
    'fp_state', CASE WHEN v_fp_req THEN v_fp->>'state' ELSE NULL END,
    'fp_subject_count', CASE WHEN v_fp_req THEN v_fp->'subject_count' ELSE NULL END,
    'fp_link_count', CASE WHEN v_fp_req THEN v_fp->'link_count' ELSE NULL END,
    'change_items', jsonb_array_length(v_items),
    'establishment_input', CASE WHEN v_map.effect_kind IN ('ESTABLISHMENT_OPEN','ESTABLISHMENT_CLOSE')
                                THEN v_est_in ELSE NULL END,
    'lifecycle_input', CASE WHEN v_map.effect_kind IN ('LICENCE_VARIATION','LICENCE_SURRENDER')
                            THEN v_lc_in ELSE NULL END,
    'state', v_state,
    'code', CASE WHEN v_state NOT IN ('READY','APPLIED') THEN COALESCE(v_est_code, v_fp_code, v_blockers->0->>'code')
                 ELSE v_state END,
    'blockers', v_blockers);
END $function$;

CREATE OR REPLACE FUNCTION public.apply_post_license_effect(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app       public.applications;
  v_plan      jsonb;
  v_existing  public.post_license_effects;
  v_lic       public.licenses;
  v_kind      text;
  v_before    jsonb := '{}'::jsonb;
  v_after     jsonb := '{}'::jsonb;
  v_result    uuid;
  v_items     jsonb;
  v_cs        jsonb;
  v_cs_id     uuid;
  v_step      jsonb;
  v_actor     uuid := public.workflow_effect_actor();
  v_ack_ref   text;
  v_row       public.post_license_effects;
  v_est_in    jsonb;
  v_est       public.regulated_establishments;
  v_est_ref   text;
  v_event_id  uuid;
  v_lc_in     jsonb;
  v_matter_id uuid;
  v_matter    public.license_lifecycle_matters;
BEGIN
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') <> 'trusted' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'apply_post_license_effect is only callable from a governed final-decision context';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_app.status <> 'approved' THEN
    RAISE EXCEPTION 'EFFECT_REQUIRES_APPROVED_APPLICATION' USING ERRCODE = '22023',
      DETAIL = 'status=' || COALESCE(v_app.status,'null');
  END IF;

  SELECT * INTO v_existing FROM public.post_license_effects WHERE application_id = _application_id;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'effect_id', v_existing.id, 'effect_kind', v_existing.effect_kind,
      'state', v_existing.state, 'result_ref', v_existing.result_ref);
  END IF;

  v_plan := public.post_license_effect_plan(_application_id);

  IF NOT COALESCE((v_plan->>'is_post_license')::boolean, false) THEN
    RAISE EXCEPTION 'NOT_POST_LICENSE_APPLICATION' USING ERRCODE = '22023',
      DETAIL = COALESCE(v_plan->>'code','');
  END IF;

  IF v_plan->>'state' <> 'READY' THEN
    RAISE EXCEPTION 'POST_LICENSE_EFFECT_BLOCKED' USING ERRCODE = '22023',
      DETAIL = COALESCE(v_plan->>'code', v_plan->>'state');
  END IF;

  SELECT * INTO v_lic FROM public.licenses
   WHERE id = (v_plan->>'license_id')::uuid FOR UPDATE;

  v_kind := v_plan->>'effect_kind';

  PERFORM public.assert_post_license_fp_effect_alignment(_application_id);

  IF v_kind = 'RENEWAL' THEN
    v_before := jsonb_build_object(
      'valid_until', v_lic.valid_until,
      'current_term', (SELECT jsonb_build_object('id',t.id,'term_number',t.term_number,
                                                 'term_kind',t.term_kind,'effective_until',t.effective_until)
                         FROM public.license_terms t
                        WHERE t.license_id = v_lic.id AND t.is_current LIMIT 1));

    IF NOT EXISTS (SELECT 1 FROM public.license_renewals x
                    WHERE x.license_id = v_lic.id
                      AND x.status NOT IN ('approved','refused','withdrawn')) THEN
      PERFORM public.license_lifecycle_step(v_lic.id, 'START_RENEWAL', '{}'::jsonb,
        'Renewal opened by governed post-licensing application ' || v_app.application_number);
    END IF;

    v_step := public.license_lifecycle_step(v_lic.id, 'APPROVE_RENEWAL', '{}'::jsonb,
      'Renewal approved by governed post-licensing application ' || v_app.application_number);

    SELECT t.id INTO v_result FROM public.license_terms t
     WHERE t.license_id = v_lic.id AND t.is_current LIMIT 1;

    v_after := jsonb_build_object(
      'lifecycle_result', v_step,
      'valid_until', (SELECT l2.valid_until FROM public.licenses l2 WHERE l2.id = v_lic.id),
      'current_term', (SELECT jsonb_build_object('id',t.id,'term_number',t.term_number,
                                                 'term_kind',t.term_kind,'effective_until',t.effective_until,
                                                 'renewal_id',t.renewal_id)
                         FROM public.license_terms t
                        WHERE t.license_id = v_lic.id AND t.is_current LIMIT 1));

    IF (v_after->'current_term'->>'term_kind') IS DISTINCT FROM 'renewal' THEN
      RAISE EXCEPTION 'RENEWAL_EFFECT_INCOMPLETE' USING ERRCODE = '22023',
        DETAIL = 'no current renewal term exists after APPROVE_RENEWAL';
    END IF;

  ELSIF v_kind = 'LICENCE_VARIATION' THEN
    v_lc_in := public.post_license_lifecycle_input(_application_id);
    v_before := jsonb_build_object(
      'license_status', v_lic.status,
      'open_matters', (SELECT count(*) FROM public.license_lifecycle_matters m
                        WHERE m.license_id = v_lic.id AND m.status = 'open'),
      'input', v_lc_in);

    PERFORM public.license_lifecycle_step(v_lic.id, 'APPLY_VARIATION',
      jsonb_build_object(
        'title', 'Variation — ' || COALESCE(v_lc_in->>'variation_type','requested change'),
        'source_kind','entity_request',
        'source_id', _application_id::text,
        'source_reference', v_app.application_number),
      'Variation requested by governed post-licensing application ' || v_app.application_number);

    SELECT * INTO v_matter FROM public.license_lifecycle_matters m
     WHERE m.license_id = v_lic.id AND m.matter_kind = 'variation' AND m.status = 'open'
     ORDER BY m.opened_at DESC LIMIT 1;
    IF v_matter.id IS NULL THEN
      RAISE EXCEPTION 'VARIATION_EFFECT_INCOMPLETE' USING ERRCODE = '22023',
        DETAIL = 'no variation matter was opened';
    END IF;
    v_matter_id := v_matter.id;

    v_step := public.license_lifecycle_step(v_lic.id, 'APPROVE_VARIATION',
      jsonb_build_object('matter_id', v_matter_id::text),
      'Variation approved by governed post-licensing application ' || v_app.application_number);

    SELECT * INTO v_matter FROM public.license_lifecycle_matters WHERE id = v_matter_id;
    IF v_matter.status <> 'closed' OR COALESCE(v_matter.decision,'') <> 'APPROVED' THEN
      RAISE EXCEPTION 'VARIATION_EFFECT_INCOMPLETE' USING ERRCODE = '22023',
        DETAIL = 'variation matter was not closed as approved';
    END IF;

    v_result := v_matter_id;
    v_after := jsonb_build_object(
      'matter_id', v_matter_id,
      'matter_status', v_matter.status,
      'matter_decision', v_matter.decision,
      'lifecycle_result', v_step,
      'license_status', (SELECT l2.status FROM public.licenses l2 WHERE l2.id = v_lic.id));

  ELSIF v_kind = 'LICENCE_SURRENDER' THEN
    v_lc_in := public.post_license_lifecycle_input(_application_id);
    v_before := jsonb_build_object(
      'license_status', v_lic.status,
      'valid_until', v_lic.valid_until,
      'input', v_lc_in);

    PERFORM public.license_lifecycle_step(v_lic.id, 'BEGIN_SURRENDER',
      jsonb_build_object(
        'title','Voluntary surrender',
        'source_kind','entity_request',
        'source_reference', v_app.application_number,
        'source_id', _application_id::text,
        'effective_date', v_lc_in->>'surrender_effective_date',
        'legal_basis', v_lc_in->>'surrender_legal_basis'),
      COALESCE(v_lc_in->>'surrender_reason',
               'Voluntary surrender requested by application ' || v_app.application_number));

    SELECT * INTO v_matter FROM public.license_lifecycle_matters m
     WHERE m.license_id = v_lic.id AND m.matter_kind = 'surrender' AND m.status = 'open'
     ORDER BY m.opened_at DESC LIMIT 1;
    IF v_matter.id IS NULL THEN
      RAISE EXCEPTION 'SURRENDER_EFFECT_INCOMPLETE' USING ERRCODE = '22023',
        DETAIL = 'no surrender matter was opened';
    END IF;
    v_matter_id := v_matter.id;

    PERFORM public.license_lifecycle_step(v_lic.id, 'COMPLETE_SURRENDER_REVIEW',
      jsonb_build_object('matter_id', v_matter_id::text,
                         'legal_basis', v_lc_in->>'surrender_legal_basis'),
      'Surrender review concluded through governed post-licensing application ' || v_app.application_number);

    v_step := public.license_lifecycle_step(v_lic.id, 'ACCEPT_SURRENDER',
      jsonb_build_object('matter_id', v_matter_id::text,
                         'legal_basis', v_lc_in->>'surrender_legal_basis',
                         'effective_date', v_lc_in->>'surrender_effective_date'),
      COALESCE(v_lc_in->>'surrender_reason',
               'Surrender accepted through application ' || v_app.application_number));

    SELECT * INTO v_lic FROM public.licenses WHERE id = v_lic.id;
    IF v_lic.status <> 'surrendered' THEN
      RAISE EXCEPTION 'SURRENDER_EFFECT_INCOMPLETE' USING ERRCODE = '22023',
        DETAIL = 'licence status is ' || COALESCE(v_lic.status,'null') || ' after ACCEPT_SURRENDER';
    END IF;

    v_result := v_matter_id;
    v_after := jsonb_build_object(
      'matter_id', v_matter_id,
      'license_status', v_lic.status,
      'lifecycle_result', v_step,
      'decision_id', (SELECT d.id FROM public.license_decisions d
                       WHERE d.matter_id = v_matter_id ORDER BY d.created_at DESC LIMIT 1));

  ELSIF v_kind = 'ENTITY_CHANGE' THEN
    v_items := public.post_license_change_items(_application_id);
    v_before := jsonb_build_object(
      'structure_version', (SELECT structure_version FROM public.licensees
                             WHERE id = (v_plan->>'entity_id')::uuid),
      'items', v_items);

    v_cs := public.entity_change_set_create(
      (v_plan->>'entity_id')::uuid,
      v_items,
      'APPLICATION',
      'Post-licensing application ' || v_app.application_number || ' — ' || COALESCE(v_plan->>'service_name',''),
      current_date,
      (SELECT r.id FROM public.form_responses r
        WHERE r.entity_type = 'application' AND r.entity_id = _application_id
        ORDER BY r.created_at DESC LIMIT 1),
      v_app.form_version_id,
      _application_id,
      NULL);
    v_cs_id := (v_cs->>'change_set_id')::uuid;

    PERFORM public.entity_change_set_transition(v_cs_id, 'submit', NULL);
    PERFORM public.entity_change_set_transition(v_cs_id, 'review',
      'Reviewed through the governed post-licensing decision');
    PERFORM public.entity_change_set_transition(v_cs_id, 'approve',
      'Approved through the governed post-licensing decision');
    PERFORM public.apply_entity_change_set(v_cs_id);

    IF (SELECT status FROM public.entity_change_sets WHERE id = v_cs_id) <> 'APPLIED' THEN
      RAISE EXCEPTION 'ENTITY_CHANGE_EFFECT_INCOMPLETE' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.entity_change_items
                WHERE change_set_id = v_cs_id AND COALESCE(apply_status,'') <> 'APPLIED') THEN
      RAISE EXCEPTION 'ENTITY_CHANGE_EFFECT_INCOMPLETE' USING ERRCODE = '22023',
        DETAIL = 'one or more change items did not apply';
    END IF;

    v_result := v_cs_id;
    v_after := jsonb_build_object(
      'change_set_id', v_cs_id,
      'structure_version', (SELECT structure_version FROM public.licensees
                             WHERE id = (v_plan->>'entity_id')::uuid),
      'applied_items', (SELECT count(*) FROM public.entity_change_items WHERE change_set_id = v_cs_id));

  ELSIF v_kind = 'ESTABLISHMENT_OPEN' THEN
    v_est_in := public.post_license_establishment_input(_application_id);
    v_before := jsonb_build_object(
      'active_establishments', (SELECT count(*) FROM public.regulated_establishments e
                                 WHERE e.entity_id = v_lic.holder_id AND e.status = 'ACTIVE'),
      'input', v_est_in);

    v_est_ref := public.next_establishment_reference();

    INSERT INTO public.regulated_establishments
      (entity_id, license_id, establishment_type, establishment_reference, name, status,
       address_text, address, opened_on, source_application_id, created_by, updated_by)
    VALUES (v_lic.holder_id, v_lic.id, 'BRANCH', v_est_ref,
            v_est_in->>'name', 'ACTIVE',
            v_est_in->>'address_text',
            COALESCE(v_est_in->'address','{}'::jsonb),
            COALESCE((v_est_in->>'opening_date')::date, current_date),
            _application_id, v_actor, v_actor)
    RETURNING * INTO v_est;

    INSERT INTO public.regulated_establishment_events
      (establishment_id, event_type, effective_date, application_id, service_code, actor_id, payload)
    VALUES (v_est.id, 'OPENED', v_est.opened_on, _application_id, v_plan->>'service_code', v_actor,
            jsonb_build_object('application_number', v_app.application_number,
                               'establishment_reference', v_est_ref,
                               'name', v_est.name,
                               'address_text', v_est.address_text,
                               'address', v_est.address))
    RETURNING id INTO v_event_id;

    v_result := v_est.id;
    v_after := jsonb_build_object(
      'establishment_id', v_est.id,
      'establishment_reference', v_est_ref,
      'status', v_est.status,
      'opened_on', v_est.opened_on,
      'opening_event_id', v_event_id,
      'active_establishments', (SELECT count(*) FROM public.regulated_establishments e
                                 WHERE e.entity_id = v_lic.holder_id AND e.status = 'ACTIVE'));

  ELSIF v_kind = 'ESTABLISHMENT_CLOSE' THEN
    v_est_in := public.post_license_establishment_input(_application_id);

    SELECT * INTO v_est FROM public.regulated_establishments
     WHERE id = (v_est_in->>'target_establishment_id')::uuid FOR UPDATE;

    IF v_est.id IS NULL
       OR v_est.entity_id IS DISTINCT FROM v_lic.holder_id
       OR (v_est.license_id IS NOT NULL AND v_est.license_id <> v_lic.id) THEN
      RAISE EXCEPTION 'ESTABLISHMENT_NOT_APPLICABLE' USING ERRCODE = '22023';
    END IF;
    IF v_est.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'ESTABLISHMENT_ALREADY_CLOSED' USING ERRCODE = '22023';
    END IF;

    v_before := jsonb_build_object(
      'establishment_id', v_est.id,
      'establishment_reference', v_est.establishment_reference,
      'status', v_est.status,
      'opened_on', v_est.opened_on,
      'name', v_est.name);

    UPDATE public.regulated_establishments
       SET status = 'CLOSED',
           closed_on = COALESCE((v_est_in->>'closure_date')::date, current_date),
           closure_application_id = _application_id,
           updated_by = v_actor
     WHERE id = v_est.id
    RETURNING * INTO v_est;

    INSERT INTO public.regulated_establishment_events
      (establishment_id, event_type, effective_date, application_id, service_code, actor_id, payload)
    VALUES (v_est.id, 'CLOSED', v_est.closed_on, _application_id, v_plan->>'service_code', v_actor,
            jsonb_build_object('application_number', v_app.application_number,
                               'establishment_reference', v_est.establishment_reference))
    RETURNING id INTO v_event_id;

    v_result := v_est.id;
    v_after := jsonb_build_object(
      'establishment_id', v_est.id,
      'establishment_reference', v_est.establishment_reference,
      'status', v_est.status,
      'closed_on', v_est.closed_on,
      'opened_on', v_est.opened_on,
      'closure_event_id', v_event_id);

  ELSIF v_kind = 'NOTIFICATION_ACK' THEN
    v_before := jsonb_build_object(
      'valid_until', v_lic.valid_until,
      'license_status', v_lic.status,
      'structure_version', (SELECT structure_version FROM public.licensees
                             WHERE id = (v_plan->>'entity_id')::uuid));

    v_ack_ref := 'ACK-' || to_char(now(),'YYYY') || '-' || COALESCE(v_app.application_number, _application_id::text);

    INSERT INTO public.post_license_acknowledgements
      (application_id, license_id, entity_id, service_id, service_code,
       acknowledgement_reference, notification_kind, received_at, acknowledged_by, payload)
    VALUES (_application_id, v_lic.id, (v_plan->>'entity_id')::uuid,
            (v_plan->>'service_id')::uuid, v_plan->>'service_code',
            v_ack_ref, v_plan->>'service_code', v_app.submitted_at, v_actor,
            jsonb_build_object('application_number', v_app.application_number,
                               'service_name', v_plan->>'service_name'))
    RETURNING id INTO v_result;

    v_after := jsonb_build_object(
      'acknowledgement_id', v_result,
      'acknowledgement_reference', v_ack_ref,
      'valid_until', (SELECT l2.valid_until FROM public.licenses l2 WHERE l2.id = v_lic.id),
      'license_status', (SELECT l2.status FROM public.licenses l2 WHERE l2.id = v_lic.id),
      'structure_version', (SELECT structure_version FROM public.licensees
                             WHERE id = (v_plan->>'entity_id')::uuid));

    IF v_after->>'valid_until' IS DISTINCT FROM v_before->>'valid_until'
       OR v_after->>'license_status' IS DISTINCT FROM v_before->>'license_status'
       OR v_after->>'structure_version' IS DISTINCT FROM v_before->>'structure_version' THEN
      RAISE EXCEPTION 'NOTIFICATION_EFFECT_MUTATED_STATE' USING ERRCODE = '22023';
    END IF;

  ELSE
    RAISE EXCEPTION 'EFFECT_HANDLER_MISSING' USING ERRCODE = '22023',
      DETAIL = COALESCE(v_kind,'null');
  END IF;

  INSERT INTO public.post_license_effects
    (application_id, license_id, entity_id, service_id, service_code, effect_kind,
     canonical_target, handler, state, fp_required, result_ref,
     evidence_before, evidence_after, provenance, applied_by)
  VALUES (_application_id, v_lic.id, (v_plan->>'entity_id')::uuid,
          (v_plan->>'service_id')::uuid, v_plan->>'service_code', v_kind,
          v_plan->>'canonical_target', v_plan->>'handler', 'APPLIED',
          COALESCE((v_plan->>'fp_required')::boolean,false), v_result,
          v_before, v_after,
          jsonb_build_object('plan', v_plan,
                             'application_number', v_app.application_number,
                             'approved_at', v_app.approved_at),
          v_actor)
  RETURNING * INTO v_row;

  IF v_kind = 'ESTABLISHMENT_OPEN' THEN
    UPDATE public.regulated_establishments SET source_effect_id = v_row.id WHERE id = v_result;
    UPDATE public.regulated_establishment_events SET effect_id = v_row.id
     WHERE establishment_id = v_result AND event_type = 'OPENED' AND effect_id IS NULL;
  ELSIF v_kind = 'ESTABLISHMENT_CLOSE' THEN
    UPDATE public.regulated_establishments SET closure_effect_id = v_row.id WHERE id = v_result;
    UPDATE public.regulated_establishment_events SET effect_id = v_row.id
     WHERE establishment_id = v_result AND event_type = 'CLOSED' AND effect_id IS NULL;
  END IF;

  PERFORM public.create_audit_log(v_actor, 'post_license.effect.applied', 'application',
    _application_id::text, v_before, v_after,
    jsonb_build_object('effect_id', v_row.id, 'effect_kind', v_kind,
                       'service_code', v_plan->>'service_code',
                       'canonical_target', v_plan->>'canonical_target',
                       'result_ref', v_result));

  RETURN jsonb_build_object('success', true, 'idempotent', false,
    'effect_id', v_row.id, 'effect_kind', v_kind, 'state','APPLIED',
    'canonical_target', v_plan->>'canonical_target',
    'result_ref', v_result, 'plan', v_plan);
END $function$;

-- ---------------------------------------------------------------------
-- GAP-F5-17: fee-aware submission boundary
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_application(_application_id uuid, _ack_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
  v_is_resub boolean;
  v_payment_count int;
  v_sector_id uuid;
  v_sub_sector_id uuid;
  v_service_id uuid;
  v_category_id uuid;
  v_license_id uuid;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_existing_instance record;
  v_new_instance_id uuid;
  v_action_label text;
  v_audit_action text;
  v_app_status_target text;
  v_effective_regulator uuid;
  v_is_post_license boolean;
  v_post_claim boolean;
  v_applicability text;
  v_ctx record;
  v_authority text;
  v_canonical jsonb;
  v_fp jsonb;
  v_fp_link jsonb;
  v_fee jsonb;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, applicant_id, entity_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  v_sector_id := NULLIF(v_app.data->>'sector_id','')::uuid;
  v_sub_sector_id := NULLIF(v_app.data->>'sub_sector_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;
  v_category_id := NULLIF(v_app.data->>'category_id','')::uuid;
  v_license_id := NULLIF(v_app.data->>'license_id','')::uuid;

  v_post_claim := v_license_id IS NOT NULL
                  OR v_service_id IS NOT NULL
                  OR lower(COALESCE(v_app.data->>'type','')) = 'post_license';

  IF v_post_claim THEN
    v_applicability := public.post_license_service_applicability(v_service_id, v_license_id);
    v_is_post_license := v_applicability = 'OK';
    IF NOT v_is_post_license THEN
      RETURN jsonb_build_object(
        'error', public.post_license_applicability_message(v_applicability),
        'code', v_applicability, 'http', 409);
    END IF;
  ELSE
    v_is_post_license := false;
  END IF;

  IF v_app.applicant_id = v_uid THEN
    v_authority := 'applicant';
  ELSIF v_is_post_license AND public.can_submit_application(_application_id) THEN
    v_authority := 'entity_delegate';
  ELSE
    RETURN jsonb_build_object(
      'error','You are not authorised to submit this filing for this entity',
      'code','FORBIDDEN','http',403);
  END IF;

  v_is_resub := v_app.status IN (
    'resubmission_requested','resubmission_required',
    'returned_for_correction','info_requested',
    'query_raised'
  );
  IF v_app.status NOT IN ('draft', 'in_progress') AND NOT v_is_resub THEN
    RETURN jsonb_build_object(
      'error', format('Application is in ''%s'' status — cannot submit', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  SELECT count(*) INTO v_payment_count
    FROM public.payments
   WHERE application_id = _application_id
     AND status IN ('completed','success','paid');

  -- F4 initial licensing keeps its frozen payment contract.
  IF NOT v_is_post_license AND v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'error','No completed payment found — please complete payment first',
      'code','PAYMENT_REQUIRED','http',402
    );
  END IF;

  IF v_is_post_license THEN
    SELECT * INTO v_ctx
      FROM public.resolve_post_license_intake_context(v_license_id, v_service_id);
    IF v_ctx.entity_id IS NULL THEN
      RETURN jsonb_build_object(
        'error','The licence for this filing could not be found','code','LICENSE_NOT_FOUND','http',409);
    END IF;

    IF NOT public.can_act_on_specific_license(v_license_id, v_ctx.entity_id, NULL, NULL, NULL) THEN
      RETURN jsonb_build_object(
        'error','This service is unavailable because the related licence is not currently approved, issued and in good standing.',
        'code','LICENSE_ENTITLEMENT_REQUIRED','http',409);
    END IF;

    v_sector_id := v_ctx.sector_id;
    v_sub_sector_id := v_ctx.sub_sector_id;
    v_category_id := v_ctx.category_id;

    v_canonical := jsonb_build_object(
      'licensee_id', v_ctx.entity_id,
      'sector_id', v_ctx.sector_id,
      'sub_sector_id', v_ctx.sub_sector_id,
      'category_id', v_ctx.category_id
    );

    UPDATE public.applications
       SET data = COALESCE(data,'{}'::jsonb) || v_canonical,
           entity_id = COALESCE(entity_id, v_ctx.entity_id),
           updated_at = v_now
     WHERE id = _application_id;

    -- F5-B5X GAP-F5-17: payment is required only when a real assessed amount
    -- is due after the canonical fee resolution (waivers, zero-rating and
    -- absent configuration do not block submission). F6 owns fee schedules.
    v_fee := public.post_license_fee_assessment(_application_id);
    IF COALESCE((v_fee->>'requires_payment')::boolean, false) AND v_payment_count = 0 THEN
      RETURN jsonb_build_object(
        'error', format('A fee of %s %s is payable before this filing can be submitted',
                        COALESCE(v_fee->>'currency','JMD'), COALESCE(v_fee->>'amount_due','0')),
        'code','PAYMENT_REQUIRED','http',402,
        'fee_assessment', v_fee);
    END IF;
  END IF;

  IF v_is_post_license THEN
    v_fp := public.post_license_fp_subjects(_application_id);

    IF COALESCE((v_fp->>'fp_required')::boolean, false) THEN
      IF v_fp->>'state' <> 'OK' THEN
        RETURN jsonb_build_object(
          'error', CASE v_fp->>'state'
                     WHEN 'FP_SUBJECT_REQUIRED' THEN
                       'This service requires a fit-and-proper assessment, but no canonical individual was identified on the filing.'
                     WHEN 'FP_SUBJECT_NOT_CANONICAL' THEN
                       'This service requires a fit-and-proper assessment of a registered individual. The person named on the filing is not canonically identified.'
                     ELSE 'The fit-and-proper subject of this filing could not be resolved.' END,
          'code', v_fp->>'state',
          'http', 409,
          'fp_required', true,
          'indicators', v_fp->'indicators');
      END IF;

      PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
      PERFORM set_config('app.workflow_actor_id', v_uid::text, true);

      v_fp_link := public.ensure_post_license_fp_links(_application_id);

      IF NOT COALESCE((v_fp_link->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'FP_LINKAGE_FAILED' USING ERRCODE = '22023',
          DETAIL = COALESCE(v_fp_link->>'code', v_fp_link->>'state', 'FP_LINK_REQUIRED');
      END IF;

      IF public.post_license_fp_readiness(_application_id)->>'state'
         IN ('FP_SUBJECT_REQUIRED','FP_SUBJECT_NOT_CANONICAL','FP_LINK_REQUIRED') THEN
        RAISE EXCEPTION 'FP_LINKAGE_FAILED' USING ERRCODE = '22023',
          DETAIL = public.post_license_fp_readiness(_application_id)->>'state';
      END IF;
    END IF;
  END IF;

  v_effective_regulator := public._resolve_effective_regulator(
    v_app.regulator_id, v_sector_id, v_category_id
  );

  SELECT id, workflow_id, current_step_id, status
    INTO v_existing_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_workflow_id := v_existing_instance.workflow_id;
    v_first_step_id := v_existing_instance.current_step_id;
    IF v_existing_instance.status = 'paused' THEN
      UPDATE public.workflow_instances
         SET status = 'active', updated_at = v_now
       WHERE id = v_existing_instance.id;
    END IF;
  ELSE
    SELECT r.workflow_id, r.first_step_id INTO v_workflow_id, v_first_step_id
      FROM public._resolve_application_workflow(
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id,
             v_is_post_license, v_service_id, v_sub_sector_id) r;

    IF v_workflow_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, entity_type, entity_id, current_step_id, status
      ) VALUES (
        v_workflow_id, 'application', _application_id, v_first_step_id, 'active'
      )
      RETURNING id INTO v_new_instance_id;
    END IF;
  END IF;

  v_app_status_target := 'submitted';

  UPDATE public.applications
     SET status = v_app_status_target,
         submitted_at = COALESCE(submitted_at, v_now),
         workflow_id = COALESCE(workflow_id, v_workflow_id),
         current_step_id = v_first_step_id,
         regulator_id = COALESCE(v_effective_regulator, regulator_id),
         ack_by = CASE WHEN _ack_text IS NOT NULL THEN v_uid ELSE ack_by END,
         ack_at = CASE WHEN _ack_text IS NOT NULL THEN v_now ELSE ack_at END,
         ack_text = CASE WHEN _ack_text IS NOT NULL
                         THEN substring(_ack_text from 1 for 4000)
                         ELSE ack_text END,
         updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.form_responses
     SET status = 'submitted', submitted_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application';

  v_action_label := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;
  v_audit_action := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;

  INSERT INTO public.audit_logs (
    entity_type, entity_id, action, user_id, new_value, metadata
  ) VALUES (
    'application',
    _application_id::text,
    'application.' || v_audit_action,
    v_uid,
    jsonb_build_object('status', v_app_status_target),
    jsonb_build_object(
      'source', 'submit_application_rpc',
      'application_id', _application_id,
      'application_number', v_app.application_number,
      'workflow_id', v_workflow_id,
      'first_step_id', v_first_step_id,
      'is_resubmission', v_is_resub,
      'previous_status', v_app.status,
      'resumed', v_is_resub,
      'submission_authority', v_authority,
      'is_post_license', v_is_post_license,
      'submitted_by', v_uid,
      'applicant_id', v_app.applicant_id,
      'fee_assessment', v_fee
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'status', v_app_status_target,
    'workflow_id', v_workflow_id,
    'first_step_id', v_first_step_id,
    'is_resubmission', v_is_resub,
    'resumed', v_is_resub,
    'workflow_attached', v_workflow_id IS NOT NULL,
    'submission_authority', v_authority,
    'is_post_license', v_is_post_license,
    'previous_status', v_app.status,
    'fp_required', COALESCE((v_fp->>'fp_required')::boolean, false),
    'fp_linkage', v_fp_link,
    'fee_assessment', v_fee
  );
END;
$function$;
