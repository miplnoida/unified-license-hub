# Wave 3A — Enterprise SupTech Gap Register (discovery)

Severity: P0 = confidentiality/integrity breach, P1 = process cannot be executed,
P2 = degraded UX, P3 = cosmetic.

| ID | Sev | Process | Finding | Evidence | Proposed remediation (Wave 3B) |
|---|---|---|---|---|---|
| GAP-3A-001 | P1 | P13 Entity Resolution | `licensee_primary_user` (external audience) renders the internal route `/licensing/entity-resolution` by direct URL instead of being refused | `02-audience-boundary.spec.ts` | Add internal-audience route guard for the entity-resolution spine |
| GAP-3A-002 | P0 | P06 Returns | `entity_ppoc` reads `return_filings` rows of an unrelated entity via the Data API (returned `CV2-E01-2024-Q1`, Meridian) — cross-entity confidentiality breach | `03-ppoc-multi-entity.spec.ts` | Rewrite `return_filings` SELECT policy to scope external audiences to active `entity_user_access` rows |
| GAP-3A-003 | P1 | P03–P13 | Owning internal personas hit deny/permission text on their own work surfaces (`/returns/queue`, `/prudential/work`, `/conduct/work-queue`, `/enforcement`, `/inspections`, `/fpa`, `/entities`, `/licensing/entity-resolution`, `/complaints/escalations`, `/supervision/early-warnings`, `/returns/obligations`, `/returns/calendar`, `/prudential/dashboard`, `/prudential/examinations`) | `04-process-surfaces.spec.ts` | Reconcile 48 governed role templates against route guards + RLS grants per process family; triage genuine denials vs. keyword false positives on each screen |
| GAP-3A-004 | P2 | P04 Licence | `GET /rest/v1/licenses` returns HTTP 400 on `/licenses` for `licensing_supervisor` | `04-process-surfaces.spec.ts` | Fix column/embed selection in the licence list query and add grant coverage |
| GAP-3A-005 | P3 | Platform | React `Function components cannot be given refs` warnings on multiple queues | console capture | Wrap offending components in `forwardRef` |

Discovery is complete for authentication, audience boundaries, multi-entity
scoping and server enforcement. Remediation deferred to Wave 3B by design.
