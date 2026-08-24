---
name: Operating Structure simplified information architecture
description: Administration → Operating Structure uses 4 primary tabs; organisational units, authority/mandates and history live behind an Advanced sheet
type: design
---

- Primary tabs only: **Overview, People & Responsibilities, Sector Coverage, Decision Bodies**.
  - Sector Coverage is the key admin view: sector cards with sector lead, areas covered X/Y,
    supporting staff **grouped by person**, entity count and coverage health
    (COMPLETE / PARTIAL / NO LEAD / NO COVERAGE). Entity ownership is a secondary view toggle.
  - Never infer team coverage from a shared regulator — no "N teams" unless genuine coverage exists.
- **Advanced** sheet (single entry button) holds three tabs: *Organisational Units* (former Teams
  administration), *Authority & Governance* (regulators, mandates, enforcement) and *History*
  (ended responsibilities/memberships, historical regulators).
- Vocabulary: team → **organisational unit** (groups staff, grants nothing); regulatory function →
  **area of work**; portfolio → **responsibility**.
- Decision Bodies (formerly Panels & Committees) show ACTIVE/INACTIVE, COMPOSITION READY / NOT READY,
  POLICY CONFIGURED / NOT CONFIGURED — never a generic "Cannot sit" at configuration level; actual
  case eligibility stays case-specific.
- Single regulator: no regulator selectors in normal UI; the regulator name shows once in the page
  header. Responsibility dialog keeps units/dates/notes in a collapsed Advanced section, team optional.
- Unchanged: all writes go through governed SECURITY DEFINER routines (incl. the atomic multi-area
  batch save, one staff_portfolio per function); no client DML; RBAC and authority model untouched.
