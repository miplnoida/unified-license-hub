## Modules, expected counts and screens

The counts below are targets. Before each module, I check the table's required fields, write guards and the screen's filters. If a module would need a licence, an approval or a bypassed rule, I skip it and continue with the others.

### Session 2: Licensing and Entity 360
| Records | Count | Screen |
|---|---|---|
| Persons and entity roles: Denise St. Rose (GM), 3 directors, compliance officer | 5 | `/admin/entity-registry/cc331…` (Entity 360), Person 360 |
| F&P cases (open, unassessed) | 4 | `/fit-proper` |
| Fictional PDF documents (incorporation, bylaws, business plan, financial projections, AML policy, director CVs), uploaded and registered | 6 | Entity 360 → Documents |

Blocked: draft application, registration approval and hand-off, fee and payment, licence, conditions.

### Session 3: Prudential
| Records | Count | Screen |
|---|---|---|
| Quarterly returns Q4-2025 to Q3-2026, submitted with balance sheet and income figures | 4 | `/returns`, Entity 360 |
| Prudential ratios (capital, liquidity, delinquency) | per return | Prudential dashboard |
| Prudential assessment (draft or under review, **no approved rating**) | 1 | `/prudential` |
| Supervisory plan, 2026 | 1 | Supervisory plans |
| Examination, findings, corrective actions (in progress) | 1 / 3 / 3 | `/examinations` |

AML/CFT is excluded (frozen).

### Session 4: Market Conduct and Enforcement
| Records | Count | Screen |
|---|---|---|
| Member complaints in mixed statuses | 5 | `/complaints` |
| Conduct investigation with evidence items | 1 / 3 | Conduct investigations |
| Conduct findings | 2 | Conduct findings |
| Enforcement referral (open) | 1 | Enforcement |
| Remediation and monitoring items | 2 | Conduct monitoring |
| Dashboards | from the above | Executive and management reports (no separate seeded aggregates) |

### Safety and verification
- **Before and after:** I take entity and party counts (91 and 138) and fingerprints of existing records. If any existing row changes, I stop.
- **Excluded:**
  - no approvals, payments, licences, risk ratings or audit entries
  - no destructive or reset functions
  - no code, schema, rule or configuration changes
- **Afterwards:**
  - check each screen in the browser
  - report back with record IDs, counts, URLs, screen results and remaining blockers
