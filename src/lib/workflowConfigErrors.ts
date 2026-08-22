/**
 * Shared error mapping for governed workflow-configuration RPCs.
 *
 * Every write to workflow configuration now goes through a SECURITY DEFINER
 * RPC (`approval_step_save`, `approval_action_notification_save`, ...). Those
 * RPCs raise `42501` when the caller lacks `workflow_management` rights and
 * `22023` for validation problems. Raw Postgres text ("permission denied for
 * table ...") must never reach the admin UI.
 */
export function workflowConfigErrorMessage(error: unknown, fallback: string): string {
  const err = error as { code?: string; message?: string } | null;
  const code = err?.code;
  const raw = (err?.message || '').trim();

  if (code === '42501' || /permission denied/i.test(raw)) {
    return 'You do not have permission to configure workflows. Ask an administrator to grant Workflow Management access.';
  }
  if (code === 'P0002' || code === '22023') {
    return raw || fallback;
  }
  return raw || fallback;
}

export function throwWorkflowConfigError(error: unknown, fallback: string): never {
  throw new Error(workflowConfigErrorMessage(error, fallback));
}
