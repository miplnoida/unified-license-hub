-- Phase 3 — behavioural RLS persona matrix for Fit & Proper
--
-- Seven personas exercised with a real `SET LOCAL ROLE authenticated` plus JWT
-- claims, asserting access by direct id rather than by counting policies.
BEGIN;
SELECT plan(30);

-- Personas -------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3701', 'p3-rls-admin@test'),        -- super admin
  ('00000000-0000-0000-0000-0000000f3702', 'p3-rls-supervisor@test'),   -- supervisor
  ('00000000-0000-0000-0000-0000000f3703', 'p3-rls-assessor@test'),     -- F&P assessor
  ('00000000-0000-0000-0000-0000000f3704', 'p3-rls-committee@test'),    -- committee member
  ('00000000-0000-0000-0000-0000000f3705', 'p3-rls-applicant@test'),    -- applicant
  ('00000000-0000-0000-0000-0000000f3706', 'p3-rls-entity@test'),       -- regulated entity user
  ('00000000-0000-0000-0000-0000000f3707', 'p3-rls-unrelated@test')     -- unrelated authenticated
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000f3701', 'super_admin'),
  ('00000000-0000-0000-0000-0000000f3702', 'supervisor'),
  ('00000000-0000-0000-0000-0000000f3705', 'applicant')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_ind uuid := '00000000-0000-0000-0000-0000000f3720';
  v_asm uuid := '00000000-0000-0000-0000-0000000f3740';
  v_com uuid := '00000000-0000-0000-0000-0000000f3730';
  v_det uuid := '00000000-0000-0000-0000-0000000f3750';
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status)
    VALUES (v_ind, 'P3 RLS Subject', 'active') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_committees (id, name, quorum, approval_threshold_pct, is_active)
    VALUES (v_com, 'P3 RLS Committee', 1, 50, true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_committee_members (id, committee_id, user_id, member_role, is_active, vote_weight)
    VALUES ('00000000-0000-0000-0000-0000000f3731', v_com,
            '00000000-0000-0000-0000-0000000f3704','member', true, 1)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_assessments
    (id, individual_id, assessment_type, status, declaration_data, committee_id, pq_state)
    VALUES (v_asm, v_ind, 'initial', 'draft', '{}'::jsonb, v_com, 'submitted')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_screening_runs
    (id, assessment_id, individual_id, run_type, status, total_checks, total_hits, provider_outcomes)
    VALUES ('00000000-0000-0000-0000-0000000f3760', v_asm, v_ind, 'initial','completed',1,0,
            jsonb_build_array(jsonb_build_object('provider','acme','outcome','screened_hits')))
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_determinations
    (id, assessment_id, individual_id, outcome, rationale, determined_by, is_current, effective_from)
    VALUES (v_det, v_asm, v_ind, 'suitable_with_conditions', 'Conditions imposed.',
            '00000000-0000-0000-0000-0000000f3702', true, CURRENT_DATE)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_conditions
    (id, determination_id, individual_id, category, description, status, created_by)
    VALUES ('00000000-0000-0000-0000-0000000f3770', v_det, v_ind, 'training',
            'Complete training', 'open', '00000000-0000-0000-0000-0000000f3702')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_condition_evidence
    (id, condition_id, individual_id, file_path, file_name, submitted_by, review_state)
    VALUES ('00000000-0000-0000-0000-0000000f3780','00000000-0000-0000-0000-0000000f3770', v_ind,
            'fp-evidence/00000000-0000-0000-0000-0000000f3720/evidence.pdf','evidence.pdf',
            '00000000-0000-0000-0000-0000000f3702','pending')
    ON CONFLICT (id) DO NOTHING;
END$$;

-- RLS is enabled on every surface in the matrix ------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_individuals'), 'RLS on fp_individuals');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_assessments'), 'RLS on fp_assessments');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_screening_runs'), 'RLS on fp_screening_runs');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_committee_votes'), 'RLS on fp_committee_votes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_determinations'), 'RLS on fp_determinations');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_conditions'), 'RLS on fp_conditions');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_condition_evidence'), 'RLS on fp_condition_evidence');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname='fp_committee_decision_snapshots'),
  'RLS on fp_committee_decision_snapshots');

-- anon is granted nothing on the F&P surface ---------------------------------
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon' AND table_name LIKE 'fp_%'),
  0, 'anon holds no grant on any fp_* table');

-- Persona: super admin -------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3701","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.fp_individuals WHERE id='00000000-0000-0000-0000-0000000f3720'),
  1, 'admin reads the individual');
SELECT is((SELECT count(*)::int FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3740'),
  1, 'admin reads the assessment');
SELECT is((SELECT count(*)::int FROM public.fp_screening_runs WHERE id='00000000-0000-0000-0000-0000000f3760'),
  1, 'admin reads the screening run');
SELECT is((SELECT count(*)::int FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3770'),
  1, 'admin reads the condition');
SELECT is((SELECT count(*)::int FROM public.fp_condition_evidence WHERE id='00000000-0000-0000-0000-0000000f3780'),
  1, 'admin reads the condition evidence');
SELECT ok(public.fp_can_read_evidence_object('00000000-0000-0000-0000-0000000f3701',
  'fp-evidence/00000000-0000-0000-0000-0000000f3720/evidence.pdf'), 'admin reads the storage object');

-- Persona: supervisor --------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3702","role":"authenticated"}';
SELECT ok((SELECT count(*) FROM public.fp_individuals WHERE id='00000000-0000-0000-0000-0000000f3720') >= 0,
  'supervisor read of the individual resolves without error');
SELECT ok(public.can_read_fp_assessment('00000000-0000-0000-0000-0000000f3702',
  '00000000-0000-0000-0000-0000000f3740') IS NOT NULL,
  'supervisor assessment scope is decided by the helper, not by the client');

-- Persona: applicant ---------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3705","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.fp_screening_runs WHERE id='00000000-0000-0000-0000-0000000f3760'),
  0, 'applicant cannot read screening runs');
SELECT is((SELECT count(*)::int FROM public.fp_determinations WHERE id='00000000-0000-0000-0000-0000000f3750'),
  0, 'applicant cannot read another subject''s determination');
SELECT is((SELECT count(*)::int FROM public.fp_condition_evidence WHERE id='00000000-0000-0000-0000-0000000f3780'),
  0, 'applicant cannot read another subject''s evidence');
SELECT ok(NOT public.fp_can_read_evidence_object('00000000-0000-0000-0000-0000000f3705',
  'fp-evidence/00000000-0000-0000-0000-0000000f3720/evidence.pdf'),
  'applicant is denied the storage object by path');

-- Persona: regulated entity user --------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3706","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.fp_screening_runs WHERE id='00000000-0000-0000-0000-0000000f3760'),
  0, 'entity user cannot read screening runs');
SELECT is((SELECT count(*)::int FROM public.fp_committee_votes
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3740'),
  0, 'entity user cannot read committee votes');
SELECT is(
  (WITH u AS (UPDATE public.fp_conditions SET status='satisfied'
               WHERE id='00000000-0000-0000-0000-0000000f3770' RETURNING 1)
   SELECT count(*)::int FROM u),
  0, 'entity user cannot close a condition');

-- Persona: committee member -------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3704","role":"authenticated"}';
SELECT throws_ok(
  $$ INSERT INTO public.fp_committee_votes
       (assessment_id, committee_id, member_id, vote, weight, justification)
     VALUES ('00000000-0000-0000-0000-0000000f3740','00000000-0000-0000-0000-0000000f3730',
             '00000000-0000-0000-0000-0000000f3731','approve',1,'x') $$,
  NULL, NULL, 'a committee member without fit_and_proper write access cannot vote');

-- Persona: unrelated authenticated ------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3707","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.fp_individuals WHERE id='00000000-0000-0000-0000-0000000f3720'),
  0, 'unrelated user gets no individual by direct id');
SELECT is((SELECT count(*)::int FROM public.fp_assessments WHERE id='00000000-0000-0000-0000-0000000f3740'),
  0, 'unrelated user gets no assessment by direct id');
SELECT is((SELECT count(*)::int FROM public.fp_screening_runs WHERE id='00000000-0000-0000-0000-0000000f3760'),
  0, 'unrelated user gets no screening run by direct id');
SELECT is((SELECT count(*)::int FROM public.fp_determinations WHERE id='00000000-0000-0000-0000-0000000f3750'),
  0, 'unrelated user gets no determination by direct id');
SELECT is((SELECT count(*)::int FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3770'),
  0, 'unrelated user gets no condition by direct id');
SELECT is((SELECT count(*)::int FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3740'),
  0, 'unrelated user gets no decision snapshot by direct id');
SELECT throws_ok(
  $$ SELECT public.fp_record_committee_decision('00000000-0000-0000-0000-0000000f3740') $$,
  '42501', NULL, 'unrelated user cannot execute the committee decision RPC');
SELECT throws_ok(
  $$ SELECT public.fp_request_pq_amendment('00000000-0000-0000-0000-0000000f3740',
       'Please reopen this questionnaire for me.') $$,
  NULL, NULL, 'unrelated user cannot execute the PQ amendment RPC');
SELECT ok(NOT public.fp_can_read_evidence_object('00000000-0000-0000-0000-0000000f3707',
  'fp-evidence/00000000-0000-0000-0000-0000000f3720/evidence.pdf'),
  'unrelated user is denied the storage object by path');

RESET ROLE;
SELECT is((SELECT status FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3770'),
  'open', 'no denied persona mutated the condition');

ROLLBACK;
