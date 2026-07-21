-- Slice 14 — Critical RPC hardening
--
-- Asserts that anon/PUBLIC cannot EXECUTE the curated set of destructive /
-- state-changing SECURITY DEFINER RPCs, and that `authenticated` (and
-- service_role) retain EXECUTE so the app + workers still function. Each
-- RPC has its own module.action gate inside; this file only proves the
-- outer surface is not exposed to anonymous callers.

BEGIN;
SELECT plan(32);

-- (rpc_sig, must_be_denied_for_anon, must_be_allowed_for_authenticated)
WITH sigs(sig) AS (
  VALUES
    ('public.admin_override_form_version_assignment(uuid, uuid, uuid, text)'),
    ('public.assign_complaint(uuid, uuid, timestamptz)'),
    ('public.assign_complaint(uuid, uuid, text, text)'),
    ('public.assign_primary_user(uuid, uuid)'),
    ('public.cancel_application(uuid, text)'),
    ('public.confirm_complaint_duplicate(uuid, uuid, text)'),
    ('public.decide_escalation_case(uuid, text, text)'),
    ('public.delete_ppoc_mapping(uuid)'),
    ('public.dismiss_complaint_duplicate(uuid, text)'),
    ('public.dismiss_complaint_escalation(uuid, text)'),
    ('public.escalate_complaint_to_enforcement(uuid, text)'),
    ('public.evaluate_complaint_escalations(uuid)'),
    ('public.evaluate_complaint_escalations_v2(uuid)'),
    ('public.execute_complaint_workflow_action(uuid, text, jsonb, timestamptz)'),
    ('public.manual_escalate_complaint(uuid, text, text, text, text)')
)
SELECT
  is(has_function_privilege('anon', sig, 'EXECUTE'), false,
     'anon cannot EXECUTE ' || sig)
FROM sigs;

WITH sigs(sig) AS (
  VALUES
    ('public.admin_override_form_version_assignment(uuid, uuid, uuid, text)'),
    ('public.assign_complaint(uuid, uuid, timestamptz)'),
    ('public.assign_complaint(uuid, uuid, text, text)'),
    ('public.assign_primary_user(uuid, uuid)'),
    ('public.cancel_application(uuid, text)'),
    ('public.confirm_complaint_duplicate(uuid, uuid, text)'),
    ('public.decide_escalation_case(uuid, text, text)'),
    ('public.delete_ppoc_mapping(uuid)'),
    ('public.dismiss_complaint_duplicate(uuid, text)'),
    ('public.dismiss_complaint_escalation(uuid, text)'),
    ('public.escalate_complaint_to_enforcement(uuid, text)'),
    ('public.evaluate_complaint_escalations(uuid)'),
    ('public.evaluate_complaint_escalations_v2(uuid)'),
    ('public.execute_complaint_workflow_action(uuid, text, jsonb, timestamptz)'),
    ('public.manual_escalate_complaint(uuid, text, text, text, text)')
)
SELECT
  is(has_function_privilege('authenticated', sig, 'EXECUTE'), true,
     'authenticated retains EXECUTE on ' || sig)
FROM sigs;

-- Worker-only RPCs (regression guard for slice 14 boundary)
SELECT is(has_function_privilege('anon',
  'public.claim_notification_outbox(integer, text)', 'EXECUTE'), false,
  'anon cannot EXECUTE claim_notification_outbox (worker-only)');

SELECT is(has_function_privilege('authenticated',
  'public.claim_notification_outbox(integer, text)', 'EXECUTE'), false,
  'authenticated cannot EXECUTE claim_notification_outbox (worker-only)');

SELECT * FROM finish();
ROLLBACK;
