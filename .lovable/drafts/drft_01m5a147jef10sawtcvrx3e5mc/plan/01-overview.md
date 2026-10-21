# Credit Union Post-Licensing: Revised Plan (analysis only)

Nothing is changed by this plan. Approving it only approves the design. Database writes need a second, explicit go-ahead after you review the record list in the Technical details section.

## Findings (verified read-only)
1. **Why the 19 services sit under Micro-credit.** *Micro-credit Institution* belongs to the **inactive legacy sector** *Micro-credit Institution*, not to *Credit Unions*. The sector alias map translates it to Credit Unions, but only for licence entitlement and returns. The service picker filters by the licence's own sector and sub-sector, so it doesn't use the map.
   - These records are historical. They were seeded on 2026-06-17/22 and 2026-08-27/29 in the 15-service rollout across 8 legacy sub-sectors.
   - Certification and configuration depend on them: 15 fee rows, 3 post-approval effect bindings and 5 configuration expectations.
   - None has ever been used by an application (0 applications).
   - Conclusion: this is **historical data with dependencies**, not a configuration error. It must stay untouched.
2. **Reuse is not possible through supported configuration.** A service has exactly one sector and one sub-sector, and the unique key is (sector, sub-sector, name). Re-pointing the legacy rows would break the fee, effect and expectation links and the legacy history. The only safe option is **new records under Credit Unions / Credit Union**, with names, workflows and document checklists copied from the legacy equivalents.
3. **Credit Unions has no services today** (0 records). The 4 Credit Union licences:
   - FSRA-SLU-2023-0002 has sub-sector *Credit Union*.
   - Three demo/AML licences (FSRA-DEMO-CREDIT_UNIONS, FSRA-DEMO-AML-04, FSRA-DEMO-AML-05) have **no sub-sector**. The picker falls back to sector-level matching for them, so they **would also see** the new services once those are active.
4. **Renewal already works elsewhere.** Licence Details has its own Renew flow, with in-flight duplicate checks, a renewal fee from Fee Management and an automatic validity date. A separate "Licence Renewal" post-licensing service would compete with it, so **no renewal service is created**. Renewal is reported as *Existing (Licence Details)*.
5. **Credit Union League** is out of scope and **will not receive** any of the new services.
