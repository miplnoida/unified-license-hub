/**
 * Plain-language presentation of a stored AI analysis.
 *
 * Nothing here calls an AI model, invents content or changes meaning: it only
 * picks the sentences that already exist in the stored payload and arranges
 * them under three questions a non-technical reader actually asks. Technical
 * fields (analysis type keys, fingerprints, provider states) stay out.
 */
import type { AdvisoryObservation, SupervisoryPayload } from '@/lib/ai/advisoryAi';
import type { HubModule, SupervisoryAiReport } from '@/lib/ai/reportHub';

export interface PlainLanguageBlock {
  /** One-sentence answer to "what does this say?". */
  whatThisSays: string | null;
  /** Why a supervisor should care — risks, issues, divergences. */
  whyItMatters: string[];
  /** Practical next look — focus areas, suggested checks. */
  whatToLookAtNext: string[];
}

const text = (item: AdvisoryObservation | string | undefined | null): string =>
  !item ? '' : typeof item === 'string' ? item : item.text ?? '';

const firstSentence = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^[^.!?]{20,240}[.!?]/);
  return (match?.[0] ?? trimmed).trim();
};

const take = (list: unknown, limit = 4): string[] =>
  (Array.isArray(list) ? list : [])
    .map((i) => text(i as AdvisoryObservation | string))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, limit);

/** Plain-language block for an advisory (`ai_insights`) payload. */
export function plainLanguageFromPayload(payload: SupervisoryPayload | null | undefined): PlainLanguageBlock {
  const p = payload ?? {};
  const whyItMatters = [
    ...take((p as any).issues, 3),
    ...take((p as any).risks, 3),
    ...take(p.interpretation, 3),
  ].slice(0, 5);
  return {
    whatThisSays: firstSentence(p.summary) ?? (take(p.interpretation, 1)[0] ?? null),
    whyItMatters,
    whatToLookAtNext: take(p.suggested_focus_areas, 5),
  };
}

/** Plain-language block for a licensing application AI assessment row. */
export function plainLanguageFromLegacyApplication(legacy: any): PlainLanguageBlock {
  const label = (i: any) =>
    typeof i === 'string'
      ? i
      : [i?.title ?? i?.issue ?? i?.risk_type ?? i?.field, i?.text ?? i?.reason ?? i?.description]
          .filter(Boolean)
          .join(' — ');
  return {
    whatThisSays: firstSentence(legacy?.summary),
    whyItMatters: [...(legacy?.risks ?? []), ...(legacy?.findings ?? [])]
      .map(label)
      .filter(Boolean)
      .slice(0, 5),
    whatToLookAtNext: (legacy?.missing_information ?? []).map(label).filter(Boolean).slice(0, 5),
  };
}

/** Plain-language block for a Fit & Proper screening run. */
export function plainLanguageFromLegacyFpa(legacy: any): PlainLanguageBlock {
  const hits = Number(legacy?.total_hits ?? 0);
  const checks = Number(legacy?.total_checks ?? 0);
  return {
    whatThisSays: hits
      ? `Screening returned ${hits} potential match(es) across ${checks} check(s) and needs an officer's review.`
      : `Screening completed ${checks} check(s) and returned no potential matches.`,
    whyItMatters: hits ? ['Potential matches must be confirmed or dismissed by an officer before a decision.'] : [],
    whatToLookAtNext: hits ? ['Open the Fit & Proper analysis and review each potential match.'] : [],
  };
}

export function isEmptyPlainLanguage(b: PlainLanguageBlock): boolean {
  return !b.whatThisSays && !b.whyItMatters.length && !b.whatToLookAtNext.length;
}

/**
 * The six supervisory areas the hub is expected to connect. Each area maps onto
 * the hub modules that store analyses for it, plus where an officer generates
 * one when nothing exists yet.
 */
export interface SupervisoryArea {
  key: string;
  label: string;
  /** What this area answers, in plain words. */
  description: string;
  modules: HubModule[];
  /** Route where analyses for this area are produced, given an entity id. */
  generateRoute: (entityId: string) => string;
  generateLabel: string;
}

export const SUPERVISORY_AREAS: SupervisoryArea[] = [
  {
    key: 'filings',
    label: 'Filings & licensing',
    description: 'Applications, returns and licensing submissions for this entity.',
    modules: ['licensing', 'fit_proper'],
    generateRoute: () => '/applications/queue',
    generateLabel: 'Open applications',
  },
  {
    key: 'risk',
    label: 'Prudential risk',
    description: 'Ratios, thresholds, early-warning indicators and peer position.',
    modules: ['prudential'],
    generateRoute: (id) => `/prudential/analysis/${id}`,
    generateLabel: 'Open entity profile',
  },
  {
    key: 'inspections',
    label: 'Inspections & examinations',
    description: 'Onsite examinations, workpapers and findings.',
    modules: ['examination'],
    generateRoute: () => '/prudential/examinations',
    generateLabel: 'Open examinations',
  },
  {
    key: 'complaints',
    label: 'Complaints & market conduct',
    description: 'Consumer complaints, conduct signals and recurring themes.',
    modules: ['complaints', 'conduct'],
    generateRoute: () => '/complaints',
    generateLabel: 'Open complaints',
  },
  {
    key: 'actions',
    label: 'Supervisory actions & enforcement',
    description: 'Enforcement cases, directives and obligations.',
    modules: ['enforcement'],
    generateRoute: () => '/enforcement',
    generateLabel: 'Open enforcement cases',
  },
  {
    key: 'history',
    label: 'Entity history & cross-module view',
    description: 'Cross-module briefs that read the entity’s whole supervisory record.',
    modules: ['cross_module', 'executive'],
    generateRoute: (id) => `/prudential/analysis/${id}`,
    generateLabel: 'Open entity 360 profile',
  },
];

/** Latest report per area from an already-authorised list. */
export function groupReportsByArea(reports: SupervisoryAiReport[]) {
  return SUPERVISORY_AREAS.map((area) => {
    const list = reports
      .filter((r) => area.modules.includes(r.module))
      .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
    return { area, latest: list[0] ?? null, total: list.length };
  });
}
