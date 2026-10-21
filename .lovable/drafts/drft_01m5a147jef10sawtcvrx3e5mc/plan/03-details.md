## Data to be entered (fictional)
- **Entity:** Rodney Bay Community Credit Union Ltd. Registered co-operative number CU-RB-2026-014. Office on Rodney Bay Highway, Gros Islet, Saint Lucia. About 6,200 members.
- **Directors and officers (each gets a Person record):** Marcia Joseph (Chair), Kelvin Alexander (Treasurer), Denise St. Rose (General Manager, nominated primary contact), Peter Francois (Compliance Officer).
- **Form:** "Credit Union Pre-License Application FormM", the published Credit Union licence form. It is filled in field by field on screen.
- **Documents:** each is a short PDF, clearly marked "fictional, for presentation".
  - certificate of registration
  - by-laws
  - business plan
  - latest audited financial statements
  - Fit & Proper declaration and police record for each director
  - AML/CFT policy summary (a document only, no AML assessment)
- **Payment:** the existing gateway simulator, success outcome. Its record is created by the payment screen itself, never by hand.

## Expected records after each step
| After step | New records, with their status |
|---|---|
| 2 | registration Approved; applicant account; membership linking the applicant to entity cc331 |
| 4–5 | application Draft, linked to entity cc331 and its form version; document records |
| 6 | fee assessed; payment Completed (sandbox); receipt |
| 7 | application Submitted; acknowledgement; workflow started |
| 8–9 | sufficiency result; 4 Fit & Proper cases Assessed and decided |
| 10 | approval actions with rationale, one per step; audit entries |
| 11 | licence Active; conditions; certificate record; provisioning tasks completed |
| 13 | Entity 360 shows the licence, application, people, documents and payment; Person 360 shows each director's role and Fit & Proper outcome |

## Blockers: your decision is needed before execution
1. **Linking the applicant to the entity (stops step 1).** Normal registration creates its own new entity. That would give a second Rodney Bay record. The linking options are:
   - (a) a supported "claim existing entity" route in registration, if Entity Resolution (`/licensing/entity-resolution`) can match it. I will check this read-only first.
   - (b) an officer adds the applicant as primary user from the licensee screen (`/admin/licensees/cc331…`).

   If neither works, I stop. I will not insert that link directly in the database.
2. **No Credit Union fees.** Credit Unions currently has no fee set up, so step 6 has nothing to charge. Either you approve a fee to be added through Fee Management (you supply the amount), or the journey runs without payment and the demo shows "no fee".
3. **Entity already shows as active.** Stage A created the entity with status "active", the same as the other credit unions, but it has no licence yet. This may confuse Entity 360 until step 11. Do you accept that for the demo?
4. **Certificate risk.** Earlier, certificate generation was found failing for other licences ("Your certificate is being prepared"). If it fails here too, I will report it rather than work around it.
5. **Renewal and variation.** These need the new Credit Union post-licensing services switched on and their forms published. Both are outside what I'm authorised to do, so they stay out of Session 2 unless you approve them.

**Other points**
- **Regulator:** the application takes FSRA from the applicant's registration. The entity itself has no assigned officer yet. An officer can be assigned on screen at step 8.
- **Approval workflow:** the "Pre License Approval Workflow" is active, but it has no sector tag, so I'll check how Credit Union applications reach it during step 7 rather than assume it.

## Verification
- **Database, read-only:**
  - every record for this entity points to cc331, with nothing orphaned
  - each step's date is later than the one before
  - no one approved their own work
  - audit entries exist
  - the other credit unions' fingerprint is unchanged
- **Screens:** screenshots of Entity 360 and of each Person 360, plus the licensee view of `/licenses` signed in as the primary user.

## Rules for execution
- No direct inserts.
- No new entities beyond the existing one.
- No changes to code or settings.
- If any step fails, I stop and report, without retrying around the problem.
