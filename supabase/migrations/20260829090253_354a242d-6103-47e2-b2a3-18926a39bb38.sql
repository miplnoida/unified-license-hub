-- ============================================================================
-- F5-B4 — REAL FIT & PROPER LINKAGE FOR POST-LICENSING SERVICES (GAP-F5-04)
-- ============================================================================

INSERT INTO public.data_concepts
  (code, name, description, data_domain_id, data_type, cardinality,
   sensitivity_classification, value_source_type, canonical_target,
   projection_strategy, is_system, is_active)
SELECT 'PERSON.FP_INDIVIDUAL_ID',
       'Canonical fit & proper subject',
       'Canonical fit-and-proper assessable individual (fp_individuals.id) proposed by a post-licensing filing',
       (SELECT data_domain_id FROM public.data_concepts WHERE code = 'PERSON.FULL_NAME'),
       'UUID', 'MULTIPLE', 'CONFIDENTIAL', 'DERIVED', 'fp_individuals',
       'CAPTURE_ONLY', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.data_concepts WHERE code = 'PERSON.FP_INDIVIDUAL_ID');

INSERT INTO public.data_concepts
  (code, name, description, data_domain_id, data_type, cardinality,
   sensitivity_classification, value_source_type, canonical_target,
   projection_strategy, is_system, is_active)
SELECT 'PERSON.PROPOSED_ROLE',
       'Proposed regulatory role',
       'Regulatory role proposed for the fit-and-proper subject of a post-licensing filing',
       (SELECT data_domain_id FROM public.data_concepts WHERE code = 'PERSON.FULL_NAME'),
       'TEXT', 'MULTIPLE', 'CONFIDENTIAL', 'FREE_INPUT', 'fp_individual_roles',
       'CAPTURE_ONLY', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.data_concepts WHERE code = 'PERSON.PROPOSED_ROLE');

CREATE TABLE IF NOT EXISTS public.post_license_fp_subject_links (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id           uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  link_id                  uuid REFERENCES public.application_fp_links(id) ON DELETE SET NULL,
  assessment_id            uuid NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  individual_id            uuid NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  license_id               uuid,
  entity_id                uuid,
  service_id               uuid,
  service_code             text,
  subject_key              text NOT NULL,
  party_id                 uuid,
  proposed_role            text,
  provenance               text NOT NULL,
  data_concept_id          uuid,
  data_concept_code        text,
  form_field_definition_id uuid,
  response_id              uuid,
  repeat_index             integer,
  reuse_basis              text NOT NULL,
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_license_fp_subject_links_unique_subject
    UNIQUE (application_id, subject_key)
);

GRANT SELECT ON public.post_license_fp_subject_links TO authenticated;
GRANT ALL    ON public.post_license_fp_subject_links TO service_role;
REVOKE ALL   ON public.post_license_fp_subject_links FROM anon;
ALTER TABLE public.post_license_fp_subject_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp subject provenance readable by fp and licensing staff"
  ON public.post_license_fp_subject_links;
CREATE POLICY "fp subject provenance readable by fp and licensing staff"
  ON public.post_license_fp_subject_links FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid())
         OR public.has_permission(auth.uid(), 'application_management', 'view'));

CREATE OR REPLACE FUNCTION public.post_license_fp_subject_link_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
      DETAIL = 'fit-and-proper subject provenance is a permanent regulatory record';
  END IF;
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') <> 'trusted' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'fit-and-proper subject provenance is writable only through governed operations';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.application_id <> OLD.application_id
       OR NEW.assessment_id <> OLD.assessment_id OR NEW.individual_id <> OLD.individual_id
       OR NEW.subject_key <> OLD.subject_key THEN
      RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '42501',
        DETAIL = 'subject identity and linkage cannot be rewritten';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_post_license_fp_subject_link_guard ON public.post_license_fp_subject_links;
CREATE TRIGGER trg_post_license_fp_subject_link_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.post_license_fp_subject_links
  FOR EACH ROW EXECUTE FUNCTION public.post_license_fp_subject_link_guard();

REVOKE ALL ON public.application_fp_links FROM anon;

CREATE OR REPLACE FUNCTION public.protect_application_fp_subject_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted'
     OR COALESCE(current_setting('app.fp_subject_context_writer', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF (NEW.data -> 'protected_fp_subjects') IS DISTINCT FROM (OLD.data -> 'protected_fp_subjects') THEN
    IF (OLD.data -> 'protected_fp_subjects') IS NULL THEN
      NEW.data := NEW.data - 'protected_fp_subjects';
    ELSE
      NEW.data := jsonb_set(COALESCE(NEW.data,'{}'::jsonb), '{protected_fp_subjects}',
                            OLD.data -> 'protected_fp_subjects', true);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_application_fp_subject_context ON public.applications;
CREATE TRIGGER trg_protect_application_fp_subject_context
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.protect_application_fp_subject_context();

CREATE OR REPLACE FUNCTION public.set_application_fp_subject(
  _application_id uuid, _individual_id uuid, _proposed_role text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app public.applications;
  v_lic public.licenses;
  v_ind public.fp_individuals;
  v_uid uuid := auth.uid();
  v_existing jsonb;
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
          OR public.has_permission(v_uid,'application_management','edit')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = NULLIF(v_app.data->>'license_id','')::uuid;
  IF v_lic.id IS NULL THEN
    RAISE EXCEPTION 'LICENSE_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ind FROM public.fp_individuals WHERE id = _individual_id;
  IF v_ind.id IS NULL THEN
    RAISE EXCEPTION 'FP_SUBJECT_NOT_CANONICAL' USING ERRCODE = '22023',
      DETAIL = 'the nominated subject is not a registered fit-and-proper individual';
  END IF;

  v_existing := COALESCE(v_app.data -> 'protected_fp_subjects', '[]'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_existing) e
                  WHERE e->>'individual_id' = _individual_id::text) THEN
    v_existing := v_existing || jsonb_build_object(
      'individual_id', _individual_id,
      'proposed_role', NULLIF(btrim(COALESCE(_proposed_role,'')),''),
      'bound_by', v_uid, 'bound_at', now());
  END IF;

  PERFORM set_config('app.fp_subject_context_writer','on', true);
  UPDATE public.applications
     SET data = jsonb_set(COALESCE(data,'{}'::jsonb), '{protected_fp_subjects}', v_existing, true),
         updated_at = now()
   WHERE id = _application_id;
  PERFORM set_config('app.fp_subject_context_writer','', true);

  RETURN jsonb_build_object('success', true, 'application_id', _application_id,
                            'individual_id', _individual_id,
                            'subjects', jsonb_array_length(v_existing));
END $$;

CREATE OR REPLACE FUNCTION public.post_license_fp_subjects(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app        public.applications;
  v_license_id uuid;
  v_service_id uuid;
  v_svc        public.services;
  v_lic        public.licenses;
  v_code       text;
  v_subjects   jsonb := '[]'::jsonb;
  v_indicators jsonb := '[]'::jsonb;
  v_state      text;
  r            record;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('state','APPLICATION_NOT_FOUND','fp_required',false,
                              'subjects','[]'::jsonb,'indicators','[]'::jsonb);
  END IF;

  v_license_id := NULLIF(v_app.data->>'license_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;

  IF public.post_license_service_applicability(v_service_id, v_license_id) <> 'OK' THEN
    RETURN jsonb_build_object('application_id',_application_id,'state','NOT_POST_LICENSE',
                              'fp_required',false,'subjects','[]'::jsonb,'indicators','[]'::jsonb);
  END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = v_service_id;
  SELECT * INTO v_lic FROM public.licenses WHERE id = v_license_id;
  v_code := public.post_license_effect_key(v_service_id);

  IF NOT COALESCE(v_svc.requires_fit_and_proper, false) THEN
    RETURN jsonb_build_object('application_id',_application_id,'license_id',v_license_id,
      'service_id',v_service_id,'service_code',v_code,'entity_id',v_lic.holder_id,
      'state','NOT_REQUIRED','fp_required',false,
      'subjects','[]'::jsonb,'indicators','[]'::jsonb);
  END IF;

  FOR r IN
    SELECT v.id AS value_id, v.response_id, v.repeat_index, v.form_field_definition_id,
           v.data_concept_id, dc.code AS concept_code,
           COALESCE(v.value_uuid,
                    CASE WHEN btrim(COALESCE(v.value_text,'')) ~*
                              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         THEN btrim(v.value_text)::uuid END) AS individual_id
      FROM public.form_submission_values v
      JOIN public.form_responses r2 ON r2.id = v.response_id
      JOIN public.data_concepts dc ON dc.id = v.data_concept_id
     WHERE r2.entity_type = 'application' AND r2.entity_id = _application_id
       AND dc.code = 'PERSON.FP_INDIVIDUAL_ID'
     ORDER BY v.repeat_index NULLS FIRST, v.id
  LOOP
    v_indicators := v_indicators || jsonb_build_object('kind','normalized_concept',
      'concept','PERSON.FP_INDIVIDUAL_ID','canonical', r.individual_id IS NOT NULL);
    IF r.individual_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.fp_individuals i WHERE i.id = r.individual_id) THEN
      v_subjects := v_subjects || jsonb_build_object(
        'subject_key', 'CONCEPT:' || r.individual_id::text,
        'individual_id', r.individual_id,
        'party_id', NULL,
        'provenance', 'normalized_form_value',
        'proposed_role', (
          SELECT btrim(v2.value_text)
            FROM public.form_submission_values v2
            JOIN public.form_responses r3 ON r3.id = v2.response_id
            JOIN public.data_concepts dc2 ON dc2.id = v2.data_concept_id
           WHERE r3.entity_type = 'application' AND r3.entity_id = _application_id
             AND dc2.code IN ('PERSON.PROPOSED_ROLE','GOVERNANCE.ROLE')
             AND COALESCE(v2.repeat_index,-1) = COALESCE(r.repeat_index,-1)
             AND btrim(COALESCE(v2.value_text,'')) <> ''
           ORDER BY CASE WHEN dc2.code = 'PERSON.PROPOSED_ROLE' THEN 0 ELSE 1 END
           LIMIT 1),
        'license_id', v_license_id,
        'entity_id', v_lic.holder_id,
        'service_id', v_service_id,
        'service_code', v_code,
        'application_id', _application_id,
        'data_concept_id', r.data_concept_id,
        'data_concept_code', r.concept_code,
        'form_field_definition_id', r.form_field_definition_id,
        'response_id', r.response_id,
        'repeat_index', r.repeat_index);
    END IF;
  END LOOP;

  FOR r IN
    SELECT it->>'change_type' AS change_type,
           NULLIF(it->'proposed_value'->>'fp_individual_id','')::uuid AS individual_id,
           NULLIF(it->'proposed_value'->>'person_party_id','')::uuid AS person_party_id,
           NULLIF(it->'proposed_value'->>'owner_party_id','')::uuid AS owner_party_id,
           NULLIF(it->>'data_concept_id','')::uuid AS data_concept_id,
           NULLIF(it->>'form_field_definition_id','')::uuid AS ffd_id,
           it->'proposed_value'->>'role_type_key' AS role_key
      FROM jsonb_array_elements(public.post_license_change_items(_application_id)) it
     WHERE it->>'change_type' IN ('APPOINTMENT','OWNERSHIP')
  LOOP
    v_indicators := v_indicators || jsonb_build_object('kind','change_item',
      'change_type', r.change_type, 'canonical', r.individual_id IS NOT NULL,
      'party_only', r.individual_id IS NULL
                    AND (r.person_party_id IS NOT NULL OR r.owner_party_id IS NOT NULL));
    IF r.individual_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.fp_individuals i WHERE i.id = r.individual_id)
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_subjects) s
                        WHERE s->>'individual_id' = r.individual_id::text) THEN
      v_subjects := v_subjects || jsonb_build_object(
        'subject_key', 'CHANGE_ITEM:' || r.change_type || ':' || r.individual_id::text,
        'individual_id', r.individual_id,
        'party_id', COALESCE(r.person_party_id, r.owner_party_id),
        'provenance', 'governed_change_item',
        'proposed_role', COALESCE(r.role_key, r.change_type),
        'license_id', v_license_id,
        'entity_id', v_lic.holder_id,
        'service_id', v_service_id,
        'service_code', v_code,
        'application_id', _application_id,
        'data_concept_id', r.data_concept_id,
        'data_concept_code', NULL,
        'form_field_definition_id', r.ffd_id,
        'response_id', NULL,
        'repeat_index', NULL);
    END IF;
  END LOOP;

  FOR r IN
    SELECT NULLIF(e->>'individual_id','')::uuid AS individual_id,
           NULLIF(e->>'proposed_role','') AS proposed_role
      FROM jsonb_array_elements(COALESCE(v_app.data->'protected_fp_subjects','[]'::jsonb)) e
  LOOP
    v_indicators := v_indicators || jsonb_build_object('kind','protected_context',
      'canonical', r.individual_id IS NOT NULL);
    IF r.individual_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.fp_individuals i WHERE i.id = r.individual_id)
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_subjects) s
                        WHERE s->>'individual_id' = r.individual_id::text) THEN
      v_subjects := v_subjects || jsonb_build_object(
        'subject_key', 'PROTECTED:' || r.individual_id::text,
        'individual_id', r.individual_id,
        'party_id', NULL,
        'provenance', 'protected_application_context',
        'proposed_role', r.proposed_role,
        'license_id', v_license_id,
        'entity_id', v_lic.holder_id,
        'service_id', v_service_id,
        'service_code', v_code,
        'application_id', _application_id,
        'data_concept_id', NULL,
        'data_concept_code', NULL,
        'form_field_definition_id', NULL,
        'response_id', NULL,
        'repeat_index', NULL);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.form_submission_values v
      JOIN public.form_responses r2 ON r2.id = v.response_id
      JOIN public.data_concepts dc ON dc.id = v.data_concept_id
     WHERE r2.entity_type = 'application' AND r2.entity_id = _application_id
       AND dc.code = 'PERSON.FULL_NAME' AND btrim(COALESCE(v.value_text,'')) <> '') THEN
    v_indicators := v_indicators || jsonb_build_object('kind','free_text_name','canonical',false);
  END IF;

  IF jsonb_array_length(v_subjects) > 0 THEN
    v_state := 'OK';
  ELSIF jsonb_array_length(v_indicators) > 0 THEN
    v_state := 'FP_SUBJECT_NOT_CANONICAL';
  ELSE
    v_state := 'FP_SUBJECT_REQUIRED';
  END IF;

  RETURN jsonb_build_object(
    'application_id', _application_id,
    'license_id', v_license_id,
    'entity_id', v_lic.holder_id,
    'service_id', v_service_id,
    'service_code', v_code,
    'service_name', v_svc.name,
    'regulator_id', v_lic.regulator_id,
    'fp_required', true,
    'state', v_state,
    'required_count', jsonb_array_length(v_subjects),
    'subjects', v_subjects,
    'indicators', v_indicators);
END $$;

REVOKE ALL ON FUNCTION public.post_license_fp_subjects(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_license_fp_subjects(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.post_license_fp_subjects(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.ensure_post_license_fp_links(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_res      jsonb;
  v_actor    uuid := public.workflow_effect_actor();
  v_subject  jsonb;
  v_created  int := 0;
  v_reused   int := 0;
  v_existing int := 0;
  v_assessment uuid;
  v_link_id  uuid;
  v_basis    text;
  v_lic      public.licenses;
  v_details  jsonb := '[]'::jsonb;
BEGIN
  IF COALESCE(current_setting('app.workflow_mutation_context', true), '') <> 'trusted' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'ensure_post_license_fp_links is only callable from a governed server context';
  END IF;

  v_res := public.post_license_fp_subjects(_application_id);

  IF v_res->>'state' IN ('NOT_REQUIRED','NOT_POST_LICENSE','APPLICATION_NOT_FOUND') THEN
    RETURN jsonb_build_object('success', true, 'fp_required', false,
                              'state', v_res->>'state', 'created', 0, 'reused', 0);
  END IF;

  IF v_res->>'state' <> 'OK' THEN
    RETURN jsonb_build_object('success', false, 'fp_required', true,
      'state', v_res->>'state', 'code', v_res->>'state',
      'created', 0, 'reused', 0, 'subjects', v_res->'subjects',
      'indicators', v_res->'indicators');
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = (v_res->>'license_id')::uuid;

  FOR v_subject IN SELECT * FROM jsonb_array_elements(v_res->'subjects') LOOP
    SELECT sl.assessment_id INTO v_assessment
      FROM public.post_license_fp_subject_links sl
     WHERE sl.application_id = _application_id
       AND sl.subject_key = v_subject->>'subject_key';
    IF v_assessment IS NOT NULL THEN
      v_existing := v_existing + 1;
      CONTINUE;
    END IF;

    v_assessment := NULL;
    v_basis := NULL;

    SELECT a.id INTO v_assessment
      FROM public.fp_assessments a
     WHERE a.individual_id = (v_subject->>'individual_id')::uuid
       AND a.licensee_id IS NOT DISTINCT FROM (v_res->>'entity_id')::uuid
       AND COALESCE(a.status,'') NOT IN ('withdrawn')
       AND EXISTS (
         SELECT 1 FROM public.fp_determinations d
          WHERE d.assessment_id = a.id AND d.is_current
            AND lower(d.outcome) = ANY (public.fp_positive_outcomes())
            AND (d.effective_from IS NULL OR d.effective_from <= current_date)
            AND (d.effective_to   IS NULL OR d.effective_to   >= current_date))
     ORDER BY a.updated_at DESC NULLS LAST
     LIMIT 1;

    IF v_assessment IS NOT NULL THEN
      v_basis := 'REUSED_CURRENT_POSITIVE_DETERMINATION';
      v_reused := v_reused + 1;
    ELSE
      SELECT a.id INTO v_assessment
        FROM public.fp_assessments a
       WHERE a.individual_id = (v_subject->>'individual_id')::uuid
         AND a.licensee_id IS NOT DISTINCT FROM (v_res->>'entity_id')::uuid
         AND COALESCE(a.status,'') IN ('draft','submitted','screening','awaiting_committee')
       ORDER BY a.created_at DESC
       LIMIT 1;
      IF v_assessment IS NOT NULL THEN
        v_basis := 'REUSED_IN_FLIGHT_ASSESSMENT';
        v_reused := v_reused + 1;
      END IF;
    END IF;

    IF v_assessment IS NULL THEN
      INSERT INTO public.fp_assessments
        (individual_id, licensee_id, regulator_id, assessment_type, status,
         declaration_data, created_by)
      VALUES ((v_subject->>'individual_id')::uuid,
              (v_res->>'entity_id')::uuid,
              v_lic.regulator_id,
              'triggered', 'draft',
              jsonb_build_object(
                'source','post_licensing_service',
                'application_id', _application_id,
                'service_id', v_res->>'service_id',
                'service_code', v_res->>'service_code',
                'license_id', v_res->>'license_id',
                'proposed_role', v_subject->>'proposed_role',
                'subject_provenance', v_subject->>'provenance'),
              v_actor)
      RETURNING id INTO v_assessment;
      v_basis := 'CREATED_FOR_FILING';
      v_created := v_created + 1;
    END IF;

    INSERT INTO public.application_fp_links
      (application_id, assessment_id, role_note, is_required, linked_by)
    VALUES (_application_id, v_assessment,
            COALESCE(v_subject->>'proposed_role', v_res->>'service_code'), true, v_actor)
    ON CONFLICT (application_id, assessment_id) DO UPDATE
      SET is_required = true
    RETURNING id INTO v_link_id;

    INSERT INTO public.post_license_fp_subject_links
      (application_id, link_id, assessment_id, individual_id, license_id, entity_id,
       service_id, service_code, subject_key, party_id, proposed_role, provenance,
       data_concept_id, data_concept_code, form_field_definition_id, response_id,
       repeat_index, reuse_basis, created_by)
    VALUES (_application_id, v_link_id, v_assessment,
            (v_subject->>'individual_id')::uuid,
            (v_res->>'license_id')::uuid, (v_res->>'entity_id')::uuid,
            (v_res->>'service_id')::uuid, v_res->>'service_code',
            v_subject->>'subject_key',
            NULLIF(v_subject->>'party_id','')::uuid,
            v_subject->>'proposed_role',
            v_subject->>'provenance',
            NULLIF(v_subject->>'data_concept_id','')::uuid,
            v_subject->>'data_concept_code',
            NULLIF(v_subject->>'form_field_definition_id','')::uuid,
            NULLIF(v_subject->>'response_id','')::uuid,
            NULLIF(v_subject->>'repeat_index','')::int,
            v_basis, v_actor);

    v_details := v_details || jsonb_build_object(
      'individual_id', v_subject->>'individual_id',
      'assessment_id', v_assessment,
      'reuse_basis', v_basis,
      'provenance', v_subject->>'provenance');
  END LOOP;

  PERFORM public.create_audit_log(v_actor, 'post_license.fp.linkage_ensured', 'application',
    _application_id::text, NULL,
    jsonb_build_object('created', v_created, 'reused', v_reused, 'already_linked', v_existing,
                       'subjects', v_res->'subjects', 'details', v_details), NULL);

  RETURN jsonb_build_object('success', true, 'fp_required', true, 'state','OK',
    'required_count', v_res->>'required_count',
    'created', v_created, 'reused', v_reused, 'already_linked', v_existing,
    'details', v_details);
END $$;

REVOKE ALL ON FUNCTION public.ensure_post_license_fp_links(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_post_license_fp_links(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_post_license_fp_links(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.post_license_fp_satisfied(_application_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_res jsonb;
  v_subject jsonb;
BEGIN
  v_res := public.post_license_fp_subjects(_application_id);

  IF v_res->>'state' IN ('NOT_REQUIRED','NOT_POST_LICENSE') THEN
    RETURN true;
  END IF;
  IF v_res->>'state' <> 'OK' THEN
    RETURN false;
  END IF;
  IF COALESCE((v_res->>'required_count')::int, 0) = 0 THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.application_fp_links l
                  WHERE l.application_id = _application_id AND COALESCE(l.is_required,true)) THEN
    RETURN false;
  END IF;

  FOR v_subject IN SELECT * FROM jsonb_array_elements(v_res->'subjects') LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.application_fp_links l
        JOIN public.fp_assessments a ON a.id = l.assessment_id
        JOIN public.fp_determinations d ON d.assessment_id = a.id
       WHERE l.application_id = _application_id
         AND COALESCE(l.is_required,true)
         AND a.individual_id = (v_subject->>'individual_id')::uuid
         AND d.is_current
         AND lower(d.outcome) = ANY (public.fp_positive_outcomes())
         AND d.individual_id = a.individual_id
         AND (d.effective_from IS NULL OR d.effective_from <= current_date)
         AND (d.effective_to   IS NULL OR d.effective_to   >= current_date)
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.post_license_fp_overview(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app public.applications;
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_staff boolean;
  v_member boolean;
  v_links jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_staff := public.is_fp_staff(v_uid)
             OR public.has_permission(v_uid,'application_management','view');
  v_member := v_app.applicant_id = v_uid
              OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                          WHERE m.entity_id = v_app.entity_id AND m.user_id = v_uid
                            AND m.status = 'APPROVED');
  IF NOT (v_staff OR v_member) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_res := public.post_license_fp_subjects(_application_id);

  IF NOT COALESCE((v_res->>'fp_required')::boolean, false) THEN
    RETURN jsonb_build_object('found', true, 'fp_required', false,
                              'state', v_res->>'state', 'audience',
                              CASE WHEN v_staff THEN 'regulator' ELSE 'entity' END);
  END IF;

  IF NOT v_staff THEN
    RETURN jsonb_build_object('found', true, 'fp_required', true, 'audience','entity',
      'state', v_res->>'state',
      'safe_status', CASE WHEN public.post_license_fp_satisfied(_application_id)
                          THEN 'Fit & Proper assessment complete'
                          ELSE 'Fit & Proper assessment pending' END,
      'subject_count', v_res->>'required_count');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'link_id', l.id,
           'assessment_id', a.id,
           'assessment_status', a.status,
           'assessment_type', a.assessment_type,
           'individual_id', a.individual_id,
           'subject_name', i.full_name,
           'proposed_role', COALESCE(sl.proposed_role, l.role_note),
           'provenance', sl.provenance,
           'reuse_basis', sl.reuse_basis,
           'is_required', COALESCE(l.is_required, true),
           'determination', d.outcome,
           'determined_at', d.determined_at,
           'effective_from', d.effective_from,
           'effective_to', d.effective_to,
           'is_current', d.is_current,
           'href', '/fpa/assessments/' || a.id
         ) ORDER BY i.full_name), '[]'::jsonb)
    INTO v_links
    FROM public.application_fp_links l
    JOIN public.fp_assessments a ON a.id = l.assessment_id
    LEFT JOIN public.fp_individuals i ON i.id = a.individual_id
    LEFT JOIN public.post_license_fp_subject_links sl ON sl.link_id = l.id
    LEFT JOIN LATERAL (
      SELECT outcome, determined_at, effective_from, effective_to, is_current
        FROM public.fp_determinations
       WHERE assessment_id = a.id AND is_current
       ORDER BY determined_at DESC NULLS LAST LIMIT 1) d ON true
   WHERE l.application_id = _application_id;

  RETURN jsonb_build_object('found', true, 'fp_required', true, 'audience','regulator',
    'state', v_res->>'state',
    'service_code', v_res->>'service_code',
    'service_name', v_res->>'service_name',
    'required_count', v_res->>'required_count',
    'subjects', v_res->'subjects',
    'links', v_links,
    'satisfied', public.post_license_fp_satisfied(_application_id));
END $$;

REVOKE ALL ON FUNCTION public.post_license_fp_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_license_fp_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_license_fp_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_application_fp_subject(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_application_fp_subject(uuid, uuid, text) FROM anon;