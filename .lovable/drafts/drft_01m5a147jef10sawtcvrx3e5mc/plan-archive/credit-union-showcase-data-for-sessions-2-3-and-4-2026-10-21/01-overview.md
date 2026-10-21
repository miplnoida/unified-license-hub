# Credit Union showcase data for Sessions 2, 3 and 4

## Decisions taken
- **One entity for all three sessions:** **Rodney Bay Community Credit Union Ltd**. It sits under the existing Credit Unions sector, Credit Union sub-sector and FSRA regulator. Its fixed ID is `cc330000-0000-4000-8000-000000000001` and its registry ID is `cc331000-0000-4000-8000-000000000001`.
- **No "DEMO" in names.** The records are recognised by their fixed ID prefix `cc33…`, not by a label.
- **Mixed approach.** Basic records go in directly. Approvals, payments, Fit & Proper decisions, risk ratings, the licence itself and enforcement decisions are created through the normal screens, so none of them is made up.
- **No AML/CFT** while the freeze is in place.
- **Name check:** no existing record uses this name. "Rodney Bay International Bank" is a different entity and stays untouched.

## How one entity covers all three sessions
| Session | What is shown on this entity |
|---|---|
| 2 Licensing & Entity 360 | registration, directors, contacts, licence application, fee, Fit & Proper, approval, licence issue, conditions, a variation |
| 3 Prudential supervision | returns with realistic figures, ratios, risk assessment, supervisory plan, examination, findings, corrective actions |
| 4 Complaints & enforcement | member complaint with evidence, investigation, market conduct review, enforcement referral, notice, decision, appeal |

## Two stages, each approved separately
1. **Stage A: direct database inserts.** Covered by the SQL in this plan: the entity, its registry record and the duplicate check.
2. **Stage B: screen walkthroughs, in session order.** The licence must exist first, then supervision, then complaints. Before Stage B starts, I will send a step-by-step list for your approval.
