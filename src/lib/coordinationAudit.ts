import { logAudit } from '@/hooks/useAuditLog';
import { logComplianceAudit, type ComplianceAuditAction } from '@/lib/complianceAudit';

/**
 * Terse audit helper for Twin Peaks Coordination mutations.
 * Writes to both user-scoped audit_logs and compliance_audit_logs so the
 * cross-regulator paper trail is complete and defensible.
 */
export interface CoordinationAuditContext {
  caseId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  participantId?: string | null;
  regulatorId?: string | null;
  flagId?: string | null;
  escalationId?: string | null;
  extra?: Record<string, unknown>;
}

const MAP: Record<string, ComplianceAuditAction> = {
  create: 'CREATE',
  update: 'UPDATE',
  delete: 'DELETE',
  invite: 'CREATE',
  remove: 'DELETE',
  post: 'CREATE',
  clear: 'APPROVE',
  block: 'REJECT',
  raise: 'CREATE',
  resolve: 'APPROVE',
  close: 'UPDATE',
  link: 'UPDATE',
  unlink: 'UPDATE',
  withdraw: 'UPDATE',
  assign: 'UPDATE',
  escalate: 'WORKFLOW_TRANSITION',
  override: 'OVERRIDE',
};

function mapAction(action: string): ComplianceAuditAction {
  const verb = action.split('.').slice(-1)[0].split('_')[0];
  return MAP[verb] ?? 'UPDATE';
}

export async function logCoordinationAction(
  action: string,
  entityType: string,
  entityId: string | undefined | null,
  opts: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    context?: CoordinationAuditContext;
    justification?: string;
  } = {},
): Promise<void> {
  const metadata = {
    module: 'coordination',
    ...(opts.context ?? {}),
    ...(opts.context?.extra ?? {}),
  };
  delete (metadata as Record<string, unknown>).extra;

  await Promise.allSettled([
    logAudit({
      action,
      entityType,
      entityId: entityId ?? undefined,
      oldValue: opts.before ?? null,
      newValue: opts.after ?? null,
      metadata,
    }),
    logComplianceAudit({
      action_type: mapAction(action),
      object_type: entityType,
      object_id: entityId ?? null,
      before_value: opts.before ?? null,
      after_value: opts.after ?? null,
      justification: opts.justification ?? null,
      metadata,
    }),
  ]);
}
