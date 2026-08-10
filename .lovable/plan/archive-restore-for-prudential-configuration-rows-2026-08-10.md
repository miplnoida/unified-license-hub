# Archive / Restore for Prudential Configuration Rows

## Problem

On Prudential Thresholds (and the same pattern on Prudential Ratios and Manage Validations), the row action always offers "Archive" with the archive icon — even for rows that are already archived (status shown as `inactive`). Confirmed: no restore/unarchive routine exists in the database for thresholds, ratios, or validation rules, so an archived row can only be brought back by manually editing it.

## What will change

1. Row action becomes state-aware:
   - Active row: archive icon, tooltip "Archive", confirmation "Archive threshold?".
   - Archived row: restore icon (rotate-ccw / undo style), tooltip "Restore", confirmation "Restore threshold?" with a Restore confirm button.
2. Status badge wording aligned to the action: `active` / `archived` instead of `active` / `inactive`.
3. New restore routines added in the backend so restoring is audited and versioned the same way archiving is:
   - `restore_prudential_threshold` — reactivates the row, clears the archive end date, reopens the current version row (inside the version-maintenance window so the append-only guard allows it), logs a `THRESHOLD_RESTORED` audit event.
   - `restore_prudential_ratio` — reactivates the row, logs `RATIO_RESTORED`.
   - `restore_validation_rule` — reactivates the rule and publishes a new version marked not archived, logs `RULE_RESTORED`.
   All three use the same permission checks as their archive counterparts (`can_manage_prudential_config` / `can_manage_returns_config`).
4. Same archive/restore treatment applied to the Prudential Ratios and Manage Validations pages so the three configuration screens behave identically.

## Technical notes

- Files: `src/pages/returns-mgmt/PrudentialThresholds.tsx`, `src/pages/returns-mgmt/PrudentialRatios.tsx`, `src/pages/returns-mgmt/ManageValidations.tsx`.
- Restore RPCs added via migration; success toast + React Query invalidation reuses the existing `refresh()` helper so the list and version history update immediately.
- Delete action stays unchanged.
