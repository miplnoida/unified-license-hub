# Assignment-Only Regulator — Allow / Deny Matrix

An **assignment-only regulator** is a user who:

- Is mapped as `lead_regulator_id`, `regulator_officer_id`, or
  `alternate_regulator_id` on **at least one** row in `public.licensees`.
- Carries **zero** dynamic-role permissions (no rows in
  `user_dynamic_roles → role_permissions`).
- Is **not** a `super_admin`.

`public.is_assignment_only_regulator(auth.uid())` returns `true` for
exactly this set of users.

Every access decision below is enforced at the **database layer**
(RLS, storage policies, or RPC guards). UI hiding is defense-in-depth
only.

## Allowed

Read-only. Rows must belong to a mapped licensee **and** the parent
return status must satisfy
`public.return_status_is_submitted_lifecycle(status)`.

| Surface | Table / object | Condition |
| --- | --- | --- |
| Return Queue list | `returns_filed` | `licensee_id ∈ assignments` AND submitted-lifecycle |
| Return detail | `return_form_data`, `return_documents`, `return_comments`, `return_audit_log`, `return_data_revisions` | joined via `return_id` to a visible `returns_filed` |
| Ratios / financial data | `return_calculated_ratios` | joined via `return_id` to a visible `returns_filed` |
| Consolidated / AI | `return_consolidated_analysis`, `return_threshold_breaches` | joined via `return_id` to a visible `returns_filed`; read only |
| Attachments | Storage bucket `return-attachments/{return_id}/*` | signed-URL read only when the return is visible per rules above |

## Denied

Every row below is denied at the RLS / policy / RPC level — not just
hidden in the UI.

| Category | Examples |
| --- | --- |
| Non-submitted statuses | `draft`, `wip`, `temp`, `in_progress`, `due_soon`, any status where `return_status_is_submitted_lifecycle = false` |
| Unassigned entities | Any `licensee_id` where the user is not Lead / Officer / Alternate |
| Admin / configuration | `return_configs`, `return_configurations`, `return_types`, `return_cutoff_config`, `return_templates`, `return_config_forms`, `return_validation_rules*`, `return_notification_templates`, `late_fee_*`, `sla_*`, `business_calendar_*`, `report_*` config, `notification_*` config, `permission_*`, `roles`, `permissions`, `role_permissions`, `master_data_*`, `regulators`, `sectors`, `sub_sectors`, `categories` |
| Writes | Any INSERT / UPDATE / DELETE on any table |
| Uploads | Any storage object write on any bucket |
| Exports & downloads | `report_run_files`, `report_run_rows`, `audit_export_jobs`; every CSV / Excel / PDF endpoint |
| AI & analytics | `application_ai_assessments`, dashboard MVs |
| Adjacent modules | Applications, registrations, licenses, complaints, compliance, prudential, conduct, enforcement, inspections, correspondence, fit & proper, fees, payments, refunds |

## Why this holds without additional policy code

`public.has_permission(uid, module, action)` returns `false` for every
assignment-only user (they have no dynamic-role permissions and are not
super admins). Every canonical policy is written as:

```
is_super_admin OR has_permission(...) OR <optional narrow assignment branch>
```

Only the tables listed under **Allowed** get the assignment branch;
everything else falls to `false`. That is the enforcement mechanism —
there is no allow-list to maintain per table beyond deciding whether it
gets an assignment branch.

## pgTAP coverage

- `supabase/tests/rbac/00_helpers.sql` — helper semantics.
- `supabase/tests/rbac/07_assignment_only.sql` — exhaustive negative
  matrix: drafts, WIP, TEMP, unassigned entities, admin config, exports,
  writes, RPCs.
- Positive/negative rows for allowed surfaces live inside the per-module
  suites (`01_returns_rls.sql`, `02_returns_storage.sql`,
  `05_ai_and_consolidated.sql`).
