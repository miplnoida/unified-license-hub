# Enterprise list & grid inventory

Purpose: track every list surface in the platform against the single grid
standard (`src/components/data-grid/EnterpriseDataGrid.tsx`) and the semantic
presentation layer (`src/lib/presentation/*`, `src/components/presentation/*`).

## The standard

A migrated list must:

1. render through `EnterpriseDataGrid` with a declared `GridColumn` model;
2. show business values only — labels via `StatusBadge` / `presentStatus`,
   dates via `formatDate` / `formatTimestamp`, amounts via `formatNumber` /
   `formatCurrency`; no raw enum keys, no `JSON.stringify`, no bare UUIDs;
3. provide explicit loading, empty, error and restricted (no-permission) states;
4. keep row actions reachable in a sticky right-hand column with one visible
   primary action;
5. support global search, per-column filters, sorting, column choice and export;
6. persist page/size/sort/search/filter state (URL for standalone queues,
   in-memory for embedded panels).

## Priority 1 — operational queues

| Surface | Route | Status |
| --- | --- | --- |
| Regulated Entity Directory | `/entities` | Migrated |
| Entity 360 domain sections (19 domains) | `/entities/:entityId` | Migrated (semantic columns per domain) |
| Returns filing queue | `/returns/queue` | Pending |
| Entity obligations workbench | `/returns/obligations` | Pending |
| Licensing application queue | `/admin/applications` | Pending |
| Post-licensing applications | `/admin/post-licensing-applications` | Pending |
| Complaints / conduct case queue | `/complaints` | Pending |
| Registration review queue | `/admin/registrations` | Pending |

## Priority 2 — administration & configuration

| Surface | Route | Status |
| --- | --- | --- |
| User management | `/admin/users` | Pending (`DataTableShell`) |
| Regulator management | `/admin/regulators` | Pending (`DataTableShell`) |
| Web user management | `/admin/web-users` | Pending (`DataTableShell`) |
| PPOC management | `/admin/ppoc` | Pending (`DataTableShell`) |
| Master data management | `/admin/master-data` | Pending (`DataTableShell`) |
| Master configuration | `/admin/master-configuration` | Pending (`DataTableShell`) |
| Notification templates | `/admin/notification-templates` | Pending (`DataTableShell`) |
| Licence appeals register / panels | `/admin/appeals*` | Pending (`DataTableShell`) |
| Return groups, rules, validations, structures, scheduling | `/admin/regulatory-data-model/reporting/*` | Pending (`DataTableShell`) |
| Prudential ratios & thresholds | `/admin/regulatory-data-model/reporting/*` | Pending (`DataTableShell`) |
| Pre/post-licensee billing | `/billing/*` | Pending (`DataTableShell`) |
| Mail & SMS log | `/admin/mail-sms` | Pending (`DataTableShell`) |
| Report output tables | `/reports/:id` | Pending (`DataTableShell`) |
| Application form settings | `/settings/application-forms` | Pending (`DataTableShell`) |

`DataTableShell` remains in place for surfaces not yet migrated. It is
deprecated: no new list should adopt it, and each migration removes one more
usage until the component can be deleted.

## Entity 360 semantic redesign

- Persistent entity header (`Entity360Header`): name, authorisation status,
  identity verification, systemic importance, collapsed classification, risk
  band and score, supervisor, supervisory cycle, reporting position, plus an
  explicit banner whenever a historic "as at" view is active.
- Grouped navigation replaces the 19-tab strip: Identity & authorisation,
  Ownership & control, Reporting & obligations, Prudential & risk, Conduct &
  financial crime, Supervisory action, Records & provenance — each group only
  lists the sections the signed-in role may read.
- Overview dashboard (`Entity360Overview`) answers authorisation, reporting,
  risk and outstanding-action questions with tiles that navigate to the owning
  domain, alongside an identity definition list and the licences held.
- Each domain renders through `Entity360SectionView` with the declared columns
  in `sectionCatalogue.tsx`; unexpected backend fields are appended as
  hidden-by-default columns rather than dropped, and structured values are
  never stringified.
- Regulatory history (`Entity360TimelinePanel`) presents the cross-domain
  timeline with domain filters.
