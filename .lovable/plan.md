
## Findings

1. **Assigned column shows "admin / Unassigned"** even though the complaint workflow step is `specific_users` with Super Admin + Vidya Rani.
   - `workflow_instances` rows exist (verified in DB), `approval_steps.approver_config.user_ids` contains both UUIDs, both `profiles` rows exist.
   - The batched fetch in `ComplaintsList.loadComplaints` builds a temporary `_pending` map on the outer `asgMap` and never surfaces network/parse errors. In practice `asgMap` stays empty and the UI falls back to `assigned_team='admin'` + "Unassigned".
   - Root fix: replace the ad-hoc client chain with a single security-definer RPC `get_complaint_current_assignees(complaint_ids uuid[])` that joins `workflow_instances → approval_steps → user_roles/profiles` server-side and returns `{complaint_id, step_role, assignees[{id, full_name, email}]}`. Removes RLS ambiguity, N+1 fragility, and the `_pending` hack.

2. **Classification column shows "—" sub-lines.** The complaint has `complaint_type` but no `conduct_risk_category_id`, `product_id`, or `channel_id` (they're populated by triage rules or later classification, not by the intake form). The current cell renders three lines even when the last two are empty — visually reads as "missing data".
   - Fix (UI-only): only render category / product · channel lines when at least one value is present; otherwise show the type alone. Keep the existing behaviour when triage fills them.

3. **Applicant view lacks SLA and prominent status.** `ComplaintsList` external table has columns: `Complaint # | Type | Subject | Status | Created | Actions`. No SLA. Status is present but no due date / on-track badge.
   - Fix: add an "SLA" column (uses existing `computeSlaStatus` helper), and surface `Due <date>` under the status badge in the external table and in the applicant detail dialog.

4. **Run / retry triage overwrites the assignee.** `evaluate-complaint-triage/index.ts` line 221 applies `rule.outputs.assigned_team` on every run, including `triggered_by='retry'`. Since the workflow engine now owns routing, retry should not clobber `complaints.assigned_team`.
   - Fix: in the edge function, when `triggered_by !== 'intake'`, drop `assigned_team` (and `investigator_id` if any rule sets it) from the update payload but keep classification / severity / priority / SLA updates. Log the skipped field in the triage audit event so it's auditable.

5. **Conduct dashboard "Attention required" links show all records.** Banner links `/complaints?severity=critical` and `/complaints?sla=breached`; `ComplaintsList` only initializes `statusFilter` from the URL — `severityFilter`, `priorityFilter`, `slaFilter` are ignored.
   - Fix: read `severity`, `priority`, `sla` from `useSearchParams` on mount and seed the corresponding filter state. `/conduct/alerts?status=open` already works because that page reads `status` from the URL; verify and, if not, initialize the alert list filter the same way.

## Files touched

- **New migration** — `supabase/migrations/<ts>_get_complaint_current_assignees.sql`
  - `CREATE FUNCTION public.get_complaint_current_assignees(_complaint_ids uuid[]) RETURNS TABLE(complaint_id uuid, step_role text, user_id uuid, full_name text, email text) SECURITY DEFINER SET search_path=public …` — joins active `workflow_instances` → `approval_steps` → `profiles` (via `approver_config->'user_ids'` for `specific_users`, via `user_roles.role = approver_role` for `role_based_user`). Guards with `has_any_internal_role(auth.uid())`. `GRANT EXECUTE … TO authenticated`.

- **Edit** `src/pages/complaints/ComplaintsList.tsx`
  - Replace the workflow-resolution block inside `loadComplaints` (lines ~204-283) with a single `supabase.rpc('get_complaint_current_assignees', { _complaint_ids: complaintIds })` call and simple map assembly.
  - Add `severity`, `priority`, `sla` initialization from `useSearchParams` next to the existing `status` sync (lines 89-94).
  - External table (lines 717-750): add SLA column + `Due <date>` sub-text under status badge; render applicant detail dialog with SLA row too.
  - Classification cell (lines 799-805): render sub-lines only when the relevant id exists; suppress "— · —" fallback.

- **Edit** `supabase/functions/evaluate-complaint-triage/index.ts`
  - Around line 221 where outputs are folded into `update`: when `triggered_by !== 'intake'` and `update.assigned_team` (or `investigator_id`) would change, omit it and push a note into `appliedOutputs.skipped` for the audit event.
  - Deploy the function after the edit.

- **Edit** `src/pages/conduct/ConductDashboard.tsx` (only if needed)
  - No code change if the ComplaintsList fix above is enough. If `/conduct/alerts` doesn't read `status` from URL, add the same URL-param initialization there.

## Verification

- Reload `/complaints` — CMP-2026-000010 and CMP-2026-000009 show "admin — Super Admin, Vidya Rani" in the Assigned cell.
- Applicant login on `/complaints` — table has SLA column with "On track / Due <date>".
- Run "Run / retry triage" on a complaint — DB row keeps its `assigned_team` and `investigator_id`; triage audit event lists them under `skipped`.
- Click "3 SLA breached" on conduct dashboard — `/complaints` opens filtered to `slaFilter=breached` (3 rows visible).
- Click "critical complaints" — `/complaints` filtered to `severityFilter=critical`.

## Out of scope

- Redesigning the classification taxonomy or auto-populating category/product/channel from the type mapping.
- Reassignment UI or workflow-step editor changes.
