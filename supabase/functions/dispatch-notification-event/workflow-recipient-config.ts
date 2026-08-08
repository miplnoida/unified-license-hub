export type WorkflowRecipientStep = {
  approver_type?: string | null;
  approver_config?: Record<string, unknown> | null;
  approver_role?: string | null;
  approver_role_id?: string | null;
};

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function specificApproverUserIds(step: WorkflowRecipientStep): string[] {
  if (step.approver_type !== "specific_users") return [];
  return stringIds(step.approver_config?.user_ids);
}

export function dynamicApproverRoleIds(step: WorkflowRecipientStep): string[] {
  if (step.approver_type === "specific_users") return [];
  const configured = stringIds(step.approver_config?.role_ids);
  if (step.approver_role_id && !configured.includes(step.approver_role_id)) {
    configured.push(step.approver_role_id);
  }
  return configured;
}

export function hasExplicitSpecificApprovers(step: WorkflowRecipientStep | null): boolean {
  return step !== null && specificApproverUserIds(step).length > 0;
}