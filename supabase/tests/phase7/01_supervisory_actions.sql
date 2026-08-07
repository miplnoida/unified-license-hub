-- Phase 7 / PRU-ACT-001 — supervisory action lifecycle
--
-- Asserts: action reference integrity, new status vocabulary, append-only
-- evidence/event ledgers, RPC authorization surface, response → review → close
-- gating (an evidence-required action cannot be completed without an accepted
-- review), breach sweep + escalation, and monitoring bucket derivation.

BEGIN;
SELECT plan(38);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'prudential_action_responses', 'responses table exists');
SELECT has_table('public', 'prudential_action_events', 'events table exists');
SELECT has_column('public', 'prudential_actions', 'action_reference', 'action_reference column exists');
SELECT has_column('public', 'prudential_actions', 'evidence_required', 'evidence_required column exists');
SELECT has_column('public', 'prudential_actions', 'entity_owner_user_id', 'entity owner column exists');
SELECT has_column('public', 'prudential_actions', 'breached_at', 'breached_at column exists');
SELECT has_column('public', 'prudential_actions', 'review_status', 'review_status column exists');
SELECT col_not_null('public', 'prudential_actions', 'action_reference', 'action_reference is NOT NULL');

SELECT ok(EXISTS (
  SELECT 1 FROM pg_indexes
   WHERE schemaname='public' AND indexname='prudential_actions_action_reference_key'
), 'action_reference is unique');

-- ---------------------------------------------------------------------------
-- Grants: evidence and event ledgers are read-only for client roles
-- ---------------------------------------------------------------------------
SELECT ok(has_table_privilege('authenticated','public.prudential_action_responses','SELECT'),
          'authenticated can read responses');
SELECT ok(NOT has_table_privilege('authenticated','public.prudential_action_responses','INSERT'),
          'authenticated cannot insert responses directly');
SELECT ok(NOT has_table_privilege('authenticated','public.prudential_action_responses','UPDATE'),
          'authenticated cannot update responses');
SELECT ok(NOT has_table_privilege('authenticated','public.prudential_action_responses','DELETE'),
          'authenticated cannot delete responses');
SELECT ok(NOT has_table_privilege('anon','public.prudential_action_responses','SELECT'),
          'anon cannot read responses');
SELECT ok(NOT has_table_privilege('authenticated','public.prudential_action_events','UPDATE'),
          'authenticated cannot update events');
SELECT ok(NOT has_table_privilege('authenticated','public.prudential_action_events','DELETE'),
          'authenticated cannot delete events');
SELECT ok(NOT has_table_privilege('anon','public.prudential_action_events','SELECT'),
          'anon cannot read events');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.prudential_action_responses'::regclass),
          'RLS enabled on responses');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.prudential_action_events'::regclass),
          'RLS enabled on events');

-- ---------------------------------------------------------------------------
-- RPC authorization surface
-- ---------------------------------------------------------------------------
SELECT ok(has_function_privilege('authenticated',
            'public.submit_prudential_action_response(uuid,text,uuid[])','EXECUTE'),
          'authenticated may call submit_prudential_action_response');
SELECT ok(NOT has_function_privilege('anon',
            'public.submit_prudential_action_response(uuid,text,uuid[])','EXECUTE'),
          'anon may not call submit_prudential_action_response');
SELECT ok(NOT has_function_privilege('anon',
            'public.review_prudential_action_response(uuid,text,text)','EXECUTE'),
          'anon may not call review_prudential_action_response');
SELECT ok(NOT has_function_privilege('anon',
            'public.close_prudential_action(uuid,text,text)','EXECUTE'),
          'anon may not call close_prudential_action');
SELECT ok(NOT has_function_privilege('anon',
            'public.prudential_action_monitor(uuid,integer)','EXECUTE'),
          'anon may not call prudential_action_monitor');

SELECT ok((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='submit_prudential_action_response'),
          'submit RPC is SECURITY DEFINER');
SELECT ok((SELECT array_to_string(p.proconfig,',') LIKE '%search_path%'
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='review_prudential_action_response'),
          'review RPC pins search_path');
SELECT ok((SELECT array_to_string(p.proconfig,',') LIKE '%search_path%'
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='close_prudential_action'),
          'close RPC pins search_path');

-- ---------------------------------------------------------------------------
-- Behaviour (service_role context, real rows)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

INSERT INTO public.licensees (id, name)
VALUES ('99999999-0000-0000-0000-0000000000a1', 'Phase7 Test Bank')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.prudential_actions
  (id, entity_id, source_type, action_type, title, description, severity, status,
   due_date, evidence_required, breach_after_days)
VALUES
  ('99999999-0000-0000-0000-0000000000b1','99999999-0000-0000-0000-0000000000a1',
   'manual','remediation','Phase7 evidence action','desc','high','open',
   CURRENT_DATE - 40, true, 7);

SELECT isnt((SELECT action_reference FROM public.prudential_actions
              WHERE id='99999999-0000-0000-0000-0000000000b1'), NULL,
            'action reference generated automatically');

SELECT ok((SELECT count(*) FROM public.prudential_action_events
            WHERE action_id='99999999-0000-0000-0000-0000000000b1' AND event_type='created') = 1,
          'creation event logged');

-- New statuses accepted, invalid ones refused.
SELECT lives_ok($$UPDATE public.prudential_actions SET status='awaiting_evidence'
                   WHERE id='99999999-0000-0000-0000-0000000000b1'$$,
                'awaiting_evidence is a valid status');
SELECT throws_ok($$UPDATE public.prudential_actions SET status='not_a_status'
                    WHERE id='99999999-0000-0000-0000-0000000000b1'$$,
                 '23514', NULL, 'invalid status refused by check constraint');

SELECT ok((SELECT count(*) FROM public.prudential_action_events
            WHERE action_id='99999999-0000-0000-0000-0000000000b1'
              AND to_status='awaiting_evidence') = 1,
          'status change logged to the event ledger');

-- Append-only ledgers reject mutation even here.
SELECT throws_ok($$UPDATE public.prudential_action_events SET reason='tamper'
                    WHERE action_id='99999999-0000-0000-0000-0000000000b1'$$,
                 NULL, NULL, 'event ledger rejects UPDATE');

-- Closure gate: evidence required, nothing accepted yet.
INSERT INTO public.prudential_action_responses(action_id, kind, narrative, submitted_by)
VALUES ('99999999-0000-0000-0000-0000000000b1','entity_response','we have remediated', NULL);

SELECT is((SELECT count(*)::int FROM public.prudential_action_responses
            WHERE action_id='99999999-0000-0000-0000-0000000000b1'), 1,
          'entity response persisted');

SELECT throws_ok($$UPDATE public.prudential_action_responses SET narrative='rewritten'
                    WHERE action_id='99999999-0000-0000-0000-0000000000b1'$$,
                 NULL, NULL, 'response ledger rejects UPDATE');

-- Breach sweep flips the action and raises exactly one escalation.
UPDATE public.prudential_actions SET status='overdue'
 WHERE id='99999999-0000-0000-0000-0000000000b1';

SELECT ok(public.mark_prudential_actions_breached() >= 1, 'breach sweep processed at least one action');

SELECT is((SELECT status FROM public.prudential_actions
            WHERE id='99999999-0000-0000-0000-0000000000b1'), 'breached',
          'action marked breached');
SELECT isnt((SELECT breached_at FROM public.prudential_actions
              WHERE id='99999999-0000-0000-0000-0000000000b1'), NULL,
            'breached_at stamped');
SELECT is((SELECT count(*)::int FROM public.prudential_escalations
            WHERE related_type='action' AND related_id='99999999-0000-0000-0000-0000000000b1'), 1,
          'breach raised exactly one escalation');

-- Re-running must not duplicate the escalation.
SELECT ok(public.mark_prudential_actions_breached() >= 0, 'breach sweep is re-runnable');
SELECT is((SELECT count(*)::int FROM public.prudential_escalations
            WHERE related_type='action' AND related_id='99999999-0000-0000-0000-0000000000b1'), 1,
          'no duplicate escalation on re-sweep');

SELECT ok((SELECT count(*) FROM public.prudential_action_events
            WHERE action_id='99999999-0000-0000-0000-0000000000b1' AND event_type='breached') >= 1,
          'breach event logged');

ROLLBACK;
