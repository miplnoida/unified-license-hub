## Goal

Today "Track Complaint" opens a dialog that shows a lookup form plus a small status card, and the per-row "Track" button re-opens that same UI. Instead, tracking should navigate to a full page showing the complaint's details, progress, actions taken, history and investigation activity (redacted appropriately for external users).

## What to build

1. **New page: `src/pages/complaints/ComplaintTracking.tsx`**
   - Routes: `/complaints/track` (lookup form) and `/complaints/track/:reference` (result page).
   - Lookup form only appears when no reference is in the URL; submitting navigates to `/complaints/track/<ref>`.
   - Result page sections:
     - Header: reference number, subject, current public status badge, submitted / last updated / resolved dates.
     - Complaint details: type, category, channel, entity complained about, description — only fields safe to expose to the complainant.
     - Progress: workflow step chips (current / completed / pending).
     - Actions taken: decisions and outcomes recorded against the complaint, with dates and public-safe labels (no internal officer names for external users).
     - History: chronological public timeline.
     - Investigation: high-level investigation status and any published findings/outcome; hidden entirely if nothing is publishable.
     - RFI / correspondence requests addressed to the complainant, if present.
   - "Back to complaints" link for signed-in users.

2. **Wire up navigation**
   - `ComplaintsList.tsx`: remove the tracking `Dialog` and `ComplaintTrackingPanel` usage; "Track Complaint" button → `/complaints/track`; per-row "Track" action → `/complaints/track/<complaint_number>`.
   - Register the two routes in `src/routes/dashboardRoutes.tsx` so they are reachable by applicants/licensees (not gated behind the internal complaint module), and keep `/complaints/:id` matching after the more specific `track` paths.
   - `PublicComplaintTracking.tsx` (`/track/complaint`) keeps the same experience: it will render the new page component in public mode instead of the small panel.

3. **Backend: extend the tracking RPC**
   - Extend `public.get_public_complaint_tracking` to also return: complaint details fields, workflow steps (key, label, order, current/completed flags), actions taken, and an investigation summary block — all redacted (no internal notes, no assignee identities) for anonymous/email-verified lookups.
   - When `auth.uid()` matches `complaints.complainant_id`, include the richer complainant-visible set (their own RFIs and correspondence).
   - Keep the existing return shape backwards-compatible so nothing else breaks.

4. **Cleanup**
   - `ComplaintTrackingPanel.tsx` is reduced to just the reference/email lookup form (reused by the new page), with the result-rendering moved into the page.

## Technical notes

- Data fetching moves to TanStack Query keyed on `['complaint-tracking', reference, email]`, so refresh/deep-link works.
- Email verification: for anonymous complaints, the page prompts for the contact email before revealing details; for signed-in complainants the check is bypassed server-side as it is today.
- No changes to internal `ComplaintDetail.tsx` or the internal workflow panels.
