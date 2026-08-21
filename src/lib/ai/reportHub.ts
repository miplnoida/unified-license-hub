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

/** One normalised state for every source — source-specific statuses never leak. */
export type HubReportState = 'available' | 'limited' | 'processing' | 'failed';

export type HubConfidence = 'high' | 'moderate' | 'limited';

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
  subjectName?: string | null;
  periodKey?: string | null;
  generatedAt: string;
  generatedBy?: string | null;
  confidence?: HubConfidence | null;
  reportState: HubReportState;
  freshness: Freshness;
  limitedEvidence?: boolean;
  flagged?: boolean;
  feedback?: string | null;
  reviewStatus?: string | null;
  /** Stable logical identity of the analysis across its versions. */
  versionKey: string;
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
        : { route: `/prudential/analysis/${id}`, label: 'Open entity profile' };
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
        ? { route: `/prudential/analysis/${id}`, label: 'Open entity profile' }
        : { route: '/prudential/entities', label: 'Open supervised entities' };
    case 'executive':
    default:
      return { route: '/executive', label: 'Open executive dashboard' };
  }
}

/**
 * Freshness and report state are derived on the server from authoritative
 * record state (including child records) — never from AI content. These helpers
 * only turn the normalised values into wording.
 */
export const REPORT_STATE_LABEL: Record<HubReportState, string | null> = {
  available: null,
  limited: 'Limited evidence',
  processing: 'Still being prepared',
  failed: 'Analysis did not complete',
};

export function reportStateBadge(state?: HubReportState | null): string | null {
  if (!state) return null;
  return REPORT_STATE_LABEL[state] ?? null;
}

/** The visible subject of a report — never a raw UUID when a name is known. */
export function subjectLabel(report: SupervisoryAiReport): string {
  const parts = [report.entityName, report.recordReference].filter(Boolean) as string[];
  if (parts.length) return parts.join(' · ');
  if (report.subjectName) return report.subjectName;
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

/** Local start of the given calendar day. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Inclusive-start / exclusive-end bounds for a range, using the viewer's local
 * calendar days. The end is the *start of the next day*, so a report generated
 * at 23:59 on the selected "To" date is still included.
 */
export function rangeBounds(
  range: TimeRange,
  customFrom?: string,
  customTo?: string,
): { from: string | null; to: string | null } {
  const now = new Date();
  const today = startOfLocalDay(now);
  const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: nextDay(today).toISOString() };
    case '7':
      return {
        from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).toISOString(),
        to: nextDay(today).toISOString(),
      };
    case '30':
      return {
        from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29).toISOString(),
        to: nextDay(today).toISOString(),
      };
    case 'custom': {
      const from = parseDateInput(customFrom);
      const to = parseDateInput(customTo);
      return {
        from: from ? from.toISOString() : null,
        to: to ? nextDay(to).toISOString() : null,
      };
    }
    default:
      return { from: null, to: null };
  }
}

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting human review',
  accepted: 'Accepted in AI review',
  rejected: 'Rejected in AI review',
  escalated: 'Escalated in AI review',
};

/**
 * Presentation-only status chips for one report. No new business rules — every
 * chip is derived from a field the report model already carries.
 */
export type ReportStatusTone = 'urgent' | 'warning' | 'ok' | 'neutral';

export interface ReportStatusChip {
  key: 'flagged' | 'incomplete' | 'processing' | 'outdated' | 'limited' | 'current';
  label: string;
  tone: ReportStatusTone;
}

export function reportStatusChips(report: SupervisoryAiReport): ReportStatusChip[] {
  const chips: ReportStatusChip[] = [];
  if (report.flagged) chips.push({ key: 'flagged', label: 'Needs review', tone: 'urgent' });
  if (report.reportState === 'failed')
    chips.push({ key: 'incomplete', label: 'Incomplete', tone: 'urgent' });
  if (report.reportState === 'processing')
    chips.push({ key: 'processing', label: 'Still being prepared', tone: 'warning' });
  if (report.freshness === 'outdated')
    chips.push({ key: 'outdated', label: 'May be outdated', tone: 'warning' });
  if (report.limitedEvidence || report.reportState === 'limited')
    chips.push({ key: 'limited', label: 'Limited evidence', tone: 'neutral' });
  if (!chips.length && report.freshness === 'current')
    chips.push({ key: 'current', label: 'Current', tone: 'ok' });
  return chips;
}

/** True when an existing state already marks the report as needing a look. */
export function needsAttention(report: SupervisoryAiReport): boolean {
  return (
    !!report.flagged ||
    report.freshness === 'outdated' ||
    !!report.limitedEvidence ||
    report.reportState === 'failed' ||
    report.reportState === 'limited' ||
    report.reportState === 'processing'
  );
}

/** Buckets used by the "Needs Attention" tab, in priority order. */
export const ATTENTION_BUCKETS: Array<{
  key: string;
  label: string;
  match: (r: SupervisoryAiReport) => boolean;
}> = [
  { key: 'flagged', label: 'Flagged for review', match: (r) => !!r.flagged },
  {
    key: 'incomplete',
    label: 'Incomplete analyses',
    match: (r) => !r.flagged && (r.reportState === 'failed' || r.reportState === 'processing'),
  },
  {
    key: 'outdated',
    label: 'May be outdated',
    match: (r) =>
      !r.flagged && r.reportState !== 'failed' && r.reportState !== 'processing' && r.freshness === 'outdated',
  },
  {
    key: 'limited',
    label: 'Limited evidence',
    match: (r) =>
      !r.flagged &&
      r.reportState !== 'failed' &&
      r.reportState !== 'processing' &&
      r.freshness !== 'outdated' &&
      (!!r.limitedEvidence || r.reportState === 'limited'),
  },
];

/**
 * Presentation-only visual identity per supervisory area, so a wall of cards for
 * the same organisation stays scannable. Tokens only — no hardcoded hex.
 */
export interface HubModuleVisual {
  /** Short chip wording (the long label stays available in HUB_MODULE_LABEL). */
  chip: string;
  /** Tailwind classes for the area chip. */
  chipClass: string;
  /** Tailwind class for the card's left accent border. */
  accentClass: string;
}

export const HUB_MODULE_VISUAL: Record<HubModule, HubModuleVisual> = {
  licensing: {
    chip: 'Licensing',
    chipClass: 'border-primary/30 bg-primary/10 text-primary',
    accentClass: 'border-l-primary/60',
  },
  fit_proper: {
    chip: 'Fit & Proper',
    chipClass: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    accentClass: 'border-l-sky-500/60',
  },
  prudential: {
    chip: 'Prudential risk',
    chipClass: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
    accentClass: 'border-l-indigo-500/60',
  },
  examination: {
    chip: 'Examination',
    chipClass: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400',
    accentClass: 'border-l-teal-500/60',
  },
  complaints: {
    chip: 'Complaints',
    chipClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    accentClass: 'border-l-amber-500/60',
  },
  conduct: {
    chip: 'Market conduct',
    chipClass: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
    accentClass: 'border-l-orange-500/60',
  },
  enforcement: {
    chip: 'Enforcement',
    chipClass: 'border-destructive/30 bg-destructive/10 text-destructive',
    accentClass: 'border-l-destructive/60',
  },
  cross_module: {
    chip: 'Cross-module',
    chipClass: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400',
    accentClass: 'border-l-violet-500/60',
  },
  executive: {
    chip: 'Executive',
    chipClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    accentClass: 'border-l-emerald-500/60',
  },
};

export function hubModuleVisual(module: HubModule): HubModuleVisual {
  return HUB_MODULE_VISUAL[module] ?? HUB_MODULE_VISUAL.cross_module;
}



