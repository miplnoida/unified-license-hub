-- Phase 3 / FP-COM-001 — committee entitlement, quorum, weighting, immutability
BEGIN;
SELECT plan(22);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3401', 'p3-com-super@test'),
  ('00000000-0000-0000-0000-0000000f3402', 'p3-com-member-a@test'),
  ('00000000-0000-0000-0000-0000000f3403', 'p3-com-member-b@test'),
  ('00000000-0000-0000-0000-0000000f3404', 'p3-com-member-c@test'),
  ('00000000-0000-0000-0000-0000000f3405', 'p3-com-inactive@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3401', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_ind uuid := '00000000-0000-0000-0000-0000000f3420';
  v_com uuid := '00000000-0000-0000-0000-0000000f3430';
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status)
    VALUES (v_ind, 'P3 Committee Subject', 'active') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_committees (id, name, quorum, approval_threshold_pct, is_active)
    VALUES (v_com, 'P3 F&P Committee', 3, 60, true) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_committee_members (id, committee_id, user_id, member_role, is_active, vote_weight)
  VALUES
    ('00000000-0000-0000-0000-0000000f3431', v_com, '00000000-0000-0000-0000-0000000f3402', 'chair',  true, 2),
    ('00000000-0000-0000-0000-0000000f3432', v_com, '00000000-0000-0000-0000-0000000f3403', 'member', true, 1),
    ('00000000-0000-0000-0000-0000000f3433', v_com, '00000000-0000-0000-0000-0000000f3404', 'member', true, 1),
    ('00000000-0000-0000-0000-0000000f3434', v_com, '00000000-0000-0000-0000-0000000f3405', 'member', false, 1)
  ON CONFLICT (id) DO NOTHING;

  -- three assessments: quorum-fail, quorum-pass, all-abstain
  INSERT INTO public.fp_assessments (id, individual_id, assessment_type, status, declaration_data, committee_id)
  VALUES
    ('00000000-0000-0000-0000-0000000f3440', v_ind, 'initial', 'draft', '{}'::jsonb, v_com),
    ('00000000-0000-0000-0000-0000000f3441', v_ind, 'initial', 'draft', '{}'::jsonb, v_com),
    ('00000000-0000-0000-0000-0000000f3442', v_ind, 'initial', 'draft', '{}'::jsonb, v_com)
  ON CONFLICT (id) DO NOTHING;
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3401","role":"authenticated"}';

-- Quorum NOT met: two votes against a quorum of three -------------------------
INSERT INTO public.fp_committee_votes (assessment_id, committee_id, member_id, vote, weight, justification)
VALUES
  ('00000000-0000-0000-0000-0000000f3440','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3431','approve',2,'Satisfied on all criteria'),
  ('00000000-0000-0000-0000-0000000f3440','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3432','approve',1,'Satisfied');

SELECT lives_ok(
  $$ SELECT public.fp_record_committee_decision('00000000-0000-0000-0000-0000000f3440') $$,
  'a decision can be recorded even when quorum is not reached');

SELECT is((SELECT outcome FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3440'),
  'insufficient_quorum', 'without quorum no approval is produced');
SELECT ok((SELECT NOT quorum_met FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3440'),
  'quorum_met is recorded false');
SELECT is((SELECT (tally->>'entitled_members')::int FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3440'),
  3, 'only entitled (active) members are counted as entitled');
SELECT is((SELECT jsonb_array_length(member_roster) FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3440'),
  3, 'the roster snapshot holds the three active members');

SELECT throws_ok(
  $$ SELECT public.fp_record_committee_decision('00000000-0000-0000-0000-0000000f3440') $$,
  '23505', NULL, 'a second snapshot for the same assessment is refused');

-- Quorum met with a weighted, abstention-adjusted tally ----------------------
INSERT INTO public.fp_committee_votes (assessment_id, committee_id, member_id, vote, weight, justification)
VALUES
  ('00000000-0000-0000-0000-0000000f3441','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3431','approve',2,'Chair supports'),
  ('00000000-0000-0000-0000-0000000f3441','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3432','reject',1,'Not satisfied'),
  ('00000000-0000-0000-0000-0000000f3441','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3433','abstain',1,'Conflict of interest');

SELECT lives_ok(
  $$ SELECT public.fp_record_committee_decision('00000000-0000-0000-0000-0000000f3441') $$,
  'a quorate committee decision is recorded');

SELECT ok((SELECT quorum_met FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  'three participating entitled members satisfy a quorum of three');
SELECT is((SELECT (tally->>'approve_weight')::numeric FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  2::numeric, 'the chair vote carries its configured weight of 2');
SELECT is((SELECT (tally->>'abstain_weight')::numeric FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  1::numeric, 'the abstention is recorded');
SELECT is((SELECT (tally->>'total_weight')::numeric FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  3::numeric, 'the abstention is excluded from the approval denominator');
SELECT is((SELECT (tally->>'approval_pct')::numeric FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  66.67::numeric, 'approval percentage is 2 of 3 voting weight');
SELECT is((SELECT outcome FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  'approved', '66.67% clears the 60% threshold');
SELECT is((SELECT (tally->>'votes')::int FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  3, 'the participation count is recorded');

-- Every vote abstains: quorate but no decision -------------------------------
INSERT INTO public.fp_committee_votes (assessment_id, committee_id, member_id, vote, weight, justification)
VALUES
  ('00000000-0000-0000-0000-0000000f3442','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3431','abstain',2,'Conflict'),
  ('00000000-0000-0000-0000-0000000f3442','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3432','abstain',1,'Conflict'),
  ('00000000-0000-0000-0000-0000000f3442','00000000-0000-0000-0000-0000000f3430',
   '00000000-0000-0000-0000-0000000f3433','abstain',1,'Conflict');

SELECT lives_ok(
  $$ SELECT public.fp_record_committee_decision('00000000-0000-0000-0000-0000000f3442') $$,
  'an all-abstention sitting is still snapshotted');
SELECT is((SELECT outcome FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3442'),
  'insufficient_quorum', 'an all-abstention sitting yields no approval');

-- Snapshot immutability and config drift -------------------------------------
SELECT throws_ok(
  $$ UPDATE public.fp_committee_decision_snapshots SET outcome='approved'
      WHERE assessment_id='00000000-0000-0000-0000-0000000f3440' $$,
  NULL, NULL, 'a decision snapshot cannot be updated');

UPDATE public.fp_committees SET quorum = 1, approval_threshold_pct = 90
 WHERE id = '00000000-0000-0000-0000-0000000f3430';

SELECT is((SELECT quorum FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  3, 'a later committee reconfiguration does not rewrite the stored quorum');
SELECT is((SELECT approval_threshold_pct FROM public.fp_committee_decision_snapshots
            WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'),
  60::numeric, 'a later threshold change does not rewrite the stored threshold');

-- Vote immutability and ownership -------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.fp_committee_votes SET vote='reject'
      WHERE assessment_id='00000000-0000-0000-0000-0000000f3441'
        AND member_id='00000000-0000-0000-0000-0000000f3431' $$,
  '42501', NULL, 'a cast vote cannot be edited');

SELECT throws_ok(
  $$ DELETE FROM public.fp_committee_votes
      WHERE assessment_id='00000000-0000-0000-0000-0000000f3441' $$,
  '42501', NULL, 'a cast vote cannot be deleted');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3403","role":"authenticated"}';
SELECT throws_ok(
  $$ INSERT INTO public.fp_committee_votes
       (assessment_id, committee_id, member_id, vote, weight, justification)
     VALUES ('00000000-0000-0000-0000-0000000f3442','00000000-0000-0000-0000-0000000f3430',
             '00000000-0000-0000-0000-0000000f3431','approve',2,'Impersonating the chair') $$,
  NULL, NULL, 'member B cannot cast a vote in member A''s name');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.fp_committee_votes
    WHERE assessment_id='00000000-0000-0000-0000-0000000f3442'),
  3, 'the impersonation attempt added no vote');

ROLLBACK;
