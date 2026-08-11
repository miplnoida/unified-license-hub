# Complaint Detail: reliability, truthful data states, and one readable history

Frontend/presentation work only. The configured Complaint Management Workflow, workflow steps/actions, RBAC and approval matrices stay untouched. No new backend aggregator; no data migration.

## Verified current problems

- `CommunicationTimeline` manages loading by hand with no `try/catch/finally` — any thrown exception (not a returned `rpcError`) leaves "Loading communications…" forever. It also has no Retry button on the error path (only a small refresh icon) and shows "No communications recorded" whenever an error emptied the rows.
- `ClosureQaPanel` reads only `isLoading` and renders "No closure decisions recorded yet." on failure.
- `CaseThreadsPanel` destructures only `data, isLoading, refetch` — a failed thread feed renders the empty state.
- `useComplaintRfis.hydrate()` ignores errors on `complaint_rfi_items` and `complaint_rfi_responses` (`(it as any[]) || []`), so a failed hydration shows "0 question(s)" / no responses as if true.
- `ComplaintCurrentStepPanel` gates only on `trackingQ.isLoading` and derives readiness from `?? []` for tasks, RFIs and closure — a failed supporting query reads as "no RFI outstanding" / "investigation complete".
- `ComplaintOverviewSummary` does the same: "None raised", "None created", "Unassigned", "Not started" are printed even when the query failed.
- Two surfaces both called History: header `HistoryButton` → `ChangeHistoryDrawer`, and the History tab → `ComplaintTrackingTimeline`.
- `ChangeHistoryDrawer` queries `compliance_audit_logs` by `object_id` only; the table has an `object_type` column, so unrelated records sharing the UUID can merge in.
- `ComplaintTrackingTimeline` merges workflow events and audit rows with no dedup, so one transition can appear twice; it also has no error/retry state for the audit query.
- `ComplaintInvestigationTab` still offers Outbound/Inbound complainant correspondence alongside the canonical Evidence & communications tab.
- Console shows a React `forwardRef` warning from `ChangeSummary` inside `ChangeHistoryDrawer`.

## What will change

### 1. One shared data-state pattern
Add a small `ComplaintDataState` helper (built on the existing `QueryErrorState`) exposing contextual loading text, error+Retry, and empty text, plus a `statusText()` helper for one-line supporting statuses ("Information request status unavailable" + Retry). Every complaint-detail section uses it, so Loading / Data / Empty / Error are always distinct and no section can print an empty state while a query is in error.

### 2. Loaders that always terminate
- Rewrite `CommunicationTimeline`'s manual loader as `try / catch / finally` (finally always clears loading), keep the permission-denied branch, and show an error card with a Retry action instead of an empty message. Guard against setting state after the object changes.
- Sweep every complaint-detail component for spinners that can never resolve; wrap the RPC/manual paths accordingly.

### 3. Truthful empty vs error
Replace `data ?? []`-driven empty text with explicit checks in: `ComplaintRfiTab`, `ClosureQaPanel` (closure history), `CaseThreadsPanel`, `ComplaintInvestigationTab` (tasks + legacy notes), `CommunicationTimeline`, `ComplaintTrackingTimeline`. Each failure renders "… could not be loaded" + Retry.

### 4. RFI hydration errors propagate
In `useComplaintRfis`, check and throw the errors from the items and responses fetches so the RFI tab can show a real error state instead of "0 questions". RFI permissions, approval states and RPC writes are unchanged.

### 5. Current step: core vs supporting
Core = workflow tracking + available actions; a core failure shows a Current step error card with Retry. Supporting = tasks, RFIs, closure. A supporting failure keeps the panel usable and replaces just that readiness line with "… status unavailable" + Retry, never a false "done" tick.

### 6. Overview truthfulness
`ComplaintOverviewSummary` shows "Workflow status unavailable", "Information request status unavailable", "Investigation task status unavailable", "Closure status unavailable" per failed source, keeping the concise grid otherwise.

### 7. Fewer duplicate queries
`useComplaintCurrentStepData` is already shared by Overview, Current step and the Closure section; `ClosureQaPanel` and `ComplaintTrackingTimeline` re-declare the same closure/tracking queries with their own inline `queryFn`. Consolidate onto the shared hook and identical query keys (`complaint_tracking`, `complaint_actions`, `complaint_tasks`, `complaint_closure_reviews`, `complaint-rfis`) with a sensible `staleTime`, so switching tabs reuses cache instead of refiring RPCs. Background refetches show a small refresh indicator rather than replacing loaded content.

### 8. One user-facing History
- The History tab (`ComplaintTrackingTimeline`) becomes the single case story: what happened, when, who, what changed, where the case is now — business events only (received, triaged, severity changed, assigned, RFI raised/approved/answered, task completed, escalated, resolution recorded, closure recommended, QA approved, closed, reopened). Low-value update rows with no business fields, internal IDs, correlation/request/template IDs and raw metadata are filtered out of the default view.
- Presentation-layer dedup: when a workflow event and an audit row describe the same action at (near) the same timestamp, render one entry. No audit data is deleted or stopped.
- Header `HistoryButton` on Complaint Detail is relabelled **Audit details** (drawer title "Technical audit details") and positioned as a secondary/advanced action, gated by the same complaint-audit visibility already used on the page. Raw JSON stays behind the existing collapsed toggle, never expanded by default.
- `ChangeHistoryDrawer` scopes `compliance_audit_logs` by `object_type` as well as `object_id`, and the compliance fetch error is surfaced instead of silently ignored.
- Fix the `ChangeSummary` ref warning seen in the console.

### 9. Communications: one canonical surface
Evidence & communications remains the canonical place for external correspondence (threads + communication timeline). In Investigation, the legacy `complaint_correspondence` block keeps investigation notes only: the Outbound/Inbound complainant options are removed from the composer (internal note only) and existing outbound/inbound rows stay visible, clearly labelled as historical records with a pointer to Evidence & communications. No data deleted or migrated.

### 10. Verification
Walk every tab in the preview (Overview, Current step, Investigation, Information requests, Classification, Closure & QA, Evidence & communications, History, audit drawer) with a browser script, including a forced-failure check that a failing query renders an error + Retry rather than an empty state, and run the existing complaint/communication unit tests (`stateLabel` / `stateTone` contract preserved).

## Out of scope
Workflow admin pages, workflow builder/definitions, steps, action configuration, approval roles and matrices, workflow transitions and permissions; closure/RFI RPC business rules; audit logging architecture.
