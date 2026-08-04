-- pgTAP: specialised tester parity with the production runtime paths.
-- Proves the shared decision helpers exist, are the single source of truth
-- (the production functions delegate to them), and that the tester consumes
-- the same helpers rather than a private copy of the logic.
BEGIN;
SELECT plan(12);

-- 1. Shared decision helpers exist
SELECT has_function('public','complaint_intake_decide',ARRAY['text','uuid','jsonb'],
  'complaint_intake_decide(text,uuid,jsonb) exists');
SELECT has_function('public','correspondence_route_decide',ARRAY['text','text','text','text'],
  'correspondence_route_decide(text,text,text,text) exists');

-- 2. The production intake path delegates to the shared helper
SELECT ok(
  (SELECT prosrc ~ 'complaint_intake_decide'
     FROM pg_proc WHERE proname = 'create_complaint' AND pronargs = 2),
  'create_complaint(text,jsonb) resolves intake rules via complaint_intake_decide()'
);
SELECT ok(
  (SELECT prosrc !~ 'FROM public\.complaint_intake_rules'
     FROM pg_proc WHERE proname = 'create_complaint' AND pronargs = 2),
  'create_complaint no longer keeps its own copy of the intake rule query'
);

-- 3. The production correspondence path delegates to the shared helper
SELECT ok(
  (SELECT prosrc ~ 'correspondence_route_decide'
     FROM pg_proc WHERE proname = 'create_correspondence_thread' AND pronargs = 17),
  'create_correspondence_thread routes via correspondence_route_decide()'
);
SELECT ok(
  (SELECT prosrc !~ 'match_type = ''category'''
     FROM pg_proc WHERE proname = 'create_correspondence_thread' AND pronargs = 17),
  'create_correspondence_thread no longer keeps its own copy of the routing match query'
);

-- 4. The tester consumes the same production helpers
SELECT ok(
  (SELECT prosrc ~ 'complaint_intake_decide' FROM pg_proc WHERE proname = 'rule_module_test'),
  'rule_module_test uses complaint_intake_decide() for complaint triage parity'
);
SELECT ok(
  (SELECT prosrc ~ 'correspondence_route_decide' FROM pg_proc WHERE proname = 'rule_module_test'),
  'rule_module_test uses correspondence_route_decide() for routing precedence parity'
);
SELECT ok(
  (SELECT prosrc ~ 'resolve_effective_threshold' AND prosrc ~ 'classify_ratio_risk'
     FROM pg_proc WHERE proname = 'rule_module_test'),
  'rule_module_test uses the prudential scoping and risk-banding helpers'
);
SELECT ok(
  (SELECT prosrc ~ 'escalation_deadline' FROM pg_proc WHERE proname = 'rule_module_test'),
  'rule_module_test uses escalation_deadline() for business-calendar due times'
);

-- 5. Behavioural: the helper rejects an incomplete public submission and
--    accepts a complete anonymous one.
SELECT ok(
  jsonb_array_length(
    public.complaint_intake_decide('public', NULL,
      '{"subject":"ab","description":"short"}'::jsonb) -> 'errors') > 0,
  'complaint_intake_decide rejects a public submission failing the minimum field rules'
);
SELECT is(
  jsonb_array_length(
    public.complaint_intake_decide('public', NULL,
      '{"subject":"Mis-sold policy","description":"They sold me the wrong product entirely.","anonymous":true}'::jsonb) -> 'errors'),
  0,
  'complaint_intake_decide accepts a complete anonymous public submission'
);

SELECT * FROM finish();
ROLLBACK;
