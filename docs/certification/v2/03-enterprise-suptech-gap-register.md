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

Wave 3B remediation status: GAP-3A-002 FIXED (audience-aware returns RLS),
GAP-3A-003 FIXED (internal app_role mapping), GAP-3A-001 NOT REPRODUCED.
GAP-3A-004 and GAP-3A-005 remain open. See
`03b-remediation-certification.md` for root causes and evidence.


## Batch 1 (Wave 3 fast mode) — P01–P04

| ID | Sev | Process | Finding | Status |
|----|-----|---------|---------|--------|
| GAP-3C-001 | P1 | P03 Licensing | `application_rfi_close` wrote audit rows using non-existent `compliance_audit_logs.action/table_name/record_id` columns → RFI closure always failed | FIXED (canonical `action_type/object_type/object_id/after_value`) |
| GAP-3C-002 | P1 | P01/P03 Workflow | Caller-supplied `_actor_id` was trusted in `perform_workflow_transition` / `perform_registration_workflow_transition` (actor spoofing) | FIXED — `workflow_resolve_actor()` forces `auth.uid()` for end-user calls, accepts verified actor only from service_role edge wrappers |
| GAP-3C-003 | P1 | P03 Licensing issuance | Final approval fails with `organizations_legal_name_authority_check` — licensee organisation is inserted without `legal_name_authority`; no licence is created | OPEN (blocks licence issuance and therefore P04 lifecycle execution) |
| GAP-3C-004 | P2 | P03 Licensing | Seeded licensing workflow steps all carry `approver_role = super_admin`, so cross-role maker/checker cannot be proven from configuration alone (actor separation is enforced, role separation is not) | OPEN (configuration) |

## Batch 2 (Wave 3 fast mode) — P07 Prudential

| ID | Sev | Process | Finding | Status |
|----|-----|---------|---------|--------|
| GAP-3E-001 | P1 | P07 Prudential | `prudential_action_issue` passed an explicit NULL for `breach_after_days`, defeating the column default and violating NOT NULL — no supervisory action could be issued | FIXED (`COALESCE(_breach_after_days, 7)`) |
| GAP-3E-002 | P2 | P07 Prudential | Unfiltered `prudential_work_queue` exceeds the API statement timeout (~18s server-side); entity-scoped calls return in ~4s. Row enrichment/blocker subqueries over all supervised entities are the cost | OPEN (indexes added on the five source tables; enrichment needs rework) |
| PRU-CANON-001 | P1 | P07 Prudential | Monitoring sweep read legacy `returns_filed` and called `prudential_ewi_evaluate` | CLOSED — sweep now selects the latest eligible `return_filing_versions` row and calls `_prudential_canonical_detect_run` |
| GAP-3E-003 | P1 | P07 RBAC | `prudential_analyst` had no qualifying legacy dynamic role, so `has_scoped_permission` denied maker actions (assessment, action) | FIXED (governed "Prudential Analyst" role with prudential maker permissions) |

