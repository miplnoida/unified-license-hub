## Rodney Bay completion (updated brief)

**1. Receipt (approved).** Compare the draft with the main project and confirm the only changes are the payment detail page, its receipt helper and that helper's test. Then accept the draft. A staff member clicks **Issue receipt** once for TXN-1792648603-2B7B7D. It uses the existing completed payment; repeat clicks return the same receipt, and no new charge is made.

**2. Form v2.0 re-pin (review only, not deployed).** I write the proposed server action as a review document, not as a staged change. It covers:
- **Function definition:** in full.
- **Server-side guards:**
  - Staff permission is checked inside the function, so direct API calls are refused too.
  - Status must be Draft, with zero saved answers.
  - The target must be the latest published version, with the same form family and category.
  - It works on exactly the application ID passed in.
- **Safety:**
  - It runs as one transaction and writes an audit entry.
  - It retires the old assignment rather than editing it.
  - It never touches fee, payment or entity links.
- **Permissions:** EXECUTE for signed-in users only, with the permission check inside. No new grants on tables and no policy changes.
- **Rollback:** a reverse action with the same guards, plus dropping the function.
- **Planned tests:** allowed, refused when answers exist, refused when submitted, refused without permission, and refused when the version doesn't match.

Nothing is applied or run. APP-2026-002011 stays on v1.0.

**3. Category typo (approved).** Rename "Credit Uniom" to "Credit Union" through the category admin screen as an admin. Then confirm the category ID is unchanged, both applications and the v2.0 form still map to it, and no other category changed.

**4. Registration (verification only).** Read-only:
- Which existing staff hold registration approval permission.
- REG-2026-000204's current state and review history.
- Whether the review screen can still offer a legitimate review, or whether the earlier direct approval blocks one.

I report the remediation needed and create no approvals.

**5. Verification and report.** Confirm the payment is still XCD 2,500 completed, the receipt status, the category mapping, the registration state, and that APP-2026-002011 is on v1.0. Steps that need privileged action are listed separately:
- Accepting or publishing the draft.
- Clicking Issue receipt.
- Approving the re-pin review.
