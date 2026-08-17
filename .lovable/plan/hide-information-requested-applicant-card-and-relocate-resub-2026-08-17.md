# Hide "Information Requested" applicant card and relocate resubmit

## Goal
Remove the "Information Requested / Resubmission Required" action card from every applicant view of the application detail page, while keeping the resubmit workflow reachable.

## Changes

### 1. Remove the bottom applicant action card
- File: `src/pages/applications/ApplicationDetail.tsx`
- Delete the block at line ~1574 that renders the `Card` with title `Information Requested` / `Resubmission Required`, the remarks textarea, and the `Resubmit Application` / `Cancel` buttons.
- Remove the `activeTab !== 'form'` guard from that block since the whole block will be gone.

### 2. Remove the amber "Information requested by the reviewer" banner
- File: `src/pages/applications/ApplicationDetail.tsx`
- Delete the block at line ~926 that renders the amber notice telling the applicant to answer questions in the RFI tab and resubmit.

### 3. Add a compact resubmit action in the page header
- File: `src/pages/applications/ApplicationDetail.tsx`
- In the `PageHeader` `actions` slot, add a `Button` (with `Send` icon) labeled `Resubmit Application`.
- Show it only when:
  - `isOwner` is true, and
  - `app.status` is one of `resubmission_requested`, `query_raised`, or `info_requested`.
- Wire it to the existing `handleResubmit` function.
- Disable it while `processing` is true or the license gate is blocked, matching the current card behavior.

### 4. Fix form-tab data refresh guard
- File: `src/pages/applications/ApplicationDetail.tsx`
- Line ~401 currently checks `activeTab !== 'forms'`, but the tab value is `'form'`. Change the condition to `activeTab !== 'form'` so the detail page re-reads the application when the applicant switches to the Submitted Forms tab after an RFI edit.

## Acceptance
- The applicant detail page no longer shows the "Information Requested" card or the amber banner.
- A `Resubmit Application` button appears in the page header when the application is in a resubmission state.
- Clicking the header button still calls `handleResubmit`, advances the application, and toasts success/error as before.
- Switching to the Submitted Forms tab triggers a fresh `loadData()` call.
