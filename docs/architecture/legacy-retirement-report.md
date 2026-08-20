# Legacy Retirement Report — RDM-ENTITY-001

Inventory of legacy artefacts superseded by the canonical regulatory data model, and their current
state after the Wave D cutover.

## 1. Retired routes

| Legacy route | Replacement | State |
| --- | --- | --- |
| `/entities/:entityId` (Structure Hub) | `/entities/:entityId` → Entity 360 | Cut over |
| `/entities/:entityId/360` | `/entities/:entityId` | Redirect retained for bookmarks |
| Structure Hub as directory landing | `/entities/:entityId/structure` | Moved, linked from 360 |

## 2. Retired data paths

| Legacy artefact | Canonical replacement | State |
| --- | --- | --- |
| `licensees` as sole entity record | `parties` / `organizations` + `licensees.id` as entity UUID | Transitional rule retained by design |
| Licence number used as entity identifier | `entity_identifiers` + `normalize_entity_identifier()` | Retired |
| Legacy licence rows unlinked to entities | `entity_licenses` (`effective_from NOT NULL`) | Backfilled, 28 links |
| Descriptive identifier normalisation | Engine-led `normalization_strategy` | Retired |
| `returns_filed` legacy table | `return_filings` + `filing_versions` | Zero legacy rows |
| Ad-hoc supervisory tables without `entity_id` | `entity_supervision_assignments`, `aml_assessments`, `resilience_arrangements` | Retired |

## 3. Retired demo/business data

`public.cert_reset_nonproduction_business_data_v1()` removed 79,758 disposable business rows using
`cert_reset_dependency_order()`, preserving the access backbone. The environment now contains only
CERTIFICATION DATASET v1 plus intentional system/reference configuration.

## 4. Deletion protection

Entity deletes are `RESTRICT`-guarded to preserve lineage; merges are recorded in `entity_merges`
rather than by deleting the absorbed entity.

## 5. Remaining compatibility surfaces (intentional)

- `licensees.id` remains the local regulatory entity UUID (documented transitional rule).
- `/entities/:entityId/360` redirect.
- JSONB fallbacks in the form engine for pre-normalisation submissions and historical version
  rendering.

These are deliberate compatibility surfaces, not open migration debt.
