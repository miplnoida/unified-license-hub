/**
 * Supervisory AI Reports hub — normalisation layer.
 *
 * This module contains NO AI generation and NO regulatory logic. It only
 * normalises AI analyses that already exist in the platform (advisory
 * `ai_insights`, licensing application AI assessments and Fit & Proper
 * AI/media screening runs) into one presentation model so a single page can
 * list, group, filter and deep-link back to the authoritative source record.
 */

export type HubModule =
  | 'licensing'
  | 'fit_proper'
  | 'prudential'
  | 'examination'
  | 'complaints'
  | 'conduct'
  | 'enforcement'
  | 'cross_module'
  | 'executive';

export type HubSource = 'ai_insights' | 'application_assessment' | 'fpa';

export type Freshness = 'current' | 'outdated' | 'unknown';

export interface SupervisoryAiReport {
  /** Persistent identity of the stored analysis — used for de-duplication. */
  id: string;
  source: HubSource;
  module: HubModule;
  analysisType: string;
  title: string;
  summary?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  recordId?: string | null;
  recordReference?: string | null;
  periodKey?: string | null;
  generatedAt: string;
  generatedBy?: string | null;
  confidence?: string | null;
  providerState?: string | null;
  freshness: Freshness;
  limitedEvidence?: boolean;
  flagged?: boolean;
  feedback?: string | null;
  sourceRoute?: string | null;
  /** Human wording for the "open the real record" action. */
  sourceActionLabel: string;
}

export const HUB_MODULE_LABEL: Record<HubModule, string> = {
  licensing: 'Licensing',
  fit_proper: 'Fit & Proper',
  prudential: 'Prudential supervision',
  examination: 'Examination & inspection',
  complaints: 'Complaints',
  conduct: 'Market conduct',
  enforcement: 'Enforcement',
  cross_module: 'Cross-module intelligence',
  executive: 'Executive intelligence',
};

/** End-to-end supervisory lifecycle grouping used by the Lifecycle view. */
export const LIFECYCLE_GROUPS: Array<{ key: string; label: string; modules: HubModule[] }> = [
  { key: 'entry', label: '1. Licensing & entry', modules: ['licensing', 'fit_proper'] },
  { key: 'prudential', label: '2. Prudential supervision', modules: ['prudential'] },
  { key: 'examination', label: '3. Examination & inspection', modules: ['examination'] },
  { key: 'conduct', label: '4. Market conduct & complaints', modules: ['complaints', 'conduct'] },
  { key: 'enforcement', label: '5. Enforcement & supervisory action', modules: ['enforcement'] },
  { key: 'cross', label: '6. Cross-module intelligence', modules: ['cross_module'] },
  { key: 'executive', label: '7. Executive intelligence', modules: ['executive'] },
];

/** Friendly wording for every analysis type the platform can persist. */
export const ANALYSIS_TYPE_LABEL: Record<string, string> = {
  // Prudential
  risk_interpretation: 'Risk interpretation',
  risk_changes: 'Risk change analysis',
  ewi_priority: 'Early-warning priority analysis',
  trend_commentary: 'Trend commentary',
  peer_divergence: 'Peer comparison analysis',
  portfolio_summary: 'Portfolio summary',
  heatmap_movement: 'Risk dashboard movement analysis',
  // Examination
  examination_brief: 'Examination preparation brief',
  scope_suggestions: 'Scope suggestions',
  data_request_suggestions: 'Data request suggestions',
  workpaper_summary: 'Workpaper analysis',
  finding_draft: 'Finding draft',
  finding_consistency: 'Finding consistency review',
  report_draft: 'Examination report draft',
  management_response_review: 'Management response analysis',
  // Enforcement
  case_chronology: 'Enforcement case chronology',
  evidence_assessment: 'Enforcement evidence assessment',
  precedent_comparison: 'Precedent comparison',
  enforcement_draft: 'Enforcement drafting assistance',
  sanction_factors: 'Aggravating & mitigating factor analysis',
  // Complaints / conduct
  complaint_classification: 'Complaint classification suggestion',
  complaint_summary: 'Complaint case summary',
  similar_complaints: 'Similar complaint analysis',
  conduct_recurrence: 'Conduct recurrence analysis',
  investigation_assistance: 'Investigation assistance',
  resolution_draft: 'Resolution drafting assistance',
  qa_assistance: 'Complaint QA assistance',
  // Cross-module
  entity_supervisory_brief: 'Entity supervisory brief',
  cross_module_patterns: 'Cross-module pattern analysis',
  related_events: 'Related supervisory events',
  supervisory_query: 'Supervisory query response',
  // Executive
  executive_briefing: 'Executive supervisory briefing',
  what_changed: 'What changed',
  suggested_priorities: 'Suggested priorities',
  meeting_brief: 'Meeting brief',
  // Adapted legacy sources
  application_assessment: 'Licensing application AI assessment',
  fp_ai_media_screening: 'Fit & Proper adverse-media screening analysis',
};

export function analysisTypeLabel(type?: string | null): string {
  if (!type) return 'AI analysis';
  return (
    ANALYSIS_TYPE_LABEL[type] ??
    type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

export const CONFIDENCE_TEXT: Record<string, string> = {
  high: 'Evidence confidence: High',
  moderate: 'Evidence confidence: Moderate',
  limited: 'Evidence confidence: Limited',
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Current',
  outdated: 'May be outdated',
  unknown: 'Freshness unknown',
};

export const HUB_DISCLAIMER =
  'Reports shown here summarise and interpret existing platform information. Official regulatory decisions, ratings, findings and workflow states remain in their source modules.';

/** Maps the stored `ai_insights.module` value onto a hub module. */
export function hubModuleFromInsight(module?: string | null): HubModule {
  switch (module) {
    case 'examination':
    case 'enforcement':
    case 'complaints':
    case 'conduct':
    case 'cross_module':
    case 'executive':
    case 'prudential':
      return module;
    case 'licensing':
      return 'licensing';
    case 'fit_and_proper':
    case 'fit_proper':
      return 'fit_proper';
    default:
      return 'cross_module';
  }
}

interface RouteInput {
  module: HubModule;
  scope?: string | null;
  recordId?: string | null;
}

/**
 * Deterministic source route from module + record id, using the application's
 * own routing conventions. AI text never influences a URL.
 */
export function sourceRouteFor({ module, scope, recordId }: RouteInput): {
  route: string | null;
  label: string;
} {
  const id = recordId ?? null;
  switch (module) {
    case 'licensing':
      return { route: id ? `/applications/${id}` : '/applications/queue', label: 'Open application' };
    case 'fit_proper':
      return {
        route: id ? `/fpa/ai-analysis?assessment=${id}` : '/fpa/ai-analysis',
        label: 'Open Fit & Proper analysis',
      };
    case 'prudential':
      return scope === 'portfolio' || !id
        ? { route: '/prudential/dashboard', label: 'Open prudential dashboard' }
        : { route: `/prudential/entities/${id}`, label: 'Open entity profile' };
    case 'examination':
      return id
        ? { route: `/prudential/examinations/${id}`, label: 'Open examination' }
        : { route: '/prudential/examinations', label: 'Open examinations' };
    case 'complaints':
      return id
        ? { route: `/complaints/${id}`, label: 'Open complaint' }
        : { route: '/complaints', label: 'Open complaints' };
    case 'conduct':
      return id
        ? { route: `/conduct/entities/${id}`, label: 'Open conduct profile' }
        : { route: '/conduct', label: 'Open conduct dashboard' };
    case 'enforcement':
      return id
        ? { route: `/enforcement/${id}`, label: 'Open enforcement case' }
        : { route: '/enforcement', label: 'Open enforcement cases' };
    case 'cross_module':
      return id
        ? { route: `/prudential/entities/${id}`, label: 'Open entity profile' }
        : { route: '/prudential/entities', label: 'Open supervised entities' };
    case 'executive':
    default:
      return { route: '/executive', label: 'Open executive dashboard' };
  }
}

/**
 * Freshness is derived only from record state — never from AI content.
 * A source record updated after the analysis was generated means the analysis
 * may no longer describe the current record.
 */
export function deriveFreshness(generatedAt?: string | null, sourceUpdatedAt?: string | null): Freshness {
  if (!generatedAt) return 'unknown';
  if (!sourceUpdatedAt) return 'unknown';
  return new Date(sourceUpdatedAt).getTime() > new Date(generatedAt).getTime() ? 'outdated' : 'current';
}

/** Only successful/usable analyses are treated as reports by default. */
export function isUsableProviderState(state?: string | null): boolean {
  if (!state) return true;
  return ['live', 'success', 'INSUFFICIENT_DATA', 'completed'].includes(state);
}

export function providerStateBadge(state?: string | null): string | null {
  if (!state || ['live', 'success', 'completed'].includes(state)) return null;
  if (state === 'INSUFFICIENT_DATA') return 'Limited evidence';
  return 'AI unavailable';
}

/** The visible subject of a report — never a raw UUID when a name is known. */
export function subjectLabel(report: SupervisoryAiReport): string {
  if (report.entityName && report.recordReference) return `${report.entityName} · ${report.recordReference}`;
  if (report.entityName) return report.entityName;
  if (report.recordReference) return report.recordReference;
  if (report.module === 'executive' || report.module === 'prudential') return 'Supervised portfolio';
  return 'Subject not available';
}

export const TIME_RANGES = [
  { value: 'all', label: 'All available' },
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
] as const;

export type TimeRange = (typeof TIME_RANGES)[number]['value'];

export function rangeStart(range: TimeRange, customFrom?: string): string | null {
  const now = new Date();
  switch (range) {
    case 'today': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case '7':
      return new Date(now.getTime() - 7 * 864e5).toISOString();
    case '30':
      return new Date(now.getTime() - 30 * 864e5).toISOString();
    case 'custom':
      return customFrom ? new Date(customFrom).toISOString() : null;
    default:
      return null;
  }
}
