## Problems

**1. Fee Management — Category & Services dropdowns**

Keep the existing scope-toggle behavior in `src/pages/admin/FeeManagement.tsx` exactly as-is: when `feeScope = 'category'` show only the Category dropdown, when `feeScope = 'services'` show only the Services multi-select, when `feeScope = 'form'` show only the Form multi-select. The current code (lines 545–587) already does this. **No code change for point 1** — confirming your clarification.

**2. Renewal payment not picked up**

`startRenewal()` in `src/pages/licenses/LicenseDetail.tsx` (lines 270–308) tries to resolve a `Renew` service for the license's sub-sector and writes it onto the renewal application as `data.service_id`. Two failure modes follow:

- If no `services` row named "Renew" exists for that `sub_sector_id`, `renewServiceId` stays `null`. The renewal application is saved with `service_id: null`, which `src/lib/applicationFeeBreakdown.ts` then treats as a **pre-licensee** filing via `selectedService ? f.service_id === selectedService : !f.service_id`. Any renewal fee an admin saved under scope=Services with a Renew `service_id` is filtered out → zero fee components → no Pay Now.
- Even when a Renew service exists, admins commonly configure the renewal fee under scope=Category (since Fee Management's scope is exclusive). That row has `service_id = null`, but the renewal application has `service_id` set, so the resolver again rejects the row for the symmetric reason.

The mismatch is purely in the frontend resolver: renewals straddle scopes and the strict service / no-service partition rejects valid rows.

## Fix

Two small frontend-only edits. No backend, schema, or Fee Management UI changes.

### A. `src/lib/applicationFeeBreakdown.ts` — relax matching for renewals

In the `else` branch that walks `fee_configurations` (after deriving `selectedSector`, `selectedSubSector`, `selectedCategory`, `selectedService`, `selectedFormIds`):

1. Detect renewals:  
   `const isRenewal = appData.is_renewal === true || appData.service_name === 'Renew' || appData.service === 'Renew';`
2. When `isRenewal`, **bypass** the strict service partition. Replace  
   `(selectedService ? f.service_id === selectedService : !f.service_id)`  
   with  
   `(isRenewal ? (!f.service_id || f.service_id === selectedService) : (selectedService ? f.service_id === selectedService : !f.service_id))`
3. When `isRenewal`, prefer rows whose `fee_type` matches `renewal` (case-insensitive). Extend the specificity:  
   `+ (isRenewal && typeof f.fee_type === 'string' && f.fee_type.toLowerCase().includes('renew') ? 32 : 0)`  
   The existing deterministic sort and dedupe stay; the renewal-typed row simply wins over generic fees scoped to the same sector/sub-sector.

The `fee_components` (frozen) path is unchanged — only the fallback `fee_configurations` walk used by drafts and freshly-opened renewals.

### B. `src/pages/licenses/LicenseDetail.tsx` — make the renewal-fee summary mirror the resolver

`loadRenewalFee` (lines 116–148) currently only shows the paid-renewal hint when a `services` row named `Renew` exists for the sub-sector. Mirror the resolver fix so the badge matches what the payment panel will compute:

1. Drop the hard requirement that a Renew `service_id` exists. Query `fee_configurations` with `is_active = true` and `fee_type ILIKE 'renewal'`, scoped to the license's `sector_id`/`sub_sector_id`.
2. Rank matches with the same specificity (category > sub-sector > sector); prefer rows whose `service_id` is null or matches the Renew service if one happens to exist.
3. If nothing matches, leave `renewalFee = null` (existing no-fee state).

## Out of scope

- `src/pages/admin/FeeManagement.tsx` is untouched.
- `startRenewal()` still writes the application exactly as today (sets `service_id`, `service_name = 'Renew'`, `is_renewal: true`, `form_template_ids`).
- Workflow resolvers, edge functions, and `fee_components` behavior are unchanged.
- The earlier Min/Max removal and the `?action=renew` auto-trigger guard remain shipped.

## Acceptance

- An admin can save a renewal fee under any scope (Category, Services with the Renew service, or Form) and the renewal application opens with a populated fee breakdown and a working Pay Now button.
- The License Detail renewal banner shows the matching fee amount whenever such a row exists, regardless of whether the sub-sector has a Renew service configured.
