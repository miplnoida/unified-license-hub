## Revised plan: institution web users can see and open all of their institution's applications

### What I confirmed (read-only)
- Rodney Bay has 5 applications, and each one is recorded against Rodney Bay in its own "institution" field: `APP-2026-002011` (pre-licensing, approved, submitted by `rodneybay.registration@yopmail.com`) and 4 post-licence requests (002012/13/14/17).
- `rbc_primary_user@yopmail.com` has one approved, active, never-revoked membership of Rodney Bay. Rodney Bay has no other members today, so **no Secondary user exists to test with**. One would have to be added through the normal access-request journey.
- **The list** decides which institution applications you can see using only your profile link or a PPOC mapping, then matches on a stamp inside the form data or a licence pointing back to the application. The post-licence requests carry the stamp. `APP-2026-002011` doesn't, so the pre-licensing list shows 0.
- **Opening an application** is a separate check, and the forms, acknowledgements, information requests and AI assessment records all follow it. That check doesn't read the institution field either, so `APP-2026-002011` would still be refused even after the list is fixed.
- **Actions** (edit, withdraw, resubmit, respond) are a third check. It only allows the person who submitted, or users holding the submit or respond capability. It never uses viewing access, so viewing cannot add actions.

### Pre-existing security finding (reported only, not part of this fix)
The portal capability check ignores which institution you pass to it. In practice, any external user with licensing "view" permission passes the "open application" check for **any** application linked to an institution, including other institutions' records. I won't change this here because you excluded permission changes. I recommend a separate, approved fix.

### Decision needed from you
Fixing the list alone would show `APP-2026-002011`, but it would refuse to open. Opening it means adding one condition, "approved, active member of the application's institution", to the open-application check. That check sits behind the security rules for applications and their forms. You asked for no security-rule changes, so I need your explicit yes:
- **A. List and open (recommended for your requirement):** change both checks. View only.
- **B. List only:** the application appears but stays refused on open.

### Steps after approval
1. Stage one migration (full SQL in the technical section). It applies only when you accept the draft. Nothing runs before your separate go-ahead.
2. Add SQL regression tests, run them inside a rolled-back transaction, and re-run the applications-list tests.
3. After acceptance, check in the browser as the Primary user: Pre-licensing and Post-licensing tabs, counts, filters, paging, opening `APP-2026-002011` with forms, documents and history visible, and no edit, withdraw or resubmit buttons. Secondary user only if one exists.
4. No historical data edits, no role or permission changes, no publishing.
