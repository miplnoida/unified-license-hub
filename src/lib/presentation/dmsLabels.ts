/**
 * Business-language presentation for Document Management codes.
 *
 * Canonical codes stay in the database. Nothing here derives or changes a
 * business value — this module only decides how a stored code is SPOKEN to a
 * user, so no screen ever renders a raw enum, a bucket path or a record id.
 */
import { humanize, type StatusTone } from '@/lib/presentation/statusLabels';

export interface DmsPresented {
  label: string;
  tone: StatusTone;
  description?: string;
}

const CONFIDENTIALITY: Record<string, DmsPresented> = {
  public: { label: 'Public', tone: 'positive', description: 'May be shown on public registers once published.' },
  entity: { label: 'Entity only', tone: 'info', description: 'Visible to the regulator and the owning regulated entity.' },
  regulator_internal: { label: 'Regulator internal', tone: 'progress', description: 'Visible to regulatory staff only.' },
  restricted: { label: 'Restricted', tone: 'warning', description: 'Limited to staff with an explicit need to know.' },
  confidential: { label: 'Confidential', tone: 'critical', description: 'Highly sensitive supervisory material.' },
  legal_privileged: { label: 'Legally privileged', tone: 'critical', description: 'Privileged legal material — handle under legal instruction.' },
};

const PUBLICATION: Record<string, DmsPresented> = {
  not_publishable: { label: 'Not publishable', tone: 'muted' },
  public_eligible: { label: 'Eligible for publication', tone: 'info', description: 'Eligible, but not published — remains non-public until publication is requested and approved.' },
  published: { label: 'Published', tone: 'positive' },
};

const DOCUMENT_STATUS: Record<string, DmsPresented> = {
  available: { label: 'Available', tone: 'positive' },
  archived: { label: 'Archived', tone: 'muted', description: 'Hidden from ordinary listings; retained for audit and history.' },
  superseded: { label: 'Superseded', tone: 'muted' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
  deleted: { label: 'Deleted', tone: 'muted', description: 'Removed from ordinary use; retained in the audit trail.' },
};

const VERIFICATION: Record<string, DmsPresented> = {
  pending: { label: 'Awaiting verification', tone: 'warning' },
  not_required: { label: 'Verification not required', tone: 'muted' },
  verified: { label: 'Verified', tone: 'positive' },
  rejected: { label: 'Verification rejected', tone: 'critical' },
};

const ACCEPTANCE: Record<string, DmsPresented> = {
  pending: { label: 'Awaiting acceptance', tone: 'warning' },
  not_required: { label: 'Acceptance not required', tone: 'muted' },
  accepted: { label: 'Accepted', tone: 'positive' },
  conditionally_accepted: { label: 'Accepted with conditions', tone: 'progress' },
  rejected: { label: 'Not accepted', tone: 'critical' },
};

const SCAN: Record<string, DmsPresented> = {
  clean: { label: 'Scanned — safe', tone: 'positive' },
  pending: { label: 'Security scan pending', tone: 'warning', description: 'The file cannot be verified or downloaded until the scan completes.' },
  scanning: { label: 'Security scan running', tone: 'warning' },
  infected: { label: 'Unsafe file', tone: 'critical', description: 'The security scan flagged this file. It must not be opened.' },
  failed: { label: 'Scan failed', tone: 'critical' },
  legacy_unverified: { label: 'Not scanned (legacy)', tone: 'warning' },
  unknown: { label: 'Scan state unknown', tone: 'warning' },
};

const LEGAL_HOLD: Record<string, DmsPresented> = {
  none: { label: 'No legal hold', tone: 'muted' },
  on_hold: { label: 'Legal hold', tone: 'critical', description: 'This document is preserved under legal hold — disposal is blocked.' },
  released: { label: 'Hold released', tone: 'muted' },
};

/** Canonical context types a document can be linked to. */
export const DMS_CONTEXT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'entity', label: 'Regulated entity' },
  { value: 'application', label: 'Licensing application' },
  { value: 'license', label: 'Licence' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'return', label: 'Regulatory return' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'fit_and_proper', label: 'Fit and proper assessment' },
  { value: 'person', label: 'Person' },
  { value: 'inspection', label: 'Inspection / examination' },
];

const CONTEXT_LABEL = new Map(DMS_CONTEXT_TYPES.map((c) => [c.value, c.label]));

function present(map: Record<string, DmsPresented>, code: string | null | undefined, fallbackTone: StatusTone = 'neutral'): DmsPresented | null {
  if (!code) return null;
  return map[code] ?? { label: humanize(code), tone: fallbackTone };
}

export const presentConfidentiality = (c?: string | null) => present(CONFIDENTIALITY, c, 'info');
export const presentPublication = (c?: string | null) => present(PUBLICATION, c, 'muted');
export const presentDocumentStatus = (c?: string | null) => present(DOCUMENT_STATUS, c, 'neutral');
export const presentVerification = (c?: string | null) => present(VERIFICATION, c, 'neutral');
export const presentAcceptance = (c?: string | null) => present(ACCEPTANCE, c, 'neutral');
export const presentScan = (c?: string | null) => present(SCAN, c ?? 'unknown', 'warning')!;
export const presentLegalHold = (c?: string | null) => present(LEGAL_HOLD, c ?? 'none', 'neutral')!;

export function presentContextType(type?: string | null): string {
  if (!type) return 'Not linked';
  return CONTEXT_LABEL.get(type) ?? humanize(type);
}

export const CONFIDENTIALITY_OPTIONS = Object.entries(CONFIDENTIALITY).map(([value, p]) => ({ value, label: p.label }));
export const PUBLICATION_OPTIONS = Object.entries(PUBLICATION).map(([value, p]) => ({ value, label: p.label }));
export const DOCUMENT_STATUS_OPTIONS = Object.entries(DOCUMENT_STATUS).map(([value, p]) => ({ value, label: p.label }));

export function formatDocumentSize(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Whether an action the server would refuse should be blocked in the UI. */
export function isDisposalBlocked(legalHoldStatus?: string | null): boolean {
  return legalHoldStatus === 'on_hold';
}

export function isFileSafe(scanStatus?: string | null): boolean {
  return scanStatus === 'clean';
}
