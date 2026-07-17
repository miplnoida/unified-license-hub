-- Duplicate management: RPCs + automatic candidate generation (behavioural)
BEGIN;
SELECT plan(8);

-- Structural checks
SELECT has_function('public','confirm_complaint_duplicate', ARRAY['uuid','uuid','text'],
  'confirm_complaint_duplicate exists');
SELECT has_function('public','dismiss_complaint_duplicate', ARRAY['uuid','text'],
  'dismiss_complaint_duplicate exists');
SELECT has_function('public','generate_complaint_duplicate_candidates', ARRAY['uuid'],
  'generator function exists');
SELECT has_column('public','complaints','parent_complaint_id','parent_complaint_id link exists');

-- Behavioural fixtures
DO $$
DECLARE
  r1 uuid := gen_random_uuid();
  r2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.regulators(id, name, code) VALUES
    (r1, 'Test Reg A', 'TRA-' || substr(r1::text,1,8)),
    (r2, 'Test Reg B', 'TRB-' || substr(r2::text,1,8))
  ON CONFLICT DO NOTHING;
  PERFORM set_config('test.reg_a', r1::text, true);
  PERFORM set_config('test.reg_b', r2::text, true);
END $$;

-- Two complaints in same regulator, same email, similar subject → pair created
WITH ins AS (
  INSERT INTO public.complaints(id, complaint_number, subject, description, email, status, regulator_id, created_at)
  VALUES
    (gen_random_uuid(), 'DUP-A-1', 'Unauthorised debit on my account',
     'A large unauthorised debit was applied to my account without notice or consent from the bank.',
     'dup-user@example.com', 'submitted',
     current_setting('test.reg_a')::uuid, now()),
    (gen_random_uuid(), 'DUP-A-2', 'Unauthorised debit on my account today',
     'An unauthorised debit was applied to my account without any consent or notice from the bank.',
     'dup-user@example.com', 'submitted',
     current_setting('test.reg_a')::uuid, now())
  RETURNING id
) SELECT count(*) FROM ins;

SELECT ok(
  (SELECT count(*) FROM public.complaint_duplicate_pairs p
     JOIN public.complaints c ON c.id IN (p.primary_complaint_id, p.candidate_complaint_id)
    WHERE c.complaint_number IN ('DUP-A-1','DUP-A-2')
      AND p.status = 'pending') >= 1,
  'auto-generates pending pair for near-duplicate complaints in same regulator'
);

-- Cross-regulator: no pair
INSERT INTO public.complaints(id, complaint_number, subject, description, email, status, regulator_id, created_at)
VALUES (gen_random_uuid(), 'DUP-B-1', 'Unauthorised debit on my account',
        'A large unauthorised debit was applied to my account without notice or consent from the bank.',
        'dup-user@example.com', 'submitted',
        current_setting('test.reg_b')::uuid, now());

SELECT is(
  (SELECT count(*)::int FROM public.complaint_duplicate_pairs p
     JOIN public.complaints c1 ON c1.id = p.primary_complaint_id
     JOIN public.complaints c2 ON c2.id = p.candidate_complaint_id
    WHERE (c1.complaint_number='DUP-B-1' OR c2.complaint_number='DUP-B-1')),
  0,
  'no pair created across regulators'
);

-- Symmetric uniqueness: re-running generator does not create a duplicate row
DO $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.complaints WHERE complaint_number='DUP-A-1';
  PERFORM public.generate_complaint_duplicate_candidates(cid);
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.complaint_duplicate_pairs p
     JOIN public.complaints c1 ON c1.id = p.primary_complaint_id
     JOIN public.complaints c2 ON c2.id = p.candidate_complaint_id
    WHERE c1.complaint_number IN ('DUP-A-1','DUP-A-2')
      AND c2.complaint_number IN ('DUP-A-1','DUP-A-2')),
  1,
  'symmetric uniqueness — re-run produces no additional pair'
);

-- Outside time window: no pair
INSERT INTO public.complaints(id, complaint_number, subject, description, email, status, regulator_id, created_at)
VALUES (gen_random_uuid(), 'DUP-A-OLD', 'Unauthorised debit on my account',
        'A large unauthorised debit was applied to my account without notice or consent from the bank.',
        'dup-user@example.com', 'submitted',
        current_setting('test.reg_a')::uuid, now() - interval '365 days');

SELECT is(
  (SELECT count(*)::int FROM public.complaint_duplicate_pairs p
     JOIN public.complaints c1 ON c1.id = p.primary_complaint_id
     JOIN public.complaints c2 ON c2.id = p.candidate_complaint_id
    WHERE c1.complaint_number='DUP-A-OLD' OR c2.complaint_number='DUP-A-OLD'),
  0,
  'no pair for complaint outside time window'
);

SELECT * FROM finish();
ROLLBACK;
