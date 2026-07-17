# 22 — Enterprise Read-Only Audit Report

**Project:** Unified License Hub (BOJ / FSC style regulatory portal)
**Audit date:** 17 Jul 2026
**Auditor role:** Senior Solution Architect / QA Lead / Security Auditor / DB Architect / Regulatory Domain Expert
**Scope:** Full application — frontend, backend, database, Supabase, Edge Functions, RPCs, triggers, RLS, storage, auth, workflow engine, notifications, AI, reports, dashboards, audit logs, file uploads, integrations, and all business modules.
**Method:** 100% read-only. Static review of the repository + read-only runtime probes (`supabase--linter`, `psql SELECT`, `supabase--slow_queries`, `security--get_scan_results`). No files, migrations, data, or configuration were modified.

Every finding cites concrete evidence — file paths, function names, and where possible line numbers or object identifiers. Findings that require live-service verification are explicitly labelled **runtime-verification-required**.

---

## 1. Executive Summary

The application is a large, feature-rich regulatory platform: **246 public tables, 310 public functions, 224 non-internal triggers, 624 RLS policies, 686 indexes, 443 SQL migrations, 57 Edge Functions, ~754 TypeScript/TSX source files, 74 automated tests**. Coverage of core supervisory domains (Licensing, Complaints, F&P, Prudential, Conduct, Returns, Coordination, Reports, Notifications) is broad. Recent work has moved the Complaints lifecycle onto a configuration-driven workflow engine (`execute_complaint_workflow_action`, `notification_outbox`, `WorkflowActionPanel.tsx`) which is architecturally sound.

However the platform is **not yet production-ready in the regulatory sense**. Key issues are concentrated in three areas:

1. **Security surface** — `supabase--linter` returned **532 warnings** (0 errors) dominated by `Function Search Path Mutable` (~500+ functions) and `Public/Auth executable SECURITY DEFINER` warnings; leaked-password protection is disabled; several `USING/WITH CHECK (true)` policies exist beyond service-role paths.
2. **Data / performance hotspots** — very high-volume PostgREST insert/update on `public.return_form_data` (562 s cumulative, 106 k calls) and unpaginated `SELECT * FROM licenses` (172 s / 4 486 calls) indicate N+1 or client-driven full-table reads.
3. **Configuration hygiene** — three orphan `VRF-EMPTY-ACTIONS` approval workflows, near-duplicate active workflows (`Pre License Approval Workflow` vs `Pre Licensee Approval Workflow`), audit-action naming duplicated (`application.created` **and** `application_created`; `payment.completed` **and** `payment_completed`), and function overloads that shadow one another (`assign_complaint`, `close_complaint`, `resolve_complaint`, `_resolve_application_workflow`, `get_application_list_page`, `start_complaint_investigation`, `update_complaint_severity`).

### Production-Readiness Scorecard (0 – 10)

| Pillar | Score | Rationale |
|---|---|---|
| Architecture | 7.5 | Clear separation (routes / hooks / lib / edge fns), workflow engine, `src/platform` — but 350 files use `as any`, some legacy shortcuts remain. |
| Security | 5.5 | RLS present everywhere; but 532 linter warnings, permissive-INSERT/UPDATE policies on `otp_verifications`, `complaints`, `compliance_returns`, disabled leaked-password check. |
| Database | 6.5 | Rich schema, but function overloads, missing FK indexes on hot columns, 6 SECDEF functions with no `SET search_path`. |
| Workflow engine | 7.0 | Configuration-driven complaint pipeline is real (`mutation_spec`, `assignment_rule`, outbox). Legacy workflow types (`VRF-EMPTY-ACTIONS`, duplicated pre-license) still present. |
| Performance | 5.0 | 106 k row-by-row upserts on `return_form_data`; unpaginated `licenses` scans; several missing FK indexes hit at query time. |
| Scalability | 6.0 | Outbox with `FOR UPDATE SKIP LOCKED` is good; but many hot RPCs are SECDEF and re-scan tables on each call. |
| Maintainability | 6.0 | 74 tests, 71 files with `console.*`, 75 `eslint-disable`, dead code (see §10). |
| Reliability | 6.5 | Concurrency guarded via `_expected_updated_at`; retry/backoff in outbox. Some duplicated audit-action strings weaken forensics. |
| Regulatory Compliance | 6.5 | Audit log, security_event_logs, per-regulator scoping present; but `audit_logs` triggers exist and rows insert, action taxonomy is inconsistent. |
| **Overall Quality** | **6.3** | **Not production-ready without addressing Critical + High findings in §13.** |

---

## 2. Architecture Assessment

**Stack.** React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui + TanStack Query + `react-router-dom` v6. Backend is Supabase (Postgres + PostgREST + Edge Functions + Auth + Storage). Deployed as a client-side SPA with heavy use of RPCs for privileged operations.

**Layering (`src/`).** `routes/*` (route trees), `pages/*` (screens), `components/*` (feature modules), `hooks/*` (data hooks over `supabase.rpc` / `supabase.from`), `lib/*` (pure helpers), `platform/*` (correlation-id-aware `invokeFn`, typed `AppError`, logger), `contexts/*` (Regulator / ActiveSector / Ppoc / SiteSettings / Auth).

**Backend flow.** Client → PostgREST (RLS-gated) or `supabase.rpc(...)` → SECURITY DEFINER functions (majority) that centrally enforce authz. Privileged actions (registration, web-user provisioning, notification dispatch, license certificate signing, audit export) go through 57 Edge Functions using `SUPABASE_SERVICE_ROLE_KEY`.

**Strengths.**

- Centralised, transactional workflow RPC (`execute_complaint_workflow_action`, 11 784 bytes) instead of scattered mutations.
- Durable `notification_outbox` with atomic claim (`claim_notification_outbox`) and stuck-claim reaper (`reap_stuck_notification_outbox`), matching Epic 0 guardrails.
- Comprehensive dynamic RBAC (`user_dynamic_roles`, `permission_actions`, `permission_modules`, `role_permissions`), correctly separated from `user_roles`.
- Regulator- and sector-scoped visibility contexts consistently threaded through hooks.

**Weaknesses (verifiable).**

- **Client-side is heavily coupled to Supabase**: `supabase.from(...)` appears in 323 files. Any RPC schema change ripples widely (see §5).
- `350` source files contain at least one `as any` cast (`rg -l "as any" src | wc -l`) — high type-safety debt.
- Two Edge Functions run **without JWT verification** (`supabase/config.toml`): `public-registry` and `developer-api`. Public-registry is legitimate; `developer-api` needs verification (see §6/§7).

---

## 3. Database Audit

### 3.1 Migration integrity

- **443** migration files under `supabase/migrations/`. No duplicate timestamps (checked via `ls | awk -F_ '{print $1}' | sort | uniq -c | awk '$1>1'`).
- **15** migrations contain `DROP TABLE` / `DROP FUNCTION` — expected during lifecycle; not necessarily bad.
- **2** migrations reference `notification_outbox` (creation + concurrency hardening), consistent with the current outbox worker design.

**Finding DB-1 (Low).** Migration filenames use both UUID-suffixed autogen (`YYYYMMDDHHMMSS_<uuid>.sql`) and human-slug forms (`20260710120000_fp_regulator_segregation_extended.sql`) inconsistently. Not a functional issue but hinders change archaeology. *Confidence: High.*

### 3.2 Tables

- **246** tables in `public`. **All tables have RLS enabled** and **0 tables have zero policies** (verified via `pg_class.relrowsecurity` and `pg_policies`).
- Row counts: `applications=105`, `licenses=18`, `complaints=28`, `returns_filed=68`, `workflow_instances=119`, `audit_logs=1168`, `notifications=763`, `notification_outbox=0`.

**Finding DB-2 (High) — Orphan / dead tables coexisting with the live schema.**
`pg_stat_user_tables` shows `n_live_tup = 0` for many tables that are still referenced in code, notably:

- `compliance_returns` (0 rows) is the **old** returns table but still has 9 policies and PPOC RLS logic; the current data lives in `returns_filed`. Coexistence risks writes hitting the wrong table.
- `documents` (0 rows) vs `document_versions` / `document_extractions` — the app writes primarily to `document_versions`.
- `application_legal_notes`, `application_rfi_auto_rules`, `approval_step_entry_notifications`, `audit_export_jobs`, `business_calendar_holidays`, `business_calendar_process_assignments`, `complaint_duplicate_clusters`, `complaint_duplicate_pairs`, `complaint_escalation_cases`, `complaint_escalation_log`, `conduct_triage_audit_events`, `coordination_cases`, `coordination_escalations`, `coordination_flags`, `coordination_messages`, `coordination_participants`, `correspondence_dispatches`, `correspondence_templates`, `countries`, `decision_options`, `decision_rationale_templates`, `delegation_rules`, `document_extractions`, `entity_relationships`, `fee_components`, `fee_rules` — all empty. Some are UI-only stubs the user explicitly acknowledged (Correspondence, Duplicate Detection, Escalation), but they carry RLS policies and FKs that widen the attack surface without adding value.

*Business impact:* stale RLS surface, misleading admin UIs claiming data exists, dev confusion.
*Suggested action (not implemented):* Inventory each 0-row table against `rg "<table>" src supabase/functions`; drop or clearly mark as UI-only stub. *Confidence: High for the fact of emptiness (runtime-verified); Medium for whether each is truly abandoned vs. simply not exercised yet.*

### 3.3 Foreign keys without covering indexes

Verified via `pg_constraint` ⋈ `pg_index`. The following FK columns have **no** btree index starting with the FK column set — this typically hurts joins, deletes on the referenced table, and RLS EXISTS-subqueries:

| Table | Constraint |
|---|---|
| `audit_logs` | `audit_logs_user_id_fkey` |
| `complaints` | `complaints_complainant_id_fkey` |
| `payments` | `payments_fee_configuration_id_fkey` |
| `licenses` | `licenses_sector_id_fkey`, `licenses_sub_sector_id_fkey`, `licenses_category_id_fkey` |
| `license_actions` | `license_actions_license_id_fkey` |
| `compliance_returns` | `compliance_returns_return_config_id_fkey`, `compliance_returns_license_id_fkey` |
| `workflow_instances` | `workflow_instances_workflow_id_fkey`, `workflow_instances_current_step_id_fkey` |
| `approval_actions` | `approval_actions_workflow_instance_id_fkey`, `_step_id_fkey`, `_actor_id_fkey`, `_delegated_to_fkey` |
| `fee_configurations` | 4 FKs (sector/sub_sector/category/service) |
| `return_configurations` | sector/sub_sector FKs |
| `payment_receipts` | `payment_receipts_payment_id_fkey` |
| `fee_rules` | `fee_rules_fee_configuration_id_fkey` |
| `documents` | `documents_uploaded_by_fkey` |
| `form_responses` | `form_responses_version_id_fkey` |
| `approval_workflows` | `approval_workflows_category_id_fkey` |
| `registrations` | `registrations_user_id_fkey` |
| `registration_form_submissions` | `_registration_id_fkey`, `_user_id_fkey` |
| `forms` | `forms_parent_form_id_fkey` |

**Finding DB-3 (High).** Missing FK indexes on hot-path columns will cause table-wide seq scans when RLS policies embed `EXISTS (SELECT 1 FROM parent WHERE parent.id = child.parent_id)`. `licenses` (in the top-5 slow queries at 172 s cumulative) is exactly this pattern. *Confidence: High.*

### 3.4 Function overloads (name collisions)

`pg_proc` reports 7 overloaded public functions:

- `assign_complaint` — two overloads. `_id, _assignee, _expected_updated_at` **vs** `_id, _investigator, _team, _reason`. The signatures aren't merely additive — the semantic role of arg 2 changes (assignee vs investigator).
- `close_complaint` — signature widened for concurrency (`_expected_updated_at`), old overload retained.
- `resolve_complaint` — same pattern.
- `update_complaint_severity` — same pattern.
- `start_complaint_investigation` — same pattern.
- `_resolve_application_workflow` — added `_is_post_license boolean`.
- `get_application_list_page` — added `_status_group text`.

**Finding DB-4 (High).** Retained legacy overloads may still be reachable via PostgREST if a client sends the shorter argument list. That bypasses the new concurrency guards (`_expected_updated_at`) which are the whole point of the recent refactor. *Business impact:* silent lost-update in Complaint lifecycle. *Suggested action (not implemented):* drop the older, argument-shorter overloads once callers are confirmed migrated. *Confidence: High.*

### 3.5 SECURITY DEFINER functions without `SET search_path`

Six functions are `SECURITY DEFINER` but do **not** have `search_path` pinned (verified with `pg_proc.proconfig`):

- `generate_receipt_number`
- `generate_return_unique_id`
- `generate_application_number`
- `generate_registration_reference`
- `generate_complaint_number`
- `generate_license_number`

**Finding DB-5 (High / Security).** Classic Postgres SECDEF hardening rule violation — an attacker with rights to create schema objects under a search path prefix could shadow relations these functions reference. *Confidence: High.*

### 3.6 RPC coverage

- **310** distinct public functions.
- **~46** referenced from client (`supabase.rpc(...)` in `src/**`), **~29** from Edge Functions.
- Cross-check surfaced many functions that appear used at runtime (triggers, cascades, other functions) but not directly by name in TS/Deno. The static "dead RPC" list therefore has False-Positive risk; a runtime `pg_stat_user_functions` snapshot would be needed to confirm.

**Finding DB-6 (Medium — runtime-verification-required).** Candidate dead RPCs (all only reachable from other DB objects if at all): `_touch_*` trigger stubs are legitimate. Non-trigger candidates worth reviewing: `application_ids_for_licensee`, `audit_step_assignee_label`, `bootstrap_supervisory_profile`, `build_workflow_snapshot`, `classify_ratio_risk`, `clone_validation_rule`, `close_complaint(_id, _reason, _category)` (older overload), `create_audit_log`, `create_notification`, `duplicate_hub_stats`. *Confidence: Medium — static evidence only.*

### 3.7 Triggers

**224** non-internal triggers. Top-loaded tables: `applications` (9), `licenses` (7), `compliance_audit_logs` (6), `complaints` (6), `security_event_logs` (5), `approval_actions` (5), `audit_logs` (5).

**Finding DB-7 (Medium).** 9 triggers on `applications` and 7 on `licenses` will each fire on every write. During bulk operations (bulk-intake, migrations) trigger stacks materially increase write time. Ordering is by trigger name (Postgres default) — not by explicit sequence. Static review can't determine whether ordering matters, but the density is a smell worth a targeted review. *Confidence: Medium.*

### 3.8 Concurrency & optimistic locking

- `workflow_instances.updated_at` used as the concurrency token by `WorkflowActionPanel.tsx` (correctly, via `get_complaint_tracking`). ✅
- `execute_complaint_workflow_action` receives `_expected_updated_at` and (from the retained migration) checks it. ✅
- The **older, no-token** overloads of `close_complaint`, `resolve_complaint`, etc. still exist — see DB-4. ⚠️

### 3.9 RLS "always true" policies

13 policies use `USING true` / `WITH CHECK true` for non-SELECT operations. Most are legitimate service-role scoped:

- `profiles → Service role can manage all profiles [ALL]`
- `job_queue → Service role manages queue [ALL]`
- `otp_verifications → Service role manages OTP [ALL]`
- `license_certificate_signatures → Service role writes certificate signatures [INSERT]`
- `return_data_revisions → Service role manages revisions [ALL]`
- `application_legal_notes → Service role manages legal notes [ALL]`
- `twinpeaks_clearances / disagreements → Service manages [ALL]`
- `conduct_monitoring_rule_runs → cmrr_write [ALL]`

But three are genuinely permissive to `authenticated`:

- `complaints → "Update complaints" [UPDATE] WITH CHECK true`  (USING clause is scoped, but the WITH CHECK is `true`, so any allowed row can be rewritten to any values including `investigator_id`, `severity`, etc.).
- `compliance_returns → "Submitters update draft returns" [UPDATE] WITH CHECK true`  (same pattern — draft check is only in USING).
- `otp_verifications → "Public insert OTP" [INSERT] WITH CHECK true`  (allows any authenticated caller to insert arbitrary OTP rows).
- `return_comments → "Manage return comments" [ALL] to authenticated`.

**Finding DB-8 (High / Security).** `WITH CHECK true` on `complaints.UPDATE` and `compliance_returns.UPDATE` permits an authenticated user with USING access to overwrite fields they shouldn't own (e.g. investigator, status, workflow columns). Any server-side workflow guard (`execute_complaint_workflow_action`) is bypassed by a direct PATCH to PostgREST. *Confidence: High.*

**Finding DB-9 (Medium / Security).** `otp_verifications` allows any authenticated user to INSERT arbitrary rows (`Public insert OTP`). Rate-limiting is not evident from static review. Could enable OTP replay / spam. *Confidence: Medium — depends on Edge Function guards.*

### 3.10 Storage buckets

10 buckets. **`branding-assets` and `avatars` are public** (`storage.buckets.public = true`). Linter flags `SUPA_public_bucket_allows_listing`. All other buckets (`documents`, `secure-documents`, `payment-documents`, `license-certificates`, `certificate-assets`, `audit-exports`, `fp-evidence`, `return-uploads`) are private — appropriate.

**Finding DB-10 (Low / Security).** Public bucket enumeration is possible for `avatars` / `branding-assets` if policies allow anonymous SELECT. Verify no PII is uploaded there. *Confidence: Medium — runtime-verification-required.*

---

## 4. Workflow Engine Audit

### 4.1 Configuration

Approval workflows in DB:

| Name | active | entity_type |
|---|---|---|
| Complaint Management Workflow | ✅ | complaint |
| Post Application Workflow | ✅ | post_application |
| Building Society Pre License Workflow | ❌ | pre_application |
| Commercial Bank Pre Licensee | ✅ | pre_application |
| Insurance Workflow | ❌ | pre_application |
| **Pre License Approval Workflow** | ✅ | pre_application |
| **Pre Licensee Approval Workflow** | ✅ | pre_application |
| VRF-EMPTY-ACTIONS (×3) | ❌ | pre_application |
| Registration Workflow | ✅ | registration |
| Return Workflow | ✅ | return |

**Finding WF-1 (High).** Two near-identically-named ACTIVE workflows for the same entity_type (`Pre License Approval Workflow` vs `Pre Licensee Approval Workflow`). The resolver (`_resolve_application_workflow`) picks by sector/category/regulator, but nothing structural prevents both from matching. Ambiguous routing is a workflow-engine anti-pattern. *Confidence: High.*

**Finding WF-2 (Medium).** Three orphan `VRF-EMPTY-ACTIONS` workflows exist as leftover verification artefacts. Not active but pollute the admin listing. *Confidence: High.*

### 4.2 Complaint workflow implementation

- `execute_complaint_workflow_action` — 11.8 KB PL/pgSQL, present and active.
- `get_complaint_available_actions` — 1.2 KB.
- `get_complaint_tracking` — 3.3 KB.
- `claim_notification_outbox` — 457 bytes, uses `FOR UPDATE SKIP LOCKED` (verified via migration `20260716140702_*.sql`).
- `reap_stuck_notification_outbox` — 386 bytes.
- Trigger `trg_start_complaint_workflow` fires on `complaints` INSERT.
- 12 `approval_steps` rows are wired to the complaint workflow.
- 28 `workflow_instances` with `entity_type='complaint'` currently exist.

**Finding WF-3 (Medium).** No structural gate ensures every `INSERT INTO complaints` results in a corresponding `workflow_instance`. If the trigger fails silently, complaints could exist without a workflow. Recommend a nightly sweep report on complaints with no `workflow_instances` row and a NOT VALID CHECK / partial index. *Confidence: Medium — runtime-verification-required.*

### 4.3 Bypass surface

**Finding WF-4 (High).** Because `complaints.UPDATE` WITH CHECK is `true` (DB-8), the workflow engine can be bypassed by a raw PostgREST PATCH. The engine is only authoritative if writers are forced through the RPC. *Confidence: High.*

---

## 5. Frontend Audit

### 5.1 Routing / guards

`src/App.tsx` composes six route trees (`publicRoutes`, `dashboardRoutes`, `adminRoutes`, `settingsRoutes`, `returnsRoutes`, `fpaRoutes`) inside `<ErrorBoundary>` + `<Suspense fallback={<AuthLoadingScreen />}>`. Guards live in `src/components/auth/RouteGuards.tsx` + `PermissionGate.tsx` (dynamic module/action). Structure is clean.

### 5.2 State / caching

React Query configured with `staleTime: 30s, retry: 2` — reasonable. `refetchOnWindowFocus: false` intentional.

### 5.3 Concrete issues

**Finding FE-1 (Medium).** **`console.*` calls in 71 production files** (`rg -c "console\.(log|debug|info|warn|error)" src --glob '!src/test/**'`). Some are useful (`console.warn` in `useAuditLog.ts` under `import.meta.env.DEV`), but not all are gated. Leaks internal state to browser dev tools and adds noise. *Confidence: High.*

**Finding FE-2 (Medium).** **`350` files contain `as any` casts** — many concentrated around `supabase as any).rpc` (`src/lib/twinPeaksClearance.ts` alone has 5). Weakens the auto-generated `src/integrations/supabase/types.ts` guarantees. *Confidence: High.*

**Finding FE-3 (Low).** **75 `eslint-disable` directives** — indicates rules are systematically silenced. Worth an audit. *Confidence: High.*

**Finding FE-4 (Low).** **Unused / dead modules** (heuristic: not imported from any other file):

- `src/lib/licenseStatusBadge.tsx`
- `src/lib/permissionRegistry.ts`
- `src/lib/permissionTabs.ts`
- `src/lib/formStorage.ts`
- `src/lib/workflowService.ts`
- `src/hooks/useApiQueries.ts`

*Confidence: Medium — heuristic based on `rg` name matching; deep re-exports could hide use.*

**Finding FE-5 (Low).** `src/components/ui/chart.tsx` uses `dangerouslySetInnerHTML` at line 70. It's shadcn's canonical chart theming snippet (CSS variables) and safe — noting for completeness, **not** a finding requiring action.

### 5.4 Sensitive-data rendering

`src/hooks/useRegistrationForm.ts` handles `password` / `confirmPassword` as expected form state — validated locally, submitted to Edge Function. `RegistrationReview.tsx` was fixed in an earlier turn to mask these. Verified by grep — no direct rendering of these fields in review pages.

---

## 6. Backend / Edge Function Audit

### 6.1 Inventory

57 Edge Functions. All those touching authorized data correctly use `SUPABASE_SERVICE_ROLE_KEY` server-side. AI Functions (`document-extract`, `fp-ai-media-ingest`, `fp-screening-run`, `generate-application-ai-assessment`, `generate-dashboard-insights`, `generate-return-analysis`) all use `LOVABLE_API_KEY` — correct pattern for the Lovable AI Gateway (no user key needed).

### 6.2 JWT verification

`supabase/config.toml` disables JWT verification for:

- `public-registry` — appropriate (public licensee lookups).
- `developer-api` — needs review.

**Finding BE-1 (High / Security).** `developer-api` has `verify_jwt = false` while the function itself needs `SUPABASE_SERVICE_ROLE_KEY`. If it exposes any privileged read/write path and relies solely on an application-issued API key, key validation must be present in the function body. Static review of `supabase/functions/developer-api/index.ts` is required to confirm the API-key path is airtight. *Confidence: Medium — runtime-verification-required (function body not fully audited in this pass).*

### 6.3 Notification worker

`supabase/functions/process-notification-outbox/index.ts` is well-designed:

- Uses `claim_notification_outbox` for atomic batch claim.
- `reap_stuck_notification_outbox` at start of each run.
- Exponential backoff (min(60, 2^retry)) up to `MAX_ATTEMPTS = 6`.
- Non-fatal reap wrap.

**Finding BE-2 (Low).** `MAX_ATTEMPTS = 6` and `BATCH_SIZE = 50` are hard-coded. Fine for now; consider driving from `notification_event_configs`. *Confidence: High.*

### 6.4 Correlation-id / logging

`src/platform/http/invokeFn.ts` centralises Edge Function invocation with a correlation ID and typed `AppError` — good. However **many callers still use `supabase.functions.invoke` directly** (grep for `supabase.functions.invoke` returns numerous hits) bypassing the platform wrapper.

**Finding BE-3 (Medium).** Inconsistent Edge Function invocation loses correlation-id coverage. Adopt `invokeFn` everywhere or lint-forbid the direct call. *Confidence: High.*

---

## 7. Security Audit

Summary of `supabase--linter` (532 warnings, 0 errors):

| Category | Approx count |
|---|---|
| Function Search Path Mutable | ~490 |
| Anon Can Execute SECURITY DEFINER | ~15+ |
| Authenticated Can Execute SECURITY DEFINER | ~15+ |
| RLS Policy Always True | 3 real (excluding service-role) |
| Public Bucket Allows Listing | 2 |
| Leaked Password Protection Disabled | 1 |

**Finding SEC-1 (High — cascade of DB-5).** ~490 functions have mutable `search_path`. Standard hardening is `SET search_path = public` in the function definition. Batch-fix is safe. *Confidence: High.*

**Finding SEC-2 (Medium).** SECURITY DEFINER functions executable by `anon` (partial list from `pg_proc` × `has_function_privilege`): `_assert_complaint_fresh`, `assign_complaint`, `close_complaint`, `create_complaint`, `bootstrap_supervisory_profile`, `admin_override_form_version_assignment`, and dozens more. Some legitimately need anon (`get_declaration_invitation_public`, `submit_declaration_form`, `verify_declaration_identity`, `public-registry`-backed reads), but the majority should be revoked from `anon`. *Confidence: High.*

**Finding SEC-3 (Medium).** Leaked-password protection is disabled — the Supabase auth setting `password.min_strength.pwned` is off. Enable at project level. *Confidence: High.*

**Finding SEC-4 (High).** See DB-8 — permissive `WITH CHECK true` on `complaints` and `compliance_returns` UPDATE lets authenticated users bypass the workflow engine.

**Finding SEC-5 (Medium).** `.env` publishes `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` — these are safe (publishable / anon). No service-role or private secret leaked in-repo (grep for `SERVICE_ROLE`, `secret\s*=`, `password\s*=`). ✅

**Finding SEC-6 (Low).** `dangerouslySetInnerHTML` used only in `src/components/ui/chart.tsx` (shadcn theme snippet). No XSS surface introduced. ✅

**Finding SEC-7 (Medium).** Overloaded `close_complaint` / `resolve_complaint` / etc. without `_expected_updated_at` allow lost-update attacks. Same root as WF-4 / DB-4. *Confidence: High.*

**Finding SEC-8 (Low — Info).** `has_role` is correctly `SECURITY DEFINER STABLE` and takes `_user_id, _role app_role` — matches the guideline in `<user-roles>` docs. ✅

---

## 8. Module-by-Module Findings

### 8.1 Complaints

- Lifecycle now runs on `execute_complaint_workflow_action` + `WorkflowActionPanel.tsx`. ✅
- Notifications: 139 rows in `notification_event_configs`, including all complaint lifecycle events (`complaint.closed`, `complaint.escalated_to_enforcement`, `complaint.investigation_started`, `complaint.resolved`, `conduct_alert_created`, `conduct_high_severity_complaint`, `conduct_investigation_assigned`, `conduct_evidence_uploaded`, `conduct_evidence_access_denied`).
- **Blocker CX-1 (High).** DB-8 / SEC-4 permit direct PATCH bypass.
- **CX-2 (Medium).** Legacy overloads of workflow RPCs still exist (DB-4).
- **CX-3 (Low).** Duplicate Detection / Correspondence tables are UI-only stubs (empty at runtime) — verified as design intent but still exposed.

### 8.2 Licensing

- Slow query #2 and #3 are unpaginated reads of `licenses` — see §9.
- Missing FK indexes on `licenses.sector_id/sub_sector_id/category_id` and `license_actions.license_id` — §3.3.
- 18 license rows in DB. `applications` has 105 with statuses spread across submitted/draft/approved/in_progress/cancelled/rejected/query_raised — pipeline healthy.

### 8.3 Fit & Proper

- Rich schema (`fp_*` tables, 18 of them). Edge functions: `fp-ai-media-ingest`, `fp-cycle-scheduler`, `fp-monitoring-sweep`, `fp-screening-run`. Cron scheduling migration `20260710130000_fp_cycle_scheduler_cron.sql` present.
- No specific verifiable defect surfaced beyond the SEC-1/SEC-2 categories that affect fp_*_touch trigger functions.

### 8.4 Prudential

- Tables: `prudential_ratios`, `prudential_thresholds`, `prudential_actions`, `prudential_stress_events`, `prudential_data_feed_logs`, etc.
- Edge functions `evaluate-prudential-early-warnings`, `prudential-monitoring-sweep` present.
- **PRU-1 (Info).** `prudential_data_feed_logs` and `prudential_escalations` have only 1 policy each — verify that RLS covers regulator scoping. *Confidence: Medium — runtime-verification-required.*

### 8.5 Market Conduct & Enforcement

- 27 `conduct_*` tables plus `enforcement_actions`, `enforcement_case_events`.
- Reworked earlier so `EnforcementDetail.tsx` is presentation-only. `evaluate-conduct-monitoring` edge function present.
- No structural defect surfaced beyond the general permissive-policy family.

### 8.6 Coordination / Twin Peaks

- 5 `coordination_*` tables, 2 `twinpeaks_*` tables, all with 0 rows.
- `twinpeaks_clearances / disagreements` have service-role `WITH CHECK true` — appropriate for admin-only writes.

### 8.7 AI Modules

- `generate-application-ai-assessment`, `generate-return-analysis`, `generate-dashboard-insights`, `document-extract`, `fp-ai-media-ingest`, `fp-screening-run`.
- All use `LOVABLE_API_KEY` via Lovable AI Gateway — no user-visible key in repo. ✅
- **AI-1 (Medium — runtime-verification-required).** Cannot statically verify prompt-injection defences, JSON-schema validation of AI output, or fallback logic on Gateway rate-limit. Recommend a dedicated review pass over the six function bodies.

### 8.8 Reports & Dashboards

- Report tables (`report_definitions`, `report_logs`, `report_run_files`, `report_run_rows`, `report_source_columns`, `report_source_filters`, etc.) present.
- Earlier session confirmed `aud-export` reads `report_logs`. Ad-hoc downloads in `SlaManager` / `UserManagement` do **not** call `reportService.logExport` → not surfaced in `aud-export` audit view.

**Finding RPT-1 (High — carried over).** Some export paths bypass audit logging. Static evidence: `rg "reportService\.logExport|logAction\('.*export'" src` shows exports in list pages that do not call either. *Confidence: High.*

### 8.9 Notifications

- `notification_outbox` currently empty (0 rows) at scan time — worker is draining successfully, **or** no dispatches have run since last drain. Runtime-verification-required to disambiguate.
- 5 indexes on `notifications` (pkey, `user_read`, `created`, `channel`, `user_channel`) — good coverage. However top-slow query #4 is still `SELECT * FROM notifications WHERE user_id=$ AND channel=$ ORDER BY created_at DESC` at 97 s cumulative — likely because the query planner picks `idx_notifications_user_channel` but doesn't co-order by `created_at`. Consider a composite `(user_id, channel, created_at DESC)`.

### 8.10 Audit logs

- 1 168 rows. Top actions include duplicated taxonomy:
  - `application.created` (45) **and** `application_created` (47) — **duplicate concept, two naming conventions**.
  - `application.submitted` (48) **and** `application_submitted` (27).
  - `payment.completed` (21) **and** `payment_completed` (22).

**Finding AL-1 (Medium).** Split audit-action namespace breaks downstream analytics and prevents `application.approved` (etc.) from being counted honestly. Consolidate to `entity.action` dot-form (matching `audit-log-coverage.md`). *Confidence: High.*

**Finding AL-2 (Low).** `security_event_logs` shows `ACCESS_DENIED = 62` in last 30 d, `AUTH_FAILED = 1`. The 62 denials should be reviewed for legitimate authz failures vs. UI making calls it shouldn't.

---

## 9. Performance Audit

From `pg_stat_statements` (top 5):

| Rank | Query | Calls | Mean ms | Total ms |
|---|---|---|---|---|
| 1 | UPSERT `return_form_data` (per field per return) | 106 480 | 5.28 | 562 113 |
| 2 | `SELECT licenses WHERE status = $` | 4 486 | 38.27 | 171 684 |
| 3 | `SELECT id, application_id, license_number FROM licenses` (unfiltered) | 3 676 | 28.92 | 106 325 |
| 4 | `SELECT * FROM notifications WHERE user_id=$ AND channel=$ ORDER BY created_at DESC` | 24 691 | 3.92 | 96 908 |
| 5 | `SELECT * FROM public.get_my_ppoc_mapped_entities()` | 3 315 | 27.86 | 92 371 |

**Finding PERF-1 (High).** `return_form_data` upsert pattern issues one PostgREST call per field. A single return with ~200 fields therefore fires ~200 network round-trips. Batch-upsert (`.upsert([row, row, ...])`) or a single RPC would collapse this. *Confidence: High.*

**Finding PERF-2 (High).** `licenses` is being scanned unpaginated 4 486 times. Adding `.limit(...)` / paginating client callers and creating `licenses_status_idx` would flatten. *Confidence: High.*

**Finding PERF-3 (Medium).** `get_my_ppoc_mapped_entities()` mean 27.86 ms × 3 315 calls = 92 s. It's SECURITY DEFINER and called on nearly every PPOC user pageload. Cache in the client via TanStack Query staleTime and consider a materialized-cache path.

**Finding PERF-4 (Medium).** Notifications composite index (user_id, channel, created_at DESC) missing (§8.9).

---

## 10. Code-Quality & Dead Code

- 74 test files under `src/test/`.
- `1` test currently `.skip` (`src/test/returnsAccountingReconciliation.test.ts`).
- Dead-code candidates (§5 FE-4).
- 2 TODO/FIXME comments in `src/**` (very low).
- `.rpc` cast as `any` in 10+ files — should use generated types.

---

## 11. Testing Audit

- 74 tests in `src/test/` — cover complaints workflow guardrails, RLS route guards, workflow action filters, form persistence, SLA, returns validation, applicant-facing actions, etc.
- Skipped: 1 (see above).
- **TEST-1 (Medium).** Tests are mostly unit-level with heavy mocking (see `src/test/setup.ts`). No end-to-end DB integration tests were found; no evidence of tests hitting the real `execute_complaint_workflow_action`. Recommend Playwright/E2E for at least: complaint create → workflow action → notification enqueue.
- **TEST-2 (Medium).** No test enforces the "workflow can only be advanced via RPC" invariant (which is exactly the bypass in SEC-4). A regression test would catch future permissive-policy regressions.

---

## 12. Regulatory / Domain Compliance Notes

- Audit trail exists (`audit_logs`, `compliance_audit_logs`, `conduct_triage_audit_events`, `return_audit_log`, `security_event_logs`). Duplicate taxonomy (AL-1) undermines regulator-grade reporting.
- Per-regulator scoping via `RegulatorContext` and `entity_user_access` is consistently threaded — matches the "Regulator Scoping" memory rule.
- No signature workflow enforcement problem surfaced (license certificates use `LICENSE_SIGNING_KEY_PEM` in Edge Function — appropriate).
- Data retention / erasure policies are **not** visible in the migrations — likely missing.

---

## 13. Findings Register

### CRITICAL

_None found by static+runtime read-only review. The two closest candidates (DB-8 permissive UPDATE and DB-4 legacy overloads) are High-severity because they require an authenticated actor to exploit; combined they could enable workflow-engine bypass without triggering audit — that's Critical if confirmed exploitable end-to-end (needs runtime verification)._

### HIGH

| ID | Area | File / Object | Root cause | Impact | Confidence |
|---|---|---|---|---|---|
| DB-2 | DB | 30+ empty tables incl. `compliance_returns`, `documents` | Legacy schema not retired | Widened RLS surface, dev confusion | H |
| DB-3 | DB | FKs listed §3.3 | Missing indexes | Seq scans in RLS/joins | H |
| DB-4 / SEC-7 | DB/Sec | `assign_complaint`, `close_complaint`, `resolve_complaint`, `update_complaint_severity`, `start_complaint_investigation`, `_resolve_application_workflow`, `get_application_list_page` (overloads) | Older no-token overloads retained | Lost-update / concurrency bypass | H |
| DB-5 / SEC-1 | Sec | `generate_*_number` SECDEF fns | No `SET search_path` | Function-hijack surface | H |
| DB-8 / SEC-4 / WF-4 / CX-1 | Sec/WF | `complaints.UPDATE` and `compliance_returns.UPDATE` WITH CHECK true | Permissive RLS | Workflow bypass, audit forgery | H |
| WF-1 | WF | `Pre License Approval Workflow` / `Pre Licensee Approval Workflow` both active | Duplicate config | Ambiguous routing | H |
| BE-1 | Sec | `supabase/functions/developer-api/index.ts` + `config.toml verify_jwt=false` | No JWT | Depends on in-function key check | M-H |
| PERF-1 | Perf | `return_form_data` upsert pattern | Row-by-row PostgREST | 106 k calls, 562 s cumulative | H |
| PERF-2 | Perf | Client callers of `supabase.from('licenses')` | Unpaginated scans | 172 s cumulative | H |
| RPT-1 | Reports | Ad-hoc downloads in `SlaManager`, `UserManagement` | No `logExport` call | Gaps in audit-export | H |
| SEC-1 | Sec | ~490 functions | Mutable `search_path` | Function-hijack risk (broad) | H |

### MEDIUM

| ID | Summary | Confidence |
|---|---|---|
| DB-6 | Candidate dead RPCs — needs `pg_stat_user_functions` snapshot | M |
| DB-7 | Trigger density on `applications` (9) and `licenses` (7) | M |
| DB-9 | `otp_verifications` public INSERT | M |
| WF-2 | 3 `VRF-EMPTY-ACTIONS` orphan workflows | H |
| WF-3 | No structural guarantee complaint → workflow_instance | M |
| FE-1 | 71 files with production `console.*` | H |
| FE-2 | 350 files with `as any` | H |
| BE-3 | Direct `supabase.functions.invoke` bypassing `invokeFn` | H |
| SEC-2 | SECDEF functions executable by anon | H |
| SEC-3 | Leaked-password protection disabled | H |
| PERF-3 | `get_my_ppoc_mapped_entities` hot RPC | H |
| PERF-4 | Missing composite index on notifications | H |
| AL-1 | Duplicate audit-action naming | H |
| AI-1 | AI function fallback / injection defences unaudited | M |
| PRU-1 | Prudential feed-log RLS coverage | M |
| TEST-1 / TEST-2 | Missing E2E and bypass-regression tests | M |

### LOW

- FE-3 (75 eslint-disable), FE-4 (dead lib files), DB-1 (migration naming), DB-10 (public buckets), BE-2 (hard-coded MAX_ATTEMPTS), AL-2 (62 ACCESS_DENIED events to review), CX-3 (UI-only stubs), SEC-8 (info-only).

### INFORMATIONAL

- FE-5: shadcn chart uses `dangerouslySetInnerHTML` safely. No action.
- `.env` contains only publishable keys. No secret leak. No action.

---

## 14. Runtime-Verification-Required Items

These findings cannot be conclusively settled by static review alone:

1. **BE-1** — full body review of `developer-api/index.ts` to confirm API-key path is authenticated & rate-limited.
2. **DB-6** — dead-RPC list needs `pg_stat_user_functions.calls` over ≥30 days.
3. **DB-10** — do `avatars` / `branding-assets` public buckets contain any PII?
4. **WF-3** — do any live `complaints` exist without a `workflow_instances` row?
5. **AI-1** — AI Function prompt-injection tests and JSON-schema validation.
6. **PRU-1** — regulator scoping on `prudential_data_feed_logs`, `prudential_escalations`.
7. Actual reachability of legacy overloads via PostgREST (DB-4) — synthetic test needed.
8. Whether the 62 `ACCESS_DENIED` events in 30 d correspond to legitimate authz denials or client-side over-fetching.

---

## 15. Technical Debt & Production Risk Register

| Debt item | Effort | Risk if ignored |
|---|---|---|
| Retire empty legacy tables (DB-2) | M | Attack surface, dev confusion |
| Drop older RPC overloads (DB-4) | S | Lost-update in complaint lifecycle |
| Tighten permissive `WITH CHECK true` policies (DB-8) | S | Workflow bypass |
| Pin `search_path` on ~490 SECDEF functions (SEC-1) | M (scripted) | Function hijack |
| Consolidate audit-action taxonomy (AL-1) | S | Regulatory reporting integrity |
| Add missing FK indexes (DB-3) | S | Query performance under scale |
| Batch `return_form_data` upserts (PERF-1) | S-M | Return submission latency |
| Paginate `licenses` reads (PERF-2) | S | Dashboard latency |
| E2E workflow regression tests (TEST-1/2) | M | Silent regressions of bypass fixes |
| Adopt `invokeFn` universally (BE-3) | S | Correlation-id coverage |
| Remove dead workflows (WF-2) and reconcile duplicate active workflows (WF-1) | S | Ambiguous routing |
| Reduce `as any` usage (FE-2) | L | Type-safety debt |
| Enable leaked-password protection (SEC-3) | S | Compliance |
| Gate all AI outputs with Zod / JSON schema (AI-1) | M | Hallucinated data in regulator UI |

---

## Verdict

**The application is architecturally credible but not production-ready** for a real regulatory deployment. The highest-priority items are structural and small in scope: retire the permissive `WITH CHECK true` policies, drop the legacy no-token RPC overloads, batch-fix `search_path`, and consolidate audit-action naming. Performance hotspots (`return_form_data`, `licenses`) require batching and pagination but are contained.

Once the High-severity findings in §13 are addressed and the runtime-verification items in §14 are resolved, the platform can move from a 6.3/10 overall score to comfortably ≥8/10 with the current feature set.

*End of report — no code, migration, or configuration was modified during this audit.*
