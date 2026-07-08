/**
 * Correlation ID helper.
 * Generated at user-action origin and propagated to Edge Functions + audit rows.
 */
export function newCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes/tests.
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const CORRELATION_HEADER = "x-correlation-id";
