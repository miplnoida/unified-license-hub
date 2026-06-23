## Problems

**1. Fee Management — Category & Services dropdowns**

Keep the existing scope-toggle behavior in `src/pages/admin/FeeManagement.tsx` exactly as it is: when `feeScope = 'category'`, render only the Category dropdown; when `feeScope = 'services'`, render only the Services multi-select; when `feeScope = 'form'`, render only the Form multi-select. The current code (lines 545–587) already does this correctly. **No code change required for point 1** — confirming the user's clarification.

**2. Renewal payment is not being picked up on the application**

`startRenewal()` in `src/pages/licenses/LicenseDetail.tsx` (lines 270–308) tries to resolve a `Renew` service for the license's sub-sector and writes it onto the renewal application as `data.service_id`. Two failure modes follow:

- If no row exists in `services` named "Renew" for that `sub_sector_id`, `renewServiceId` stays `null`. The renewal application is then saved with `service_id: null`, which the breakdown resolver in `src/lib/applicationFeeBreakdown.ts` treats as a **pre-licensee** filing (`selectedService ? f.service_id === selectedService : !f.service_id`). Any renewal fee an admin saved under scope=Services with a Renew `service_id` is filtered out → zero fee components → no Pay Now button.
- Even when a Renew service exists, admins commonly configure the renewal fee under scope=Category (since Fee Management's scope is exclusive). That row has `service_id = null`, but the renewal application has `service_id` set, so the resolver again filters the row out for the symmetric reason.

The mismatch is purely on the frontend resolver: renewals straddle scopes and the strict service/no-service partition rejects valid rows.

## Fix

Two small frontend-only edits. No backend, schema, or Fee Management UI changes.

### A. `src/lib/applicationFeeBreakdown.ts` — relax matching for renewals

In the `else` branch that walks `fee_configurations` (after determining `selectedSector`, `selectedSubSector`, `selectedCategory`, `selectedService`, `selectedFormIds`):

1. Detect renewals: `const isRenewal = appData.is_renewal === true || appData.service_name === 'Renew' || appData.service === 'Renew';`
2. When `isRenewal` is true, **bypass** the strict service partition. Replace the current filter line  
   `(selectedService ? f.service_id === selectedService : !f.service_id)`  
   with:  
   `(isRenewal ? (!f.service_id || f.service_id === selectedService) : (selectedService ? f.service_id === selectedService : !f.service_id))`
3. When `isRenewal` is true, also prefer rows whose `fee_type` matches `'renewal'` (case-insensitive). Add to the existing specificity calculation:  
   `+ (isRenewal && typeof f.fee_type === 'string' && f.fee_type.toLowerCase().includes('renew') ? 32 : 0)`  
   This keeps the deterministic sort already in place and ensures the renewal-typed row wins over generic fees that also match the sector/sub-sector.

No change to the `fee_components` (already-frozen) path — only the fallback `fee_configurations` walk used by drafts/new renewals.

### B. `src/pages/licenses/LicenseDetail.tsx` — make the renewal-fee summary panel use the same logic

The `loadRenewalFee` effect (lines 116–148) currently shows the user a "paid renewal" hint only when there is a `services` row named `Renew` for the sub-sector. Mirror the resolver fix so the badge is consistent with what the application's payment panel will compute:

1. Drop the hard requirement that a Renew `service_id` exists. Query `fee_configurations` directly with `is_active = true` and `fee_type ILIKE 'renewal'`, scoped to the license's `sector_id`/`sub_sector_id`.
2. Rank matches with the same specificity rule as in the resolver (category > sub-sector > sector), prefer rows whose `service_id` is null or matches a Renew service if one happens to exist.
3. If no row is found, leave `renewalFee = null` (current behavior — UI then shows the no-fee state).

### Out of scope

- The Fee Management page (`src/pages/admin/FeeManagement.tsx`) is unchanged.
- `startRenewal()` writes the application exactly as today (still sets `service_id`, `service_name = 'Renew'`, `is_renewal: true`, `form_template_ids`).
- Workflow resolvers, edge functions, and `fee_components` table behavior are unchanged.
- The earlier Min/Max removal and the `?action=renew` auto-trigger guard remain as previously shipped.

## Acceptance

- An admin can save a renewal fee under either scope (Category-only, Services-only including the Renew service, or Form-only) and the renewal application opens with a populated fee breakdown and a working Pay Now button.
- License Detail's renewal banner shows the matching fee amount whenever such a row exists, regardless of whether the sub-sector has a Renew service configured.
