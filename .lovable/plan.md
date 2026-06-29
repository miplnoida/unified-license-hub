
## Status assessment

After reviewing the codebase, the AI Analyst Review + Decision-Ready Summary feature is **largely in place**:

- **Migration** (`20260629131505_*.sql`): adds `sections`, `decision_report`, `analyst_decision`, `analyst_decision_action`, `analyst_justification`, `analyst_decision_by`, `analyst_decision_at` — additive, `IF NOT EXISTS`, safe defaults.
- **Edge function** (`generate-application-ai-assessment/index.ts`): `PROMPT_VERSION = v2`, includes `SECTION_KEYS`, generates `sections[]` + `decision_report{}` (executive summary, recommended_action, rationale, conditions, questions, escalation/rejection rationale, top_risks, compliance_concerns, suggested_next_workflow_action), persists both.
- **Frontend AI panel** (`ApplicationAiAssessmentPanel.tsx`): renders section-wise cards with status, risk, observations, evidence, suggested action; falls back to legacy findings.
- **Frontend Decision-Ready Summary** (`DecisionReadySummary.tsx`): `DecisionReportBlock` is defined (line 572), renders recommended-action badge, confidence, exec summary, rationale, conditions/questions/escalation/rejection, section-wise findings, top risks, compliance, missing info, suggested next workflow action. Analyst Accept / Override + justification dialog + audit log via `logAudit` are wired.

## Outstanding work

1. **Runtime error "`DecisionReportBlock is not defined`"** — the symbol is now defined in the same module, so this is a stale HMR error from the earlier turn when it was referenced before being added. Trigger a fresh build/restart and re-open the page to confirm it clears. If it persists, the only plausible cause is a transient parse failure: re-view the file end-to-end and fix.

2. **Verification pass (no claim of "complete" until all pass):**
   - TypeScript build (`tsgo --noEmit`) passes.
   - Deploy edge function `generate-application-ai-assessment` and run it against a real application via the Regenerate button.
   - DB read confirms `sections` + `decision_report` populated and `analyst_decision_*` round-trips on Accept and Override.
   - Audit log row created on both Accept and Override.
   - Playwright smoke on `/applications/<id>`:
     - normal complete application — section cards + recommended-action badge render
     - missing-documents application — `missing_information` and `missing_info` section status surface
     - high-risk application — `high_risk` status and `top_risks` render; recommended_action skews to escalate/reject
     - application with RFI history — RFI pairs render unchanged; AI rationale references them
     - application with no AI assessment — fallback CTA renders, no crash
     - legacy assessment row (no `sections` / `decision_report`) — old findings + "Regenerate" fallback message render, no crash
   - Confirm Workflow panel, Payments, Documents, Forms, Approvals UIs are unchanged (no edits to those files in this iteration).

3. **No further code changes expected** unless verification surfaces a bug. If a test reveals a gap (e.g. legacy row crash, edge-function JSON shape drift, audit log not written) — fix it in place and re-run that scenario.

## Out of scope

- No changes to workflow state machine, approval, payment, document, or submission code.
- No removal/renaming of existing columns or fields.
- Final action authority stays in the Workflow panel; AI Accept/Override only records analyst position + audit row.

## Technical notes

- Migration is `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` only — re-runnable, no data loss.
- Edge function writes both legacy fields (`findings`, `risks`, `routing_recommendation`) and new fields, so old UI paths keep working.
- `DecisionReportBlock` gracefully handles `decision_report = {}` and `sections = []` (legacy rows) with a "Regenerate" prompt.
- Stale runtime error is resolved by a fresh Vite rebuild; no source edit needed unless re-verification still shows the error.
