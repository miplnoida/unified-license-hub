# Stage B, Session 2: read-only check results and revised steps

Nothing was changed. Every finding below comes from reading the screens' code and the stored records.

## Check results
| Check | Result |
|---|---|
| Which ID to use | **Entity 360, licence links and applicant binding all use the registry ID `cc331000-…-000000000001`.** The entity ID `cc330000-…-000000000001` is only the underlying party record. Screen address: `/entities/cc331000-0000-4000-8000-000000000001`. |
| Claiming the existing entity | **Supported.** Registration's entity step matches an existing entity or sends it for regulator review. An officer with the entity-resolution permission then chooses "resolve to existing" (a checker also approves when the case requires it). No second entity is created. Our entity has no registration number stored, so an automatic match is unlikely. The officer review path is the expected route. |
| Officer adding the applicant | **Also supported, as a fallback.** On the entity's Web Users tab, an officer with user-creation permission adds the primary user. This creates the account and its approved link to the entity. Making that user the primary point of contact (PPOC) is a separate step on the PPOC screen, which requires an admin. |
| "Active" status | **Acceptable.** Entity 360 shows "Active", not "Licensed". Licences are listed separately and today it says "No licences recorded for this entity". |
| Credit Union licence form | **Published**, version 2, linked to Credit Unions → Credit Union, with 21 questions in 3 sections. |
| Fee and payment | **Blocker.** The application screen accepts a zero fee, but the final submission check on the server still demands a completed payment and refuses without one. Credit Unions has no fee set up, so submission will fail. There is no legitimate no-fee path today. |
| Approval workflow | **Blocker.** Credit Union applications are labelled "Credit Unions - Credit Union - …". Neither active licence workflow matches that label: one is for "general", the other for "Insurance", and "general" is not treated as a catch-all. Submission would stop with "business configuration required". |
| Certificate | **At risk.** 16 certificate tasks and 16 portal-access tasks are stuck as failed (latest 20 Oct, 21:32 UTC) with only a generic error. This would be reported, not bypassed. |

## Remaining blockers (each needs your decision; none is changed by me)
1. **Payment rule:** either a Credit Union licence fee is configured through Fee Management, or the server rule is changed to allow a genuine no-fee case. Both are outside today's authorisation.
2. **Approval workflow:** a Credit Union pre-licence workflow must exist, or an existing one must be scoped to Credit Unions. Also outside authorisation.
3. **Certificate failures:** the cause needs investigating separately (it affects other licences too).

Until 1 and 2 are resolved, the journey can only reach **"application filled in and saved as draft"**. It cannot be submitted, reviewed, approved or licensed.
