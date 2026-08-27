# Regulatory Convergence — DELTA REBASELINE (read-only)

Pass type: **DELTA REBASELINE ONLY** — no fixes, no refactors, no Checkpoint H.
Executed: 2026-08-27 13:1x UTC
Baseline compared: `1517d090ec7a3960b19bf96c544ebab4a707d4b2`
Evidence hierarchy: LIVE DB → SOURCE → TESTS → MIGRATIONS → DOCS → PLANS

---

## A. CURRENT SOURCE TRUTH

| Item | Value |
|---|---|
| Current HEAD | **`d4695b8b8c847bff2a8791f2d7a05d0c1f062a69`** — "Fixed status check constraint" |
| Branch | `edit/edt-49198125-8ea5-4cd4-80fe-5464ef1b12da` |
| `git status --porcelain` | empty → **working tree clean** |
| Build | `/tmp/observability/build-errors.log` → `build OK` (2026-08-27T13:11:46Z) |
| Migration files | **1172** (baseline 1170; +2) |

### Commits after `1517d090` (15 total; author `gpt-engineer-app[bot]` for all non-merge commits — agent-authored in-session, no third-party commits)

| SHA | Time (UTC) | Type | Subject | Files |
|---|---|---|---|---|
| `8cd88ebf5` | 11:30:15 | D (doc-only) | Changes | `docs/certification/convergence-rebaseline-2026-08-27.md` (+149) |
| `bc35019c1` | 11:31:01 | C (merge) | Resumed Regulatory Convergence | merge of above |
| `9dd366970` | 12:06:16 | D (plan-only) | Changes | `.lovable/plan.md` → archived triage plan |
| `027dec9a2` | 12:06:38 | C (merge) | Update plan | — |
| `13400bfd7` | 12:08:05 | D | Changes | plan doc |
| `56d153b54` | 12:09:25 | **E (migration)** | Changes | `supabase/migrations/20260827120906_8142dcb8-…sql` (+124) |
| `00fe09514` | 12:09:37 | **F (behaviour, frontend)** | Changes | `src/components/complaints/triage/TriagePanel.tsx` (+5) |
| `996b8a975` | 12:09:52 | C (merge) | Fixed triage confirmation flow | — |
| `ae1db7ce0` | 12:47:12 | D | Changes | `.lovable/plan.md` (work-items plan) |
| `1b8abeb49` | 12:47:35 | C (merge) | Update plan | — |
| `a567c5f8f` | 12:53:11 | D | Changes | plan doc |
| `4a43a20ba` | 12:54:39 | **E (migration)** | Changes | `supabase/migrations/20260827125424_d7e17725-…sql` (+175) |
| `6dcfc6ede` | 12:54:51 | F (doc-comment only) | Changes | `src/lib/conductGovernedOps.ts` (1 line, comment) |
| `d4695b8b8` | 12:55:20 | C (merge) | Fixed status check constraint | HEAD |

Classification roll-up:

- **A. Regulatory-convergence work:** only the rebaseline document (`8cd88ebf5`). No convergence *code* changed.
- **B. Unrelated module work:** P08 complaints — triage confirmation + investigation work-item status (2 migrations + 2 small frontend edits).
- **C. Merges:** 6, all fast merges of agent branches; no cross-branch content conflicts.
- **D. Planning/document-only:** 5 commits (`.lovable/plan*`, certification doc).
- **E. Database migrations:** 2 (below).
- **F. Behaviour-changing source:** 1 real UI change (`TriagePanel.tsx`, hint text only), 1 comment-only change. **No frontend logic, guard, route, RBAC or workflow code changed.**

Nothing here is declared safe on the basis that it builds; each item is assessed below on live-DB and test evidence.

---

## B. DATABASE / MIGRATION DELTA

Count: **1170 → 1172**. Both new files are tracked and committed; zero untracked/uncommitted migrations.

### E1 — `20260827120906_8142dcb8-452a-48b9-b8fd-7aa36da3c44c.sql` — triage confirmation
`CREATE OR REPLACE FUNCTION public.complaint_triage_confirm(uuid, jsonb, timestamptz)` — same signature, SECURITY DEFINER, `search_path` pinned. Idempotent (pure CREATE OR REPLACE), reproducible.

Delta: a dimension counts as a **material override only when an automated recommendation value exists for that dimension** and the supervisor departs from it. Previously the comparison was "submitted value vs NULL", so **every first confirmation was classified as an override**, demanding `complaint_management.override_triage` and a 10-char reason that the UI never asked for — triage could not be confirmed at all.

Unchanged: jurisdiction gate (`complaint_triage_gate_ok`), freshness assertion, value domains, `CONFIRMED_SYSTEMIC` always requiring override authority + justification, evaluation-ledger insert, notification enqueue, `audit_logs` write. **No permission was widened** — the override permission is still required for genuine departures; the change only stops demanding it where there is nothing to override.

### E2 — `20260827125424_d7e17725-0f0c-4a81-a195-d6e672a47564.sql` — investigation work items
1. Drops stale `complaint_investigation_tasks_status_check` (`pending|in_progress|completed|cancelled`).
2. Normalises existing rows to the canonical uppercase set (no-op here: table had **0 rows**).
3. Column default `'pending'` → `'NOT_STARTED'`.
4. Re-adds the check on `NOT_STARTED|IN_PROGRESS|BLOCKED|COMPLETED|CANCELLED`.
5. Aligns `complaint_task_create` (inserts `NOT_STARTED`), `complaint_task_set_status` (normalises input, writes canonical) and `my_work_queue` (open-task filter now `upper(status) NOT IN ('COMPLETED','CANCELLED')`).

Guarded/idempotent (`DROP … IF EXISTS`, `CREATE OR REPLACE`); the `ADD CONSTRAINT` is not re-runnable on an already-patched database — acceptable for a forward migration, noted.

**Does either migration change canonical regulatory state?** No rows of canonical regulatory data were rewritten (0 task rows; no complaint, application, workflow, RBAC or identifier data touched). Both are function/constraint-level.

Live-vs-source reproducibility, verified now:

```
constraint  = CHECK (status = ANY (ARRAY['NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED']))
default     = 'NOT_STARTED'::text
task rows   = 0
```

Live DB matches the new migrations. **GAP-04 is unchanged and still open**: `rg "WorkflowW" supabase/migrations` → **0 matches**; the live relink+delete of `Registration Processing WorkflowW` still has no repair-record migration. The two new migrations did not introduce a new reproducibility gap.

---

## C. COMPLAINT / INVESTIGATION DELTA ASSESSMENT (Section 3 of the request)

| Question | Finding |
|---|---|
| What changed | Work-item status vocabulary reconciled to uppercase canonical set; triage override-materiality test corrected. |
| Why | Runtime defects: `complaint_investigation_tasks_status_check` rejected every new work item; `complaint_triage_confirm` blocked every first triage confirmation. |
| Canonical status values changed? | **Yes, at the database constraint/default layer.** `pending → NOT_STARTED`; `BLOCKED` added. The application layer (`complaint_investigation_task_save`, `InvestigationTasksPanel.tsx`) already used these values — the DB was the outlier. Net effect: DB now conforms to the app's canonical set. |
| RPCs replaced/modified | Modified in place (same signatures): `complaint_triage_confirm`, `complaint_task_create`, `complaint_task_set_status`, `my_work_queue`. None replaced, forked or dropped. `complaint_investigation_task_save` untouched. |
| Data normalised? | Normalisation statement present; **0 rows existed**, so no data was rewritten. |
| Audit behaviour | Unchanged. `log_compliance_audit('CREATE'/'UPDATE','complaint_investigation_task',…)` still written on both task paths; triage still writes `complaint_triage_evaluations` + `audit_logs` with `complaint.triage.confirmed` / `.overridden`. |
| Permissions | Unchanged. `conduct_require('complaint_management','edit')` on task RPCs; `has_complaint_perm(…, 'override_triage')` still gates real overrides and all systemic confirmations. **No grant, policy or role changed.** |
| `my_work_queue` behaviour | Changed for one branch only: completed/cancelled work items no longer appear in the internal personal queue (previously `status <> 'completed'` lowercase never matched, so completed items lingered). Provider branch, applications, complaints, attention items, interventions, provider packages unchanged. Read-model flags (`is_authoritative_source: false`) unchanged. |
| Complaints/investigation workflow affected? | Lifecycle, phases, allegations, evidence, RFI, outcome/redress/QA/reconsideration untouched. Only work-item state vocabulary + triage materiality. |
| P08/P12 evidence invalidated? | **P08 partially — re-test required** for: triage confirmation path, investigation work-item CRUD, and personal work-queue composition. P12 (correspondence) **not affected**. |
| Live evidence that the delta is real | `complaint_triage_evaluations` now holds a `manual_confirm` row at 12:11:03 UTC (post-fix first confirmation) alongside the pre-existing `manual_override` row — the previously blocked path now records correctly. |
| Tests needing re-run | pgTAP `supabase/tests/complaints/*`, `conduct/02_investigation_closure.sql`, `rbac/140_complaints_conduct_reports_rls.sql` (structural only — verified it asserts policies, **not** status literals, so no test hard-codes the retired lowercase values). No frontend test references task status. |

No complaints functionality was redesigned in this pass.

---

## D. FRONTEND CERTIFICATION DELTA

`bunx vitest run` (no code modified):

| Metric | Previous | Now | Delta |
|---|---|---|---|
| Total | 1254 | **1254** | 0 |
| Passed | 1231 | **1231** | 0 |
| Failed | 23 | **23** | 0 |
| Failing files | 8 | **8** | 0 |

Failures by file (unchanged set):

- `rbac/actionCoverage.test.ts` — 5 failures; **519 unguarded action sites** (floor 0). Same named sites (`settings/CaptchaSettings.tsx`, `settings/IntegrationSettings.tsx`, `supervision/ThematicClosureQueue.tsx`, plus public/registration/returns-canonical pages). → **GAP-05 unchanged**.
- `sidebarVisibility.test.tsx` — 12 persona failures, all `No QueryClient set` (`useSecurityContext`/`useNavigationSections` under `Sidebar`). → **GAP-06 unchanged**.
- `routeCoverage.test.ts` — 1 failure, 34 guarded routes `UNMAPPED`. → **GAP-07 unchanged**.
- `applicantFacingActions`, `breadcrumbs`, `reportsModule`, `returnNotificationTemplates`, `useLicenseeMetrics` — 5 failures. → **GAP-08 unchanged**.

RBAC action architecture retained as established (`src/lib/rbac/audit.ts`, `src/test/rbac/actionCoverage.test.ts`, `data-rbac="module.action"`, hard 100% floor, existing public allow-list). No alternative mechanism introduced or proposed.

---

## E. CONVERGENCE TEST RE-RUN

`scripts/run-pgtap.sh` against the sandbox role (still cannot `EXECUTE` functions, cannot `SET ROLE`):

| Suite | ok | not_ok | Outcome |
|---|---|---|---|
| B — `01_checkpoint_b_decision_authority.sql` | 3 | 0 | PASS (structural) + **ENVIRONMENT_BLOCKED** at `resolve_decision_authority` |
| C — `02_checkpoint_c_work_model.sql` | 1 | 0 | PASS (structural) + **ENVIRONMENT_BLOCKED** at `resolve_work_allocation_policy` |
| D/E — `03_checkpoint_d_e_services_providers.sql` | 11 | 0 | PASS (structural) + **ENVIRONMENT_BLOCKED** at `regulatory_service_task_execution` |
| F — `04_checkpoint_f_people_access.sql` | 17 | 0 | PASS (structural) + **ENVIRONMENT_BLOCKED** at `SET ROLE authenticated` |
| **G** — `05_checkpoint_g_adoption.sql` (plan 23) | **15** | 0 | **IMPLEMENTED_NOT_CERTIFIED — 8 assertions ENVIRONMENT_BLOCKED** |
| PLS guard — `rbac/286_post_license_duplicate_guard.sql` | **19** | 0 | **CERTIFIED 19/19** |
| H | — | — | **NOT_EXECUTED** (precondition G unmet) |
| I / EPR-05 | — | — | **NOT_EXECUTED** (no live personas/provider credentials) |

Totals: ok=66, not_ok=0, environment errors=27. Identical to the baseline pass → **GAP-09 preserved**; no blocked assertion converted to PASS.

---

## F. DO-NOT-TOUCH INVARIANTS — DELTA

| Structure | Delta | Result |
|---|---|---|
| Canonical RBAC (roles/permissions/`has_role`/`user_has_permission`) | none | **PRESERVED** |
| Canonical workflow engine & versions/steps/actions/instances | none | **PRESERVED** |
| Canonical workflow transitions (`perform_workflow_transition` family) | none | **PRESERVED** |
| Regulatory operating structure | none | **PRESERVED** |
| `convergence_decision_gate` / `convergence_work_gate` | present, signatures unchanged (10/10 canonical functions resolve) | **PRESERVED** |
| Licensing routing (`_resolve_application_workflow`, `services.workflow_id` precedence) | none | **PRESERVED** |
| AI control plane (MC-08 registries, kill switches, thresholds) | none | **PRESERVED** |
| Audit/history structures | none — new migrations *write* to the existing audit writers, add nothing | **PRESERVED** |
| Notification / storage / security boundaries | none; no grant/policy statement in either new migration | **PRESERVED** |
| Read-model contract | `my_work_queue` filter corrected within the existing read model; still non-authoritative | **PRESERVED (behaviour narrowed, not forked)** |

No canonical structure was replaced, forked or weakened by the newer commits.

---

## G. UPDATED CONSOLIDATED GAP REGISTER

| ID | Area | Current gap | Previous state | New evidence (this pass) | Severity | Classification | Blocks | Recommended action |
|---|---|---|---|---|---|---|---|---|
| GAP-01 | PLS | 16 services with `workflow_id IS NULL` | Open (Medium) | live count re-verified = **16** — unchanged | Medium | CONFIGURATION_GAP | H | Map to a canonical pattern or record fallback decision, one idempotent migration |
| GAP-02 | PLS | No `fee_reference` on representative post-licence services | Open | not re-tested this pass (no delta touches fees) | Medium | CONFIGURATION_GAP | I | Populate or record fee-exempt decision |
| GAP-03 | Entity identity | REN identifier verification derived from entity identity status | Open (High) | no post-baseline commit touches identifier migrations → **unaffected** | High | REQUIRES_BUSINESS_GOVERNANCE_DECISION | H | Obtain business ruling first |
| GAP-04 | Registration | `WorkflowW` relink+delete has no migration | Open (Medium) | `rg WorkflowW supabase/migrations` → **0**; new migrations did not address it | Medium | SOURCE_CONTROL_REPRODUCIBILITY_GAP | H | Smallest idempotent repair-record migration |
| GAP-05 | RBAC (frontend) | 519 unguarded action sites; 5 floor failures | Open (High) | vitest re-run: **519 / identical site list** | High | REGRESSION | H | Restore Slice 17/19/21/22 floors using the existing `data-rbac` mechanism |
| GAP-06 | Navigation | 12 persona assertions fail `No QueryClient set` | Open | vitest re-run: identical | Medium | TEST_DEFECT | H | Wrap harness in `QueryClientProvider` |
| GAP-07 | Routing | 34 guarded routes `UNMAPPED` | Open | vitest re-run: identical | Medium | CONFIGURATION_GAP | H | Add entries to `ROUTE_MODULE_MAP` |
| GAP-08 | Misc frontend | 5 assorted failures | Open | vitest re-run: identical set | Medium | MIXED (per-test triage) | H | Triage individually |
| GAP-09 | Certification env | No function `EXECUTE`, no `SET ROLE` | Open (High) | 27 environment errors, `not_ok=0` across all suites — **preserved** | High | ENVIRONMENT_BLOCKER | G, H, I | Run in privileged certification environment |
| GAP-10 | Licensing / EPR-05 | 15 live journeys unexecuted | Open | still NOT_EXECUTED | High | ENVIRONMENT_BLOCKER | I | Execute with live personas |
| GAP-11 | P08/P12 | Residual external-user / provider / SLA items unexecuted | Open | unchanged | Medium | ENVIRONMENT_BLOCKER | Release | Provide credentials/test users |
| **GAP-12 (new)** | P08 complaints | Two post-baseline P08 defect fixes (triage materiality, work-item status vocabulary) are **not covered by any automated test**; prior P08 evidence for triage confirmation, work-item CRUD and `my_work_queue` composition predates them | n/a — new | Migrations `20260827120906`, `20260827125424`; no pgTAP or vitest asserts the canonical task status set or the "no recommendation ⇒ not an override" rule; live `manual_confirm` evaluation row is the only evidence | Medium | CERTIFICATION_EVIDENCE_GAP | P08 sign-off (not H) | Add structural pgTAP assertions for the constraint set and the materiality rule; re-run P08 complaint suites in the certification environment |

No gap was remediated in this pass. No code was changed to improve any result.

---

## H. CERTIFICATIONS: STILL VALID vs RE-RUN REQUIRED

**Remain valid (unaffected by the delta):** Checkpoint A; B/C/D/E/F carried certifications (structural re-run identical); PLS consolidation architecture and `286` 19/19; do-not-touch invariant set; P12 correspondence evidence; registration journeys.

**Require re-run:** Checkpoint G (still 15/23 executable); all P08 complaint/investigation evidence touching triage confirmation, work-item CRUD and personal work queue (GAP-12); the eight failing frontend suites once their gaps are fixed; Checkpoints H and I (never executed).

---

## I. UPDATED RELEASE POSITION

**NOT READY FOR RELEASE.** Unchanged in substance: Checkpoint G cannot be certified from this environment, H and I are not closed, GAP-03 awaits a business ruling, GAP-04 reproducibility remains, and the frontend action-guard floor is breached (519 sites). Newer commits did not improve or worsen the release position; they closed two P08 runtime defects and added one certification-evidence gap (GAP-12).

**Not yet READY FOR CHECKPOINT H** — H remains gated on GAP-03, GAP-04, GAP-05, GAP-09.

## J. UPDATED EXECUTION ORDER

Current evidence does **not** change the dependency order — the newer commits touched only P08 function bodies and one constraint, with no effect on any gate, guard, route or workflow. The order stands, with GAP-12 inserted where it costs least (alongside the P08 residual work, since it needs the same certification environment):

1. Certification environment / **GAP-09**
2. **GAP-03** governance decision
3. Source reproducibility / **GAP-04**
4. PLS configuration / **GAP-01**
5. Route configuration / **GAP-07**
6. Sidebar test harness / **GAP-06**
7. **GAP-08** individual triage
8. Action guard restoration / **GAP-05**
9. **Checkpoint H**
10. Checkpoint I / **GAP-02** / **GAP-10**
11. P08/P12 residual certification / **GAP-11** + **GAP-12**

**Exact next remediation task:** stand up (or obtain access to) the certification environment with a role that can `EXECUTE` SECURITY DEFINER functions and `SET ROLE authenticated` — i.e. close **GAP-09** — then re-run the five convergence suites plus `286` and target Checkpoint G at 23/23. Nothing else is unblocked ahead of it.
