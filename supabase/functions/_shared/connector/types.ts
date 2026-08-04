/**
 * ADM-INT-001 — Production connector framework: contracts.
 *
 * Every external system the platform talks to is reached through a
 * `ConnectorAdapter`. Adapters are independently replaceable: swapping a
 * mock provider for a live one is a base-URL + credential change in the
 * Integration Manager, never a code change in the calling module.
 */

export type ErrorCategory =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'rate_limit'
  | 'server'
  | 'mapping'
  | 'circuit_open'
  | 'not_configured'
  | 'unknown';

/** Resolved registry row for one integration (never contains secret material). */
export interface ResolvedConnection {
  id: string;
  integration_key: string;
  name: string;
  adapter_key: string;
  enabled: boolean;
  environment: 'sandbox' | 'production';
  protocol: string;
  auth_type: string;
  base_url: string | null;
  timeout_ms: number;
  retry_count: number;
  retry_backoff_ms: number;
  rate_limit_per_minute: number | null;
  requires_credentials: boolean;
  data_mapping: Record<string, unknown>;
  circuit_state: 'closed' | 'open' | 'half_open';
  circuit_opened_at: string | null;
  circuit_cooloff_seconds: number;
  /** Name of the backend secret holding the credential — not the value. */
  secret_ref: string | null;
  credential_version: number;
  /** True once the connection has been proven against the real provider. */
  provider_verified?: boolean;
  business_critical?: boolean;
  /** Fallback governance — owned by Integration Manager, never by modules. */
  fallback_enabled?: boolean;
  fallback_strategy?: 'internal_logic' | 'queue' | 'pending_state' | 'none';
  fallback_implementation_key?: string | null;
  fallback_allowed_categories?: string[];
  fallback_max_duration_hours?: number;
  fallback_alert_threshold?: number;
  fallback_recovery_policy?: 'automatic' | 'manual';
  fallback_approval_status?: 'approved' | 'pending' | 'rejected';
}


/** Credential material read from the backend secret store at call time. */
export interface ConnectorCredential {
  secretRef: string;
  value: string;
  version: number;
}

export interface ConnectorContext {
  connection: ResolvedConnection;
  credential: ConnectorCredential | null;
  correlationId: string;
  /** Business module that originated the call, e.g. `fit_and_proper`. */
  sourceModule: string;
  /** Business event, e.g. `fp.screening_requested`. */
  businessEvent: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Stable key that makes the call exactly-once for the business action. */
  idempotencyKey?: string | null;
}

export interface ConnectorRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  /** Path appended to the connection base URL. */
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface ConnectorResult<T = unknown> {
  ok: boolean;
  /** Adapter-normalised payload — never the raw provider shape. */
  data: T | null;
  httpStatus: number | null;
  latencyMs: number;
  attempts: number;
  correlationId: string;
  errorCategory: ErrorCategory | null;
  error: string | null;
  /** True when the connection is off/unconfigured and the caller must fall back. */
  fallback: boolean;
  raw?: unknown;
  /** Row id of the `integration_logs` entry written for this attempt. */
  integrationLogId?: string | null;
}


/**
 * One adapter per integration key. Each declares how to authenticate, how to
 * shape an operation into an HTTP request, and how to normalise the
 * provider's success and error payloads.
 */
export interface ConnectorAdapter<Ops extends string = string> {
  key: string;
  /** Operations this adapter supports (used by the tester + docs). */
  operations: readonly Ops[];
  /** Apply credentials to the outgoing request. */
  authenticate(
    req: ConnectorRequest,
    ctx: ConnectorContext,
  ): ConnectorRequest | Promise<ConnectorRequest>;
  /** Build the HTTP request for an operation + input payload. */
  buildRequest(
    operation: Ops,
    input: Record<string, unknown>,
    ctx: ConnectorContext,
  ): ConnectorRequest | Promise<ConnectorRequest>;
  /** Normalise a 2xx response body. */
  parseResponse(
    operation: Ops,
    status: number,
    body: unknown,
    ctx: ConnectorContext,
  ): unknown;
  /** Normalise a non-2xx response into a category + message. */
  parseError(
    status: number,
    body: unknown,
  ): { category: ErrorCategory; message: string };
  /** Read-only probe used by Test Connection. */
  healthRequest?(ctx: ConnectorContext): ConnectorRequest;
  /** Whether a failure of this status is worth retrying. */
  isRetryable?(status: number | null, category: ErrorCategory): boolean;
}

export function defaultRetryable(
  status: number | null,
  category: ErrorCategory,
): boolean {
  if (category === 'timeout' || category === 'network') return true;
  if (category === 'rate_limit') return true;
  if (status !== null && status >= 500) return true;
  return false;
}

export function categorise(status: number): ErrorCategory {
  if (status === 401) return 'auth';
  if (status === 403) return 'authorization';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 400 && status < 500) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}
