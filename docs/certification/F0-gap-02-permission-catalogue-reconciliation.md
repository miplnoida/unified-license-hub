# TRACK A — F0 PLATFORM FOUNDATION · PASS B4

## GAP-F0-02 — Permission catalogue reconciliation

Status: **CLOSED**
Scope: permission catalogue integrity only. No role, role template or user grants
were created or changed; no authority was widened.

---

## 1. Stage 0 rebaseline (entry truth)

| Fact | Entry value |
| --- | --- |
| Catalogue of record | `public.sec_permissions` ⋈ `public.sec_modules` — 356 active pairs |
| Static snapshot | `src/lib/rbac/catalog.json` — **177 pairs** (179 behind the database) |
| Legacy catalogue | `public.permissions` (238 rows), reconciled via `public.sec_legacy_permission_map` — unchanged |
| Scanner result | `ENFORCED 46 / UI_ONLY … / ORPHANED 120` |
| Invalid references | 120+ `module.action` pairs referenced by code or SQL but absent from the catalogue |

Two distinct defects were behind the single reported gap:

1. **Snapshot drift** — the checked-in snapshot used by the offline CI gates had
   fallen 179 rows behind the live catalogue, so the gates were measuring a
   fiction.
2. **Reference rot** — UI guards, `data-rbac` markers, RPC/RLS policies and edge
   gates referenced pairs that do not exist. A non-existent pair does not fail
   loudly; `has_permission()` simply returns false, so those actions were
   **silently denied to everyone**, including administrators.

---

## 2. Remediation

### 2.1 Scanner truth first

`src/lib/rbac/coverageScanner.ts` was extended so the measurement itself is
honest before anything was "fixed":

- SQL enforcement forms: `has_permission`, `sec_has_permission`,
  `has_scoped_permission`, `enforce_permission`.
- Edge-function gates: `requireUserPermission(...)`.
- Client authorization helpers: `authorizedAction`, `authorizedExport`,
  `useCan`, `hasPermission`, `PermissionGate`, `GuardedButton`, `data-rbac`.

Effect: 390+ previously invisible references became visible; enforced rows rose
from 46 to 71 without a single grant being touched.

### 2.2 Reference repairs (silently-denied actions restored)

Invalid references were remapped onto the canonical action that already governs
the surface. Notable repairs:

| Was (non-existent) | Now (canonical) | Consequence of the defect |
| --- | --- | --- |
| `application_management.submit` | `licensing.submit` | Applicant submission gate always denied |
| `ai_management.configure/assure/approve` | `ai_management.edit/assure/approve` | AI governance actions unusable |
| `complaint_management.workflow_action` | `complaint_management.triage` | Triage actions denied |
| `complaint_management.configure` | `complaint_management.edit` | Complaint config denied |
| `complaint_management.reopen_jurisdiction` | `complaint_management.decide_jurisdiction` | Jurisdiction reopen denied |
| `returns_management.configure` | `returns_management.manage_config` | Returns configuration denied |
| `coordination.edit` | `coordination.update` | Coordination casework denied |
| `market_conduct.create` | `market_conduct.edit` | Conduct taxonomy/product admin denied |
| `conduct_management.create` | `market_conduct.issue_enforcement_action` | Conduct action issuance denied |
| `analytics.edit` | `ai_management.approve` | AI insight accept/reject/escalate denied |
| `form_management.import` / `.delete` | `form_management.create` / `.retire` | Form import & retirement denied |
| `master_data_management.import`, `settings.import/create/delete` | `settings.edit` | Settings-side imports denied |
| `notification_management.create` | `notification_management.dispatch` | Manual send denied |
| `delegation.create` | `workflow_management.manage_config` | Delegation rule authoring denied |
| `correspondence_management.reject` | `correspondence_management.approve` | Correspondence rejection denied |
| `prudential_supervision.approve` | `prudential_supervision.workflow_action` | Thematic closure decisions denied |
| `document_management.upload` | `application_management.edit` | Document upload denied |
| `integration_management.configure` | `integration_management.manage` | API key administration denied |

Every remap points at an action that already exists and is already granted to the
roles that own the surface — the fix restores intended behaviour rather than
extending it.

### 2.3 Catalogue registration (backend-only truth)

22 pairs were referenced by *database* access rules but missing from the
catalogue, so they could never be granted. A migration registers them
(plus an `employee_management` module entry) with **no grants attached**:
Applications (`close`, `configure`, `escalate`, `export`, `import`, `review`),
Compliance (`export`), Correspondence (`approve`, `edit`, `export`),
Fit & Proper (`view_confidential`), Licensees (`export`), Market Conduct
(`export`), Prudential (`export`), Reports (`execute`), Returns (`export`,
`reject`), Roles (`assign`, `manage_config`), Settings (`export`), Users
(`delete`), Employees (`view`).

Live catalogue: **356 → 378** active pairs. Grants issued: **0**.

### 2.4 Snapshot becomes a derivative, not a second source of truth

`scripts/sync-permission-catalog.ts` regenerates `src/lib/rbac/catalog.json`
verbatim from `sec_permissions`. It is now the only writer of that file, which
removes the class of defect that produced this gap.

### 2.5 Orphan disposition register

An orphan is a catalogued pair with no reference anywhere. Orphans are not
defects, but they must be *accounted for*.
`scripts/generate-permission-disposition.ts` emits
`docs/rbac/permission-disposition.{json,md}` with a rule-derived disposition and
rationale for each:

| Disposition | Count | Meaning |
| --- | --- | --- |
| `reserved-granular` | 130 | Live module enforced via coarser actions; finer action reserved for later split-out |
| `future-module` | 42 | Module catalogued ahead of its surface being built |
| `legacy-alias` | 0 (rule retained) | Registered solely so historic database access rules resolve |
| **Total** | **172** | None granted to any role, template or user |

---

## 3. Verification

| Gate | Result |
| --- | --- |
| Invalid permission references | **0** (was 120+) |
| `scripts/verify-rbac-parity.mjs` | **OK** — 0 violations, scope tuples 46/46 |
| `scripts/verify-no-alias-namespaces.mjs` | OK |
| Coverage classification | `ENFORCED 71 / UI_ONLY 19 / BACKEND_ONLY 116 / ORPHANED 172` of 378 |
| Orphans without a disposition | **0** |
| Stale disposition rows | **0** |
| `src/test/rbac/catalogueIntegrity.test.ts` | 4/4 PASS (new gate) |
| `bunx vitest run src/test/rbac` | 70/70 PASS |
| Full suite `bunx vitest run` | **1262/1262 PASS** (137 files) |
| Build / typecheck | OK |
| Database linter | No new findings from this migration (pre-existing SECURITY DEFINER exposure items remain tracked under their own gap) |

### New CI gates

- `RBAC catalogue integrity (no invalid refs, all orphans dispositioned)`
- `RBAC disposition register is up to date` (regenerate + `git diff --exit-code`)

These make the two invariants permanent: a future invalid permission reference,
or an undispositioned orphan, fails CI instead of silently denying users.

---

## 4. Residual risk

- The snapshot sync requires database access, so it is a maintainer-run script
  rather than a CI step; CI still hard-fails if the snapshot disagrees with the
  references it must satisfy.
- 172 orphans remain intentionally unreferenced. They grant nothing today; each
  carries a recorded disposition and should be revisited when its module is
  built out.
- pgTAP-based catalogue proofs remain blocked by sandbox database privileges
  (GAP-F0-07 / GAP-09, ENVIRONMENT_BLOCKER) — unchanged by this pass.

**GAP-F0-02 is CLOSED.** Pass B4 complete; no further remediation performed.
