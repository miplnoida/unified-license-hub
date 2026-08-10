# Fix: "Table prudential_threshold_versions is append-only" on archive

## What's happening

Version-history tables (thresholds, ratios, validation rules) are protected by a guard that blocks any update or delete unless a maintenance flag is switched on for the duration of the operation. The archive/publish/rollback routines close off the currently open version row (stamping its end date) but never switch that flag on, so the guard rejects the operation and the user sees the append-only error.

Confirmed by inspection: the guard function only allows updates when a session flag is set, and none of the publish/rollback/archive routines set it.

## Scope of the fix

Same defect affects, for the identical reason:

- Thresholds: archive, publish, rollback
- Ratios: publish, rollback (and archive if present)
- Validation rules: publish, rollback, archive

## Technical changes

Single migration, no frontend changes:

1. In each affected SECURITY DEFINER routine, wrap the version-row closing update with a transaction-local flag:
   - `PERFORM set_config('app.version_maintenance','on', true);` before the update
   - `PERFORM set_config('app.version_maintenance','off', true);` immediately after
   The flag is transaction-scoped, so it cannot leak to other statements or sessions.
2. Keep the guard unchanged — inserts stay unrestricted, deletes stay blocked, and ad-hoc client updates remain blocked.
3. Verify after the migration by running archive → publish → rollback on a test threshold, a ratio, and a validation rule, and confirming the version history rows close and re-open correctly.

## Out of scope

No changes to the append-only policy itself, to grants/RLS, or to the admin UI.
