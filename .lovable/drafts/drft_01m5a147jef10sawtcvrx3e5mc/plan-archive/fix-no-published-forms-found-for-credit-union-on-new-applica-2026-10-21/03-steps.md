### Steps
1. **Confirm the cause.** Open New Application in the preview as `rbc_primary_user@yopmail.com`, using a test session I create (you'll be asked to approve it). Pick Credit Unions → Credit Union → Credit Uniom and record which regulator the page sends and what the lookup returns. If the result doesn't match the cause above, stop and report back before changing anything.
2. **Small page fix (New Application only).** Take the regulator from the selected sector itself and use it for:
   - the form lookup
   - the saved draft's regulator

   Fall back to the active regulator only when the sector has none. If the lookup fails, show "Could not load forms, please retry" instead of "No published forms found".
3. **Check it.** Repeat step 1 and confirm the Credit Union form is offered. Make sure an FSRA staff user still sees the same forms as before. Run the existing page tests.
4. **You save the draft yourself** in the normal browser flow. I don't save, submit or pay anything.

### Not changed
No database structure, forms, categories, fees, workflows, regulator settings, accounts or entity data. Submission stays blocked by the missing Credit Union fee and workflow, as already reported.

### Alternative (not proposed)
Marking FSRA as the default regulator would also fix this, but it is a regulator setting change that affects every user. You asked for no setting changes.

### Technical details
- In `src/pages/NewApplication.tsx`, the `application_resolve_form_set` call and `buildDraftPayload` use `activeRegulator?.id`.
- `pickDefaultRegulator` falls through to `regulators[0]`, which is Apex (ACB). Neither active regulator has `settings.default`.
- The fix derives `effectiveRegulatorId = sectorObj?.regulator_id ?? activeRegulator?.id`. It goes into the query key and the payload, and the lookup error is surfaced instead of hidden.
