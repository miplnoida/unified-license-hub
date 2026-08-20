# Final Certification Report — Wave D Cutover

Program: RDM-ENTITY-001 · Baseline: CERTIFICATION DATASET v1 · Scope: Wave D closure

## 1. Dataset census (live)

| Domain | Count |
| --- | --- |
| Regulated entities (E01–E20) | 20 |
| Cohort applications | 27 |
| Entity–licence links | 28 |
| Return filings | 112 |
| Supervision assignments | 20 |
| AML/CFT assessments | 7 |
| Examinations | 9 |
| Enforcement cases | 6 |
| Market-conduct complaints | 7 |
| Correspondence threads | 36 |
| Entity documents | 40 |
| Role grants preserved | 95 |

`public.cert_verify_dataset_v1()` reports **failure_count: 0**.

## 2. Contamination checks

- No business records outside the certification cohort.
- No legacy supervisory rows without `entity_id`.
- No dangling entity memberships.
- Access backbone (auth users, role grants, integration connections) preserved through the reset.

## 3. Route cutover

| Route | Destination |
| --- | --- |
| `/entities/:entityId` | Entity 360 (canonical profile) |
| `/entities/:entityId/structure` | Entity Structure Workspace |
| `/entities/:entityId/360` | Redirect to canonical profile (legacy bookmarks) |

The Entity Directory now exposes a single primary destination per row (Entity 360); the Structure
Workspace is reached from within the 360 profile and links back to it.

## 4. Section authorization

`entity360_overview`, `entity360_section`, `entity360_timeline` and `entity360_as_of` gate every
section through `e360_section_allowed`, which admits internal staff via `public.is_internal_staff`.
Staff who additionally hold an external portal role are no longer refused (internal/external role
collision resolved). Sections a user cannot see are omitted from the payload, not merely hidden in
the UI.

## 5. Status normalisation

Returns, obligation and filing summaries compare status values case-insensitively
(`lower(status) = '…'`), so counts are stable regardless of stored letter case.

## 6. Navigation integrity

`scripts/validate-nav-icons.mjs`: **173 active navigation items, all icons approved** (the
`nav_admin_rdm_reporting` item was corrected to an approved chart icon).

## 7. Known outstanding items (pre-existing, not introduced by this wave)

- Frontend test suite carries legacy debt: `sidebarVisibility` specs render `Sidebar` without a
  `QueryClientProvider`; `routeCoverage` reports 14 routes present in guards but absent from
  `ROUTE_MODULE_MAP`; `actionCoverage` reports 226 unguarded action sites against a 100% floor.
- Database linter baseline: SECURITY DEFINER function exposure warnings and leaked-password
  protection disabled. These are platform-wide baseline findings, unchanged by this wave.

## 8. Readiness decision

Data model, Entity 360 read model, route cutover and dataset integrity are **certified**. The
outstanding items above are frontend/test-governance debt and platform auth settings; they should be
burned down before a production go-live sign-off.
