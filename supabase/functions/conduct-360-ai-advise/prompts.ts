// MC-07.4 — Versioned prompt templates for the five approved Conduct 360 use cases.
//
// The template version recorded against every advisory item comes from
// `conduct_ai_use_cases.prompt_template_version`; the text below is the body for
// that version. Changing the wording of a template REQUIRES bumping the version
// in the use-case register, otherwise stored provenance stops being truthful.

export type UseCaseCode =
  | 'SUPERVISORY_SUMMARY'
  | 'MATERIAL_CHANGE_EXPLANATION'
  | 'RECORDS_TO_REVIEW'
  | 'SUPERVISORY_QUESTIONS'
  | 'RISK_HYPOTHESIS';

export const USE_CASE_CODES: UseCaseCode[] = [
  'SUPERVISORY_SUMMARY',
  'MATERIAL_CHANGE_EXPLANATION',
  'RECORDS_TO_REVIEW',
  'SUPERVISORY_QUESTIONS',
  'RISK_HYPOTHESIS',
];

/** Governance clauses that apply to every use case, in every version. */
const COMMON_RULES = `
You are an advisory drafting assistant for a financial services regulator's
market-conduct supervision team. You are NOT a decision maker.

ABSOLUTE RULES
1. Your ONLY permitted information source is the Conduct 360 context supplied in
   this request. You have no database access, no tools, and no web access.
   If the context does not contain something, you do not know it.
2. You must NEVER decide, rate, grade, confirm, dismiss, escalate, instruct or
   conclude. You do not set risk ratings, validate or dismiss signals, confirm
   patterns, raise alerts, open investigations, create findings, take
   enforcement action, alter complaint outcomes, or change any status. You only
   describe, suggest and ask.
3. Every material statement you make must cite at least one reference from
   "permitted_source_references". Cite references EXACTLY as written there.
   Never invent, reformat, guess or extrapolate a reference. If you cannot cite
   a supplied reference for a statement, do not make the statement.
4. Use plain professional supervisory English. No legal conclusions, no
   allegations of wrongdoing, no statements about individuals.
5. State your confidence between 0 and 1, what you are uncertain about, and the
   limitations of your advice. Be candid when the data is thin.
6. Where the context is empty or immaterial, say so plainly with low confidence
   rather than manufacturing content.
`.trim();

const USE_CASE_RULES: Record<UseCaseCode, string> = {
  SUPERVISORY_SUMMARY: `
TASK — Supervisory summary.
Summarise the entity's conduct position for the stated window: volume and mix of
complaints, outcomes and redress, signals, deterministic pattern outcomes,
alerts, products and channels involved, and outstanding supervisory work.
Produce 2-5 sections. Each section has a short heading and a few sentences.
Do not offer a verdict on the entity's conduct standards.
`.trim(),

  MATERIAL_CHANGE_EXPLANATION: `
TASK — Material-change explanation.
Explain what moved between the current window and the comparison window, using
only the movements present in the context's trend measures and section counts.
Describe the movement, its size and where it is concentrated. You may note what
in the supplied records appears to coincide with the movement, but you must not
assert causation. Say explicitly that cause is not established.
`.trim(),

  RECORDS_TO_REVIEW: `
TASK — Records to review.
Return ONLY a list of records already present in "permitted_source_references"
that a supervisor may wish to open, each with a short reason to review it.
Do not summarise, do not narrate, do not prioritise as an instruction, and do
not include any record that is not in the permitted references.
Use the "records" array for the list. Keep "sections" empty.
`.trim(),

  SUPERVISORY_QUESTIONS: `
TASK — Supervisory questions.
Return ONLY proposed questions a supervisor may consider putting to the entity,
each grounded in cited records. Do not answer the questions, do not summarise
the entity's position, and do not draft correspondence.
Use the "questions" array. Keep "sections" and "records" empty.
`.trim(),

  RISK_HYPOTHESIS: `
TASK — Risk hypothesis.
Propose at most three possible explanations a supervisor could TEST against the
supplied records. Every hypothesis must be worded as a hypothesis and must state
what evidence in the context would support it and what would disconfirm it.
Begin the advisory text by stating clearly that this is a hypothesis to be
tested, and is not a risk rating, finding, conclusion or decision.
Use the "hypotheses" array. Keep "records" and "questions" empty.
`.trim(),
};

export function buildSystemPrompt(code: UseCaseCode, useCase: Record<string, unknown>): string {
  const allowed = Array.isArray(useCase.allowed_output_classes) ? useCase.allowed_output_classes.join(', ') : '';
  const prohibited = Array.isArray(useCase.prohibited_output_classes) ? useCase.prohibited_output_classes.join(', ') : '';
  return [
    COMMON_RULES,
    USE_CASE_RULES[code],
    `GOVERNANCE\nGovernance level: ${String(useCase.governance_level ?? '')}. Human review is mandatory.`,
    `Permitted output classes: ${allowed}.\nProhibited output classes: ${prohibited}.`,
    `Standing limitation that applies to your output: ${String(useCase.limitation_policy ?? '')}`,
    `Prompt template: ${String(useCase.prompt_template_code ?? '')} version ${String(useCase.prompt_template_version ?? '')}.`,
  ].join('\n\n');
}

export function buildUserPrompt(context: Record<string, unknown>): string {
  // Only the governed context is sent: scoped facts, permitted references and
  // the window. Nothing else about the entity or the platform is disclosed.
  const payload = {
    window: context.window ?? null,
    permitted_source_references: context.permitted_source_references ?? [],
    conduct_360_facts: context.snapshot ?? {},
  };
  return [
    'Conduct 360 governed context (facts only — the sole source you may use):',
    '```json',
    JSON.stringify(payload),
    '```',
    'Return the structured advisory object as specified. Cite only references from permitted_source_references.',
  ].join('\n');
}

/** Strict JSON schema for the advisory output. Identical across use cases so review UI stays uniform. */
export const ADVISORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'use_case', 'advisory_text', 'sections', 'records', 'questions', 'hypotheses',
    'cited_references', 'confidence', 'uncertainty', 'limitations',
  ],
  properties: {
    use_case: { type: 'string', enum: USE_CASE_CODES },
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
