## Problem

On the dashboard's Renew button, navigation goes to `/licenses/:id?action=renew`. On the license detail page an auto-trigger effect calls `startRenewal()` as soon as the license loads. At that moment the `useFormTemplates` query is often still in flight, so `formTemplates` is `[]`. `resolveRenewalTemplate()` returns `null`, and we show "No renewal form is configured for this license."

The effect does have `formTemplates` in its dependency array, but it sets `autoRenewalTriggeredRef.current = true` on the first run, so the re-run after templates load is skipped. The toast is incorrect — clicking the "Renew License" button afterwards works because templates are loaded by then.

## Fix

Single file: `src/pages/licenses/LicenseDetail.tsx`

1. Pull `isLoading` (as `templatesLoading`) from `useFormTemplates(...)` alongside `data: formTemplates`.
2. In the `?action=renew` auto-trigger effect (around lines 334–350), wait for both `license` and templates to be ready before firing:
   - Return early if `templatesLoading` is true.
   - Return early if `formTemplates.length === 0` (templates query resolved but no published templates yet — better to no-op than show a misleading toast on auto-trigger).
   - Only after these guards set the ref and call `startRenewal()` / `toast.info(...)`.
3. Keep the manual "Renew License" button behavior untouched — it still calls `startRenewal()` directly, which still surfaces the existing error toast if no template truly exists.

No backend, schema, or UI changes beyond this guard. No changes to the resolver logic or fee/workflow handling.