---
name: Saint Lucia FSRA sector model
description: Canonical FSRA regulator, nine active sectors with display groups, and retired legacy sectors kept for history
type: feature
---
Reference deployment is Saint Lucia FSRA (single active regulator record, code `FSRA`).

Active sectors (`sectors.code`, grouped by `sectors.display_group`):
- DOMESTIC_FINANCIAL_SECTOR: DOMESTIC_INSURANCE_PENSION, CREDIT_UNIONS, MONEY_SERVICES_BUSINESS, SAINT_LUCIA_DEVELOPMENT_BANK
- INTERNATIONAL_FINANCIAL_SECTOR: INTERNATIONAL_BANKING, INTERNATIONAL_INSURANCE, INTERNATIONAL_MUTUAL_FUNDS, REGISTERED_AGENTS_TRUSTEES
- OTHER_NEW_REGULATED_SECTOR: VIRTUAL_ASSET_BUSINESS

Rules:
- FSRA does NOT supervise domestic commercial banks (ECCB does). Commercial Bank, Building Society, Securities Dealer, Merchant Bank, Payment Service Provider, Micro-credit Institution, Money Service Business, General/Life Insurance, Pension Fund Administrator, Financial Group/Holding Company are `inactive` with a `scope_note` (and `external_regulator` where relevant). Never delete them — certification history depends on them.
- Licence classes (MSB A–F, International Bank A/B, international insurance A1/A2/B/C1/C2) are classifications, not sectors. Insurance/mutual-fund/agent types are sub-sectors, never top-level sectors.
- Normal selectors use `useActiveSectors` / `useActiveSubSectors`; grouping (`SECTOR_GROUP_ORDER`/`SECTOR_GROUP_LABELS`) is presentational only and grants no permission.
- Demo entities are synthetic and tagged `(SAINT-LUCIA-FSRA-DEMO)`.
- Seed identifier: SAINT-LUCIA-FSRA-SECTOR-MODEL-1 (idempotent).
