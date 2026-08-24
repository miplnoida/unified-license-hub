---
name: Operating Structure simplified information architecture
description: Administration → Operating Structure uses 5 admin-facing tabs with plain-language wording; mandates/enforcement live behind Advanced authority settings
type: design
---

- Primary tabs only: **Overview, People, Teams, Coverage, Panels & Committees**.
  - Coverage contains two views: *Sector coverage* (hierarchical sector → sub-sector) and
    *Entity ownership* (the former Entity Supervision screen).
  - Coverage warnings appear on Overview (and inline badges in Coverage), never as their own tab.
  - Mandates & enforcement are only reachable via the **Advanced authority settings** sheet.
- Vocabulary: "portfolio" → **responsibility / functional coverage**; regulatory function → **area of work**;
  panel readiness → **Can sit / Cannot sit**. Technical warning codes stay as secondary detail only.
- `src/components/admin/operating-structure/shared.ts` owns the plain-language warning copy
  (`humaniseWarning`), the toast wrapper (`act`) and date formatting (no timestamps in admin UI).
- Unchanged: all writes go through governed SECURITY DEFINER routines; the client holds no DML on
  operating-structure tables; recording structure never widens authority; mandates stay un-enforced.
