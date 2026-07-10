// Utilities for turning raw audit rows into human-readable text.

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  EXPORT: 'Exported',
  RULE_OVERRIDE: 'Rule override',
  OVERRIDE: 'Rule override',
  WORKFLOW_TRANSITION: 'Workflow transitioned',
  'application.created': 'Application created',
  'application.draft_updated': 'Draft updated',
  'application.submitted': 'Application submitted',
  'application.resubmitted': 'Application resubmitted',
  'application.status_changed': 'Status changed',
  'application.assigned': 'Assigned',
  'application.sufficiency.evaluated': 'Sufficiency evaluated',
  'application.triage.updated': 'Triage updated',
  'application.rfi.raised': 'Information request raised',
  'application.rfi.responded': 'Information request answered',
  'application.approved': 'Application approved',
  'application.rejected': 'Application rejected',
  'application.withdrawn': 'Application withdrawn',
  'workflow.assigned': 'Assigned to reviewer',
  'workflow.action_taken': 'Reviewer action taken',
  'workflow.forwarded': 'Forwarded',
  'workflow.returned': 'Returned',
  'workflow.escalated': 'Escalated',
  'payment.recorded': 'Payment recorded',
  'payment.verified': 'Payment verified',
  'document.uploaded': 'Document uploaded',
  'document.replaced': 'Document replaced',
  'note.added': 'Note added',
  'remark.added': 'Remark added',
};

export function humanizeAction(action: string): string {
  if (!action) return 'Activity';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fall back to sentence-case of the dotted key
  return action
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  application_status: 'Status',
  assigned_to: 'Assigned to',
  assignee_id: 'Assigned to',
  reviewer_id: 'Reviewer',
  workflow_step_id: 'Workflow step',
  current_step_id: 'Workflow step',
  decision: 'Decision',
  outcome: 'Outcome',
  priority: 'Priority',
  severity: 'Severity',
  category: 'Category',
  sub_sector_id: 'Sub-sector',
  sector_id: 'Sector',
  applicant_id: 'Applicant',
  sufficiency_score: 'Sufficiency score',
  sufficiency_result: 'Sufficiency result',
  remarks: 'Remarks',
  comment: 'Comment',
  reason: 'Reason',
  amount: 'Amount',
  fee_amount: 'Fee amount',
  due_date: 'Due date',
  submitted_at: 'Submitted at',
  approved_at: 'Approved at',
  rejected_at: 'Rejected at',
};

export function labelField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/_id$/, '')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // ISO date detection
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString();
    }
    if (v.length > 140) return v.slice(0, 140) + '…';
    return v;
  }
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    return keys.length ? `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}}` : '—';
  }
  return String(v);
}

export interface Change {
  key: string;
  label: string;
  before: string;
  after: string;
}

/** Compute a list of changed top-level fields between two objects. */
export function computeChanges(before: unknown, after: unknown): Change[] {
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const skip = new Set(['updated_at', 'created_at', 'id', 'password', 'password_hash']);
  const changes: Change[] = [];
  keys.forEach((k) => {
    if (skip.has(k)) return;
    const bv = (b as any)[k];
    const av = (a as any)[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) return;
    changes.push({
      key: k,
      label: labelField(k),
      before: formatValue(bv),
      after: formatValue(av),
    });
  });
  return changes;
}

/** For rows where only a "new_value" scalar/message is set. */
export function summarizeSingle(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return formatValue(value);
  }
  if (isPlainObject(value)) {
    // Prefer common message fields
    const preferred = ['message', 'summary', 'note', 'remarks', 'reason', 'status'];
    for (const k of preferred) {
      if (typeof (value as any)[k] === 'string' && (value as any)[k].trim()) {
        return String((value as any)[k]);
      }
    }
  }
  return null;
}
