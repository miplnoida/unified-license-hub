# Fix Prudential Thresholds — Version History

## What's actually wrong

Three confirmed issues, verified against the database and the page code:

1. **No versions exist at all.** The version table holds zero rows for all 13 thresholds. Versions are only ever written by the "Publish new version" action — creating or editing a threshold never records a version. So the History panel legitimately has nothing to show and always says "No versions published yet".
2. **Publish / Rollback / Archive are gated on the wrong permission.** These three server actions require the literal `admin` role, while everything else on the page (including who may edit thresholds) uses the prudential config permission. A super admin or a user with prudential config rights who is not literally `admin` gets "Admin only" when clicking Publish, so they can never create the first version.
3. **The page hides failures.** Opening History ignores any error returned by the query, and Publish/Rollback/Archive never refresh the table or the open History panel — so after a successful publish the panel still looks empty until a full page reload.

## The fix

**Backend**
- Change the permission check in the publish, rollback and archive functions from the hard-coded `admin` role to the same prudential-config check used by the table's write policies (super admin or `prudential_supervision.manage_config`).
- Auto-create version 1 when a threshold is created, and record a new version automatically whenever a threshold's limit values (warn, breach, upper, comparator, unit) change — via a database trigger reusing the existing publish logic. This makes history meaningful without relying on the user remembering to press Publish.
- Backfill a version 1 row for the 13 existing thresholds from their current values so history is populated immediately.

**Frontend (`src/pages/returns-mgmt/PrudentialThresholds.tsx`)**
- Surface errors from the history query instead of silently showing an empty list, and show a loading state while it fetches.
- After Publish, Rollback and Archive, refresh the threshold list and re-fetch the open history panel so the result is visible right away.
- Show who published each version (name, not raw id) and format timestamps with the shared date-time helper.

## Technical notes

- Migration updates `publish_prudential_threshold`, `rollback_prudential_threshold`, `archive_prudential_threshold` to call `can_manage_prudential_config(auth.uid())`.
- New `AFTER INSERT OR UPDATE` trigger on `prudential_thresholds` inserts into `prudential_threshold_versions` only when versioned fields change, closing the previous version's `effective_to` and bumping `current_version`.
- Backfill inserts `version = 1` rows with `effective_from = coalesce(effective_from, current_date)`.
- History fetch moves to a React Query query keyed by threshold id, so invalidation after mutations is automatic.
