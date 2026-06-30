Scope: `src/components/applications/DecisionReadySummary.tsx` only, inside `DecisionReportBlock`. No edge function, DB, AI prompt, workflow, status, or other UI changes. The separate `ApplicationAiAssessmentPanel` accept/override flow is untouched.

Changes inside `DecisionReportBlock`:

1. Derive `hasRecommendation = recommended && RECOMMENDED_ACTION_LABEL[recommended]` (only the five known actions count as valid).
2. Remove the entire "Analyst controls" block (the `border-t pt-3` div containing the Accept button, override `Select`, Override button, the "already decided" Change row, and the `OverrideJustificationDialog`). Also remove the now-unused `overrideOpen`, `overrideAction`, `saving`, `saveDecision`, `logAudit`, `OverrideJustificationDialog`, and `Select*` imports if no other usage remains in this file. Keep `onChange` prop signature unchanged (still passed by parent) but stop calling it.
3. Replace the header `Recommended: X` badge and add a guidance row directly under the "AI advisory only" alert:
   - If `hasRecommendation`: render a single line `Suggested action: <label>` styled as guidance (badge + text), followed by the existing "This is advisory only. Take the final action from the Workflow panel." reminder.
   - If not (`!hasRecommendation`): hide the recommendation badge and show:
     "No decision-ready recommendation is available for this assessment. Regenerate the AI Analyst Assessment to get a suggested next action."
4. Keep the rest of the section unchanged: executive summary, rationale, suggested conditions/questions, escalation/rejection rationale, section-wise findings, top risks, compliance concerns, missing information, suggested next workflow action, confidence/prompt badges.
5. The pre-existing "generated before decision-ready report was available" message stays for the `!hasReport` branch.

Verification: `bunx tsgo --noEmit` (or rely on harness typecheck) and visually confirm on `/applications/...`:
- Old assessment (no `decision_report.recommended_action`) shows the new regenerate message and no Accept/Override/Select controls.
- New assessment with valid `recommended_action` shows `Suggested action: <label>` plus advisory reminder, and no Accept/Override/Select controls.
- AI Analyst Assessment panel above is unchanged.