# Post-Licence Duplicate-Request Protection (server-authoritative)

Scope: make "same licence + same service + open post-licence request = blocked" enforced by the backend. Nothing else changes — workflow routing, the 120 services/forms/fees/workflows, pre-licence rules, the queue and all other modules stay untouched.

## What was verified first

- The browser has **no table privileges** on `public.applications` (no INSERT/UPDATE grants to `anon`/`authenticated`), so every create goes through a security-definer RPC: `create_application_draft` (used by the post-licence page, the licence detail page and New Application) plus the submission RPCs.
- `create_application_draft` already derives the licence holder from `data.license_id` and enforces entitlement, but performs **no duplicate check**.
- Existing duplicate triggers on `applications` (`prevent_duplicate_active_application`, `prevent_new_application_when_active_exists`) key on `applicant_id` + sector/sub-sector/category/service and only act when `allow_reapplication = false`; the setting is currently `true`, so they are inert. They also exempt drafts.
- Current data: 17 applications (15 draft, 2 approved); only 2 rows carry `license_id`/`service_id` and `type = 'post_license'`. No existing duplicate pair.

## Canonical open-status set (single source of truth)

Non-terminal, i.e. blocking: `draft`, `in_progress`, `submitted`, `under_review`, `pending_review`, `in_review`, `forwarded`, `awaiting_approval`, `pending_approval`, `query_raised`, `info_requested`, `resubmission_requested`, `resubmission_required`, `returned_for_correction`, `resubmitted`, `payment_pending`, `awaiting_payment`, `pending_payment`.

Terminal, i.e. never blocking: `approved`, `rejected`, `cancelled`, `withdrawn`, `closed`.

These are the statuses already present in the repository's vocabulary (`src/lib/applicationStatus.ts`, existing triggers). Nothing new is invented.

## Duplicate key

For `data.type = 'post_license'` only: `data.license_id` + `data.service_id`. Applicant, sector, sub-sector and category are deliberately **not** part of the key, so PPOC users are not conflated with licences and the same service on a different licence stays allowed. Rows missing either value fall through untouched (legacy-safe, reported as a known limitation).

## Implementation

One idempotent migration, plus a small helper and a narrow trigger:

1. `public.post_license_open_statuses()` — immutable `text[]` helper holding the canonical open set, so trigger and RPC cannot drift.
2. `public.prevent_duplicate_post_license_request()` — `BEFORE INSERT OR UPDATE OF status, data` trigger on `public.applications`, active **only** when the row is post-licence and both `license_id` and `service_id` are present. It takes `pg_advisory_xact_lock` on a hash of `license_id || service_id`, then looks for another row with the same pair in an open status and raises `DUPLICATE_POST_LICENSE_REQUEST: <existing uuid>` with a stable errcode. No admin bypass for correctness (staff still get the friendly path through the RPC).
3. Partial unique index `applications_post_license_open_uniq` on `((data->>'license_id'), (data->>'service_id'))` where the row is post-licence, both values are present and status is not terminal — the true race guard even if two transactions dodge the lock. Created `IF NOT EXISTS` and only after a guard query confirms no existing duplicates (current data has none).
4. `create_application_draft` gains a pre-check for the post-licence branch returning a clean, machine-readable failure (`DUPLICATE_POST_LICENSE_REQUEST` + existing application id in the hint) instead of a raw Postgres exception, so the UI can offer "Open existing request".

The existing pre-licence triggers and `allow_reapplication` handling are not modified.

## Frontend (minimal)

- `src/hooks/useOpenPostLicenseRequests.ts` — align its status list with the canonical open set above.
- `src/lib/applicationGovernedOps.ts` / `src/pages/NewPostLicenseApplication.tsx` — map the `DUPLICATE_POST_LICENSE_REQUEST` error to the existing "request already in progress" toast + navigation to the existing application id, instead of surfacing raw SQL text. Existing UX (warning, disabled Proceed, Open Existing Request) is kept as-is.

## Tests

pgTAP suite `supabase/tests/rbac/286_post_license_duplicate_guard.sql` covering: same licence+same service (block), same licence+different service (allow), different licence+same service (allow), existing draft (block), submitted (block), query/RFI (block), approved / rejected / cancelled (allow), direct RPC bypass (block), two concurrent inserts (exactly one succeeds), PPOC across two licences (only exact pair blocked), and legacy rows without `license_id`/`service_id` (unaffected).

Regression: existing 17 rows untouched (read-only assertions), post-licence routing resolver re-run, services/forms/fees/workflow counts re-counted, queue page loads, pre-licence duplicate behaviour asserted unchanged.

## Known limitations to report (not fixed here)

Service picker lifecycle filtering / legacy "Change of Registered Address" duplication, real F&P assessment linkage, Tier-1 post-approval effects, and reproducibility migrations for the original 120 services/forms/fees/workflows.
