
## Problem

1. **"Submission stopped because the latest draft could not be saved."** — The submit flow calls `handleSave()` first, which upserts into `return_form_data`. The DB check shows **no Data API GRANTs** exist on `return_form_data` (and other return tables), so the client gets `permission denied` and the save silently fails. Same root cause as the recent workflow-tables grants regression.

2. **Balance Sheet & P&L stacked on one tab in the View page.** `ViewReturnPage` builds tabs from `f.tab_name` (`[...new Set(effectiveConfigForms.map(f => f.tab_name))]`). Both forms share the same `tab_name` (e.g. "General"), so they render inside one tab, stacked. `FillReturnPage` already uses one-tab-per-form correctly.

## Changes

### 1. Restore missing Data API grants on return tables (migration)

Grant `SELECT, INSERT, UPDATE, DELETE` to `authenticated` and `ALL` to `service_role` on every return/compliance table currently missing them:

- `return_form_data`
- `returns_filed`
- `return_audit_log`
- `return_requests`
- `return_comments`
- `return_calculated_ratios`
- `return_threshold_breaches`
- `return_validation_run_log`
- `return_configs`, `return_configurations`, `return_config_forms`, `return_documents`, `return_due_dates`, `return_form_versions`, `return_notification_templates`, `return_notifications_log`, `return_templates`, `return_types`, `return_validation_rules`, `return_validation_rule_versions`, `return_consolidated_analysis`, `return_cutoff_config`
- `compliance_returns`, `compliance_audit_logs`

No RLS changes — existing policies stay authoritative.

### 2. Split each form into its own tab on ViewReturnPage

In `src/pages/entity/returns/ViewReturnPage.tsx`, key tabs by `form_id` (like `FillReturnPage`), so Balance Sheet and P&L each get their own tab labelled by form name. Preserve tab order via `display_order`.

### 3. Surface real save errors

In `FillReturnPage.handleSave`, include the underlying error message in the toast when a save fails (`Failed to save draft: <reason>`) so future permission/RLS issues are visible immediately instead of showing only the generic "submission stopped" message.

## Verification

- After migration, re-check `information_schema.role_table_grants` for the tables above.
- Open a return, edit a field, click **Save Draft** → expect success toast.
- Click **Submit** on a completed return → expect submission to proceed past the save step.
- Open a submitted return in View mode → expect Balance Sheet and P&L on two separate tabs.
