# Credit Union demo data for Sessions 2, 3 and 4

## Decisions taken
- **Mixed approach.** Basic records go straight into the database. Approvals, payments, Fit & Proper decisions, risk ratings, licence issue and enforcement decisions are created through the normal screens, signed in as test staff. That way none of them is made up.
- **No AML/CFT** in Session 3 while the AML freeze is in place. Session 3 covers prudential returns, ratios, examinations, findings and corrective actions.
- **Shared database is fine.** Every record is labelled `DEMO` and uses its own fixed IDs.
- **Name change.** "Soufrière" is already used by an existing credit union, so the Session 3 entity becomes **DEMO Vieux Fort Community Credit Union Ltd**.

## The three entities
| Session | Entity | Fixed entity ID |
|---|---|---|
| 2 Licensing & Entity 360 | DEMO Rodney Bay Community Credit Union Ltd | `cc330000-0000-4000-8000-000000000001` |
| 3 Prudential supervision | DEMO Vieux Fort Community Credit Union Ltd | `cc330000-0000-4000-8000-000000000002` |
| 4 Complaints & enforcement | DEMO Castries Members Credit Union Ltd | `cc330000-0000-4000-8000-000000000003` |

All three use the existing Credit Unions sector and its Credit Union sub-sector, so they do not repeat the "no sub-sector" gap found earlier. No duplicates were found for these names.

## Two stages, each approved separately
1. **Stage A: direct database inserts.** Covered by the SQL in this plan: entities, entity registry records and the duplicate check. The verification and rollback queries are included.
2. **Stage B: screen walkthroughs, done after Stage A.** Each session's workflow is clicked through as test staff and licensee users. Before Stage B starts, I will send a separate list of exact steps for your approval, using these entity IDs.
