-- Phase 3 / FP-CON-001 — condition lifecycle, evidence and storage denial
BEGIN;
SELECT plan(20);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3601', 'p3-con-super@test'),
  ('00000000-0000-0000-0000-0000000f3602', 'p3-con-outsider@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3601', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_ind uuid := '00000000-0000-0000-0000-0000000f3620';
  v_asm uuid := '00000000-0000-0000-0000-0000000f3640';
  v_det uuid := '00000000-0000-0000-0000-0000000f3650';
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status)
    VALUES (v_ind, 'P3 Conditions Subject', 'active') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_assessments (id, individual_id, assessment_type, status, declaration_data)
    VALUES (v_asm, v_ind, 'initial', 'draft', '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_determinations
    (id, assessment_id, individual_id, outcome, rationale, determined_by, is_current, effective_from)
  VALUES (v_det, v_asm, v_ind, 'suitable_with_conditions',
          'Approved subject to completion of governance training.',
          '00000000-0000-0000-0000-0000000f3601', true, CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_conditions
    (id, determination_id, individual_id, category, description, due_date, evidence_type, status, created_by)
  VALUES
    ('00000000-0000-0000-0000-0000000f3660', v_det, v_ind, 'training',
     'Complete accredited governance training', CURRENT_DATE + 30, 'certificate', 'open',
     '00000000-0000-0000-0000-0000000f3601'),
    ('00000000-0000-0000-0000-0000000f3661', v_det, v_ind, 'reporting',
     'Submit quarterly attestation', CURRENT_DATE - 10, 'attestation', 'open',
     '00000000-0000-0000-0000-0000000f3601'),
    ('00000000-0000-0000-0000-0000000f3662', v_det, v_ind, 'restriction',
     'No sole signing authority', CURRENT_DATE + 60, NULL, 'open',
     '00000000-0000-0000-0000-0000000f3601')
  ON CONFLICT (id) DO NOTHING;
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3601","role":"authenticated"}';

-- Creation & source ----------------------------------------------------------
SELECT is(
  (SELECT determination_id FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3660'),
  '00000000-0000-0000-0000-0000000f3650'::uuid,
  'a condition names the determination that imposed it');
SELECT ok(
  (SELECT due_date IS NOT NULL AND evidence_type IS NOT NULL FROM public.fp_conditions
    WHERE id='00000000-0000-0000-0000-0000000f3660'),
  'a condition records its due date and required evidence type');

-- Evidence submission and review --------------------------------------------
INSERT INTO public.fp_condition_evidence
  (id, condition_id, individual_id, file_path, file_name, description, submitted_by, review_state)
VALUES ('00000000-0000-0000-0000-0000000f3670','00000000-0000-0000-0000-0000000f3660',
        '00000000-0000-0000-0000-0000000f3620',
        'fp-evidence/00000000-0000-0000-0000-0000000f3620/governance-cert.pdf',
        'governance-cert.pdf','Accredited training certificate',
        '00000000-0000-0000-0000-0000000f3601','pending');

SELECT is((SELECT review_state FROM public.fp_condition_evidence
            WHERE id='00000000-0000-0000-0000-0000000f3670'),
  'pending', 'uploaded evidence starts pending review');

UPDATE public.fp_condition_evidence
   SET review_state='rejected', reviewed_by='00000000-0000-0000-0000-0000000f3601',
       reviewed_at=now(), review_note='Certificate is not from an accredited provider.'
 WHERE id='00000000-0000-0000-0000-0000000f3670';
SELECT is((SELECT review_state FROM public.fp_condition_evidence
            WHERE id='00000000-0000-0000-0000-0000000f3670'),
  'rejected', 'evidence can be rejected with a reviewer note');
SELECT ok((SELECT review_note IS NOT NULL AND reviewed_by IS NOT NULL
             FROM public.fp_condition_evidence WHERE id='00000000-0000-0000-0000-0000000f3670'),
  'a rejection records the reviewer and the reason');

UPDATE public.fp_condition_evidence
   SET review_state='accepted', review_note='Re-issued certificate accepted.'
 WHERE id='00000000-0000-0000-0000-0000000f3670';
SELECT is((SELECT review_state FROM public.fp_condition_evidence
            WHERE id='00000000-0000-0000-0000-0000000f3670'),
  'accepted', 'evidence can subsequently be accepted');

-- Satisfaction ---------------------------------------------------------------
UPDATE public.fp_conditions
   SET status='satisfied', satisfied_at=now(), satisfied_by='00000000-0000-0000-0000-0000000f3601',
       satisfaction_note='Accredited certificate verified.'
 WHERE id='00000000-0000-0000-0000-0000000f3660';
SELECT is((SELECT status FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3660'),
  'satisfied', 'an evidenced condition can be satisfied');
SELECT ok((SELECT satisfied_at IS NOT NULL AND satisfied_by IS NOT NULL FROM public.fp_conditions
            WHERE id='00000000-0000-0000-0000-0000000f3660'),
  'satisfaction records who closed it and when');

-- Overdue --------------------------------------------------------------------
UPDATE public.fp_conditions SET status='open' WHERE id='00000000-0000-0000-0000-0000000f3661';
SELECT ok((SELECT overdue_at IS NOT NULL FROM public.fp_conditions
            WHERE id='00000000-0000-0000-0000-0000000f3661'),
  'a past-due open condition is stamped overdue automatically');

-- Breach requires a rationale ------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.fp_conditions SET status='breached'
      WHERE id='00000000-0000-0000-0000-0000000f3661' $$,
  '23514', NULL, 'a breach cannot be recorded without a rationale');

UPDATE public.fp_conditions
   SET status='breached', satisfaction_note='Attestation not filed 10 days after the deadline.'
 WHERE id='00000000-0000-0000-0000-0000000f3661';
SELECT is((SELECT status FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3661'),
  'breached', 'a breach with a rationale is recorded');

-- Waiver requires authorisation + justification ------------------------------
SELECT throws_ok(
  $$ UPDATE public.fp_conditions SET status='waived'
      WHERE id='00000000-0000-0000-0000-0000000f3662' $$,
  NULL, NULL, 'a waiver cannot be recorded without a justification');

UPDATE public.fp_conditions
   SET status='waived', waiver_reason='Restriction superseded by a board-level control approved by the Authority.'
 WHERE id='00000000-0000-0000-0000-0000000f3662';
SELECT is((SELECT status FROM public.fp_conditions WHERE id='00000000-0000-0000-0000-0000000f3662'),
  'waived', 'a justified waiver is recorded');
SELECT ok((SELECT length(waiver_reason) >= 5 FROM public.fp_conditions
            WHERE id='00000000-0000-0000-0000-0000000f3662'),
  'the waiver justification is retained');

-- Append-only history --------------------------------------------------------
SELECT ok(
  (SELECT count(*) FROM public.fp_condition_events
    WHERE condition_id IN ('00000000-0000-0000-0000-0000000f3660',
                           '00000000-0000-0000-0000-0000000f3661',
                           '00000000-0000-0000-0000-0000000f3662')) >= 3,
  'every condition transition writes a history event');

SELECT throws_ok(
  $$ UPDATE public.fp_condition_events SET reason='rewritten'
      WHERE condition_id='00000000-0000-0000-0000-0000000f3661' $$,
  NULL, NULL, 'condition history cannot be updated');

SELECT throws_ok(
  $$ DELETE FROM public.fp_condition_events
      WHERE condition_id='00000000-0000-0000-0000-0000000f3661' $$,
  NULL, NULL, 'condition history cannot be deleted');

-- Storage object scoping -----------------------------------------------------
SELECT ok(
  public.fp_can_read_evidence_object(
    '00000000-0000-0000-0000-0000000f3601',
    'fp-evidence/00000000-0000-0000-0000-0000000f3620/governance-cert.pdf'),
  'an authorised F&P reader can read the evidence object');

SELECT ok(
  NOT public.fp_can_read_evidence_object(
    '00000000-0000-0000-0000-0000000f3602',
    'fp-evidence/00000000-0000-0000-0000-0000000f3620/governance-cert.pdf'),
  'an unrelated user is denied the evidence object by path, not merely by UI');

SELECT ok(
  NOT public.can_read_fp_individual('00000000-0000-0000-0000-0000000f3602',
                                    '00000000-0000-0000-0000-0000000f3620'),
  'the denial follows the individual scope, not the bucket');

ROLLBACK;
