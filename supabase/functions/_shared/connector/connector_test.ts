// Connector framework unit tests (Deno).
//
// Exercises the runtime against a stubbed fetch: adapter mapping, retry with
// backoff, timeout categorisation, circuit-breaker short-circuit, fallback
// semantics, credential secrecy and integration logging.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { backoff, buildUrl, circuitBlocked, executeConnector, readCredential } from './runtime.ts';
import { ADAPTERS, getAdapter } from './index.ts';
import type { ResolvedConnection } from './types.ts';
import { amlScreeningAdapter } from './adapters/aml_screening.ts';
import { paymentGatewayAdapter } from './adapters/payment_gateway.ts';

function conn(over: Partial<ResolvedConnection> = {}): ResolvedConnection {
  return {
    id: 'c1',
    integration_key: 'aml_screening',
    name: 'AML Screening',
    adapter_key: 'aml_screening',
    enabled: true,
    environment: 'sandbox',
    protocol: 'REST',
    auth_type: 'api_key',
    base_url: 'https://provider.test/v1',
    timeout_ms: 1000,
    retry_count: 2,
    retry_backoff_ms: 1,
    rate_limit_per_minute: null,
    requires_credentials: true,
    data_mapping: {},
    circuit_state: 'closed',
    circuit_opened_at: null,
    circuit_cooloff_seconds: 300,
    secret_ref: 'TEST_AML_KEY',
    credential_version: 3,
    ...over,
  };
}

/** Minimal admin-client stub capturing log rows and health outcomes. */
function stubAdmin() {
  const logs: Record<string, unknown>[] = [];
  const outcomes: Record<string, unknown>[] = [];
  return {
    logs,
    outcomes,
    from: () => ({
      insert: (v: Record<string, unknown>) => {
        logs.push(v);
        return Promise.resolve({ error: null });
      },
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'integration_record_outcome') outcomes.push(args);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const origFetch = globalThis.fetch;
function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
}
function restoreFetch() {
  globalThis.fetch = origFetch;
}

Deno.test('every registry adapter key resolves to an adapter with operations', () => {
  for (const [key, adapter] of Object.entries(ADAPTERS)) {
    assertEquals(getAdapter(key), adapter);
    assert(adapter.operations.length > 0, `${key} declares no operations`);
    assert(adapter.operations.includes('health'), `${key} has no health operation`);
  }
});

Deno.test('adapter normalises the provider payload, not the raw shape', () => {
  const out = amlScreeningAdapter.parseResponse(
    'screen_individual',
    200,
    { screening_id: 'S1', matches: [{ name: 'X' }], risk_score: 80 },
    {} as never,
  ) as Record<string, unknown>;
  assertEquals(out.screeningId, 'S1');
  assertEquals(out.matchCount, 1);
  assertEquals(out.riskBand, 'high');
  assertEquals(out.requiresManualReview, true);
});

Deno.test('successful call logs correlation id, sizes and records health', async () => {
  Deno.env.set('TEST_AML_KEY', 'super-secret-value');
  const admin = stubAdmin();
  stubFetch(() =>
    Promise.resolve(
      new Response(JSON.stringify({ screening_id: 'S9', matches: [], risk_score: 10 }), {
        status: 200,
      }),
    )
  );
  try {
    const res = await executeConnector({
      admin,
      adapter: amlScreeningAdapter,
      connection: conn(),
      operation: 'screen_individual',
      input: { fullName: 'A B' },
      context: { sourceModule: 'fit_and_proper', businessEvent: 'fp.screening_requested' },
    });
    assert(res.ok);
    assertEquals(res.attempts, 1);
    assertEquals((res.data as Record<string, unknown>).riskBand, 'low');
    const log = admin.logs[0];
    assertEquals(log.status, 'success');
    const meta = log.metadata as Record<string, unknown>;
    assertEquals(meta.correlation_id, res.correlationId);
    assertEquals(meta.source_module, 'fit_and_proper');
    assertEquals(meta.retry_attempt, 0);
    assert((meta.request_bytes as number) > 0);
    // Credential value must never reach the log row.
    assert(!JSON.stringify(admin.logs).includes('super-secret-value'));
    assertEquals(admin.outcomes[0]._ok, true);
  } finally {
    restoreFetch();
    Deno.env.delete('TEST_AML_KEY');
  }
});

Deno.test('server errors are retried up to retry_count + 1 attempts', async () => {
  Deno.env.set('TEST_AML_KEY', 'k');
  const admin = stubAdmin();
  let calls = 0;
  stubFetch(() => {
    calls += 1;
    return Promise.resolve(new Response('{"message":"boom"}', { status: 503 }));
  });
  try {
    const res = await executeConnector({
      admin,
      adapter: amlScreeningAdapter,
      connection: conn({ retry_count: 2 }),
      operation: 'screen_individual',
      input: {},
      context: { sourceModule: 'test', businessEvent: 'test' },
    });
    assertEquals(calls, 3);
    assertEquals(res.attempts, 3);
    assertEquals(res.errorCategory, 'server');
    assert(res.fallback, 'availability failures must allow fallback');
    assertEquals(admin.outcomes[0]._ok, false);
  } finally {
    restoreFetch();
    Deno.env.delete('TEST_AML_KEY');
  }
});

Deno.test('provider validation rejections are not retried and do not fall back', async () => {
  Deno.env.set('TEST_AML_KEY', 'k');
  const admin = stubAdmin();
  let calls = 0;
  stubFetch(() => {
    calls += 1;
    return Promise.resolve(new Response('{"message":"bad name"}', { status: 422 }));
  });
  try {
    const res = await executeConnector({
      admin,
      adapter: amlScreeningAdapter,
      connection: conn(),
      operation: 'screen_individual',
      input: {},
      context: { sourceModule: 'test', businessEvent: 'test' },
    });
    assertEquals(calls, 1);
    assertEquals(res.errorCategory, 'validation');
    assertEquals(res.error, 'bad name');
    assertEquals(res.fallback, false);
  } finally {
    restoreFetch();
    Deno.env.delete('TEST_AML_KEY');
  }
});

Deno.test('payment adapter never retries a provider rejection', () => {
  assertEquals(paymentGatewayAdapter.isRetryable!(422, 'validation'), false);
  assertEquals(paymentGatewayAdapter.isRetryable!(429, 'rate_limit'), false);
  assertEquals(paymentGatewayAdapter.isRetryable!(null, 'timeout'), true);
  assertEquals(paymentGatewayAdapter.isRetryable!(502, 'server'), true);
});

Deno.test('timeouts are categorised and surfaced as fallback', async () => {
  Deno.env.set('TEST_AML_KEY', 'k');
  const admin = stubAdmin();
  stubFetch((_u, init) =>
    new Promise((_res, rej) => {
      (init.signal as AbortSignal).addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        rej(e);
      });
    })
  );
  try {
    const res = await executeConnector({
      admin,
      adapter: amlScreeningAdapter,
      connection: conn({ timeout_ms: 1000, retry_count: 0 }),
      operation: 'screen_individual',
      input: {},
      context: { sourceModule: 'test', businessEvent: 'test' },
    });
    assertEquals(res.errorCategory, 'timeout');
    assert(res.fallback);
  } finally {
    restoreFetch();
    Deno.env.delete('TEST_AML_KEY');
  }
});

Deno.test('disabled, unconfigured and open-circuit connections short-circuit to fallback', async () => {
  Deno.env.set('TEST_AML_KEY', 'k');
  const admin = stubAdmin();
  const base = {
    admin,
    adapter: amlScreeningAdapter,
    operation: 'screen_individual',
    input: {},
    context: { sourceModule: 'test', businessEvent: 'test' },
  };

  const disabled = await executeConnector({ ...base, connection: conn({ enabled: false }) });
  assertEquals(disabled.errorCategory, 'not_configured');
  assert(disabled.fallback);

  const noUrl = await executeConnector({ ...base, connection: conn({ base_url: null }) });
  assertEquals(noUrl.errorCategory, 'not_configured');

  const noCred = await executeConnector({ ...base, connection: conn({ secret_ref: null }) });
  assertEquals(noCred.errorCategory, 'not_configured');

  const open = await executeConnector({
    ...base,
    connection: conn({ circuit_state: 'open', circuit_opened_at: new Date().toISOString() }),
  });
  assertEquals(open.errorCategory, 'circuit_open');
  assert(open.fallback);

  // No provider call attempted, so no health mutation was recorded.
  assertEquals(admin.outcomes.length, 0);
  Deno.env.delete('TEST_AML_KEY');
});

Deno.test('circuit breaker reopens for traffic after the cool-off window', () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  assertEquals(
    circuitBlocked(conn({ circuit_state: 'open', circuit_opened_at: stale, circuit_cooloff_seconds: 300 })),
    false,
  );
  assertEquals(
    circuitBlocked(conn({ circuit_state: 'open', circuit_opened_at: new Date().toISOString() })),
    true,
  );
  assertEquals(circuitBlocked(conn({ circuit_state: 'closed' })), false);
});

Deno.test('credential is read from the secret store by reference only', () => {
  assertEquals(readCredential(conn({ secret_ref: 'MISSING_REF' })), null);
  Deno.env.set('TEST_AML_KEY', 'v1');
  const cred = readCredential(conn());
  assertEquals(cred?.value, 'v1');
  assertEquals(cred?.version, 3);
  Deno.env.delete('TEST_AML_KEY');
});

Deno.test('urls join base and path without losing path segments', () => {
  assertEquals(
    buildUrl('https://provider.test/v1', { method: 'GET', path: 'companies/42' }),
    'https://provider.test/v1/companies/42',
  );
  assertEquals(
    buildUrl('https://provider.test/v1/', { method: 'GET', path: '/health', query: { a: '1' } }),
    'https://provider.test/v1/health?a=1',
  );
});

Deno.test('backoff grows exponentially with jitter and is capped', () => {
  assertEquals(backoff(1, 1000, () => 0), 1000);
  assertEquals(backoff(2, 1000, () => 0), 2000);
  assertEquals(backoff(3, 1000, () => 0.5), 4500);
  assertEquals(backoff(20, 1000, () => 1), 60_000);
});
