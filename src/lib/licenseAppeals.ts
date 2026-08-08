/**
 * Shared constants and helpers for the Licensing Appeals module.
 *
 * Mirrors the Fit & Proper appeals vocabulary but is scoped to licensing
 * decisions (post-refusal appeals against a rejected application).
 */

export const APPEAL_WINDOW_DAYS = 30;

export type LicenseAppealStatus =
  | 'submitted'
  | 'under_review'
  | 'panel_review'
  | 'decided'
  | 'withdrawn'
  | 'rejected_out_of_time';

export type LicenseAppealDecision =
  | 'upheld'
  | 'partially_upheld'
  | 'dismissed'
  | 'remitted'
  | 'overturned_to_approved';

export const APPEAL_STATUS_META: Record<string, { label: string; className: string }> = {
  submitted: { label: 'Pending decision', className: 'bg-amber-100 text-amber-800 border border-amber-200' },
  under_review: { label: 'Pending decision', className: 'bg-amber-100 text-amber-800 border border-amber-200' },
  panel_review: { label: 'Pending decision', className: 'bg-amber-100 text-amber-800 border border-amber-200' },
  decided: { label: 'Decided', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
  rejected_out_of_time: { label: 'Rejected (out of time)', className: 'bg-rose-100 text-rose-800 border border-rose-200' },
};

export const APPEAL_DECISION_META: Record<string, { label: string; className: string }> = {
  upheld: { label: 'Appeal considered', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  partially_upheld: { label: 'Partially considered', className: 'bg-amber-100 text-amber-800 border border-amber-200' },
  dismissed: { label: 'Appeal declined', className: 'bg-slate-100 text-slate-700 border border-slate-200' },
  remitted: { label: 'Remitted for reconsideration', className: 'bg-blue-100 text-blue-800 border border-blue-200' },
  overturned_to_approved: { label: 'Refusal overturned', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
};

export const APPEAL_DECISION_OPTIONS: Array<{ value: LicenseAppealDecision; label: string }> = [
  { value: 'upheld', label: 'Appeal considered' },
  { value: 'dismissed', label: 'Appeal declined' },
];


export const OPEN_APPEAL_STATUSES: LicenseAppealStatus[] = ['submitted', 'under_review', 'panel_review'];

export function appealStatusMeta(status: string | null | undefined) {
  return (
    APPEAL_STATUS_META[(status ?? '').toLowerCase()] ?? {
      label: status ?? '—',
      className: 'bg-slate-100 text-slate-600 border border-slate-200',
    }
  );
}

export function appealDecisionMeta(decision: string | null | undefined) {
  if (!decision) return null;
  return (
    APPEAL_DECISION_META[decision.toLowerCase()] ?? {
      label: decision,
      className: 'bg-slate-100 text-slate-700 border border-slate-200',
    }
  );
}

export function formatAppealDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatAppealDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Deadline for lodging an appeal against a refusal. */
export function appealDeadlineFor(rejectedAt: string | null | undefined): Date | null {
  if (!rejectedAt) return null;
  const d = new Date(rejectedAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function daysRemaining(deadline: Date | string | null | undefined): number | null {
  if (!deadline) return null;
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function isAppealOpen(status: string | null | undefined): boolean {
  return OPEN_APPEAL_STATUSES.includes((status ?? '') as LicenseAppealStatus);
}

/** Hearing formats supported by an appeal panel. */
export const HEARING_FORMAT_OPTIONS: Array<{ value: 'written' | 'oral' | 'virtual' | 'in_person'; label: string }> = [
  { value: 'written', label: 'Written representations' },
  { value: 'oral', label: 'Oral hearing' },
  { value: 'virtual', label: 'Virtual hearing' },
  { value: 'in_person', label: 'In-person hearing' },
];

export const DECISION_RULE_OPTIONS: Array<{ value: 'majority' | 'unanimous' | 'chair_casting'; label: string }> = [
  { value: 'majority', label: 'Simple majority' },
  { value: 'unanimous', label: 'Unanimous' },
  { value: 'chair_casting', label: 'Majority with chair casting vote' },
];

export const PANEL_MEMBER_ROLE_OPTIONS: Array<{ value: 'chair' | 'member' | 'legal_adviser' | 'observer'; label: string }> = [
  { value: 'chair', label: 'Chair' },
  { value: 'member', label: 'Member' },
  { value: 'legal_adviser', label: 'Legal adviser' },
  { value: 'observer', label: 'Observer (non-voting)' },
];

export function hearingFormatLabel(value: string | null | undefined): string {
  return HEARING_FORMAT_OPTIONS.find((o) => o.value === value)?.label ?? (value || '—');
}

export function decisionRuleLabel(value: string | null | undefined): string {
  return DECISION_RULE_OPTIONS.find((o) => o.value === value)?.label ?? (value || '—');
}

export function panelMemberRoleLabel(value: string | null | undefined): string {
  return PANEL_MEMBER_ROLE_OPTIONS.find((o) => o.value === value)?.label ?? (value || '—');
}

/** True when the panel is constituted and in force today. */
export function isPanelInForce(p: { is_active: boolean; effective_from?: string | null; effective_to?: string | null }): boolean {
  if (!p.is_active) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (p.effective_from && p.effective_from > today) return false;
  if (p.effective_to && p.effective_to < today) return false;
  return true;
}
