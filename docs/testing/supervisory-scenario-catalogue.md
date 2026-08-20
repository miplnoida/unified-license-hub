# Supervisory Scenario Catalogue

Scenarios a supervisory reviewer can run against CERTIFICATION DATASET v1
(entities E01–E20), each with the data that backs it and an honest
readiness verdict.

**Readiness:** ✅ runnable end to end · ⚠️ runnable but stops short of a
supervisory outcome · ⛔ not runnable (no data)

## 1. Licensing (SCRIPT_1 / BR-LIC / LIC-*)

| # | Scenario | Data backing | Verdict |
| --- | --- | --- | --- |
| S-LIC-01 | Configure a new licence application form in Form Builder, publish a version, render it to an applicant | 55 form templates, version history | ✅ |
| S-LIC-02 | Applicant completes a multi-step application, saves a draft, uploads documents, pays the mandatory fee, submits | 27 cohort applications, fee configs | ✅ |
| S-LIC-03 | Officer runs sufficiency determination and issues an RFI; applicant resubmits with change tracking | sufficiency rule sets, `application_rfis` | ✅ |
| S-LIC-04 | Analyst records findings; legal reviewer adds approver-only legal notes; specialist referral raised | `application_legal_notes`, `application_legal_referrals` | ✅ |
| S-LIC-05 | Application routes through a configured multi-tier approval workflow with SLA and delegation | 11 workflows, `approval_steps`, `delegation_rules` | ✅ |
| S-LIC-06 | Approver opens the consolidated decision view and approves | application detail decision tab | ✅ |
| S-LIC-07 | Decision letter and licence certificate generated, previewed, amended, dispatched | `decision_artifacts` = 0 | ⛔ |
| S-LIC-08 | Licence register shows conditions, expiry, and full licensing history | 28 entity licences | ✅ |
| S-LIC-09 | Licence appeal lodged and heard | `license_appeals` = 0 | ⛔ |

## 2. Fit & Proper (SCRIPT_2 / BR-FP / FP-*)

| # | Scenario | Data backing | Verdict |
| --- | --- | --- | --- |
| S-FP-01 | Search the individual registry; confirm one identity holds roles across several entities | 75 parties, 160 appointments | ✅ |
| S-FP-02 | Issue a PQ invitation; individual completes and submits the questionnaire via token link | `declaration_invitations`, `/declaration/:token` | ✅ |
| S-FP-03 | Initiate an assessment from each of the four trigger types | 16 assessments (application-driven only) | ⚠️ |
| S-FP-04 | Run automated screening and adjudicate matches | no bound provider | ⛔ |
| S-FP-05 | Review AI analysis of PQ + screening, override a finding, record rationale | `ai_insights` = 0 | ⛔ |
| S-FP-06 | Record an adverse finding and grade it | `fp_findings` = 0 | ⛔ |
| S-FP-07 | Convene a committee, cast weighted anonymous votes with rationale | 1 committee, 0 cases | ⛔ |
| S-FP-08 | Issue a determination with conditions; monitor condition compliance; handle a breach | `fp_conditions` = 0 | ⛔ |
| S-FP-09 | Lodge and decide an F&P appeal | `fp_appeals` = 0 | ⛔ |
| S-FP-10 | Configure sector-specific F&P rules and see them applied | sector rules configured | ✅ |

## 3. Prudential (SCRIPT_3 / BR-PS / PRU-*)

| # | Scenario | Data backing | Verdict |
| --- | --- | --- | --- |
| S-PS-01 | Open the supervised entity register, filter by sector and risk, open an entity | 20 entities, 20 supervision assignments | ✅ |
| S-PS-02 | Walk Entity 360: identity, ownership, obligations, risk, conduct, oversight, records; re-enter "as of" a past date | Entity 360 views, 15 change sets | ✅ |
| S-PS-03 | Configure a return definition and an obligation rule; generate obligations and a reporting calendar | 6 definitions, 36 rules, 56 obligations, 233 periods | ✅ |
| S-PS-04 | Entity submits a quarterly return by web form and by template upload | 112 filings | ✅ |
| S-PS-05 | Supervisor works the intake queue, sees on-time vs late, opens a filing | filing queue, `ontime_status_enum` | ✅ |
| S-PS-06 | Review filing detail, validation results, compare two versions, view computed ratios | 128 versions, 240 metric values | ✅ |
| S-PS-07 | Breach a threshold and follow the breach to a supervisory action | `return_threshold_breaches` = 0 | ⛔ |
| S-PS-08 | Trigger an Early Warning Indicator and triage the alert | 5 EWI rules, 0 alerts | ⛔ |
| S-PS-09 | Peer-group comparison for an entity against its sector cohort | peer taxonomy 11 rows | ⚠️ |
| S-PS-10 | Complete a CAMELS assessment and record component ratings | 9 assessments | ✅ |
| S-PS-11 | Run an onsite examination: scoping, data requests, workpapers, findings, exit meeting, report | 9 examinations, 9 findings | ✅ |
| S-PS-12 | Issue and monitor a supervisory action / directive | actions not exercised | ⚠️ |
| S-PS-13 | Consolidated financial-group risk profile with group EWI | `financial_groups` = 0 | ⛔ |
| S-PS-14 | Payment-systems operator register and PFMI principle assessment | `pfmi_assessments` = 0 | ⛔ |

## 4. Market Conduct (SCRIPT_4 / BR-MC / MCS-*)

| # | Scenario | Data backing | Verdict |
| --- | --- | --- | --- |
| S-MC-01 | Consumer submits a complaint on the public portal with CAPTCHA; receives a reference | CAPTCHA config, 7 complaints | ✅ |
| S-MC-02 | Consumer tracks status publicly by reference | public tracking route | ✅ |
| S-MC-03 | Intake rules classify and triage the complaint; supervisor queue prioritises it | intake + triage rules | ✅ |
| S-MC-04 | Case workbench: investigation tasks, evidence, correspondence, change history | task/evidence tables, 36 threads | ✅ |
| S-MC-05 | Raise an entity RFI, approve it, entity responds | complaint RFI cycle | ✅ |
| S-MC-06 | Bulk-import a batch of complaints and resolve row errors | import batches/rows | ✅ |
| S-MC-07 | Detect and adjudicate duplicate complaints | duplicate pairs/clusters/scoring | ✅ |
| S-MC-08 | Close a case with resolution and rationale; quality review | QA gate removed — see divergence D1 | ⚠️ |
| S-MC-09 | Escalate a breached-SLA complaint through the escalation chain | `escalations` = 0 | ⛔ |
| S-MC-10 | Pattern alert raised from complaint volumes and triaged | `conduct_alerts` = 0 | ⛔ |
| S-MC-11 | Open a formal investigation, record an interview, close or discontinue it | `conduct_investigations` = 0 | ⛔ |
| S-MC-12 | Charter a thematic review, work it across entities, close with follow-up | `thematic_reviews` = 0 | ⛔ |
| S-MC-13 | Initiate an enforcement action, monitor compliance evidence, publish to the register | 6 enforcement actions | ⚠️ |
| S-MC-14 | Configure conduct monitoring rules and observe the supervision loop | 3 rules, 0 runs | ⚠️ |

## 5. Dashboards, Reporting, Auditability (SCRIPT_5 / BR-X / DASH-*, AUD-*, NOT-*)

| # | Scenario | Data backing | Verdict |
| --- | --- | --- | --- |
| S-XC-01 | Executive cross-module dashboard with drill-through to a source record | executive dashboard | ✅ |
| S-XC-02 | Twin Peaks coordination case shared between BOJ and FSC personas | coordination cases, pgTAP twin-peaks suite | ✅ |
| S-XC-03 | Operational supervisor dashboard by module and SLA | supervisory dashboard | ✅ |
| S-XC-04 | Team performance dashboard | no such surface | ⛔ |
| S-XC-05 | Regulated entity dashboard with deadline and penalty tracking | licensee dashboard | ✅ |
| S-XC-06 | Run a pre-built report and export CSV | report library | ✅ |
| S-XC-07 | Build an ad-hoc report from arbitrary dimensions | code-defined templates only | ⚠️ |
| S-XC-08 | Schedule a report and distribute it to recipients | scheduling partially wired | ⚠️ |
| S-XC-09 | AI Insights Hub: read an insight, inspect citations and source records, accept/reject | `ai_insights` = 0 | ⛔ |
| S-XC-10 | Cross-module audit search by actor, action, date, module | 430 compliance audit rows | ✅ |
| S-XC-11 | Case-centric audit timeline for one application and one complaint | case-audit route | ✅ |
| S-XC-12 | Data lineage: trace a reported metric back to the filing version and field | versions exist, no single viewer | ⚠️ |
| S-XC-13 | Security event log: failed auth, access denied, permission escalation | 112 security events | ✅ |
| S-XC-14 | Override registry with mandatory justification | override registry present | ⚠️ |
| S-XC-15 | Export audit registry showing who exported what | `audit_export_jobs` = 0 | ⛔ |
| S-XC-16 | Notification centre, thread manager, escalation manager | notifications + 36 threads; escalations 0 | ⚠️ |

## 6. Authorization and persona scenarios

| # | Scenario | Verdict |
| --- | --- | --- |
| S-SEC-01 | Super admin sees all modules; permissions resolve through `sec_get_user_context()` | ✅ |
| S-SEC-02 | Assignment-only regulator sees only mapped entities' submitted returns; every action disabled; exports blocked | ✅ |
| S-SEC-03 | Licensee primary vs secondary user edit/submit split | ✅ |
| S-SEC-04 | Pre-licensee restricted to whitelisted routes | ✅ |
| S-SEC-05 | Staff member holding both internal and external roles resolves to internal without collision | ✅ |
| S-SEC-06 | Direct URL access to a privileged screen is denied server-side | ⚠️ — 27 routes are authenticated-only; denial relies on RLS with no logged decision (GAP-XC-02) |
| S-SEC-07 | Field-level visibility restrictions per role (FRD ADM-RM-001) | ⚠️ — module/action enforced; field-level not demonstrable |

## Readiness roll-up

| Verdict | Count | Share |
| --- | --- | --- |
| ✅ runnable end to end | 33 | 51% |
| ⚠️ partial | 14 | 22% |
| ⛔ not runnable | 18 | 27% |
| **Total** | **65** | |

## Recommended demo path (all ✅)

S-LIC-01 → 02 → 03 → 04 → 05 → 06 → 08, then S-PS-01 → 02 → 03 → 04 →
05 → 06 → 10 → 11, then S-MC-01 → 02 → 03 → 04 → 05 → 07, then S-XC-01 →
02 → 05 → 10 → 11 → 13, closing with S-SEC-01 → 02 → 03.
This path demonstrates 30 scenarios with real certification data and
avoids every empty-state surface.
