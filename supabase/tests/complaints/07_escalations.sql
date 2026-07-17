-- Escalation engine: RPCs, unique-active guard, evaluator behavioural tests.
BEGIN;
SELECT plan(6);

SELECT has_function('public','manual_escalate_complaint',
  ARRAY['uuid','text','text','text','text'],
  'manual_escalate_complaint exists');
SELECT has_function('public','dismiss_complaint_escalation', ARRAY['uuid','text'],
  'dismiss_complaint_escalation exists');
SELECT has_function('public','evaluate_complaint_escalations', ARRAY['uuid'],
  'per-complaint evaluator exists');
SELECT has_function('public','evaluate_all_complaint_escalations',
  'sweep function exists');

-- Fixture: complaint older than 14 days on an age-rule regulator.
DO $$
DECLARE
  rid uuid := gen_random_uuid();
  cid uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.regulators(id, name, code) VALUES
    (rid, 'Esc Reg', 'ESC-' || substr(rid::text,1,8))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.complaints(id, complaint_number, subject, description, email,
                                status, severity, regulator_id, created_at)
  VALUES (cid, 'ESC-A-1', 'Long-open complaint', 'Description', 'esc@example.com',
          'submitted', 'medium', rid, now() - interval '30 days');

  PERFORM set_config('test.esc_cid', cid::text, true);
END $$;

-- Evaluator fires the age rule
SELECT ok(
  public.evaluate_complaint_escalations(current_setting('test.esc_cid')::uuid) >= 1,
  'evaluator opens at least one case for aged complaint'
);

-- Second run does not open a duplicate active case
SELECT is(
  public.evaluate_complaint_escalations(current_setting('test.esc_cid')::uuid),
  0,
  'second evaluator run opens no additional cases while active'
);

SELECT * FROM finish();
ROLLBACK;
