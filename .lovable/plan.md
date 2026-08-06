# PRU-GRP-001 — Financial Group Consolidated Risk Profile

Close the four gaps recorded in the v4 tracker for Prudential Supervision → Financial Group. Nothing outside the group feature is touched.

## Current state (verified)

- No group tables exist in the database: the only `%group%` table is `document_groups`, and there are no exposure or consolidation tables.
- `entity_relationships` exists (entity → related entity, type Parent/Subsidiary/Associate…, ownership %) and is surfaced only as a flat table on the entity detail Relationships tab. It has 0 rows today and no group identity, no tree, no consolidation.
- `PrudentialEntityProfile` has 10 tabs (Overview, Returns, Ratios, Breaches, Assessments, Actions, Escalations, Stress, Peers, Audit) — the FRD's **Group Structure** tab is absent.
- Building blocks that the group view can aggregate already exist: `return_calculated_ratios`, `return_threshold_breaches`, `prudential_assessments.ratings` (CAMELS jsonb), `entity_risk_scores` (per-entity score/band/components).

## What will be built

### 1. Group structure model
New tables:
- `financial_groups` — group code, name, ultimate holding entity, sector, supervisory lead, status.
- `financial_group_members` — group, licensee, parent member (self-reference → tree), member role (ultimate_holding / subsidiary / associate / joint_venture / branch), ownership %, consolidation treatment (full / proportional / equity / excluded), effective and end dates.
- `group_consolidation_methods` — versioned, configurable methodology per group: which ratio keys roll up, aggregation rule per ratio (sum, weighted average by total assets, weighted by capital), and which exposure types are eliminated. Version number is stamped onto every snapshot (R-PRU-024).

Group membership is derived into the existing `entity_relationships` view of the world without changing it; relationships remain as-is for licensing use.

### 2. Intra-group exposure roll-up
- `intragroup_exposures` — group, from-entity, to-entity, exposure type (loan / deposit / capital / guarantee / other), amount, currency, as-of period, source (manual entry or return reference), captured-by.
- A matrix builder returns the full N×N exposure grid for a period, flags large exposures above a configurable % of group capital, and detects circular chains (A→B→C→A) with a recursive walk.
- Netting: eliminations per exposure type feed the consolidated figures so group totals are net of intragroup positions, exactly as R-PRU-024 requires.

### 3. Consolidated group risk score and ratios
- `group_consolidated_snapshots` — group, period key, consolidated ratio values, elimination totals, methodology version, computed at/by.
- `group_risk_scores` — group, period key, consolidated score, band, component contributions (per-member score, member weight, contagion uplift), so the number is explainable rather than opaque.
- Score rule: member `entity_risk_scores` weighted by consolidated total assets (equal weight fallback when assets are unavailable), plus an uplift driven by large/circular intragroup exposure concentration. No invented values — missing inputs are reported as unavailable instead of defaulting to zero.

### 4. Group-level breach and EWI view
- `group_ewi_alerts` — configurable group early-warning indicators, with EWI-007 ("two or more subsidiaries rated High or above") seeded, fired automatically when a member risk band changes (R-PRU-025).
- Group breach view aggregates member `return_threshold_breaches` for the period into one list, attributed per subsidiary, alongside consolidated-ratio breaches against group thresholds.

### 5. Screens
- **`/prudential/groups`** — group register: code, name, holding entity, member count, consolidated band, open group EWIs, last computed period.
- **`/prudential/groups/:id`** — the PRU-GRP-001 profile:
  - Group header (holding company, sector, supervisory lead, consolidated risk badge).
  - **Group structure diagram** — org-chart tree: ultimate holding at top, subsidiaries, associates/JVs; each node shows entity code, name, sector, risk band badge, license status; clicking a node opens that entity's prudential profile.
  - **Consolidated ratios panel** — ratio cards with value, threshold status, trend vs prior period, and the methodology version used.
  - **Intra-group exposure matrix** — N×N table, large exposures highlighted, circular chains listed explicitly.
  - **Subsidiary risk heatmap** — members (rows) × CAMELS components (columns), coloured from the latest approved `prudential_assessments.ratings`.
  - **Group EWI alerts panel** — all active group EWIs with the condition that fired.
  - **Group breaches** — consolidated list of member and group-level threshold breaches for the period.
  - **Contagion analysis** — deterministic transmission-channel summary (which member, which channel, exposure magnitude, estimated group impact), with an AI-written narrative on top using the platform AI gateway; the deterministic figures remain visible when AI is unavailable.
  - Actions: recompute period, **Group CAMELS Assessment** (creates a group-scoped assessment on the holding entity via the existing assessments flow), export profile.
  - Manage mode for authorised roles: create/edit group, add and re-parent members, record exposures, edit consolidation methodology (new version on save).
- **Entity profile → new "Group Structure" tab**, shown only when the entity is a group member: mini tree, its role in the group, consolidated group metrics summary, and a link through to the group profile. The existing ten tabs are untouched.
- Sidebar entry "Financial Groups" under Prudential Supervision, permission-gated like the other prudential routes.

### 6. Access, audit, verification
- RLS mirrors the existing prudential pattern: read via `can_read_prudential_entity`-style scoping on group members (a supervisor mapped to any member can read the group), writes gated by `prudential_supervision` edit/workflow permissions and `can_act_on_prudential`. GRANTs issued for every new table.
- Audit events: `GROUP_PROFILE_VIEWED`, `GROUP_CONSOLIDATED_RECOMPUTED`, `GROUP_STRUCTURE_UPDATED`, `INTRAGROUP_EXPOSURE_RECORDED`, `GROUP_EWI_FIRED`, `GROUP_PROFILE_EXPORTED`.
- Tests: pgTAP for netting arithmetic, circular-exposure detection, EWI-007 firing, and member-scoped RLS; vitest for the consolidation/weighting and heatmap helpers. Added to the existing CI test globs.

## Technical notes

- Consolidation is computed in Postgres (`prudential_group_consolidated(_group_id, _period_key)` returning tree + ratios + matrix + heatmap + EWIs in one payload, plus a `group_consolidated_recompute` writer) so the same numbers serve UI, export and tests. No edge function is required except the AI narrative call.
- The org chart is rendered with existing UI primitives and Recharts — no new charting dependency.
- Migrations follow the four-step order: create table → GRANT → enable RLS → policies. No changes to `entity_relationships`, returns, assessments, or any existing screen behaviour beyond adding the one new tab.
