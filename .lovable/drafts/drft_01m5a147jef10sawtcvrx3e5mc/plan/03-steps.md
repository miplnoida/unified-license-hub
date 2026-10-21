## Steps (after your approval)

### 1. Pre-check (me, read-only)
Record the current counts:
- entities and parties: 91 and 138
- Rodney Bay memberships and access rows
- registrations, resolution cases and hand-offs

### 2. Applicant registers (you, signed out)
1. Go to `/register` and choose **Start New Registration**.
2. Use the email `rodneybay.registration@yopmail.com`. You enter the OTP and password yourself.
3. Choose sector **Credit Unions → Credit Union**.
4. Enter the legal name **exactly**: `Rodney Bay Community Credit Union Ltd`.
5. Enter the registration number `CU-RB-2026-014`. This is for the record only; it is not used for matching.
6. Fill in the contact details, then submit.

### 3. Check (me, read-only)
- The registration is bound "pending resolution".
- A case is open with candidate `cc331…`.
- Entity count is unchanged.
- **Stop** if anything else happens.

### 4. Regulator resolves the match (Licensing → Entity Resolution)
1. An officer with **Entity Resolution → Resolve** recommends "existing entity `cc331…`" and gives a reason.
2. If the system asks for a second person, a **different** user with **Entity Resolution → Approve** approves it.
3. Check: the binding is "bound to existing `cc331…`", with no new entity.

### 5. Regulator approves the registration (registration review screen)
1. An officer with registration approval rights approves it, following the normal workflow.
2. Check:
   - status is approved
   - a hand-off exists
   - the new user has exactly one approved membership on `cc331…`
   - `rbc_primary_user` and its membership are untouched
3. **Stop** if the membership or hand-off is missing.

### 6. Applicant opens New Application (you)
1. Choose **Credit Unions → Credit Union**. The published form should appear.
2. **Save the draft only.** Do not submit or pay.
3. Check: the draft is linked to the registration and to `cc331…`.

### Restrictions
- No changes to code, database rules, schema, entity details or the existing account.
- No direct data inserts.
- The OTP step is never bypassed.

### Separate blockers (unchanged)
- There is no Credit Union fee, and payment is required before submission.
- No approval workflow matches Credit Union.
