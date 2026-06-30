Scope: `src/components/applications/DecisionReadySummary.tsx` only. No backend/AI/workflow changes.

## Changes

### 1. Remove three sections (UI only, data untouched)
- Delete the **RFIs & Responses** section (lines ~447–486).
- Delete the **Notes & Remarks** section (lines ~488–511).
- Delete the **Submitted Responses** section (lines ~513–544), including the `View full responses` button.
- Remove now-unused helpers: `rfiEntries`, `noteEntries`, `RFI_ACTIONS`, `RESPONSE_ACTIONS`, the `events` and `templateNames` derivations inside the component (props kept in the interface to avoid touching the parent — `onJumpToFormsTab`, `templateNames`, `events` remain on the `Props` type, just unused).
- Remove `formTemplateIds` / `formsData` reads since they were only used by Submitted Responses (the AI/Risk flags `Forms: {formTemplateIds.length}` badge stays — keep `formTemplateIds` for that single use).

### 2. Broader suggested-action resolution in `DecisionReportBlock`
Expand `RECOMMENDED_ACTION_LABEL` map to include all required friendly labels:
```
approve, approve_with_conditions, request_more_information, request_more_info,
escalate, reject, review_for_rejection, reject_review, continue_review,
standard_review, senior_analyst, enhanced_due_diligence
```

Replace the current `recommended` derivation with a priority resolver:
1. `assessment.decision_report.recommended_action`
2. `assessment.routing_recommendation.recommended_action`
3. `assessment.routing_recommendation.recommended_route`

Normalize to lowercase and look up the label. `hasRecommendation` = label found.

- If recommendation found: keep the existing prominent "Suggested next action: <Label>" row at top + advisory note ("This is AI guidance only. Take the final action from the Workflow panel.").
- If not: show "No suggested next action is available. Regenerate the AI Analyst Assessment to get an updated recommendation."

### 3. Constraints preserved
- No Accept / Override / dropdown controls (already removed previously).
- Existing report body (executive summary, rationale, conditions, questions, escalation/rejection rationale, sections, risks, compliance, missing info, next workflow action, confidence/prompt badges) is unchanged.
- Conditions/questions/escalation/rejection rendering remains keyed off `recommended` value but will simply not show for the new routing-only values — acceptable since the underlying `decision_report` fields are absent in those cases.

## Verification
- `bunx tsgo --noEmit` passes.
- Visually: old assessment with only `routing_recommendation` shows a friendly "Suggested next action"; new assessment with `decision_report.recommended_action` still shows correctly; the three removed sections are gone.
