## Deliverable: FRD Gap Analysis — Project Management Tracker (.xlsx)

An Excel workbook written to `/mnt/documents/FRD_Gap_Tracker.xlsx`, styled like a standard PM tracker (frozen header row, autofilter, colour-coded status, column widths, Arial). No code in the app is touched.

### Sheet 1 — `Summary Dashboard`
- Counts by status (Done / Partial / Missing / Not Applicable) per FRD module, driven by **formulas** (`COUNTIFS` against the tracker sheet), not hardcoded numbers.
- % complete per module and overall.
- Legend for status colours and severity.

### Sheet 2 — `Requirement Tracker` (the main sheet, point by point)
One row per FRD requirement (not per module), with these columns:

| Column | Content |
|---|---|
| Req ID | FRD reference (e.g. BOJ-LIC-001) |
| Module | Licensing / Registration / Complaints / Returns & Compliance / Prudential / Market Conduct / Workflow / RBAC / Notifications / Payments / Reporting / Audit |
| Requirement | The FRD requirement text, restated in one line |
| Status | Done / Partial / Missing |
| Evidence in system | Concrete artefact: page route, component, table, RPC, or edge function that satisfies it |
| Gap detail | Exactly what is absent or only partially implemented — specific, not "needs work" |
| Severity | Critical / High / Medium / Low |
| Effort | S / M / L |
| Phase | 1–4 (sequenced delivery) |
| Owner | blank for user to assign |
| Target date | blank |
| Notes | blank |

### Sheet 3 — `Delivery Plan`
Phased backlog rolled up from the Missing/Partial rows: phase, workstream, items included, dependencies, exit criteria.

### Sheet 4 — `Assumptions & Sources`
Where each "Done" claim was verified from (route file, migration, edge function, docs), so the sheet is auditable.

### How the content is produced
1. Re-read the four completed inventory reports from the earlier analysis turn plus the FRD document.
2. Map every FRD line item to code/DB evidence already gathered — no new assumptions; anything unverified is marked `Status = Unverified` rather than guessed.
3. Generate the workbook with `openpyxl`, recalculate formulas, then render each sheet to an image and visually QA for clipped text, wrong colours, and broken layout before delivering.

### Scope control
- Read-only on the repo and database. No application code, migrations, or config changed.
- Output is a single downloadable `.xlsx` artefact.
