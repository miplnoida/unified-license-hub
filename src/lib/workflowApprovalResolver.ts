import { supabase } from '@/integrations/supabase/client';

/**
 * Workflow approval resolution — SERVER AUTHORITY ONLY (GAP-F5-07 / 07a).
 *
 * The database function `application_workflow_view(_application_id)` is the
 * single source of truth for:
 *   - the global review toggle
 *   - workflow matching (services.workflow_id precedence, taxonomy cascade)
 *   - workflow active state and step count
 *   - canonical open statuses
 *
 * This module deliberately contains NO regulatory algorithm. It does not read
 * `services`, `approval_workflows`, `approval_steps`, `workflow_instances`,
 * `categories`, `sectors` or `site_settings`, and it never infers a workflow
 * from regulator, sector, sub-sector, category, license_type, entity_type or an
 * attached `applications.workflow_id`.
 *
 * Fail-closed rule: if the RPC errors, is forbidden, returns no row, returns
 * `found=false`, or returns malformed/incomplete state, the result is disabled.
 * An application with no id (unsaved draft) is `unresolved_unsaved` — no
 * regulatory decision is made in the browser.
 */

export interface WorkflowApprovalContext {
  /** application row (only the persisted id is authoritative here) */
  application: {
    id?: string;
    license_type?: string | null;
    regulator_id?: string | null;
    workflow_id?: string | null;
    data?: Record<string, any> | null;
  };
}

export type WorkflowApprovalReason =
  | 'attached_active_workflow'
  | 'global_disabled'
  | 'no_matched_workflow'
  | 'workflow_inactive'
  | 'no_steps'
  | 'enabled'
  /** application not persisted yet — no server decision is possible */
  | 'unresolved_unsaved'
  /** server resolver errored, was forbidden, or returned no/malformed state */
  | 'server_unresolved';

export interface WorkflowApprovalResolution {
  /** Final ON/OFF — feed this directly to <WorkflowPanel workflowEnabled={...}/> */
  enabled: boolean;
  /** Why it was ON/OFF — server-provided, or a fail-closed local reason */
  reason: WorkflowApprovalReason;
  /** Global toggle value as reported by the server */
  globalReviewEnabled: boolean;
  /** Workflow resolved by the server (never by the browser) */
  matchedWorkflow: { id: string; is_active: boolean; license_type: string } | null;
  /** Step count for the server-resolved workflow */
  stepCount: number;
  /** True when the state could not be established — UI should show an error/safe state */
  unresolved?: boolean;
}

const SERVER_REASONS: readonly WorkflowApprovalReason[] = [
  'attached_active_workflow',
  'global_disabled',
  'no_matched_workflow',
  'workflow_inactive',
  'no_steps',
  'enabled',
];

function failClosed(reason: 'unresolved_unsaved' | 'server_unresolved'): WorkflowApprovalResolution {
  return {
    enabled: false,
    reason,
    globalReviewEnabled: false,
    matchedWorkflow: null,
    stepCount: 0,
    unresolved: true,
  };
}

/**
 * Main entry point — resolve the effective workflow-approval ON/OFF state for a
 * persisted application using the server resolver only.
 */
export async function resolveWorkflowApproval(
  ctx: WorkflowApprovalContext,
): Promise<WorkflowApprovalResolution> {
  const applicationId = ctx?.application?.id;
  if (!applicationId) {
    // Unsaved application: no regulatory decision is made client-side.
    return failClosed('unresolved_unsaved');
  }

  let response: { data: unknown; error: unknown } | null = null;
  try {
    response = await (supabase.rpc as any)('application_workflow_view', {
      _application_id: applicationId,
    });
  } catch {
    return failClosed('server_unresolved');
  }

  if (!response || response.error) return failClosed('server_unresolved');

  const view = (Array.isArray(response.data) ? response.data[0] : response.data) as any;
  if (!view || typeof view !== 'object') return failClosed('server_unresolved');
  if (view.found !== true) return failClosed('server_unresolved');

  // Malformed / incomplete server state must fail closed rather than be guessed at.
  if (typeof view.enabled !== 'boolean') return failClosed('server_unresolved');
  if (!SERVER_REASONS.includes(view.reason)) return failClosed('server_unresolved');

  return {
    enabled: view.enabled === true,
    reason: view.reason as WorkflowApprovalReason,
    globalReviewEnabled: view.global_review_enabled !== false,
    matchedWorkflow: view.workflow_id
      ? {
          id: view.workflow_id as string,
          is_active: view.workflow_is_active === true,
          license_type: (view.workflow_name as string) ?? '',
        }
      : null,
    stepCount: Number(view.step_count ?? 0),
  };
}
