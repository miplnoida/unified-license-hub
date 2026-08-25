---
name: Canonical sector alias map
description: Retired legacy sectors resolve to active FSRA sectors via sector_alias_map for licence entitlement and returns obligation matching
type: feature
---
`public.sector_alias_map` (legacy_sector_id UNIQUE -> active_sector_id, is_active, note) is the single source of truth for mapping retired sectors onto active FSRA sectors. Resolver: `public.sector_effective_id(sector_id)` (SECURITY DEFINER, authenticated + service_role only).

Approved mappings:
- Commercial Bank, Merchant Bank, Financial Group, Financial Holding Company -> International Banks
- Building Society, Micro-credit Institution -> Credit Unions
- Life Insurance, General Insurance, Pension Fund Administrator -> Domestic Insurance & Pension
- Money Service Business, Payment Service Provider -> Money Services Business
- Securities Dealer -> International Mutual Funds

Rules:
- Never mutate licence records or sector reference data to achieve mapping; resolve through the map.
- `can_act_on_license` accepts a match when the licence's effective sector equals the requested effective sector (direct equality still accepted first).
- `returns_derive_entity_obligations` builds the entity's sector set from `licensees.sector_id` plus every licence linked by `licenses.holder_id`, `licensees.license_id` or `entity_licenses` (statuses active/approved/issued/valid/in_good_standing), each resolved through the map, and records the rule's own `effective_from` so historic periods are not skipped.
- Returns configuration remains scoped to the 9 active sectors only; entities in unmapped sectors correctly get no obligations.
