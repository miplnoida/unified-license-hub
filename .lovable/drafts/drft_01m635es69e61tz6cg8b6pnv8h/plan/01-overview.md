## Show the institution's pre-licensing application to its web users

**What's wrong (confirmed by reading the data)**
- `rbc_primary_user@yopmail.com` belongs to Rodney Bay (approved membership, and the profile is linked to the institution).
- Rodney Bay has 5 applications: 4 post-licence requests and the original pre-licensing application `APP-2026-002011` (approved, submitted by `rodneybay.registration@yopmail.com`).
- The applications list lets institution users see a record only when (a) they submitted it, (b) it is stamped with the institution inside its form data, or (c) a licence record points back to it. The post-licence requests have the stamp. `APP-2026-002011` has no stamp, and no licence for Rodney Bay points back to it. So the pre-licensing tab shows 0, even though the application is recorded against Rodney Bay.

**Fix (one database change, needs your approval)**
Add one more rule to the existing applications-list check: an institution user can also see applications recorded against **their own institution**. The institution is worked out the same way as now (profile link or active PPOC mapping). Nothing else in the check changes.

- Primary and secondary users of Rodney Bay will see `APP-2026-002011` under Pre-licensing, and the post-licence requests will still show.
- Users from other institutions, and applicants, see nothing new.
- No changes to roles, permissions, table security rules, data, or screens. Filters, ordering, status tiles and actions stay as they are.
- This change goes live when you accept the draft. It runs on the shared database, so treat accepting as publishing it.
