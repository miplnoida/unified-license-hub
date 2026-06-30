## Diagnosis

The renewal logic in `public.provision_application_entity` and `supabase/functions/approve-pre-licensee/index.ts` is already correct in the current codebase (migration `20260630073939…`, edge function already renewal-aware). I verified the deployed `provision_application_entity` contains the renewal branch.

However, real data confirms the bug still bit the user once **before** the fix landed:

- Renewal application `APP-2026-000099` (data has `is_renewal=true`, `renewal_of_license_id=7a5b3197…`, `computed_new_valid_until=2027-06-28`) was approved at `2026-06-30 06:54:37`.
- That approval ran the **old** `provision_application_entity`, which created a brand-new license `LIC-2026-000015` (`application_id=APP-2026-000099`, `valid_until=2027-06-30`) instead of extending `LIC-2026-000014` (`valid_until` still `2024-01-01`, status `expired`).
- The renewal migration was deployed minutes later (`07:39:39`), so any *future* renewal approval will now correctly extend the original license. There's no draft renewal test case left that exercises it; `APP-2026-000100` is the only remaining draft renewal.

The user's report is therefore about **two** things that need finishing:

1. The historical mis-provisioned renewal still has a duplicate license + wrong original-license state.
2. The current renewal RPC is correct but only protects against double-extension by comparing target `valid_until` ≥ existing — that's fragile when expiry config changes between retries. The brief asks for an explicit "already renewed" marker on the application.

## Changes (backend only — no UI / workflow / payment / notifications behavior changes)

### 1. Migration — strengthen renewal idempotency in `public.provision_application_entity`

Keep all existing structure, only adjust the renewal branch:

- After loading `v_app_data`, check `v_app_data ? 'renewal_processed_at'`. If present:
  - Resolve the existing license and licensee from `renewal_of_license_id` and `data->>'renewed_license_id'` and return the renewal-result jsonb immediately. No DB writes, no audit, no second extension.
- When the renewal branch performs the `UPDATE … licenses` extension successfully, also:
  - `UPDATE public.applications SET data = data || jsonb_build_object('renewal_processed_at', now()::text, 'renewed_license_id', v_existing_license.id::text, 'renewed_valid_until', v_new_valid_until::text) WHERE id = _application_id`. Merge-only — never overwrite unrelated keys.
- The existing "target ≥ existing" early-out is removed in favor of the explicit marker, so config drift between retries can't accidentally re-extend.
- All other branches (non-renewal, payment/approval gates, audit log `license_renewed`) stay byte-identical to today.

### 2. Migration — one-shot data repair for the already-broken renewal

In the same migration, run a guarded `DO $$ … $$` block that ONLY fires when the broken state still matches today's snapshot:

- Find applications where `data->>'is_renewal'='true'`, `status='approved'`, `data ? 'renewal_processed_at'` is false, and a license row exists with `application_id = applications.id` (i.e. a duplicate was created).
- For each:
  - Capture the bad license id (`bad_license_id`) and the original license id (`orig_id = data->>'renewal_of_license_id'`).
  - `UPDATE licenses SET valid_until = COALESCE((data->>'computed_new_valid_until')::timestamptz, valid_until), status='active', updated_at=now() WHERE id = orig_id` — only if `orig_id` exists.
  - Delete the duplicate licensee (`DELETE FROM licensees WHERE license_id = bad_license_id`) and then the duplicate license (`DELETE FROM licenses WHERE id = bad_license_id`). Skipped if any FK from `license_certificates`, `license_renewals`, `supervisory_plans`, etc. references it — in that case we re-point those rows to `orig_id` first (the migration enumerates each table explicitly so nothing is missed; rows that can't be safely re-pointed cause the block to RAISE NOTICE and skip that record rather than crash the whole migration).
  - Stamp the application with `renewal_processed_at` / `renewed_license_id` / `renewed_valid_until` so the new idempotency check covers it going forward.
  - Insert an `audit_logs` row `action='license_renewed'` capturing `previous_valid_until` (the old `2024-01-01`) and `new_valid_until`, plus `repair=true` in `new_value` for traceability.

This block is bounded by the WHERE clause; on a clean DB or after it runs once it's a no-op.

### 3. `supabase/functions/approve-pre-licensee/index.ts`

Already renewal-safe (early-returns on renewal without creating a user/entity). No code change required; I'll verify once more during implementation and leave it untouched if so.

### 4. Non-changes (explicit)

`perform_final_workflow_approval`, `perform_manual_application_approval`, `perform-workflow-action`, `verify-and-submit`, frontend renewal form, notifications dispatcher, AI assessment, certificate generator, RLS, GRANTs, payment flow — all untouched.

## Acceptance verification

- Approve `APP-2026-000100` (the remaining draft renewal once the user submits/pays it): original license row updated in place, no new `licenses` row, audit row `license_renewed` written, `applications.data.renewal_processed_at` set.
- Calling final/manual approval again on `APP-2026-000099` or `APP-2026-000100` is a no-op (marker check), returns the existing license/licensee ids.
- After migration runs: `LIC-2026-000014` shows `valid_until=2027-06-28`, `status='active'`; `LIC-2026-000015` and its licensee no longer exist (or are re-pointed if FKs require it); `APP-2026-000099.data` carries the `renewal_processed_at` marker.
- Fresh non-renewal approvals continue to insert into `licenses`/`licensees` exactly as today.
