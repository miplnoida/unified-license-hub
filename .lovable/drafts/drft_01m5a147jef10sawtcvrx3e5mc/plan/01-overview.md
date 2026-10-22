## Rodney Bay: execute approved decisions 1–5

**1. Receipt.** Review the Issue receipt change against the main project to confirm only the payment detail page and its helper/test changed. After the draft is accepted, a staff member clicks **Issue receipt** once for TXN-1792648603-2B7B7D. The existing receipt action returns the same receipt on repeat and creates no payment.

**2. Move APP-2026-002011 from v1.0 to v2.0.** Add a governed "re-pin form version" action:
- Allowed only for Draft applications with zero saved answers. The target must be the latest published version of the same form family and category.
- Requires an authorised staff permission and a written reason. Runs as one transaction. Retires the old assignment rather than editing it, adds a new locked assignment, and writes an audit entry.
- Application ID, fee, payment, applicant and entity stay unchanged. Submitted applications and other drafts are not touched.
- Staff get a button on the application detail page, shown only when the rules above are met. Rule tests cover allowed, refused-when-answers-exist, refused-when-submitted and refused-without-permission.

**Conflict to note:** you said no database schema change. This action needs a new server-side function. It adds no tables, columns or policies, and it is applied when you accept this draft. Without it, the only way to switch the version is a direct edit, which you have forbidden.

**3. Category spelling.** Rename "Credit Uniom" to "Credit Union" on the same record, through the category admin screen. The ID and form mapping stay the same. Then re-check that the 2 applications and the v2.0 mapping still point to that ID.

**4. Registration.** List the existing officers who hold the registration approval permission. If the review screen still offers a review for REG-2026-000204, that officer records it there. If the earlier direct approval blocks re-review, I report the remediation instead of forcing an approval or backdating.

**5. Verification.** After acceptance, check that APP-2026-002011 shows v2.0 with 11 sections, the payment is still XCD 2,500 completed, the receipt is linked, and Submit is refused until registration is authorised and required fields are complete.

### Needs privileged action from you
- Accept the draft so the re-pin action and receipt button reach live data.
- An officer clicks Issue receipt, runs the re-pin with a reason, and does the registration review.
- Applicant sign-in for the visibility check needs your approval.
