---
name: Enterprise UI/UX Standard
description: Standing rule for every new or modified screen — compact task-oriented enterprise layouts, no explanatory prose, shared PageHeader, canonical identifiers, consistent Lucide action icons, responsive registers
type: design
---

UI/UX quality is mandatory on every new or modified screen. Never compromise the Real Working System Rule while simplifying presentation; if an action is found to be mock/non-functional, report it as a functional defect instead of removing the control.

## Layout
- Compact, task-oriented enterprise layouts: page header → toolbar → content.
- No explanatory prose on screens. Detailed guidance belongs in contextual Help (`ScreenHelpLink`), tooltips, info popovers, empty-state guidance or the user manual.
- Page description: normally none; at most one short sentence when essential.
- Keep, never strip: warnings, validation messages, legal/regulatory explanation needed for a decision, reasons an action is blocked, material calculation/evidence information, important empty-state instructions.
- Cards only for meaningful KPIs, grouped case information, decision/action panels, exceptions needing attention — not decoration.
- Use the shared `PageHeader` (title + primary actions, optional back nav and help icon); never hand-build page titles.

## Toolbars and registers
- Listing screens: compact toolbar — search | primary filters | more filters | refresh/export. Filters sit next to their data and never consume large vertical space. Use the shared `RegisterToolbar`.
- Registers use `SupervisoryRegister`: canonical reference visible, sticky identifier/action, combined compact columns, mobile card layout, no nested horizontal scroll (shared `Table` already owns overflow).
- Show real canonical references prominently; copy controls only for technical UUID/work keys. Never manufacture UI identifiers.

## Action / icon standard (Lucide + shared Button)
Create/New `Plus` · Start `Play` · Open/View `ArrowUpRight`/`Eye` · Edit `Pencil` · Save `Save` · Submit/Send `Send` · Approve `Check`/`CheckCircle` · Return `Undo2` · Assign `UserPlus` · Search `Search` · Filter `SlidersHorizontal`/`Filter` · Refresh `RefreshCw` · Export/Download `Download` · Import/Upload `Upload` · Copy `Copy` · Schedule `Calendar` · Validate `ClipboardCheck` · Escalate `AlertTriangle` · Delete `Trash2` · More `MoreHorizontal`.
Primary/business actions show icon + visible text. Icon-only allowed only for obvious compact utilities (Copy, Close, More, Refresh) and must carry a tooltip/title and accessible label. Never use different icons for the same business action.

## Consistency
Standardise page spacing, heading hierarchy, button sizes, action placement, badge usage, filter heights, form section spacing, empty states and loading states. Extend existing shared primitives instead of introducing a new design system.

Reference implementation: AML/CFT operational screens under `src/pages/supervision/aml/`.

## Listing contract (permanent)
Every production register (queue, directory, registry, admin listing, audit list) must provide:
- **Sorting** on the columns an officer actually triages by, via the shared `SortableHeader` (UNSORTED `ArrowUpDown` → ASC `ArrowUp` → DESC `ArrowDown`, keyboard accessible, `aria-sort` on the `<th>`, never styled as a link, action column never sortable).
- **Filtering** next to the data (compact toolbar), never a tall filter panel.
- **Paging** via the shared `PaginationBar`: default 25, options 10/25/50/100, "Showing X–Y of Z", First/Previous/Page X of Y/Next/Last, hidden when the total fits one page; search, filter, sort or page-size change resets to page 1.
- **A real record count** from the server (or the complete bounded dataset) — never an invented total.
- **Stable identity**: `getRowId` from the canonical record id; never array indexes.
- **Canonical identifier first** and sticky, actions sticky right, responsive priority columns, mobile cards.
- **Sorting on raw canonical values only** (text natural, number numeric, date chronological, boolean defined order, risk supervisory ordinal, workflow stage lifecycle ordinal), nulls last in both directions, deterministic secondary sort on the canonical reference/id.
- **URL-persisted presentation state** (`q`, filters, `sort`, `dir`, `page`, `pageSize`) via `useListingState`, so Back restores the register. Business truth always stays on the server.

Modes: `client` (complete bounded dataset; the component sorts and pages) and `server` (the screen owns `count`/`order`/`range` or an RPC with `_page`, `_page_size`, `_sort_key`, `_sort_direction`, `_search`, `_filters`, whitelisting sort keys server-side and returning real rows + total). Presentation components never query a backend.

Pagination is **not** required for genuinely small bounded lists (methodology dimensions, tiny config lists, hierarchical/detail cards, dashboard preview lists with "View all"). Clickable column sorting is **not** required for dashboards, heatmap/matrix axes, tiny config lists, preview lists or detail cards.

Shared primitives: `src/components/shared/listing/` (`SortableHeader`, `PaginationBar`, `useListingState`, `sorting.ts`), consumed by `SupervisoryRegister` and `DataTableShell`. Extend these — never fork a new table model.
