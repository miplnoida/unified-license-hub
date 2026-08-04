/**
 * ADM-INT-001 — the ONE canonical Integration Manager invocation service.
 *
 * Every business module (registration/KYC, fit & proper, payments, licence
 * signing, registry publication, reporting, audit export) reaches an external
 * system through `invokeIntegration()` and nothing else.
 *
 * Business modules must never:
 *   - construct provider URLs or read credential references;
 *   - call a provider API, or implement timeout/retry logic;
 *   - decide for themselves whether fallback is allowed;
 *   - write integration logs directly;
 *   - mark external verification as successful without an adapter result.
 *
 * Fallback is GOVERNED here, from per-connection configuration plus the error
 * category. A negative provider *business* response is a valid external
 * result: it is never converted into fallback success.
 */
// deno-lint-ignore-file no-explicit-any
import { getAdapter } from '../connector/index.ts';
import { executeConnector, newCorrelationId, resolveConnection } from '../connector/runtime.ts';
import type { ErrorCategory, ResolvedConnection } from '../connector/types.ts';
import { idempotencyFingerprint, redactedKeys, redactPayload } from './redact.ts';
import { logIntegration } from '../integration-log.ts';

export type ExecutionMode = 'real' | 'mock' | 'fallback' | 'blocked';

/** How the caller wants fallback treated. Governance can still refuse it. */
export type FallbackPolicy =
  /** Use fallback when the connection configuration allows it (default). */
  | 'auto'
  /** Never fall back — surface the technical failure to the caller. */
  | 'forbid';

export interface IntegrationRequest {
  integrationKey: string;
  operation: string;
  sourceModule: string;
  businessEvent: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actorId?: string | null;
  correlationId?: string;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
  /** Adapter capability the flow needs, checked before any provider call. */
  requiredCapability?: string | null;
  fallbackPolicy?: FallbackPolicy;
  timeoutOverrideMs?: number | null;
  metadata?: Record<string, unknown>;
  /**
   * Opt in to the durable retry queue. When true, a *technically* retryable
   * failure is enqueued in `integration_retry_queue` under the SAME
   * idempotency fingerprint. Permanent business rejections are never enqueued
   * (the enqueue RPC refuses them).
   */
  retryQueue?: boolean;
}


export interface IntegrationResult<T = unknown> {
  success: boolean;
  executionMode: ExecutionMode;
  integrationKey: string;
  connectionId: string | null;
  adapterKey: string | null;
  providerVerified: boolean;
  providerStatus: number | null;
  data: T | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  /** Governed fallback implementation the caller must run, when applicable. */
  fallbackImplementation: string | null;
  retryable: boolean;
  correlationId: string;
  integrationLogId: string | null;
  errorCategory: ErrorCategory | null;
  errorMessage: string | null;
  providerMessage: string | null;
  providerReference: string | null;
  /** Durable retry-queue row when the failure was enqueued, else null. */
  retryQueueId: string | null;
  respondedAt: string;
}


/**
 * Categories that represent a provider *decision*, not a transport problem.
 * These may NEVER be replaced by fallback success: an AML hit, a sanctions
 * match, a declined payment, a rejected signature, a registry rejection and an
 * authentication rejection all have to reach the business flow as failures.
 */
export const BUSINESS_DECISION_CATEGORIES: ReadonlySet<string> = new Set([
  'auth',
  'authorization',
  'validation',
  'mapping',
  'duplicate',
  'compliance',
]);

/** Technical categories that MAY qualify for fallback if configured. */
export const TECHNICAL_CATEGORIES: ReadonlySet<string> = new Set([
  'not_configured',
  'network',
  'timeout',
  'server',
  'circuit_open',
  'rate_limit',
]);

const DEFAULT_ALLOWED: string[] = [
  'not_configured',
  'network',
  'timeout',
  'server',
  'circuit_open',
];

export interface FallbackDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Pure governance function — exercised directly by the test suite.
 * `reason` is recorded on the fallback event and the integration log.
 */
export function decideFallback(
  connection: Pick<
    ResolvedConnection,
    | 'fallback_enabled'
    | 'fallback_strategy'
    | 'fallback_allowed_categories'
    | 'fallback_approval_status'
  > | null,
  category: ErrorCategory | null,
  policy: FallbackPolicy = 'auto',
): FallbackDecision {
  const cat = category ?? 'unknown';
  if (BUSINESS_DECISION_CATEGORIES.has(cat)) {
    return { allowed: false, reason: 'provider_business_decision' };
  }
  if (!TECHNICAL_CATEGORIES.has(cat)) {
    return { allowed: false, reason: 'non_technical_failure' };
  }
  if (policy === 'forbid') return { allowed: false, reason: 'fallback_forbidden_by_caller' };
  if (!connection) return { allowed: true, reason: 'integration_not_registered' };
  if (connection.fallback_enabled === false) {
    return { allowed: false, reason: 'fallback_disabled_for_connection' };
  }
  if (connection.fallback_strategy === 'none') {
    return { allowed: false, reason: 'fallback_strategy_none' };
  }
  if (
    connection.fallback_approval_status &&
    connection.fallback_approval_status !== 'approved'
  ) {
    return { allowed: false, reason: 'fallback_not_approved' };
  }
  const allowedCats = connection.fallback_allowed_categories?.length
    ? connection.fallback_allowed_categories
    : DEFAULT_ALLOWED;
  if (!allowedCats.includes(cat)) {
    return { allowed: false, reason: `category_not_permitted:${cat}` };
  }
  return { allowed: true, reason: cat };
}

function providerReferenceOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const candidate = d.providerReference ?? d.reference ?? d.screeningId ??
    d.searchId ?? d.envelopeId ?? d.transactionId ?? d.acknowledgementReference ??
    d.reportId ?? d.publicationId;
  return candidate === undefined || candidate === null ? null : String(candidate);
}

/** THE entry point. Never throws — governance failures come back as results. */
export async function invokeIntegration<T = unknown>(
  admin: any,
  request: IntegrationRequest,
): Promise<IntegrationResult<T>> {
  const correlationId = request.correlationId ?? newCorrelationId();
  const fingerprint = await idempotencyFingerprint(request.idempotencyKey);
  const respondedAt = () => new Date().toISOString();

  const connection = await resolveConnection(admin, request.integrationKey);
  const adapter = connection
    ? getAdapter(connection.adapter_key ?? request.integrationKey)
    : null;

  const base = {
    integrationKey: request.integrationKey,
    connectionId: connection?.id ?? null,
    adapterKey: connection?.adapter_key ?? null,
    providerVerified: Boolean(connection?.provider_verified),
    correlationId,
    data: null as T | null,
    providerStatus: null as number | null,
    providerMessage: null as string | null,
    providerReference: null as string | null,
    integrationLogId: null as string | null,
    retryQueueId: null as string | null,
  };


  /** Governance-only outcome (no provider call was made). */
  const governed = async (
    category: ErrorCategory,
    message: string,
  ): Promise<IntegrationResult<T>> => {
    const decision = decideFallback(connection, category, request.fallbackPolicy);
    const mode: ExecutionMode = decision.allowed ? 'fallback' : 'blocked';
    const logId = await logIntegration(admin, {
      direction: 'outbound',
      integrationKey: request.integrationKey,
      endpoint: null,
      method: null,
      status: 'failure',
      operation: request.operation,
      executionMode: mode,
      fallbackReason: decision.allowed ? decision.reason : `blocked:${decision.reason}`,
      error: message,
      correlationId,
      environment: connection?.environment ?? null,
      errorCategory: category,
      sourceModule: request.sourceModule,
      businessEvent: request.businessEvent,
      entityType: request.sourceEntityType ?? null,
      entityId: null,
      actorId: request.actorId ?? null,
      idempotencyFingerprint: fingerprint,
      metadata: {
        request_shape: redactPayload(request.payload ?? {}),
        redacted_fields: redactedKeys(request.payload ?? {}),
        source_entity_id: request.sourceEntityId ?? null,
        ...(request.metadata ?? {}),
      },
    });
    await recordGovernanceEvent(admin, request, {
      mode,
      reason: decision.allowed ? decision.reason : decision.reason,
      implementation: connection?.fallback_implementation_key ?? null,
      category,
      message,
      correlationId,
      fingerprint,
      logId,
    });
    const retryQueueId = await maybeEnqueueRetry(admin, request, {
      category,
      message,
      correlationId,
      fingerprint,
      logId,
      providerStatus: null,
    });
    return {
      ...base,
      success: false,
      executionMode: mode,
      fallbackUsed: decision.allowed,
      fallbackReason: decision.reason,
      fallbackImplementation: decision.allowed
        ? connection?.fallback_implementation_key ?? 'internal_default'
        : null,
      retryable: category === 'network' || category === 'timeout' ||
        category === 'server' || category === 'rate_limit',
      errorCategory: category,
      errorMessage: message,
      integrationLogId: logId,
      retryQueueId,
      respondedAt: respondedAt(),
    };
  };


  if (!connection) {
    return await governed(
      'not_configured',
      `Integration "${request.integrationKey}" is not registered.`,
    );
  }
  if (!adapter) {
    return await governed(
      'not_configured',
      `No adapter implemented for "${connection.adapter_key ?? request.integrationKey}".`,
    );
  }
  if (!adapter.operations.includes(request.operation)) {
    return {
      ...(await governed(
        'validation',
        `Operation "${request.operation}" is not supported by adapter "${adapter.key}".`,
      )),
    };
  }
  if (
    request.requiredCapability &&
    !adapter.operations.includes(request.requiredCapability)
  ) {
    return {
      ...(await governed(
        'validation',
        `Adapter "${adapter.key}" does not provide capability "${request.requiredCapability}".`,
      )),
    };
  }

  const result = await executeConnector<T>({
    admin,
    adapter,
    connection,
    operation: request.operation,
    input: request.payload ?? {},
    idempotencyFingerprint: fingerprint,
    timeoutOverrideMs: request.timeoutOverrideMs ?? null,
    context: {
      correlationId,
      sourceModule: request.sourceModule,
      businessEvent: request.businessEvent,
      actorId: request.actorId ?? null,
      entityType: request.sourceEntityType ?? null,
      entityId: null,
      idempotencyKey: request.idempotencyKey ?? null,
    },
  });

  if (result.ok) {
    const mode: ExecutionMode = connection.provider_verified ? 'real' : 'mock';
    // A successful real call ends any active fallback dependency.
    if (mode === 'real') await clearFallbackState(admin, connection);
    return {
      ...base,
      success: true,
      executionMode: mode,
      data: result.data,
      providerStatus: result.httpStatus,
      providerReference: providerReferenceOf(result.data),
      providerMessage: null,
      fallbackUsed: false,
      fallbackReason: null,
      fallbackImplementation: null,
      retryable: false,
      errorCategory: null,
      errorMessage: null,
      integrationLogId: result.integrationLogId ?? null,
      respondedAt: respondedAt(),
    };
  }

  const category = (result.errorCategory ?? 'unknown') as ErrorCategory;
  const decision = decideFallback(connection, category, request.fallbackPolicy);
  const mode: ExecutionMode = decision.allowed ? 'fallback' : 'blocked';

  // Label the already-written log row with the governed execution mode.
  if (result.integrationLogId) {
    await admin.from('integration_logs')
      .update({
        execution_mode: mode,
        fallback_reason: decision.allowed
          ? decision.reason
          : `blocked:${decision.reason}`,
      })
      .eq('id', result.integrationLogId);
  }

  await recordGovernanceEvent(admin, request, {
    mode,
    reason: decision.reason,
    implementation: connection.fallback_implementation_key ?? null,
    category,
    message: result.error ?? 'Provider call failed.',
    correlationId,
    fingerprint,
    logId: result.integrationLogId ?? null,
  });

  const retryQueueId = await maybeEnqueueRetry(admin, request, {
    category,
    message: result.error ?? 'Provider call failed.',
    correlationId,
    fingerprint,
    logId: result.integrationLogId ?? null,
    providerStatus: result.httpStatus ?? null,
  });

  return {
    ...base,
    success: false,
    executionMode: mode,
    providerStatus: result.httpStatus,
    providerMessage: result.error ?? null,
    fallbackUsed: decision.allowed,
    fallbackReason: decision.reason,
    fallbackImplementation: decision.allowed
      ? connection.fallback_implementation_key ?? 'internal_default'
      : null,
    retryable: category === 'network' || category === 'timeout' ||
      category === 'server' || category === 'rate_limit',
    errorCategory: category,
    errorMessage: result.error ?? null,
    integrationLogId: result.integrationLogId ?? null,
    retryQueueId,
    respondedAt: respondedAt(),
  };
}

/**
 * Durable retry enqueue. Only reached when the caller opted in with
 * `retryQueue: true`. The RPC itself refuses permanent business rejections, so
 * an adverse provider decision can never be silently re-attempted.
 * Only the REDACTED request shape is stored — never a raw payload.
 */
async function maybeEnqueueRetry(
  admin: any,
  request: IntegrationRequest,
  info: {
    category: ErrorCategory;
    message: string;
    correlationId: string;
    fingerprint: string | null;
    logId: string | null;
    providerStatus: number | null;
  },
): Promise<string | null> {
  if (!request.retryQueue) return null;
  if (BUSINESS_DECISION_CATEGORIES.has(info.category)) return null;
  try {
    const { data, error } = await admin.rpc('integration_retry_enqueue', {
      _integration_key: request.integrationKey,
      _operation: request.operation,
      _source_module: request.sourceModule,
      _business_event: request.businessEvent,
      _payload: redactPayload(request.payload ?? {}),
      _redacted_fields: redactedKeys(request.payload ?? {}),
      _source_entity_type: request.sourceEntityType ?? null,
      _source_entity_id: request.sourceEntityId ?? null,
      _actor_id: request.actorId ?? null,
      _correlation_id: info.correlationId,
      _idempotency_key: request.idempotencyKey ?? null,
      _idempotency_fingerprint: info.fingerprint,
      _error_category: info.category,
      _error: info.message,
      _provider_status: info.providerStatus,
      _integration_log_id: info.logId,
      _required_capability: request.requiredCapability ?? null,
      _fallback_policy: request.fallbackPolicy ?? 'auto',
      _timeout_override_ms: request.timeoutOverrideMs ?? null,
      _metadata: request.metadata ?? {},
    });
    if (error) {
      console.warn('[integration-manager] retry enqueue failed:', error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (error) {
    console.warn('[integration-manager] retry enqueue threw:', error);
    return null;
  }
}


async function recordGovernanceEvent(
  admin: any,
  request: IntegrationRequest,
  info: {
    mode: ExecutionMode;
    reason: string;
    implementation: string | null;
    category: ErrorCategory;
    message: string;
    correlationId: string;
    fingerprint: string | null;
    logId: string | null;
  },
): Promise<void> {
  try {
    await admin.rpc('integration_record_fallback', {
      _integration_key: request.integrationKey,
      _operation: request.operation,
      _source_module: request.sourceModule,
      _business_event: request.businessEvent,
      _fallback_reason: info.reason,
      _execution_mode: info.mode,
      _fallback_implementation: info.mode === 'fallback' ? info.implementation : null,
      _original_error_category: info.category,
      _original_error: info.message,
      _source_entity_type: request.sourceEntityType ?? null,
      _source_entity_id: request.sourceEntityId ?? null,
      _actor_id: request.actorId ?? null,
      _correlation_id: info.correlationId,
      _idempotency_fingerprint: info.fingerprint,
      _integration_log_id: info.logId,
    });
  } catch (error) {
    console.warn('[integration-manager] governance event failed:', error);
  }
}

async function clearFallbackState(
  admin: any,
  connection: ResolvedConnection,
): Promise<void> {
  try {
    if (connection.fallback_recovery_policy === 'manual') return;
    await admin.from('integration_connections')
      .update({ fallback_since: null, last_recovery_at: new Date().toISOString() })
      .eq('id', connection.id)
      .not('fallback_since', 'is', null);
    await admin.from('integration_fallback_events')
      .update({ recovery_state: 'recovered', recovered_at: new Date().toISOString() })
      .eq('integration_key', connection.integration_key)
      .eq('recovery_state', 'unresolved');
  } catch (error) {
    console.warn('[integration-manager] recovery update failed:', error);
  }
}
