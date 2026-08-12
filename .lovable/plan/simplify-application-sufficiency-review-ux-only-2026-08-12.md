# Simplify Application Sufficiency Review (UX only)

Rework the Sufficiency Review card on the Admin Application Detail screen so a non-technical reviewer reads it as: automated checks → resolve issues → reviewer decision. No backend rules, workflow, RBAC/RLS, audit or RFI logic changes.

## What changes on screen

**Header — "Application completeness & sufficiency"**
- Automated checks summary: counts as "10 Passed · 2 Need attention · 1 Blocking issue", plus "Last checked: 12 Aug 2026, 1:20 PM".
- One outcome sentence driven by real counts: no blockers / N blocking issues must be resolved / no blockers but N items need attention.
- Primary button: "Run automated checks" when no evaluation exists, "Run checks again" afterwards, with helper text: "Run the checks again if the applicant has provided new information or documents since the last check."

**Reviewer determination — a visually separate block below**
- Current determination shown prominently: Sufficient / Insufficient / Deferred in words, rationale, "Recorded by <name>" and date-time (uses existing display-name hook and `formatDateTime`).
- If none: "No sufficiency determination has been recorded." + "Record sufficiency decision".
- Previous determinations collapsed behind "Previous determinations (N) — View history"; nothing deleted.
- Automated status is never rendered as the final determination badge.

**Stale-determination notice (informational only)**
- When the latest evaluation timestamp is after the latest determination timestamp: "Review recommended — Automated checks have been updated since the last sufficiency determination." No new gate, no automatic status/workflow change.

**Findings list replaces the rule table**
- Each finding: plain-language icon + rule name as the headline, and a readable sentence from the existing detail message (never `JSON.stringify`).
- Status wording: pass → Passed, warning → Needs attention, fail → Not satisfied, blocker severity → Blocking issue; unknown values fall back to a title-cased label. Stored values unchanged.
- Per-finding actions, permission-gated exactly as today: "Request information" (opens existing RFI dialog pre-filled for that finding) and "Accept exception".
- An accepted exception renders as "Needs attention — exception accepted" with "View reason", never as a plain Passed.
- Rule code, rule type, trigger source and raw evaluation JSON move into a collapsible "Technical details" per finding.

**Renames (labels only)**
- "Re-evaluate" → "Run checks again"; "Run Evaluation" → "Run automated checks"; "Override" → "Accept exception"; "Create RFI from Failed Rules (N)" → "Request missing information (N)"; "Record determination" → "Record sufficiency decision".

**Dialogs**
- Accept exception: explains the check has not passed, mandatory reason (same minimum length and audit write as today), buttons Cancel / Accept exception.
- Record sufficiency decision: opening note "This is the reviewer's formal sufficiency decision. Automated checks support this decision but do not make it.", checklist unchanged, three labelled options with one-line descriptions, rationale field with counter.
- Server rejection is translated into "Sufficiency cannot be recorded yet" plus a readable bullet list built from the counts the RPC already returns (blocking issues, open information requests). Internal codes such as `SUFFICIENCY_GATES_UNMET` are no longer surfaced.

**States and reliability**
- Loading: "Loading sufficiency checks…"; error: "Sufficiency checks could not be loaded. [Try again]"; empty: "Automated checks have not been run yet."
- Query errors are no longer collapsed into "No rule results" / zero counts.
- A failed re-run keeps the previous successful evaluation visible with "Checks could not be updated — the previous successful evaluation is still shown below. [Try again]" and its timestamp.
- After a successful run, evaluation / results / overrides / RFI queries are invalidated together and results are only rendered once they belong to the new evaluation id, so stale rows never appear under a new check.

## Technical notes

- Single file rewrite of `src/components/applications/SufficiencyPanel.tsx`, plus a small `src/lib/licensing/sufficiencyLabels.ts` for status/severity/decision wording and outcome sentences.
- Keep the existing `evaluate-application-sufficiency` invocation body and the `record_sufficiency_determination` RPC path (`useSufficiencyDetermination`) untouched; keep `sufficiency_overrides` insert + `logAction` audit write as-is.
- Query keys keep their current shape; `sufficiency_results`/`sufficiency_overrides` gain `error`/`isLoading` handling and are keyed strictly on the current evaluation id.
- All existing `data-rbac` attributes stay on their buttons; authorization continues to be enforced server-side.
- Timestamps via `formatDateTime`, reviewer names via `useUserDisplayNames`.
- Unit tests for the label/outcome helpers.

## Out of scope

Approval workflow admin, workflow definitions/steps/actions/matrices/role mappings, application lifecycle statuses, sufficiency rule definitions and server-side gates, RFI workflow internals, AI assessment panel.
