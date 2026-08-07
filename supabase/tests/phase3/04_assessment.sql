-- Phase 3 / FP-ASS-002 — prior-assessment comparison classes
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3301', 'p3-ass-super@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3301', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_ind uuid := '00000000-0000-0000-0000-0000000f3320';
  v_old uuid := '00000000-0000-0000-0000-0000000f3340';
  v_new uuid := '00000000-0000-0000-0000-0000000f3341';
  v_solo uuid := '00000000-0000-0000-0000-0000000f3342';
  v_ind2 uuid := '00000000-0000-0000-0000-0000000f3321';
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status) VALUES
    (v_ind, 'P3 Comparison Subject', 'active'),
    (v_ind2, 'P3 First-time Subject', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_assessments (id, individual_id, assessment_type, status, declaration_data, created_at)
  VALUES
    (v_old, v_ind, 'initial', 'closed', '{}'::jsonb, now() - interval '2 years'),
    (v_new, v_ind, 'periodic', 'draft', '{}'::jsonb, now()),
    (v_solo, v_ind2, 'initial', 'draft', '{}'::jsonb, now())
  ON CONFLICT (id) DO NOTHING;

  -- prior findings
  INSERT INTO public.fp_findings (run_id, assessment_id, individual_id, check_type, severity, title)
  VALUES
    (gen_random_uuid(), v_old, v_ind, 'adverse_media', 'low',    'Unchanged item'),
    (gen_random_uuid(), v_old, v_ind, 'sanctions',     'low',    'Escalating item'),
    (gen_random_uuid(), v_old, v_ind, 'litigation',    'medium', 'Improving item'),
    (gen_random_uuid(), v_old, v_ind, 'insolvency',    'high',   'Cleared item');

  -- current findings
  INSERT INTO public.fp_findings (run_id, assessment_id, individual_id, check_type, severity, title)
  VALUES
    (gen_random_uuid(), v_new, v_ind, 'adverse_media', 'low',    'Unchanged item'),
    (gen_random_uuid(), v_new, v_ind, 'sanctions',     'high',   'Escalating item'),
    (gen_random_uuid(), v_new, v_ind, 'litigation',    'low',    'Improving item'),
    (gen_random_uuid(), v_new, v_ind, 'pep',           'medium', 'Brand new item');

  -- first-time assessment
  INSERT INTO public.fp_findings (run_id, assessment_id, individual_id, check_type, severity, title)
  VALUES (gen_random_uuid(), v_solo, v_ind2, 'pep', 'low', 'Only item');
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3301","role":"authenticated"}';

CREATE TEMP TABLE cmp AS
  SELECT * FROM public.fp_assessment_comparison('00000000-0000-0000-0000-0000000f3341');

SELECT is((SELECT count(*)::int FROM cmp), 5, 'every current and prior finding appears exactly once');

SELECT is((SELECT change_class FROM cmp WHERE title='Unchanged item'), 'unchanged',
  'same severity is classified unchanged');
SELECT is((SELECT change_class FROM cmp WHERE title='Escalating item'), 'worsened',
  'low -> high is classified worsened');
SELECT is((SELECT change_class FROM cmp WHERE title='Improving item'), 'changed',
  'medium -> low is classified changed');
SELECT is((SELECT change_class FROM cmp WHERE title='Cleared item'), 'resolved',
  'a prior finding absent today is classified resolved');
SELECT is((SELECT change_class FROM cmp WHERE title='Brand new item'), 'new',
  'a finding with no prior counterpart is classified new');

SELECT is((SELECT prior_severity FROM cmp WHERE title='Escalating item'), 'low',
  'the prior severity is reported alongside the current one');
SELECT is((SELECT current_severity FROM cmp WHERE title='Escalating item'), 'high',
  'the current severity is reported');
SELECT is((SELECT prior_assessment_id FROM cmp WHERE title='Unchanged item'),
  '00000000-0000-0000-0000-0000000f3340'::uuid, 'the comparison names the prior assessment');
SELECT ok((SELECT current_finding_id IS NULL FROM cmp WHERE title='Cleared item'),
  'a resolved row has no current finding id');
SELECT ok((SELECT prior_finding_id IS NULL FROM cmp WHERE title='Brand new item'),
  'a new row has no prior finding id');

-- No prior assessment --------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.fp_assessment_comparison('00000000-0000-0000-0000-0000000f3342')
    WHERE change_class <> 'new'),
  0, 'with no prior assessment every finding is new');
SELECT ok(
  (SELECT bool_and(prior_assessment_id IS NULL)
     FROM public.fp_assessment_comparison('00000000-0000-0000-0000-0000000f3342')),
  'with no prior assessment no prior id is invented');

-- Comparison is strictly read-only ------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.fp_findings
    WHERE assessment_id = '00000000-0000-0000-0000-0000000f3340'),
  4, 'the prior findings are untouched by the comparison');

ROLLBACK;
