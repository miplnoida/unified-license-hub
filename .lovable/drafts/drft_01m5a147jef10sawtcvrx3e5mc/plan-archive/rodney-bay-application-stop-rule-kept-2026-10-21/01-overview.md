## Rodney Bay application: stop, rule kept

### Finding (confirmed)
- The error comes from the server rule that creates application drafts. For a new pre-licence application, a non-staff user must have an **approved registration handoff**.
- The Rodney Bay primary user (`rbc_primary_user@yopmail.com`) has **0 registrations**, because the account was created through Web Users. Signing out and back in will not change that.
- The rule is working as designed. It is not a bug in the page.

### Decision
- Keep the rule. Make no changes to code, database rules, data, fees, workflows or accounts.
- The pending phase (draft, then submission) stays **blocked** on this path.

### Paths that would unblock it (each needs your separate approval)
1. Let an approved Primary User of an existing entity with no licence start a pre-licence application. This needs a database rule change.
2. Let licensing staff file the application on the entity's behalf. This also needs a database rule change.
3. A governed registration that links to the existing entity. You ruled this out earlier because of the risk of creating a duplicate.

The fee and workflow gaps for Credit Union remain open either way.
