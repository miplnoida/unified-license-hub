## Goal

Make `public.provision_application_entity` the single source of truth for renewal handling so final approval extends the existing license instead of creating a new one — and keep `approve-pre-licensee` renewal-safe. Prior migrations partly addressed this; this plan consolidates the RPC to match the exact contract in the brief and verifies the edge function + notifications.

## Changes

### 1. Migration — rewrite renewal branch in `public.provision_application_entity(_application_id uuid)`

Keep the function signature and the entire non-renewal code path byte-identical. Only the renewal branch (executed when `COALESCE(v_app_data->>'is_renewal','false')='true' AND NULLIF(v_app_data->>'renewal_of_license_id','') IS NOT NULL`) is rewritten to follow the brief exactly:

1. **Idempotency short-circuit (first):** If `v_app_data->>'renewed_license_id'` matches `renewal_of_license_id` and `v_app_data ? 'renewed_valid_until'`, re-read existing license + licensee and return the renewal payload immediately. No writes, no audit.
2. **Lock existing license:** `SELECT … FROM public.licenses WHERE id = (v_app_data->>'renewal_of_license_id')::uuid FOR UPDATE`. If missing, `RAISE EXCEPTION` with `RENEWAL_LICENSE_NOT_FOUND` (mapped to a `{success:false, http:404, code:'RENEWAL_LICENSE_NOT_FOUND'}` JSON return, matching the existing error-return shape used elsewhere in this function).
3. **Resolve new expiry** in this priority:
   - `v_app_data->>'computed_new_valid_until'::timestamptz` if it parses.
   - Otherwise read `site_settings.value WHERE key='license_expiry'`, support both old flat shape (`{period_days}`) and new shape (`{default, rules[]}`), score rules by `category(4) + sub_sector(2) + sector(1)` against the application's taxonomy, highest wins, fall back to `default.period_days`, final fallback `365`.
   - **Base date:** `GREATEST(now(), COALESCE(existing.valid_until, now()))` then add `period_days`.
4. **Update existing license only:** `UPDATE public.licenses SET valid_until=v_new_valid_until, status='active', updated_at=now() WHERE id=v_existing_license.id`. No `INSERT` into `licenses` or `licensees` on this branch.
5. **Resolve existing licensee** via `SELECT id FROM public.licensees WHERE license_id=v_existing_license.id LIMIT 1`.
6. **Stamp the application** with the marker via `jsonb_set` chain for `renewal_processed_at`, `renewed_license_id`, `renewed_valid_until` (merge-only — never overwrite other keys).
7. **Audit log** `action='license_renewed'` with `entity_type='license'`, `entity_id=existing license id`, and `new_value` JSON containing renewal application id, license id + number, previous_valid_until, new_valid_until, licensee id.
8. **Return** the exact JSON shape from the brief: `{success, http:200, renewal:true, application_id, license_id, license_number, licensee_id, applicant_id, previous_valid_until, new_valid_until}`.

Non-renewal path is untouched — same inserts, same audit, same return payload, so callers (`perform_final_workflow_approval`, `perform_manual_application_approval`, `approve-pre-licensee`) keep working.

### 2. `supabase/functions/approve-pre-licensee/index.ts`

Already renewal-safe in the current codebase (renewal branch resolves the existing license via `data.renewal_of_license_id`, skips auth user creation, skips licensee creation, returns `renewal:true`). I will re-verify against the rewritten RPC shape and adjust only if a field name drifts — no behavioral changes planned.

### 3. Notifications — skip created-entity events on renewal

Audit `perform_final_workflow_approval` (and any post-approval dispatch in `perform-workflow-action` / `approve-pre-licensee`) for `license.created` / `licensee.created` (or equivalent) dispatches. Wrap each in `if (!result.renewal)` (or the SQL equivalent `IF NOT (v_provision_result->>'renewal')::boolean THEN …`). Renewal-specific notifications (`license.renewed`, `license.renewal_approved`) remain as-is.

### 4. Explicit non-changes

`perform_final_workflow_approval`, `perform_manual_application_approval`, `perform-workflow-action`, `verify-and-submit`, renewal form UI, payment flow, AI assessment, certificate generator, RLS, GRANTs, reporting — untouched.

## Acceptance verification (run after migration approval)

- `APP-2026-000099` already repaired by prior migration; calling provisioning again on it returns the existing `LIC-2026-000014` payload with no writes (marker short-circuit).
- `APP-2026-000100` (draft renewal) once approved: zero new `licenses` / `licensees` rows, `LIC-…` original gets `valid_until` extended and `status='active'`, one `license_renewed` audit row, application stamped with `renewal_processed_at`.
- Re-running approval on `APP-2026-000100` returns the same payload, writes nothing, expiry not extended twice.
- Renewal with `computed_new_valid_until` removed from `data`: falls through to `site_settings.license_expiry` resolution and then to 365-day default.
- A fresh non-renewal approval (any pending application) still inserts one `licenses` + one `licensees` row with identical payload shape to today.

