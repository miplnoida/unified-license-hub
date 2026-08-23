# Wave 3B — P0/P1 Security & Operability Remediation

Baseline: Wave 3A gap register. Evidence: real login UI, real routes, real Data API
with per-persona tokens (no service role).

## GAP-3A-002 (P0) — cross-entity returns read leak — FIXED

**Root cause.** External role templates (`entity_ppoc`, `licensee_primary_user`,
`licensee_secondary_user`) carry the global permission `returns_management.view`.
Every SELECT policy in the returns graph accepted that global permission as an
unscoped read grant (`has_permission(...) OR entity_membership_capability(...)`),
so an external user with the module permission bypassed the entity checks.
A second hole: `created_by = auth.uid()` — the seed author could read all 91
filings across all 20 entities.

**Remediation.** New audience-aware predicate:

- `sec_is_internal_user(uuid)` — active `sec_user_roles` with `role_type='internal'`.
- `entity_external_read_access(uuid, uuid)` — active `entity_user_access`,
  approved `entity_user_memberships` capability, or `profiles.licensee_id`.
- `can_read_entity_returns(uuid, uuid)` — super admin, OR internal + returns
  permission/assignment, OR external + entity authority. The unscoped
  `created_by` clause is removed.

Applied to `return_filings`, `return_filing_versions`,
`return_filing_form_requirements`, `return_filing_validation_results`,
`return_filing_requests`, `return_metric_values`,
`entity_reporting_obligations`, `reporting_periods`.

**Verification (Data API row counts, all entities / E01 unrelated / E10 own):**

| Persona | before (all / E01 / E10) | after (all / E01 / E10) |
|---|---|---|
| entity_ppoc | 91 / 8 / 6 | 10 / 0 / 6 |
| licensee_primary_user | 91 / 8 / 6 | 8 / 8 / 0 |
| licensee_secondary_user | 91 / 8 / 6 | 8 / 8 / 0 |
| applicant_user / pre_licensee_user | 0 / 0 / 0 | 0 / 0 / 0 |
| returns_officer / auditor / read_only (internal) | 91 / 8 / 6 | 91 / 8 / 6 |

Child tables follow the parent exactly (versions, metric values, obligations,
periods). No internal supervisory regression.

## GAP-3A-003 (P1) — internal personas denied on their own surfaces — FIXED

**Root cause.** The internal certification identities held only the `applicant`
`app_role`; `profiles.role` carried the real supervisory role. The frontend
resolves audience from `app_role`, so `ModuleRoute`'s internal-only audience
check refused every internal work surface even though the `sec_*` permissions
were correct.

**Remediation.** Each internal certification identity now also holds its nearest
internal `app_role` (`supervisor` / `licensing_officer` / `analyst`), derived from
`profiles.role`.

**Verification.** Owning personas now open their surfaces without a denial:
`/returns/queue`, `/returns/obligations`, `/returns/calendar`,
`/prudential/work`, `/prudential/dashboard`, `/supervision/early-warnings`,
`/conduct/work-queue`, `/conduct/alerts`, `/complaints/escalations`,
`/inspections`, `/prudential/examinations`, `/enforcement`, `/fpa`,
`/fpa/individuals`, `/licensing/entity-resolution`.

## GAP-3A-001 (P1) — NOT REPRODUCED

`licensee_primary_user` is refused with Access Denied at
`/licensing/entity-resolution` (browser evidence + full
`02-audience-boundary.spec.ts` re-run: 5/5 PASS). The Wave 3A failure was a
harness timing artefact, not a guard defect.

## Residual (carried to Wave 3C)

| ID | Sev | Finding |
|---|---|---|
| GAP-3A-004 | P2 | `GET /rest/v1/licenses` returns 400 on `/licenses` for `licensing_supervisor` (column/embed selection) |
| GAP-3B-001 | P2 | `/entities` still denied for `entity_resolution_officer` — entity registry module permission not in that role template |
| GAP-3B-002 | P2 | `rpc/escalation_hub_stats` returns 403 for `complaints_officer` |
| GAP-3A-005 | P3 | React `forwardRef` warnings on several queues |

Note: `04-process-surfaces.spec.ts` treats React ref warnings as failures, so it
still reports red until GAP-3A-005 is fixed; the security and operability
assertions inside it now pass.
