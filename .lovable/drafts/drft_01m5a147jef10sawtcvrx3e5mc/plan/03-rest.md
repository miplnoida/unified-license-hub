## Session 3 — Prudential

| # | Screen URL | Action | Role | Depends on | State |
|---|---|---|---|---|---|
| 9 | `/admin/returns/configurations` | Add quarterly filing configuration: Credit Unions sector, FSRA, linked to FSRA_CREDIT_UNIONS_QTR, due 30 days after quarter end | Returns Supervisor (`returns_supervisor@`) | your approval | Awaiting approval |
| 10 | `/admin/returns/schedule` | Confirm Rodney Bay obligations Q4-2025 to Q3-2026 generated from its licence | Returns Officer | 7, 9 | Blocked |
| 11 | `/compliance/returns/submit` | File 4 quarters with capital, liquid assets, short-term liabilities, gross loans, non-performing loans | New applicant (now licensee) | 10 | Blocked |
| 12 | `/admin/returns/queue/:id` | Validate/accept each filing | Returns Officer → Returns Supervisor | 11 | Blocked |
| 13 | `/admin/returns/prudential/ratios` | Check capital adequacy, liquidity and NPL (delinquency) ratios for Rodney Bay | Prudential Analyst | 12 | Blocked |

Returns attach to Rodney Bay automatically through its licence; no manual linking.

## Session 4 — Conduct (assignments need your go-ahead)

| # | Screen URL | Action | Role (eligible accounts) | Depends on | State |
|---|---|---|---|---|---|
| 14 | `/conduct/findings/:id` for CF-CU-DEMO-2026-01 and -02 | Set owner | Conduct Analyst (`conduct_analyst@`) as owner, assigned by Conduct Supervisor (`conduct_supervisor@`) | your approval | Ready on approval |
| 15 | `/enforcement/:id` for ENF-CU-DEMO-2026-01 | Assign officer | Enforcement Officer (`enforcement_officer@`), assigned by Enforcement Supervisor (`enforcement_supervisor@`) | your approval | Ready on approval |

## Decisions you need to give
1. Approve fee (step 4), workflow (step 5) and return configuration (step 9).
2. Approve the assignments in steps 14–15.
3. Confirm you will run step 1 yourself (it needs the email OTP).

## Technical notes
- Before steps 14–15, the assignment controls on those two pages will be confirmed and any narrower eligibility list they show takes precedence.
- Step 7 issues the licence only through the workflow; payment only via the existing simulation.
