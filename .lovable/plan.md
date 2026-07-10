## Diagnosis

For entity `30a3c4cb-ad53-4020-a5c4-d216a5ac1eb1` ("New FinCorp Commercial Bank Limited"), DB counts are:

- complaints: 1 · investigations: 2 · alerts: 0 · actions: 0 · monitoring results: 0

So the Alerts / Actions / Monitoring Hits tabs are legitimately empty — no code bug there, just missing data. The Investigations tab loads correctly, but the `created_at` column shows the raw ISO string because `ListCard` in `src/pages/conduct/ConductEntityProfile.tsx` renders every cell as `String(row[c])` with no date formatting.

## Changes

### 1. Format datetime columns in the entity profile tabs (frontend only)

File: `src/pages/conduct/ConductEntityProfile.tsx` — inside `ListCard`, detect datetime-like columns (`created_at`, `updated_at`, `evaluated_at`, `due_date`, `closed_at`, `acknowledged_at`, `window_start`, `window_end`) and render them via `new Date(value).toLocaleString()` (or `toLocaleDateString()` for `due_date`). Applies uniformly to Complaints, Alerts, Investigations, Actions, Monitoring Hits tabs.

No other logic changes.

### 2. Seed conduct data for this entity

One `supabase--insert` call adding realistic rows tied to entity `30a3c4cb-ad53-4020-a5c4-d216a5ac1eb1` and its existing complaint `b45d8c34-906e-4b07-9637-4b1511dbb23c`:

- **`conduct_alerts` — 3 rows**
  - "Repeat complaints threshold breached" — kind `threshold`, severity `high`, status `open`, `licensee_id` set, rule = Repeat Complaints Post-Remediation.
  - "Channel concentration spike (branch)" — kind `pattern`, severity `medium`, status `acknowledged`, `licensee_id` set, rule = Channel Concentration.
  - "High-severity complaint escalation" — kind `complaint`, severity `high`, status `open`, `complaint_id` set to the existing complaint (indirect linkage path).

- **`conduct_actions` — 3 rows** with `entity_id` = this licensee
  - Remediation plan request (status `open`, due +14d)
  - Root-cause analysis submission (status `in_progress`, due +30d)
  - Customer redress reconciliation (status `completed`, closed_at now, outcome noted)

- **`conduct_monitoring_results` — 3 rows** with `entity_id` = this licensee
  - Two `matched=true` rows linked to two of the seeded alerts via `alert_id` (Repeat Complaints and Channel Concentration rules), with realistic `metrics` JSON.
  - One `matched=false` sweep row for Product Concentration Spike to show non-hit history.

All rows use `now()` / staggered timestamps so ordering looks natural.

## Verification

- Reload `/conduct/entities/30a3c4cb-...`:
  - Alerts tab shows 3 rows (2 direct + 1 via complaint).
  - Actions tab shows 3 rows.
  - Monitoring Hits tab shows 3 rows.
  - Investigations tab `created_at` renders as a locale string, not raw ISO.
- Summary counters (Open alerts / Open actions) reflect the new rows via the existing `conduct_entity_profile_summary` RPC.

## Out of scope

- No schema changes.
- No RLS/policy edits.
- No changes to hooks or other pages.
