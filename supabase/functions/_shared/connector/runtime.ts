/**
 * ADM-INT-001 — connector runtime.
 *
 * Single execution path for every outbound integration call:
 *   resolve connection -> circuit breaker -> credential -> adapter request
 *   -> timeout -> retry with exponential backoff + jitter -> normalise
 *   -> integration log (correlation id, sizes, retry attempt, category)
 *   -> health/circuit outcome.
 *
 * Callers never fetch() a provider directly.
 */
// deno-lint-ignore-file no-explicit-any
import { logIntegration } from '../integration-log.ts';
import { redact } from '../notification-redact.ts';
import {
  categorise,
  ConnectorAdapter,
  ConnectorContext,
  ConnectorCredential,
  ConnectorRequest,
  ConnectorResult,
  defaultRetryable,
  ErrorCategory,
  ResolvedConnection,
} from './types.ts';

type AnyClient = any;

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/** Load the registry row for an integration key. */
export async function resolveConnection(
  admin: AnyClient,
  integrationKey: string,
): Promise<ResolvedConnection | null> {
  const { data, error } = await admin.rpc('integration_resolve_connection', {
    _integration_key: integrationKey,
  });
  if (error || !data || data.id === undefined) return null;
  return data as ResolvedConnection;
}

/**
 * Read credential material from the backend secret store. The database only
 * ever stores the secret *reference*; the value lives in the edge runtime
 * environment so it is never queryable or renderable.
 */
export function readCredential(
  conn: ResolvedConnection,
): ConnectorCredential | null {
  if (!conn.secret_ref) return null;
  const value = Deno.env.get(conn.secret_ref);
  if (!value) return null;
  return {
    secretRef: conn.secret_ref,
    value,
    version: conn.credential_version,
  };
}

/** True when the breaker is open and still inside its cool-off window. */
export function circuitBlocked(conn: ResolvedConnection): boolean {
  if (conn.circuit_state !== 'open') return false;
  if (!conn.circuit_opened_at) return true;
  const openedAt = new Date(conn.circuit_opened_at).getTime();
  return Date.now() - openedAt < conn.circuit_cooloff_seconds * 1000;
}

export function buildUrl(base: string, req: ConnectorRequest): string {
  const url = new URL(
    req.path.replace(/^\/+/, ''),
    base.endsWith('/') ? base : `${base}/`,
  );
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export function backoff(attempt: number, baseMs: number, rand = Math.random): number {
  const exp = baseMs * Math.pow(2, attempt - 1);
  const jitter = rand() * baseMs; // full jitter — avoids synchronised retry storms
  return Math.min(exp + jitter, 60_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ExecuteOptions {
  admin: AnyClient;
  adapter: ConnectorAdapter<any>;
  connection: ResolvedConnection;
  operation: string;
  input?: Record<string, unknown>;
  context: Omit<ConnectorContext, 'connection' | 'credential' | 'correlationId'> & {
    correlationId?: string;
  };
  /** Overrides the adapter request entirely (used by Test Connection). */
  requestOverride?: ConnectorRequest;
  /** Skip persisting a log row / health mutation (tester dry runs). */
  dryRun?: boolean;
  /** Safe hash of the idempotency key, written to the log row. */
  idempotencyFingerprint?: string | null;
  /** Per-call timeout override, clamped by the runtime. */
  timeoutOverrideMs?: number | null;
}


/**
 * Execute one connector operation. Never throws: failures come back as a
 * `ConnectorResult` so the calling business flow can fall back cleanly.
 */
export async function executeConnector<T = unknown>(
  opts: ExecuteOptions,
): Promise<ConnectorResult<T>> {
  const { admin, adapter, connection, operation, input = {}, dryRun } = opts;
  const correlationId = opts.context.correlationId ?? newCorrelationId();
  const credential = readCredential(connection);
  const ctx: ConnectorContext = { ...opts.context, connection, credential, correlationId };

  const base = {
    correlationId,
    latencyMs: 0,
    attempts: 0,
    httpStatus: null as number | null,
    data: null as T | null,
  };

  const finish = async (
    result: ConnectorResult<T>,
    endpoint: string | null,
    method: string,
    requestBytes: number,
    responseBytes: number,
    responseSummary: string | null,
  ): Promise<ConnectorResult<T>> => {
    if (!dryRun) {
      const logId = await logIntegration(admin, {
        direction: 'outbound',
        integrationKey: connection.integration_key,
        endpoint,
        method,
        status: result.ok ? 'success' : 'failure',
        httpStatus: result.httpStatus,
        actorId: ctx.actorId ?? null,
        entityType: ctx.entityType ?? null,
        entityId: ctx.entityId ?? null,
        requestSummary: `${operation} (${connection.environment})`,
        responseSummary,
        error: result.error ? redact(result.error) : null,
        durationMs: result.latencyMs,
        operation,
        executionMode: result.ok
          ? (connection.provider_verified ? 'real' : 'mock')
          : null,
        idempotencyFingerprint: opts.idempotencyFingerprint ?? null,
        metadata: {
          correlation_id: correlationId,
          environment: connection.environment,
          request_bytes: requestBytes,
          response_bytes: responseBytes,
          retry_attempt: Math.max(result.attempts - 1, 0),
          error_category: result.errorCategory,
          source_module: ctx.sourceModule,
          business_event: ctx.businessEvent,
          credential_version: credential?.version ?? 0,
          adapter: adapter.key,
          operation,
        },
      });
      result.integrationLogId = logId;

      // Only real attempts move health/circuit state.
      if (
        result.errorCategory !== 'not_configured' &&
        result.errorCategory !== 'circuit_open'
      ) {
        await admin.rpc('integration_record_outcome', {
          _integration_key: connection.integration_key,
          _ok: result.ok,
          _latency_ms: result.latencyMs,
          _error: result.error ? redact(result.error) : null,
        });
      }
    }
    return result;
  };

  // --- Preconditions the caller must fall back on ------------------------
  if (!connection.enabled) {
    return {
      ...base,
      ok: false,
      errorCategory: 'not_configured',
      error: `Integration "${connection.name}" is disabled.`,
      fallback: true,
    };
  }
  if (!connection.base_url) {
    return {
      ...base,
      ok: false,
      errorCategory: 'not_configured',
      error: `Integration "${connection.name}" has no endpoint configured.`,
      fallback: true,
    };
  }
  if (connection.requires_credentials && !credential) {
    return {
      ...base,
      ok: false,
      errorCategory: 'not_configured',
      error: `Integration "${connection.name}" has no usable credential.`,
      fallback: true,
    };
  }
  if (circuitBlocked(connection)) {
    return {
      ...base,
      ok: false,
      errorCategory: 'circuit_open',
      error:
        `Integration "${connection.name}" is temporarily suspended by the circuit breaker.`,
      fallback: true,
    };
  }

  // --- Build + authenticate ---------------------------------------------
  let req: ConnectorRequest;
  try {
    req = opts.requestOverride ??
      (await adapter.buildRequest(operation as never, input, ctx));
    req = await adapter.authenticate(req, ctx);
  } catch (e) {
    return {
      ...base,
      ok: false,
      errorCategory: 'mapping',
      error: e instanceof Error ? e.message : String(e),
      fallback: false,
    };
  }

  const url = buildUrl(connection.base_url, req);
  const payload = req.body === undefined ? undefined : JSON.stringify(req.body);
  const requestBytes = payload ? new TextEncoder().encode(payload).length : 0;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': correlationId,
    ...(payload ? { 'Content-Type': 'application/json' } : {}),
    ...(ctx.idempotencyKey ? { 'Idempotency-Key': ctx.idempotencyKey } : {}),
    ...(req.headers ?? {}),
  };

  const maxAttempts = Math.max(1, Math.min(connection.retry_count + 1, 6));
  const timeout = Math.min(Math.max(connection.timeout_ms, 1000), 120_000);
  const started = Date.now();

  let attempts = 0;
  let lastCategory: ErrorCategory = 'unknown';
  let lastMessage = 'Request was not attempted.';
  let lastStatus: number | null = null;
  let responseBytes = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: req.method,
        headers,
        body: payload,
        signal: controller.signal,
        redirect: 'manual',
      });
      lastStatus = res.status;
      const text = await res.text().catch(() => '');
      responseBytes = new TextEncoder().encode(text).length;
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch { /* non-JSON provider response kept as text */ }

      if (res.ok) {
        let data: unknown;
        try {
          data = adapter.parseResponse(operation as never, res.status, body, ctx);
        } catch (e) {
          return await finish({
            ...base,
            ok: false,
            attempts,
            httpStatus: res.status,
            latencyMs: Date.now() - started,
            errorCategory: 'mapping',
            error: e instanceof Error ? e.message : String(e),
            fallback: false,
          }, url, req.method, requestBytes, responseBytes, 'Response failed mapping/validation');
        }
        return await finish({
          ok: true,
          data: data as T,
          httpStatus: res.status,
          latencyMs: Date.now() - started,
          attempts,
          correlationId,
          errorCategory: null,
          error: null,
          fallback: false,
          raw: body,
        }, url, req.method, requestBytes, responseBytes, `HTTP ${res.status} (${responseBytes} bytes)`);
      }

      const parsed = adapter.parseError(res.status, body);
      lastCategory = parsed.category ?? categorise(res.status);
      lastMessage = parsed.message;
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      lastCategory = aborted ? 'timeout' : 'network';
      lastStatus = null;
      lastMessage = aborted
        ? `No response within ${timeout} ms.`
        : e instanceof Error
        ? e.message
        : String(e);
    } finally {
      clearTimeout(timer);
    }

    const retryable = (adapter.isRetryable ?? defaultRetryable)(lastStatus, lastCategory);
    if (!retryable || attempts >= maxAttempts) break;
    await sleep(backoff(attempts, connection.retry_backoff_ms));
  }

  return await finish({
    ...base,
    ok: false,
    attempts,
    httpStatus: lastStatus,
    latencyMs: Date.now() - started,
    errorCategory: lastCategory,
    error: lastMessage,
    // Transport/availability failures let the business flow fall back;
    // provider rejections (validation/auth) must surface to the user.
    fallback: lastCategory === 'network' || lastCategory === 'timeout' ||
      lastCategory === 'server',
  }, url, req.method, requestBytes, responseBytes, `Failed: ${lastCategory}`);
}
