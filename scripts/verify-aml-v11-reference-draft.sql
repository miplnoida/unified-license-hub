-- ============================================================================
-- AML-CFT-RBA v1.1 — MIPL reference decision lock + governed draft creation
-- Verifier gates REF-01 .. REF-18. Read-only except for two negative probes,
-- both of which are rolled back to a savepoint.
-- Run: psql -v ON_ERROR_STOP=1 -f scripts/verify-aml-v11-reference-draft.sql
-- ============================================================================
\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_v10  uuid;
  v_v11  uuid;
  v_n    int;
  v_t    text;
  v_ok   boolean;
  v_msg  text;

BEGIN
  -- Negative probes must be refused by the business rule, not by missing
  -- authentication: adopt the methodology administrator identity first.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT id::text FROM auth.users
                              WHERE email = 'super_admin@mishainfotech.com'),
                      'role', 'authenticated')::text, true);

  SELECT id INTO v_v10 FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND domain_code = 'AML_CFT' AND version = '1.0';
  SELECT id INTO v_v11 FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND domain_code = 'AML_CFT' AND version = '1.1';

  ---------------------------------------------------------------- REF-01 ----
  SELECT status INTO v_t FROM public.supervisory_methodology WHERE id = v_v10;
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v10 AND active;
  IF v_t = 'ACTIVE' AND v_n = 41 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-01 PASS v1.0 still ACTIVE with 41 questions';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-01 FAIL v1.0 status=% questions=%', v_t, v_n;
  END IF;

  ---------------------------------------------------------------- REF-02 ----
  SELECT status INTO v_t FROM public.supervisory_methodology WHERE id = v_v11;
  SELECT count(*) INTO v_n FROM public.supervisory_methodology
   WHERE id = v_v11 AND supersedes_id = v_v10;
  IF v_t = 'DRAFT' AND v_n = 1 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-02 PASS v1.1 is DRAFT and supersedes v1.0';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-02 FAIL v1.1 status=% supersedes_v10=%', v_t, v_n;
  END IF;

  ---------------------------------------------------------------- REF-03 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v11 AND active;
  IF v_n = 70 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-03 PASS v1.1 carries 70 active questions';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-03 FAIL v1.1 active questions = %', v_n;
  END IF;

  ---------------------------------------------------------------- REF-04 ----
  SELECT count(*) INTO v_n FROM (
    SELECT question_class, count(*) c FROM public.supervisory_methodology_question
     WHERE methodology_id = v_v11 AND active GROUP BY 1) s
   WHERE (question_class, c) IN (('CORE',48),('CONDITIONAL',16),('ENHANCED',6));
  IF v_n = 3 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-04 PASS class split 48 CORE / 16 CONDITIONAL / 6 ENHANCED';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-04 FAIL class split matched % of 3 expected groups', v_n;
  END IF;

  ---------------------------------------------------------------- REF-05 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v11 AND active
     AND mandatory <> (question_class = 'CORE');
  IF v_n = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-05 PASS mandatory burden equals the CORE class exactly';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-05 FAIL % questions where mandatory <> CORE', v_n;
  END IF;

  ---------------------------------------------------------------- REF-06 ----
  SELECT count(*) INTO v_n FROM (
    SELECT axis, count(*) c FROM public.supervisory_methodology_question
     WHERE methodology_id = v_v11 AND active GROUP BY 1) s
   WHERE (axis, c) IN (('INHERENT_EXPOSURE',17),('DESIGN',14),('OPERATING',27),('DESIGN_AND_OPERATING',12));
  IF v_n = 4 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-06 PASS axis split 17 / 14 / 27 / 12 as designed';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-06 FAIL axis split matched % of 4 expected groups', v_n;
  END IF;

  ---------------------------------------------------------------- REF-07 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v11 AND active
     AND calculation_participation = 'CONTEXTUAL_NOT_SCORED'
     AND question_code = 'IR-GEO-03';
  IF v_n = 1 AND (SELECT count(*) FROM public.supervisory_methodology_question
                   WHERE methodology_id = v_v11 AND active
                     AND calculation_participation = 'CONTEXTUAL_NOT_SCORED') = 1 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-07 PASS exactly one contextual non-scored question (IR-GEO-03)';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-07 FAIL contextual non-scored set is not exactly IR-GEO-03';
  END IF;

  ---------------------------------------------------------------- REF-08 ----
  -- Semantics are resolved through the version's OWN immutable profile set.
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question q
   WHERE q.methodology_id = v_v11 AND q.active
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_semantic_profile p
                      WHERE p.id = q.response_semantics_profile_id
                        AND p.methodology_id = v_v11
                        AND p.semantic_code = q.response_semantics_code
                        AND p.active);
  IF v_n = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-08 PASS every question resolves to a version-owned response-semantics profile';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-08 FAIL % questions have no published semantics profile', v_n;
  END IF;

  ---------------------------------------------------------------- REF-09 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v11 AND active
     AND (evidence_basis_types IS NULL OR cardinality(evidence_basis_types) = 0);
  IF v_n = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-09 PASS every question declares an accepted evidence basis';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-09 FAIL % questions declare no evidence basis', v_n;
  END IF;

  ---------------------------------------------------------------- REF-10 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v11 AND active
     AND ((allow_not_applicable AND COALESCE(btrim(na_conditions),'') = '')
       OR NOT na_requires_rationale);
  IF v_n = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-10 PASS N/A is enumerated where permitted and always needs a rationale';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-10 FAIL % questions breach the N/A discipline', v_n;
  END IF;

  ---------------------------------------------------------------- REF-11 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question
   WHERE methodology_id = v_v11 AND active
     AND (change_classification IS NULL
          OR (change_classification <> 'NEW' AND predecessor_mapping IS NULL));
  IF v_n = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-11 PASS every carried-forward question records its v1.0 predecessor';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-11 FAIL % questions lack change classification or predecessor', v_n;
  END IF;

  ---------------------------------------------------------------- REF-12 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_fact_requirement
   WHERE methodology_id = v_v11;
  IF v_n = 87 AND (SELECT count(*) FROM public.supervisory_methodology_fact_requirement
                    WHERE methodology_id = v_v11 AND data_type IS NULL) = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-12 PASS 87 fact requirements persisted, all typed';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-12 FAIL fact requirements = % (untyped rows may exist)', v_n;
  END IF;

  ---------------------------------------------------------------- REF-13 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_question_fact f
    JOIN public.supervisory_methodology_question q ON q.id = f.question_id
   WHERE q.methodology_id = v_v11;
  IF v_n = 88 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-13 PASS 88 question-to-fact requirements linked';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-13 FAIL question-to-fact links = % (expected 88)', v_n;
  END IF;

  ---------------------------------------------------------------- REF-14 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_parameter
   WHERE methodology_id = v_v11;
  IF v_n = 8 AND (SELECT count(*) FROM public.supervisory_methodology_parameter
                   WHERE methodology_id = v_v11
                     AND (approval_status <> 'UNAPPROVED'
                          OR value_numeric IS NOT NULL OR value_text IS NOT NULL)) = 0 THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'REF-14 PASS 8 materiality parameters registered, all unapproved and valueless';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-14 FAIL materiality parameter state is not empty/unapproved (n=%)', v_n;
  END IF;

  ---------------------------------------------------------------- REF-15 ----
  SELECT count(*) INTO v_n FROM public.supervisory_methodology_reference_decision
   WHERE methodology_code = 'AML-CFT-RBA' AND methodology_version = '1.1';
  IF v_n = 10
     AND (SELECT count(*) FROM public.supervisory_methodology_reference_decision
           WHERE methodology_code = 'AML-CFT-RBA' AND methodology_version = '1.1'
             AND (approval_scope <> 'MIPL_REFERENCE_APPROVAL'
                  OR regulator_approval_recorded OR customer_adoption_recorded)) = 0 THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'REF-15 PASS 10 reference decisions recorded, none claiming regulator or customer approval';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-15 FAIL reference decision register is not 10 reference-only rows (n=%)', v_n;
  END IF;

  ---------------------------------------------------------------- REF-16 ----
  -- v1.0 is structurally frozen: a question change must be refused.
  BEGIN
    v_ok := false;
    BEGIN
      PERFORM public.supervisory_methodology_question_purge(
        v_v10, 'Negative probe: the active version must refuse a question purge.');
    EXCEPTION WHEN OTHERS THEN
      v_ok := true; v_msg := SQLERRM;
    END;
    IF v_ok THEN
      v_pass := v_pass + 1; RAISE NOTICE 'REF-16 PASS v1.0 refused a question change (%)', left(v_msg, 60);
    ELSE
      v_fail := v_fail + 1; RAISE WARNING 'REF-16 FAIL v1.0 accepted a question change';
    END IF;
  END;

  ---------------------------------------------------------------- REF-17 ----
  SELECT count(*) INTO v_n FROM public.supervisory_assessment
   WHERE methodology_id = v_v11;
  IF v_n = 0 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-17 PASS no assessment is bound to the unapproved v1.1 draft';
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-17 FAIL % assessments already bound to v1.1', v_n;
  END IF;

  ---------------------------------------------------------------- REF-18 ----
  -- The reference-decision operation cannot express a regulator approval.
  v_ok := false;
  BEGIN
    PERFORM public.supervisory_methodology_reference_decision_record(jsonb_build_array(
      jsonb_build_object(
        'domain_code','AML_CFT','methodology_code','AML-CFT-RBA','methodology_version','1.1',
        'decision_code','REF-PROBE','title','Negative probe',
        'decision_text','Attempt to record a regulator approval through the reference operation.',
        'approval_scope','REGULATOR_APPROVAL',
        'rationale','Negative probe asserting reference approval cannot masquerade as regulator approval.')));
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  IF v_ok THEN
    v_pass := v_pass + 1; RAISE NOTICE 'REF-18 PASS regulator approval refused by the reference operation (%)', left(v_msg, 60);
  ELSE
    v_fail := v_fail + 1; RAISE WARNING 'REF-18 FAIL reference operation accepted a regulator approval';
  END IF;

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'AML v1.1 reference draft: % PASS, % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'AML v1.1 reference draft verification failed: % gate(s)', v_fail;
  END IF;
END $verify$;
