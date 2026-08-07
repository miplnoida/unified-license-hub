-- Phase 3 / FP-REG-004 — PQ lifecycle, amendment and version integrity
BEGIN;
SELECT plan(21);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3101', 'p3-pq-super@test'),
  ('00000000-0000-0000-0000-0000000f3102', 'p3-pq-declarant@test'),
  ('00000000-0000-0000-0000-0000000f3103', 'p3-pq-outsider@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3101', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_ind uuid := '00000000-0000-0000-0000-0000000f3120';
  v_tpl uuid := '00000000-0000-0000-0000-0000000f3130';
  v_v1  uuid := '00000000-0000-0000-0000-0000000f3131';
  v_v2  uuid := '00000000-0000-0000-0000-0000000f3132';
  v_asm uuid := '00000000-0000-0000-0000-0000000f3140';
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status) VALUES (v_ind, 'P3 PQ Subject', 'active')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.form_templates (id, name, form_type, status)
    VALUES (v_tpl, 'P3 Personal Questionnaire', 'fit_and_proper', 'published')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.form_versions (id, template_id, version, semantic_version, status, schema_snapshot, published_at)
    VALUES (v_v1, v_tpl, 1, '1.0.0', 'published',
            jsonb_build_object('fields', jsonb_build_array(
              jsonb_build_object('key','criminal_record','label','Any criminal record?'))),
            now())
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_assessments
    (id, individual_id, assessment_type, status, declaration_data,
     form_template_id, form_version_id, pq_state)
  VALUES (v_asm, v_ind, 'initial', 'draft',
          jsonb_build_object('criminal_record','no'), v_tpl, v_v1, 'draft')
  ON CONFLICT (id) DO NOTHING;
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3101","role":"authenticated"}';

-- Initial state --------------------------------------------------------------
SELECT is((SELECT pq_state FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'draft', 'a new questionnaire starts as draft');

SELECT ok((SELECT form_version_id FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140')
          IS NOT NULL, 'the questionnaire pins the form version it was answered on');

-- Submission -----------------------------------------------------------------
UPDATE public.fp_assessments
   SET pq_state = 'ready_to_submit'
 WHERE id = '00000000-0000-0000-0000-0000000f3140';
SELECT is((SELECT pq_state FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'ready_to_submit', 'a complete questionnaire becomes ready_to_submit');

UPDATE public.fp_assessments
   SET pq_state = 'submitted', submitted_at = now(),
       submitted_by = '00000000-0000-0000-0000-0000000f3102'
 WHERE id = '00000000-0000-0000-0000-0000000f3140';

SELECT is((SELECT pq_state FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'submitted', 'submission records the submitted state');
SELECT ok((SELECT submitted_at FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140')
          IS NOT NULL, 'submission stamps a timestamp');
SELECT ok((SELECT pq_state_changed_at FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140')
          IS NOT NULL, 'each state change is stamped');

-- Invalid states are rejected ------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.fp_assessments SET pq_state='approved_by_magic'
      WHERE id='00000000-0000-0000-0000-0000000f3140' $$,
  '23514', NULL, 'an unknown pq_state is rejected');

SELECT throws_ok(
  $$ UPDATE public.fp_assessments SET pq_state='amendment_required', pq_amendment_reason='no'
      WHERE id='00000000-0000-0000-0000-0000000f3140' $$,
  '23514', NULL, 'amendment_required without a substantive reason is rejected');

-- Amendment RPC --------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.fp_request_pq_amendment('00000000-0000-0000-0000-0000000f3140','short') $$,
  NULL, NULL, 'a blank/short amendment reason is rejected by the RPC');

SELECT lives_ok(
  $$ SELECT public.fp_request_pq_amendment('00000000-0000-0000-0000-0000000f3140',
       'Section 4 employment history is incomplete and must be restated in full.') $$,
  'a supervisor with fit_and_proper.edit can request an amendment');

SELECT is((SELECT pq_state FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'amendment_required', 'the amendment request moves the questionnaire to amendment_required');

SELECT ok((SELECT length(pq_amendment_reason) >= 10 FROM public.fp_assessments
            WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'the amendment reason is retained');

-- Prior response and its pinned version survive the amendment ---------------
SELECT is(
  (SELECT declaration_data->>'criminal_record' FROM public.fp_assessments
    WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'no', 'the previously submitted answers are not wiped by the amendment request');

SELECT is(
  (SELECT form_version_id FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  '00000000-0000-0000-0000-0000000f3131'::uuid,
  'the pinned form version is unchanged by the amendment request');

-- A later template edit must not rewrite history ----------------------------
INSERT INTO public.form_versions (id, template_id, version, semantic_version, status, schema_snapshot, published_at)
VALUES ('00000000-0000-0000-0000-0000000f3132','00000000-0000-0000-0000-0000000f3130', 2, '2.0.0','published',
        jsonb_build_object('fields', jsonb_build_array(
          jsonb_build_object('key','criminal_record','label','Any criminal record? (restated)'),
          jsonb_build_object('key','bankruptcy','label','Any bankruptcy?'))), now());

SELECT is(
  (SELECT form_version_id FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  '00000000-0000-0000-0000-0000000f3131'::uuid,
  'publishing a new template version does not repoint the historic submission');

SELECT is(
  (SELECT v.schema_snapshot->'fields'->0->>'label' FROM public.form_versions v
    WHERE v.id = (SELECT form_version_id FROM public.fp_assessments
                   WHERE id='00000000-0000-0000-0000-0000000f3140')),
  'Any criminal record?',
  'the historic submission still renders from its original field definitions');

SELECT is(
  (SELECT jsonb_array_length(schema_snapshot->'fields') FROM public.form_versions
    WHERE id='00000000-0000-0000-0000-0000000f3131'),
  1, 'version 1 definition is byte-stable after version 2 is published');

-- Revised submission is a new state transition, not a silent overwrite ------
UPDATE public.fp_assessments
   SET pq_state = 'submitted',
       declaration_data = jsonb_build_object('criminal_record','no','employment_history','restated'),
       submitted_at = now()
 WHERE id = '00000000-0000-0000-0000-0000000f3140';

SELECT is((SELECT pq_state FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'submitted', 'the revised questionnaire returns to submitted');
SELECT ok((SELECT declaration_data ? 'employment_history' FROM public.fp_assessments
            WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'the revised answers are stored');

-- Authorisation --------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3103","role":"authenticated"}';

SELECT throws_ok(
  $$ SELECT public.fp_request_pq_amendment('00000000-0000-0000-0000-0000000f3140',
       'I would like my own questionnaire reopened please.') $$,
  NULL, NULL, 'a user without fit_and_proper.edit cannot request an amendment');

RESET ROLE;
SELECT is((SELECT pq_state FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3140'),
  'submitted', 'the denied request left the questionnaire state untouched');

ROLLBACK;
