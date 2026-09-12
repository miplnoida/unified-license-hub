/**
 * Presentation-only vocabulary for the AI Analyst Assessment panel.
 *
 * The assessment engine stores machine tokens (`high`, `financial`, `pass`,
 * `submitted_forms[0].response_data.amount_paid: 46`). Regulatory reviewers are
 * not engineers, so every token shown on screen is mapped to plain business
 * language here. Nothing in this file changes stored output.
 */
import { formatEvidence } from '@/lib/evidenceLabel';
import { humanizeTimestamps } from '@/lib/datetime';

/** One severity word per finding — no duplicated code + label. */
export function severityLabel(raw?: string | null): string {
  switch ((raw || '').toLowerCase()) {
    case 'critical':
      return 'Blocking';
    case 'high':
      return 'Needs attention';
    case 'medium':
      return 'Worth checking';
    case 'low':
      return 'Minor';
    default:
      return 'Observation';
  }
}

export function severityTone(raw?: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch ((raw || '').toLowerCase()) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'default';
    case 'medium':
      return 'outline';
    default:
      return 'secondary';
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  financial: 'Financial',
  financials: 'Financial',
  fees: 'Fees and payments',
  payment: 'Fees and payments',
  documents: 'Documents',
  document: 'Documents',
  documentation: 'Documents',
  governance: 'Governance',
  ownership: 'Ownership and control',
  fit_and_proper: 'Fit and proper',
  aml: 'AML / CFT',
  aml_cft: 'AML / CFT',
  compliance: 'Compliance',
  operations: 'Operations',
  operational: 'Operations',
  legal: 'Legal',
  risk: 'Risk',
  completeness: 'Application completeness',
  data_quality: 'Data quality',
};

/** Human wording for a finding/risk category token. */
export function categoryLabel(raw?: string | null): string {
  const key = (raw || '').toLowerCase().trim();
  if (!key) return '';
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Section outcome in reviewer language. */
export function sectionStatusLabel(raw?: string | null): string {
  switch ((raw || '').toLowerCase()) {
    case 'pass':
      return 'Satisfied';
    case 'concern':
      return 'Needs attention';
    case 'missing_info':
      return 'Information missing';
    case 'high_risk':
      return 'Significant concern';
    default:
      return 'Not assessed';
  }
}

/** "low" → "Low risk". */
export function riskLevelLabel(raw?: string | null): string {
  const key = (raw || '').toLowerCase().trim();
  if (!key) return '';
  const word = key.charAt(0).toUpperCase() + key.slice(1);
  return /risk$/i.test(key) ? word : `${word} risk`;
}

/** Confidence expressed in words, with the number kept in support. */
export function confidenceLabel(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  const pct = Math.round((value <= 1 ? value * 100 : value));
  const word = pct >= 85 ? 'High confidence' : pct >= 60 ? 'Moderate confidence' : 'Low confidence';
  return `${word} (${pct}%)`;
}

export interface EvidenceFact {
  /** Business-readable label for the underlying data point. */
  label: string;
  /** Value observed, when the evidence string carried one. */
  value?: string;
  /** Original raw evidence string, kept for the technical details toggle. */
  raw: string;
}

/**
 * Turns a raw evidence string into a labelled fact.
 *
 * Evidence commonly arrives as `path: value` (e.g.
 * `submitted_forms[0].response_data.amount_paid: 46`). The path is humanised
 * and the value kept alongside it; free-text evidence passes through as-is.
 */
export function toEvidenceFact(raw: unknown): EvidenceFact | null {
  const str = String(raw ?? '').trim();
  if (!str) return null;

  const m = str.match(/^([^\s:][^:]*?)\s*:\s*(.+)$/);
  if (m) {
    const pathPart = m[1].trim();
    const valuePart = m[2].trim();
    // Treat the left side as a data key/path whenever it has no spaces
    // (`amount_paid`, `submitted_forms[0].response_data.amount_paid`).
    if (/^[A-Za-z0-9_.[\]-]+$/.test(pathPart)) {
      return { label: humanKey(pathPart), value: humanizeTimestamps(valuePart), raw: str };
    }
  }
  if (/[.[]/.test(str) && !/\s/.test(str)) {
    return { label: humanKey(str), raw: str };
  }
  return { label: humanizeTimestamps(str), raw: str };
}

export function toEvidenceFacts(list: unknown): EvidenceFact[] {
  if (!Array.isArray(list)) return [];
  return list.map(toEvidenceFact).filter(Boolean) as EvidenceFact[];
}

/**
 * Business label for a data key or path. Dotted paths go through the shared
 * evidence formatter; a single snake_case key is simply title-cased.
 */
function humanKey(path: string): string {
  const stripped = stripIndexes(path);
  if (stripped.includes('.')) return formatEvidence(stripped);
  return categoryLabel(stripped) || stripped;
}

/** `submitted_forms[0].response_data.amount_paid` → `submitted_forms.response_data.amount_paid`. */
function stripIndexes(path: string): string {
  return path.replace(/\[\d+\]/g, '');
}
