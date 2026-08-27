# TRACK A — F0 PLATFORM FOUNDATION

## PASS A — DISCOVERY, COVERAGE & ENTERPRISE GAP REGISTER (NO REMEDIATION)

| Field | Value |
| --- | --- |
| Report type | Discovery / current-truth only. **No functional code, schema, or config was changed.** |
| Generated (UTC) | 2026-08-27 18:55 |
| Branch | `edit/edt-90c7ae17-3018-429a-967f-627195722de1` |
| HEAD SHA | `75693ba6003beba2464b296b058095b536859cd4` |
| Migrations on disk | 1,174 |
| Edge functions | 85 |
| Source modules (`src/**/*.ts(x)`) | 1,380 |
| Frontend test files | 134 |
| Database (pgTAP) suites | 142 files across 25 directories |
| Build state | `build OK` (last two builds, `/tmp/observability/build-errors.log`) |

Artifacts refreshed as read-only evidence during this pass (generated reports only, no
behaviour change): `docs/rbac/action-audit.{md,csv}`, `docs/rbac/permission-coverage.{md,csv,json}`.

---

## 1. Foundation inventory — what exists today

### 1.1 Identity, roles and permissions (database truth)

| Object | Count |
| --- | --- |
| `sec_role_templates` (catalogue of record) | 48 |
| `sec_roles` (materialised live roles) | 61 |
| `permissions` catalogue | 238 |
| `sec_role_permissions` grants | 1,399 |
| `sec_user_roles` active assignments | 55 |

Supporting foundation tables are present and populated for every F0 concern:

- **Authorisation model:** `sec_modules`, `sec_permissions`, `sec_module_scopes`, `sec_scope_types`,
  `sec_role_scopes`, `sec_role_scope_values`, `sec_permission_dependencies`, `sec_routes`,
  `sec_navigation_items`, plus parity tables (`sec_permission_parity`, `sec_assignment_parity`)
  and the legacy bridge `sec_legacy_permission_map`.
- **Operating structure:** `organizations`, `organization_names`, `entity_supervision_assignments`,
  `regulatory_function_assignment_requirements`, `business_calendar_process_assignments`,
  `delegation_rules`.
- **Workflow / decision authority:** `approval_workflows` (10 active), `approval_workflow_versions`,
  `approval_workflow_types`, `approval_steps` (55), `approval_actions`, `approval_step_actions`,
  `workflow_templates`, `workflow_instances`.
- **Audit:** `audit_logs` (4,941 rows), `compliance_audit_logs` (15,054 rows), `audit_timeline`,
  `return_audit_log`, `security_event_logs`, `audit_export_jobs`, `audit_export_downloads`.
- **Notification platform:** `notification_event_configs`, `notification_event_channel_templates`,
  `notification_event_queue`, `notification_outbox`, `notification_dispatch_log`,
  `notification_templates` + `notification_template_versions`, preference and digest tables.

### 1.2 Security posture (live database)

| Control | Measured | Verdict |
| --- | --- | --- |
| Public tables | 619 | — |
| RLS enabled | 619 / 619 (100%) | PASS |
| RLS disabled | 0 | PASS |
| RLS policies defined | 1,160 | PASS |
| Tables with RLS but **zero policies** | 1 (`cert_v2_diag`, certification diagnostics) | OBSERVE |
| `SECURITY DEFINER` functions in `public` | 1,541 | — |
| …without a pinned `search_path` | 0 | PASS |
| `anon` INSERT/UPDATE/DELETE grants | 0 | PASS |
| `anon` SELECT-granted tables | 0 | PASS |
| Public storage buckets | 2 of 12 (`branding-assets`, `avatars` — intentionally public) | PASS |
| `anon`-executable functions | 1,306 | OBSERVE (see GAP-F0-08) |

### 1.3 Foundation gates that currently PASS

| Gate | Result |
| --- | --- |
| `verify-authz-centralized` | PASS — 1,380 files scanned, all authorisation decisions route through `src/lib/rbac/authorize.ts` |
| `verify-runtime-ownership` | PASS — 9 families, one runtime owner each, no duplicate execution paths |
| `verify-no-alias-namespaces` | PASS — 10 legacy aliases blocked, canonical namespaces enforced |
| `validate-nav-icons` | PASS — 212 active navigation items, all icons approved |
| pgTAP `20_definer_search_path` | PASS (1 assertion) |
| pgTAP `150_storage_policy_hardening` | PASS (21 assertions) |
| pgTAP `270_enforce_permission_helpers` | PASS (4 assertions) |
| Frontend suite | 1,235 of 1,258 tests pass (136 files, 128 green) |

---

## 2. Surface coverage manifest

### 2.1 Route ↔ permission coverage

| Metric | Value |
| --- | --- |
| Routes with a `<M module="…">` guard | 195 |
| Guards **disagreeing** with `ROUTE_MODULE_MAP` | 34 |
| — guard present but path **unmapped** in `getModuleForPath` | 32 |
| — guard/map **conflict** (`license_management` vs `licensee_management`) | 2 (`/entities/:entityId`, `/entities/:entityId/structure`) |
| Routes checked for breadcrumbs | 336 |
| Breadcrumb-covered | 313 |
| Breadcrumb-uncovered | 23 |

Largest unmapped clusters: the whole `/governance/ai/*` family (10 routes), `/admin/config/*` and
`/admin/*` engine consoles (13 routes), `/supervision/*` (3), plus `/licensing/*` and
`/licenses/lifecycle`.

### 2.2 Action (button) coverage

Scanner: `src/lib/rbac/audit.ts` via `scripts/generate-rbac-audit.ts`.

| Metric | Value |
| --- | --- |
| Detected action sites | 2,040 |
| Protected (PermissionGate / GuardedButton / `data-rbac` / allow-list) | 1,518 (74.4%) |
| **Unprotected** | 522 (25.6%) |
| Documented baseline in `src/test/rbac/actionCoverage.test.ts` | 98% / 100% hard floor |

Unprotected by category:

| Category | Count | | Category | Count |
| --- | --- | --- | --- | --- |
| Action | 317 | | Reject | 7 |
| Create | 56 | | Delete | 6 |
| Save | 41 | | Approve | 6 |
| Edit | 22 | | Close | 6 |
| Submit | 13 | | Reopen | 5 |
| Assign | 10 | | Issue | 5 |
| Export | 9 | | Workflow | 4 |
| Archive / Publish / Configure / Status Change | 5 | | Download / Report / Print / Email | 10 |

Unprotected by area (top): `src/components/admin` 90, `src/pages/conduct` 86,
`src/components/complaints` 42, `src/pages/admin` 33, `src/components/conduct` 21,
`src/components/prudential` 10, `src/components/entity-detail` 8, `src/components/supervision` 8,
`src/pages/licensing` 8, `src/pages/returns-canonical` 8, `src/pages/registration` 7,
`src/pages/settings` 7.

### 2.3 Permission enforcement coverage

Scanner: `src/lib/rbac/coverageScanner.ts` via `scripts/generate-permission-coverage.ts`.

| Class | Rows | Meaning |
| --- | --- | --- |
| 🟢 Enforced (UI + backend) | 33 | 11% |
| 🔵 Backend only | 131 | Server-enforced, no UI surface |
| 🟡 UI only | 13 | **Frontend gate only — not security** |
| 🔴 Orphaned | 122 | No enforcement path anywhere |
| Total | 299 | |

### 2.4 Edge-function authorisation coverage

`verify-edge-authz`: user=46, worker=22, public=6 — **9 functions carry no authorisation marker**:
`application-acknowledgement`, `bootstrap-break-glass-admin`, `cert-v2-user-fixtures`,
`evaluate-prudential-early-warnings`, `manage-captcha`, `notification-delivery-webhook`,
`overdue-action-sweep`, `prudential-monitoring-sweep`, `screening-sandbox`.

### 2.5 Atomic authorisation (check-then-mutate)

`verify-atomic-authz`: 8 suspicious client-side permission-check-then-mutate patterns —
`src/components/entity-detail/WebUsersTab.tsx:261`, `src/pages/fpa/FpaScreening.tsx:315,338`,
`src/pages/reports/services/reportService.ts:341,369,380,486,510`.

---

## 3. F0 maturity scorecard

| # | Foundation capability | Score | Basis |
| --- | --- | --- | --- |
| F0.1 | RLS coverage & policy density | **5 / 5** | 619/619 tables, 1,160 policies, zero anon DML |
| F0.2 | SECURITY DEFINER hygiene | **5 / 5** | 1,541 functions, 0 without pinned `search_path` |
| F0.3 | Role model governance | **4 / 5** | 48 templates → 61 roles, maker-checker split; break-glass isolated |
| F0.4 | Centralised authorisation | **4 / 5** | `authorize.ts` single decision point; 8 non-atomic client paths |
| F0.5 | Route guard integrity | **3 / 5** | 34 of 195 guarded routes disagree with the module map |
| F0.6 | UI action guarding | **2 / 5** | 522 unguarded sites, incl. 6 Delete / 6 Approve / 7 Reject / 9 Export |
| F0.7 | Permission catalogue health | **2 / 5** | 122 orphaned, 13 UI-only of 299 |
| F0.8 | Edge-function authorisation | **3 / 5** | 74 of 83 markered; 9 unmarkered |
| F0.9 | Audit & evidence platform | **4 / 5** | append-only audit tables, export jobs, 20k rows of live evidence |
| F0.10 | Notification platform | **4 / 5** | outbox + queue + dispatch log + template versioning, live sends verified |
| F0.11 | Navigation / breadcrumb integrity | **3 / 5** | 313/336 covered, 23 gaps concentrated in AI-governance & conduct |
| F0.12 | Automated gate reliability | **2 / 5** | 23 frontend test failures; pgTAP not executable in this environment |
| F0.13 | Traceability evidence | **2 / 5** | 3 FRD claims cite non-existent files |
| **Overall** | | **43 / 65 (66%)** | Strong data-layer floor; weak UI/catalogue/gate layers |

---

## 4. Enterprise gap register (finite, remediation-ready)

| ID | Gap | Severity | Evidence | Type |
| --- | --- | --- | --- | --- |
| GAP-F0-01 | 522 of 2,040 UI action sites unguarded, including 6 Delete, 6 Approve, 7 Reject, 9 Export, 5 Issue, 5 Reopen, 2 Archive, 1 Publish | **Critical** | `docs/rbac/action-audit.md`; `actionCoverage.test.ts` Slice 17/19/21/22 floors all breached | Defect |
| GAP-F0-02 | 122 orphaned permissions and 13 UI-only permissions in a 299-row catalogue | **High** | `docs/rbac/permission-coverage.md` | Defect |
| GAP-F0-03 | 34 guarded routes disagree with `ROUTE_MODULE_MAP` (32 unmapped, 2 conflicting) | **High** | `src/test/routeCoverage.test.ts` failure; `/governance/ai/*`, `/admin/config/*`, `/entities/:entityId` | Defect |
| GAP-F0-04 | 9 edge functions carry no authorisation marker (incl. `bootstrap-break-glass-admin`, `manage-captcha`, `notification-delivery-webhook`) | **High** | `verify-edge-authz` exit 1 | Defect |
| GAP-F0-05 | 8 client-side check-then-mutate paths not atomic with server authorisation | **High** | `verify-atomic-authz` exit 1 | Defect |
| GAP-F0-06 | 12 sidebar-persona tests + `useLicenseeMetrics` test fail on missing `QueryClientProvider` in the harness — the RBAC personas are therefore **unverified**, not proven broken | **High** | `useQueryClient` throw at `QueryClientProvider.tsx:18` | Test defect |
| GAP-F0-07 | pgTAP suites cannot run to completion in this environment: `permission denied for table permissions` / `permission_dependent_actions`, and `user_roles_user_id_fkey` blocks fixture users. 38 assertions passed, 55 aborted | **High** | `scripts/run-pgtap.sh` on 7 RBAC suites | Environment blocker (prev. GAP-09) |
| GAP-F0-08 | 1,306 `public` functions are `anon`-EXECUTE-able; no allow-list asserts which of these are intentionally public | **Medium** | `has_function_privilege('anon', …)` census | Hardening gap |
| GAP-F0-09 | 23 routes have no breadcrumb source (whole `/governance/ai/*` and `/conduct/*` families, `/my-work`, `/support`, `/complaints/file`) | **Medium** | `verify-breadcrumb-coverage` exit 1 | Defect |
| GAP-F0-10 | 3 FRD traceability claims cite files that do not exist (`EnforcementObligationsPanel.tsx`, `EnforcementLifecyclePanel.tsx`, `ConductEntityProfile.tsx`) | **Medium** | `verify-traceability` exit 1 | Evidence defect |
| GAP-F0-11 | pgTAP `250_phase6_sensitive_privileges` asserts `permission_modules.name`, a column that no longer exists — schema drift in the test asset | **Medium** | psql error at line 56 | Test drift |
| GAP-F0-12 | `verify-hardening` aborts at `No active application workflow found` — the hardening gate cannot certify on this dataset | **Medium** | `verify-hardening.sql:648`, exit 3 | Data/seed gap |
| GAP-F0-13 | 5 unrelated frontend tests fail (`applicantFacingActions` raw_action passthrough, `breadcrumbs` id-as-label, `reportsModule` schedule slug, `returnNotificationTemplates` branded email, plus the two coverage suites) | **Medium** | `/tmp/vitest-all.log` | Defect |
| GAP-F0-14 | `cert_v2_diag` has RLS enabled with zero policies — effectively locked, but the intent is undeclared | **Low** | `pg_policies` census | Hygiene |

### Severity roll-up

| Severity | Count |
| --- | --- |
| Critical | 1 |
| High | 5 |
| Medium | 7 |
| Low | 1 |

---

## 5. Certification verdict for F0

**IMPLEMENTED_NOT_CERTIFIED.**

The data layer is enterprise-grade and demonstrably so: universal RLS, complete
`SECURITY DEFINER` hygiene, no anonymous write surface, a template-governed 48-persona role
catalogue, and a full audit/notification platform with live evidence. Certification is blocked by
the enforcement-surface layer, not the data layer: a quarter of UI action sites are unguarded,
41% of catalogued permissions are orphaned, 34 route guards disagree with the module map, nine
edge functions are unmarkered, and the two gates that would prove persona isolation
(sidebar-persona tests and the pgTAP RBAC suites) cannot currently execute.

**Recommended Pass B scope, in order:** GAP-F0-06 and GAP-F0-07 first (restore the gates so
remediation is provable), then GAP-F0-01, GAP-F0-04, GAP-F0-05 (close real authorisation holes),
then GAP-F0-02 and GAP-F0-03 (catalogue and route-map truth), then the Medium/Low tail.

**No remediation was performed in this pass.**
