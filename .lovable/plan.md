# Plan: Section-wise AI Analyst Review & Decision-Ready Report

## Scope

Enhance the AI assessment so it produces a **section-wise review** plus a **consolidated decision-ready report** with a recommended action, and let analysts **accept or override** the recommendation with a mandatory justification. Workflow / approval / payment / document / submission code stays untouched — the final action still happens in the Workflow panel.

## Data Model

Migration on `public.application_ai_assessments` — additive only, backward compatible:

- `sections jsonb NOT NULL DEFAULT '[]'::jsonb` — array of `{ key, label, status, risk_level, observations[], evidence[], suggested_action, links[] }`. `status ∈ pass | concern | missing_info | high_risk`.
- `decision_report jsonb NOT NULL DEFAULT '{}'::jsonb` — `{ executive_summary, recommended_action, rationale, suggested_conditions[], suggested_questions[], escalation_reason, rejection_rationale, top_risks[], compliance_concerns[], suggested_next_workflow_action }`. `recommended_action ∈ approve | approve_with_conditions | request_more_information | escalate | reject`.
- `analyst_decision text` (`accepted | overridden | null`), `analyst_decision_action text`, `analyst_justification text`, `analyst_decision_by uuid`, `analyst_decision_at timestamptz`.

Old rows render safely because new columns default to empty / null and UI checks for presence.

## Edge Function (`generate-application-ai-assessment`)

- Also load: `payments` (already), workflow `approval_actions` + `workflow_instances` (RFI / workflow history), and the same `submitted_forms` + `documents` already loaded.
- Build a richer `applicationContext` that explicitly tags sections: `application_details`, `submitted_forms` (grouped by template + section), `documents`, `fees_payment`, `rfi_history` (derived from `approval_actions`), `workflow_sla_history`, `compliance_notes`, `risk_indicators`.
- Update system prompt + JSON schema to require both `sections[]` and `decision_report{}` with the fields above, in addition to existing `summary / findings / risks / routing_recommendation / missing_information / confidence_score`.
- Bump `PROMPT_VERSION` to `v2`; keep `MODEL_NAME` = `google/gemini-2.5-flash`.
- On success, write `sections` and `decision_report` alongside existing fields. On parse failure keep current failure behavior.

## Frontend

**`ApplicationAiAssessmentPanel.tsx`** — render sections when present:
- For each section: status badge (color by `pass/concern/missing_info/high_risk`), risk level, observations, evidence, suggested analyst action, and links list (rendered as buttons that scroll to / switch to the relevant tab via existing `onJumpToFormsTab`-style props; documents link opens DocumentList tab).
- Fall back to current findings/risks view when `sections` is empty (old rows).
- Keep existing "Regenerate" button; show `prompt_version`, `model_name`, `generated_at`.

**`DecisionReadySummary.tsx`** — add a "Decision-Ready Report" block above the existing snapshot when `decision_report` exists:
- Big **Recommended Action** badge (color-coded), confidence score, executive summary, rationale.
- Section-wise mini-cards (reuses section data), top risks, missing info, compliance concerns, suggested next workflow action.
- AI-advisory warning banner (already present).
- **Analyst controls**:
  - "Accept recommendation" button → writes `analyst_decision='accepted'` (no justification required) + audit log via existing `logAudit`.
  - "Override recommendation" button → opens existing `OverrideJustificationDialog`; on confirm writes `analyst_decision='overridden'`, `analyst_justification`, `analyst_decision_action` (analyst-picked action), `analyst_decision_by`, `analyst_decision_at` + audit log.
  - Shows current accepted/overridden state with who/when.
- Explicit note that this does NOT change workflow status — analyst must still act in Workflow panel.

No changes to `WorkflowPanel`, payments, documents, submission, or routing.

## Regeneration

Existing "Regenerate" flow already re-invokes the edge function, which now reads latest forms / documents / payments / RFIs / workflow history each call. Stamp generated_at + prompt_version (already done).

## Test cases (manual, after deploy)

1. Normal complete application — sections all `pass`, recommended `approve` / `approve_with_conditions`.
2. App missing documents / required info — sections flag `missing_info`, recommended `request_more_information` with suggested_questions populated.
3. High-risk application — `high_risk` section status, recommended `escalate` or `reject` with rationale.
4. App with RFI / query history — RFI section populated from `approval_actions`.
5. App with no AI assessment — UI renders empty state, no crash.

## Acceptance

- Section-wise output rendered; old rows still render.
- Recommended action badge + rationale visible.
- Accept / override works, audit row written, no workflow status change.
- Workflow / payments / forms / documents pages unchanged.
