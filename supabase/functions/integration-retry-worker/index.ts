// ADM-INT-001 — durable integration retry worker (pg_cron, every minute).
//
// Drains `integration_retry_queue`:
//   * claims work atomically via `integration_retry_claim` (FOR UPDATE SKIP LOCKED
//     with a lease; stale leases from dead workers are recovered on claim);
//   * re-issues each call through the ONE canonical `invokeIntegration()` service
//     re-using the ORIGINAL idempotency key — a retry can never create a second
//     external record;
//   * records each attempt with `integration_retry_record_outcome`, which applies
//     exponential backoff with jitter, honours the per-integration attempt cap,
//     and moves exhausted items into `integration_dead_letter`.
//
// Permanent business rejections (auth, authorization, validation, mapping,
// duplicate, compliance) are never enqueued and never re-attempted here.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireWorkerInvocationAsync } from '../_shared/workerAuth.ts';
import { invokeIntegration } from '../_shared/integration/invoke.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-worker-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BATCH_SIZE = 15;
const LEASE_SECONDS = 120;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Accepts the service-role bearer, the standing worker token, or a
  // single-use token issued by pg_cron via public.notification_worker_kick().
  const gate = await requireWorkerInvocationAsync(req, 'integration-retry-worker');
  if (!gate.ok) return gate.response;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const workerId = `integration-retry-worker:${crypto.randomUUID()}`;
  const summary = {
    claimed: 0,
    succeeded: 0,
    rescheduled: 0,
    dead_letter: 0,
    failed: 0,
    skipped: 0,
  };

  const { data: batch, error } = await admin.rpc('integration_retry_claim', {
    _worker: workerId,
    _limit: BATCH_SIZE,
    _lease_seconds: LEASE_SECONDS,
  });

  if (error) {
    console.error('[integration-retry] claim failed:', error.message);
    return json({ ok: false, stage: 'claim', error: error.message, summary });
  }

  for (const row of (batch as any[]) ?? []) {
    summary.claimed++;

    // The queue stores a REDACTED request shape, so a payload that was
    // redacted cannot be replayed verbatim; those items are dead-lettered for
    // an operator instead of being sent with lossy data.
    const redactedFields: string[] = row.redacted_fields ?? [];
    if (redactedFields.length > 0) {
      summary.skipped++;
      await admin.rpc('integration_retry_record_outcome', {
        _id: row.id,
        _ok: false,
        _execution_mode: 'blocked',
        _error_category: 'not_configured',
        _error:
          'Request payload contained redacted fields and cannot be replayed automatically.',
        _provider_status: null,
        _integration_log_id: row.last_integration_log_id ?? null,
        _provider_response: {},
      });
      continue;
    }

    let outcome = 'failed';
    try {
      const result = await invokeIntegration(admin, {
        integrationKey: row.integration_key,
        operation: row.operation,
        sourceModule: row.source_module,
        businessEvent: row.business_event ?? 'integration.retry',
        sourceEntityType: row.source_entity_type,
        sourceEntityId: row.source_entity_id,
        actorId: row.actor_id,
        correlationId: row.correlation_id ?? undefined,
        // SAME idempotency key as the original attempt.
        idempotencyKey: row.idempotency_key,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        requiredCapability: row.required_capability,
        fallbackPolicy: 'forbid', // the queue is the retry mechanism, not fallback
        timeoutOverrideMs: row.timeout_override_ms,
        metadata: {
          ...(row.metadata ?? {}),
          retry_queue_id: row.id,
          retry_attempt: row.attempts,
          worker: workerId,
        },
        retryQueue: false, // never enqueue from inside the worker
      });

      const { data } = await admin.rpc('integration_retry_record_outcome', {
        _id: row.id,
        _ok: result.success,
        _execution_mode: result.executionMode,
        _error_category: result.errorCategory,
        _error: result.errorMessage ?? result.providerMessage ?? null,
        _provider_status: result.providerStatus,
        _integration_log_id: result.integrationLogId,
        _provider_response: {
          provider_status: result.providerStatus,
          provider_reference: result.providerReference,
          execution_mode: result.executionMode,
        },
      });
      outcome = (data as string) ?? (result.success ? 'succeeded' : 'failed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[integration-retry] attempt threw:', message);
      const { data } = await admin.rpc('integration_retry_record_outcome', {
        _id: row.id,
        _ok: false,
        _execution_mode: 'blocked',
        _error_category: 'server',
        _error: message.slice(0, 500),
        _provider_status: null,
        _integration_log_id: null,
        _provider_response: {},
      });
      outcome = (data as string) ?? 'failed';
    }

    if (outcome === 'succeeded') summary.succeeded++;
    else if (outcome === 'retry_scheduled') summary.rescheduled++;
    else if (outcome === 'dead_letter') summary.dead_letter++;
    else summary.failed++;
  }

  return json({ ok: true, worker: workerId, summary });
});

function json(body: unknown): Response {
  // Errors are returned with HTTP 200 and details in the body (house rule).
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
