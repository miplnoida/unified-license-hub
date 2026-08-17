/**
 * Shared advisory AI layer for supervisory modules.
 *
 * Contract across every module (prudential, examination, enforcement,
 * complaints/conduct, cross-module intelligence, executive workbenches):
 *
 *   - authoritative data and deterministic rules calculate
 *   - this layer asks the AI to INTERPRET / SUMMARISE / DRAFT those facts
 *   - humans review and decide through the existing workflow
 *
 * Nothing here writes to a supervisory table, changes a status, creates an
 * action, or satisfies a control. AI output is advisory text only.
 */

export type AdvisoryModule =
  | 'examination'
  | 'enforcement'
  | 'complaints'
  | 'conduct'
  | 'cross_module'
  | 'executive';

export type SupervisoryAnalysisType =
  // Examination
  | 'examination_brief'
  | 'scope_suggestions'
  | 'data_request_suggestions'
  | 'workpaper_summary'
  | 'finding_draft'
  | 'finding_consistency'
  | 'report_draft'
  | 'management_response_review'
  // Enforcement
  | 'case_chronology'
  | 'evidence_assessment'
  | 'precedent_comparison'
  | 'enforcement_draft'
  | 'sanction_factors'
  // Complaints / conduct
  | 'complaint_classification'
  | 'complaint_summary'
  | 'similar_complaints'
  | 'conduct_recurrence'
  | 'investigation_assistance'
  | 'resolution_draft'
  | 'qa_assistance'
  // Cross-module intelligence
  | 'entity_supervisory_brief'
  | 'cross_module_patterns'
  | 'related_events'
  | 'supervisory_query'
  // Executive workbench
  | 'executive_briefing'
  | 'what_changed'
  | 'suggested_priorities'
  | 'meeting_brief';

export interface AdvisoryObservation {
  text: string;
  evidence?: string[];
}

export interface AdvisoryEvidenceRef {
  label: string;
  kind?: string;
  id?: string | null;
  route?: string | null;
}

export interface AdvisoryDraftSection {
  heading: string;
  text: string;
}

export interface SupervisoryPayload {
  summary?: string;
  facts?: string[];
  interpretation?: string[];
  key_observations?: AdvisoryObservation[];
  risks?: AdvisoryObservation[];
  issues?: AdvisoryObservation[];
  gaps?: AdvisoryObservation[];
  chronology?: AdvisoryObservation[];
  business_impact?: AdvisoryObservation[];
  data_quality?: AdvisoryObservation[];
  suggested_focus_areas?: string[];
  draft_sections?: AdvisoryDraftSection[];
  evidence_refs?: AdvisoryEvidenceRef[];
  confidence?: 'high' | 'moderate' | 'limited';
  limitations?: string[];
  insufficient_evidence?: boolean;
}

export interface SupervisoryInsight {
  id: string | null;
  analysis_type: SupervisoryAnalysisType;
  payload: SupervisoryPayload;
  provider_state?: string | null;
  model?: string | null;
  period_key?: string | null;
  input_fingerprint?: string | null;
  generated_at?: string | null;
  feedback?: string | null;
}

export const ADVISORY_DISCLAIMER =
  'This analysis supports supervisory review. It does not change official findings, workflow stages, risk ratings, enforcement decisions or case outcomes.';

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'Evidence confidence: High',
  moderate: 'Evidence confidence: Moderate',
  limited: 'Evidence confidence: Limited',
};

/** Sections rendered as observation lists, in display order. */
export const SUPERVISORY_SECTIONS: Array<{ key: keyof SupervisoryPayload; label: string }> = [
  { key: 'chronology', label: 'Chronology' },
  { key: 'key_observations', label: 'What the record shows' },
  { key: 'issues', label: 'Points needing attention' },
  { key: 'risks', label: 'Possible risks' },
  { key: 'business_impact', label: 'Business and supervisory implications' },
  { key: 'data_quality', label: 'Data quality and integrity of the figures' },
  { key: 'gaps', label: 'Gaps in the available evidence' },
];

/** Stable JSON — key order must not change the fingerprint. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * Fingerprint of the deterministic inputs behind an analysis. When the
 * platform data moves on, the fingerprint changes and the stored analysis is
 * flagged as possibly outdated instead of being presented as current.
 */
export function fingerprintFacts(facts: unknown): string {
  const text = stableStringify(facts);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export function hasSupervisoryContent(payload?: SupervisoryPayload | null): boolean {
  if (!payload) return false;
  if (payload.summary && payload.summary.trim().length > 0) return true;
  if (payload.facts?.length || payload.interpretation?.length) return true;
  if (payload.suggested_focus_areas?.length || payload.draft_sections?.length) return true;
  return SUPERVISORY_SECTIONS.some((s) => (payload[s.key] as AdvisoryObservation[] | undefined)?.length);
}

/** Friendly message for a provider/AI failure state — never a raw code. */
export function advisoryStateMessage(state?: string | null): string | null {
  switch (state) {
    case 'NOT_CONFIGURED':
      return 'AI-assisted analysis is not configured for this environment. Everything else on this page is unaffected.';
    case 'RATE_LIMITED':
      return 'The AI service is busy right now. Please try again in a moment — the case data below is unaffected.';
    case 'INSUFFICIENT_DATA':
      return 'Available evidence is insufficient for a reliable conclusion.';
    case 'PROVIDER_FAILURE':
    case 'TRANSPORT_FAILURE':
      return 'AI analysis is temporarily unavailable. Everything else on this page is unaffected.';
    default:
      return null;
  }
}
