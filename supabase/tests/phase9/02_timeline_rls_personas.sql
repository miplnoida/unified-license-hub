-- Phase 9 (Part B) — communication timeline authorization persona matrix.
--
-- Personas:
--   P1 applicant who owns the application  -> may read its communications
--   P2 unrelated external applicant        -> denied by direct id
--   P3 licensing officer (licensing.view)  -> may read
--   P4 internal user with no permissions   -> denied
--   P5 super admin                         -> may read
--   P6 anon / no session                   -> denied
--
-- Every negative case uses the real object id, so a leaked identifier alone can
-- never unlock a communication history.

BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f9201','p9-owner@test'),
  ('00000000-0000-0000-0000-0000000f9202','p9-stranger@test'),
  ('00000000-0000-0000-0000-0000000f9203','p9-officer@test'),
  ('00000000-0000-0000-0000-0000000f9204','p9-nobody@test'),
  ('00000000-0000-0000-0000-0000000f9205','p9-admin@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000f9201','applicant'),
  ('00000000-0000-0000-0000-0000000f9202','applicant'),
  ('00000000-0000-0000-0000-0000000f9203','licensing_officer'),
  ('00000000-0000-0000-0000-0000000f9205','super_admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.roles (id, name, system_role, status) VALUES
  ('00000000-0000-0000-0000-0000000f9210','P9 Licensing Officer','licensing_officer','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f9210', p.id FROM public.permissions p
 WHERE p.module = 'licensing' AND p.name = 'view'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_dynamic_roles (user_id, role_id) VALUES
  ('00000000-0000-0000-0000-0000000f9203','00000000-0000-0000-0000-0000000f9210')
ON CONFLICT DO NOTHING;

INSERT INTO public.applications (id, applicant_id, license_type, status) VALUES
  ('00000000-0000-0000-0000-0000000f9220','00000000-0000-0000-0000-0000000f9201','P9 Persona Licence','submitted')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.notification_dispatch_log
  (id, channel, event_key, status, recipient_email, entity_type, entity_id, module, dedupe_key)
VALUES
  ('00000000-0000-0000-0000-0000000f9230','email','application.submitted','sent',
   'p9-owner@test','application','00000000-0000-0000-0000-0000000f9220','licensing','p9-persona-1')
ON CONFLICT (id) DO NOTHING;

-- P1 owner ------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f9201","role":"authenticated"}';
SELECT ok(public.can_view_communications('application','00000000-0000-0000-0000-0000000f9220'),
  'P1 the applicant who owns the record may view its communications');
SELECT is((SELECT count(*)::int FROM public.communication_timeline(
            'application','00000000-0000-0000-0000-0000000f9220')), 1,
  'P1 sees exactly the communications of their own application');

-- P2 unrelated external applicant (direct-id attempt) -----------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f9202","role":"authenticated"}';
SELECT ok(NOT public.can_view_communications('application','00000000-0000-0000-0000-0000000f9220'),
  'P2 an unrelated applicant is denied even with the exact record id');
SELECT throws_ok(
  $$SELECT * FROM public.communication_timeline('application','00000000-0000-0000-0000-0000000f9220')$$,
  '42501', NULL, 'P2 timeline raises insufficient_privilege rather than leaking rows');

-- P3 licensing officer ------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f9203","role":"authenticated"}';
SELECT ok(public.can_view_communications('application','00000000-0000-0000-0000-0000000f9220'),
  'P3 licensing officer with module view permission may read the timeline');
SELECT is((SELECT count(*)::int FROM public.communication_timeline(
            'application','00000000-0000-0000-0000-0000000f9220')), 1,
  'P3 receives the dispatch history for supervisory review');

-- P4 internal user with no permissions --------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f9204","role":"authenticated"}';
SELECT ok(NOT public.can_view_communications('application','00000000-0000-0000-0000-0000000f9220'),
  'P4 an authenticated user without permissions is denied');
SELECT throws_ok(
  $$SELECT * FROM public.communication_timeline('application','00000000-0000-0000-0000-0000000f9220')$$,
  '42501', NULL, 'P4 timeline denies unpermissioned internal users');

-- P5 super admin ------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f9205","role":"authenticated"}';
SELECT ok(public.can_view_communications('application','00000000-0000-0000-0000-0000000f9220'),
  'P5 super admin retains full oversight of communications');

-- P6 anon / no session ------------------------------------------------------
SELECT set_config('request.jwt.claims', NULL, true);
SELECT ok(NOT public.can_view_communications('application','00000000-0000-0000-0000-0000000f9220'),
  'P6 an unauthenticated caller is always denied');

-- Cross-type and unknown-object hardening ----------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f9201","role":"authenticated"}';
SELECT ok(NOT public.can_view_communications('complaint','00000000-0000-0000-0000-0000000f9220'),
  'an application id cannot be replayed against the complaint object type');
SELECT ok(NOT public.can_view_communications('application', gen_random_uuid()),
  'an unknown application id is denied');
SELECT ok(NOT public.can_view_communications('not_a_module','00000000-0000-0000-0000-0000000f9220'),
  'an unsupported object type is denied by default');
SELECT ok(NOT public.can_view_communications('application', NULL),
  'a null object id is denied');

SELECT set_config('request.jwt.claims', NULL, true);
SELECT * FROM finish();
ROLLBACK;
