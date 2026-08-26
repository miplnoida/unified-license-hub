// MC-09 — Versioned instruction templates for the five approved cross-entity
// supervisory intelligence capabilities.
//
// The template version recorded against every advisory item comes from
// `conduct_ai_use_cases.prompt_template_version`; the text below is the body for
// that version. Changing the wording REQUIRES bumping the registered version,
// otherwise stored provenance stops being truthful.

export type IntelUseCaseCode =
  | 'CROSS_ENTITY_INTERPRETATION'
  | 'THEME_MATERIAL_CHANGE'
  | 'SECTOR_SUPERVISORY_QUESTIONS'
  | 'EMERGING_RISK_NARRATIVE'
  | 'EMERGING_RISK_HYPOTHESIS';

export const INTEL_USE_CASE_CODES: IntelUseCaseCode[] = [
  'CROSS_ENTITY_INTERPRETATION',
  'THEME_MATERIAL_CHANGE',
  'SECTOR_SUPERVISORY_QUESTIONS',
  'EMERGING_RISK_NARRATIVE',
  'EMERGING_RISK_HYPOTHESIS',
];

/** Governance clauses that apply to every capability, in every version. */
const COMMON_RULES = `
You are an advisory drafting assistant for a financial services regulator's
market-conduct supervision team, working on cross-entity supervisory
intelligence. You are NOT a decision maker.

ABSOLUTE RULES
1. Your ONLY permitted information source is the cross-entity intelligence
   context supplied in this request. You have no database access, no tools and no
   web access. If the context does not contain something, you do not know it.
2. You must NEVER decide, rate, grade, rank, confirm, dismiss, escalate,
   instruct or conclude. You do not set risk ratings or severities, do not
   confirm or close an emerging risk, do not name an entity as an outlier,
   offender or poor performer, and do not propose enforcement. You describe,
   summarise, suggest and ask.
3. Every material statement must cite at least one reference from
   "permitted_source_references", exactly as written there. Never invent,
   reformat, guess or extrapolate a reference. If you cannot cite a supplied
   reference for a statement, do not make the statement.
4. Entity comparison in the context is POSITIONAL ONLY (counts against a sector
   median and upper quartile). It is not a rating, score, finding or judgement,
   and you must say so whenever you refer to it.
5. Use plain professional supervisory English. No legal conclusions, no
   allegations of wrongdoing, no statements about individuals.
6. State your confidence between 0 and 1, what you are uncertain about, and the
   limitations of your advice. Be candid when the data is thin.
7. Where the context is empty or immaterial, say so plainly with low confidence
   rather than manufacturing content.
`.trim();

const USE_CASE_RULES: Record<IntelUseCaseCode, string> = {
  CROSS_ENTITY_INTERPRETATION: `
TASK — Cross-entity interpretation.
Describe the recorded conduct position for this theme across the entities in
scope for the stated window: recorded complaint volume, how it is distributed
across entities, related conduct signals and detected patterns. Produce 2-5
sections, each with a short heading and a few sentences. Do not rank entities,
do not label any entity as an outlier and do not offer a sector verdict.
`.trim(),

  THEME_MATERIAL_CHANGE: `
TASK — Theme movement explanation.
Explain what moved between the current window and the preceding comparison
window, using only the movement measures and section counts in the context.
Describe the movement, its size and where it is concentrated. You may note what
in the supplied records coincides with the movement, but you must not assert
causation, and you must say explicitly that cause is not established.
`.trim(),

  SECTOR_SUPERVISORY_QUESTIONS: `
TASK — Sector supervisory questions.
Return ONLY proposed questions a supervisor may consider putting to entities in
scope of this theme, each grounded in cited records. Do not answer the
questions, do not summarise the sector position, and do not draft any
correspondence or information request.
Use the "questions" array. Keep "sections", "records" and "hypotheses" empty.
`.trim(),

  EMERGING_RISK_NARRATIVE: `
TASK — Emerging risk narrative.
Summarise the facts recorded against this emerging conduct risk: its stated
basis, the linked records, the affected entities, the theme facts for the window
and the supervisory assessments already recorded. Produce 2-5 sections. Do not
propose a status change, a severity, a systemic-potential rating or a closure —
those are supervisory decisions recorded elsewhere.
`.trim(),

  EMERGING_RISK_HYPOTHESIS: `
TASK — Emerging risk hypothesis.
Propose at most three possible explanations a supervisor could TEST against the
supplied records. Every hypothesis must be worded as a hypothesis and must state
what evidence in the context would support it and what would disconfirm it.
Begin the advisory text by stating clearly that this is a hypothesis to be
tested, and is not a risk rating, finding, conclusion or decision.
Use the "hypotheses" array. Keep "records" and "questions" empty.
`.trim(),
};

export interface GovernedInstruction {
  instruction_body?: string | null;
  instruction_template_code?: string | null;
  instruction_version?: string | null;
  prohibited_behaviours?: string[] | null;
  required_caveats?: string[] | null;
  advisory_classification?: string | null;
}

export function buildSystemPrompt(
  code: IntelUseCaseCode,
  useCase: Record<string, unknown>,
  governance?: GovernedInstruction,
): string {
  const allowed = Array.isArray(useCase.allowed_output_classes) ? useCase.allowed_output_classes.join(', ') : '';
  const prohibited = Array.isArray(useCase.prohibited_output_classes) ? useCase.prohibited_output_classes.join(', ') : '';
  // The governed instruction body registered in the AI instruction register is
  // authoritative for the common clauses; the code template is the fallback for
  // the exact version, and the per-capability task text is always server-held.
  const common = String(governance?.instruction_body ?? '').trim() || COMMON_RULES;
  const govProhibited = (governance?.prohibited_behaviours ?? []).filter(Boolean).join(', ');
  const caveats = (governance?.required_caveats ?? []).filter(Boolean);
  return [
    common,
    USE_CASE_RULES[code],
    `GOVERNANCE\nGovernance level: ${String(useCase.governance_level ?? '')}. Human review is mandatory.`
      + (governance?.advisory_classification ? `\nAdvisory classification: ${governance.advisory_classification}.` : ''),
    `Permitted output classes: ${allowed}.\nProhibited output classes: ${prohibited}.`,
    govProhibited ? `Institutionally prohibited behaviours: ${govProhibited}.` : '',
    caveats.length
      ? `Caveats that must appear in your limitations:\n${caveats.map((c) => `- ${c}`).join('\n')}`
      : `Standing limitation that applies to your output: ${String(useCase.limitation_policy ?? '')}`,
    `Instruction version: ${String(governance?.instruction_template_code ?? useCase.prompt_template_code ?? '')}`
      + ` ${String(governance?.instruction_version ?? useCase.prompt_template_version ?? '')}.`,
  ].filter(Boolean).join('\n\n');
}

export function buildUserPrompt(context: Record<string, unknown>): string {
  // Only the governed context is sent: scoped cross-entity facts, permitted
  // references and the window. Nothing else about the platform is disclosed.
  const payload = {
    subject: context.subject ?? null,
    window: context.window ?? null,
    permitted_source_references: context.permitted_source_references ?? [],
    cross_entity_facts: context.snapshot ?? {},
  };
  return [
    'Cross-entity supervisory intelligence governed context (facts only — the sole source you may use):',
    '```json',
    JSON.stringify(payload),
    '```',
    'Return the structured advisory object as specified. Cite only references from permitted_source_references.',
  ].join('\n');
}

/** Strict JSON schema for advisory output. Identical across capabilities so the review UI stays uniform. */
export const ADVISORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'use_case', 'advisory_text', 'sections', 'records', 'questions', 'hypotheses',
    'cited_references', 'confidence', 'uncertainty', 'limitations',
  ],
  properties: {
    use_case: { type: 'string', enum: INTEL_USE_CASE_CODES },
    advisory_text: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body', 'cited_references'],
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
          cited_references: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    records: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['reference', 'reason_to_review'],
        properties: {
          reference: { type: 'string' },
          reason_to_review: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'cited_references'],
        properties: {
          question: { type: 'string' },
          cited_references: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hypothesis', 'supporting_observations', 'what_would_disconfirm', 'cited_references'],
        properties: {
          hypothesis: { type: 'string' },
          supporting_observations: { type: 'string' },
          what_would_disconfirm: { type: 'string' },
          cited_references: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    cited_references: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    uncertainty: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' } },
  },
} as const;
