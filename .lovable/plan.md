## What I found for mipl1@yopmail.com

- The account (`a10e718f…`) is a pre-licensee whose registration is **approved**, so no gate blocks it.
- Its application **APP-2026-000131** is `rejected` (30 Jul), owned by that same user id.
- The appeal panel is only rendered inside the Application Detail page (`/applications/<id>`), for the owner, when status is `rejected`. There is **no link to it from My Appeals** and no appeal cue in the applications list — the empty-state text just says "you can appeal from the application page", which is why the user can't find how to appeal.
- `applications.rejected_at` is NULL for this record, so the 30-day countdown falls back to `updated_at`. The window is not being stamped at rejection time.

So the feature exists but is effectively undiscoverable; nothing about the panel itself is broken.

## Plan

**1. Make appeals reachable from My Appeals**
- On `/appeals`, also query the signed-in user's refused applications (status `rejected`) that have no appeal yet.
- Show an "Applications you can appeal" section listing each refused application with its number, refusal date, days remaining in the 30-day window, and a primary **Lodge an appeal** button that opens the same appeal dialog inline (reusing `LicenseAppealPanel`'s lodging flow).
- Keep the current empty state only when there is genuinely nothing to appeal, and reword it to "You have no appeals and no refused applications within the appeal window."

**2. Add an appeal cue in the applications list**
- For rows with status `rejected` in the applicant view of `ApplicationsList`, show an "Appeal available — N days left" hint plus a row action that deep-links to the application detail page's appeal panel (`/applications/:id#appeal`).
- `ApplicationDetail` scrolls to and highlights the appeal card when that hash is present.

**3. Correct the appeal deadline source**
- Stamp `applications.rejected_at` when a rejection is recorded, so the 30-day window is measured from the actual refusal rather than the last update.
- Backfill `rejected_at` for the existing rejected applications (including APP-2026-000131) from their rejection audit/workflow timestamp.

## Technical notes
- Files: `src/pages/appeals/MyAppeals.tsx` (appealable-applications section), `src/components/appeals/LicenseAppealPanel.tsx` (extract/expose the lodging dialog so it can be launched from the list), `src/pages/applications/ApplicationsList.tsx` (rejected-row cue), `src/pages/applications/ApplicationDetail.tsx` (`#appeal` anchor).
- Backend: set `rejected_at` in the rejection path of `perform_workflow_transition`, plus a one-off data update to backfill existing rejected rows. No change to reject semantics (already terminal) or to appeal RLS.
