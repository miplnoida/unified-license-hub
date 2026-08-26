// MC-10 — Prompt construction and output contracts for supervisory planning
// assistance. The model receives ONLY the governed planning fact package
// returned by `public.conduct_planning_snapshot`, plus the released instruction
// body resolved server-side by the MC-08 governance gate.

export const PLANNING_USE_CASE_CODES = [
  'ATTENTION_SUMMARY',
  'PLANNING_RECORDS_TO_REVIEW',
  'PLANNING_QUESTIONS',
  'INTERVENTION_OPTIONS',
  'SUPERVISORY_PLAN_DRAFT',
  'FOLLOWUP_CONSIDERATIONS',
] as const;

export type PlanningUseCaseCode = typeof PLANNING_USE_CASE_CODES[number];

export interface PermittedReference {
  section: string;
  reference: string;
  label?: string;
}

/**
 * The complete set of references the model is permitted to cite. Anything the
 * model cites outside this list invalidates the generation.
 */
export function permittedReferences(snapshot: Record<string, unknown>): PermittedReference[] {
  const out: PermittedReference[] = [];
  const push = (section: string, reference: unknown, label?: unknown) => {
    const ref = typeof reference === 'string' ? reference.trim() : '';
    if (!ref || out.some((r) => r.reference === ref)) return;
    out.push({ section, reference: ref, label: typeof label === 'string' ? label : undefined });
  };

  const attention = (snapshot.attention ?? null) as Record<string, unknown> | null;
  if (attention) {
    push('attention', attention.reference, attention.title);
    push('source_record', attention.source_reference, String(attention.source_module ?? ''));
  }
  const plan = (snapshot.plan ?? null) as Record<string, unknown> | null;
  if (plan) push('plan', plan.reference, plan.title);

  const risk = (snapshot.emerging_risk ?? null) as Record<string, unknown> | null;
  if (risk) push('emerging_risk', risk.reference, risk.title);

  for (const e of (Array.isArray(snapshot.linked_evidence) ? snapshot.linked_evidence : []) as Array<Record<string, unknown>>) {
    push('linked_evidence', e?.reference ?? e?.id ?? e?.label, e?.label ?? e?.description);
  }
  for (const i of (Array.isArray(snapshot.interventions) ? snapshot.interventions : []) as Array<Record<string, unknown>>) {
    push('intervention', i?.reference, String(i?.type ?? ''));
  }
  return out;
}

/** Approved catalogue codes — the only intervention codes the model may name. */
export function catalogueCodes(snapshot: Record<string, unknown>): string[] {
  const list = Array.isArray(snapshot.intervention_catalogue)
    ? (snapshot.intervention_catalogue as Array<Record<string, unknown>>)
    : [];
  return list.map((t) => String(t?.code ?? '')).filter(Boolean);
}

export function buildSystemPrompt(
  useCaseCode: PlanningUseCaseCode,
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
  lines.push(gov.instruction_body ?? 'You assist a financial services supervisor. Use only the supplied facts.');
  lines.push('');
  lines.push(`Governed capability: ${useCaseCode} (instruction ${gov.instruction_template_code} ${gov.instruction_version}).`);
  lines.push(`Classification: ${gov.advisory_classification ?? 'ADVISORY_ONLY'}. Your output is a suggestion for a supervisor to review. It authorises nothing, initiates nothing and changes no record.`);
  lines.push('');
  lines.push('Absolute boundaries:');
  lines.push('- Use ONLY the supplied facts. You have no database, tool or external access.');
  lines.push('- Never state, imply or adjust a supervisory priority, rating or score. The deterministic calculation and the accountable supervisor are authoritative.');
  lines.push('- Never assert a breach, finding, sanction, outcome or closure.');
  lines.push('- Never name an intervention that is not in the supplied approved catalogue.');
  lines.push('- Cite a supplied reference for every material statement, using the reference strings exactly as given.');
  for (const p of gov.prohibited_behaviours ?? []) lines.push(`- Prohibited: ${p}.`);
  if ((gov.required_caveats ?? []).length > 0) {
    lines.push('');
    lines.push(`Always include these caveats in "limitations": ${gov.required_caveats.join(' | ')}`);
  }
  const limitation = String(useCase.limitation_policy ?? '').trim();
  if (limitation) lines.push(`Standing limitation: ${limitation}`);
  lines.push('');
  lines.push('State confidence (0-1) and uncertainty explicitly. If the facts are insufficient, say so rather than speculating.');
  return lines.join('\n');
}

export function buildUserPrompt(context: Record<string, unknown>): string {
  const snapshot = (context.snapshot ?? {}) as Record<string, unknown>;
  const refs = permittedReferences(snapshot);
  return [
    'SUPERVISORY PLANNING FACT PACKAGE (the only permitted source):',
    JSON.stringify(snapshot, null, 2),
    '',
    `FACTS SIGNATURE: ${String(context.facts_signature ?? '')}`,
    '',
    'REFERENCES YOU MAY CITE (exact strings, nothing else):',
    refs.length > 0 ? refs.map((r) => `- ${r.reference} (${r.section})`).join('\n') : '- (none supplied)',
    '',
    'APPROVED INTERVENTION CODES YOU MAY NAME (nothing else):',
    catalogueCodes(snapshot).map((c) => `- ${c}`).join('\n') || '- (none supplied)',
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
      confidence: { type: 'number' },
      uncertainty: str,
      limitations: strArray,
      cited_references: strArray,
    },
    required: [...required, 'confidence', 'uncertainty', 'limitations', 'cited_references'],
  };
}

/** Per-capability strict output contract. */
export function buildAdvisorySchema(useCaseCode: PlanningUseCaseCode, allowedCodes: string[]) {
  const citedItem = (props: Record<string, unknown>, required: string[]) => ({
    type: 'object',
    additionalProperties: false,
    properties: { ...props, cited_references: strArray },
    required: [...required, 'cited_references'],
  });

  switch (useCaseCode) {
    case 'ATTENTION_SUMMARY':
      return base({
        summary: str,
        what_the_records_show: strArray,
        why_it_may_merit_attention: strArray,
        not_evidenced: strArray,
      }, ['summary', 'what_the_records_show', 'why_it_may_merit_attention', 'not_evidenced']);

    case 'PLANNING_RECORDS_TO_REVIEW':
      return base({
        records: {
          type: 'array',
          items: citedItem({ reference: str, why: str, what_it_may_show: str }, ['reference', 'why', 'what_it_may_show']),
        },
      }, ['records']);

    case 'PLANNING_QUESTIONS':
      return base({
        questions: {
          type: 'array',
          items: citedItem({ question: str, purpose: str }, ['question', 'purpose']),
        },
      }, ['questions']);

    case 'INTERVENTION_OPTIONS':
      return base({
        options: {
          type: 'array',
          items: citedItem({
            catalogue_code: allowedCodes.length > 0 ? { type: 'string', enum: allowedCodes } : str,
            why_the_facts_may_support_it: str,
            what_it_would_establish: str,
          }, ['catalogue_code', 'why_the_facts_may_support_it', 'what_it_would_establish']),
        },
      }, ['options']);

    case 'SUPERVISORY_PLAN_DRAFT':
      return base({
        draft_objective: str,
        draft_scope: str,
        suggested_milestones: {
          type: 'array',
          items: citedItem({ title: str, purpose: str }, ['title', 'purpose']),
        },
        considerations: strArray,
      }, ['draft_objective', 'draft_scope', 'suggested_milestones', 'considerations']);

    case 'FOLLOWUP_CONSIDERATIONS':
    default:
      return base({
        considerations: {
          type: 'array',
          items: citedItem({ matter: str, why: str }, ['matter', 'why']),
        },
        suggested_reassessment_focus: strArray,
      }, ['considerations', 'suggested_reassessment_focus']);
  }
}

/** Content the caller must have received for the generation to be usable. */
export function outputIsComplete(useCaseCode: PlanningUseCaseCode, output: Record<string, unknown>): boolean {
  const nonEmpty = (k: string) => Array.isArray(output[k]) && (output[k] as unknown[]).length > 0;
  switch (useCaseCode) {
    case 'ATTENTION_SUMMARY': return String(output.summary ?? '').trim().length > 0;
    case 'PLANNING_RECORDS_TO_REVIEW': return nonEmpty('records');
    case 'PLANNING_QUESTIONS': return nonEmpty('questions');
    case 'INTERVENTION_OPTIONS': return nonEmpty('options');
    case 'SUPERVISORY_PLAN_DRAFT': return String(output.draft_objective ?? '').trim().length > 0;
    case 'FOLLOWUP_CONSIDERATIONS': return nonEmpty('considerations');
    default: return false;
  }
}
