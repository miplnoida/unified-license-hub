/**
 * Shared helper for writing to `integration_logs`. Every edge function that
 * calls an external system (or receives an inbound integration webhook)
 * should record the attempt via this helper so we get a single, filterable
 * observability surface (see SCRIPT 5 / DEMO-DPA-009).
 *
 * Never throws — logging is best-effort and must not break the primary flow.
 */

type LogClient = {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

export interface IntegrationLogEntry {
  direction: 'inbound' | 'outbound';
  integrationKey: string;
  endpoint?: string | null;
  method?: string | null;
  status: 'success' | 'failure' | 'pending';
  httpStatus?: number | null;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  requestSummary?: string | null;
  responseSummary?: string | null;
  error?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
  /** Ties every call raised by one business action together (ADM-INT-001). */
  correlationId?: string | null;
  environment?: string | null;
  requestBytes?: number | null;
  responseBytes?: number | null;
  retryAttempt?: number | null;
  errorCategory?: string | null;
  sourceModule?: string | null;
  businessEvent?: string | null;
}

export async function logIntegration(
  client: LogClient,
  entry: IntegrationLogEntry,
): Promise<void> {
  try {
    const { error } = await client.from('integration_logs').insert({
      direction: entry.direction,
      integration_key: entry.integrationKey,
      endpoint: entry.endpoint ?? null,
      method: entry.method ?? null,
      status: entry.status,
      http_status: entry.httpStatus ?? null,
      actor_id: entry.actorId ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      request_summary: entry.requestSummary ?? null,
      response_summary: entry.responseSummary ?? null,
      error: entry.error ?? null,
      duration_ms: entry.durationMs ?? null,
      // First-class observability columns (also mirrored in metadata so
      // existing readers keep working).
      correlation_id: entry.correlationId ?? (entry.metadata?.correlation_id as string | undefined) ?? null,
      environment: entry.environment ?? (entry.metadata?.environment as string | undefined) ?? null,
      request_bytes: entry.requestBytes ?? (entry.metadata?.request_bytes as number | undefined) ?? null,
      response_bytes: entry.responseBytes ?? (entry.metadata?.response_bytes as number | undefined) ?? null,
      retry_attempt: entry.retryAttempt ?? (entry.metadata?.retry_attempt as number | undefined) ?? 0,
      error_category: entry.errorCategory ?? (entry.metadata?.error_category as string | undefined) ?? null,
      source_module: entry.sourceModule ?? (entry.metadata?.source_module as string | undefined) ?? null,
      business_event: entry.businessEvent ?? (entry.metadata?.business_event as string | undefined) ?? null,
      metadata: {
        ...(entry.metadata ?? {}),
        logged_at: new Date().toISOString(),
      },
    });
    if (error) console.warn('[integration-log] insert failed:', error);
  } catch (error) {
    console.warn('[integration-log] insert failed:', error);
  }
}
