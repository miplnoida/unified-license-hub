# F0 Platform Foundation — Pass C: E2E Certification, Security Proof & Freeze

**VERDICT: F0-C NOT CERTIFIED — RETURN TO F0-B**

Certification was halted under the F0-C certification rule after two material
security defects and one gate regression were discovered during the Stage 0
hard pre-certification gate. Nothing was silently remediated. Stages 1–11 were
not executed and F0 is **not** frozen.

---

## A. Certification baseline (Stage 0A)

| Item | Value |
| --- | --- |
| Branch | `edit/edt-f1bdc8a3-444d-4dfd-9483-40829e0387c2` |
| HEAD at pass start | `7400a28fe` |
| Working tree | clean at start; this pass touched only evidence/registry files (§B) |
| Migrations in repo | 1181 (+1 this pass: dropped the duplicate `get_application_list_page` overload, carried from B6) |
| Frontend suite | **1266 / 1266 PASS** (138 files) |
| Build | OK |
| Typecheck | clean |
| Protected F0 contracts changed since B6 | none (breadcrumb registry and traceability CSV are evidence surfaces, not contracts) |

Security gate state at start of pass: action coverage 2040/2040, route/module
mismatch 0, invalid permission references 0, edge auth PASS, atomic auth PASS,
hardening 31/31, anon EXECUTE — **regressed** (see §B4).

---

## B. Stage 0 four-item closure

### 0B. Breadcrumb coverage — **PASS**

Gate: `node scripts/verify-breadcrumb-coverage.mjs`.

Before: 336 routes checked, 313 covered, **23 uncovered**.
After: 336 routes checked, **336 covered, 0 uncovered**.

All 23 previously open routes are **PASS**, closed by adding declarative rules
to `src/lib/breadcrumbRouteRegistry.ts` (23 rules, registry 240 → 263):

- Market conduct non-menu surfaces: `/conduct/patterns`, `/conduct/patterns/:id`,
  `/conduct/prioritisation`, `/conduct/reporting`,
  `/conduct/supervisory-intelligence`, `/conduct/emerging-risks/:riskId`,
  `/conduct/entities/:entityId/360`.
- AI governance: `/governance/ai` and its 10 child routes (models, surfaces,
  instructions, use cases + `:code`, assurance + `:id`, activity +
  `:kind/:id`, exceptions).
- Work/complaints/support: `/my-work`, `/complaints/file`,
  `/complaints/intake-queue`, `/support`, `/admin/support`.

Requirements evidenced:

- Hierarchy: every rule declares a `parent` that resolves to an existing crumb.
- No raw identifiers as labels where a human label exists:
  `/conduct/entities/:entityId/360` uses the `entity` resolver (`licensees.name`);
  remaining `:id` crumbs use domain nouns, no UUID is rendered.
- Authorization unchanged: breadcrumbs are presentation-only
  (`src/lib/breadcrumbs/types.ts` contract); no route guard, RLS policy or
  permission mapping was touched. No route was hidden from the scanner —
  route count is unchanged at 336.

### 0C. Traceability IT-010 / IT-012 — **PASS**

Gate: `node scripts/verify-traceability.mjs`.

Before: 3 unproven claims (2 for IT-010, 1 for IT-012) citing files that do not
exist. After: **"every cited artefact exists"**, zero false references. No
placeholder files were created.

- **IT-010 (MCS-ENF-002, enforcement compliance monitoring)** — IMPLEMENTED.
  Real evidence substituted: `src/pages/enforcement/EnforcementWorkspace.tsx`
  (obligations + history sections, obligation/compliance tables),
  `src/pages/enforcement/EnforcementWorkQueue.tsx`,
  `src/test/enforcementProcessGuardrails.test.ts`, DB
  `enforcement_obligations`, `enforcement_compliance_evidence`,
  `enforcement_case_events`. The previously cited
  `EnforcementObligationsPanel.tsx` / `EnforcementLifecyclePanel.tsx` never
  existed — the capability was delivered inside the workspace instead.
- **IT-012 (MCS-SUR-002, entity conduct profile)** — IMPLEMENTED. Real evidence:
  `src/pages/conduct/Conduct360.tsx` (route `/conduct/entities/:entityId/360`)
  plus `src/pages/conduct/ConductEntitiesList.tsx`. The cited
  `ConductEntityProfile.tsx` was a stale filename.

Remaining 4 open traceability rows (IT-001 MCS-ANA-003, IT-005 AUD-OVR-001,
IT-007 DASH-OPS-002, IT-008 FP-ASS-002) are **NOT F0** — analytics, audit
overview and F&P assessment scope; carried to their owning modules.

### 0D. Convergence B–G under `app_certification_runner` — **PASS, 0 not ok**

Runner: `scripts/run-pgtap.sh`. One evidence-only harness correction: the
runner counted `psql: NOTICE` lines as errors; the failure pattern is now
`^(psql:.*(ERROR|FATAL)|ERROR)`. No assertion or product behaviour changed.

| Checkpoint | Suite | Result | ok | not ok | errors |
| --- | --- | --- | --- | --- | --- |
| B — decision authority | `01_checkpoint_b_decision_authority.sql` | PASS | 3 | 0 | 0 |
| C — work allocation / model | `02_checkpoint_c_work_model.sql` | PASS | 1 | 0 | 0 |
| D/E — governed service & provider execution | `03_checkpoint_d_e_services_providers.sql` | PASS | 11 | 0 | 0 |
| F — people / access | `04_checkpoint_f_people_access.sql` | PASS | 21 | 0 | 0 |
| G — adoption | `05_checkpoint_g_adoption.sql` | **PASS 23 / 23** | 23 | 0 | 0 |
| **Total** | | | **59** | **0** | **0** |

No privilege aborts, no skipped assertions, no hidden failures. Checkpoint G
meets the 23/23 target exactly.

### 0E. Malware scanner commissioning — **ENVIRONMENT BLOCKED**

No malware-scanning provider can be commissioned in this environment:

- `FILE_SCAN_PROVIDER_URL` is not configured, and the project secret inventory
  contains no antivirus/scanning provider credential
  (`BREAK_GLASS_ADMIN_PASSWORD`, `BREAK_GLASS_ADMIN_PASSWORD_V2`,
  `CERT_V2_DEFAULT_PASSWORD`, `LICENSE_SIGNING_SECRET`, `LOVABLE_API_KEY`,
  `SCREENING_SANDBOX_KEY`, `WORKER_INVOKE_TOKEN`).
- Commissioning requires an owner decision plus a real provider subscription
  (e.g. an AV/file-inspection API key). Standing up a local endpoint would be a
  dummy provider and is explicitly disallowed.

Consequently the two verdict-bearing scanner tests (benign → CLEAN →
downloadable; industry-standard harmless test signature → INFECTED/SUSPICIOUS →
quarantined by an *actual* inspection) **were not executed**.
Secure upload/storage is **not** awarded ≥ 4.8.

Fail-closed behaviour that *is* testable was executed and passed
(`/tmp/scanproof2.sql`, browser-role persona `07851875…` = applicant):

| Test | Result |
| --- | --- |
| Client insert declaring `scan_status='clean'` | forced to `pending_scan` (trigger `trg_file_uploads_scan_status_guard`) — PASS |
| Client `UPDATE scan_status` | denied, `42501 scan_status may only be changed by the scanning worker` — PASS |
| `file_upload_release_state` on `scan_error` | `released:false` — PASS |
| `infected` verdict | `is_quarantined=true`, `released:false` — PASS |
| Scan event + audit trail | `file_upload_scan_events` rows written, `audit_logs` action `file_scan_verdict` — PASS |
| **Forged `clean` verdict by an ordinary signed-in user** | **ACCEPTED — CRITICAL DEFECT, see §C1** |

---

## C. Material defects found (certification stopped)

### C1. DEF-F0-C-01 — CRITICAL — `file_upload_record_scan` authorization guard is vacuous

`public.file_upload_record_scan` is `SECURITY DEFINER` (owner `postgres`) and
guards with:

```sql
IF NOT (current_user IN ('service_role','postgres','supabase_admin',
                         'app_certification_runner','sandbox_exec')
        OR public.is_super_admin(auth.uid())) THEN RAISE ...
```

Inside a `SECURITY DEFINER` function `current_user` is the **owner**
(`postgres`), so the first branch is always true. The guard can never deny.
`EXECUTE` is granted to `authenticated`.

Reproduced: session role `authenticated`, JWT subject
`07851875-408b-4c29-b294-281180cf4ce5` (plain `applicant`, not super admin) →
`file_upload_record_scan(<id>, 'clean', 'fake-av')` **succeeded**, and
`file_upload_release_state(<id>)` then returned `{"released": true,
"scan_status": "clean"}`.

Impact: any signed-in user — including external applicants and licensees — can
self-certify an arbitrary uploaded file as malware-clean with a fabricated
provider name and obtain a signed download URL. This defeats the entire
GAP-F0-15 fail-closed upload control and the audit trail attributes the forged
verdict to a fake provider. Scenario **F0-E2E-19** and Stage 5 "forged malware
verdict" are STOPPED.

Correct guard must derive the caller from the request (JWT role claim /
`workflow_resolve_actor`-style resolution), not from `current_user`.

### C2. DEF-F0-C-02 — HIGH — `prudential_ewi_evaluate` bypass (same vacuous pattern)

`public.prudential_ewi_evaluate(_entity_id uuid, _period_end date)` is
`SECURITY DEFINER` and guards with
`current_user IN ('service_role','postgres','supabase_admin') OR
public.can_read_prudential_entity(auth.uid(), _entity_id)` — vacuous for the
same reason.

Reproduced (`/tmp/ewi.sql`): the same `applicant` persona, for whom
`can_read_prudential_entity(...)` returns **false**, successfully executed the
evaluation and received the result payload
(`entity_id, refreshed, period_end, executed_at, alerts_written`) — i.e. an
unauthorized read *and* a prudential-alert write path.

### C3. DEF-F0-C-03 — MEDIUM — GAP-F0-08 anon EXECUTE regression

`psql -f scripts/verify-anon-execute.sql` → **FAIL**:

```
anon-executable: 8 allowlisted, 1105 extension-owned (residual), 1 defects
DEFECT anon-executable: file_uploads_scan_status_guard() (security_definer=f)
ERROR: GAP-F0-08 regression: 1 project routine(s) executable by anon without an allowlist entry
```

The trigger function introduced in B6 was created without the default-privilege
revoke applied to it, so `anon` holds EXECUTE. Exploitability is low (a trigger
function invoked directly errors on a missing trigger context), but the
certified anonymous-EXECUTE contract is broken and the gate is red.

### C4. Related pattern census (for F0-B scope)

`SECURITY DEFINER` functions in `public` whose body references `current_user`
(17 total) must all be re-reviewed for the same vacuous-guard class. Confirmed
vacuous: `file_upload_record_scan`, `prudential_ewi_evaluate`. Also relevant:
trigger `entity_identity_snapshot_append_only` guards append-only integrity on
`current_user IN ('postgres','supabase_admin')`, which is satisfied inside any
definer path — potential integrity bypass, untested. Confirmed **safe**:
`workflow_resolve_actor` (reads the JWT role claim first and only falls back to
`current_user`, which cannot equal `service_role` inside a definer chain) — the
GAP-F0-16 actor-resolution contract is unaffected.

---

## D–T. Stages 1–11

**NOT EXECUTED.** Under the F0-C certification rule, discovery of a CRITICAL
defect in Stage 0 stops the affected scenarios and terminates the pass. The
Stage 1 surface manifest reconciliation, Stage 2 screen-by-screen matrix, Stage
3 persona matrix, Stage 4 twenty E2E scenarios, Stage 5 bypass pack, Stage 6
audit certification, Stage 8 security census, Stage 9 residual review, Stage 10
maturity scoring and Stage 11 freeze manifest are deferred to the next F0-C
attempt. No maturity scores are awarded and no freeze manifest is issued.

## P. Automated regression matrix (executed this pass)

| Gate | Planned | Result |
| --- | --- | --- |
| Frontend Vitest (incl. actionCoverage, routeCoverage, sidebarVisibility, catalogueIntegrity, anonExecuteAllowlist) | 1266 | **1266 PASS / 0 fail** |
| `verify-authz-centralized` | 1 | PASS |
| `verify-runtime-ownership` | 1 | PASS |
| `verify-no-alias-namespaces` | 1 | PASS |
| `verify-edge-authz` | 1 | PASS |
| `verify-atomic-authz` | 1 | PASS |
| `verify-rbac-parity` | 1 | PASS |
| `verify-breadcrumbs` | 336 routes | PASS (0 uncovered) |
| `verify-traceability` | 100 requirements | PASS (0 unproven claims) |
| `verify-hardening` | 31 | **31 PASS / 0 FAIL / 0 SKIP** |
| `verify-anon-execute` | 1 | **FAIL** (DEF-F0-C-03) |
| Convergence B–G (pgTAP, `app_certification_runner`) | 59 | 59 ok / 0 not ok / 0 errors |
| Malware scanner lifecycle (real provider) | 2 | **BLOCKED** (0E) |

Build: OK. Typecheck: clean.

## R. Residual risk register (unchanged, re-verified)

| ID | Severity | Status | Note |
| --- | --- | --- | --- |
| RES-F0-08-01 | LOW | ACCEPTED | 1105 anon-executable routines are extension-owned (`pgtap` 1074, `pg_trgm` 31), `SECURITY INVOKER`, owned by `supabase_admin`, not alterable by the migration role, no project privilege bridge. Owner: platform. Target: F20 production extension policy — relocate/drop `pgtap` outside `public` before production. Re-verified this pass by `verify-anon-execute.sql`. |
| RES-F0-15-01 | HIGH (open) | **NOT ACCEPTED — blocks certification** | No malware-scanning provider commissioned; see 0E. Owner: product owner. Required action: provision a real file-inspection provider and configure `FILE_SCAN_PROVIDER_URL`. |

## U. Final verdict

**F0-C NOT CERTIFIED — RETURN TO F0-B.**

Required before a further F0-C attempt:

1. DEF-F0-C-01 (CRITICAL) — replace the vacuous `current_user` guard in
   `file_upload_record_scan` with request-derived authorization; retest the
   forged-verdict and download-gating scenarios.
2. DEF-F0-C-02 (HIGH) — same fix for `prudential_ewi_evaluate`.
3. DEF-F0-C-03 (MEDIUM) — revoke `anon` EXECUTE on
   `file_uploads_scan_status_guard()` and restore the anon-EXECUTE gate to green.
4. Re-review the remaining `current_user`-guarded definer functions (§C4),
   including the `entity_identity_snapshot_append_only` append-only trigger.
5. Commission a real malware-scanning provider (0E), otherwise F0-C will
   remain environment-blocked for secure storage even once 1–4 are closed.

Stage 0B, 0C and 0D are **closed and green** and do not need to be repeated
unless their inputs change. Track A stops here; F1 has **not** been started.
