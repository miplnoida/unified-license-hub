-- Phase 6 — Licensing residual gaps (FRD 6.1 / 6.2 / 6.3)
--
-- Verifies:
--   6.1 acknowledgement idempotency, versioning per submission, delivery-state
--       history and immutability of issued acknowledgements;
--   6.2 server-enforced sufficiency determinations (a "sufficient" outcome is
--       impossible while blockers or open RFIs remain) and append-only history;
--   6.3 legal/specialist referral lifecycle transitions, the opinion-required
--       gate on return, provenance immutability and append-only legal notes.

BEGIN;
SELECT plan(34);

-- ---------------------------------------------------------------------------
-- Structure & privileges
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'application_acknowledgements', 'application_acknowledgements exists');
SELECT has_table('public', 'sufficiency_determinations', 'sufficiency_determinations exists');
SELECT has_table('public', 'application_legal_referrals', 'application_legal_referrals exists');
SELECT has_function('public', 'ensure_submission_acknowledgement', 'ensure_submission_acknowledgement exists');
SELECT has_function('public', 'set_acknowledgement_delivery_state', 'set_acknowledgement_delivery_state exists');
SELECT has_function('public', 'record_sufficiency_determination', 'record_sufficiency_determination exists');
SELECT has_column('public', 'application_legal_notes', 'referral_id', 'legal notes link to referrals');

SELECT ok(NOT has_table_privilege('authenticated', 'public.application_acknowledgements', 'INSERT'),
          'clients cannot insert acknowledgements directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.application_acknowledgements', 'UPDATE'),
          'clients cannot update acknowledgements directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.sufficiency_determinations', 'INSERT'),
          'clients cannot insert sufficiency determinations directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.application_legal_notes', 'UPDATE'),
          'legal notes cannot be updated (append-only opinion history)');
SELECT ok(NOT has_table_privilege('authenticated', 'public.application_legal_notes', 'DELETE'),
          'legal notes cannot be deleted');
SELECT ok(NOT has_table_privilege('anon', 'public.application_acknowledgements', 'SELECT'),
          'anon cannot read acknowledgements');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _p6(application_id uuid, application_number text, ack_id uuid, referral_id uuid);

DO $$
DECLARE
  v_officer uuid := '00000000-0000-0000-0000-0000000e0001';
  v_applicant uuid := '00000000-0000-0000-0000-0000000e0002';
  v_app uuid;
  v_num text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_officer, 'phase6.officer@example.test'),
    (v_applicant, 'phase6.applicant@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_officer, 'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.applications (applicant_id, license_type, status, submitted_at)
  VALUES (v_applicant, 'Phase6 Test Licence', 'under_review', now())
  RETURNING id, application_number INTO v_app, v_num;

  INSERT INTO _p6(application_id, application_number) VALUES (v_app, v_num);
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000e0001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 6.1 Acknowledgement: generated once, idempotent, versioned per submission
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT public.ensure_submission_acknowledgement(
     (SELECT application_id FROM _p6), 'I confirm the information is accurate.',
     'Phase6 Applicant', 'applicant@example.test', 'Phase6 Entity', false)
   -> 'acknowledgement' ->> 'submission_version'),
  '1', 'first acknowledgement is version 1');

UPDATE _p6 SET ack_id = (
  SELECT id FROM public.application_acknowledgements
   WHERE application_id = (SELECT application_id FROM _p6));

SELECT is(
  (SELECT public.ensure_submission_acknowledgement(
     (SELECT application_id FROM _p6), NULL, 'Phase6 Applicant',
     'applicant@example.test', 'Phase6 Entity', false)
   -> 'acknowledgement' ->> 'id'),
  (SELECT ack_id::text FROM _p6),
  'repeat calls return the same acknowledgement (idempotent, no duplicates)');

SELECT is(
  (SELECT count(*)::int FROM public.application_acknowledgements
    WHERE application_id = (SELECT application_id FROM _p6)),
  1, 'only one acknowledgement row exists for the submission');

SELECT is(
  (SELECT status FROM public.application_acknowledgements WHERE id = (SELECT ack_id FROM _p6)),
  'GENERATED', 'a new acknowledgement starts in GENERATED, not DELIVERED');

SELECT is(
  (SELECT ack_text FROM public.application_acknowledgements WHERE id = (SELECT ack_id FROM _p6)),
  'I confirm the information is accurate.',
  'the applicant declaration is captured on the acknowledgement');

-- Delivery state is recorded with history and never invented.
SELECT is(
  (SELECT public.set_acknowledgement_delivery_state(
     (SELECT ack_id FROM _p6), 'DELIVERY_PENDING', 'smtp', 'msg-1')
   -> 'acknowledgement' ->> 'status'),
  'DELIVERY_PENDING', 'delivery state can move to DELIVERY_PENDING');

SELECT is(
  (SELECT public.set_acknowledgement_delivery_state(
     (SELECT ack_id FROM _p6), 'DELIVERED', 'smtp', 'msg-1')
   -> 'acknowledgement' ->> 'status'),
  'DELIVERED', 'delivery state can be confirmed as DELIVERED');

SELECT ok(
  (SELECT delivered_at IS NOT NULL FROM public.application_acknowledgements
    WHERE id = (SELECT ack_id FROM _p6)),
  'DELIVERED stamps delivered_at');

SELECT ok(
  (SELECT jsonb_array_length(delivery_history) >= 2 FROM public.application_acknowledgements
    WHERE id = (SELECT ack_id FROM _p6)),
  'each delivery-state change is appended to delivery_history');

SELECT is(
  (SELECT public.set_acknowledgement_delivery_state(
     (SELECT ack_id FROM _p6), 'NOT_A_STATE') ->> 'code'),
  'INVALID_STATUS', 'unknown delivery states are rejected');

-- Identity of an issued acknowledgement is immutable.
SELECT throws_ok(
  $$UPDATE public.application_acknowledgements
       SET reference = 'TAMPERED'
     WHERE id = (SELECT ack_id FROM _p6)$$,
  NULL, NULL, 'acknowledgement reference cannot be altered');

SELECT throws_ok(
  $$DELETE FROM public.application_acknowledgements WHERE id = (SELECT ack_id FROM _p6)$$,
  NULL, NULL, 'acknowledgements cannot be deleted');

-- A resubmission (new submitted_at) produces version 2, preserving version 1.
UPDATE public.applications SET submitted_at = now() + interval '1 minute'
 WHERE id = (SELECT application_id FROM _p6);

SELECT is(
  (SELECT public.ensure_submission_acknowledgement(
     (SELECT application_id FROM _p6), NULL, 'Phase6 Applicant',
     'applicant@example.test', 'Phase6 Entity', true)
   -> 'acknowledgement' ->> 'submission_version'),
  '2', 'a resubmission issues acknowledgement version 2');

SELECT is(
  (SELECT count(*)::int FROM public.application_acknowledgements
    WHERE application_id = (SELECT application_id FROM _p6)),
  2, 'the earlier acknowledgement version is retained');

-- ---------------------------------------------------------------------------
-- 6.2 Sufficiency determination — server-enforced
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT public.record_sufficiency_determination(
     (SELECT application_id FROM _p6), 'sufficient',
     'All requirements verified by the reviewer.', '[]'::jsonb) ->> 'code'),
  'NO_EVALUATION', 'a determination requires a sufficiency evaluation first');

-- Evaluation with an unresolved blocker.
DO $$
DECLARE v_eval uuid;
BEGIN
  INSERT INTO public.sufficiency_evaluations (application_id, overall_status, blocker_count)
  VALUES ((SELECT application_id FROM _p6), 'insufficient', 1)
  RETURNING id INTO v_eval;

  INSERT INTO public.sufficiency_evaluation_results
    (evaluation_id, status, severity, detail, rule_snapshot)
  VALUES (v_eval, 'fail', 'blocker', '{"error":"missing audited accounts"}'::jsonb,
          '{"code":"P6-DOC-001","name":"Audited accounts required"}'::jsonb);
END$$;

SELECT is(
  (SELECT public.record_sufficiency_determination(
     (SELECT application_id FROM _p6), 'sufficient',
     'Reviewer believes everything is fine.', '[]'::jsonb) ->> 'code'),
  'SUFFICIENCY_GATES_UNMET',
  'a sufficient determination is refused while an unresolved blocker exists');

SELECT is(
  (SELECT public.record_sufficiency_determination(
     (SELECT application_id FROM _p6), 'sufficient', 'short', '[]'::jsonb) ->> 'code'),
  'REASON_REQUIRED', 'a determination reason of at least 10 characters is required');

SELECT is(
  (SELECT public.record_sufficiency_determination(
     (SELECT application_id FROM _p6), 'maybe',
     'Reviewer is undecided about this application.', '[]'::jsonb) ->> 'code'),
  'INVALID_DECISION', 'only sufficient/insufficient/deferred are accepted');

-- An insufficient determination is always allowed and records the gate counts.
SELECT is(
  (SELECT public.record_sufficiency_determination(
     (SELECT application_id FROM _p6), 'insufficient',
     'Audited accounts are missing; RFI to be issued.',
     '[{"key":"documents_present","label":"Documents present","checked":false}]'::jsonb)
   -> 'determination' ->> 'decision'),
  'insufficient', 'an insufficient determination is recorded');

SELECT is(
  (SELECT unresolved_blocker_count FROM public.sufficiency_determinations
    WHERE application_id = (SELECT application_id FROM _p6)
    ORDER BY determined_at DESC LIMIT 1),
  1, 'the determination snapshots the unresolved blocker count');

-- Overriding the blocker clears the gate; the sufficient outcome then succeeds.
INSERT INTO public.sufficiency_overrides (evaluation_result_id, overridden_by, reason)
SELECT r.id, '00000000-0000-0000-0000-0000000e0001',
       'Audited accounts received out of band and verified.'
  FROM public.sufficiency_evaluation_results r
  JOIN public.sufficiency_evaluations e ON e.id = r.evaluation_id
 WHERE e.application_id = (SELECT application_id FROM _p6);

SELECT is(
  (SELECT public.record_sufficiency_determination(
     (SELECT application_id FROM _p6), 'sufficient',
     'Blocker overridden with evidence; application is complete.',
     '[{"key":"documents_present","label":"Documents present","checked":true}]'::jsonb)
   -> 'determination' ->> 'decision'),
  'sufficient', 'sufficient is accepted once blockers are resolved and no RFI is open');

SELECT is(
  (SELECT count(*)::int FROM public.sufficiency_determinations
    WHERE application_id = (SELECT application_id FROM _p6)),
  2, 'determination history is preserved rather than overwritten');

SELECT throws_ok(
  $$UPDATE public.sufficiency_determinations SET decision = 'sufficient'
     WHERE application_id = (SELECT application_id FROM _p6)$$,
  NULL, NULL, 'determinations cannot be edited after the fact');

-- ---------------------------------------------------------------------------
-- 6.3 Legal / specialist referral lifecycle
-- ---------------------------------------------------------------------------
INSERT INTO public.application_legal_referrals
  (application_id, specialism, referral_reason, referred_by, referred_to, due_at)
VALUES ((SELECT application_id FROM _p6), 'legal',
        'Confirm enforceability of the proposed shareholder undertaking.',
        '00000000-0000-0000-0000-0000000e0001',
        '00000000-0000-0000-0000-0000000e0001', now() + interval '5 days');

UPDATE _p6 SET referral_id = (
  SELECT id FROM public.application_legal_referrals
   WHERE application_id = (SELECT application_id FROM _p6));

SELECT is(
  (SELECT status FROM public.application_legal_referrals WHERE id = (SELECT referral_id FROM _p6)),
  'referred', 'a new referral starts as referred');

SELECT throws_ok(
  $$UPDATE public.application_legal_referrals SET status = 'completed'
     WHERE id = (SELECT referral_id FROM _p6)$$,
  NULL, NULL, 'referred -> completed is not a permitted transition');

UPDATE public.application_legal_referrals SET status = 'in_review'
 WHERE id = (SELECT referral_id FROM _p6);

SELECT is(
  (SELECT status FROM public.application_legal_referrals WHERE id = (SELECT referral_id FROM _p6)),
  'in_review', 'the specialist can accept the referral');

-- Returning without an opinion is refused.
SELECT throws_ok(
  $$UPDATE public.application_legal_referrals SET status = 'returned'
     WHERE id = (SELECT referral_id FROM _p6)$$,
  NULL, NULL, 'a referral cannot be returned without a recorded opinion');

INSERT INTO public.application_legal_notes
  (application_id, actor_id, note_text, has_legal_concern, recommendation, referral_id, restricted)
VALUES ((SELECT application_id FROM _p6), '00000000-0000-0000-0000-0000000e0001',
        'The undertaking is enforceable subject to registration of the charge.',
        false, 'approve_with_conditions', (SELECT referral_id FROM _p6), true);

UPDATE public.application_legal_referrals SET status = 'returned'
 WHERE id = (SELECT referral_id FROM _p6);

SELECT ok(
  (SELECT returned_at IS NOT NULL AND status = 'returned'
     FROM public.application_legal_referrals WHERE id = (SELECT referral_id FROM _p6)),
  'returning the referral stamps returned_at once an opinion exists');

SELECT throws_ok(
  $$UPDATE public.application_legal_referrals
       SET referral_reason = 'rewritten reason for the referral'
     WHERE id = (SELECT referral_id FROM _p6)$$,
  NULL, NULL, 'referral provenance cannot be rewritten');

UPDATE public.application_legal_referrals
   SET status = 'completed', completion_notes = 'Condition added to the draft licence.'
 WHERE id = (SELECT referral_id FROM _p6);

SELECT is(
  (SELECT status FROM public.application_legal_referrals WHERE id = (SELECT referral_id FROM _p6)),
  'completed', 'the case owner can close a returned referral');

SELECT throws_ok(
  $$DELETE FROM public.application_legal_referrals WHERE id = (SELECT referral_id FROM _p6)$$,
  NULL, NULL, 'referrals cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
