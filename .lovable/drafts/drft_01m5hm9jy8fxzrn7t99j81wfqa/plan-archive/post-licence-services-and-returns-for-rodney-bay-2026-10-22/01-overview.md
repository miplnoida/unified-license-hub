## Post-licence services and returns for Rodney Bay

### What I found (checked just now)
- **Correction:** I said before that the three services had no form. That was wrong. Each one has a published form linked to it: "CU - Variation of Licence Conditions", "CU - Change in Authorized Activities" and "CU - Change of Compliance Officer / MLRO". All three are Saint Lucia FSRA forms.
- **Why the page says "No form configured":** the primary user's header is set to *Apex Commercial Bank Regulatory Authority*. The page only looks for forms under that header authority, so it never finds the FSRA forms.
- **Second problem:** the server returns all 15 Credit Union post-licence forms, not just the one for the chosen service. Once the first problem is fixed, a request would open with 15 forms attached unless the page keeps only the chosen service's form.
- **Returns:** the "Credit Unions - Quarterly Return" is set up and published. Rodney Bay has no filing schedule yet, so nothing is due. Its first eligible quarter is Q4 2026, which ends 31 Dec 2026.

### What I will change (screen logic only, no database or permission changes)
1. On the new post-licence request page, look up forms using the **licence's own regulator**, not the header choice. This follows the existing rule that the sector's regulator wins.
2. Keep only the form(s) linked to the chosen service. If none match, use the existing fallbacks as today.
3. Add tests for both cases:
   - Header set to another authority: the FSRA form is still found.
   - Variation of Licence Conditions: exactly one form opens, not 15.

### Then, as rbc_primary_user, using normal screens
4. Create the three drafts (Variation of Licence Conditions, Change in Authorized Activities, Change of Compliance Officer / MLRO) with clearly fictional answers. Save them as drafts only: no submission, no payment.
5. Open the returns page and confirm what the user sees: the published return and no due periods. Nothing is filed or backdated.
6. Report Session 2 readiness.

### Not included
- Creating a filing schedule for Rodney Bay is an admin setting and would make real return periods. I won't do it unless you approve it separately.
- The server-side form lookup stays as it is. Making it filter by service would need a database change, so I'll describe it only.
