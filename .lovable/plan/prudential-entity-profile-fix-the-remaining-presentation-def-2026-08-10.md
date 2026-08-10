# Prudential Entity Profile — fix the remaining presentation defects

Verified by walking every tab of `/prudential/entities/:id` in the running app and checking the underlying data.

## What is wrong today (observed)

1. **Raw database codes shown to supervisors instead of labels**
   - Historical Returns status column shows `WIP`, `SUB`, `VAL` instead of Draft / Submitted / Validated.
   - Actions tab shows `capital_plan`, `information_request`, severity `medium`, status `waived` in raw snake_case/lowercase.
   - Escalations tab shows `senior_supervisor_review`, `resolved` raw.
   - Stress Events shows metric keys `roa`, `pdl_ratio`, `debt_to_equity` and lowercase severity.
   - Audit History shows `prudential_assessment` / `CREATE` raw, and the **Actor column shows a truncated user id (`6d4f5483`) instead of the person's name**.

2. **Unformatted numbers.** Stress Events "Observed" prints `0.008223557507125799` and `7.409834472482265` — no rounding, no unit, while the same metrics are formatted elsewhere.

3. **Inconsistent date formatting.** Period end is a raw ISO string, "Submitted"/"Decided"/"Triggered" use date-only `toLocaleDateString`, Audit uses full date+time. Project standard is the shared `formatDateTime` / `formatDateOnly` helpers.

4. **Overview cards mislead.**
   - "Latest return" shows a `WIP` draft (2026-12-31) — the supervisory view should lead with the latest *submitted/validated* return, and label the draft separately.
   - "Latest rating" shows `—` / `draft` because it takes `assessments[0]` regardless of state, even though a submitted assessment rated "1 - Strong" exists.
   - "Worst breach" shows only the word Breach with no context (which metric, which period).

5. **Breaches tab is unreadable at volume.** 65 rows for one year with the same metric repeated per return and **no period column**, so identical-looking duplicate lines appear. Each row also carries Create action / Escalate buttons with no indication of the source return.

6. **Broken drill-through target.** The ratio drawer links the source return to `/admin/returns/queue/:id` while the Returns tab links to `/returns-management/:id`; the two paths are not equivalent for every persona. Use one route consistently.

7. **Invalid DOM in the header** — a `Badge` (`div`) is rendered inside a `<p>`, producing a React `validateDOMNesting` console error on every load.

8. **Group Structure tab** prints raw relationship tokens (`branch`, `full consolidation`) and shows "10.00% owned" for a branch without labelling the field.

## What will change (presentation only)

### Shared label helpers
- Extend the prudential presentation layer with small label maps (in `src/lib/prudentialLabels.ts`): return workflow status, action type/status/severity, escalation type/status, audit object type/action, group relationship + consolidation method. Reuse `mapReturnWorkflowStatus` vocabulary where it already exists rather than inventing a second one.
- Reuse `severityLabel` / `severityTone` from `src/lib/prudentialSeverity.ts` for every severity chip, including stress events, so tones stop falling back to grey.
- Reuse `formatDateTime` / `formatDateOnly` from `src/lib/datetime.ts` for every date cell.
- Number formatting: route stress-event observed values through the existing `formatRatio` using the metric's configured display format, falling back to 4 significant decimals.

### Overview
- "Latest submitted return" uses the newest return in a submitted/validated state, with a secondary line for the open draft period.
- "Latest rating" uses the newest assessment that is submitted/reviewed/approved; drafts are shown as "draft in progress" instead of `—`.
- "Worst breach" badge gains the metric label and period of that worst breach.

### Breaches tab
- Add a **Period** column (source return period end) and show the return reference, so repeated metrics are distinguishable.
- Sort by period desc then severity, and de-duplicate identical metric+period+threshold rows into a single row with an occurrence count.

### Stress events, actions, escalations, audit
- All type/status/severity cells render mapped labels with the semantic tone classes; observed values formatted; dates via the shared helpers.
- Audit "Actor" resolves to the actor's display name (same resolution path the existing audit timeline components use), falling back to "Unknown user" — no raw ids.

### Header & drill-through
- Fix the header markup so badges are not nested inside a paragraph (clears the console error).
- Point the ratio drawer's "Open return" at the same route the Returns tab uses.

### Group tab
- Label the relationship, ownership and consolidation method fields and render mapped labels.

## Not in scope / noted for you

The `debt_to_equity` breach shows `100.00%` vs `80.00%` because that ratio is **configured** with `display_format = percent` in the ratio config although it is a multiple (7.4x elsewhere). That is a configuration data issue, not a UI bug — fixing it means editing the ratio definition in Prudential config, which I have not touched. Say the word and I will correct the ratio's display format too.

No schema, RLS, or calculation changes; this is entirely frontend presentation.

## Verification
- Typecheck, plus a Playwright pass over all 13 tabs at 1010px confirming: no raw snake_case tokens, no bare uuid actor, formatted numbers/dates, period column on breaches, and a clean console with no DOM-nesting warning.
