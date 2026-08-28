#!/usr/bin/env node
/**
 * verify:f4b4-outbox — empirical proof of the in-app notification outbox path
 * after the DEF-F4-C-03 write-contract repair.
 *
 * Drives the REAL deployed `process-notification-outbox` worker (via
 * `x-worker-token`) against synthetic `CERT-F4B4%` outbox rows and asserts:
 *   success path, field fidelity, idempotency, retry/backoff, dead-lettering,
 *   stuck-claim reaping, and browser-role lockout.
 *
 * Channel is always `in_app`, so no external email/SMS is ever dispatched.
 * All synthetic rows are removed in the epilogue.
 *
 * Usage: node scripts/verify-f4b4-outbox.mjs
 */
import { execFileSync } from 'node:child_process';

const URL_BASE = process.env.SUPABASE_URL;
const TOKEN = process.env.WORKER_INVOKE_TOKEN;
if (!URL_BASE || !TOKEN) {
  console.error('FAIL — SUPABASE_URL / WORKER_INVOKE_TOKEN not available in this environment');
  process.exit(1);
}
const TAG = 'CERT-F4B4';

const sql = (q) => execFileSync('psql', ['-At', '-q', '-F', '\t', '-c', q], { encoding: 'utf8' }).trim();
const rows = (q) => sql(q).split('\n').filter(Boolean).map((l) => l.split('\t'));
const one = (q) => sql(q);

const results = [];
const rec = (id, desc, ok, detail = '') => {
  results.push({ id, desc, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? `  [${detail}]` : ''}`);
};

async function runWorker() {
  const res = await fetch(`${URL_BASE}/functions/v1/process-notification-outbox`, {
    method: 'POST',
    headers: { 'x-worker-token': TOKEN, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, body, text };
}

function cleanup() {
  sql(`DELETE FROM public.notifications WHERE event_key LIKE '${TAG}%' OR dedupe_key LIKE 'outbox:%' AND event_key LIKE '${TAG}%'`);
  sql(`DELETE FROM public.notification_outbox WHERE event_key LIKE '${TAG}%'`);
}

try {
  cleanup();

  const userId = one(`SELECT id::text FROM auth.users ORDER BY created_at LIMIT 1`);
  if (!userId) throw new Error('no auth user available for the probe');
  const entityId = one(`SELECT gen_random_uuid()::text`);
  const corr = one(`SELECT gen_random_uuid()::text`);

  // ---------------------------------------------------------------- success
  const okId = one(`
    INSERT INTO public.notification_outbox
      (event_key, entity_type, entity_id, recipient_user_id, channel, subject, body,
       payload, correlation_id, next_attempt_at)
    VALUES ('${TAG}.success','application','${entityId}','${userId}','in_app',
            '${TAG} Application Approved','Synthetic body',
            '{"probe":"f4b4"}'::jsonb,'${corr}', now() - interval '1 minute')
    RETURNING id::text`);

  const run1 = await runWorker();
  rec('A-01', 'worker accepts the worker credential and runs', run1.status === 200, `http=${run1.status}`);

  const claimed = one(`SELECT status FROM public.notification_outbox WHERE id='${okId}'`);
  rec('A-02', 'due row transitions to sent', claimed === 'sent', `status=${claimed}`);
  rec('A-03', 'sent_at populated',
    one(`SELECT (sent_at IS NOT NULL)::text FROM public.notification_outbox WHERE id='${okId}'`) === 'true');
  rec('A-04', 'retry_count did not increment on success',
    one(`SELECT retry_count::text FROM public.notification_outbox WHERE id='${okId}'`) === '0');
  rec('A-05', 'claim released (claimed_at/claimed_by cleared)',
    one(`SELECT (claimed_at IS NULL AND claimed_by IS NULL)::text FROM public.notification_outbox WHERE id='${okId}'`) === 'true');

  const n = rows(`SELECT count(*)::text, coalesce(max(user_id::text),''), coalesce(max(entity_type),''),
                         coalesce(max(entity_id),''), coalesce(max(event_key),''),
                         coalesce(max(correlation_id::text),''), coalesce(max(title),''),
                         coalesce(max(channel),''), coalesce(max(metadata->>'outbox_id'),'')
                    FROM public.notifications WHERE dedupe_key = 'outbox:${okId}'`)[0];
  rec('A-06', 'canonical notifications row created', n[0] === '1', `rows=${n[0]}`);
  rec('A-07', 'user_id matches the outbox recipient', n[1] === userId);
  rec('A-08', 'entity_type / entity_id written to the canonical columns',
    n[2] === 'application' && n[3] === entityId, `${n[2]}/${n[3]}`);
  rec('A-09', 'event key and correlation id preserved',
    n[4] === `${TAG}.success` && n[5] === corr);
  rec('A-10', 'subject becomes the notification title, channel is in_app',
    n[6] === `${TAG} Application Approved` && n[7] === 'in_app');
  rec('A-11', 'payload/provenance metadata retained',
    one(`SELECT (metadata->>'probe' = 'f4b4' AND metadata->>'outbox_id' = '${okId}')::text
           FROM public.notifications WHERE dedupe_key='outbox:${okId}'`) === 'true');

  // ------------------------------------------------------------ idempotency
  const run2 = await runWorker();
  rec('B-01', 'already-sent row is not re-claimed', run2.status === 200 &&
    one(`SELECT count(*)::text FROM public.notifications WHERE dedupe_key='outbox:${okId}'`) === '1');

  // force a redelivery of the same outbox row: dedupe must prevent a duplicate
  sql(`UPDATE public.notification_outbox SET status='pending', sent_at=NULL,
         next_attempt_at = now() - interval '1 minute' WHERE id='${okId}'`);
  const run3 = await runWorker();
  const dupCount = one(`SELECT count(*)::text FROM public.notifications WHERE dedupe_key='outbox:${okId}'`);
  rec('B-02', 'repeated worker delivery creates no duplicate notification',
    run3.status === 200 && dupCount === '1', `notifications=${dupCount}`);
  rec('B-03', 'repeated delivery still settles the outbox row as sent',
    one(`SELECT status FROM public.notification_outbox WHERE id='${okId}'`) === 'sent');

  // ------------------------------------------------------- failure / retry
  const badId = one(`
    INSERT INTO public.notification_outbox
      (event_key, entity_type, entity_id, recipient_user_id, channel, subject, body, next_attempt_at)
    VALUES ('${TAG}.missing_recipient','application','${entityId}',NULL,'in_app',
            '${TAG} No Recipient','x', now() - interval '1 minute')
    RETURNING id::text`);
  await runWorker();
  const bad = rows(`SELECT status, retry_count::text, coalesce(last_error,''),
                           (next_attempt_at > now())::text
                      FROM public.notification_outbox WHERE id='${badId}'`)[0];
  rec('C-01', 'missing recipient fails rather than delivering', bad[0] === 'pending', `status=${bad[0]}`);
  rec('C-02', 'retry_count incremented once', bad[1] === '1', `retry=${bad[1]}`);
  rec('C-03', 'failure reason recorded', bad[2].includes('in_app_row_missing_user'), bad[2]);
  rec('C-04', 'backoff pushes next_attempt_at into the future', bad[3] === 'true');
  rec('C-05', 'failed delivery creates no notification',
    one(`SELECT count(*)::text FROM public.notifications WHERE dedupe_key='outbox:${badId}'`) === '0');

  // second attempt increments again (monotonic backoff)
  sql(`UPDATE public.notification_outbox SET next_attempt_at = now() - interval '1 minute' WHERE id='${badId}'`);
  await runWorker();
  rec('C-06', 'subsequent failure increments the retry counter again',
    one(`SELECT retry_count::text FROM public.notification_outbox WHERE id='${badId}'`) === '2');

  // --------------------------------------------------------- dead-lettering
  sql(`UPDATE public.notification_outbox SET retry_count = 5, status='pending',
         next_attempt_at = now() - interval '1 minute' WHERE id='${badId}'`);
  await runWorker();
  const deadRow = rows(`SELECT status, retry_count::text FROM public.notification_outbox WHERE id='${badId}'`)[0];
  rec('D-01', 'max attempts dead-letters the row', deadRow[0] === 'dead', `status=${deadRow[0]}`);
  rec('D-02', 'dead row retains the final attempt count', deadRow[1] === '6', `retry=${deadRow[1]}`);
  await runWorker();
  rec('D-03', 'dead row is never re-claimed',
    one(`SELECT status FROM public.notification_outbox WHERE id='${badId}'`) === 'dead');

  // ------------------------------------------------------------- reap stuck
  const stuckId = one(`
    INSERT INTO public.notification_outbox
      (event_key, entity_type, entity_id, recipient_user_id, channel, subject, body,
       status, claimed_at, claimed_by, next_attempt_at)
    VALUES ('${TAG}.stuck','application','${entityId}','${userId}','in_app',
            '${TAG} Stuck Row','x','processing', now() - interval '30 minutes','dead-worker',
            now() - interval '30 minutes')
    RETURNING id::text`);
  await runWorker();
  const stuck = one(`SELECT status FROM public.notification_outbox WHERE id='${stuckId}'`);
  rec('E-01', 'stuck processing row is reaped and delivered', stuck === 'sent', `status=${stuck}`);
  rec('E-02', 'reaped row produced its notification',
    one(`SELECT count(*)::text FROM public.notifications WHERE dedupe_key='outbox:${stuckId}'`) === '1');

  // --------------------------------------------------- browser-role lockout
  rec('F-01', 'anon/authenticated hold no write grants on notification_outbox',
    one(`SELECT count(*)::text FROM information_schema.table_privileges
          WHERE table_schema='public' AND table_name='notification_outbox'
            AND grantee IN ('anon','authenticated')
            AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')`) === '0');
  rec('F-02', 'claim/reap routines are not executable by browser roles',
    one(`SELECT count(*)::text FROM information_schema.routine_privileges
          WHERE routine_schema='public'
            AND routine_name IN ('claim_notification_outbox','reap_stuck_notification_outbox')
            AND grantee IN ('anon','authenticated','PUBLIC')`) === '0');
  const unauth = await fetch(`${URL_BASE}/functions/v1/process-notification-outbox`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  rec('F-03', 'worker endpoint rejects an invocation without the worker credential',
    unauth.status === 401 || unauth.status === 403, `http=${unauth.status}`);
} finally {
  cleanup();
  const residue = sql(`SELECT (SELECT count(*) FROM public.notification_outbox WHERE event_key LIKE '${TAG}%')
                            + (SELECT count(*) FROM public.notifications WHERE event_key LIKE '${TAG}%')`);
  console.log(`\nresidue (${TAG}%): ${residue}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`verify:f4b4-outbox — ${results.length - failed.length} passed / ${failed.length} failed`);
  if (failed.length || residue !== '0') process.exitCode = 1;
}
