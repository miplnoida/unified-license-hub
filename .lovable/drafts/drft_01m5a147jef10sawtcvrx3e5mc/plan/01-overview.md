## Credit Union pre-licence: paid-but-Draft fix, new form version, visibility check

Three tasks, done in the order the brief asks for. No schema, security, fee or gateway changes. No direct status edits.

### P1 — Rodney Bay application stuck in Draft (APP-2026-002011)
1. Read-only check: application status, the linked payment (reference, XCD 2,500, settled), whether the final Submit was ever pressed, and which forms or documents are still incomplete.
2. Work out the cause from what the data shows. Likely cases:
   - Payment done but Submit not pressed: this is how the app is designed to work. The applicant finishes the remaining forms and presses Submit. The app sees the existing payment, so they are not charged again.
   - Submit failed: fix the code fault that blocks it (for example, payment not recognised, or a missing Credit Union workflow blocking submission instead of only blocking review).
   - Status shown wrong because the page shows old data: fix the page so it refreshes.
3. Submit through the normal applicant screens as the Rodney Bay applicant. Then confirm the status, payment and receipt all stay on the same application.
4. Disclose the earlier irregularity: registration approval and the entity link were set directly in the database, not through the normal workflow.

### P2 — New realistic Credit Union pre-licence form version
- Open the current Credit Union pre-licence form. Create a new version through Form Management versioning, with the 11 sections in the brief: applicant, profile, governance, fit and proper, financial, business plan, risk management, compliance and AML/CFT, technology and operations, documents, and declarations.
- Use realistic field types and required/optional settings. Add conditional fields (for example, details shown only when a regulatory history answer is "Yes") and document uploads.
- Use no statutory thresholds unless they are already in the FSRA configuration.
- Publish the new version. Earlier versions and past answers stay unchanged.

### P3 — Visibility check
- Confirm the new version is the active published one, mapped to Credit Unions > Credit Union > Pre-licence.
- Sign in as the Rodney Bay applicant and confirm a new eligible application would show the new form.
- APP-2026-002011 stays on its current form version. I won't migrate it unless there is a supported way that keeps its answers and payment. If there isn't, I'll report that limitation.

### P4 — Regression and report
Run the form versioning, payment, submission and status tests. Then give the 7-point completion report.