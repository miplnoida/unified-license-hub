# OLRAS gap closure — verified status

Reviewed 25 November 2026. This is a partial implementation milestone, not whole-system certification.

## Delivered and verified

| Area | Change | Evidence | Limit |
|---|---|---|---|
| Complaint workspace access | Institutional users refused on protected complaint workspace/tracking routes before read-only or dynamic fallback; public intake routes unchanged | 7 route-authorization tests; signed-in staff Complaints page rendered | Existing primary/secondary account browser negative tests not performed; no database authorization changed |
| Pre-licence identity | Canonical `applicant_user`/`pre_licensee_user` cannot gain post-licence UI access from a linked licence or primary profile | 8 post-licence tests plus existing route/Returns tests | Existing explicit PPOC exception preserved; server create/save restriction is still pending |
| Package classification | Unknown named modules default disabled; all known permission modules and queried live aliases explicitly mapped | 12 package tests; signed-in `/settings/package` rendered Package C | No package switched; backend operations and unreadable-settings fail-open behavior remain pending |
| Findings reports | Resolve institution through examination, using caller-scoped queries; fill partial missing names; fail on query error; require institution column for legacy selection | 67 report regressions; deployed `generate-report`; normal signed-in Report Library → Generate → dialog → CSV/PDF downloads | Only this report flow verified; no scheduled report invoked |
| Report preview authority | Remove raw-table fallback; propagate authorization refusals and service failures | 3 concrete server-success/refusal/outage tests | No backend permission change |
| Report Library availability | Intersect package availability with role permission; no loading-time offerings; fix built-in Approved Persons/Ownership permission aliases | 5 library cases and 2 catalogue mapping/tier tests | Package switching not performed; unreadable package settings and server operation gates remain open |

### Report evidence

- Report contains 13 findings, matching live source count.
- 3 findings identify Rodney Bay Community Credit Union Ltd; 10 identify Meridian Commercial Bank Limited.
- Existing rows are not collapsed by title: the repeated Meridian records remain distinct source records. No data deletion or deduplication performed.
- CSV has provenance before its data header; after locating the `entity_name` header, 13 data rows and the same 3/10 institution breakdown were verified.
- PDF downloaded (2 pages); extracted text contains the institution names and OLRAS letterhead. Line-wrap normalization was required to verify the Rodney Bay name, not an export correction.
- Preview screenshot inspected; browser raised no page runtime errors in the exercised staff pages.
- Report generation/export used the normal staff screens and created ordinary report history/export audit entries; no application, licence, finding or policy records were changed.
- Branding currently displays OLRAS, not an independently verified official FSRC logo.

### Checks

- Access/route/package tests: **72/72**.
- Reporting tests: **67/67**.
- Earlier combined targeted regressions: **139/139**. Final focused suite after preview/library/catalogue changes: **140/140 across 13 files** (not a full app suite).
- Latest observed preview build entry before the final catalogue correction: **build OK**, 25 November 2026 05:34:15 UTC; final diagnostics checked again before commit.
- Browser session was the requester's authorized internal/break-glass account; it was confirmed on screen. Results do not establish ordinary-role visibility.
- `generate-report` deployed with final source SHA-256 `4cc67d6fbb421004f9d0b3184d79d30eaf60eadbd53e7ed74e8cfc0e431316f9`.
- Frontend was not published; no SMTP/OTP, security scan, workflow approval or shared-server resize triggered.

## Corrections to the approved plan's historical assumptions

| Earlier assumption | Current direct evidence | Correct status |
|---|---|---|
| Access-letter bucket absent | Live storage read: `entity-access-requests`, private, 20 MiB limit | Bucket exists; do not recreate or change its privacy. Complete user-request journey remains unverified |
| Submitted edit guard still unapplied | Live `application_draft_save` and `can_mutate_application` contain the submitted `in_progress`/`submitted` lock | Guard already present. Roadmap's older pending entry is historical; do not reapply just to close a checklist |
| Returned-for-correction save ready | Live save-status list omits `returned_for_correction`; staged accepted SQL adds it and retains the guard | Confirmed pending defect; owner placed it ON HOLD 2026-11-25 ("Keep it on hold") — SQL not applied |
| 54 pending files | Fresh grouped query: 78 pending_scan, 7 legacy_unverified, 11 clean | Current queue problem remains; prior counts are outdated |
| 72/91 institutions lack lead regulator | Fresh query: 73 of 92 institutions lack lead regulator | Current completeness gap; no invented assignments |
| Reports Overview empty | Authorized browser shows 57 applications, 116 active licences, XCD 54,967 revenue, 3 overdue filings, 94% accepted filings, 11 complaint backlog | Page renders current metrics; population/denominator reconciliation is still required |
| Package-settings address | Actual registered path `/settings/package`; an initial guessed address returned 404 | Correct path verified; no extra alias introduced |

## Confirmed server-boundary concerns requiring approved SQL

1. Live `has_portal_capability` maps area/capability to a permission, but does not use `_entity_id` for external scope. This is a confirmed unscoped capability resolver, **not proof that arbitrary private records are exposed**: row-level policies and caller paths must be examined before changing it.
2. Live `create_application_draft` permits applicant/pre-licensee roles initially, then checks post-licence applicability, entitlement and renewal exception. Live `entity_license_entitlements` includes licences linked through the caller's applications/profile. No independent licensed-portal identity refusal was found in this inspected create path. Exact SQL must restrict post-licence identity without breaking legitimate PPOC/member/renewal paths or ordinary pre-licence applications.
3. Existing institution-application visibility hold remains in force. General programme approval is not treated as approval of an unseen authorization change.
4. Package operation gates need a single server contract, module inventory, scheduled-task behavior and negative authorization tests. Do not broadly rewrite shared permission functions without review, particularly while AML is frozen.
5. Report scheduling currently calls shared `executeQuery` with the service-role `admin` client in `run-scheduled-reports`. Interactive generation uses a caller-scoped client. Scheduling therefore needs explicit owner-scope authorization design and tests before it can be certified as equivalent to interactive reports; no scheduled run was executed.
6. Client report-preview fallback previously caught server errors and queried a raw source. It has now been removed and tested for fail-closed behavior; it was not used to verify the findings flow.

## Programme remaining work and acceptance criteria

| Phase | Remaining work | Closure evidence | Blocker/authority |
|---|---|---|---|
| Security/access | Post-licence backend identity, entity-scoped capability, disabled-package operation boundary | Positive current-member/PPOC checks and negative pre-licensee/other-entity/disabled-module checks; exact approved SQL; RLS unchanged unless explicitly approved | SQL/security approval; preserve earlier institution-access hold |
| Documents | Commission scanner, prove worker scheduling, OTP recovery/upload | Ordinary applicant uploads; deduplicated queue job; clean verdict enables only authorized download; scan-error/pending remain blocked | Actual scanner service and secret configuration; mailbox/OTP-send authorization |
| Licensing | Correct returned save; institutional application visibility; defined Submitted KPI; published post-licence process and renewal | Applicant saves returned answers but cannot edit submitted records; maker/checker approval; licence and certificate readback | Correction-save approval pending; prior visibility hold; KPI decision; authorized accounts |
| User/key-person changes | Approve/add-user provisioning; Primary User handover; key-person approval/register synchronization; safe provisioning retries | Letter upload, distinct review/decision, account/membership readback and register lineage | Authorized operational actors and evidence; inspect individual dead-letter jobs before retrying |
| Supervision/data | Prudential assessment/plan; examination/action role reachability; obligation start dates and regulator/sector completeness | Authorized officer enters source-backed data; independent approval; reconciled dates/taxonomy and institution dossier | Responsible officer/source authority; no blanket data rewrite |
| Reports | All catalogue entry journeys, KPI populations, scheduled scope, official branding and AI briefing; Report Library visibility and preview fail-closed completed | Ordinary-role generate/export/filter matrix; scoped totals match owning screens; export/readback; official letterhead | KPI scope definitions; official logo; scheduled security design; applicable role journeys |
| Release | Ordinary-role rehearsal, SMTP rotation/provider and mailbox receipt evidence, security gate and published smoke | Evidence for applicant, primary/secondary, operational officer, reviewer/approver; timestamped provider and inbox proof | Authorized accounts, provider/mailbox evidence and separate release authorization |
| AML/CFT | Frozen outstanding certification and AML-related monitoring items | Only separately authorized future package may establish this | Standing AML-CLOSE-08 freeze; no development/certification/publication/resize or AML-CLOSE-09 |

## Report catalogue journey — 25 November 2026 (authorized internal session)

All 46 built-in reports were opened through the normal Report Library screen.

- **44 opened and returned rows.** Application reports 57 rows; licence reports
  120; Returns reports mostly 97 (Overdue Returns 1, Prudential Threshold
  Breaches 409); Fee reports 34; operational reports 57 / 1000 / 7 / 8;
  complaints 22 (11 pending); examination programme 30; findings 13; enforcement
  8; prudential assessment 9; annual bulletin 15.
- **2 refused to open**, both for the same reason — the underlying table has no
  read grant for signed-in app users:
  - Approved Persons & Key Functionaries Register →
    `permission denied for table entity_appointments`
  - Ownership, Control & Beneficial Owners Register →
    `permission denied for table ownership_interests`
  Exact read-only SQL, security impact and rollback are in
  `.lovable/reviews/report-register-read-approval.md`. **Not applied** — awaiting
  owner approval. `parties` is included in the same request because both
  registers need it to turn a person id into a name.
- **3 reports returned no rows, and that is correct for current data**, not a
  defect:
  - Outstanding Dues and Payment Failure — `payments` holds 34 rows, every one
    `completed`; there is no unpaid, pending or failed payment to list.
  - Repeated Non-compliance — it lists only licensees with more than one overdue
    filing, and exactly one filing is currently overdue.

## Executive AI briefing — fixed and verified

- The briefing workspace opened, but generation failed with
  `{"ok":false,"error":"Cannot read properties of undefined (reading 'toLowerCase')","provider_state":"PROVIDER_FAILURE"}`,
  and the screen kept showing the 31 August narrative marked
  "Stale — snapshot has moved on".
- Cause: the executive evidence reference was pushed without a `label`, and the
  evidence filter called `t.label.toLowerCase()` on it.
- Fix in `supabase/functions/generate-supervisory-ai-analysis/index.ts`: the
  executive evidence reference now carries a label, and the filter ignores any
  reference without a usable label instead of crashing.
- Function deployed (source SHA-256 `8d51430cf8655db856f6763039af78286b5bd979b75e7c7b4cba8f579d02857b`).
- Verified through the normal screen afterwards: the generator returned
  `{"ok":true,...,"persisted":true}`, the narrative re-stamped to
  "Generated 25 Nov 2026, 06:09 am", evidence confidence High, and the stale
  warning is gone.
- No unit test was added: the generator imports Deno-only URLs and cannot be
  imported into the browser test runner, so the in-app generation is the
  evidence.

## Anonymous write grants — observation, not applied

393 public tables grant anonymous (`anon`) INSERT/UPDATE/DELETE/TRUNCATE. Every
table inspected has row-level security enabled, and the write policies found are
restrictive (`with_check false`, explicit "no delete / no update" policies, plus
one intentional public registration-upload insert on `file_uploads`), so this was
**not** shown to be reachable. It is broader than the application needs; a
separate revocation memo can be prepared on request.

## Monitoring inventory

Current Project monitoring returned 13 findings (not the historical 16-item inventory). They concern appeal notifications, access-letter storage, lifecycle configuration, AML methodology/examination schema, complaint duplicate/escalation/vulnerability/public respondent errors, workflow approvals, notification cron health, entity access/business profile and SMTP failures.

- Stored-bucket absence is contradicted by a current live read, but the full submission journey is not certified.
- Error findings contain older evidence dates; they are not treated as reproduced current defects without a fresh read/reproduction.
- None was claimed or resolved through monitoring in this tranche; no misleading closure status was recorded.
- AML-related items remain explicitly frozen.

The root roadmap carries every remaining programme task and its blocker. No claim is made that all five phases or the whole application are complete.
## Returns configuration writes — reproduced, and the registry claim is not reproducible

**Reproduced in the browser (authorized internal session, 2026-11-26):**
Returns → Manage Validations (`/admin/returns/validations`) → select a return
configuration → **Add Rule** → fill Name / Expression / Error Message → **Save**.
Result: two HTTP **403** responses on `/rest/v1/return_validation_rules`, the
dialog stays open, nothing is stored, and the user is shown the raw database
text `permission denied for table return_validation_rules`.

**Systematic cross-check (source scan × live permission catalog).** Every direct
browser write in `src` was collected (52 tables) and compared with the privileges
`authenticated` actually holds. Seven write paths are refused by the database:

| Table | App write | `authenticated` holds | Existing write policy |
| --- | --- | --- | --- |
| `return_validation_rules` | insert/update/delete | SELECT, MAINTAIN | ALL — super admin or `returns_management.manage_config` |
| `return_due_dates` | upsert | SELECT, MAINTAIN | ALL — super admin or `returns_management.manage_config` |
| `return_form_data` | upsert (+delete) | SELECT, MAINTAIN | insert/update `can_mutate_return_filed`; delete super admin or `returns_management.delete` |
| `return_comments` | insert/update/delete | SELECT, MAINTAIN | insert read-filed + (super admin/edit/workflow_action/can_mutate); update `can_mutate_return_filed`; delete super admin or `returns_management.delete` |
| `return_requests` | insert | SELECT, MAINTAIN | insert workflow_action or `can_mutate_return_filed`; update workflow_action or super admin; delete super admin |
| `license_appeal_events` | insert | SELECT | insert `can_read_license_appeal(caller, appeal_id)` |
| `audit_logs` | insert | SELECT | **no INSERT policy exists** |

Six of the seven carry write policies, so writes were *intended* but the missing
table-level grant stops them before row-level security is consulted. Exact SQL,
per-table security impact, rollback and acceptance checks are in
`.lovable/reviews/returns-write-grants-approval.md`; **not applied — awaiting
approval.**

`audit_logs` is different by design: it has only a SELECT policy
(`is_internal_staff`) plus append-only protection triggers
(`audit_logs_no_delete`, `audit_logs_no_update`, `trg_prevent_audit_mutation_*`),
so a browser insert can never succeed. The write in
`src/components/applications/ApplicationAiAssessmentPanel.tsx` (analyst decision,
`action = application.ai_assessment_*`) is fire-and-forget with the error
ignored, so that audit entry is silently never recorded. The decision itself *is*
durable on `application_ai_assessments` (`analyst_decision`,
`analyst_decision_by`, `analyst_decision_at`, `analyst_justification`), and no
reader of `application.ai_assessment_*` audit rows was found. The correct fix is
a server-side writer following the existing `log_rule_override` pattern; that is
a database change and is held for approval.

**Registry claim (monitoring #8) not reproducible.** All 23 configuration tables
the app writes through the governed writer (`configSave` / `configRetire` /
`configDelete` / `configChangeHistory`) are present in
`public.config_governed_tables` (registry size 34) — **zero missing entries**.
The returns configuration tables are registered: `return_configs`,
`return_configurations`, `return_config_forms`, `return_cutoff_config`,
`return_notification_templates`, `return_types`. Governed tables deliberately
hold no DML grant for `authenticated`; writes go through the governed RPCs.

## Methodology question edit (monitoring #4) — not reproducible through the editor

The server-side writer `supervisory_methodology_question_save` does reset fields
a payload omits: `response_options` becomes NULL, `sort_order` becomes 100 and
`requires_observation` becomes false. That is a real hazard for *any* caller that
sends a partial payload.

It is **not** reachable through the normal screen. `QuestionEditorDialog` loads
the existing question into the form (`initial()`) and always submits
`response_options`, `requires_observation` and `sort_order` from that loaded
state, so an edit round-trips all three. `expected_updated_at` is also sent on
edit, so a concurrent change is refused rather than silently overwritten.

One latent editor hazard was found and left as-is: permitted responses are joined
with `", "` on load and re-split on `,` by `asList()`, so an option that itself
contains a comma would be split into two options on the next save. A read-only
check of all 192 stored questions found **zero** options containing a comma, so
no data is currently corrupted.

## Project monitoring triage (2026-11-26)

Five findings were claimed and verified before any edit.

**Fixed in code:** `dispatch-notification-event` resolved `payload_user`
recipients with `out.add(String(v))`, so an array payload key
(`member_user_ids`, produced by `jsonb_agg` in the panel-referral function)
became one comma-joined pseudo user id, failed the uuid cast, and every panel
member's notification was dropped. The case now expands arrays one recipient per
element. Deployed (source SHA-256
`b7ad9e65a0b43fa495dad0c1642e4db37ec7dfdc1caba07c245f26e0accd02d7`).
Read-only history confirms the defect: **zero** rows in
`notification_dispatch_log` and **zero** in `notifications` for
`license_appeal.panel_member_assigned`. A live panel referral was **not**
exercised — the only appeal with a panel (APL-2026-000001) is already `decided`,
and re-referring it would rewrite a decided record — so member delivery after the
fix is not yet positively proven.

**Resolved as stale (evidence, not assumption):**
- `entity-access-requests` bucket exists (private, 20 MB) with membership-gated
  SELECT and INSERT policies.
- `process_templates.version` exists and `authenticated` may execute
  `license_fee_configuration_overview()`.
- No live function or frontend file references
  `supervisory_assessment_response` or `supervisory_methodology_fact_link`.
- `confirm_complaint_duplicate`, `dismiss_complaint_duplicate` and
  `dismiss_complaint_escalation` insert audit rows with the real `audit_logs`
  columns (`entity_type`, no `table_name`).

**Held:** the AML/CFT examinations-list finding (`examination_team_members.ended_at`
selected by `useAmlSupervision.ts`, column absent) is untouched under the
AML-CLOSE-08 freeze. The SMTP authentication finding stays with the SEC-CRED-01
credential evidence.
