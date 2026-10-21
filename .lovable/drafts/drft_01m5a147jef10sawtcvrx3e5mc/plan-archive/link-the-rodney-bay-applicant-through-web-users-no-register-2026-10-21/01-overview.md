## Link the Rodney Bay applicant through Web Users (no /register)

### Checked (read-only)
- Rodney Bay (registry ID `cc331…`) has **0** web users, **0** memberships and **0** PPOC mappings today. No account exists yet for `rodneybay.applicant@yopmail.com`.
- The Web Users tab on the entity screen uses one server action that does all of this in a single step:
  - creates the account and emails a temporary password
  - sets the role to Licensee Primary
  - links the account to the registry ID `cc331…`
  - creates one approved Primary Representative membership and one active access row

  It does **not** create a registration record or a new entity.
- Required permission: **User Management → Create**, which a System/Security Administrator or super admin holds. The server checks this, not the screen.
- Creating an application is allowed for Licensee Primary users who own the application. The `/pre-license/new` page needs the licensing "submit" capability, which Licensee Primary has.
- PPOC mapping is **not** created by Web Users. It lives in a separate screen, Admin → PPOC Mapping. It is only needed if the user must act for *additional* entities. As Primary User of Rodney Bay, the applicant already acts for it, so adding a PPOC mapping for the same entity would duplicate access.

### Not yet proven
- I haven't confirmed that the New Application page offers the published Credit Union **pre-licence** form to a Licensee Primary user. It may treat them as already licensed and only show post-licence services. That check is step 4 below. If it fails, I stop and report.
