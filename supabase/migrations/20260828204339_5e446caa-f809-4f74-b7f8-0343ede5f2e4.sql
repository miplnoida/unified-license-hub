-- ============================================================================
-- F5-B3 (completion) — wire governed final approval to the post-approval
-- effect engine, harden the effect estate, and close effect-map coverage.
-- ============================================================================

-- ---------------------------------------------------------------- privileges
REVOKE ALL ON public.post_license_effects          FROM anon;
REVOKE ALL ON public.post_license_acknowledgements FROM anon;
REVOKE ALL ON public.post_license_effect_map       FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.post_license_effects, public.post_license_acknowledgements,
     public.post_license_effect_map
  FROM authenticated;
GRANT SELECT ON public.post_license_effects, public.post_license_acknowledgements,
                public.post_license_effect_map TO authenticated;
GRANT ALL ON public.post_license_effects, public.post_license_acknowledgements,
             public.post_license_effect_map TO service_role;

-- --------------------------------------------------- blocker classification
ALTER TABLE public.post_license_effect_map
  ADD COLUMN IF NOT EXISTS blocker_class text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'post_license_effect_map_blocker_class_chk') THEN
    ALTER TABLE public.post_license_effect_map
      ADD CONSTRAINT post_license_effect_map_blocker_class_chk
      CHECK (blocker_class IS NULL
             OR blocker_class IN ('BUSINESS_CONFIGURATION_REQUIRED','PRODUCT_GAP'));
  END IF;
END $$;

-- Branch estate: the canonical register genuinely does not exist -> PRODUCT_GAP.
UPDATE public.post_license_effect_map
   SET blocker_class = 'PRODUCT_GAP',
       bcr_reason = 'PRODUCT GAP: the data model has no canonical branch / establishment register (no table, no lifecycle, no location binding). This is a missing product capability, not a regulator configuration choice.',
       updated_at = now()
 WHERE service_code IN ('PLS_NEW_BRANCH','PLS_BRANCH_CLOSURE');

-- Deregistration: canonical mechanism exists (ACCEPT_SURRENDER lifecycle action);
-- only the regulator semantic choice is missing -> BCR.
UPDATE public.post_license_effect_map
   SET blocker_class = 'BUSINESS_CONFIGURATION_REQUIRED',
       bcr_reason = 'A canonical mechanism exists (license_lifecycle_step ACCEPT_SURRENDER plus the entity relationship register), but the regulator has not declared which semantic this service carries (licence surrender vs entity relationship closure). The semantic must be configured before an effect may be applied.',
       updated_at = now()
 WHERE service_code = 'PLS_DEREGISTRATION';

-- External auditor change: canonical target exists (party_relationships with the
-- configured external_auditor_of relationship type) -> supported entity change.
UPDATE public.post_license_effect_map
   SET effect_kind = 'ENTITY_CHANGE',
       canonical_target = 'entity_change_sets -> party_relationships',
       handler = 'entity_change_set',
       is_supported = true,
       bcr_reason = NULL,
       blocker_class = NULL,
       notes = 'Applied through the governed change-set model using the configured external_auditor_of relationship type.',
       updated_at = now()
 WHERE service_code = 'PLS_AUDITOR_CHANGE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'post_license_effect_map_blocker_required_chk') THEN
    ALTER TABLE public.post_license_effect_map
      ADD CONSTRAINT post_license_effect_map_blocker_required_chk
      CHECK (is_supported OR blocker_class IS NOT NULL);
  END IF;
END $$;

-- --------------------------------------- explicit service -> effect bindings
CREATE TABLE IF NOT EXISTS public.post_license_effect_service_bindings (
  service_id   uuid PRIMARY KEY REFERENCES public.services(id) ON DELETE CASCADE,
  service_code text NOT NULL REFERENCES public.post_license_effect_map(service_code)
                    ON UPDATE CASCADE,
  rationale    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.post_license_effect_service_bindings FROM anon;
REVOKE ALL ON public.post_license_effect_service_bindings FROM authenticated;
GRANT SELECT ON public.post_license_effect_service_bindings TO authenticated;
GRANT ALL    ON public.post_license_effect_service_bindings TO service_role;
ALTER TABLE public.post_license_effect_service_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "effect bindings readable by internal staff"
  ON public.post_license_effect_service_bindings;
CREATE POLICY "effect bindings readable by internal staff"
  ON public.post_license_effect_service_bindings
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'license_management', 'view'));

INSERT INTO public.post_license_effect_service_bindings (service_id, service_code, rationale)
SELECT s.id, 'PLS_CHANGE_ADDRESS',
       'Uncoded duplicate definition of the registered-address change service. Bound explicitly so that no active approval service is silently unmapped.'
  FROM public.services s
 WHERE lower(coalesce(s.lifecycle_stage,'')) IN ('post_license','renewal')
   AND coalesce(nullif(btrim(s.code),''),'') = ''
   AND s.name ILIKE '%registered address%'
ON CONFLICT (service_id) DO NOTHING;

-- --------------------------------------------------------- actor resolution
CREATE OR REPLACE FUNCTION public.workflow_effect_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v uuid;
BEGIN
  v := auth.uid();
  IF v IS NOT NULL THEN RETURN v; END IF;
  BEGIN
    v := nullif(current_setting('app.workflow_actor_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v := NULL;
  END;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.workflow_effect_actor() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------- effect key
CREATE OR REPLACE FUNCTION public.post_license_effect_key(_service_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT b.service_code FROM public.post_license_effect_service_bindings b
      WHERE b.service_id = _service_id),
    (SELECT CASE
              WHEN s.code IS NOT NULL AND btrim(s.code) <> '' THEN upper(btrim(s.code))
              WHEN lower(COALESCE(s.lifecycle_stage,'')) = 'renewal' THEN 'RENEWAL'
              ELSE NULL
            END
       FROM public.services s WHERE s.id = _service_id))
$function$;

-- ------------------------------------------------------------- effect plan
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
    v_fp_ok := public.post_license_fp_satisfied(_application_id);
    IF NOT v_fp_ok THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FP_DETERMINATION_REQUIRED',
        'label','A current positive fit-and-proper determination is required before this effect may apply',
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

  IF v_existing.id IS NOT NULL THEN
    v_state := 'APPLIED';
  ELSIF jsonb_array_length(v_blockers) > 0 THEN
    v_state := 'BLOCKED';
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
    'change_items', jsonb_array_length(v_items),
    'state', v_state,
    'code', CASE WHEN v_state = 'BLOCKED' THEN v_blockers->0->>'code' ELSE v_state END,
    'blockers', v_blockers);
END $function$;

-- ------------------------------------------- effect executor actor sourcing
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

REVOKE ALL ON FUNCTION public.apply_post_license_effect(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_post_license_effect(uuid) TO service_role;

-- ============================================================================
-- Governed final approval: canonical F4 / F5 branch, one transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(
  _application_id uuid, _instance_id uuid, _step_id uuid, _comments text, _actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record; v_instance record; v_step record;
  v_steps_total int; v_current_idx int;
  v_auth jsonb;
  v_allowed_actions text[];
  v_now timestamptz := now();
  v_provision jsonb;
  v_license_id uuid; v_license_number text; v_licensee_id uuid;
  v_readiness jsonb;
  v_plan jsonb;
  v_is_f5 boolean := false;
  v_effect jsonb;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  BEGIN
    _actor_id := public.workflow_resolve_actor(_actor_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('error', SQLERRM, 'code', SQLERRM,
                              'http', CASE WHEN SQLERRM = 'UNAUTHORIZED' THEN 401 ELSE 403 END);
  END;

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  PERFORM set_config('app.workflow_actor_id', _actor_id::text, true);

  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app FROM public.applications WHERE id=_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  -- Canonical F4 / F5 classification: licence + service binding only.
  v_plan := public.post_license_effect_plan(_application_id);
  v_is_f5 := COALESCE((v_plan->>'is_post_license')::boolean, false);

  IF v_app.status = 'approved' THEN
    IF v_is_f5 THEN
      v_effect := public.apply_post_license_effect(_application_id);
      RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,
        'post_license', true,
        'application_id',_application_id,
        'applicant_id',v_app.applicant_id,
        'effect', v_effect,
        'effect_plan', v_plan);
    END IF;
    v_provision := public.provision_application_entity(_application_id);
    PERFORM public.assert_license_term_integrity(NULLIF(v_provision->>'license_id','')::uuid, _actor_id);
    RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,
      'application_id',_application_id,
      'applicant_id',v_app.applicant_id,
      'provision', v_provision);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot approve application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id=_application_id AND entity_type='application' AND status='active'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id<>v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id<>v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, approver_role, approver_role_id, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id=v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id=v_instance.workflow_id AND s2.step_order<v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id=v_instance.workflow_id;

  IF v_current_idx <> v_steps_total - 1 THEN
    RETURN jsonb_build_object('error','Final approval requires last workflow step','code','NOT_LAST_STEP','http',422);
  END IF;

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  IF NOT (v_auth->>'can_act')::boolean THEN
    PERFORM public.log_workflow_authz_denial(_actor_id, v_step.id, 'approve', COALESCE(v_auth->>'reason','WRONG_APPROVER'), v_auth);
    RETURN jsonb_build_object('error',
      format('Only %s can act on this step', COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth);
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  -- ============ F4-B: server-authoritative licensing readiness ============
  v_readiness := public.application_licensing_readiness(_application_id);
  IF COALESCE(v_readiness->>'state','') <> 'PASS' THEN
    PERFORM public.create_audit_log(_actor_id, 'application_final_approval_blocked', 'application',
      _application_id::text, NULL, jsonb_build_object('readiness', v_readiness), NULL);
    RETURN jsonb_build_object(
      'error','Licensing prerequisites are not satisfied for this application',
      'code', CASE WHEN v_readiness->>'state' = 'BUSINESS_CONFIGURATION_REQUIRED'
                   THEN 'BUSINESS_CONFIGURATION_REQUIRED' ELSE 'LICENSING_READINESS_BLOCKED' END,
      'http',422,
      'readiness', v_readiness);
  END IF;

  -- ================== F5-B3: governed post-approval effect ==================
  IF v_is_f5 THEN
    IF COALESCE(v_plan->>'state','') NOT IN ('READY','APPLIED') THEN
      PERFORM public.create_audit_log(_actor_id, 'post_license.effect.blocked', 'application',
        _application_id::text, NULL, jsonb_build_object('effect_plan', v_plan), NULL);
      RETURN jsonb_build_object(
        'error','The governed post-licensing effect cannot be applied for this request',
        'code', COALESCE(v_plan->>'code','POST_LICENSE_EFFECT_BLOCKED'),
        'http',422,
        'effect_plan', v_plan,
        'readiness', v_readiness);
    END IF;

    UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
    UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

    -- Same transaction as the approval. Any failure aborts the whole decision.
    v_effect := public.apply_post_license_effect(_application_id);
    IF NOT COALESCE((v_effect->>'success')::boolean,false) THEN
      RAISE EXCEPTION 'POST_LICENSE_EFFECT_FAILED' USING ERRCODE='22023';
    END IF;

    INSERT INTO public.approval_actions (application_id, step_id, workflow_instance_id, actor_id,
      action, action_type, comments, responded_at)
    VALUES (_application_id, v_step.id, v_instance.id, _actor_id,
      'approve_final', 'approve', NULLIF(trim(_comments),''), v_now)
    ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

    PERFORM public.create_audit_log(_actor_id, 'post_license.application_final_approved', 'application',
      _application_id::text, NULL,
      jsonb_build_object('effect', v_effect, 'effect_plan', v_plan,
                         'auth', v_auth, 'readiness', v_readiness), NULL);

    PERFORM public.create_notification(v_app.applicant_id,
      'Request Approved: ' || v_app.application_number,
      'Your post-licensing request has been approved and the regulatory record has been updated.',
      'success', 'application', _application_id::text);

    RETURN jsonb_build_object('success',true,'http',200,
      'post_license', true,
      'application_id',_application_id,
      'applicant_id',v_app.applicant_id,
      'effect', v_effect,
      'effect_plan', v_plan,
      'readiness', v_readiness);
  END IF;

  -- ===================== F4 initial licensing (frozen path) =================
  UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
  UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

  v_provision := public.provision_application_entity(_application_id);
  v_license_id    := NULLIF(v_provision->>'license_id','')::uuid;
  v_license_number := v_provision->>'license_number';
  v_licensee_id   := NULLIF(v_provision->>'licensee_id','')::uuid;

  -- ===== F4-B5 / DEF-F4-C-04: issuance is invalid without an opening term =====
  PERFORM public.assert_license_term_integrity(v_license_id, _actor_id);

  INSERT INTO public.approval_actions (application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at)
  VALUES (_application_id, v_step.id, v_instance.id, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now)
  ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

  PERFORM public.create_audit_log(_actor_id, 'application_final_approved', 'application',
    _application_id::text, NULL,
    jsonb_build_object('license_id',v_license_id,'license_number',v_license_number,
                       'licensee_id',v_licensee_id, 'auth', v_auth,
                       'provision', v_provision, 'readiness', v_readiness), NULL);

  PERFORM public.create_notification(v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    CASE WHEN v_license_number IS NOT NULL
         THEN 'Your application has been approved. License Number: ' || v_license_number
         ELSE 'Your application has been approved. Your license will be issued once payment is verified.' END,
    'success', 'application', _application_id::text);

  RETURN jsonb_build_object('success',true,'http',200,
    'application_id',_application_id,
    'license_id',v_license_id,
    'license_number',v_license_number,
    'licensee_id',v_licensee_id,
    'applicant_id',v_app.applicant_id,
    'readiness', v_readiness,
    'provision', v_provision);
END;
$function$;