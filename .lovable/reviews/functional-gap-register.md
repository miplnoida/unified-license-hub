# OLRAS Functional Gap Register — 2026-11-25 (assessment only)

Scope: read-only source review of 4 module groups plus read-only live DB checks. No code, data, grant, RLS, email or deployment changes.
Live checks: 765/765 public tables have RLS on. anon has INSERT on 365 tables and TRUNCATE on 391; authenticated has TRUNCATE on 441 (RLS does not stop TRUNCATE). 41 cron jobs active; 7,346 runs in the last 24 h all succeeded. Live `license_appeal_events` INSERT policy = `can_read_license_appeal` only (confirmed). Live DB contains `file_upload_enqueue_scan` and the 4 `entity_access_request_*` RPCs, which are missing from repo SQL (drift, not missing features).
No item is marked VERIFIED WORKING: none was executed end-to-end in this pass.
Effort: S ≤0.5d, M 1–3d, L 4d+. Every DB item needs exact SQL, impact and rollback approved before execution.

## P1 — Security and integrity
| ID | Module | Route / file:function | Current → expected | Fix | DB | Eff | Status |
|---|---|---|---|---|---|---|---|
| SEC-01 | Platform | all tables | anon INSERT 365, anon TRUNCATE 391, auth TRUNCATE 441 → revoke TRUNCATE from anon/auth everywhere; revoke anon DML except public-intake tables | Generated REVOKE script + allowlist | Yes | M | BROKEN |
| SEC-02 | Packages | AppShell, `create_application_draft` + RPCs | Package gate in browser only → server entitlement check | `package_feature_enabled()` used by RPCs/functions | Yes | L | PARTIALLY IMPLEMENTED |
| SEC-03 | Packages | `useSubscriptionPackage.ts:8-25` | Loading/error defaults to Package C (fails open) → block until known | Expose loading/error, deny on error | No | S | BROKEN |
| SEC-04 | Post-licence | `create_application_draft` (baseline 12096-12191) | Applicant/pre-licensee roles admitted server-side → identity predicate on create/save/submit | Reuse `canUsePostLicenceServices` rules in SQL | Yes | M | PARTIALLY IMPLEMENTED |
| SEC-05 | Institutional RBAC | `has_portal_capability` (_entity_id unused) | Global, not institution-scoped | Membership/PPOC scope check | Yes | L | ON HOLD |
| SEC-06 | Appeals | `license_appeal_events` INSERT policy | Any appeal reader can insert events, spoofing `actor_id` → governed command, actor = auth.uid() | Revoke INSERT; event RPC | Yes | M | BROKEN |
| SEC-07 | Reports | `run-scheduled-reports` + `report-generator.ts:616-659` | Service-role query ignores owner scope → run under owner-effective scope, revalidate | Owner-scoped executor | Yes | L | BROKEN |
| SEC-08 | Reports | same, cron `worker_kick` | Cron sends worker token; function demands user JWT → hourly runs likely refused | Separate worker gate | No | M | BROKEN (runs reported "succeeded" at pg_net level only) |
| SEC-09 | Documents | `document-extract` 77-115 | Service-role signs any file id; no scope or scan-clean check → scoped lookup + released-only | Authorize + scan gate | No | M | BROKEN |
| SEC-10 | Notifications | `send-notification` 23-88 | Any signed-in user can send arbitrary email and update any dispatch log | Permission + recipient/log ownership | No | M | BROKEN |
| SEC-11 | Correspondence | `send-correspondence` 36-55 | Source record loaded with admin client from caller id | Authorize source first | No | M | BROKEN |
| SEC-12 | Returns AI | `generate-return-analysis` 116-158 | View permission only; caller-supplied ratios persisted | Scope + server recompute | No | M | BROKEN |
| SEC-13 | Developer API | `developer-api` 43-81 | Key scopes selected but never enforced; DB errors = empty data | Enforce scopes; error handling | No | M | BROKEN |
| SEC-14 | AI governance | `document-extract`, `generate-return-analysis` | Bypass kill switch, model and instruction registry | Route via governed resolver | Yes | L | PARTIALLY IMPLEMENTED |
| SEC-15 | Prudential actions | `review_prudential_action_response` | No reviewer≠submitter, state or version binding | Bind + independence + lock | Yes | M | PARTIALLY IMPLEMENTED |
| SEC-16 | Applications | `application_draft_save` (migration 20260820183504) | Repo version lacks live submitted-lock → reconcile repo with live | Versioned migration matching live | Yes | S | PARTIALLY IMPLEMENTED |
| SEC-17 | Repo drift | enqueue fn, entity_access_request_* RPCs | Exist live, absent from repo SQL → capture into migrations | Dump & commit definitions | Yes (no behaviour change) | S | IMPLEMENTED BUT UNVERIFIED |
| SEC-18 | Queue | `process-queue:processEmailJob` 168-179 | Marks all queued notifications with a template as delivered without sending | Remove / delegate | No | S | BROKEN |
| SEC-19 | Reports | `report-generator.ts:persistRun` 785-837 | "ready" written before rows; batch error swallowed | Finalize after verified count | Yes | M | BROKEN |

## P2 — Blocked or incorrect operations
| ID | Module | Route / file | Issue | Fix | DB | Eff | Status |
|---|---|---|---|---|---|---|---|
| RET-01 | Returns | `/admin/returns/validations` + 5 tables | 403 on save (missing DML grants) | Held memo | Yes | S | ON HOLD |
| APP-01 | Applications | `/applications/:id/forms` | Returned-for-correction save blocked | Held memo | Yes | S | ON HOLD |
| REP-01 | Reports | Approved Persons, Ownership/UBO | SELECT denied on 3 tables | Held memo | Yes | S | ON HOLD |
| APP-02 | Applications | `ApplicationUploadPanel.tsx:208-223` | Import button permanently disabled; parser not wired; fake "parsed successfully" | Implement or remove, fix copy | No | M | NOT IMPLEMENTED |
| ENT-01 | Entity 360 | `useEntity360.ts:92-126` | Sections/timeline capped at 200, no paging | Paging + counts | No | M | PARTIALLY IMPLEMENTED |
| ENT-02 | Entity 360 | `Entity360TimelinePanel.tsx:23-69` | Read error shown as "No events" | Error/retry state | No | S | BROKEN |
| PL-01 | Post-licence | `useOpenPostLicenseRequests.ts:45-72` | Limit 200 applied before filter → missed duplicates | Server filter then limit | No | M | PARTIALLY IMPLEMENTED |
| PAY-01 | Payments | `PaymentDetail.tsx:47-83` | Errors shown as "not found"; loading never cleared on throw | Error states | No | S | BROKEN |
| USR-01 | Inst. users | `AccessRequestsPanel.tsx:28-123` | Load and role-lookup errors hidden as empty | Error/retry | No | S | BROKEN |
| USR-02 | Inst. users | `MyInstitution.tsx:46-78` | Membership error shown as "not linked" | Error state | No | S | BROKEN |
| USR-03 | Inst. users | panel + admin queue | Profile not refreshed after approval | Invalidate queries | No | S | PARTIALLY IMPLEMENTED |
| USR-04 | Inst. users | `/admin/user-access-requests` | Decision and Primary User handover not proven end-to-end | Browser journey test | No | M | IMPLEMENTED BUT UNVERIFIED |
| USR-05 | User admin | `toggle-user-status` 84-103 | Reset says "email sent" even if send failed | Report separate outcomes | No | S | BROKEN |
| USR-06 | Provisioning | `licensing-provisioning-worker` 125-142 | Completion error ignored, returns ok | Check + alert | No | M | BROKEN |
| PRU-01 | Prudential | `prudential-monitoring-sweep` 110-167 | Entities capped at 2000; filings/versions cut to 500 before sorting; one version per entity | Paged latest-version RPC | Yes | M | BROKEN |
| PRU-02 | Prudential | sweep 175-203 | Risk recompute errors swallowed; partial failure logged "success" | Real outcome status | No | S | BROKEN |
| PRU-03 | Prudential actions | `close_prudential_action` | Any historical acceptance completes; waiver/cancel single-person | Current-version gate; policy decision on maker-checker | Yes | M | PARTIALLY IMPLEMENTED |
| SUP-01 | Findings | `useSupervisoryFinding.ts:131-212` | Related-read failures shown as empty or missing provenance | Error states | No | M | BROKEN |
| CMP-01 | Complaints | `decide_duplicate_pair` | "Merge" only relabels the pair | Real merge or rename the action | Yes | M/L | PARTIALLY IMPLEMENTED |
| CMP-02 | Complaints | `SuspectedDuplicatesTable`, `DetectionRulesPanel` | 200 cap, errors as empty, non-atomic rule save | Paging, errors, batch RPC | Yes | M | PARTIALLY IMPLEMENTED |
| ENF-01 | Enforcement | `catalogue.ts:436-449` | No case-bound representation intake | New journey | Yes | L | NOT IMPLEMENTED |
| DOC-01 | Scanning | `process-queue` | No cron drain; no stale-job reclaim; no scanner timeout | Cron + lease + timeout | Yes | M | PARTIALLY IMPLEMENTED |
| DOC-02 | Scanning | scanner provider | URL/key not commissioned | Configure + fixtures | No | M | CONFIGURATION PENDING |
| COR-01 | Correspondence | `send-correspondence` 134-173 | Recorded "sent" with no external delivery; insert errors ignored | Outbox + real status | Yes | M | PARTIALLY IMPLEMENTED |
| REP-02 | Reports | `run-scheduled-reports` 96-188 | Email payload missing `type`; success events emitted on failure; no atomic claim or retry cap; "Run now" hides failures | Fix contract, claim, status | Yes | M | BROKEN |
| AUD-01 | Audit | `generate-return-analysis` 283-302 | Audit write optional, unchecked | Transactional audit | Yes | M | PARTIALLY IMPLEMENTED |

## P3/P4 — Reliability and cleanup
NTF-01 appeal `payload_user` array fix is in source; deployed run unverified (IMPLEMENTED BUT UNVERIFIED). PRU-04 stress-ack errors swallowed. INV-01 closure readiness null → zeros. SUP-02 provenance lookups silent. REP-03 Board Pack is current-status only, not as-of. DOC-03 ClamAV copy unverified. CLN-01 dead code: `Returns.tsx` mocks, `DuplicatePairDrawer` demo, `useLicenseAppeals.logEvent`, `process-queue:processReportJob` simulation.

## Implemented but unverified (no defect found in source)
Return version immutability trigger; Person 360; Ownership tree; key-person change sets; variations/fees/refunds/reconciliation; F&P invite fallback; integration retry worker; audit export; AI instruction versioning; Board Pack paging.

## AML/CFT backlog — FROZEN (no work)
`examination_team_members.ended_at` select is already removed in source (unverified). All AML-CLOSE-08/09 items stay frozen until the owner gives a separate instruction.

# Implementation plan
| Phase | Tasks | DB | Effort | Done when |
|---|---|---|---|---|
| 1 Assessment completion | Browser read-only role walkthroughs (applicant, primary, secondary, officer, supervisor, super admin); deployed function revision check; capture live-only SQL (SEC-17) | Capture only | 3d | Each register item evidenced or downgraded |
| 2 Security | SEC-01, 03, 06, 09–13, 18, then 02, 04, 07, 08, 14, 15, 16, 19 | Yes (SEC-01/02/04/06/07/14/15/16/19) | 12–15d | Negative tests per item: anon, cross-institution, wrong role |
| 3 Returns/blocked ops | RET-01, APP-01, REP-01 (when released from hold), APP-02, PL-01 | Held grants | 3d | Saves succeed for permitted role and refused for others |
| 4 Licensing/entity | ENT-01/02, PAY-01, USR-01…06, renewal journey | No | 5d | Error states visible; handover readback proven |
| 5 Supervision/complaints/enforcement/appeals | PRU-01…04, PRU-03 policy, SUP-01/02, CMP-01/02, INV-01, ENF-01 | Yes (PRU-01/03, CMP) | 10d | Sweep coverage tests; maker-checker negative tests |
| 6 Reporting/data integrity | REP-02/03, SEC-19, orphan/lifecycle queries | Yes | 5d | Run row counts reconcile; failures reported |
| 7 Notifications/background | DOC-01/02/03, COR-01, NTF-01, USR-06, AUD-01 | Yes | 5d | Clean/infected/error fixtures; provider-confirmed delivery |
| 8 Final verification | Full Vitest/SQL regression, role matrix, QA workbook rerun | No | 3d | All P1/P2 closed or explicitly held |

Decisions needed: maker-checker for waiver/cancel (PRU-03); whether prudential detection covers every obligation (PRU-01); whether duplicate "merge" should combine cases (CMP-01); scanner provider (DOC-02).
