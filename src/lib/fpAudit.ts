import { logAudit } from '@/hooks/useAuditLog';
import { logComplianceAudit, type ComplianceAuditAction } from '@/lib/complianceAudit';

/**
 * Terse audit helper for Fit & Proper mutations.
 * Writes both the user-scoped audit log (via log_self_audit RPC) and
 * the compliance audit log so regulator exports carry the full picture.
 *
 * Every call is fire-and-forget — logging failures never block the UI.
 */
export interface FpAuditContext {
  individualId?: string | null;
  assessmentId?: string | null;
  committeeId?: string | null;
  determinationId?: string | null;
  conditionId?: string | null;
  appealId?: string | null;
  screeningRunId?: string | null;
  findingId?: string | null;
  regulatorId?: string | null;
  extra?: Record<string, unknown>;
}

const COMPLIANCE_ACTION_MAP: Record<string, ComplianceAuditAction> = {
  create: 'CREATE',
  update: 'UPDATE',
  delete: 'DELETE',
  approve: 'APPROVE',
  reject: 'REJECT',
  override: 'OVERRIDE',
  transition: 'WORKFLOW_TRANSITION',
};

function mapComplianceAction(action: string): ComplianceAuditAction {
  const [verb] = action.split('.').slice(-1)[0].split('_');
  return COMPLIANCE_ACTION_MAP[verb] ?? 'UPDATE';
}

export type FpAppealAction =
  | 'fp.appeal.filed'
  | 'fp.appeal.committee_assigned'
  | 'fp.appeal.review_started'
  | 'fp.appeal.decided'
  | 'fp.appeal.withdrawn';

/** Shared helper so appeal-handling screens can't drift on action names/payload shape. */
export async function logFpAppealAction(
  action: FpAppealAction,
  appealId: string,
  opts: {
    individualId?: string | null;
    determinationId?: string | null;
    committeeId?: string | null;
    after?: Record<string, unknown> | null;
    justification?: string;
  } = {},
): Promise<void> {
  return logFpAction(action, 'fp_appeal', appealId, {
    after: opts.after ?? null,
    context: {
      individualId: opts.individualId,
      appealId,
      determinationId: opts.determinationId,
      committeeId: opts.committeeId,
    },
    justification: opts.justification,
  });
}

export async function logFpAction(
  action: string,
  entityType: string,
  entityId: string | undefined | null,
  opts: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    context?: FpAuditContext;
    justification?: string;
  } = {},
): Promise<void> {
  const metadata = {
    module: 'fit_and_proper',
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
      action_type: mapComplianceAction(action),
      object_type: entityType,
      object_id: entityId ?? null,
      before_value: opts.before ?? null,
      after_value: opts.after ?? null,
      justification: opts.justification ?? null,
      metadata,
    }),
  ]);
}
