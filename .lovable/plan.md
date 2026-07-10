# Fix Lead Officer in Thematic Review

## 1. `src/pages/supervision/NewThematicReview.tsx` — Team & Dates step
The current query filters `profiles` by a non-existent `role` column with values `['super_admin','admin','supervisor','reviewer']`, so the Lead Officer dropdown is empty/wrong.

- Replace the ad‑hoc `profiles` query with the existing `useEmployeeApprovers()` hook (same list used by Employee Management and approver pickers — all internal employees).
- Render each option as `full_name (email)` and keep the current value binding to `form.lead_officer_id` (profile id).

## 2. `src/pages/supervision/ThematicReviewDetail.tsx` — Overview
Currently shows the raw UUID. Fetch the profile for `review.lead_officer_id` and display `full_name` (fallback to email, then '—').

- Add a small query (`supabase.from('profiles').select('id,full_name,email').eq('id', review.lead_officer_id).maybeSingle()`) gated on `review.lead_officer_id` being present.
- Render name in the existing `<Info label="Lead officer" …/>` row.

## Out of scope
No schema changes, no changes to review workflow, permissions, or other tabs.
