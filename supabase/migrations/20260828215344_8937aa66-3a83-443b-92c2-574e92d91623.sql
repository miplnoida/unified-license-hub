-- F5-B3P — canonical establishment (branch) register + governed effects

CREATE SEQUENCE IF NOT EXISTS public.regulated_establishment_ref_seq;

CREATE TABLE public.regulated_establishments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id uuid NOT NULL,
  license_id uuid REFERENCES public.licenses(id),
  establishment_type text NOT NULL DEFAULT 'BRANCH',
  establishment_reference text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  address_text text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_on date,
  closed_on date,
  source_application_id uuid REFERENCES public.applications(id),
  source_effect_id uuid,
  closure_application_id uuid REFERENCES public.applications(id),
  closure_effect_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT regulated_establishments_type_chk CHECK (establishment_type IN ('BRANCH')),
  CONSTRAINT regulated_establishments_status_chk CHECK (status IN ('ACTIVE','CLOSED')),
  CONSTRAINT regulated_establishments_closure_chk CHECK (
    (status = 'ACTIVE' AND closed_on IS NULL) OR (status = 'CLOSED' AND closed_on IS NOT NULL))
);

CREATE UNIQUE INDEX regulated_establishments_source_application_uidx
  ON public.regulated_establishments (source_application_id)
  WHERE source_application_id IS NOT NULL;
CREATE UNIQUE INDEX regulated_establishments_closure_application_uidx
  ON public.regulated_establishments (closure_application_id)
  WHERE closure_application_id IS NOT NULL;
CREATE INDEX regulated_establishments_entity_idx ON public.regulated_establishments (entity_id);
CREATE INDEX regulated_establishments_license_idx ON public.regulated_establishments (license_id);

CREATE TABLE public.regulated_establishment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id uuid NOT NULL REFERENCES public.regulated_establishments(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  effective_date date,
  application_id uuid REFERENCES public.applications(id),
  effect_id uuid,
  service_code text,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT regulated_establishment_events_type_chk CHECK (event_type IN ('OPENED','CLOSED'))
);

CREATE UNIQUE INDEX regulated_establishment_events_unique_lifecycle
  ON public.regulated_establishment_events (establishment_id, event_type);

GRANT SELECT ON public.regulated_establishments TO authenticated;
GRANT SELECT ON public.regulated_establishment_events TO authenticated;
GRANT ALL ON public.regulated_establishments TO service_role;
GRANT ALL ON public.regulated_establishment_events TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.regulated_establishments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.regulated_establishment_events FROM authenticated;
REVOKE ALL ON public.regulated_establishments FROM anon;
REVOKE ALL ON public.regulated_establishment_events FROM anon;

ALTER TABLE public.regulated_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulated_establishment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "establishments readable by staff and owning entity"
  ON public.regulated_establishments FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(),'license_management','view')
    OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                WHERE m.entity_id = regulated_establishments.entity_id
                  AND m.user_id = auth.uid() AND m.status = 'APPROVED')
  );

CREATE POLICY "establishment events readable by staff and owning entity"
  ON public.regulated_establishment_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.regulated_establishments e
             WHERE e.id = regulated_establishment_events.establishment_id
               AND (public.has_permission(auth.uid(),'license_management','view')
                    OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                                WHERE m.entity_id = e.entity_id
                                  AND m.user_id = auth.uid() AND m.status = 'APPROVED')))
  );

CREATE OR REPLACE FUNCTION public.regulated_establishment_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
      DETAIL = TG_TABLE_NAME || ' is a permanent regulatory register';
  END IF;
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') <> 'trusted' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = TG_TABLE_NAME || ' is writable only through governed post-licensing effect execution';
  END IF;
  IF TG_TABLE_NAME = 'regulated_establishment_events' AND TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
      DETAIL = 'establishment lifecycle events are append-only';
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'regulated_establishments' THEN
    IF NEW.id <> OLD.id OR NEW.entity_id <> OLD.entity_id
       OR NEW.establishment_reference <> OLD.establishment_reference
       OR NEW.source_application_id IS DISTINCT FROM OLD.source_application_id
       OR NEW.opened_on IS DISTINCT FROM OLD.opened_on THEN
      RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
        DETAIL = 'establishment identity and opening history cannot be rewritten';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER regulated_establishments_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.regulated_establishments
  FOR EACH ROW EXECUTE FUNCTION public.regulated_establishment_write_guard();

CREATE TRIGGER regulated_establishment_events_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.regulated_establishment_events
  FOR EACH ROW EXECUTE FUNCTION public.regulated_establishment_write_guard();

-- canonical data concepts -----------------------------------------------------
INSERT INTO public.data_domains (key, label, description, default_authority, sort_order, is_system, is_active)
VALUES ('establishments','Establishments','Branches, offices and other regulated operating establishments.','SUPTECH',100,true,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.data_concepts
  (code, name, description, data_domain_id, data_type, cardinality, sensitivity_classification,
   value_source_type, canonical_target, projection_strategy, is_system, is_active)
SELECT x.code, x.name, x.description, d.id, x.data_type, 'SINGLE', 'INTERNAL',
       x.value_source_type, 'regulated_establishments', 'CAPTURE_ONLY', true, true
FROM public.data_domains d,
     (VALUES
        ('ESTABLISHMENT.NAME','Establishment name','Name or label of the branch/establishment','TEXT','FREE_INPUT'),
        ('ESTABLISHMENT.ADDRESS','Establishment address','Structured or textual location of the branch/establishment','TEXT','FREE_INPUT'),
        ('ESTABLISHMENT.OPENING_DATE','Establishment opening date','Effective opening date of the branch/establishment','DATE','FREE_INPUT'),
        ('ESTABLISHMENT.CLOSURE_DATE','Establishment closure date','Effective closure date of the branch/establishment','DATE','FREE_INPUT'),
        ('ESTABLISHMENT.TARGET_ID','Target establishment','Canonical identifier of the establishment a request applies to','UUID','DERIVED')
     ) AS x(code,name,description,data_type,value_source_type)
WHERE d.key = 'establishments'
ON CONFLICT (code) DO NOTHING;

-- protected establishment context on applications ------------------------------
CREATE OR REPLACE FUNCTION public.protect_application_establishment_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted'
     OR COALESCE(current_setting('app.establishment_context_writer', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF (NEW.data -> 'protected_establishment') IS DISTINCT FROM (OLD.data -> 'protected_establishment') THEN
    IF (OLD.data -> 'protected_establishment') IS NULL THEN
      NEW.data := NEW.data - 'protected_establishment';
    ELSE
      NEW.data := jsonb_set(COALESCE(NEW.data,'{}'::jsonb), '{protected_establishment}',
                            OLD.data -> 'protected_establishment', true);
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_protect_application_establishment_context
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.protect_application_establishment_context();

CREATE OR REPLACE FUNCTION public.set_application_establishment_target(
  _application_id uuid, _establishment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_app public.applications;
  v_est public.regulated_establishments;
  v_lic public.licenses;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_app.applicant_id = v_uid
          OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                      WHERE m.entity_id = v_app.entity_id AND m.user_id = v_uid AND m.status = 'APPROVED')
          OR public.has_permission(v_uid,'license_management','edit')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = NULLIF(v_app.data->>'license_id','')::uuid;
  IF v_lic.id IS NULL THEN
    RAISE EXCEPTION 'LICENSE_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_est FROM public.regulated_establishments WHERE id = _establishment_id;
  IF v_est.id IS NULL OR v_est.entity_id IS DISTINCT FROM v_lic.holder_id THEN
    RAISE EXCEPTION 'ESTABLISHMENT_NOT_APPLICABLE' USING ERRCODE = '22023';
  END IF;
  IF v_est.license_id IS NOT NULL AND v_est.license_id <> v_lic.id THEN
    RAISE EXCEPTION 'ESTABLISHMENT_NOT_APPLICABLE' USING ERRCODE = '22023';
  END IF;
  IF v_est.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ESTABLISHMENT_ALREADY_CLOSED' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.establishment_context_writer','on', true);
  UPDATE public.applications
     SET data = jsonb_set(COALESCE(data,'{}'::jsonb), '{protected_establishment}',
                jsonb_build_object('establishment_id', v_est.id,
                                   'establishment_reference', v_est.establishment_reference,
                                   'set_by', v_uid, 'set_at', now()), true)
   WHERE id = _application_id;
  PERFORM set_config('app.establishment_context_writer','', true);

  RETURN jsonb_build_object('success', true, 'establishment_id', v_est.id,
                            'establishment_reference', v_est.establishment_reference);
END $fn$;

REVOKE ALL ON FUNCTION public.set_application_establishment_target(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_application_establishment_target(uuid,uuid) TO authenticated;

-- normalized establishment input ----------------------------------------------
CREATE OR REPLACE FUNCTION public.post_license_establishment_input(_application_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH v AS (
    SELECT dc.code, x.value_text, x.value_date, x.value_uuid, x.value_json
      FROM public.form_submission_values x
      JOIN public.form_responses r ON r.id = x.response_id
      JOIN public.data_concepts dc ON dc.id = x.data_concept_id
     WHERE r.entity_type = 'application' AND r.entity_id = _application_id
       AND dc.code LIKE 'ESTABLISHMENT.%'
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', (SELECT btrim(value_text) FROM v
              WHERE code = 'ESTABLISHMENT.NAME' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'address_text', (SELECT btrim(value_text) FROM v
              WHERE code = 'ESTABLISHMENT.ADDRESS' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'address', (SELECT value_json FROM v
              WHERE code = 'ESTABLISHMENT.ADDRESS' AND jsonb_typeof(value_json) = 'object' LIMIT 1),
    'opening_date', (SELECT value_date FROM v WHERE code = 'ESTABLISHMENT.OPENING_DATE' AND value_date IS NOT NULL LIMIT 1),
    'closure_date', (SELECT value_date FROM v WHERE code = 'ESTABLISHMENT.CLOSURE_DATE' AND value_date IS NOT NULL LIMIT 1),
    'target_establishment_id', COALESCE(
        (SELECT NULLIF(a.data->'protected_establishment'->>'establishment_id','')::uuid
           FROM public.applications a WHERE a.id = _application_id),
        (SELECT value_uuid FROM v WHERE code = 'ESTABLISHMENT.TARGET_ID' AND value_uuid IS NOT NULL LIMIT 1),
        (SELECT btrim(value_text)::uuid FROM v
          WHERE code = 'ESTABLISHMENT.TARGET_ID'
            AND btrim(COALESCE(value_text,'')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LIMIT 1))
  ))
$fn$;

CREATE OR REPLACE FUNCTION public.next_establishment_reference()
RETURNS text LANGUAGE sql VOLATILE SET search_path TO 'public' AS $fn$
  SELECT 'EST-' || to_char(now(),'YYYY') || '-' ||
         lpad(nextval('public.regulated_establishment_ref_seq')::text, 6, '0')
$fn$;

-- effect map ------------------------------------------------------------------
ALTER TABLE public.post_license_effect_map
  DROP CONSTRAINT post_license_effect_map_effect_kind_check;
ALTER TABLE public.post_license_effect_map
  ADD CONSTRAINT post_license_effect_map_effect_kind_check
  CHECK (effect_kind = ANY (ARRAY['RENEWAL','ENTITY_CHANGE','NOTIFICATION_ACK',
                                  'ESTABLISHMENT_OPEN','ESTABLISHMENT_CLOSE','UNSUPPORTED']));

UPDATE public.post_license_effect_map
   SET effect_kind = 'ESTABLISHMENT_OPEN',
       canonical_target = 'regulated_establishments + regulated_establishment_events',
       handler = 'establishment_open',
       is_supported = true,
       blocker_class = NULL,
       bcr_reason = NULL,
       notes = 'F5-B3P: opens exactly one canonical branch establishment with append-only opening event.',
       updated_at = now()
 WHERE service_code = 'PLS_NEW_BRANCH';

UPDATE public.post_license_effect_map
   SET effect_kind = 'ESTABLISHMENT_CLOSE',
       canonical_target = 'regulated_establishments + regulated_establishment_events',
       handler = 'establishment_close',
       is_supported = true,
       blocker_class = NULL,
       bcr_reason = NULL,
       notes = 'F5-B3P: closes the bound canonical branch establishment, preserving all opening history.',
       updated_at = now()
 WHERE service_code = 'PLS_BRANCH_CLOSURE';

-- planner ---------------------------------------------------------------------
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
    'change_items', jsonb_array_length(v_items),
    'establishment_input', CASE WHEN v_map.effect_kind IN ('ESTABLISHMENT_OPEN','ESTABLISHMENT_CLOSE')
                                THEN v_est_in ELSE NULL END,
    'state', v_state,
    'code', CASE WHEN v_state NOT IN ('READY','APPLIED') THEN COALESCE(v_est_code, v_blockers->0->>'code')
                 ELSE v_state END,
    'blockers', v_blockers);
END $function$;

-- executor --------------------------------------------------------------------
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