# Sufficiency Review — reliability & state-consistency pass

No redesign. Same screen, same wording, same backend. This closes the remaining gaps where a failed or in-flight query can be read by the reviewer as a successful empty result, and where data from two different evaluations can appear together.

## 1. Accepted exceptions get explicit states

Today the exceptions query silently defaults to an empty list, so a failed load looks identical to "no exceptions accepted".

- Track exceptions as one of: loading / error / loaded / empty.
- On failure show, above the findings list:
  "Exception status unavailable — Accepted exceptions could not be loaded. Some findings may already have a recorded exception." with a **Try again** button that refetches only that query.
- While the state is loading or failed, hide/disable **Accept exception** per finding with helper text "Checking whether an exception has already been recorded…". This prevents a duplicate exception created because of a frontend load failure.
- Findings, counts and the reviewer determination block stay visible throughout.
- When an exception exists it keeps reading "Not satisfied / Needs attention — exception accepted", never plain "Passed".
- The exceptions query is also enabled whenever the evaluation has results, rather than being skipped in edge cases, so its state is always known.

## 2. Evaluation ID as the single consistency boundary

- Findings and exceptions are keyed strictly on the current evaluation id; exceptions are keyed on both the evaluation id and the finding ids they were fetched for.
- After **Run checks again**, while the new evaluation's findings/exceptions are still loading, show "Updating sufficiency findings…" instead of rendering new summary counts beside old findings.
- The previous successful evaluation is not cleared while the backend evaluation is still running.
- Nothing renders as "current" until evaluation, findings and exception state all belong to the same evaluation id.

## 3. No query error becomes a zero

Audited across the panel: latest evaluation, findings, exceptions, determination history.

- Latest evaluation fails → "Sufficiency checks could not be loaded" + Try again (never "checks have not been run yet").
- Findings fail → "Sufficiency findings could not be loaded" + Try again (never "No findings"), and evaluation counts are not used to imply findings are available.
- Determination history fails → explicit error + Try again, never "No sufficiency determination has been recorded".
- Failed rerun keeps the previous successful evaluation with its timestamp and a Try again, exactly as today.

## 4. Safe stale-determination warning

"Review recommended" only shows when both timestamps parse to valid dates and the evaluation is genuinely newer. Invalid, null or unparseable timestamps omit the warning rather than guessing. Purely informational — no status, workflow or determination change.

## 5. Duplicate-action protection

- **Run checks again**, **Accept exception**, **Record sufficiency decision** and the RFI submit path each disable while their mutation is in flight and show a progress state.
- **Accept exception** is also blocked when an exception already exists for the finding or when exception state is unknown.
- **Request information**: only current-evaluation failed/warning findings are passed to the dialog; findings that already carry `auto_rfi_item_id` (or an existing RFI link) are excluded from the bulk request so the same finding cannot generate a duplicate request. Passed and unrelated findings are never included.

## 6. Graceful fallbacks

- Reviewer display-name lookup failure falls back to "Reviewer" instead of breaking the section or surfacing a raw error.
- Unknown status / severity / rule type / detail shapes fall back to existing safe business labels — no crash, no raw `JSON.stringify` in the primary description. Raw values stay inside "Technical details".

## 7. Explicitly unchanged

Admin Approval Workflow (definitions, steps, actions, routing, matrices, role mappings), application lifecycle statuses, sufficiency rules and server-side gates, the deterministic `evaluate-application-sufficiency` function, RFI data model and workflow, RBAC, RLS, audit, AI assessment. Frontend disabling remains UX only; the server stays authoritative.

## Technical notes

- Changes are confined to `src/components/applications/SufficiencyPanel.tsx` and small additions to `src/lib/licensing/sufficiencyLabels.ts` (safe timestamp comparison helper, exception-state wording).
- React Query: keep existing key shapes; add `isLoading`/`isError`/`refetch` handling for `sufficiency_overrides` and `sufficiency_determinations`; invalidate `sufficiency_latest`, `sufficiency_results`, `sufficiency_overrides`, `application_rfis` together after a run and gate rendering on matching evaluation id.
- Existing `record_sufficiency_determination` RPC path, `sufficiency_overrides` insert + `logAction` audit write, and all `data-rbac` attributes stay as-is.
- Unit tests for the new timestamp-comparison and label fallbacks in `src/test/sufficiencyLabels.test.ts`.

## Verification

Walk the 13 regression scenarios in the request against the running preview, including forced failure of the findings and exceptions queries, a failed rerun, an exception accepted then page-refreshed, and Sufficient / Insufficient / Deferred determinations with history ordering.
