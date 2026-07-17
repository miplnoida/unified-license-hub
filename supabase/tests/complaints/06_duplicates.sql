-- Duplicate management: RPCs + automatic candidate generation (behavioural)
BEGIN;
SELECT plan(14);

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

-- --------------------------------------------------------------------------
-- Weight-contribution assertions: toggling scoring_config changes outcomes.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  cnt_before int;
  cnt_after int;
BEGIN
  -- Zero out the email weight and rerun the generator against DUP-A-1; no
  -- new pair should appear because the exact-email boost is removed and the
  -- remaining similarity is bounded by the trigram floor.
  UPDATE public.complaint_duplicate_scoring_config
     SET email_weight = 0, minimum_score = 90;
  DELETE FROM public.complaint_duplicate_pairs
   WHERE primary_complaint_id IN (SELECT id FROM public.complaints
                                   WHERE complaint_number IN ('DUP-A-1','DUP-A-2'))
      OR candidate_complaint_id IN (SELECT id FROM public.complaints
                                   WHERE complaint_number IN ('DUP-A-1','DUP-A-2'));
  SELECT count(*) INTO cnt_before FROM public.complaint_duplicate_pairs;
  PERFORM public.generate_complaint_duplicate_candidates(
    (SELECT id FROM public.complaints WHERE complaint_number = 'DUP-A-1'));
  SELECT count(*) INTO cnt_after FROM public.complaint_duplicate_pairs;
  PERFORM ok(cnt_after = cnt_before,
    'zeroed email weight + raised threshold suppresses candidate creation');

  -- Restore weights, lower threshold — candidate must reappear.
  UPDATE public.complaint_duplicate_scoring_config
     SET email_weight = 40, minimum_score = 40;
  PERFORM public.generate_complaint_duplicate_candidates(
    (SELECT id FROM public.complaints WHERE complaint_number = 'DUP-A-1'));
  PERFORM ok(
    (SELECT count(*) FROM public.complaint_duplicate_pairs
       JOIN public.complaints c
         ON c.id IN (primary_complaint_id, candidate_complaint_id)
      WHERE c.complaint_number IN ('DUP-A-1','DUP-A-2')) >= 1,
    'restored weights recreate the candidate pair');
END $$;

-- Similarity score is persisted on the pair and non-zero.
SELECT ok(
  (SELECT similarity_score FROM public.complaint_duplicate_pairs p
     JOIN public.complaints c1 ON c1.id = p.primary_complaint_id
     JOIN public.complaints c2 ON c2.id = p.candidate_complaint_id
    WHERE c1.complaint_number IN ('DUP-A-1','DUP-A-2')
      AND c2.complaint_number IN ('DUP-A-1','DUP-A-2')
    LIMIT 1) > 0,
  'similarity_score persisted and > 0 for near-duplicate pair');

-- --------------------------------------------------------------------------
-- Confirm RPC: sets parent_complaint_id, writes an audit row.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  pair_id uuid;
  primary_id uuid;
  candidate_id uuid;
BEGIN
  SELECT p.id, p.primary_complaint_id, p.candidate_complaint_id
    INTO pair_id, primary_id, candidate_id
  FROM public.complaint_duplicate_pairs p
    JOIN public.complaints c1 ON c1.id = p.primary_complaint_id
    JOIN public.complaints c2 ON c2.id = p.candidate_complaint_id
   WHERE c1.complaint_number IN ('DUP-A-1','DUP-A-2')
     AND c2.complaint_number IN ('DUP-A-1','DUP-A-2')
   ORDER BY p.detected_at
   LIMIT 1;

  PERFORM public.confirm_complaint_duplicate(pair_id, primary_id, 'unit test');

  PERFORM ok(
    (SELECT parent_complaint_id FROM public.complaints WHERE id = candidate_id)
      = primary_id,
    'confirm_complaint_duplicate sets parent_complaint_id on candidate');

  PERFORM ok(
    EXISTS (SELECT 1 FROM public.audit_logs
             WHERE entity_type IN ('complaint','complaint_duplicate_pair')
               AND (action ILIKE 'confirm%' OR action ILIKE '%duplicate%')),
    'confirm_complaint_duplicate writes an audit row');
END $$;

-- --------------------------------------------------------------------------
-- Dismiss RPC persists status; re-run generator does not immediately regen.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  new_pair uuid;
  cid uuid;
  other uuid;
BEGIN
  -- Create a fresh near-duplicate we can dismiss without disturbing prior
  -- assertions.
  cid := (SELECT id FROM public.complaints WHERE complaint_number = 'DUP-A-1');
  INSERT INTO public.complaints(id, complaint_number, subject, description, email,
                                status, regulator_id, created_at)
  VALUES (gen_random_uuid(), 'DUP-A-3', 'Unauthorised debit occurring again',
          'A further unauthorised debit occurred against the same account today.',
          'dup-user@example.com', 'submitted',
          current_setting('test.reg_a')::uuid, now())
  RETURNING id INTO other;

  SELECT id INTO new_pair
    FROM public.complaint_duplicate_pairs
   WHERE (primary_complaint_id = other OR candidate_complaint_id = other)
     AND status = 'pending'
   LIMIT 1;

  PERFORM ok(new_pair IS NOT NULL, 'new near-duplicate produced a pending pair');

  PERFORM public.dismiss_complaint_duplicate(new_pair, 'not a duplicate');

  PERFORM is(
    (SELECT status FROM public.complaint_duplicate_pairs WHERE id = new_pair),
    'dismissed',
    'dismiss_complaint_duplicate flips status to dismissed');

  -- Re-run generator; symmetric-unique index on pending status permits a
  -- fresh row only if the previous is not pending — which it no longer is.
  -- We only assert the pair count did not silently double.
  PERFORM public.generate_complaint_duplicate_candidates(other);
  PERFORM ok(
    (SELECT count(*) FROM public.complaint_duplicate_pairs
      WHERE (primary_complaint_id = other OR candidate_complaint_id = other)) <= 2,
    'dismissed pair does not multiply on regeneration');
END $$;

-- Reversed complaint ordering does not create another pair (symmetric uniq).
DO $$
DECLARE
  a uuid;
  b uuid;
  cnt_before int;
  cnt_after int;
BEGIN
  SELECT id INTO a FROM public.complaints WHERE complaint_number = 'DUP-A-1';
  SELECT id INTO b FROM public.complaints WHERE complaint_number = 'DUP-A-2';
  SELECT count(*) INTO cnt_before FROM public.complaint_duplicate_pairs
   WHERE LEAST(primary_complaint_id, candidate_complaint_id) = LEAST(a,b)
     AND GREATEST(primary_complaint_id, candidate_complaint_id) = GREATEST(a,b);

  PERFORM public.generate_complaint_duplicate_candidates(b);
  SELECT count(*) INTO cnt_after FROM public.complaint_duplicate_pairs
   WHERE LEAST(primary_complaint_id, candidate_complaint_id) = LEAST(a,b)
     AND GREATEST(primary_complaint_id, candidate_complaint_id) = GREATEST(a,b);
  PERFORM is(cnt_after, cnt_before,
    'reversed-order regeneration does not create a second symmetric pair');
END $$;

SELECT * FROM finish();
ROLLBACK;
