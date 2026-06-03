// Central registry for audit action labels and categories. Supports both
// the new dot-style names (`application.submitted`) and legacy underscore
// names (`application_submitted`, `payment_completed`, …) so historical
// rows render correctly.

export type AuditCategory =
  | 'application'
  | 'payment'
  | 'document'
  | 'workflow'
  | 'auth'
  | 'other';

interface AuditDescriptor {
  label: string;
  category: AuditCategory;
}

const RAW: Record<string, AuditDescriptor> = {
  // ---- Application lifecycle ----
  'application.created':              { label: 'Application draft created',     category: 'application' },
  'application.draft_updated':        { label: 'Draft updated',                 category: 'application' },
  'application.form_saved':           { label: 'Form saved',                    category: 'application' },
  'application.form_submitted':       { label: 'Form completed',                category: 'application' },
  'application.documents_step_completed': { label: 'Documents step completed', category: 'application' },
  'application.payment_step_started': { label: 'Payment step started',          category: 'application' },
  'application.submitted':            { label: 'Application submitted',         category: 'application' },
  'application.status_changed':       { label: 'Application status changed',    category: 'application' },
  'application.cancelled':            { label: 'Application cancelled',         category: 'application' },
  'application.approved':             { label: 'Application approved',          category: 'application' },
  'application.rejected':             { label: 'Application rejected',          category: 'application' },
  'application.resubmission_requested': { label: 'Resubmission requested',      category: 'application' },
  'application.resubmitted':          { label: 'Application resubmitted',       category: 'application' },
  'application.edit_requested':       { label: 'Edit requested',                category: 'application' },
  'application.edit_approved':        { label: 'Edit request approved',         category: 'application' },
  'application.edit_denied':          { label: 'Edit request denied',           category: 'application' },

  // ---- Payment lifecycle ----
  'payment.initiated':                { label: 'Payment initiated',             category: 'payment' },
  'payment.completed':                { label: 'Payment completed',             category: 'payment' },
  'payment.failed':                   { label: 'Payment failed',                category: 'payment' },
  'payment.receipt_generated':        { label: 'Payment receipt generated',     category: 'payment' },

  // ---- Document lifecycle ----
  'document.uploaded':                { label: 'Document uploaded',             category: 'document' },
  'document.deleted':                 { label: 'Document deleted',              category: 'document' },
  'document.replaced':                { label: 'Document replaced',             category: 'document' },
  'document.verified':                { label: 'Document verified',             category: 'document' },
  'document.rejected':                { label: 'Document rejected',             category: 'document' },

  // ---- Workflow ----
  'workflow.action_taken':            { label: 'Workflow action taken',         category: 'workflow' },
  'workflow.step_completed':          { label: 'Workflow step completed',       category: 'workflow' },
  'workflow.assigned':                { label: 'Workflow assigned',             category: 'workflow' },
  'workflow.reassigned':              { label: 'Workflow reassigned',           category: 'workflow' },

  // ---- Legacy aliases (kept so old rows stay readable) ----
  'application_created':              { label: 'Application draft created',     category: 'application' },
  'application_submitted':            { label: 'Application submitted',         category: 'application' },
  'application_cancelled':            { label: 'Application cancelled',         category: 'application' },
  'application_approved':             { label: 'Application approved',          category: 'application' },
  'application_rejected':             { label: 'Application rejected',          category: 'application' },
  'application_resubmitted':          { label: 'Application resubmitted',       category: 'application' },
  'application_forward':              { label: 'Application forwarded',         category: 'workflow' },
  'application_return':               { label: 'Application returned',          category: 'workflow' },
  'application_review':               { label: 'Application reviewed',          category: 'workflow' },
  'payment_completed':                { label: 'Payment completed',             category: 'payment' },
  'resubmission_requested':           { label: 'Resubmission requested',        category: 'application' },
  'edit_requested':                   { label: 'Edit requested',                category: 'application' },
  'edit_approved':                    { label: 'Edit request approved',         category: 'application' },
  'edit_denied':                      { label: 'Edit request denied',           category: 'application' },
};

export function getAuditDescriptor(action: string): AuditDescriptor {
  if (RAW[action]) return RAW[action];
  // Try cross-form lookup: dot ↔ underscore
  const alt = action.includes('.') ? action.replace(/\./g, '_') : action.replace(/_/g, '.');
  if (RAW[alt]) return RAW[alt];

  // Fallback: derive category from prefix
  const prefix = action.split(/[._]/)[0];
  const category: AuditCategory =
    prefix === 'application' ? 'application'
    : prefix === 'payment' ? 'payment'
    : prefix === 'document' ? 'document'
    : prefix === 'workflow' ? 'workflow'
    : prefix === 'auth' || prefix === 'user' || prefix === 'login' ? 'auth'
    : 'other';

  // Humanise: "application.form_saved" → "Application form saved"
  const label = action
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  return { label, category };
}

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: 'application', label: 'Applications' },
  { value: 'payment',     label: 'Payments' },
  { value: 'document',    label: 'Documents' },
  { value: 'workflow',    label: 'Workflow' },
  { value: 'auth',        label: 'Auth' },
  { value: 'other',       label: 'Other' },
];

export const CATEGORY_CLASSES: Record<AuditCategory, string> = {
  application: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
  payment:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
  document:    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900',
  workflow:    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  auth:        'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800',
  other:       'bg-muted text-muted-foreground border-border',
};
