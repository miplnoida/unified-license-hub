-- Phase 9 — canonical communication registry lifecycle.
--
-- Covers: queue creation, provider success (SENT_TO_PROVIDER, never DELIVERED),
-- provider failure, provider-not-configured, retry, dead letter, template
-- version retention, mandatory-notification preference bypass, and direct-ID /
-- cross-entity denial through communication_timeline().

BEGIN;
SELECT plan(20);

-- Structure
SELECT has_column('public', 'notification_dispatch_log', 'communication_state', 'canonical state column exists');
SELECT has_column('public', 'notification_dispatch_log', 'sent_to_provider_at', 'sent_to_provider_at exists');
SELECT has_column('public', 'notification_dispatch_log', 'failure_category', 'failure_category exists');
SELECT has_column('public', 'notification_dispatch_log', 'module', 'module exists');
SELECT has_column('public', 'notification_dispatch_log', 'correlation_id', 'correlation id exists');
SELECT has_function('public', 'communication_timeline', 'timeline RPC exists');
SELECT has_function('public', 'notification_dead_letters', 'dead-letter RPC exists');
SELECT has_function('public', 'can_view_communications', 'timeline authorization helper exists');

-- State vocabulary
SELECT is(
  (SELECT count(*)::int FROM unnest(enum_range(NULL::public.communication_state)) e
    WHERE e::text IN ('QUEUED','SENT_TO_PROVIDER','DELIVERED','FAILED','RETRYING',
                      'DEAD_LETTER','PROVIDER_NOT_CONFIGURED')),
  7, 'all seven required states exist');

-- Derivation: queue creation
SELECT is(public.derive_communication_state('queued', NULL, NULL, NULL, false, 0, NULL)::text,
  'QUEUED', 'new row is QUEUED');

-- Derivation: provider accepted the message — NOT delivered
SELECT is(public.derive_communication_state('sent', NULL, NULL, NULL, false, 0, NULL)::text,
  'SENT_TO_PROVIDER', 'SMTP acceptance is SENT_TO_PROVIDER, never DELIVERED');

-- Derivation: provider confirmed delivery
SELECT is(public.derive_communication_state('delivered', now(), NULL, NULL, false, 0, NULL)::text,
  'DELIVERED', 'confirmed callback is DELIVERED');

-- Derivation: DELIVERED requires a real delivered_at
SELECT isnt(public.derive_communication_state('delivered', NULL, NULL, NULL, false, 0, NULL)::text,
  'DELIVERED', 'delivery is never invented without a provider timestamp');

-- Derivation: provider not configured
SELECT is(public.derive_communication_state('failed', NULL, now(), 'smtp_not_configured', false, 0, NULL)::text,
  'PROVIDER_NOT_CONFIGURED', 'missing provider config is truthful');

-- Derivation: failure awaiting retry
SELECT is(public.derive_communication_state('failed', NULL, now(), 'connection refused', false, 1, now() + interval '5 min')::text,
  'RETRYING', 'scheduled retry is RETRYING');

-- Derivation: terminal failure
SELECT is(public.derive_communication_state('failed', NULL, now(), 'permanent provider error', false, 1, NULL)::text,
  'FAILED', 'unscheduled failure is FAILED');

-- Derivation: retry exhaustion / poison
SELECT is(public.derive_communication_state('failed', NULL, now(), 'permanent provider error', true, 6, NULL)::text,
  'DEAD_LETTER', 'exhausted retries are dead-lettered, never dropped');

-- Template retention: version + rendered snapshot are retained on the record
SELECT has_column('public', 'notification_dispatch_log', 'template_version', 'template version retained');
SELECT has_column('public', 'notification_dispatch_log', 'rendered_content', 'rendered content snapshot retained');

-- Mandatory (system_required) communications cannot be suppressed by preferences
SELECT is(
  (SELECT (public.notification_effective_preference(
      (SELECT id FROM public.profiles LIMIT 1), ek) ->> 'muted')::boolean
   FROM (SELECT event_key ek FROM public.notification_event_configs
         WHERE system_required LIMIT 1) s),
  false, 'mandatory regulatory communications are never muted');

-- Direct-ID / cross-entity denial: an unknown or unreadable parent object yields no access
SELECT ok(NOT public.can_view_communications('application', gen_random_uuid()),
  'unknown/unreadable parent object denies communication access');

SELECT * FROM finish();
ROLLBACK;
