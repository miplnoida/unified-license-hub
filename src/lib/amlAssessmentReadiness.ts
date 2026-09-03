/**
 * Assessment readiness — computed from the methodology, not from a row count.
 *
 * An AML/CFT assessment is only ready for supervisory review when every
 * mandatory dimension of its methodology version has been worked: rated, with
 * a rationale, with the evidence the methodology requires, with data quality
 * considered, and with a rationale for every departure from the calculated
 * recommendation. The database re-checks all of this on submission; this module
 * exists so the officer can see exactly what is outstanding beforehand.
 */
import type { AmlMethodologyDimension } from '@/hooks/useAmlLifecycle';

export interface RecordedDimension {
  id: string;
  dimension_code: string;
  dimension_group: string;
  inherent_rating: string | null;
  control_rating: string | null;
  residual_rating: string | null;
  rationale: string | null;
  evidence_refs: unknown;
  data_quality: string | null;
  confidence: string | null;
  trend: string | null;
  is_applicable: boolean | null;
  is_overridden: boolean | null;
  override_reason: string | null;
  calculated_inherent_rating: string | null;
  calculated_control_rating: string | null;
  calculated_residual_rating: string | null;
  calculated_score: number | null;
  weight: number | null;
  methodology_dimension_id?: string | null;
  [key: string]: unknown;
}

export const evidenceCount = (refs: unknown): number =>
  Array.isArray(refs) ? refs.length : refs && typeof refs === 'object' ? Object.keys(refs).length : refs ? 1 : 0;

export function matchRecorded(
  dimension: AmlMethodologyDimension,
  recorded: RecordedDimension[],
): RecordedDimension | undefined {
  return (
    recorded.find((r) => r.methodology_dimension_id === dimension.id) ??
    recorded.find((r) => r.dimension_code === dimension.dimension_code)
  );
}

/** Is a dimension considered "assessed"? A judged rating plus a rationale. */
export function isAssessed(dimension: AmlMethodologyDimension, row?: RecordedDimension): boolean {
  if (!row) return false;
  if (row.is_applicable === false) return true;
  const judged =
    dimension.dimension_group === 'CONTROL_EFFECTIVENESS'
      ? row.control_rating || row.residual_rating
      : row.inherent_rating || row.residual_rating;
  return !!judged && !!String(row.rationale ?? '').trim();
}

/** A judged rating that departs from the methodology's calculated recommendation. */
export function isOverride(dimension: AmlMethodologyDimension, row?: RecordedDimension): boolean {
  if (!row) return false;
  const calc =
    dimension.dimension_group === 'CONTROL_EFFECTIVENESS'
      ? row.calculated_control_rating
      : row.calculated_inherent_rating;
  const judged =
    dimension.dimension_group === 'CONTROL_EFFECTIVENESS' ? row.control_rating : row.inherent_rating;
  if (!calc || !judged) return false;
  return String(calc).toLowerCase() !== String(judged).toLowerCase();
}

export interface ReadinessCheck {
  key: string;
  label: string;
  satisfied: boolean;
  detail: string;
}

export interface AssessmentReadiness {
  totalDimensions: number;
  assessedDimensions: number;
  mandatoryTotal: number;
  mandatoryAssessed: number;
  inherentOutstanding: string[];
  controlOutstanding: string[];
  rationaleOutstanding: string[];
  evidenceOutstanding: string[];
  dataQualityOutstanding: string[];
  overrideRationaleOutstanding: string[];
  checks: ReadinessCheck[];
  ready: boolean;
}

const label = (d: AmlMethodologyDimension) => d.label || d.dimension_code;

export function computeAssessmentReadiness(
  dimensions: AmlMethodologyDimension[],
  recorded: RecordedDimension[],
): AssessmentReadiness {
  const inherentOutstanding: string[] = [];
  const controlOutstanding: string[] = [];
  const rationaleOutstanding: string[] = [];
  const evidenceOutstanding: string[] = [];
  const dataQualityOutstanding: string[] = [];
  const overrideRationaleOutstanding: string[] = [];
  let assessed = 0;

  dimensions.forEach((d) => {
    const row = matchRecorded(d, recorded);
    const done = isAssessed(d, row);
    if (done) assessed += 1;
    if (!done) {
      (d.dimension_group === 'CONTROL_EFFECTIVENESS' ? controlOutstanding : inherentOutstanding).push(label(d));
    }
    if (row && row.is_applicable !== false) {
      if (!String(row.rationale ?? '').trim()) rationaleOutstanding.push(label(d));
      const needed = d.evidence_required ? Math.max(1, d.min_evidence_count ?? 1) : 0;
      if (needed > 0 && evidenceCount(row.evidence_refs) < needed) evidenceOutstanding.push(label(d));
      if (!row.data_quality) dataQualityOutstanding.push(label(d));
      if (isOverride(d, row) && !String(row.override_reason ?? '').trim()) {
        overrideRationaleOutstanding.push(label(d));
      }
    }
  });

  const list = (items: string[], max = 4) =>
    items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} +${items.length - max} more`;

  const checks: ReadinessCheck[] = [
    {
      key: 'inherent',
      label: 'All mandatory inherent risk dimensions completed',
      satisfied: inherentOutstanding.length === 0,
      detail: inherentOutstanding.length ? `Outstanding: ${list(inherentOutstanding)}` : 'Complete',
    },
    {
      key: 'control',
      label: 'All mandatory control effectiveness dimensions completed',
      satisfied: controlOutstanding.length === 0,
      detail: controlOutstanding.length ? `Outstanding: ${list(controlOutstanding)}` : 'Complete',
    },
    {
      key: 'rationale',
      label: 'Required supervisory rationale recorded',
      satisfied: rationaleOutstanding.length === 0,
      detail: rationaleOutstanding.length ? `Missing on: ${list(rationaleOutstanding)}` : 'Complete',
    },
    {
      key: 'evidence',
      label: 'Required evidence supplied',
      satisfied: evidenceOutstanding.length === 0,
      detail: evidenceOutstanding.length
        ? `${evidenceOutstanding.length} evidence requirement${evidenceOutstanding.length === 1 ? '' : 's'} outstanding: ${list(evidenceOutstanding)}`
        : 'Complete',
    },
    {
      key: 'data_quality',
      label: 'Data quality considered',
      satisfied: dataQualityOutstanding.length === 0,
      detail: dataQualityOutstanding.length ? `Not stated on: ${list(dataQualityOutstanding)}` : 'Complete',
    },
    {
      key: 'override',
      label: 'Every departure from the calculated rating is explained',
      satisfied: overrideRationaleOutstanding.length === 0,
      detail: overrideRationaleOutstanding.length
        ? `${overrideRationaleOutstanding.length} override rationale${overrideRationaleOutstanding.length === 1 ? '' : 's'} missing: ${list(overrideRationaleOutstanding)}`
        : 'Complete',
    },
  ];

  return {
    totalDimensions: dimensions.length,
    assessedDimensions: assessed,
    mandatoryTotal: dimensions.length,
    mandatoryAssessed: assessed,
    inherentOutstanding,
    controlOutstanding,
    rationaleOutstanding,
    evidenceOutstanding,
    dataQualityOutstanding,
    overrideRationaleOutstanding,
    checks,
    ready: checks.every((c) => c.satisfied) && dimensions.length > 0,
  };
}
