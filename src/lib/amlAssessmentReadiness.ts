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

export interface QuestionGap {
  dimensionCode: string;
  questionCode: string;
  questionText: string;
  reason: 'unanswered' | 'observation_missing' | 'na_rationale_missing' | 'evidence_missing';
}

export const QUESTION_GAP_REASON: Record<QuestionGap['reason'], string> = {
  unanswered: 'no response recorded',
  observation_missing: 'supervisory observation required',
  na_rationale_missing: 'Not Applicable requires a supervisory explanation',
  evidence_missing: 'governed evidence required',
};

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
  questionsTotal: number;
  questionsAnswered: number;
  questionGaps: QuestionGap[];
  checks: ReadinessCheck[];
  ready: boolean;
}

const label = (d: AmlMethodologyDimension) => d.label || d.dimension_code;

/**
 * Which mandatory methodology questions are still outstanding?
 *
 * This mirrors `supervisory_assessment_question_gaps` in the database exactly.
 * The database remains authoritative — it re-checks and refuses submission —
 * but the officer must be able to see precisely what is missing beforehand.
 */
export function computeQuestionGaps(
  questions: MethodologyQuestionLike[],
  responses: QuestionResponseLike[],
  dimensions: AmlMethodologyDimension[] = [],
): QuestionGap[] {
  const byQuestion = new Map(responses.map((r) => [r.methodology_question_id, r]));
  const dimCode = new Map(dimensions.map((d) => [d.id, d.dimension_code]));
  const gaps: QuestionGap[] = [];

  questions
    .filter((q) => q.mandatory !== false)
    .forEach((q) => {
      const r = byQuestion.get(q.id);
      const code = dimCode.get(q.methodology_dimension_id) ?? q.methodology_dimension_id;
      const push = (reason: QuestionGap['reason']) =>
        gaps.push({ dimensionCode: code, questionCode: q.question_code, questionText: q.prompt, reason });

      if (!r) return push('unanswered');
      const observation = String(r.observation ?? '').trim();
      if (r.response === 'NOT_APPLICABLE') {
        if (q.na_requires_rationale !== false && observation.length < 10) push('na_rationale_missing');
        return;
      }
      if (q.requires_observation !== false && observation.length < 10) return push('observation_missing');
      if (q.requires_evidence && evidenceCount(r.evidence_refs) < Math.max(1, q.min_evidence_count ?? 1)) {
        push('evidence_missing');
      }
    });

  return gaps;
}

export interface MethodologyQuestionLike {
  id: string;
  methodology_dimension_id: string;
  question_code: string;
  prompt: string;
  mandatory?: boolean;
  requires_observation?: boolean;
  requires_evidence?: boolean;
  min_evidence_count?: number;
  na_requires_rationale?: boolean;
}

export interface QuestionResponseLike {
  methodology_question_id: string;
  response: string;
  observation: string | null;
  evidence_refs: unknown;
}

export function computeAssessmentReadiness(
  dimensions: AmlMethodologyDimension[],
  recorded: RecordedDimension[],
  questions: MethodologyQuestionLike[] = [],
  responses: QuestionResponseLike[] = [],
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
    {
      key: 'questions',
      label: 'Mandatory supervisory questions answered',
      satisfied: questionGaps.length === 0,
      detail: questionGaps.length
        ? `${questionGaps.length} outstanding: ${list(
            questionGaps.map((g) => `${g.dimensionCode} ${g.questionCode} (${QUESTION_GAP_REASON[g.reason]})`),
            3,
          )}`
        : mandatoryQuestions.length
          ? `All ${mandatoryQuestions.length} questions answered`
          : 'No mandatory questions configured',
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
