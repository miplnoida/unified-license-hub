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
| Returned-for-correction save ready | Live save-status list omits `returned_for_correction`; staged accepted SQL adds it and retains the guard | Confirmed pending defect; exact SQL approval requested separately |
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

## Monitoring inventory

Current Project monitoring returned 13 findings (not the historical 16-item inventory). They concern appeal notifications, access-letter storage, lifecycle configuration, AML methodology/examination schema, complaint duplicate/escalation/vulnerability/public respondent errors, workflow approvals, notification cron health, entity access/business profile and SMTP failures.

- Stored-bucket absence is contradicted by a current live read, but the full submission journey is not certified.
- Error findings contain older evidence dates; they are not treated as reproduced current defects without a fresh read/reproduction.
- None was claimed or resolved through monitoring in this tranche; no misleading closure status was recorded.
- AML-related items remain explicitly frozen.

The root roadmap carries every remaining programme task and its blocker. No claim is made that all five phases or the whole application are complete.