# Canonical Object-Route Register (proposal)

**Mode:** discovery only — this is the proposed single source of truth for cross-module
links. Nothing has been rewired.

## 1. Canonical route per regulated object

| Object | Canonical route | Id domain (must be) | Non-canonical routes in use today |
|---|---|---|---|
| Entity | `/entities/:entityId` | `entities.id` | `/prudential/entities/:id`, `/conduct/entities/:id`, `/admin/licensees/:id`, `/registry/entities/:slug` (public, legitimate) |
| Application | `/applications/:id` | `applications.id` | — |
| Licence | `/licenses/:id` | `licenses.id` | `/admin/approved-licensees` row links |
| F&P individual (master) | `/fpa/individuals/:id` | individual id | — |
| F&P assessment case | `/fpa/assessments/:assessmentId` | assessment id | currently a **redirect only** — must become the case workspace |
| Return filing | `/returns/filings/:filingId` | `return_filings.id` | `/returns-management/:id`, `/admin/returns/queue/:id`, `/entity/returns/:id/view` |
| Complaint | `/complaints/:id` | `complaints.id` | — |
| Conduct investigation | `/conduct/investigations/:id` | investigation id | — |
| Examination | `/prudential/examinations/:id` | examination id | `/inspections/:id` (separate object, keep, but disambiguate labels) |
| Enforcement case | `/enforcement/:id` | enforcement case id | — |
| Correspondence thread | `/correspondence/:id` | thread id | `/entity/correspondence/:id` (external audience, legitimate) |
| Prudential assessment | `/prudential/assessments/:id` | assessment id | — |
| Coordination case | `/coordination/:caseId` | case id | — |
| Financial group | `/prudential/groups/:groupId` | group id | — |

## 2. Non-canonical link defects found

| # | Defect | Evidence |
|---|---|---|
| 1 | `licensee_id` passed into an **entity**-shaped route | `/prudential/entities/${m.licensee_id}`, `/conduct/entities/${signal.licensee_id}` |
| 2 | `entity_id` passed into a **licensee**-shaped route | `/admin/licensees/${r.entity_id}`, `/admin/licensees/${c.entity_id}`, `/admin/licensees/${inspection.entity_id}` |
| 3 | Correspondence source links resolve to legacy licensee route rather than Entity 360 | `/admin/licensees/${t.source_id}` |
| 4 | Prudential return links target legacy return detail | 5 call sites use `/returns-management/…`, 1 uses `/admin/returns/queue/…` |
| 5 | Entity links split across 4 route shapes | 13 `/entities/…`, 5 `/prudential/entities/…`, 3 `/conduct/entities/…`, 7 `/admin/licensees/…` |
| 6 | Public register slug mixed with internal id usage | `/entities/${e.public_slug}` alongside `/entities/${e.entity_id}` |

**Non-canonical cross-module link sites: 21** (across 6 defect classes).

## 3. Proposed enforcement mechanism (not implemented)

```ts
// src/lib/routes/objectRoutes.ts  (proposal)
export const objectRoute = {
  entity:        (entityId: string) => `/entities/${entityId}`,
  application:   (id: string) => `/applications/${id}`,
  licence:       (id: string) => `/licenses/${id}`,
  fpIndividual:  (id: string) => `/fpa/individuals/${id}`,
  fpAssessment:  (id: string) => `/fpa/assessments/${id}`,
  returnFiling:  (id: string) => `/returns/filings/${id}`,
  complaint:     (id: string) => `/complaints/${id}`,
  investigation: (id: string) => `/conduct/investigations/${id}`,
  examination:   (id: string) => `/prudential/examinations/${id}`,
  enforcement:   (id: string) => `/enforcement/${id}`,
  correspondence:(id: string) => `/correspondence/${id}`,
} as const;
```

Guardrails to add alongside it:
1. lint/scan rule rejecting hand-built template-literal links to the object routes above
   (extend `scripts/verify-authz-centralized.mjs` style scanning);
2. a route-registry test asserting every canonical route exists in `src/routes/*` and has a
   breadcrumb registry entry;
3. all legacy object routes reduced to `<Navigate>` redirects onto the canonical route,
   translating the id domain server-side where `licensee_id ≠ entity_id`.
