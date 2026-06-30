## Goal

Make final approval of a renewal application **extend the existing license** instead of creating a new license/licensee/entity. Non-renewal approvals must remain unchanged.

## Detection rule (single source of truth)

An application is a renewal when:
- `applications.data->>'is_renewal' = 'true'` AND
- `applications.data->>'renewal_of_license_id'` is a valid uuid pointing at an existing `licenses` row.

## Changes

### 1. Migration — update `public.provision_application_entity(_application_id uuid)`

Branch at the top, right after loading `v_app` and confirming payment:

- If renewal:
  1. `SELECT ... FROM public.licenses WHERE id = renewal_of_license_id FOR UPDATE` (lock existing license). If missing → return `{error:'Original license not found', code:'RENEWAL_LICENSE_MISSING', http:409}`.
  2. Idempotency: if existing license's `valid_until` already equals the renewal's computed target and status is `active`, skip mutation and just return the existing license/licensee ids.
  3. Resolve the new `valid_until`:
     - Prefer `data->>'computed_new_valid_until'` if it parses to a future timestamptz.
     - Else read `site_settings.value` for `key='license_expiry'`, apply the same hierarchical match used by `useLicenseExpiryConfig` (category_id → sub_sector_id → sector_id → default) using the existing license's sector/sub-sector/category, then compute:
       - base = `GREATEST(existing.valid_until, now())`
       - new = `base + make_interval(days => matched.period_days)`
  4. `UPDATE public.licenses SET valid_until = <new>, status='active', updated_at = now() WHERE id = existing.id`.
  5. Resolve existing licensee via `SELECT id, name FROM licensees WHERE license_id = existing.id LIMIT 1`. Do **not** insert.
  6. Write `create_audit_log(... action => 'license_renewed', entity_type=>'license', entity_id=>existing.id, new_value=>{application_id, previous_valid_until, new_valid_until, license_number})`.
  7. Return jsonb with same shape as today plus `renewal:true`: `license_id`, `license_number`, `valid_from` (existing), `valid_until` (new), `licensee_id`, `applicant_id`.

- Else (non-renewal): keep the **current code path exactly** (insert license if missing, insert licensee if missing, audit log `entity_provisioned`).

The hierarchical policy match will be implemented inline in PL/pgSQL by:
- reading `v_cfg->'rules'` as `jsonb_array_elements`, scoring matches (`category_id` worth 4, `sub_sector_id` 2, `sector_id` 1) and picking highest score; fallback to `v_cfg->'default'` then top-level `v_cfg`. Reuses `period_days` / fallbacks already in the function.

No other behavior in `provision_application_entity` changes. `perform_final_workflow_approval` already delegates to it and needs no edit.

### 2. Edge function — `supabase/functions/approve-pre-licensee/index.ts`

Make it renewal-safe and idempotent:

- After loading `app`, also load `app.data` and detect renewal with the same rule.
- Renewal branch:
  - Resolve license by `data.renewal_of_license_id` (not by `application_id`).
  - Resolve licensee by `license_id`.
  - Skip auth user creation, skip `profiles` updates, skip `seed_external_portal_defaults`, skip `bootstrap_supervisory_profile`.
  - Still call `generate-license-certificate` for the existing license (regenerates updated cert with new expiry).
  - Return `{ success:true, renewal:true, license_id, license_number, licensee_id, web_user_created:false }`.
- Non-renewal branch: unchanged.

### 3. Frontend — minimal, display-only

`src/pages/applications/ApplicationDetail.tsx` already has `isRenewalApplication`. After a successful manual approval / workflow final approval, the existing success toast simply needs to handle the case where the response is a renewal: show "License renewed — new expiry: <valid_until>" instead of "License created". No layout or business-logic changes; just a conditional in the existing toast string. No other UI files touched.

### 4. Non-changes (explicit scope guard)

- `perform-workflow-action`, `perform_final_workflow_approval`, `perform_manual_application_approval`, workflow-transition RPC, RLS, GRANTs, payment functions, notification dispatch, AI assessment, renewal form creation in `LicenseDetail.tsx`, certificate generator internals — all untouched.
- No changes to `licenses`/`licensees` schema.

## Acceptance verification

- Approve a renewal application → no new row in `licenses` (count unchanged for that applicant), no new row in `licensees`, existing license `valid_until` advanced, `status='active'`, `updated_at` bumped, audit log row `action='license_renewed'` with old/new expiry.
- Approve a fresh (non-renewal) pre-licensee application → identical to today: new `licenses` row, new `licensees` row, web user provisioned, certificate generated.
- Calling final approval twice on the same renewal application produces no further mutation (idempotent).
