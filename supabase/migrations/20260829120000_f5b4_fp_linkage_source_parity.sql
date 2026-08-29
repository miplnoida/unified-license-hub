-- F5-B4 — SOURCE PARITY MIGRATION (fit & proper linkage for post-licensing)
--
-- The B4 runtime contract was applied to the live database ahead of source
-- control. This forward migration captures the EXACT live definitions of the
-- objects that make up the B4 contract so a repository reset + forward
-- migration reproduces it. It rewrites nothing else.
--
--   * ensure_post_license_fp_links            — governed canonical linkage
--   * post_license_fp_subjects                — server-authoritative subjects
--   * post_license_fp_readiness               — graded F&P readiness resolver
--   * post_license_fp_overview                — audience-safe read model
--   * post_license_effect_plan                — graded F&P blockers
--   * assert_post_license_fp_effect_alignment — subject → effect invariant
--   * apply_post_license_effect               — asserts alignment before effects
--   * submit_application                      — orchestrates linkage on submit
--   * provenance immutability, grants and RLS

-- ---------------------------------------------------------------- public.ensure_post_license_fp_links(uuid)
CREATE OR REPLACE FUNCTION public.ensure_post_license_fp_links(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$

;

-- ---------------------------------------------------------------- public.post_license_fp_subjects(uuid)
CREATE OR REPLACE FUNCTION public.post_license_fp_subjects(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$

;

-- ---------------------------------------------------------------- public.post_license_fp_readiness(uuid)
CREATE OR REPLACE FUNCTION public.post_license_fp_readiness(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res     jsonb;
  v_subj    jsonb;
  v_missing int := 0;
  v_linked  int := 0;
  v_pos     int := 0;
  v_links   int := 0;
  v_state   text;
  v_total   int;
BEGIN
  v_res := public.post_license_fp_subjects(_application_id);

  IF v_res->>'state' IN ('NOT_REQUIRED','NOT_POST_LICENSE','APPLICATION_NOT_FOUND') THEN
    RETURN jsonb_build_object('fp_required', false, 'state','NOT_REQUIRED', 'satisfied', true,
                              'subject_count', 0, 'link_count', 0, 'linked_subjects', 0,
                              'positive_count', 0);
  END IF;

  SELECT count(*) INTO v_links
    FROM public.application_fp_links l
   WHERE l.application_id = _application_id AND COALESCE(l.is_required, true);

  IF v_res->>'state' <> 'OK' THEN
    RETURN jsonb_build_object('fp_required', true, 'state', v_res->>'state', 'satisfied', false,
                              'subject_count', 0, 'link_count', v_links, 'linked_subjects', 0,
                              'positive_count', 0);
  END IF;

  v_total := jsonb_array_length(v_res->'subjects');

  FOR v_subj IN SELECT * FROM jsonb_array_elements(v_res->'subjects') LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.application_fp_links l
        JOIN public.fp_assessments a ON a.id = l.assessment_id
       WHERE l.application_id = _application_id
         AND COALESCE(l.is_required, true)
         AND a.individual_id = (v_subj->>'individual_id')::uuid
    ) THEN
      v_missing := v_missing + 1;
      CONTINUE;
    END IF;

    v_linked := v_linked + 1;

    IF EXISTS (
      SELECT 1
        FROM public.application_fp_links l
        JOIN public.fp_assessments a ON a.id = l.assessment_id
        JOIN public.fp_determinations d ON d.assessment_id = a.id
       WHERE l.application_id = _application_id
         AND COALESCE(l.is_required, true)
         AND a.individual_id = (v_subj->>'individual_id')::uuid
         AND d.individual_id = a.individual_id
         AND d.is_current
         AND lower(d.outcome) = ANY (public.fp_positive_outcomes())
         AND (d.effective_from IS NULL OR d.effective_from <= current_date)
         AND (d.effective_to   IS NULL OR d.effective_to   >= current_date)
    ) THEN
      v_pos := v_pos + 1;
    END IF;
  END LOOP;

  v_state := CASE
               WHEN v_total = 0 THEN 'FP_SUBJECT_REQUIRED'
               WHEN v_missing > 0 THEN 'FP_LINK_REQUIRED'
               WHEN v_pos < v_total THEN 'FP_DETERMINATION_REQUIRED'
               ELSE 'OK'
             END;

  RETURN jsonb_build_object(
    'fp_required', true,
    'state', v_state,
    'satisfied', v_state = 'OK',
    'subject_count', v_total,
    'link_count', v_links,
    'linked_subjects', v_linked,
    'missing_links', v_missing,
    'positive_count', v_pos,
    'service_code', v_res->>'service_code');
END $function$

;

-- ---------------------------------------------------------------- public.post_license_fp_overview(uuid)
CREATE OR REPLACE FUNCTION public.post_license_fp_overview(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$

;

-- ---------------------------------------------------------------- public.post_license_effect_plan(uuid)
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
    -- F5-B4: graded, safe blocker metadata — subject resolution, then explicit
    -- linkage, then determination. No screening detail is exposed here.
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
    'state', v_state,
    'code', CASE WHEN v_state NOT IN ('READY','APPLIED') THEN COALESCE(v_est_code, v_fp_code, v_blockers->0->>'code')
                 ELSE v_state END,
    'blockers', v_blockers);
END $function$

;

-- ---------------------------------------------------------------- public.assert_post_license_fp_effect_alignment(uuid)
CREATE OR REPLACE FUNCTION public.assert_post_license_fp_effect_alignment(_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res   jsonb;
  v_subj  jsonb;
  v_prov  int;
  v_total int;
BEGIN
  v_res := public.post_license_fp_subjects(_application_id);

  IF NOT COALESCE((v_res->>'fp_required')::boolean, false) THEN
    RETURN;
  END IF;

  IF v_res->>'state' <> 'OK' THEN
    RAISE EXCEPTION 'FP_EFFECT_ALIGNMENT_FAILED' USING ERRCODE = '22023',
      DETAIL = COALESCE(v_res->>'state','FP_SUBJECT_REQUIRED');
  END IF;

  v_total := jsonb_array_length(v_res->'subjects');

  SELECT count(*) INTO v_prov
    FROM public.post_license_fp_subject_links sl
   WHERE sl.application_id = _application_id;

  IF v_prov <> v_total THEN
    RAISE EXCEPTION 'FP_EFFECT_ALIGNMENT_FAILED' USING ERRCODE = '22023',
      DETAIL = format('subject/provenance cardinality mismatch (subjects=%s provenance=%s)', v_total, v_prov);
  END IF;

  FOR v_subj IN SELECT * FROM jsonb_array_elements(v_res->'subjects') LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.post_license_fp_subject_links sl
        JOIN public.application_fp_links l
             ON l.id = sl.link_id AND l.application_id = sl.application_id
        JOIN public.fp_assessments a
             ON a.id = l.assessment_id AND a.id = sl.assessment_id
        JOIN public.fp_determinations d
             ON d.assessment_id = a.id AND d.individual_id = a.individual_id
       WHERE sl.application_id = _application_id
         AND sl.subject_key    = v_subj->>'subject_key'
         AND sl.individual_id  = (v_subj->>'individual_id')::uuid
         AND a.individual_id   = sl.individual_id
         AND sl.entity_id  IS NOT DISTINCT FROM (v_res->>'entity_id')::uuid
         AND sl.license_id IS NOT DISTINCT FROM (v_res->>'license_id')::uuid
         AND sl.service_id IS NOT DISTINCT FROM (v_res->>'service_id')::uuid
         AND COALESCE(l.is_required, true)
         AND d.is_current
         AND lower(d.outcome) = ANY (public.fp_positive_outcomes())
         AND (d.effective_from IS NULL OR d.effective_from <= current_date)
         AND (d.effective_to   IS NULL OR d.effective_to   >= current_date)
    ) THEN
      RAISE EXCEPTION 'FP_EFFECT_ALIGNMENT_FAILED' USING ERRCODE = '22023',
        DETAIL = format('subject %s has no aligned assessed positive determination for this filing',
                        COALESCE(v_subj->>'individual_id','unknown'));
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.post_license_change_items(_application_id)) it
     WHERE it->>'change_type' = 'APPOINTMENT'
       AND NULLIF(it->'proposed_value'->>'fp_individual_id','') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.post_license_fp_subject_links sl
          WHERE sl.application_id = _application_id
            AND sl.individual_id = (it->'proposed_value'->>'fp_individual_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'FP_EFFECT_SUBJECT_MISMATCH' USING ERRCODE = '22023',
      DETAIL = 'a structural appointment targets an individual who was not fit-and-proper assessed on this filing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.post_license_change_items(_application_id)) it
     WHERE it->>'change_type' = 'APPOINTMENT'
       AND NULLIF(it->'proposed_value'->>'fp_individual_id','') IS NULL
  ) THEN
    RAISE EXCEPTION 'FP_EFFECT_SUBJECT_AMBIGUOUS' USING ERRCODE = '22023',
      DETAIL = 'a structural appointment carries no canonical fit-and-proper individual';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.post_license_change_items(_application_id)) it
     WHERE it->>'change_type' = 'OWNERSHIP'
       AND NULLIF(it->'proposed_value'->>'fp_individual_id','') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.post_license_fp_subject_links sl
          WHERE sl.application_id = _application_id
            AND sl.individual_id = (it->'proposed_value'->>'fp_individual_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'FP_EFFECT_SUBJECT_MISMATCH' USING ERRCODE = '22023',
      DETAIL = 'an ownership/control change names a natural person who was not assessed on this filing';
  END IF;
END $function$

;

-- ---------------------------------------------------------------- public.apply_post_license_effect(uuid)
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

  -- F5-B4: prove subject to effect alignment BEFORE any F&P-sensitive
  -- structural effect is applied.
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
END $function$

;

-- ---------------------------------------------------------------- public.submit_application(uuid,text)
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

  -- F5-B2 DELTA: classification is canonical (licence binding + applicable F5
  -- service) and is decided BEFORE authority, so delegation cannot leak into
  -- initial (F4) licensing.
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

  -- Authority. Creator/applicant always; entity delegation for F5 filings only.
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
  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'error','No completed payment found — please complete payment first',
      'code','PAYMENT_REQUIRED','http',402
    );
  END IF;

  -- GAP-F5-01 / GAP-F5-15: re-derive taxonomy from the licence at submission
  -- and refuse any ineligible binding.
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
  END IF;


  -- F5-B4: governed fit-and-proper orchestration. For a genuine F5 filing whose
  -- service requires F&P, the canonical subject set must resolve BEFORE the
  -- filing becomes submitted and before any workflow starts. Linkage failure
  -- rolls the whole submission back. F4 initial licensing is untouched.
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
      'applicant_id', v_app.applicant_id
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
    'fp_linkage', v_fp_link
  );
END;
$function$

;

-- ---------------------------------------------------------------- privilege model
REVOKE ALL ON TABLE public.application_fp_links FROM authenticated;
REVOKE ALL ON TABLE public.post_license_fp_subject_links FROM authenticated;
REVOKE ALL ON FUNCTION public.ensure_post_license_fp_links(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.post_license_fp_subjects(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.post_license_fp_subject_link_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.protect_application_fp_subject_context() FROM anon, authenticated, PUBLIC;
ALTER TABLE public.post_license_fp_subject_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.post_license_fp_subject_links TO service_role;
GRANT ALL ON TABLE public.application_fp_links TO service_role;
