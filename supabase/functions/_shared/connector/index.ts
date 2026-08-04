/**
 * ADM-INT-001 — adapter registry + call helper.
 *
 * Business modules call `callIntegration()`. They never build provider
 * requests, never read credentials, and never fetch() a provider. When the
 * connection is disabled/unconfigured or the provider is unreachable, the
 * result carries `fallback: true` so the caller runs its existing internal
 * behaviour unchanged.
 */
// deno-lint-ignore-file no-explicit-any
import { ConnectorAdapter, ConnectorResult } from './types.ts';
import { executeConnector, newCorrelationId, resolveConnection } from './runtime.ts';

import { governmentRegistryAdapter } from './adapters/government_registry.ts';
import { amlScreeningAdapter } from './adapters/aml_screening.ts';
import { sanctionsScreeningAdapter } from './adapters/sanctions_screening.ts';
import { creditBureauAdapter } from './adapters/credit_bureau.ts';
import { identityVerificationAdapter } from './adapters/identity_verification.ts';
import { paymentGatewayAdapter } from './adapters/payment_gateway.ts';
import { documentSigningAdapter } from './adapters/document_signing.ts';
import { emailDeliveryAdapter } from './adapters/email_delivery.ts';
import { smsProviderAdapter } from './adapters/sms_provider.ts';
import { notificationProviderAdapter } from './adapters/notification_provider.ts';
import { externalReportingAdapter } from './adapters/external_reporting.ts';
import { auditExportAdapter } from './adapters/audit_export.ts';
import { createGenericRestAdapter } from './adapters/generic_rest.ts';

/** adapter_key -> adapter. Each entry is independently replaceable. */
export const ADAPTERS: Record<string, ConnectorAdapter<any>> = {
  government_registry: governmentRegistryAdapter,
  aml_screening: amlScreeningAdapter,
  sanctions_screening: sanctionsScreeningAdapter,
  credit_bureau: creditBureauAdapter,
  identity_verification: identityVerificationAdapter,
  payment_gateway: paymentGatewayAdapter,
  document_signing: documentSigningAdapter,
  email_smtp: emailDeliveryAdapter,
  sms_provider: smsProviderAdapter,
  notification_provider: notificationProviderAdapter,
  external_reporting: externalReportingAdapter,
  audit_export: auditExportAdapter,
  // Registry rows without a bespoke provider contract.
  platform_api: createGenericRestAdapter('platform_api'),
  external_registry: createGenericRestAdapter('external_registry'),
  ai_gateway: createGenericRestAdapter('ai_gateway'),
};

export function getAdapter(adapterKey: string): ConnectorAdapter<any> | null {
  return ADAPTERS[adapterKey] ?? null;
}

export interface CallIntegrationOptions {
  admin: any;
  integrationKey: string;
  operation: string;
  input?: Record<string, unknown>;
  sourceModule: string;
  businessEvent: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
  correlationId?: string;
  dryRun?: boolean;
}

export async function callIntegration<T = unknown>(
  opts: CallIntegrationOptions,
): Promise<ConnectorResult<T>> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const notConfigured = (error: string): ConnectorResult<T> => ({
    ok: false,
    data: null,
    httpStatus: null,
    latencyMs: 0,
    attempts: 0,
    correlationId,
    errorCategory: 'not_configured',
    error,
    fallback: true,
  });

  const connection = await resolveConnection(opts.admin, opts.integrationKey);
  if (!connection) {
    return notConfigured(`Integration "${opts.integrationKey}" is not registered.`);
  }
  const adapter = getAdapter(connection.adapter_key ?? opts.integrationKey);
  if (!adapter) {
    return notConfigured(
      `No adapter is implemented for "${connection.adapter_key ?? opts.integrationKey}".`,
    );
  }
  if (!adapter.operations.includes(opts.operation)) {
    return {
      ...notConfigured(
        `Operation "${opts.operation}" is not supported by adapter "${adapter.key}".`,
      ),
      errorCategory: 'validation',
      fallback: false,
    };
  }

  return await executeConnector<T>({
    admin: opts.admin,
    adapter,
    connection,
    operation: opts.operation,
    input: opts.input,
    dryRun: opts.dryRun,
    context: {
      correlationId,
      sourceModule: opts.sourceModule,
      businessEvent: opts.businessEvent,
      actorId: opts.actorId ?? null,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
    },
  });
}

export { newCorrelationId, resolveConnection };
export type { ConnectorResult };
