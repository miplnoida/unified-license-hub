## Problem

Registration Review's SLA column ("1d / 24h") reflects the `version_snapshot` captured when each registration's workflow instance started, not the current value in `approval_steps`. The live `approval_steps` row for "Step 1" is now `sla_hours = 2`, but in-flight instances still carry the old snapshot (`72` / `48`), so the badge and the `· Xh` hint stay stale.

## Fix

Switch Registration Review to read SLA fields from the live `approval_steps` table for the instance's `current_step_id`, falling back to the snapshot only when the live row is missing (e.g. step deleted). No data migration; the 2h change takes effect immediately for all running registrations, and future SLA edits also reflect instantly.

### Changes

**`src/pages/admin/RegistrationReview.tsx`** (only file touched)

1. After loading `workflow_instances`, collect distinct `current_step_id`s and fetch them in one query:
   ```ts
   supabase
     .from('approval_steps')
     .select('id, sla_hours, sla_warning_threshold_percent, escalation_after_hours, name')
     .in('id', stepIds)
   ```
2. Build a `liveStepMap: Map<stepId, row>`.
3. In the row hydration block, resolve SLA fields in this order:
   - `liveStepMap.get(inst.current_step_id)` (live) →
   - existing snapshot step lookup (fallback) →
   - `null`.
   Apply the same precedence to `sla_hours`, `sla_warning_threshold_percent`, `escalation_after_hours`, and `current_step_name`.
4. Leave `step_started_at`, deadline math, and `SlaInlineIndicator` untouched — they recompute automatically once SLA hours are correct.

### Out of scope

- No change to `workflow_instances.version_snapshot` (history of "what SLA was in force when this instance started" stays intact for audit).
- No change to Applications list, Returns review, Dashboard SLA widget, or the snapshot-based resolver in `src/lib/workflowSlaResolver.ts`. If you later want the same live behavior there, that's a separate request.
- No backend migration.

### Verification

- Open `/admin/registration-review`: the SLA badge for in-flight registrations should now read against 2h (typically "Overdue …" since 2h has long passed), and the "Current Step" cell should show `· 2h` instead of `· 72h`.
- Edit the workflow step SLA to a different value in admin → reload the page → badge updates without needing a new workflow version.
