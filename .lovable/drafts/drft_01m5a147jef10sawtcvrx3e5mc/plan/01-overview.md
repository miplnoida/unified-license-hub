# Credit Union Post-Licensing Services and Forms

## What exists today (checked)
- Sector **Credit Unions** is active, with active sub-sectors **Credit Union** and **Credit Union League**.
- All 19 existing Credit-Union-family post-licensing services (Renew, Change of Address, Director Appointment, etc.) and their 19 forms are attached to the **inactive** sub-sector *Micro-credit Institution*. Active Credit Union licences therefore see none of them on the New Post-License Application page.
- The active sub-sectors have zero services and zero forms today.

## Approach (configuration only, no schema, no code)
1. **Map**: Reuse the existing service wording and workflow patterns where a match exists. Map the 16 requested services onto the active **Credit Union** sub-sector as new service records. Old Micro-credit records stay as they are because certification history depends on them.
2. **Forms**: Create one form per service in Form Builder structures, scoped to Credit Unions / Credit Union / that service. Each form contains:
   - a read-only Licence and Entity block
   - Proposed Change, Reason and Effective Date
   - service-specific fields
   - Supporting Documents
   - Declaration
   All forms stay in **Draft**. Nothing is published.
3. **Workflow**: Link each service to the existing post-licensing workflow patterns: Standard, Enhanced, Fit and Proper, or Notification. Workflows are not created or edited.
4. **Fees**: No fee rows are created, because the brief forbids invented fees. Every service is reported as **Fee: Requires regulatory confirmation**.
5. **Approval vs notification**: Proposed classification is based on existing request types. Each item is flagged "Requires regulatory confirmation".

Draft forms do not appear to applicants. This means the end-to-end checks at `/post-license/new` and `/applications/queue` can only be checked partly until a reviewer publishes the forms and approves the fees. The report will say exactly what was and wasn't verified.
