# Complaint detail: complainant identity, priority wording, field cleanup

Four presentation-level fixes on the staff complaint detail screen. No workflow, RBAC, or approval-config changes.

## 1. Complainant name and user type for applicant-filed complaints

Confirmed cause: complaints filed from the applicant/licensee portal store the complainant in the external user table (`pre_license_users`), but the detail screen only looks the person up in the internal staff table (`profiles`). The lookup returns nothing, so Name and User Type render as "—" even though the record has a name (e.g. CMP-2026-000078/79 → "Test Entity").

Fix:
- Resolve the complainant from both identity sources (internal staff first, then external portal users), matching the existing pattern already used elsewhere in the app for actor names.
- Show a meaningful **User Type**: internal staff show their stored user type; external portal complainants show a plain label such as "Applicant / Licensee user" (the external table has no user_type column). Records with no linked account but an email keep showing the email and a "Public complainant" label.
- Keep the error/retry state that already exists on that card.

## 2. Hide Assigned team

Remove the "Assigned team" field from the complaint detail classification card (input and its save payload entry) so staff no longer see or set it there. The stored data and the list-page team filter are untouched.

## 3. Hide Triage history

Stop rendering the Triage History card on the Overview tab. The component file stays in the codebase (kept, not deleted) behind the same feature-flag style used for other hidden surfaces, so it can be re-enabled later.

## 4. Priority shown in words

Introduce a shared priority label helper and use it wherever priority is displayed:
- p1 → Critical
- p2 → High
- p3 → Medium
- p4 → Low

Applied to the case summary row, the complaints list badge, the priority filter options, the classification card dropdown, and the evidence readiness hint. Stored values stay `p1`–`p4`; only the display text changes.

## Technical notes

- Edit: `src/pages/complaints/ComplaintDetail.tsx` (complainant dual-source lookup, drop Triage card render), `src/components/complaints/ConductClassificationCard.tsx` (remove assigned team, worded priority), `src/components/complaints/ComplaintOverviewSummary.tsx`, `src/components/complaints/ComplaintEvidenceRow.tsx`, `src/pages/complaints/ComplaintsList.tsx`.
- Add: priority label map in `src/lib/complaintStatus.ts` (alongside the existing status/severity label helpers).
- `TriageHistoryCard.tsx` is retained unchanged.
