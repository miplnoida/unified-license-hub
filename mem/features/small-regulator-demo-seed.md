---
name: SMALL-REGULATOR-DEMO-1 seed
description: Non-production demo staffing where the same people cover several regulatory functions; cleanup script restores the one-person-per-role certification fixture
type: feature
---

- Demo/validation data only, guarded by `is_production_environment()` (fails closed).
- Multi-function staff (existing certification identities only, no new accounts):
  - `licensing_supervisor@` — licensing + prudential + returns supervisor; leads TEAM-LICENSING /
    TEAM-PRUDENTIAL / TEAM-RETURNS, member of TEAM-INSPECTION.
  - `complaints_supervisor@` — complaints + conduct + enforcement supervisor; leads the three
    matching teams.
  - `fit_proper_supervisor@` — F&P + inspection supervisor; leads TEAM-FIT-PROPER / TEAM-INSPECTION.
  - `legal_counsel@` stays adviser/observer only — never given voting rights automatically.
- Demo records are prefixed `SMALLREG-MANUAL-` (supervision assignment reasons, examination
  `SMALLREG-MANUAL-EXM-001`, workpaper `SMALLREG-MANUAL-WP-001`).
- Configuration deliberately untouched: 0 activated mandates, 0 portfolios, Enforcement Appeals
  Panel stays NOT READY (2 voters / quorum 3), appeal independence policy stays unconfigured.
- Cleanup: `scripts/seeds/small-regulator-demo-1-cleanup.sql` removes only the added roles, team
  memberships, `SMALLREG-MANUAL-` assignments and the demo examination.
