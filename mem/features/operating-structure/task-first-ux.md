---
name: Operating Structure task-first assignment UX
description: Sector lead/supporting staff/panel member assignments use small dedicated dialogs; applicable sector areas come from one resolver
type: design
---

- **One resolver** (`sectorAreas.ts` → `useApplicableSectorAreas`) is the single source of truth for
  "applicable areas of work" per sector: active functions, global-scope areas excluded, regulator
  mandates respected. Coverage denominators, sector-lead determination and every assignment dialog
  use it — nothing recomputes its own denominator.
- **Task-specific dialogs only** (no generic configuration dialog on the everyday path):
  - `SectorLeadDialog` — fixed sector, pick person, Full sector vs Specific areas.
  - `SupportingStaffDialog` — fixed sector, pick person, area multi-select.
  - Sector cards → `SectorCoverageSheet` ("Manage") showing Lead / Supporting staff / entity counts
    with inline Add, Edit, Remove.
  - People & Responsibilities → "Add responsibility" asks first: **A sector** vs **Specific work**
    (sub-sectors/entities, the advanced `ResponsibilityDialog`).
  - Decision Bodies are roster-first: Chair / Voting members / Adviser / Observers listed with inline
    Remove and a 3-field "+ Add member" dialog. Panel activation is shown separately from
    composition readiness and policy configuration.
- Target: sector lead, supporting staff and panel member each assignable in ≤ 3 selections.
- **Access clarity**: `AccessStatusNote` shows NEEDS ACCESS REVIEW with a link to User Management when
  a person holds no roles. Responsibility records never grant permissions; all writes still go through
  governed SECURITY DEFINER routines (incl. the atomic multi-area batch save).
