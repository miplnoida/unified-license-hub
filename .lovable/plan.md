# Application Detail — Decision Tab De-duplication

Goal: the Decision tab shows only what is unique to making a decision. Duplicated case data stays in the Consolidated Case tab, and identity/status facts move to the Details tab.

## Changes

1. **Decision tab — drop duplicated case sections**
   - "Other Applications" and "Held Licenses" no longer render inside the Decision tab's related-records block. Both remain fully visible in the existing **Consolidated Case** tab (no data or logic removed there).

2. **Twin Peaks — hidden, not deleted**
   - The Twin Peaks Clearance section stops rendering in the Decision tab.
   - The sidebar "Twin Peaks Coordination" group is hidden.
   - Component, page, route and database logic are all left intact so it can be switched back on later.

3. **Case Snapshot moves to Details**
   - The Case Snapshot block is removed from the Decision-Ready Summary.
   - Its fields that are not already on the Details tab are added there for internal staff: Status, Applicant, Applicant email, Entity (when present), Current workflow step.
   - Fields already on Details (application number, licence type, taxonomy, created, submitted) are not repeated.

4. **Remove the "Consolidated Decision View" header card**
   - The intro card at the top of the Decision tab (title, description, status badge, four facts, helper text) is removed. The decision panels below it stay in the same order.

Everything else — gates, sufficiency, AI assessment, readiness summary, document preview, decision actions, workflow behaviour — is unchanged.

## Technical notes

- `src/components/applications/ApproverDecisionView.tsx`: remove the header `Card`, remove `<TwinPeaksPanel>` usage (import kept commented for easy restore), and pass a new prop to `ConsolidatedCaseTab` suppressing the two duplicated sections.
- `src/components/applications/ConsolidatedCaseTab.tsx`: add optional `hiddenSections?: Array<'other_applications' | 'licenses' | ...>` (default none) used only by the decision view; empty-state check accounts for hidden sections.
- `src/components/applications/DecisionReadySummary.tsx`: delete the Case Snapshot `<section>` only; SLA, AI/risk flags and the rest remain.
- `src/pages/applications/ApplicationDetail.tsx`: extend the Details tab card with the moved fields (internal-only where appropriate), reusing the applicant/entity/current-step values already resolved on the page or resolving them with the existing helpers.
- `src/config/navigation.tsx`: comment out the "Twin Peaks Coordination" group entry; routes untouched.
- No backend, RLS or migration changes.
