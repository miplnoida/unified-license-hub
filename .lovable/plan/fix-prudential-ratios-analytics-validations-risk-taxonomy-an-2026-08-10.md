# Fix Prudential Ratios, Analytics, Validations, Risk Taxonomy and Stress Indicators

Five configuration/analysis pages share the same defects that were just fixed for Prudential Thresholds: versioning never records anything, admin actions are locked to the wrong role, lists don't refresh after actions, and analytics shows an empty chart while claiming data exists.

## What is wrong today (verified)

Ratios and Validations
- `publish_prudential_ratio`, `rollback_prudential_ratio`, `archive_prudential_ratio`, `publish_validation_rule`, `rollback_validation_rule`, `archive_validation_rule` and `clone_validation_rule` all require the literal `admin` role. A Super Admin or a user with the prudential/returns config permission gets "Admin only".
- `prudential_ratio_versions` and `return_validation_rule_versions` are both empty (13 ratios exist, 0 versions), so "Version history" always says "No versions published yet" and the `v` column is cosmetic.
- After Publish / Rollback / Archive / Clone / Delete the table and the history panel are not re-fetched, so nothing visibly changes until a manual reload.
- History panels have no loading or error state, show raw `toLocaleString()` dates instead of the app's standard format, show the publisher as a raw user id, and mark "current" by list position instead of the real current version.

Analytics
- With Primary Ratio + 2026-06-30 selected, the card reads "Peer Comparison (1 peers)" but renders an empty chart: the peer RPC returned `INSUFFICIENT_PEER_DATA` (minimum 5 peers) and the page ignores that state.
- The selected licensee is never passed to the peer snapshot, so the entity's own value and percentile are never shown.
- The trend x-axis repeats the same period (e.g. two `2026-03-31` points) because multiple recomputations of the same return period are plotted separately.
- Trend and peer values are plotted raw — no percent/ratio formatting from the ratio's display format, and no warning/breach reference line.
- The trend query pulls up to 5000 ratio rows for every ratio and filters entity-side in the browser.

Risk Taxonomy
- No loading, empty or error state; the table renders blank while data loads.
- Sort order and parent category are not shown; duplicate `code` inserts surface as a raw database error.

Stress Indicators
- Taxonomy column prints the raw code (all "—" today) rather than the category label.
- Severity badges are all the same colour, so critical looks like low.
- Metric key is free text although it must match a configured ratio key; a typo silently creates an indicator that can never fire.
- The uniqueness rule (metric + direction + threshold) surfaces as a raw constraint error.
- Deactivated indicators can't be reactivated (the button is only disabled), there is no search/filter, no active/inactive filter, no escalate or sector column, no confirmation before deactivating, and no empty/loading state.

## What will be built

Backend (one migration)
1. Re-gate all ratio and validation-rule version RPCs on the proper permission check (`can_manage_prudential_config` for ratios, the returns-management config check for validation rules) with super admin allowed, instead of `has_role('admin')`.
2. Add auto-versioning triggers so a version row is written when a ratio or validation rule is created and whenever its definition changes (formula/display format for ratios; expression, type, severity, message for rules) — mirroring the threshold trigger already in place.
3. Backfill version 1 for the 13 existing ratios and for any existing validation rules so history is never empty.

Frontend
4. Ratios and Validations: move version history to React Query, invalidate list + history after every publish/rollback/archive/clone/delete, add loading/error/empty states, use `formatDateTime`, resolve the publisher to a person's name, and derive "current" from the real current version.
5. Analytics: honour the `INSUFFICIENT_PEER_DATA` state with an explicit "not enough peers (n of 5)" message instead of an empty chart; pass the selected licensee so the entity's value and percentile render alongside the peer distribution; collapse trend points to the latest computation per period; format values by the ratio's display format and draw warn/breach reference lines from the matching threshold; scope the trend query to the selected entity server-side.
6. Risk Taxonomy: loading/empty/error states, sort-order column, and a friendly duplicate-code message.
7. Stress Indicators: taxonomy label instead of code, severity-coloured badges, metric key chosen from configured ratio keys (with free-text fallback), escalate and scope columns, search + active/inactive filter, Reactivate action, confirmation before deactivating, friendly duplicate-rule message, and loading/empty states.

## Verification

Run the app and confirm, for each page: publish creates a new version visible in history without reload, rollback and archive succeed as Super Admin, the analytics peer card explains the insufficient-peer case and shows the entity marker when peers suffice, and the stress indicator form only accepts known metric keys.
