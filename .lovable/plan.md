## Scope
Complete SCRIPT 3 gaps identified by audit. No changes to returns, conduct, complaints, workflow, or notification modules beyond the specific wiring below.

## Findings driving the plan
- End-to-end chain runs on submission only; workflow transitions and breach detection don't refresh risk score.
- `evaluate-prudential-early-warnings` exists but has no cron and no feed log.
- "Create Prudential Action" dialog has no assignee field, so `prudential_action_assigned` notification never fires on create.
- `usePeerSnapshot` is only used on a returns admin analytics page — not on the prudential entity profile or dashboard.
- `/prudential` bare path 404s (no index redirect to `/prudential/dashboard`).
- Stress indicators with `escalate=true` are ignored — no `prudential_escalations` row is created.
- Some mutations miss audit rows (per-breach, withdrawn escalations, assignee reassignment, early warnings function).

## Changes

### 1. Scheduled monitoring
- **New edge function** `supabase/functions/prudential-monitoring-sweep/index.ts`: iterates the latest submitted/approved return per active licensee for prudential-scoped sectors and invokes the same code paths used at submission — `evaluate_stress_indicators_for_return` RPC and ratio/breach recompute — then invokes `risk-score-recompute` for touched entities. Writes one `prudential_data_feed_logs` row per run with `started`/`success`/`failed` and per-entity counts in metadata.
- **New scheduled job** via `supabase--insert` (not migration — carries anon key): `pg_cron` schedule `0 2 * * *` (daily) to POST to the new function. Also seed a manual "Run now" button on `/prudential/dashboard`.
- **Dashboard visibility**: add a compact "Monitoring sweeps" card on the prudential dashboard reading the last 10 rows from `prudential_data_feed_logs` where `feed_type in ('scheduled_sweep','stress_evaluation')`, coloring failed rows and surfacing error text.
- Also add cron for `evaluate-prudential-early-warnings` (hourly) and make it write to `prudential_data_feed_logs` (started/success/failed with row_count).

### 2. Auto-escalation for `escalate=true`
- Update `supabase/functions/evaluate-return-prudential/index.ts`: after processing `new_events` from `evaluate_stress_indicators_for_return`, for each event where `ev.escalate === true` insert into `prudential_escalations` (`related_type='stress_event'`, `related_id=ev.id`, `priority` derived from severity, `status='open'`, `entity_id`, `created_by`), then dispatch `prudential_escalation_created` and write a `compliance_audit_logs` row. Idempotent guard: skip if an open escalation already exists for the same `related_id`.
- Apply the same branch inside the new monitoring sweep so scheduled runs also auto-escalate.
- No change to the manual `useCreateEscalation` path.

### 3. Prudential Actions UI — assignee + mandatory notes
- `src/components/prudential/CreatePrudentialActionDialog.tsx`: add an "Assign to" combobox populated by internal supervisor users (reuse `useInternalUsers` hook). Optional field; when set, hook already fires `prudential_action_assigned`.
- `src/hooks/usePrudentialSupervision.ts` — `useUpdateAction`: when `assigned_to` changes (compared to the pre-image already fetched for audit), dispatch `prudential_action_assigned` to the new assignee.
- Enforce non-empty notes at the hook layer for `completed`/`waived`/`cancelled` transitions (throw before mutating), so a direct hook call cannot bypass the UI guard.

### 4. Peer comparison on prudential surfaces
- `src/pages/prudential/PrudentialEntityProfile.tsx`: add a "Peer comparison" tab (or inline section under Ratios) that renders each ratio's `value` alongside `peer_ratio_snapshot(period_end, ratio_key, sector_id)` results (min / median / p90 / max, N). Use existing `usePeerSnapshot`. Highlight percentile position vs. peers.
- `src/pages/prudential/AssessmentDetail.tsx`: prefill the assessor's ratio review with a "vs. peer median" delta pulled from `peer_ratio_snapshot` for the active period. Read-only signal; does not change scoring logic.

### 5. Routes & navigation
- `src/routes/dashboardRoutes.tsx`: add index redirect `/prudential` → `/prudential/dashboard` via `<Route path="prudential" element={<Navigate to="/prudential/dashboard" replace />} />`.
- Verify `src/config/navigation.tsx` prudential links resolve; no changes expected.

### 6. Audit completeness
- `evaluate-return-prudential`: after `record_return_breach` per breach, log one `compliance_audit_logs` row per breach (`object_type='return_threshold_breach'`, `object_id=breach.id`, action `CREATE`). Keep the existing aggregate row.
- `useUpdateEscalation`: dispatch `prudential_escalation_withdrawn` (or reuse existing generic prudential event) and always keep the audit call regardless of status.
- `evaluate-prudential-early-warnings`: log started/success/failed to `prudential_data_feed_logs` and write a `compliance_audit_logs` row per notified entity.

### 7. QA / smoke test
- Add `src/test/prudentialFlow.test.ts`: unit-level checks for the escalate branch (given a mock `new_events` list with `escalate=true`, assert an escalation insert is attempted and an audit call is queued). No live DB.
- Add manual verification section to `docs/prudential-supervision-qa.md` covering: submit return → ratios/breaches populated → risk score updated → escalation auto-created for critical indicator → notification in center → audit tab shows objects → sweep run visible in dashboard card → peer comparison renders on entity profile.

## Files touched (expected)
- `supabase/functions/prudential-monitoring-sweep/index.ts` (new)
- `supabase/functions/evaluate-return-prudential/index.ts`
- `supabase/functions/evaluate-prudential-early-warnings/index.ts`
- `src/components/prudential/CreatePrudentialActionDialog.tsx`
- `src/hooks/usePrudentialSupervision.ts`
- `src/pages/prudential/PrudentialDashboard.tsx` (sweep-status card + "Run now")
- `src/pages/prudential/PrudentialEntityProfile.tsx` (peer comparison)
- `src/pages/prudential/AssessmentDetail.tsx` (peer delta prefill)
- `src/routes/dashboardRoutes.tsx` (redirect)
- `src/test/prudentialFlow.test.ts` (new)
- `docs/prudential-supervision-qa.md` (verification steps)

## DB / cron (via `supabase--insert`, not migration)
- Cron: daily `prudential-monitoring-sweep` at 02:00, hourly `evaluate-prudential-early-warnings`.
- No schema changes required — every column used already exists (verified in the DB inspection).

## Out of scope
- No changes to `perform-return-workflow-action` (submission-time chain already covers evaluation; scheduled sweep handles ongoing coverage).
- No new tables. No changes to `prudential_ratios`/`prudential_thresholds` seed values.
- No touching of conduct, complaints, F&P, workflow, or returns modules beyond peer-comparison imports.

## Verification after build
1. `/prudential` → redirects to dashboard.
2. Dashboard shows sweep-status card; manually click "Run now" — new row in feed logs, notifications fire for any new events.
3. On an entity with a submitted return: open profile → Peer comparison shows peer stats vs. entity ratios.
4. Create Prudential Action with an assignee → target user gets `prudential_action_assigned` in notification center; audit tab shows the create.
5. Simulate a stress event with `escalate=true` (existing seeded indicator) → `prudential_escalations` row created automatically, notification dispatched, audit row present.
6. Attempt to complete an action with empty notes via UI → blocked; via hook → throws.
7. `tsgo` typecheck and `bunx vitest run` green.
