## Execution order (one approval, then I run it all)

Before each module is inserted, I check that its records will show on the relevant screen without breaking existing business rules. If a module fails that check, I skip it and continue with the others.

1. **Inspect the schema** for every target table:
   - columns, required fields, checks and triggers
   - status vocabularies and existing master data: sectors, regulator, return templates, complaint types, F&P types
   - write guards (governed tables reject direct writes)

   Where a table is guarded, I use its governed function instead. If that function needs a staff session, I skip it and record it as a blocker.
2. **Take the "before" fingerprint.**
3. **Session 2 (Rodney Bay)**, adding to `cc331…`:
   - contacts and people: directors, General Manager Denise St. Rose, compliance officer
   - Person 360 links
   - F&P cases in an open, unassessed state
   - real fictional PDF documents, uploaded to storage and then registered, so there are no broken references
   - **No draft application.** The existing rule requires an approved registration hand-off, and `rbc_primary_user` has none. Creating a draft directly would get around that rule, so it is reported as a blocker.
   - **Not created:** registration approval, hand-off, payment, licence, conditions.
   - Registration and Entity Resolution are **not** restarted.
4. **Session 3 (Castries)**, created through the governed path where one exists:
   - the new entity, with contacts and people
   - 4 quarterly returns with realistic balance sheet and income figures, plus ratios
   - a prudential assessment in draft or under review (not approved)
   - a supervisory plan
   - an examination with 3 findings and corrective actions in progress
5. **Session 4 (Gros Islet):**
   - the new entity, with contacts
   - 5 member complaints across different statuses
   - 1 investigation with evidence
   - conduct findings
   - an enforcement referral (open)
   - remediation and monitoring items
   - only reporting records the screens actually read
6. **Take the "after" fingerprint** and confirm existing data is unchanged.
7. **Check the screens.** Spot-check each session's main pages in the browser as a staff user.
8. **Report back** with the table you asked for: Session, Entity, records with IDs and counts, Status, Demo URLs, Remaining blockers.

### Already known blockers (reported, not worked around)
- There is no Credit Union fee, and payment is required before submission.
- No approval workflow matches Credit Union.
- So no licence can be validly issued, and there are no licences for the Session 3 and 4 entities.
- Rodney Bay's application stays a draft, with no registration hand-off.
- AML/CFT is frozen.
