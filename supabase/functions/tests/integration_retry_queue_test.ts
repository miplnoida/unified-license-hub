/**
 * ADM-INT-001 Group C — durable retry queue enqueue governance.
 *
 * These tests exercise `invokeIntegration()` against a stub admin client, so
 * the enqueue decision is proven without a live provider:
 *   * retryable technical failures are enqueued once, with the redacted
 *     payload and the ORIGINAL idempotency fingerprint;
 *   * permanent business rejections are never enqueued;
 *   * callers that do not opt in are never enqueued.
 */
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { invokeIntegration } from '../_shared/integration/invoke.ts';

interface Call { name: string; args: any }

function stubAdmin(opts: { connection?: any } = {}) {
  const calls: Call[] = [];
  const admin: any = {
    calls,
    rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === 'integration_resolve_connection') {
        return Promise.resolve({ data: opts.connection ?? null, error: null });
      }
      if (name === 'integration_retry_enqueue') {
        return Promise.resolve({ data: 'queue-row-1', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from() {
      const chain: any = {
        insert: () => chain,
        update: () => chain,
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (r: any) => Promise.resolve({ data: null, error: null }).then(r),
      };
      return chain;
    },
  };
  return admin;
}

const baseRequest = {
  integrationKey: 'aml_screening',
  operation: 'screen_individual',
  sourceModule: 'fit_and_proper',
  businessEvent: 'fp.screening.requested',
  sourceEntityType: 'fp_assessment',
  sourceEntityId: '11111111-1111-1111-1111-111111111111',
  idempotencyKey: 'fp:assessment:1:aml',
  payload: { fullName: 'Jane Doe', nationalId: 'A1234567', reference: 'REF-1' },
};

Deno.test('unregistered integration + retryQueue enqueues once with fingerprint', async () => {
  const admin = stubAdmin();
  const result = await invokeIntegration(admin, { ...baseRequest, retryQueue: true });

  assertEquals(result.success, false);
  assertEquals(result.executionMode, 'fallback'); // not_configured is fallback-eligible
  assertEquals(result.retryQueueId, 'queue-row-1');

  const enqueues = admin.calls.filter((c: Call) => c.name === 'integration_retry_enqueue');
  assertEquals(enqueues.length, 1);
  const args = enqueues[0].args;
  assertEquals(args._integration_key, 'aml_screening');
  assertEquals(args._operation, 'screen_individual');
  assertEquals(args._source_module, 'fit_and_proper');
  assertEquals(args._idempotency_key, 'fp:assessment:1:aml');
  assert(typeof args._idempotency_fingerprint === 'string' && args._idempotency_fingerprint.length > 0);
  assertEquals(args._error_category, 'not_configured');
  // the stored request must be redacted, never raw
  assert(!JSON.stringify(args._payload).includes('A1234567'));
  assert((args._redacted_fields as string[]).includes('nationalId'));
});

Deno.test('no enqueue when the caller does not opt in', async () => {
  const admin = stubAdmin();
  const result = await invokeIntegration(admin, baseRequest);
  assertEquals(result.retryQueueId, null);
  assertEquals(
    admin.calls.filter((c: Call) => c.name === 'integration_retry_enqueue').length,
    0,
  );
});

Deno.test('unsupported operation is a validation rejection and is never enqueued', async () => {
  const admin = stubAdmin({
    connection: {
      id: 'conn-1',
      integration_key: 'aml_screening',
      adapter_key: 'aml_screening',
      enabled: true,
      provider_verified: false,
      environment: 'sandbox',
      fallback_enabled: true,
      fallback_strategy: 'internal_logic',
      fallback_allowed_categories: ['network', 'timeout', 'server', 'not_configured'],
      fallback_approval_status: 'approved',
    },
  });
  const result = await invokeIntegration(admin, {
    ...baseRequest,
    operation: 'not_a_real_operation',
    retryQueue: true,
  });
  assertEquals(result.success, false);
  assertEquals(result.errorCategory, 'validation');
  assertEquals(result.executionMode, 'blocked');
  assertEquals(result.retryQueueId, null);
  assertEquals(
    admin.calls.filter((c: Call) => c.name === 'integration_retry_enqueue').length,
    0,
  );
});
