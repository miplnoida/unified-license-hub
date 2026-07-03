
# 7.10 — Universal Audit & Override Framework

Extends the existing app; does not rebuild anything. Reuses the current `audit_logs` table, `has_role` gating, DashboardLayout, PageHeader, shadcn UI, and AdminHub tile pattern.

## What's already done (migration approved earlier this turn)

- **`public.rule_overrides`** table with the mandatory columns:
  `module`, `entity_type`, `entity_id`, `rule_key`, `original_value` (jsonb), `overridden_value` (jsonb), `reason`, `user_id`, `user_role`, `metadata`, `created_at`.
- Append-only trigger (no UPDATE / DELETE).
- RLS: any signed-in user can insert their own override; Super Admin / Admin / Supervisor can read the register.
- Full GRANTs on the table for `authenticated` and `service_role`.
- Security-definer RPC **`log_rule_override(...)`** that:
  1. Enforces reason ≥ 10 chars and required fields.
  2. Inserts the `rule_overrides` row.
  3. Mirrors it into the existing `audit_logs` with `action = 'RULE_OVERRIDE'`, `old_value = original_value`, `new_value = overridden_value`, and metadata `{module, rule_key, reason, override_id}`.

`audit_logs` schema, triggers, and RLS are untouched.

## Files to create (build mode)

1. **`src/lib/ruleOverrides.ts`** — `logRuleOverride(input)` client helper that calls the RPC (client-side reason check ≥ 10 chars, adds route + user-agent + captured_at into metadata) and `fetchOverridesForEntity(entity_type, entity_id)`.
2. **`src/components/audit/DiffViewer.tsx`** — structured before/after renderer. Object diff: added / removed / changed keys color-coded, scalar values shown inline, arrays / nested objects fall back to a formatted JSON block. Reused by drawer and admin page.
3. **`src/components/audit/OverrideReasonDialog.tsx`** — reusable dialog. Props: `module`, `entityType`, `entityId`, `ruleKey`, `originalValue`, `overriddenValue`, `title?`, `description?`, `onOverridden?(overrideId)`. Handles submit + toast + calls `logRuleOverride`. Replaces future ad-hoc justification prompts across the app; the existing `OverrideJustificationDialog` stays untouched for backwards compatibility.
4. **`src/components/audit/ChangeHistoryDrawer.tsx`** — right-side Sheet. Props: `entityType`, `entityId`, `open`, `onOpenChange`, `title?`. Loads in parallel:
   - `audit_logs` rows for the entity (existing table — old_value / new_value already there).
   - `rule_overrides` rows for the entity.
   Merges them into one timeline sorted desc by timestamp. Each row shows action badge, actor, timestamp, and expandable DiffViewer. Overrides show `rule_key`, `reason`, and their diff.
5. **`src/pages/admin/RuleOverrides.tsx`** — full admin page under DashboardLayout:
   - Filters: module (dropdown from `OVERRIDE_MODULES`), entity_type, rule_key, user email, date range.
   - Table: timestamp, module, entity_type, entity_id, rule_key, actor (with role badge), reason preview.
   - Row → Sheet showing full DiffViewer(original vs overridden) + reason + metadata.
   - "Export CSV" button routes through the existing `logExport()` helper so exports keep hitting `compliance_audit_logs` uniformly.
6. **`src/routes/adminRoutes.tsx`** — add `/admin/overrides` mapped to `RuleOverrides`, gated by `<M module="settings">` (same gate ComplianceAuditLogs already uses).
7. **`src/pages/admin/AdminHub.tsx`** — add a tile `{ label: 'Rule Overrides', desc: 'System overrides & justifications', icon: <ShieldAlert/>, href: '/admin/overrides', module: 'settings' }` next to the Audit Logs tiles.

## Where the framework is *available* (this slice)

Every consumer module already has an entity id we can pass, so `OverrideReasonDialog` and `ChangeHistoryDrawer` are usable immediately from:
- Applications (`applications.id`, entity_type `application`)
- Fit & Proper assessments (`fp_assessments.id`, `fp_assessment`)
- Prudential returns (`returns_filed.id`, `return_filed`)
- Complaints (`complaints.id`, `complaint`)
- Enforcement actions (`enforcement_actions.id`, `enforcement_action`)
- Supervisory plans (`supervisory_plans.id`, `supervisory_plan`)
- AI assessments (`application_ai_assessments.id`, `ai_assessment`)
- Rule evaluations (`rule_key` chosen per rule, entity id = the record the rule ran against)
- Decision records (`approval_actions.id`, `decision_record`)

Wiring the dialog into each existing screen is a follow-up slice — this slice guarantees the primitives, the register, and the audit mirroring are in place first so nothing regresses.

## Non-negotiables kept

- `audit_logs` schema, triggers, RLS: unchanged.
- Existing `OverrideJustificationDialog` and `logComplianceAudit` paths: unchanged.
- Existing routes, auth, roles, layout, sidebar: unchanged.
- No new user role or module permission introduced.
- Every override write produces exactly one `rule_overrides` row and one `audit_logs` row, in one transaction, atomically via the RPC.

Reply **continue** (or "switch to build") and I will write the seven files above.
