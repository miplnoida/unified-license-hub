/**
 * Plain-language labels for the complaint case history.
 *
 * The complaint History tab merges three sources (workflow actions and
 * enforcement events from `get_complaint_tracking`, plus `audit_logs` rows for
 * the complaint). None of those are written for non-technical readers, so this
 * module turns action keys and payload fields into sentences a case officer can
 * read without knowing the schema.
 */

import { formatDateTime } from '@/lib/datetime';

/** Action keys → business sentences (complaint-specific, checked first). */
const COMPLAINT_ACTION_LABELS: Record<string, string> = {
  'complaint.created': 'Complaint received',
  'complaint.filed': 'Complaint received',
  'complaint_created': 'Complaint received',
  'complaint.intake': 'Complaint recorded at intake',
  'complaint.intake_decided': 'Intake assessment completed',
  'complaint.triage': 'Complaint triaged',
  'complaint.triaged': 'Complaint triaged',
  'complaint.severity_updated': 'Severity changed',
  'complaint.severity_override': 'Severity overridden by a supervisor',
  'complaint.assigned': 'Complaint assigned to an officer',
  'complaint.reassigned': 'Complaint reassigned',
  'complaint.status_changed': 'Case status changed',
  'complaint.escalated': 'Complaint escalated',
  'complaint.licensee_linked': 'Licensee linked to the complaint',
  'complaint.evidence_added': 'Evidence attached',
  'complaint.attachment_added': 'Attachment added',
  'complaint.note_added': 'Case note added',
  'complaint.rfi_raised': 'Information request sent',
  'complaint.rfi_responded': 'Response received to the information request',
  'complaint.rfi_reviewed': 'Information request response reviewed',
  'complaint.task_created': 'Investigation task created',
  'complaint.task_completed': 'Investigation task completed',
  'complaint.closure_recommended': 'Closure recommended',
  'complaint.closure_approved': 'Closure approved',
  'complaint.closure_rejected': 'Closure sent back for more work',
  'complaint.resolved': 'Complaint resolved',
  'complaint.closed': 'Complaint closed',
  'complaint.reopened': 'Complaint reopened',
  'complaint.acknowledgement_sent': 'Acknowledgement sent to the complainant',
  'complaint.duplicate_flagged': 'Possible duplicate flagged',
  RULE_OVERRIDE: 'Rule overridden with a written reason',
  OVERRIDE: 'Rule overridden with a written reason',
  WORKFLOW_TRANSITION: 'Moved to the next workflow step',
  CREATE: 'Record created',
  UPDATE: 'Details updated',
  DELETE: 'Record removed',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  EXPORT: 'Exported',
};

/** Turn any action key into a readable sentence. */
export function complaintActionLabel(action: string | null | undefined): string {
  const key = String(action ?? '').trim();
  if (!key) return 'Case activity';
  if (COMPLAINT_ACTION_LABELS[key]) return COMPLAINT_ACTION_LABELS[key];
  const lower = key.toLowerCase();
  if (COMPLAINT_ACTION_LABELS[lower]) return COMPLAINT_ACTION_LABELS[lower];
  const cleaned = lower
    .replace(/^complaint[._]/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Case activity';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Fields that are internal plumbing and should never be shown as changes. */
const HIDDEN_FIELDS = new Set([
  'id', 'complaint_id', 'entity_id', 'entity_type', 'user_id', 'actor_id',
  'created_at', 'updated_at', 'override_id', 'workflow_id', 'instance_id',
  'step_id', 'current_step_id', 'template_id', 'rule_id', 'metadata',
  'expected_updated_at', 'correlation_id', 'request_id', 'ip_address',
  'user_agent', 'source', 'screen', 'recommendation_source',
]);

export function isHiddenHistoryField(key: string): boolean {
  if (HIDDEN_FIELDS.has(key)) return true;
  return /(^|_)(id|ids|uuid|hash|token)$/.test(key);
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Case status',
  severity: 'Severity',
  previous_severity: 'Previous severity',
  new_severity: 'New severity',
  subject: 'Subject',
  description: 'Description',
  resolution: 'Resolution',
  resolution_notes: 'Resolution notes',
  investigation_notes: 'Investigation notes',
  findings: 'Findings',
  assigned_to: 'Assigned to',
  licensee_id: 'Linked licensee',
  complaint_type_id: 'Complaint type',
  due_at: 'Due',
  sla_status: 'Response deadline status',
  reason: 'Reason',
  comments: 'Comments',
  channel: 'Received via',
};

export function historyFieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const cleaned = key
    .replace(/_id$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function historyValueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    const readable = value.replace(/_/g, ' ');
    return readable.length > 160 ? `${readable.slice(0, 160)}…` : readable;
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return 'updated';
}

export interface HistoryFieldChange {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** Business-readable change list between two audit payloads. */
export function historyChanges(before: unknown, after: unknown): HistoryFieldChange[] {
  const b = (before && typeof before === 'object' && !Array.isArray(before) ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' && !Array.isArray(after) ? after : {}) as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const out: HistoryFieldChange[] = [];
  keys.forEach((k) => {
    if (isHiddenHistoryField(k)) return;
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) return;
    const hasBefore = Object.prototype.hasOwnProperty.call(b, k) && bv !== null && bv !== undefined && bv !== '';
    out.push({
      key: k,
      label: historyFieldLabel(k),
      before: hasBefore ? historyValueText(bv) : null,
      after: Object.prototype.hasOwnProperty.call(a, k) ? historyValueText(av) : null,
    });
  });
  return out;
}

/** Friendly day heading: Today / Yesterday / 11 August 2026. */
export function dayHeading(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown date';
  const today = new Date();
  const same = (x: Date, y: Date) =>
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  if (same(d, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export interface CaseHistoryEntry {
  id: string;
  when: string;
  title: string;
  actor: string | null;
  note: string | null;
  source: 'workflow' | 'enforcement' | 'audit';
  changes: HistoryFieldChange[];
  raw?: unknown;
}

/** Group entries into day buckets, newest day first. */
export function groupByDay(entries: CaseHistoryEntry[]): { day: string; entries: CaseHistoryEntry[] }[] {
  const sorted = [...entries].sort((a, b) => String(b.when).localeCompare(String(a.when)));
  const out: { day: string; entries: CaseHistoryEntry[] }[] = [];
  sorted.forEach((e) => {
    const day = dayHeading(e.when);
    const last = out[out.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else out.push({ day, entries: [e] });
  });
  return out;
}
