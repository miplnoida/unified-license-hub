## Problem

When a licensee clicks **Renew** on an expired license, the system creates a brand-new renewal application every time. The existing duplicate-guard in `LicenseDetail.startRenewal` only blocks **submitted** renewals (`submitted`, `under_review`, `query_raised`, `resubmission_requested`). A renewal saved as **`draft`** is not detected, so a fresh row is inserted on every click — leaving multiple half-filled renewal forms for the same license.

Expected: if a renewal form for this license is already in progress (draft, not yet submitted), reopen that same form instead of creating a new one.

## Fix

Single file: `src/pages/licenses/LicenseDetail.tsx`.

1. **Detect in-progress drafts** in addition to submitted renewals.
   - Add a separate lookup inside `startRenewal` (kept separate from `PENDING_RENEWAL_STATUSES` so the existing dashboard "Renewal submitted" badge logic in `LicenseStatusList` is not affected):
     ```ts
     const { data: existingDraft } = await supabase
       .from('applications')
       .select('id')
       .eq('status', 'draft')
       .eq('data->>renewal_of_license_id', license.id)
       .eq('data->>is_renewal', 'true')
       .order('created_at', { ascending: false })
       .limit(1);
     ```
   - If a draft row exists, skip the insert, show an info toast ("A renewal form is already in progress for this license — reopening it."), and navigate to the same renewal form route used after a fresh insert:
     `/post-licensee/applications/${draft.id}/forms?service=Renew`.

2. **Order of checks** inside `startRenewal` (after access guard):
   1. Existing submitted/in-review renewal → open read-only submitted view (current behavior, unchanged).
   2. Existing **draft** renewal → open the editable renewal form (new behavior).
   3. Otherwise → create a new renewal application as today.

3. **Auto-trigger path** (`?action=renew` effect around line 555) goes through the same `startRenewal` function, so the new guard automatically covers the dashboard "Renew" button, the expiry banner, and direct `?action=renew` deep-links.

## Out of scope

- No changes to fee logic, payment panel, workflows, AI assessment, or non-renewal applications.
- `LicenseStatusList` still shows the **Renew** button for licenses with only a draft renewal — clicking it now reopens that draft (matches the existing comment in that file, which already assumed this behavior).
- No DB migration. No schema or RLS changes.

## Verification (UI)

1. Click **Renew** on an expired license → fill the form partially → leave (status stays `draft`).
2. Return to the license / dashboard and click **Renew** again → must reopen the same application (same URL `/post-licensee/applications/<same-id>/forms`), not create a new one. Confirm in the applications list that no duplicate draft row was created.
3. Submit the renewal → status becomes `submitted` → existing submitted-renewal guard kicks in (read-only view), behavior unchanged.
4. Approve/reject/cancel the renewal → clicking **Renew** again is allowed and creates a new draft, behavior unchanged.
5. Non-renewal applications: unaffected.
