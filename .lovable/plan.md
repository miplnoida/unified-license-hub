# Runtime fix plan — Applicant Return Filing Workspace still appears stacked

## Confirmed runtime evidence

- The live preview route `/entity/returns/filings/3f0f52fc-4e3d-47e8-b053-ee745910e349` mounts the intended applicant workspace and renders the new navigator.
- On that route, the tested filing has exactly two pinned requirements:
  - `International Banks - Balance Sheet` with 5 Balance Sheet sections.
  - `International Banks - Profit and Loss` with 7 Profit and Loss sections.
- The Balance Sheet form version does not contain Profit & Loss sections, and the Profit & Loss form version does not contain Balance Sheet sections.
- The current applicant route DOM shows only the active editable form body: clicking Profit and Loss replaces Balance Sheet rather than stacking both.
- The browser state supplied with the request is `/returns/filings/3f0f52fc-4e3d-47e8-b053-ee745910e349`, which is the internal supervisory route, not the intended applicant route `/entity/returns/filings/:filingId`.
- The server-side validation rule exists for the Balance Sheet template: `line_1_col_1 = line_2_col_1 + line_3_col_1`, with tolerance `0.01`, and `returns_submit_filing` calls `returns_validate_filing` before submitting.

## Most likely issue to fix

The applicant experience can still land on a non-applicant filing route from some navigation source, especially where links use the default internal `objectRoute.returnFiling(filingId)` instead of `objectRoute.returnFiling(filingId, 'external')`.

This is a route/context mismatch, not a need to rebuild the multi-form navigator.

## Targeted changes

1. Audit all applicant/licensee-facing Returns links.
   - Keep internal staff links on `/returns/filings/:filingId`.
   - Ensure applicant/licensee links use `/entity/returns/filings/:filingId`.
   - Confirm Entity 360 / applicant panel widgets do not send external users to the internal route.

2. Add a guarded route correction only if needed.
   - If an external/applicant user reaches `/returns/filings/:filingId`, redirect them to `/entity/returns/filings/:filingId`.
   - Do not redirect internal staff users; they should keep the supervisory `FilingDetail` workspace.
   - Keep RBAC/RLS and entitlement checks unchanged.

3. Add a temporary runtime marker during verification only if necessary.
   - Confirm `EntityFilingWorkspace` is the mounted component for applicant routes.
   - Remove any debug marker before finishing unless it is harmless and user-visible value is zero.

4. Validate form rendering behavior in the live preview.
   - Open `/entity/returns/filings/3f0f52fc-4e3d-47e8-b053-ee745910e349`.
   - Confirm navigator shows Balance Sheet, Profit and Loss, Review & Submit.
   - Confirm only one editable `FormRenderer` is mounted in the active form area.
   - Click Profit and Loss and confirm Balance Sheet is not present in the editable area.
   - Click Balance Sheet and confirm Profit and Loss is not present in the editable area.

5. Validate the financial rule in runtime.
   - Enter invalid totals: Assets `1000`, Liabilities `600`, Capital `300`.
   - Confirm applicant-facing validation flags the `100` difference.
   - Confirm Save Draft remains available.
   - Confirm Review & Submit blocks final submission.
   - Confirm direct submit still returns `submitted: false` through the canonical backend path.
   - Enter valid totals: Assets `1000`, Liabilities `600`, Capital `400`, and confirm the balance issue clears.

## Files likely to change

- `src/lib/routes/objectRoutes.ts` only if the helper needs clearer external-route usage.
- Applicant-facing Returns link call sites that currently call the internal default route.
- `src/routes/returnsRoutes.tsx` only if a role-aware redirect from internal to applicant route is necessary.
- No new filing workspace, no new form renderer, and no new validation mechanism.

## Out of scope

- New Return wizard.
- My Returns and Obligations Calendar behavior.
- Obligation generation, sector/year/type/quarter selection.
- PPOC, membership, licence entitlement, RBAC/RLS.
- Save Draft, corrections, form version pinning, audit, admin Returns Queue.

## Definition of done

- The exact reason for the user's observed stacked/incorrect view is identified from runtime route/link behavior.
- Applicant users land on `/entity/returns/filings/:filingId` from applicant-facing navigation.
- A two-form filing visually renders one editable form at a time.
- Switching forms replaces the active form, not stacks both.
- Entered values persist when switching forms.
- Invalid Balance Sheet values visibly fail and block final submission.
- Valid Balance Sheet values pass.
- Internal staff Returns Queue continues using the supervisory route.
