-- ============================================================================
-- F5-B3 — GOVERNED POST-APPROVAL EFFECT ENGINE   (GAP-F5-03, CRITICAL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.post_license_effect_map (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code   text NOT NULL UNIQUE,
  effect_kind    text NOT NULL
                 CHECK (effect_kind IN ('RENEWAL','ENTITY_CHANGE','NOTIFICATION_ACK','UNSUPPORTED')),
  canonical_target text,
  handler        text,
  is_supported   boolean NOT NULL DEFAULT true,
  bcr_reason     text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_license_effect_map_supported_chk CHECK (
    (is_supported AND effect_kind <> 'UNSUPPORTED' AND canonical_target IS NOT NULL AND handler IS NOT NULL)
    OR (NOT is_supported AND bcr_reason IS NOT NULL)
  )
);

GRANT SELECT ON public.post_license_effect_map TO authenticated;
GRANT ALL    ON public.post_license_effect_map TO service_role;
ALTER TABLE public.post_license_effect_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "effect map readable by internal staff" ON public.post_license_effect_map;
CREATE POLICY "effect map readable by internal staff"
  ON public.post_license_effect_map FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'license_management','view'));

CREATE TABLE IF NOT EXISTS public.post_license_effects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  license_id       uuid REFERENCES public.licenses(id),
  entity_id        uuid,
  service_id       uuid REFERENCES public.services(id),
  service_code     text,
  effect_kind      text NOT NULL,
  canonical_target text,
  handler          text,
  state            text NOT NULL CHECK (state IN ('APPLIED')),
  fp_required      boolean NOT NULL DEFAULT false,
  result_ref       uuid,
  evidence_before  jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_after   jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance       jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_by       uuid,
  applied_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_license_effects_license_idx ON public.post_license_effects(license_id);

GRANT SELECT ON public.post_license_effects TO authenticated;
GRANT ALL    ON public.post_license_effects TO service_role;
ALTER TABLE public.post_license_effects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "effect ledger readable by staff and the filing entity" ON public.post_license_effects;
CREATE POLICY "effect ledger readable by staff and the filing entity"
  ON public.post_license_effects FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(),'license_management','view')
    OR EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = post_license_effects.application_id
         AND (a.applicant_id = auth.uid()
              OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                          WHERE m.entity_id = a.entity_id
                            AND m.user_id = auth.uid()
                            AND m.status = 'APPROVED'))
    )
  );

CREATE TABLE IF NOT EXISTS public.post_license_acknowledgements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  license_id        uuid REFERENCES public.licenses(id),
  entity_id         uuid,
  service_id        uuid REFERENCES public.services(id),
  service_code      text,
  acknowledgement_reference text NOT NULL,
  notification_kind text NOT NULL,
  received_at       timestamptz,
  acknowledged_at   timestamptz NOT NULL DEFAULT now(),
  acknowledged_by   uuid,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.post_license_acknowledgements TO authenticated;
GRANT ALL    ON public.post_license_acknowledgements TO service_role;
ALTER TABLE public.post_license_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acknowledgements readable by staff and the filing entity"
  ON public.post_license_acknowledgements;
CREATE POLICY "acknowledgements readable by staff and the filing entity"
  ON public.post_license_acknowledgements FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(),'license_management','view')
    OR EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = post_license_acknowledgements.application_id
         AND (a.applicant_id = auth.uid()
              OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                          WHERE m.entity_id = a.entity_id
                            AND m.user_id = auth.uid()
                            AND m.status = 'APPROVED'))
    )
  );

CREATE OR REPLACE FUNCTION public.f5_effect_records_are_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
    DETAIL = TG_TABLE_NAME || ' is an append-only regulatory record';
END $$;

DROP TRIGGER IF EXISTS post_license_effects_immutable ON public.post_license_effects;
CREATE TRIGGER post_license_effects_immutable
  BEFORE UPDATE OR DELETE ON public.post_license_effects
  FOR EACH ROW EXECUTE FUNCTION public.f5_effect_records_are_immutable();

DROP TRIGGER IF EXISTS post_license_acknowledgements_immutable ON public.post_license_acknowledgements;
CREATE TRIGGER post_license_acknowledgements_immutable
  BEFORE UPDATE OR DELETE ON public.post_license_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.f5_effect_records_are_immutable();

INSERT INTO public.post_license_effect_map
  (service_code, effect_kind, canonical_target, handler, is_supported, bcr_reason, notes)
VALUES
  ('RENEWAL','RENEWAL','license_renewals + license_terms','license_lifecycle_step', true, NULL,
   'Reuses the F4-certified lifecycle engine; no second renewal implementation.'),
  ('PLS_CHANGE_LEGAL_NAME','ENTITY_CHANGE','entity_change_sets -> organization_names',
   'entity_change_set', true, NULL, NULL),
  ('PLS_CHANGE_ADDRESS','ENTITY_CHANGE','entity_change_sets -> entity_facts',
   'entity_change_set', true, NULL, NULL),
  ('PLS_SHAREHOLDING_CHANGE','ENTITY_CHANGE','entity_change_sets -> ownership_interests',
   'entity_change_set', true, NULL, NULL),
  ('PLS_BENEFICIAL_OWNER_CHANGE','ENTITY_CHANGE','entity_change_sets -> ownership_interests',
   'entity_change_set', true, NULL, NULL),
  ('PLS_CHANGE_OF_CONTROL','ENTITY_CHANGE','entity_change_sets -> ownership_interests',
   'entity_change_set', true, NULL, NULL),
  ('PLS_DIRECTOR_APPOINTMENT','ENTITY_CHANGE','entity_change_sets -> entity_appointments',
   'entity_change_set', true, NULL, NULL),
  ('PLS_KFH_CHANGE','ENTITY_CHANGE','entity_change_sets -> entity_appointments',
   'entity_change_set', true, NULL, NULL),
  ('PLS_GROUP_RESTRUCTURE','ENTITY_CHANGE','entity_change_sets -> party_relationships',
   'entity_change_set', true, NULL, NULL),
  ('PLS_INCIDENT_NOTIFICATION','NOTIFICATION_ACK','post_license_acknowledgements',
   'notification_acknowledgement', true, NULL, 'Must not mutate licence or entity state.'),
  ('PLS_OUTSOURCING_NOTIFICATION','NOTIFICATION_ACK','post_license_acknowledgements',
   'notification_acknowledgement', true, NULL, 'Must not mutate licence or entity state.'),
  ('PLS_DIRECTOR_RESIGNATION','NOTIFICATION_ACK','post_license_acknowledgements',
   'notification_acknowledgement', true, NULL,
   'Notification only. Removing the appointment is a separate governed structural filing.'),
  ('PLS_NEW_BRANCH','UNSUPPORTED',NULL,NULL,false,
   'No canonical branch / establishment register exists in the data model. A regulator-approved target and business mapping are required before approval can produce an effect.', NULL),
  ('PLS_BRANCH_CLOSURE','UNSUPPORTED',NULL,NULL,false,
   'No canonical branch / establishment register exists in the data model.', NULL),
  ('PLS_AUDITOR_CHANGE','UNSUPPORTED',NULL,NULL,false,
   'No canonical auditor appointment register exists; the appointment engine has no configured auditor role type.', NULL),
  ('PLS_DEREGISTRATION','UNSUPPORTED',NULL,NULL,false,
   'Deregistration semantics are ambiguous (licence surrender vs entity closure). The authoritative target must be decided by the regulator before an effect may be fabricated.', NULL)
ON CONFLICT (service_code) DO UPDATE
  SET effect_kind = EXCLUDED.effect_kind,
      canonical_target = EXCLUDED.canonical_target,
      handler = EXCLUDED.handler,
      is_supported = EXCLUDED.is_supported,
      bcr_reason = EXCLUDED.bcr_reason,
      notes = EXCLUDED.notes,
      updated_at = now();

CREATE OR REPLACE FUNCTION public.post_license_effect_key(_service_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN s.code IS NOT NULL AND btrim(s.code) <> '' THEN upper(btrim(s.code))
           WHEN lower(COALESCE(s.lifecycle_stage,'')) = 'renewal' THEN 'RENEWAL'
           ELSE NULL
         END
    FROM public.services s
   WHERE s.id = _service_id
$$;

CREATE OR REPLACE FUNCTION public.post_license_change_items(_application_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT
      row_number() OVER (ORDER BY r.created_at, v.repeat_index NULLS FIRST, v.id) AS ord,
      jsonb_strip_nulls(jsonb_build_object(
        'change_type', CASE dc.projection_strategy
                         WHEN 'PROPOSE_ORGANIZATION_NAME' THEN 'ORGANIZATION_NAME'
                         WHEN 'PROPOSE_ENTITY_FACT'       THEN 'ENTITY_FACT'
                         WHEN 'PROPOSE_CLASSIFICATION'    THEN 'CLASSIFICATION'
                         WHEN 'PROPOSE_OWNERSHIP'         THEN 'OWNERSHIP'
                         WHEN 'PROPOSE_APPOINTMENT'       THEN 'APPOINTMENT'
                         WHEN 'PROPOSE_RELATIONSHIP'      THEN 'RELATIONSHIP'
                       END,
        'operation', 'UPSERT',
        'data_concept_id', dc.id,
        'target_table', dc.canonical_target,
        'form_field_definition_id', v.form_field_definition_id,
        'proposed_value',
          CASE WHEN dc.projection_strategy = 'PROPOSE_ORGANIZATION_NAME'
               THEN jsonb_strip_nulls(jsonb_build_object(
                      'name', COALESCE(v.value_text, v.value_json->>'name'),
                      'name_type', COALESCE(v.value_json->>'name_type','LEGAL')))
               ELSE jsonb_strip_nulls(jsonb_build_object(
                      'value_text', v.value_text,
                      'value_number', v.value_number,
                      'value_date', v.value_date,
                      'value_boolean', v.value_boolean,
                      'value_uuid', v.value_uuid,
                      'value_json', CASE WHEN jsonb_typeof(v.value_json) = 'object'
                                         THEN NULL ELSE v.value_json END))
                    || CASE WHEN jsonb_typeof(v.value_json) = 'object'
                            THEN v.value_json ELSE '{}'::jsonb END
          END
      )) AS item
    FROM public.form_submission_values v
    JOIN public.form_responses r ON r.id = v.response_id
    JOIN public.data_concepts dc ON dc.id = v.data_concept_id
   WHERE r.entity_type = 'application'
     AND r.entity_id = _application_id
     AND dc.projection_strategy IS NOT NULL
     AND dc.projection_strategy <> 'CAPTURE_ONLY'
     AND dc.canonical_target IS NOT NULL
  ) t
$$;

CREATE OR REPLACE FUNCTION public.post_license_fp_satisfied(_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.application_fp_links l
                  WHERE l.application_id = _application_id AND COALESCE(l.is_required,true))
     AND NOT EXISTS (
       SELECT 1
         FROM public.application_fp_links l
        WHERE l.application_id = _application_id
          AND COALESCE(l.is_required,true)
          AND NOT EXISTS (
            SELECT 1
              FROM public.fp_determinations d
             WHERE d.assessment_id = l.assessment_id
               AND d.is_current
               AND lower(d.outcome) IN ('fit','fit_and_proper','approved','positive','pass')
               AND (d.effective_from IS NULL OR d.effective_from <= current_date)
               AND (d.effective_to   IS NULL OR d.effective_to   >= current_date)
          )
     )
$$;

CREATE OR REPLACE FUNCTION public.post_license_effect_plan(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
        'detail', COALESCE(v_key, 'service has no canonical code and is not a renewal service'))));
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
      'state','BUSINESS_CONFIGURATION_REQUIRED',
      'code','BUSINESS_CONFIGURATION_REQUIRED',
      'blockers', jsonb_build_array(jsonb_build_object(
        'code','BUSINESS_CONFIGURATION_REQUIRED',
        'label','No authoritative regulatory target is configured for this service',
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
    IF NOT public.has_permission(auth.uid(),'entity_structure','apply')
       OR NOT public.has_permission(auth.uid(),'entity_structure','approve') THEN
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
END $$;

REVOKE ALL ON FUNCTION public.post_license_effect_plan(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_license_effect_plan(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_license_effect_plan(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_license_effect_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_license_effect_key(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_license_effect_key(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_license_change_items(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_license_change_items(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_license_change_items(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_license_fp_satisfied(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_license_fp_satisfied(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_license_fp_satisfied(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.f5_effect_records_are_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.f5_effect_records_are_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.f5_effect_records_are_immutable() FROM authenticated;

CREATE OR REPLACE FUNCTION public.apply_post_license_effect(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_actor     uuid := auth.uid();
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
END $$;

REVOKE ALL ON FUNCTION public.apply_post_license_effect(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_post_license_effect(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_post_license_effect(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_post_license_effect(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_post_license_effect(uuid) IS
  'F5-B3: governed, idempotent post-approval effect execution. Runs in the approval transaction; a failed effect rolls the approval back.';
