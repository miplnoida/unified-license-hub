// MC-11 — Prompt construction and output contracts for supervisory management
// reporting assistance. The model receives ONLY the governed reporting fact
// package returned by `public.conduct_reporting_ai_context`, plus the released
// instruction body resolved server-side by the MC-08 governance gate.

export const REPORTING_USE_CASE_CODES = [
  'MANAGEMENT_SUMMARY_DRAFT',
  'MATERIAL_MOVEMENT_EXPLANATION',
  'RISK_REPORTING_NARRATIVE',
  'COVERAGE_COMMENTARY',
  'EVIDENCE_PACK_SUMMARY',
] as const;

export type ReportingUseCaseCode = typeof REPORTING_USE_CASE_CODES[number];

export interface PermittedReference {
  section: string;
  reference: string;
  label?: string;
}

export interface PermittedFigure {
  code: string;
  label?: string;
  value: number | null;
}

/** References the narrative may cite: measure codes, risk references, pack reference. */
export function permittedReferences(context: Record<string, unknown>): PermittedReference[] {
  const list = Array.isArray(context.permitted_references)
    ? (context.permitted_references as Array<Record<string, unknown>>)
    : [];
  const out: PermittedReference[] = [];
  for (const r of list) {
    const reference = typeof r?.reference === 'string' ? r.reference.trim() : '';
    if (!reference || out.some((x) => x.reference === reference)) continue;
    out.push({
      section: String(r?.section ?? 'reference'),
      reference,
      label: typeof r?.label === 'string' ? r.label : undefined,
    });
  }
  return out;
}

/** The complete set of figures the narrative may state. Anything else is invented. */
export function permittedFigures(context: Record<string, unknown>): PermittedFigure[] {
  const list = Array.isArray(context.permitted_figures)
    ? (context.permitted_figures as Array<Record<string, unknown>>)
    : [];
  return list.map((f) => ({
    code: String(f?.code ?? ''),
    label: typeof f?.label === 'string' ? f.label : undefined,
    value: typeof f?.value === 'number' ? f.value : Number.isFinite(Number(f?.value)) ? Number(f?.value) : null,
  })).filter((f) => f.code);
}

export function buildSystemPrompt(
  useCaseCode: ReportingUseCaseCode,
  useCase: Record<string, unknown>,
  gov: {
    instruction_body: string | null;
    instruction_template_code: string;
    instruction_version: string;
    prohibited_behaviours: string[];
    required_caveats: string[];
    advisory_classification: string | null;
  },
): string {
  const lines: string[] = [];
  lines.push(gov.instruction_body ?? 'You assist a financial services supervisor. Use only the supplied figures.');
  lines.push('');
  lines.push(`Governed capability: ${useCaseCode} (instruction ${gov.instruction_template_code} ${gov.instruction_version}).`);
  lines.push(`Classification: ${gov.advisory_classification ?? 'ADVISORY_HUMAN_REVIEWED'}. Your output is draft commentary for a supervisor to review. It authorises nothing and changes no record.`);
  lines.push('');
  lines.push('Absolute boundaries:');
  lines.push('- Use ONLY the supplied deterministic management information. You have no database, tool or external access.');
  lines.push('- State no figure, count, percentage or ratio that is not present in the supplied figures. Never recalculate, derive, average or estimate a number.');
  lines.push('- Quote supplied figures exactly as given, and cite the measure code alongside every figure.');
  lines.push('- Never assert a breach, finding, sanction, outcome, rating or supervisory conclusion.');
  lines.push('- Never present the absence of recorded supervisory activity as compliance, assurance or low risk.');
  lines.push('- Where a population is flagged as immaterial or interpretation as limited, say so in words instead of quoting a percentage.');
  for (const p of gov.prohibited_behaviours ?? []) lines.push(`- Prohibited: ${p}.`);
  if ((gov.required_caveats ?? []).length > 0) {
    lines.push('');
    lines.push(`Always include these caveats in "limitations": ${gov.required_caveats.join(' | ')}`);
  }
  const limitation = String(useCase.limitation_policy ?? '').trim();
  if (limitation) lines.push(`Standing limitation: ${limitation}`);
  lines.push('');
  lines.push('State confidence (0-1) and uncertainty explicitly. If the figures are insufficient, say so rather than speculating.');
  return lines.join('\n');
}

export function buildUserPrompt(context: Record<string, unknown>): string {
  const refs = permittedReferences(context);
  const figures = permittedFigures(context);
  const period = (context.period ?? {}) as Record<string, unknown>;
  return [
    'SUPERVISORY MANAGEMENT REPORTING FACT PACKAGE (the only permitted source):',
    JSON.stringify(context.snapshot ?? {}, null, 2),
    '',
    `REPORTING PERIOD: ${String(period.start ?? '')} to ${String(period.end ?? '')}`,
    `FACTS SIGNATURE: ${String(context.facts_signature ?? '')}`,
    '',
    'FIGURES YOU MAY STATE (exact values, nothing else):',
    figures.length > 0
      ? figures.map((f) => `- ${f.code} = ${f.value === null ? 'not available' : f.value}${f.label ? ` (${f.label})` : ''}`).join('\n')
      : '- (none supplied)',
    '',
    'REFERENCES YOU MAY CITE (exact strings, nothing else):',
    refs.length > 0 ? refs.map((r) => `- ${r.reference} (${r.section})`).join('\n') : '- (none supplied)',
  ].join('\n');
}

const str = { type: 'string' } as const;
const strArray = { type: 'array', items: { type: 'string' } } as const;

function base(properties: Record<string, unknown>, required: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...properties,
      figures_used: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { measure_code: str, value: { type: 'number' }, statement: str },
          required: ['measure_code', 'value', 'statement'],
        },
      },
      confidence: { type: 'number' },
      uncertainty: str,
      limitations: strArray,
      cited_references: strArray,
    },
    required: [...required, 'figures_used', 'confidence', 'uncertainty', 'limitations', 'cited_references'],
  };
}

const citedItem = (props: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  additionalProperties: false,
  properties: { ...props, cited_references: strArray },
  required: [...required, 'cited_references'],
});

/** Per-capability strict output contract. */
export function buildAdvisorySchema(useCaseCode: ReportingUseCaseCode) {
  switch (useCaseCode) {
    case 'MANAGEMENT_SUMMARY_DRAFT':
      return base({
        headline: str,
        summary: str,
        what_the_period_shows: strArray,
        matters_for_management_attention: {
          type: 'array',
          items: citedItem({ matter: str, why: str }, ['matter', 'why']),
        },
        not_evidenced: strArray,
      }, ['headline', 'summary', 'what_the_period_shows', 'matters_for_management_attention', 'not_evidenced']);

    case 'MATERIAL_MOVEMENT_EXPLANATION':
      return base({
        movements: {
          type: 'array',
          items: citedItem({
            measure_code: str,
            movement_description: str,
            what_it_may_reflect: str,
            interpretation_limited: { type: 'boolean' },
          }, ['measure_code', 'movement_description', 'what_it_may_reflect', 'interpretation_limited']),
        },
        summary: str,
      }, ['movements', 'summary']);

    case 'RISK_REPORTING_NARRATIVE':
      return base({
        summary: str,
        risks: {
          type: 'array',
          items: citedItem({
            reference: str,
            what_is_recorded: str,
            response_chain_state: str,
            gaps_in_recorded_response: str,
          }, ['reference', 'what_is_recorded', 'response_chain_state', 'gaps_in_recorded_response']),
        },
      }, ['summary', 'risks']);

    case 'COVERAGE_COMMENTARY':
      return base({
        summary: str,
        coverage_observations: {
          type: 'array',
          items: citedItem({ observation: str, why_it_matters: str }, ['observation', 'why_it_matters']),
        },
        explicit_non_conclusions: strArray,
      }, ['summary', 'coverage_observations', 'explicit_non_conclusions']);

    case 'EVIDENCE_PACK_SUMMARY':
    default:
      return base({
        summary: str,
        chain_as_recorded: {
          type: 'array',
          items: citedItem({ stage: str, what_the_pack_records: str }, ['stage', 'what_the_pack_records']),
        },
        point_in_time_statement: str,
      }, ['summary', 'chain_as_recorded', 'point_in_time_statement']);
  }
}

/** Content the caller must have received for the generation to be usable. */
export function outputIsComplete(useCaseCode: ReportingUseCaseCode, output: Record<string, unknown>): boolean {
  const nonEmpty = (k: string) => Array.isArray(output[k]) && (output[k] as unknown[]).length > 0;
  switch (useCaseCode) {
    case 'MANAGEMENT_SUMMARY_DRAFT': return String(output.summary ?? '').trim().length > 0;
    case 'MATERIAL_MOVEMENT_EXPLANATION': return nonEmpty('movements');
    case 'RISK_REPORTING_NARRATIVE': return String(output.summary ?? '').trim().length > 0;
    case 'COVERAGE_COMMENTARY': return String(output.summary ?? '').trim().length > 0;
    case 'EVIDENCE_PACK_SUMMARY': return String(output.summary ?? '').trim().length > 0
      && String(output.point_in_time_statement ?? '').trim().length > 0;
    default: return false;
  }
}
