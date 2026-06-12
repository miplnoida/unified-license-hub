# Admin-First To-Do Plan — Unified License Hub

_Last updated: 2026-06-12_

## Purpose

This plan converts the feature tracker into an implementation sequence that starts from the **Admin Panel**, because the BRD/SRS requires the platform to be configuration-driven. The goal is to complete admin-configurable foundations first, then build licensing, supervision, Fit & Proper, conduct, dashboards, reporting, audit, and demo data on top of those foundations.

Status values:

- **Pending** — not started or no reliable implementation evidence.
- **In Progress** — partially implemented or needs extension.
- **Done** — implementation exists and only needs routine QA.
- **Needs Verification** — code exists but runtime behavior must be confirmed.

Priority values:

- **P0** — blocker/foundation; required before dependent modules can be completed.
- **P1** — core demo/business requirement.
- **P2** — important enhancement or regulatory completeness item.
- **P3** — future-ready / optional / lower priority.

---

## 1. Admin Panel Foundation — Start Here

The Admin Panel must become the single control center for configuring the platform without code changes.

### 1.1 Admin Hub Navigation and Module Registry

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Create/verify Admin Hub module registry | Done | P0 | Ensure Admin Hub lists all configuration modules: regulators, sectors, services, forms, workflows, roles, users, notifications, fees, returns, complaints, audit, reports, rules, SLA, integrations. | Existing Admin Hub | Admin user can access every admin module from one hub. |
| Add missing Admin Hub cards for Rule Engine, SLA Manager, Security Events, Integration Logs, Data Loader | Pending | P0 | Add navigation entries for foundational modules not yet clearly surfaced. | Admin routing | Cards visible with correct route guards. |
| Add module health/status indicators | Pending | P2 | Show configured/missing counts per admin area: forms, workflows, roles, rules, templates, thresholds, datasets. | Admin metrics hooks | Admin can see setup completeness at a glance. |
| Add admin setup checklist page | Pending | P1 | Checklist showing required configuration before demo/go-live. | All admin modules | Checklist can mark items configured, missing, or failed validation. |

### 1.2 Regulator, Sector, Service, and License-Type Configuration

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Seed all regulators | In Progress | P0 | Configure ABC Prudential and FSC Conduct as regulator/workspace entities. | Regulator management | Both regulators exist and can scope data/views. |
| Seed all sectors | In Progress | P0 | Add Commercial Bank, Building Society, Merchant Bank, General Insurance, Life Insurance, Securities Dealer, MCI, FHC, MSB, PSP, Pension sectors. | Master data | All BRD sectors selectable in forms and workflows. |
| Define license-type taxonomy | Pending | P0 | Decide if license types remain service/category-based or require a first-class `license_types` model. | Regulator/sector setup | License type config supports all LF-001 to LF-011 forms. |
| Configure license-type ownership by regulator | Pending | P0 | Map each license type to ABC/FSC ownership and coordination rules. | License taxonomy | System knows primary regulator and secondary coordination regulator. |
| Configure product/channel taxonomy | Pending | P1 | Required for conduct complaints and market surveillance. | Master data | Product and channel lists available for complaint classification. |
| Configure role-to-regulator scope | Pending | P0 | Ensure roles are scoped by regulator/workspace where required. | RBAC | ABC user cannot see FSC-only data unless permitted. |

### 1.3 Role Management and RBAC

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Seed BRD role catalogue | In Progress | P0 | Add System Admin, Applicant, Licensing Officer, Analyst, Legal/Compliance, Approver, F&P Assessor, Committee Member, Prudential Supervisor, Payment Systems Supervisor, Market Conduct Supervisor, Investigator, Executive Supervisor, Consumer. | Role management | All BRD roles exist. |
| Build role-permission matrix screen | In Progress | P0 | Show module/action permissions per role. | Permissions tables | Admin can view and edit permissions without code. |
| Add object-level permission rules | In Progress | P0 | Enforce access by regulator, entity, case, investigation, legal notes, individual profile. | RLS, permission model | Denied access is blocked and logged. |
| Add role simulation / preview mode | Pending | P1 | Admin can preview app as a role/persona. | RBAC | Admin validates dashboards/forms by role. |
| Add access-denial audit/security logging | Pending | P0 | Capture denied route/table/object attempts. | Audit + security event log | Denial logs include user, role, object, reason. |
| Create demo user accounts | Pending | P1 | Seed demo users for all roles. | Auth/RBAC | Demo role users can log in and access only permitted areas. |

### 1.4 Form Builder Configuration

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Verify core Form Builder features | Needs Verification | P0 | Confirm fields, sections, conditions, multi-step forms, validations, file fields, calculated fields, preview, versioning. | Existing Form Builder | A form can be created, previewed, published, versioned, and rendered. |
| Add missing field types | Pending | P1 | Ensure support for rich text, lookup, cross-reference, digital signature, geolocation, calculated formulas. | Form Builder | All BRD field types supported. |
| Add form import/export | Pending | P1 | Import/export form templates as JSON/CSV for setup migration. | Form templates | Admin can move form configs between environments. |
| Seed licensing forms LF-001 to LF-011 | Pending | P0 | Create all new license application templates. | License taxonomy | Each license type renders its own form and document checklist. |
| Seed renewal forms RF-001 to RF-011 | Pending | P1 | Configure streamlined renewal forms with prefilled data. | License taxonomy | Renewal starts from existing license/entity data. |
| Seed variation/amendment forms VF-001 to VF-008 | Pending | P1 | Configure ownership, director, address, business activity, auditor, branch changes. | License lifecycle | Variation type controls workflow depth. |
| Seed suspension/revocation/surrender forms SR-001 to SR-004 | Pending | P1 | Configure internal enforcement lifecycle forms. | License lifecycle | Officer can initiate suspension/revocation/surrender with mandatory grounds. |
| Seed PQ master form | Pending | P0 | Create configurable Personal Questionnaire form. | F&P module | PQ captures identity, qualifications, employment, disclosures, criminal/regulatory history, conflicts, AML/CFT, consent. |
| Seed F&P forms FP-F001 to FP-F005 | Pending | P1 | Annual declaration, material change, adverse response, condition evidence, appeal. | F&P module | Forms are linked to F&P workflows. |
| Seed prudential return forms PR-001 to PR-016 | In Progress | P0 | Configure return templates for DTIs, insurers, SDs, MCIs, MSBs, PSPs, FHCs, pensions. | Returns module | Entity sees correct return form by sector and schedule. |
| Seed supervisory assessment/exam forms SA-001 to SA-009 | Pending | P1 | CAMELS, examination scoping, findings, report, management response, CAP, PFMI, action order, stress test. | Prudential module | Supervisors can record assessments with evidence links. |
| Seed market conduct forms MC-F001 to MC-F010 | Pending | P1 | Complaint, classification, thematic review, investigation, evidence, enforcement, remediation, surveillance. | Conduct module | Conduct lifecycle can run from intake to closure. |
| Add form version rollback | In Progress | P1 | Allow published form versions to roll back safely. | Form versioning | Admin can restore prior version; historical submissions remain pinned. |

### 1.5 Workflow Designer Configuration

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Verify workflow builder v2 | Needs Verification | P0 | Confirm steps, actions, approvers, version publish, snapshot pinning, notifications. | Existing workflow builder | Published workflow can run and preserve version on in-flight cases. |
| Add visual workflow timeline/canvas | Pending | P2 | Improve admin usability for complex workflows. | Workflow builder | Admin can understand workflow paths visually. |
| Add parallel and conditional workflow stages | Pending | P0 | Required for legal/compliance parallel reviews and Twin Peaks coordination. | Workflow engine | Workflow can branch/merge based on case data. |
| Add workflow migration tool | Pending | P2 | Allow admin to migrate in-progress cases to a new workflow version. | Versioning | Migration is explicit and audited. |
| Seed licensing workflows WF-L01 to WF-L07 | In Progress | P0 | New application, renewal, variation, suspension, revocation, surrender, appeals. | Forms + roles | Workflows are available by license type. |
| Seed F&P workflows WF-F01 to WF-F05 | Pending | P0 | New F&P, periodic reassessment, material change, appeals, condition monitoring. | F&P forms | F&P lifecycle can run end-to-end. |
| Seed prudential workflows WF-P01 to WF-P05 | Pending | P1 | Return cycle, offsite monitoring, onsite exam, supervisory action, EWI alert to action. | Returns/forms/rules | Supervisor can move from return/alert to action. |
| Seed market conduct workflows WF-M01 to WF-M05 | Pending | P1 | Complaint handling, thematic review, investigation, enforcement, recurrence monitoring. | Conduct forms | Complaint can escalate to investigation/action/monitoring. |
| Add workflow SLA hooks | Pending | P0 | Each step must start, pause, resume, breach, and escalate. | SLA engine | SLA events recorded and visible. |
| Add workflow audit hooks | In Progress | P0 | Every transition/action must log audit records. | Audit log | Audit trail shows workflow history. |

### 1.6 Rule Engine and Threshold Manager

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Build generic rule engine model | Pending | P0 | Support validation, threshold, trend, routing, SLA, condition, recurrence, macro, group contagion rules. | Admin + DB | Admin can define and activate rules without code. |
| Add rule builder UI | Pending | P0 | UI for conditions, formulas, severity, actions, recipients, active dates. | Rule model | Admin can create/test/publish a rule. |
| Add sandbox rule testing | Pending | P1 | Test rule against sample or production-copy data before activation. | Rule engine | Rule test shows pass/fail and affected records. |
| Add rule versioning and rollback | Pending | P1 | Required for legal defensibility and safe configuration. | Rule engine | Rule history shows author, old/new values, activation time. |
| Configure prudential thresholds | Pending | P0 | Load DTI, GI, LI, SD thresholds from SRS/BRD. | Returns/ratio engine | Breaches can be detected against configured thresholds. |
| Configure early warning indicators | Pending | P1 | Load EWI-001 to EWI-012. | Ratios/trends | EWI alerts fire before breaches. |
| Configure complaint pattern rules | Pending | P1 | Example: >20 complaints of type X in 30 days. | Complaints data | Pattern alert references underlying complaints. |
| Configure F&P screening severity rules | Pending | P1 | Route high-severity findings to senior officer/committee. | F&P screening | Severity determines routing and escalation. |

### 1.7 SLA Manager

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Build central SLA configuration screen | Pending | P0 | Configure SLA by module, workflow, stage, severity, license type, complaint type. | Workflow builder | Admin can configure SLA values without code. |
| Implement SLA timers | Pending | P0 | Start timers on submission/stage entry. | Workflow engine | Case queues show SLA age/countdown. |
| Implement SLA pause/resume | Pending | P0 | Pause on RFI/entity response wait, resume when response submitted. | RFI/workflow | Pause/resume events are audited. |
| Implement SLA warning and breach jobs | Pending | P0 | Trigger alerts at configured threshold and breach. | Notifications | SLA warnings/breaches create notifications and logs. |
| Add SLA breach acknowledgement | Pending | P1 | Prevent closure until breach acknowledged. | Workflow + UI | Case cannot close without acknowledgement. |
| Add SLA reports/widgets | Pending | P1 | Show on-time, near-breach, breached by officer/team/process. | Reporting/dashboard | SLA performance available to supervisors/executives. |

### 1.8 Notification Template and Communication Admin

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Verify notification template CRUD | Needs Verification | P0 | Create templates for submission, RFI, SLA, decision, conditions, appeals, returns, complaints. | Existing notification module | Templates can be created and linked to events. |
| Add notification preview/test send | Pending | P1 | Preview content before dispatch and send test message. | Notification templates | Admin/officer can preview and confirm. |
| Configure event-to-template mapping | In Progress | P0 | Map system events to templates. | Workflow/rule events | Event dispatches correct template. |
| Build bidirectional communication log | Pending | P0 | Store RFI, responses, regulator messages, entity messages, delivery/ack status. | Notifications + cases | Case shows complete communication thread. |
| Add escalation recipient configuration | Pending | P1 | Route alerts by severity, regulator, sector, team. | Rules/SLA | Alert recipients are configurable. |

### 1.9 Audit, Security Event, and Integration Log Admin

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Verify audit log coverage | In Progress | P0 | Confirm audit records for create/edit/view/approve/reject/override/export/deny. | Existing audit module | Coverage report exists for critical actions. |
| Add field-level data lineage | Pending | P0 | Store before/after values for critical tables/fields. | DB triggers/audit | Field history visible on applications, returns, PQs, complaints. |
| Add case-centric audit timeline | Pending | P1 | Timeline from first receipt through decision/actions/monitoring. | Audit + entity/case links | User can filter audit by case/entity/individual. |
| Add override-justification capture | Pending | P0 | Mandatory reason for AI/system override. | AI/rule engine/workflows | Original output + override + justification preserved. |
| Add export audit logging | Needs Verification | P0 | Ensure CSV/PDF export logs user, filters, record count. | Reporting | Every export has auditable metadata. |
| Build dedicated security event log | Pending | P0 | Separate log for auth failures, denials, escalation attempts, session anomalies. | Auth/RBAC | Security events visible in admin screen. |
| Build integration event log | Pending | P1 | Log inbound/outbound API/file/notification/signature/screening events. | Integrations | Events include endpoint, direction, status, payload summary. |

### 1.10 Data Loader / Demo Setup Admin

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Build admin data-loader framework | Pending | P1 | Upload CSV/XLSX/JSON datasets through admin. | Parsing/storage | Admin can import and validate demo/master data. |
| Add entity universe loader | Pending | P1 | Load all supervised entities and sectors. | Entity register | Entity codes map correctly. |
| Add quarterly returns loader | Pending | P1 | Load 2021 Q1–2025 Q4 synthetic financial data. | Returns module | Data appears in entity/returns analytics. |
| Add macro data loader | Pending | P2 | Load inflation, interest, FX, GDP data. | Prudential analytics | Macro data overlays on charts. |
| Add PQ/adverse media loader | Pending | P1 | Load individuals, PQs, adverse media. | F&P module | F&P profiles show loaded evidence. |
| Add complaints loader | Pending | P1 | Load New FinCorp complaint dataset. | Conduct module | Complaint analytics use imported data. |
| Add examination report loader | Pending | P2 | Upload/link PDF exam reports to entities. | Documents/entity profile | Reports searchable and linked. |
| Add demo-readiness validator | Pending | P1 | Check all required demo data/config is loaded. | All modules | Validator reports ready/not ready with missing items. |

---

## 2. Licensing & Registration To-Do List

Build this after Admin Panel foundations for forms, workflows, roles, notifications, SLA, and audit are stable.

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Applicant registration and login | Done | P0 | Public registration and pre-licensee access. | Auth | Applicant can register and log in. |
| Applicant dashboard | Done | P0 | Shows drafts, submitted applications, status. | Applications | Applicant can resume draft and view status. |
| Start application by license type | Done | P0 | Dynamic application start. | License taxonomy + forms | License selection renders correct form. |
| Save draft application | Done | P0 | Save progress before submission. | Application forms | Draft is retrievable. |
| Submit application | Done | P0 | Final submit creates reference number. | Forms + validation | Submitted application enters intake queue. |
| Inline validation | Needs Verification | P0 | Field-level validation during entry/submission. | Form Builder | Errors appear at field and preserve data. |
| Document upload metadata/versioning | In Progress | P0 | Store file name, type, size, uploader, date, versions. | Documents | Officer sees document history. |
| Batch document upload | Pending | P1 | Upload multiple docs with per-file validation. | Documents | Batch status shows per-file result. |
| Acknowledgement artifact | In Progress | P0 | Generate acknowledgement page/PDF/email. | Notifications + PDF | Applicant receives reference artifact. |
| Licensing officer queue | Done | P0 | Queue with filters and assignment. | Workflow/RBAC | Officer sees only permitted cases. |
| Queue sorting/filtering/saved views | In Progress | P1 | Add saved queue views. | Queue UI | Officer can save custom filters. |
| Sufficiency checklist | Pending | P0 | Automated/manual sufficiency based on configured documents/rules. | Rule engine + forms | Officer can confirm/override sufficiency. |
| RFI workflow | In Progress | P0 | Issue RFI, applicant responds, thread logged. | Communication log + SLA | RFI pauses SLA and resumes on response. |
| Case assignment/routing | Done | P0 | Auto/manual assignment by workflow/delegation. | Workflow | Assignment history recorded. |
| Analyst assessment workspace | In Progress | P1 | Review submitted data/documents, record findings. | Workflow | Analyst findings saved and audited. |
| AI-assisted application analysis | Pending | P2 | Identify red flags and inconsistencies. | AI + document ingestion | AI outputs show sources/confidence. |
| Legal/compliance review | Needs Verification | P1 | Restricted legal review stage and notes. | RBAC + workflow | Only legal/approver roles see legal notes. |
| Supervisor escalation | Pending | P1 | Escalate case for guidance. | Workflow/notifications | Escalation and response logged. |
| Decision-ready cockpit | Pending | P0 | Consolidated view for approver. | Application data + audit | Approver sees all data in one screen. |
| Configurable decision options | In Progress | P0 | Approve/conditional/reject per license type. | Workflow config | Decision rationale mandatory. |
| Decision letter generation | Pending | P0 | Generate draft letter from template. | Template/PDF | Letter can be reviewed before dispatch. |
| Decision letter review workflow | Pending | P1 | Amend/review/approve letter. | Workflow | Dispatch only after approval. |
| Digital license certificate | Pending | P0 | Generate digitally signed certificate. | Signature integration | Certificate includes required fields. |
| License issue and register update | Done | P0 | Create license record on approval. | Licenses | Entity license visible in registry. |
| Renewal lifecycle | In Progress | P1 | Near-expiry alerts and renewal form/workflow. | SLA/notifications/forms | Renewal reuses existing data. |
| Suspension lifecycle | In Progress | P1 | Show-cause, response, decision, monitoring. | Forms/workflow | Suspension actions audited. |
| Revocation lifecycle | In Progress | P1 | Justification, notices, decision, register update. | Forms/workflow | Revocation updates entity/license status. |
| Variation/amendment lifecycle | In Progress | P1 | Ownership, director, address, business activity changes. | Post-license forms | Variation triggers correct workflow/F&P. |
| Bulk intake | Pending | P2 | Upload 5–10+ applications. | Data loader/forms | Group and individual statuses visible. |
| Licensing-to-supervision handoff | Pending | P0 | Create initial risk profile/supervisory plan. | Prudential module | Approved license seeds supervision record. |
| Twin Peaks licensing coordination | Pending | P1 | ABC/FSC positions, conflicts, shared discussion. | Regulator scope/workflow | Conflicts flagged and logged. |

---

## 3. Fit & Proper To-Do List

Fit & Proper is a major missing module and should be built after Admin Panel configuration foundations are complete.

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Create individual registry | Pending | P0 | First-class `individuals` record independent of web users. | DB/RBAC | Individual has persistent unique ID. |
| Link individuals to entities and roles | In Progress | P0 | Director, CEO, shareholder, officer roles across entities. | Entity registry | One individual can hold multiple roles. |
| Calculate governance influence score | Pending | P1 | Aggregate influence across entities/roles. | Individual-role links | Score visible on subject profile. |
| Build subject profile | Pending | P0 | Roles, entities, assessment history, screening, conditions. | Individual registry | Single authoritative profile. |
| Build PQ submission flow | Pending | P0 | Individual completes PQ through portal. | PQ form | PQ is versioned and linked to assessment. |
| Add PQ validation rules | Pending | P0 | Completeness and conditional validation. | Form Builder | Missing/invalid fields block submission. |
| Support F&P initiation from license | Pending | P0 | Named individuals trigger assessment. | Licensing handoff | Assessments auto-created from application. |
| Support ad-hoc initiation | Pending | P1 | Officer starts assessment manually. | F&P workflow | New assessment record created. |
| Support cycle-based reassessment | Pending | P1 | Annual/biannual reassessment. | Scheduler | Reassessment tasks generated. |
| Support event-based reassessment | Pending | P1 | Trigger on adverse media, ownership change, enforcement. | Rule engine | Event creates reassessment. |
| Configure screening types | Pending | P0 | Criminal, sanctions, court, regulatory, adverse media, PEP. | Admin rule/screening config | Screening checklist generated per case. |
| Integrate automated screening | Pending | P1 | API/batch screening with confidence scores. | Integrations | Matches appear with score and source. |
| Build false-positive workflow | Pending | P1 | Officer confirms/dismisses matches. | Screening | Dismissal requires rationale. |
| Manual screening task assignment | Pending | P1 | Assign screening tasks with due dates. | Workflow/tasks | Task status and results tracked. |
| Third-party evidence attachments | Pending | P1 | Attach reports/articles/court docs to findings. | Documents | Evidence metadata stored. |
| Adverse finding classification | Pending | P0 | Low/medium/high severity or risk score. | Rule engine | Severity drives routing. |
| Severity-based escalation | Pending | P0 | Auto-route high severity findings. | Workflow/notifications | Escalation logged. |
| Historical comparison view | Pending | P1 | Compare current vs prior assessment. | Assessment history | Delta view visible. |
| Individual/population dashboards | Pending | P2 | Risk trends and outcome distributions. | Reporting | Trends visible by individual/population. |
| AI PQ/adverse media synthesis | Pending | P2 | Summarize structured/unstructured data. | AI + ingestion | AI cites sources and confidence. |
| Human override of AI output | Pending | P0 | Modify/reject AI findings with justification. | Audit | Original AI output preserved. |
| Sector-specific decision rules | Pending | P1 | Criteria differ by sector/role. | Rule engine | Decision references applicable rules. |
| Multi-regulator determinations | Pending | P1 | ABC/FSC independent determinations. | Regulator scope | Determinations separated but share profile. |
| Committee weighted voting | Pending | P1 | Weighted votes with rationale. | Workflow/RBAC | Outcome calculated and audited. |
| Conditional determination | Pending | P1 | Conditions, deadlines, reminders, evidence. | SLA/notifications | Conditions monitored automatically. |
| F&P appeals | Pending | P1 | Standalone and license-linked appeal. | Appeals workflow | Appeal updates linked license outcome. |
| Ongoing monitoring | Pending | P1 | Continuous adverse media/events/condition checks. | Scheduler/rules | Monitoring logs available. |

---

## 4. Prudential Supervision / Returns To-Do List

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Entity register | Done | P0 | Licensee/entity records. | Licensing | Entity profile visible. |
| Add prudential metadata to entity | Pending | P0 | Sector, prudential category, systemic importance, supervisor team, risk status. | Entity register | Metadata available on entity profile. |
| Return type/configuration admin | Done | P0 | Return forms, due dates, configs. | Admin returns | Return types configurable. |
| Entity return submission portal | Done | P0 | Entity submits returns. | Forms/returns | Return saved and visible. |
| Return validation | In Progress | P0 | Basic form validation. | Rule engine | Cross-field/range validation added. |
| Supervisor return intake queue | Done | P0 | Supervisor reviews submissions. | Returns workflow | Queue shows status and entity. |
| Return version history | Done | P0 | Versions retained. | Returns | Supervisor can inspect prior versions. |
| Ratio formula engine | Pending | P0 | Calculate prudential ratios by sector. | Rule/formula engine | Formula visible and calculated automatically. |
| Ratio transparency | Pending | P0 | Show formula and source fields. | Ratio engine | Supervisor/entity can inspect calculation. |
| Threshold breach detection | Pending | P0 | Flag breaches immediately. | Threshold config | Alerts and breach history created. |
| Breach severity and routing | Pending | P0 | Assign severity and route to supervisor. | Rule/notification | Supervisor receives alert. |
| Peer comparison analytics | Pending | P1 | Compare entity against peer group. | Peer config/data | Outliers highlighted. |
| Multi-period trend charts | Pending | P1 | 2021–2025 ratio trends. | Historical data | Trend classification visible. |
| Group-level risk aggregation | Pending | P1 | Consolidate New FinCorp group data. | Entity relationships | Group dashboard shows subsidiaries/rollup. |
| Macro-financial overlay | Pending | P2 | Display macro indicators beside entity data. | Macro data | Overlay visible on analytics. |
| Supervisory assessment forms | Pending | P1 | Record risk ratings and rationale. | SA forms | Assessment linked to evidence. |
| CAMELS assessment | Pending | P1 | Component ratings and composite score. | Assessment forms | CAMELS history visible. |
| Risk score aggregation | Pending | P1 | Weight categories into overall rating. | Rule engine | Weights configurable. |
| Supervisory actions workflow | Pending | P1 | Remediation, direction, restriction, enforcement referral. | Workflow/forms | Action created and monitored. |
| Remediation tracking | Pending | P1 | Deadlines, evidence, approve/reject. | Documents/SLA | Status pending/in-progress/completed/overdue. |
| Early Warning Indicators | Pending | P1 | Trend/rate/peer/group/macro rules. | Rule engine/data | EWI alerts fire and are logged. |
| Event-based monitoring | Pending | P1 | Return submission triggers calculations/checks. | Rules/events | Execution log visible. |
| Examination report ingestion | Pending | P2 | Upload/search/link PDFs. | Documents | Reports linked to entity profile. |
| Payment systems oversight | Pending | P2 | MSB/PSP/PFMI forms and workflows. | Forms/workflows | Payment entities supervised in same platform. |
| Stress testing/scenario analysis | Pending | P3 | Define macro scenarios and assess impact. | Analytics/macro | Stress results reportable. |

---

## 5. Market Conduct / Complaints / Investigations To-Do List

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Complaint intake | Done | P0 | Complaint entry exists. | Complaints module | Complaint record saved. |
| Public consumer complaint portal | In Progress | P0 | Public-facing complaint submission. | Forms/auth optional | Consumer can submit without internal access. |
| Officer manual complaint entry | Done | P0 | Regulator can enter complaint. | Complaints | Manual record created. |
| Email/call centre/chatbot channels | Pending | P2 | Omni-channel intake. | Integrations | All channels create same complaint record. |
| Complaint reference number | Needs Verification | P0 | Unique complaint number. | DB/function | Format and uniqueness verified. |
| Complaint acknowledgement | Needs Verification | P0 | Notify complainant. | Notification templates | Acknowledgement visible/logged. |
| Complaint type configuration | Done | P0 | Admin complaint types. | Complaint Types admin | Types editable. |
| Conduct risk taxonomy | In Progress | P1 | Categories, product, channel, severity. | Admin/master data | Classification fields configurable. |
| Complaint classification workflow | In Progress | P0 | Officer classifies category/product/channel/severity. | Forms/workflow | Classification saved. |
| Automated priority scoring | Pending | P1 | Vulnerability, value, systemic pattern, severity. | Rule engine | Priority score calculated. |
| Complaint routing | Needs Verification | P1 | Route by score/officer availability. | Workflow/delegation | Assigned officer gets notification. |
| Complaint SLA tracking | Pending | P0 | Timers by category/severity. | SLA engine | Near-breach/breach alerts. |
| Complaints analytics dashboard | Pending | P1 | Volume trends, product/channel/entity spikes. | Reporting/data | Dashboard shows patterns. |
| Pattern-based alerts | Pending | P1 | Threshold alerts for recurring/systemic issues. | Rule engine | Alert references underlying data. |
| Thematic review initiation | Pending | P1 | Start from alert or manually. | Workflow/forms | Review record with scope/team/objectives. |
| Thematic review assignment log | Pending | P1 | Team, status, audit log. | Workflow | Assignments tracked. |
| Escalation to formal investigation | Pending | P1 | One-action escalation. | Investigation module | Investigation record created. |
| Restricted investigation workspace | Pending | P1 | Investigator-only access. | RBAC/security logs | Unauthorized access denied/logged. |
| Evidence repository | Pending | P1 | Secure evidence uploads and chain of custody. | Documents/storage/RBAC | Evidence immutably linked. |
| Investigation workflow | Pending | P1 | Initiation, evidence, interviews, draft findings, response, final report. | Forms/workflows | Full investigation lifecycle. |
| Enforcement outcome recording | In Progress | P1 | Warning, remediation, restriction, sanction, penalty. | Enforcement actions | Outcome includes rationale/evidence/deadline. |
| Outcome notifications | In Progress | P1 | Notify entity of outcome/deadline. | Notification templates | Dispatch logged. |
| Recurrence monitoring | Pending | P1 | Monitor repeat issues after closure. | Rule engine | Recurrence alert fires. |
| Closed-loop conduct dashboard | Pending | P2 | Trend → case → action → outcome drilldown. | Dashboard/reporting | End-to-end traceable. |
| Market surveillance | Pending | P3 | Product pricing, disclosure, advertising. | Conduct data | Surveillance assessments recorded. |
| Financial literacy tracking | Pending | P3 | Programme and outcome tracking. | New forms/reports | Programme metrics visible. |

---

## 6. Dashboards, Reporting, and Executive Visibility To-Do List

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Applicant dashboard | Done | P0 | Own applications/drafts/status. | Licensing | Applicant sees own records only. |
| Licensee dashboard | Done | P0 | Own licenses/returns/submissions. | Licensee access | Entity sees own records only. |
| Supervisor dashboard | Done | P0 | Operational dashboard. | Role dashboards | Supervisor sees permitted work. |
| Executive cross-module dashboard | Pending | P1 | Aggregate licensing, F&P, returns, complaints, SLA, actions. | Module data | Executive sees cross-module KPIs. |
| Role-specific dashboard configuration | In Progress | P1 | Dashboard widgets differ by role. | RBAC/reporting | Widgets scoped by role. |
| Drill-down widgets | In Progress | P1 | Metric → filtered list → record. | Routes/data | Every widget supports drill-down. |
| AI dashboard insights | Pending | P2 | Natural language insight cards with citations. | AI + reporting | Insight cites source data. |
| Pre-built operational reports | Done | P1 | Report definitions and generation. | Reporting module | Standard report can run. |
| Required report pack | Pending | P1 | Licensing throughput, SLA, returns compliance, F&P outcomes, complaints, actions. | Report builder | All BRD report types available. |
| Report filters/segmentation | Done | P1 | Filter metadata. | Reporting | Reports filter by time/entity/sector/officer/etc. |
| Save report presets | Pending | P2 | User-saved filters. | Reporting UI | Preset can be reused. |
| Ad-hoc report builder | In Progress | P1 | Select source, fields, filters, grouping. | Report metadata | User can build/save/share report. |
| CSV/PDF export | Done | P1 | Report export files. | Report engine | Export downloads successfully. |
| Export audit log | Needs Verification | P0 | Verify all export metadata. | Audit/reporting | Export log includes user, filters, count. |
| Scheduled reports | In Progress | P2 | Run scheduled reports. | Edge function | Report generated on schedule. |

---

## 7. AI and Document Ingestion To-Do List

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Document parser framework | Pending | P1 | Extract data from PDF, DOCX, XLSX, HTML, TXT. | Storage/documents | Parsed text/index stored. |
| AI Gateway integration | Pending | P2 | Use AI for advisory outputs. | AI provider approval | Secure calls with audit trail. |
| AI model/version audit logging | Pending | P0 | Log model, prompt/input snapshot, timestamp. | AI integration + audit | AI outputs reproducible. |
| Licensing AI risk screening | Pending | P2 | Analyze business case, ownership, docs. | Licensing/doc parser | Findings include source/confidence. |
| F&P AI synthesis | Pending | P2 | Analyze PQ, adverse media, reports. | F&P/doc parser | Summary cites evidence. |
| Prudential pattern detection | Pending | P2 | Identify trends/outliers/group contagion. | Ratios/data | Flags explain basis. |
| Complaint pattern intelligence | Pending | P2 | Identify systemic conduct patterns. | Complaint data | Pattern alerts generated. |
| Executive AI insights | Pending | P2 | Summarize cross-module trends. | Reporting/dashboard | Insight cards cite source records. |
| Human override controls | Pending | P0 | Mandatory justification for AI override. | Audit/workflows | Override cannot save without reason. |
| AI bias/export review support | Pending | P3 | Export AI decision patterns for review. | AI logs/reporting | Bias audit export available. |

---

## 8. Data and Demo Readiness To-Do List

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| Load entity universe | Pending | P1 | All supervised entities and codes. | Data loader/entity registry | Entity list matches demo dataset. |
| Load New FinCorp group | Pending | P1 | CB1, GI1, SD1, MCI, FHC relationships. | Entity relationships | Group aggregation ready. |
| Load risk thresholds | Pending | P1 | DTI/GI/LI/SD thresholds. | Threshold manager | Thresholds visible/editable. |
| Load quarterly financial data | Pending | P1 | 2021 Q1–2025 Q4. | Returns/analytics | Trends can be shown. |
| Load macro-financial data | Pending | P2 | Inflation, rates, FX, etc. | Macro module | Macro overlay available. |
| Load 15 PQs | Pending | P1 | Individual PQ files. | F&P module | Individual profiles created. |
| Load 14 adverse media scenarios | Pending | P1 | Link to individuals. | F&P screening | Screening results available. |
| Load examination reports | Pending | P2 | 5 PDFs linked to entities. | Document ingestion | Reports searchable. |
| Load complaints data | Pending | P1 | New FinCorp complaints XLSX. | Conduct module | Conduct analytics populated. |
| Configure New FinCorp license case | Pending | P1 | Preload or prepare live submission. | Licensing | Demo case runs through modules. |
| Create demo personas | Pending | P1 | Users for all roles. | RBAC/auth | Each persona logs in. |
| Run continuity test | Pending | P0 | Licensing → F&P → Prudential → Conduct → Dashboard → Audit. | All modules | End-to-end flow works without reset. |

---

## 9. Non-Functional To-Do List

| Task | Status | Priority | Description | Dependencies | Acceptance Criteria |
|---|---:|---:|---|---|---|
| MFA enrolment UI | Pending | P1 | Complete MFA setup for internal users. | Auth | User can enrol and pass MFA. |
| SSO configuration | Pending | P2 | SAML/OIDC for regulator users. | Auth provider | SSO login works. |
| Session timeout configuration | Pending | P1 | Timeout by role. | Auth/session | Idle users logged out. |
| Concurrent session flagging | Pending | P2 | Detect multiple sessions. | Auth/session logs | Flag appears in security log. |
| Encryption documentation | Needs Verification | P1 | Confirm at rest and transit. | Hosting/storage | Security document covers TLS/encryption. |
| RLS policy audit | Needs Verification | P0 | Run linter and manual policy review. | Supabase | No critical warnings. |
| Performance test plan | Pending | P1 | Page, analytics, reports. | Test tooling | Test results documented. |
| Load testing | Pending | P1 | Demo 50, production 500 users. | Environment | Load test report created. |
| Accessibility audit | Pending | P2 | WCAG 2.1 AA. | UI | Axe/manual audit report. |
| Backup/DR documentation | Pending | P2 | RTO/RPO, backups, DR drill. | Hosting | DR plan documented. |
| Audit retention policy | Pending | P1 | Seven-year or jurisdiction policy. | Audit logs | Retention configured/documented. |

---

## 10. Suggested Build Phases

### Phase 0 — Admin Panel Completion

Focus: make the system configurable before building more module logic.

1. Add missing Admin Hub modules: Rule Engine, SLA Manager, Security Events, Integration Logs, Data Loader.
2. Seed regulators, sectors, services, license types, roles, forms, workflows, notifications.
3. Finish RBAC/object-level access rules.
4. Finish Form Builder and Workflow Builder gaps.
5. Build Rule Engine and SLA Manager.
6. Build audit/security/integration logging foundations.

### Phase 1 — Licensing Stabilization

1. Finish RFI + communication log + SLA pause/resume.
2. Finish sufficiency checklist.
3. Build decision-ready cockpit.
4. Build decision letter and digital license certificate generation.
5. Finish renewal/suspension/revocation/variation lifecycles.
6. Add licensing-to-supervision handoff.

### Phase 2 — Returns and Prudential Analytics

1. Complete return validation rules.
2. Build ratio formula engine.
3. Configure thresholds and breach detection.
4. Add trend, peer, group, macro analytics.
5. Add CAMELS, supervisory actions, remediation, and EWIs.

### Phase 3 — Fit & Proper

1. Build individual registry and subject profile.
2. Build PQ/declaration workflows.
3. Build screening/adverse media/evidence workflows.
4. Build AI synthesis and override controls.
5. Build committee voting, determinations, conditions, appeals, reassessment.

### Phase 4 — Market Conduct

1. Finish complaint classification, SLA, routing, priority scoring.
2. Build conduct analytics and pattern alerts.
3. Build thematic reviews.
4. Build investigation workspace and evidence repository.
5. Build enforcement outcome and recurrence monitoring.

### Phase 5 — Dashboards, Reporting, AI, Demo Data

1. Build executive cross-module dashboard.
2. Complete report pack and ad-hoc builder.
3. Add AI insights.
4. Load full synthetic/demo datasets.
5. Run end-to-end continuity and performance testing.

---

## 11. Immediate Next 20 Tasks

These should be taken first because they unblock the largest number of features.

| Order | Task | Priority | Owner Type |
|---:|---|---:|---|
| 1 | Add Admin Hub cards/routes for Rule Engine, SLA Manager, Security Events, Integration Logs, Data Loader | P0 | Frontend |
| 2 | Decide and implement license-type taxonomy | P0 | Product + Backend |
| 3 | Seed BRD role catalogue and demo users | P0 | Backend/Admin |
| 4 | Build object-level permission/access-denial logging | P0 | Backend/Security |
| 5 | Verify Form Builder end-to-end and close missing field types | P0 | Frontend/Backend |
| 6 | Seed LF-001 to LF-011 licensing forms | P0 | Admin/Product |
| 7 | Verify Workflow Builder v2 and seed WF-L01 | P0 | Frontend/Backend |
| 8 | Build generic Rule Engine schema + basic UI | P0 | Backend/Frontend |
| 9 | Build SLA Manager schema + UI | P0 | Backend/Frontend |
| 10 | Implement SLA timer, pause/resume, warning, breach events | P0 | Backend |
| 11 | Build bidirectional communication log | P0 | Backend/Frontend |
| 12 | Finish RFI workflow with SLA pause/resume | P0 | Full-stack |
| 13 | Build sufficiency checklist | P0 | Full-stack |
| 14 | Build decision-ready cockpit | P0 | Frontend |
| 15 | Build decision letter PDF generation | P0 | Backend/Frontend |
| 16 | Build digital license certificate generation | P0 | Backend/Integration |
| 17 | Add export audit logging verification/fixes | P0 | Backend |
| 18 | Build security event log | P0 | Backend/Security |
| 19 | Build field-level data lineage for critical tables | P0 | Backend |
| 20 | Create demo-readiness validator | P1 | Full-stack |
