## Option 3 findings: no supported path meets all requirements

Recommendation: **do not proceed.** Nothing has been changed.

### What the pre-licence rule needs (confirmed)
The rule for new pre-licence applications looks for **all** of these:
- a registration record owned by the signed-in user (`registrations.user_id` = the user)
- with status `approved`
- with a registration-to-licensing hand-off record

Today, `rbc_primary_user@yopmail.com` has 0 registrations and 0 hand-offs.

### The two registration options on /register

**1. Connect to Existing Entity** (`/register/entity`)
- The server matches the organisation:
  - an exact match reuses the existing entity
  - a possible match goes to a regulator-reviewed resolution case
  - no match creates a provisional entity
- It only grants **membership** of the entity. It does **not** create a registration record or a hand-off.
- The Rodney Bay user already has an approved membership. The screen would see that access is already in place and send them straight back to New Application, where the same error appears.
- Result: it does **not** satisfy the rule.

**2. Start New Registration** (form-based)
- The server **always creates a brand-new user account**. It rejects any email that already has an account ("This email is already registered", `PRIMARY_USER_EMAIL_EXISTS`).
- The existing profile for `rbc_primary_user@yopmail.com` exists (count 1), so this account **cannot be reused**. Requirement 2 fails.
- Entity duplication would be prevented: after submission, the server runs governed matching.
  - An exact match binds the registration to the existing Rodney Bay entity.
  - A possible match opens a resolution case and creates no entity.
  - Only no match creates a provisional entity, and the legal name or registration number would normally prevent that.
- But it would create a **second user** and, once approved, a **second membership**. Requirements 2 and 4 fail.
- I haven't confirmed whether Rodney Bay's identifiers would produce an exact match. No Rodney Bay registration exists today (count 0).

### Conclusion
| Requirement | Connect existing | New registration |
|---|---|---|
| No duplicate entity | Yes | Yes, by matching (exact match unconfirmed) |
| Reuse rbc_primary_user | Yes | **No**: new account forced |
| Satisfies the pre-licence rule | **No** | Yes, after approval |
| No duplicate user or membership | Yes | **No** |

No supported screen creates an approved registration for an **existing** user and an **existing** entity without code or rule changes. Under your constraints, Option 3 cannot be done.

### Separate blockers (unchanged)
- There is no Credit Union application fee, and payment is required before submission.
- No active approval workflow matches Credit Union.

### Your decision options (nothing will run until you choose)
- **A.** Accept a second, new applicant account through Start New Registration. The cost is an extra user and membership. The entity is protected by matching.
- **B.** Return to Option 1 or 2, which change the rule. You said earlier you want to keep the rule.
- **C.** Stop here.
