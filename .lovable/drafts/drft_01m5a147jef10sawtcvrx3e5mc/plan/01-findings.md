## Read-only findings (APP-2026-002011)

**1. Form version (v1.0 to v2.0)**
- The application is Draft, with one form assignment: status active, reason "latest at start", **locked** at creation.
- There is no supported switch-version or migration action in the app or the database. The version picker only runs when an application starts, and the lock is meant to stop later changes.
- Changing it would mean editing the locked assignment directly. You have forbidden that, so it will not be done.
- **Safest options:** (a) complete APP-2026-002011 on v1.0, or (b) approve a separate change that adds a governed "re-pin Draft with no answers" action (audited, reason required, Draft only, zero saved answers, payment untouched). Option (b) needs a code and database change, which you would have to approve.

**2. Registration authorisation (REG-2026-000204)**
- Records affected: the registration's approval decision and the application's entity link to Rodney Bay (cc331000-…0001). Both were written directly earlier, with no workflow step, approver action or audit entry showing who authorised them.
- **Supported process:** an authorised registration officer records a formal ratification through the normal registration review screen, or the decision is redone there. Nothing will be backdated or fabricated. Submission stays blocked until this is done.

**3. Receipt**
- The database already has a receipt-issuing action for settled payments. It works for an already-completed payment and is safe to re-run: it returns the existing receipt instead of making a second one. It creates no payment.
- **Cause:** no screen calls it. The payment detail page only shows "Receipt #" as blank.
- **Fix:** add an "Issue receipt" button on the payment detail page for staff, calling the existing action. This is a frontend change only, plus a focused test.

**4. Mapping and the "Credit Uniom" typo**
- Category record "Credit Uniom" is the one the v2.0 form is mapped to. Two applications already carry that text in their licence type.
- Forms are picked using the category's ID, not its name, so the typo **does not affect form selection**.
- Renaming it would change labels on those 2 existing records. That is cosmetic, but it is shared master data, so it needs your yes or no.
- **Applicant visibility:** any new Credit Union application will get v2.0. APP-2026-002011 will keep showing v1.0 unless option 1(b) is approved. You can confirm this by signing in as the applicant and opening the "New Application" choices, without saving.
