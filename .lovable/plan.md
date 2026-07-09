## Prudentially Supervised Entities — Column Reference & Badge Colors

### Column meanings (as shown in `/prudential/entities`)

| # | Column | What it shows | Source |
|---|--------|---------------|--------|
| 1 | **Entity** | Licensee (supervised institution) name. Clickable via the "Open" action. | `licensees.name` |
| 2 | **License** | Current license status of the entity (Active / Suspended / Revoked / Expired). | `licenses.status` |
| 3 | **Systemic** | Systemic-importance classification of the entity (e.g. D-SIB / Non-SIB). Indicates supervisory priority. | `licensees.systemic_importance` |
| 4 | **Latest rating** | Most recent supervisory risk rating from the last prudential assessment (e.g. Low / Moderate / High / Critical). | `prudential_assessments.overall_rating` |
| 5 | **Worst breach** | Highest severity among currently open threshold breaches on prudential ratios (critical / high / medium / low). | `return_threshold_breaches.severity` (max) |
| 6 | **Breaches** | Count of open (unresolved) threshold breaches across all monitored ratios. | `return_threshold_breaches` where status = open |
| 7 | **Open actions** | Count of supervisory actions currently open against the entity (directives, requirements, follow-ups). | `prudential_actions` where status ∈ open |
| 8 | **Overdue** | Subset of open actions whose due date has passed. Highlighted red when > 0. | `prudential_actions` where due_date < today |
| 9 | **Escalations** | Open escalations raised for the entity (auto or manual) awaiting resolution. | `prudential_escalations` where status = open |
| 10 | **Stress** | Open stress-test / early-warning indicator events flagged for the entity. | `prudential_stress_events` where status = open |
| 11 | **Last return** | Date of the most recently submitted regulatory return. Blank if none filed. | `returns_filed.submitted_at` (max) |
| 12 | **Open** | Link into the entity's full prudential profile. | Route: `/prudential/entities/:id` |

### Badge color updates (visual only, semantic tokens)

Currently plain/outlined badges are used for License, Systemic, Latest rating, and Last return status. Apply consistent severity coloring:

- **License status** (col 2)
  - `active` → emerald (success tone)
  - `suspended` → amber (warning)
  - `revoked` → destructive (red)
  - `expired` → muted / neutral

- **Systemic importance** (col 3)
  - `d-sib` / `systemic` / `high` → destructive tone (draws attention to systemic risk)
  - `medium` → amber
  - `low` / `non-sib` → neutral outline

- **Latest rating** (col 4) — currently plain text, wrap in Badge with same palette as risk levels
  - `critical` → destructive
  - `high` → amber-strong
  - `medium` / `moderate` → amber-soft
  - `low` → emerald

- **Worst breach** (col 5) — keep existing `RISK_TONE` mapping but strengthen contrast for `high` (distinct amber-700 bg vs medium) and add `border` for accessibility.

- **Latest return status** filter chip → not on the row today; add a small status Badge next to the Last-return date:
  - `approved` → emerald
  - `submitted` / `under_review` → blue/info
  - `rejected` → destructive
  - none → muted "—"

### Implementation

1. Add a header tooltip (info icon) on each column heading with the one-line definition from the table above so users see the meaning inline. Uses existing `Tooltip` component.
2. Introduce local tone maps in `PrudentialEntitiesList.tsx`:
   - `LICENSE_TONE`, `SYSTEMIC_TONE`, `RATING_TONE`, `RETURN_STATUS_TONE` — all using semantic Tailwind tokens (`bg-emerald-500/10 text-emerald-700 border-emerald-200`, `bg-amber-500/10 text-amber-700 border-amber-200`, `bg-destructive/10 text-destructive border-destructive/30`, `bg-blue-500/10 text-blue-700 border-blue-200`, `bg-muted text-muted-foreground`).
   - Apply via `<Badge variant="outline" className={TONE[value]}>`.
3. Wrap "Latest rating" value in a Badge (not plain text).
4. Add a small colored Badge for `last_return_status` next to the date.
5. No data, hook, or route changes — presentation only.

### Files touched

- `src/pages/prudential/PrudentialEntitiesList.tsx` (only file).

### Out of scope

- No changes to `usePrudentialEntities`, RLS, or DB.
- No new columns; existing columns retained.
- No changes to filters other than color-consistency with row badges.