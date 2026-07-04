# Demo Presentation Guide — Unified License Hub

> Audience: non-technical presenter.
> Source of truth: SCRIPT 1 (Licensing), SCRIPT 2 (Fit & Proper), SCRIPT 3 (Prudential), SCRIPT 4 (Market Conduct), SCRIPT 5 (Dashboards, Reporting, Auditability).
> All 57 spreadsheet demo IDs are covered as individual steps and appear in the Coverage Matrix in section 4.

---

## 1. Demo Preparation

### 1.1 Required user accounts / roles
Log into each role once before the demo to confirm the password works and the landing page loads.

| # | Role name in the app | Used in |
|---|---|---|
| 1 | **Applicant** (external, self-service) | Script 1 (submit / draft / RFI response), Script 2 (declarations), Script 4 (complaint) |
| 2 | **Licensing Officer** | Script 1 intake, RFI, sufficiency |
| 3 | **Analyst / Reviewer** | Script 1 analyst review |
| 4 | **Legal / Compliance Reviewer** | Script 1 legal review |
| 5 | **Approver / Licensing Director** | Script 1 decision, issuance |
| 6 | **Fit & Proper Assessor** | Script 2 assessments, screening |
| 7 | **Fit & Proper Committee Member** | Script 2 determinations |
| 8 | **Prudential Supervisor** | Script 3 returns, analytics, actions |
| 9 | **Market Conduct Supervisor** | Script 4 complaints, investigations |
| 10 | **Regulated Entity user (Licensee)** | Script 3 returns submission, Script 5 licensee dashboard |
| 11 | **Complainant (public)** | Script 4 external complaint |
| 12 | **Admin / Super Admin** | Config, taxonomies, dashboards, audit, exports |

> If your tenant uses fewer roles, log into the highest-privilege internal account (Admin or Super Admin) and narrate the role-switch verbally.

### 1.2 Suggested demo data (create in advance)
- **Applicant / Entity:** Caribbean Trust Bank Ltd
- **Contact person:** Maria James — maria.james@example.com — +1 869 555 0101 — Basseterre, St. Kitts
- **License type:** Banking License (New License)
- **Sector:** Banking / Deposit-taking
- **Fit & Proper individual:** Jonathan Williams — CEO — St. Kitts and Nevis nationality — demo record ID **DEMO-FPA-001**
- **Prudential return:** Q1 Capital Adequacy Return (CAR) with one deliberately low ratio to trigger a threshold breach
- **Complaint:** Customer disclosure complaint linked to Caribbean Trust Bank Ltd
- **Twin Peaks case title:** "Joint review of Caribbean Trust Bank application"

### 1.3 Browser setup
- Chrome or Edge, latest version, in a **1440 × 900** (or larger) window.
- Zoom 100 %. Close bookmarks bar for more screen space.
- **Two Chrome profiles** open side-by-side — one signed in as the internal regulator, one as the applicant/licensee — so you can switch without logging out.

### 1.4 Tabs / pages to pre-open before the demo starts
1. Dashboard (Supervisory)
2. Applications → Queue
3. Fit & Proper → Individuals Register
4. Prudential → Returns
5. Market Conduct → Complaints
6. Reports
7. Audit / History

### 1.5 Login order
1. Applicant profile (submit + respond to RFI)
2. Licensing Officer (intake + RFI)
3. Analyst → Legal → Approver (review + decision)
4. F&P Assessor → Committee
5. Prudential Supervisor
6. Conduct Supervisor
7. Admin (dashboards, audit, exports)

### 1.6 Recommended screen resolution
1440 × 900 minimum. 1920 × 1080 preferred. Present in a maximised browser window; hide the OS dock/taskbar if possible.

### 1.7 What to do if a feature is not fully implemented
Use this fallback wording, **do not stay silent**:

> "This capability is partially implemented in the current release. What you see now is the working portion — {name what's on screen}. The full behaviour is planned for the next iteration. In the meantime the audit / history tab captures the same evidence."

If nothing at all is available, show the closest audit trail entry, the notification log, or the master-data / configuration screen as proof of design intent.

---

## 2. Demo Storyline (business narrative)

**Caribbean Trust Bank Ltd** wants a banking licence.

1. Their contact person, Maria James, logs into the applicant portal and **starts an application** (saves a draft, comes back, completes it, uploads documents, submits it, gets a reference number).
2. A **Licensing Officer** picks it up from the intake queue, sees the SLA timer running, and raises an **RFI** ("please send us the ownership chart"). The SLA pauses while we wait for the applicant. The applicant responds; the SLA resumes.
3. The case is routed to an **Analyst** (records findings), then to **Legal / Compliance** (records legal review).
4. In parallel, a **Fit & Proper assessment** is opened on the proposed CEO, Jonathan Williams. Declarations are collected, screening is run, adverse findings are triaged, a committee determination is issued.
5. **Prudential supervisors** review a submitted return, spot a ratio breach, record an assessment, and open a supervisory action.
6. **Market Conduct supervisors** intake a customer complaint, triage it, spot a pattern, open a thematic review, and escalate to an investigation.
7. Under **Twin Peaks**, the prudential and conduct teams see each other's findings, discuss interdependencies, and issue a **conditional clearance** ("Prudential clearance subject to conduct remediation").
8. The approver issues a **final decision**, the system produces the digitally-signed licence and notifications, and supervision continues (renewals, monitoring, dashboards).
9. Anyone with the right permission can pull up **reports**, **dashboards** and the **full audit trail** for defence.

---

## 3. Step-by-Step Demo Script

Fields for every step:
**Purpose · Login as · Go to · Action · Values · Presenter script · Expected result · Evidence · If it doesn't appear**

Steps are grouped into 5 acts matching the source scripts.

---

### ACT 1 — Unified Licensing Registration & Approval (Script 1)

---

#### Step 1 — DEMO-ULRA-001 · Applicant Entry & Draft Creation
**Purpose:** Prove an applicant can start, save and resume an application before submitting.
**Login as:** Applicant (Maria James).
**Go to:** Applicant Portal → **Applications** → **Start New Application**.
**Action:**
1. Click **Start New Application**.
2. Select **License Type A → Banking License**.
3. Fill only the first 2–3 fields.
4. Click **Save Draft**, then **Log out**.
5. Log back in → **Applications → Drafts** → open the same record.

**Values:**
- License Type: Banking License
- Applicant Name: Caribbean Trust Bank Ltd
- Contact Email: maria.james@example.com

**Presenter script:** "Applicants don't have to finish in one sitting. The system keeps a draft with a timestamp so nothing is lost, and every action is auditable."
**Expected result on screen:** Draft record with status **Draft** and a created-on timestamp; it re-opens exactly where it was left.
**Evidence to show:** Draft status badge · created-on timestamp · audit / history entry "draft created".
**If it doesn't appear:** Show the Applications list filtered by "Draft" and open the History tab to show the same event.

---

#### Step 2 — DEMO-ULRA-002 · Dynamic Forms, Validation & Attachments
**Purpose:** Prove forms are configured, not hard-coded; validation works; document uploads carry metadata & versions.
**Login as:** Applicant → then briefly Admin for the config view.
**Go to:** Application form → then Admin → **Form Builder** → open the same template.
**Action:**
1. In the application, switch **License Type** to another type; watch the visible fields change.
2. Deliberately clear a mandatory field and click **Save** — trigger the validation error, then correct it.
3. Upload two documents (**Certificate of Incorporation**, **AML/CFT Policy**) with metadata.
4. Re-upload one document to show version history.
5. Show **batch upload** by dragging multiple files at once.
6. Switch to Admin → **Form Builder** to prove the form is configurable.

**Values:**
- Documents: Certificate of Incorporation, Business Plan, AML/CFT Policy, Financial Projections, Fit & Proper Declarations
- Metadata: Document type, Effective date, Confidentiality = Restricted

**Presenter script:** "Every field, every rule, every document type is set up in the Form Builder — no code changes. Validation runs inline, and every uploaded file keeps its version history."
**Expected result:** Inline red validation message → clears after correction; document list with version number and metadata; different fields for different licence types.
**Evidence:** Form Builder screen · validation error text · document version history dialog.
**If it doesn't appear:** Show Form Builder alone and narrate; open the Document List and expand a version panel.

---

#### Step 3 — DEMO-ULRA-003 · Submission & Acknowledgement
**Purpose:** Prove formal submission produces a reference number and acknowledgement.
**Login as:** Applicant.
**Go to:** Application → **Review & Submit**.
**Action:**
1. Click **Submit**.
2. Wait for the confirmation screen with reference ID.
3. Open the notifications bell / email log and show the acknowledgement.

**Values:** (none — system-generated reference, e.g. `APP-2026-000123`)

**Presenter script:** "Submission is a formal moment. The system stamps a unique reference, timestamp, and sends the applicant a written acknowledgement."
**Expected result:** Status changes to **Submitted**; reference ID visible; acknowledgement in the notifications panel.
**Evidence:** Acknowledgement screen · notification log entry · new row in Licensing Officer's intake queue.
**If it doesn't appear:** Open the Applications list, sort by newest — the record with **Submitted** status is the evidence.

---

#### Step 4 — DEMO-ULRA-004 · Licensing Officer Intake & Queue Visibility
**Purpose:** Prove the regulator sees a real operational queue.
**Login as:** Licensing Officer.
**Go to:** Dashboard → **Applications** → **Queue**.
**Action:**
1. Show the columns: Status, Owner, SLA age, Priority.
2. Sort by SLA age (oldest first).
3. Filter by **New Submissions**.

**Values:** Filters — Status = Submitted, Priority = High.
**Presenter script:** "The intake queue is the officer's control tower — every submission, its owner, and how much SLA time is left is on one screen."
**Expected result:** Queue table with the columns visible; sortable/filterable.
**Evidence:** Queue screen · column headers · row for Caribbean Trust Bank.
**If it doesn't appear:** Open the Applications list view and narrate the columns.

---

#### Step 5 — DEMO-ULRA-005 · Sufficiency Review, SLA & RFI
**Purpose:** Prove sufficiency rules, SLA control, and RFI round-trip.
**Login as:** Licensing Officer → then Applicant.
**Go to:** Queue → open **Caribbean Trust Bank** → **Sufficiency** tab.
**Action:**
1. Show the **Sufficiency** checklist and its rule-based pass/fail markers.
2. Show the SLA timer at the top.
3. Click **Raise RFI** → fill and send.
4. Watch the SLA pause.
5. Switch to Applicant profile → **My RFIs** → upload response.
6. Return to officer view: SLA resumes and status updates.

**Values:**
- RFI Summary: "Please provide missing ownership structure document"
- RFI Item 1: Upload ownership structure chart
- RFI Item 2: Clarify AML compliance officer appointment
- Due date: **7 days from today**
- Priority: High
- Required: Yes

**Presenter script:** "The officer's sufficiency check flags what's missing. When we raise an RFI the SLA pauses so we're not penalised for the applicant's response time — and it resumes automatically when they reply."
**Expected result:** RFI logged, SLA paused (badge changes), status updated after response, near-due alert visible.
**Evidence:** RFI record · SLA timer with pause icon · audit log entries "RFI raised", "RFI responded".
**If it doesn't appear:** Open the RFI list under the application and show the round-trip records.

---

#### Step 6 — DEMO-ULRA-006 · Automated Analyst Review & Intelligent Routing
**Purpose:** Prove routing to analyst plus automated first-pass analysis with override.
**Login as:** Licensing Officer → then Analyst.
**Go to:** Application → **Route / Reassign** → set Analyst → Analyst opens the case.
**Action:**
1. Reassign case to Analyst → note the routing entry.
2. Analyst opens **Analysis** tab; show any auto-generated findings / risk flags.
3. Override one auto-finding and add a comment.
4. Save; upload an internal analysis note (PDF).

**Values:**
- Analyst finding: "Ownership structure acceptable; recommend proceeding subject to F&P outcome."
- Override rationale: "Reduced risk score after reviewing shareholder disclosures."

**Presenter script:** "Cases route to the right desk automatically. The analyst sees system-generated first-pass findings but always has the final say — every override is logged."
**Expected result:** Routing audit entry; timestamped analyst findings; override note recorded.
**Evidence:** Routing audit · Analyst notes · Override entry.
**If it doesn't appear (Partial):** Automated AI-suggested findings may not be live — show manual finding entry and the audit trail and narrate the planned AI capability.

---

#### Step 7 — DEMO-ULRA-007 · Legal / Compliance Review
**Purpose:** Prove restricted-access legal review.
**Login as:** Legal Reviewer.
**Go to:** Application → **Legal Review** tab.
**Action:**
1. Add a legal comment.
2. Log out and log back in as **Analyst**; try to open the Legal tab → show access denied.

**Values:** Legal note: "No enforceability concerns. Standard licence terms apply."
**Presenter script:** "Legal review is defensible and confined to authorised staff."
**Expected result:** Legal note saved · Access-denied banner for the wrong role.
**Evidence:** Legal notes · denied-access log entry.
**If it doesn't appear:** Show the internal note area and narrate role restrictions from the roles matrix.

---

#### Step 8 — DEMO-ULRA-008 · Decision-Ready Consolidated View
**Purpose:** Prove one screen brings everything together.
**Login as:** Approver.
**Go to:** Application → **Consolidated View** / Application Detail page.
**Action:** Scroll through applicant data, documents, analyst notes, legal notes, RFIs and SLA age.
**Values:** (view only)
**Presenter script:** "The approver reads the whole story on one page before deciding — no jumping between screens."
**Expected result:** Single scrollable case view.
**Evidence:** Consolidated screen.
**If it doesn't appear:** Use the application accordion sections in sequence.

---

#### Step 9 — DEMO-ULRA-009 · Decision, Issuance & Notifications
**Purpose:** Prove decision, digital artifact, and notifications work end-to-end.
**Login as:** Approver.
**Go to:** Application → **Decision**.
**Action:**
1. Click **Decision**, choose **Conditional Approval**.
2. Enter rationale; save.
3. Open the generated **Licence certificate** artifact.
4. Open **Notifications** to show the applicant message.

**Values:**
- Decision: Conditional Approval
- Rationale: "Approved subject to conduct remediation and Fit & Proper clearance."
- Notification recipients: applicant + internal team

**Presenter script:** "The approver picks from configured options — approve, conditional, reject. The system produces the licence document and sends the notifications automatically."
**Expected result:** Decision recorded; signed artifact generated; notification log entry.
**Evidence:** Signed licence PDF · notification content preview · audit entry.
**If it doesn't appear (Partial for signing):** Show generated licence PDF from Licences module + Sign Certificate panel; narrate that digital signature is a Partial capability where the signature step is separate.

---

#### Step 10 — DEMO-ULRA-010 · Renewal, Revocation, Bulk & Audit
**Purpose:** Prove full lifecycle: renew, revoke, bulk, and audit.
**Login as:** Admin.
**Go to:** **Licences** module.
**Action:**
1. Open an existing licence → **Renew** → complete the renewal form.
2. Open another licence → **Revoke** → enter justification.
3. Open **Admin → Bulk Import** and drop a sample file of 5–10 records.
4. Open the audit tab of the first licence — show draft → submit → approve → renew → revoke chain.

**Values:**
- Renewal validity: 12 months
- Revocation justification: "Failure to meet capital adequacy requirements after remediation window."

**Presenter script:** "Licensing isn't only about issuing. Renewals, revocations, bulk intake and full history are all supervised in one place."
**Expected result:** New statuses; imported batch visible; complete chronological audit.
**Evidence:** Status badges · bulk import result · audit trail.
**If it doesn't appear:** Show the Licence Lifecycle log and narrate.

---

#### Step 11 — DEMO-ULRA-011 · Licensing → Supervision Continuity
**Purpose:** Prove that licensing decisions seed the supervisory plan and corrective actions.
**Login as:** Approver / Supervisor.
**Go to:** Application (approved) → **Supervisory Handover** section, then **Prudential** / **Conduct** profile of the new licensee.
**Action:** Show the auto-created supervisory profile, initial risk rating, and time-bound corrective actions carried over from licensing.
**Values:** Corrective action: "Board risk committee TOR to be submitted within 60 days."
**Presenter script:** "The moment a licence is issued, the supervisory clock starts. Risks identified at licensing become supervisory actions with deadlines."
**Expected result:** New supervisory record with corrective actions and due dates.
**Evidence:** Supervisory plan record · corrective action tracker.
**If it doesn't appear (Partial):** Show the manual supervisory record creation on the licensee profile and the licensing audit trail; explain the auto-seeding is planned.

---

#### Step 12 — DEMO-ULRA-012 · Twin Peaks Interdependencies & Divergent View
**Purpose:** Prove the Twin Peaks coordination feature works.
**Login as:** Prudential Supervisor → then Conduct Supervisor → back to either.
**Go to:** Case → **Twin Peaks / Coordination** tab.
**Action:**
1. As Prudential, record a finding: "Governance weakness in board risk oversight."
2. As Conduct, record a finding: "Disclosure wording unclear."
3. Open **Coordination / Shared Discussion**; the system flags the interdependency.
4. Add discussion messages between the two teams.
5. Record a **Conditional Clearance**: "Prudential clearance subject to conduct remediation."

**Values:**
- Case title: Joint review of Caribbean Trust Bank application
- Interdependency flag: Prudential governance weakness may affect conduct risk
- Discussion message: "Conduct team requests remediation before final clearance."
- Resolution: Prudential clearance subject to conduct remediation
- Escalation outcome: Conditionally cleared

**Presenter script:** "Two regulators, one applicant. The system keeps their views independent but visible to each other, flags the overlap, and records a conditional clearance that binds both sides."
**Expected result:** Both findings visible to both regulators; interdependency flag; discussion log; conditional clearance record.
**Evidence:** Coordination screen · interdependency flag · shared discussion · clearance record · audit trail.
**If it doesn't appear:** Show the Twin Peaks Clearance panel plus the audit trail; narrate the coordination workflow.

---

### ACT 2 — Fit & Proper Assessment (Script 2)

---

#### Step 13 — DEMO-FPA-001 · Multiple Initiation Paths
**Purpose:** Prove F&P can be triggered four different ways.
**Login as:** Internal regulator (Admin / F&P Assessor).
**Go to:** **Fit & Proper** → search **DEMO-FPA-001** → open profile.
**Action:** Trigger four assessments for the same individual:
1. **New licence** — add as controller in a test application → submit.
2. **Role change** — add/update a role on the licensee.
3. **Ongoing monitoring / cycle** — run the periodic cycle scheduler (Reassessment cycle = 12 months, next-due ≤ today).
4. **Ad-hoc** — click **Start Assessment** → Adverse event triggered.

**Values:** Assessment types: Initial · Material change · Cycle · Adverse event.
**Presenter script:** "F&P is not a one-time thing. We can trigger it from a new licence, a role change, a periodic cycle or an ad-hoc supervisory concern — four ways, one register."
**Expected result:** Four rows in the assessments panel, newest first.
**Evidence:** Assessments list · initiation logs · audit entries `fp.assessment.created`, `fp.assessment.cycle.opened`.
**If it doesn't appear:** Show the three that work and narrate the fourth using the audit / history evidence.

---

#### Step 14 — DEMO-FPA-002 · Single Individual + Multiple Roles
**Purpose:** Prove one person can be linked to many roles across many entities without duplication.
**Login as:** F&P Assessor.
**Go to:** Fit & Proper → **Individuals Register**.
**Action:**
1. Search "Jonathan Williams" — system finds the existing record, does **not** create a duplicate.
2. Add a second role on a different licensee (e.g. Director at another entity).
3. Show cumulative influence indicator / role list on the profile.

**Values:** Roles: CEO — Caribbean Trust Bank; Director — Test Insurance Ltd.
**Presenter script:** "One person, one unique identifier — but many roles. The system prevents duplicates and shows cumulative influence."
**Expected result:** One profile with multiple active role rows.
**Evidence:** Individual profile · roles panel · linkage audit.
**If it doesn't appear:** Show the roles panel with one role; narrate the uniqueness rule.

---

#### Step 15 — DEMO-FPA-003 · Subject Profile & Access Control
**Purpose:** Prove access to F&P profiles is restricted.
**Login as:** Licensee user (unauthorised) → then F&P Assessor.
**Go to:** Try `/fit-and-proper/individuals/<id>` as licensee → then log in as assessor.
**Action:** Show the access-denied screen; then log in as authorised and open the same profile.
**Values:** —
**Presenter script:** "External users cannot walk into an F&P profile. Every denial is logged."
**Expected result:** Access-denied screen for licensee; full profile for assessor.
**Evidence:** Access-denied log · profile view.
**If it doesn't appear:** Show the roles matrix / permissions screen.

---

#### Step 16 — DEMO-FPA-004 · Declarations & Notifications
**Purpose:** Prove the individual submits declarations and assessors are notified.
**Login as:** Applicant / individual → then F&P Assessor.
**Go to:** F&P Assessment → **Personal Questionnaire (PQ)**.
**Action:** Complete PQ → submit → switch to assessor → show inbox notification.
**Values:** Declarations: No criminal record · No prior regulatory action · Two directorships disclosed.
**Presenter script:** "The individual completes the PQ themselves. Assessors get notified the moment it lands."
**Expected result:** PQ status Submitted; notification in assessor inbox.
**Evidence:** Declaration record · notification log.
**If it doesn't appear:** Show the notification centre.

---

#### Step 17 — DEMO-FPA-005 · Screening Configuration & Automated Checks
**Purpose:** Prove screening is configurable and can run automatically.
**Login as:** Admin → then F&P Assessor.
**Go to:** Admin → **Screening Configuration**; then F&P → Assessment → **Screening**.
**Action:**
1. Show configurable screening types and thresholds.
2. Run automated screening; show match-confidence indicators and false-positive resolution.

**Values:** Screening types: PEP · Sanctions · Adverse media. Threshold: 70 %.
**Presenter script:** "Screening rules are not hard-coded. The system runs the checks and shows confidence scores; assessors resolve false positives."
**Expected result:** Screening results with confidence scores.
**Evidence:** Config screen · screening results table.
**If it doesn't appear (Partial):** Show the manual screening panel + config screen and narrate that automated adverse-media scoring is a Partial feature.

---

#### Step 18 — DEMO-FPA-006 · Manual Screening & Evidence
**Purpose:** Prove manual screening tasks and evidence upload work.
**Login as:** F&P Assessor.
**Go to:** Assessment → **Screening** → **Add Manual Screening Task**.
**Action:** Create a task, upload a third-party evidence PDF, link it to the screening item.
**Values:** Task: "External adverse-media search". Evidence: `adverse_media_report.pdf`.
**Presenter script:** "Not every check is automated. Manual tasks are tracked and evidence is attached and versioned."
**Expected result:** Manual task logged; evidence attached and linked.
**Evidence:** Task record · attached file link.
**If it doesn't appear:** Use the documents panel; narrate.

---

#### Step 19 — DEMO-FPA-007 · Adverse Findings & Severity
**Purpose:** Prove severity-based routing / escalation.
**Login as:** F&P Assessor.
**Go to:** Assessment → **Findings**.
**Action:** Record an adverse finding, set severity **High**, save; show routing / escalation.
**Values:** Finding: "Prior undisclosed directorship." Severity: High.
**Presenter script:** "High-severity findings escalate automatically — that's risk-based supervision."
**Expected result:** Severity badge; routing entry.
**Evidence:** Severity log · routing audit.
**If it doesn't appear:** Show the finding record + audit.

---

#### Step 20 — DEMO-FPA-008 · Historic Comparison & Trends
**Purpose:** Prove the assessor can compare an individual across time and see population trends.
**Login as:** F&P Assessor / Supervisor.
**Go to:** Individual profile → **History / Trends**.
**Action:** Open comparison of current vs prior assessment; open population trend dashboard.
**Values:** (view)
**Presenter script:** "Supervision improves when we see change over time — both for the person and the whole population."
**Expected result:** Comparison view + trend chart.
**Evidence:** Comparison screen · trend chart.
**If it doesn't appear (Partial):** Show the assessments list ordered by date and narrate.

---

#### Step 21 — DEMO-FPA-009 · AI-Assisted Data Analysis with Human Override
**Purpose:** Prove AI insights support (do not replace) assessor judgement.
**Login as:** F&P Assessor.
**Go to:** Assessment → **AI Analysis** panel.
**Action:** Run analysis on uploaded documents / media; show source citations, confidence, and flags; edit / override the AI output.
**Values:** Override reason: "Media article refers to a namesake, not the subject."
**Presenter script:** "AI proposes; the assessor decides. Every citation and every override is captured."
**Expected result:** AI output with citations; override captured.
**Evidence:** AI panel · sources · override entry.
**If it doesn't appear (Partial):** Show the free-text findings + document extraction panel and narrate that AI assistance is planned.

---

#### Step 22 — DEMO-FPA-010 · Sector-Specific Decision Logic
**Purpose:** Prove F&P criteria differ by sector.
**Login as:** Admin.
**Go to:** Admin → **FP Sector Rules** (or Master Data → Sectors).
**Action:** Show rules for DTI vs microcredit; open an assessment in each sector to compare the criteria that render.
**Values:** DTI = stricter capital-oversight criteria; microcredit = lighter set.
**Presenter script:** "The bar for a banker is not the bar for a microcredit officer. Rules are configured per sector."
**Expected result:** Different criteria appear per sector.
**Evidence:** Sector-rule configuration · rendered assessment.
**If it doesn't appear:** Show the sector configuration screen and one assessment; narrate.

---

#### Step 23 — DEMO-FPA-011 · Multi-Regulator Determinations
**Purpose:** Prove independent determinations by different regulators on the same person.
**Login as:** BOJ regulator → then FSCA regulator.
**Go to:** Same individual → each regulator opens their own assessment.
**Action:** Each records an independent determination on the same profile.
**Values:** BOJ = Approved; FSCA = Conditional.
**Presenter script:** "Same person, two regulators, two independent determinations — no leakage across teams."
**Expected result:** Two separate determinations visible in the regulator's scope.
**Evidence:** Determination records per regulator · access log.
**If it doesn't appear:** Use the Regulator switcher to show the segregation and narrate.

---

#### Step 24 — DEMO-FPA-012 · Committee Review & Weighted Voting
**Purpose:** Prove committee governance with vote weighting.
**Login as:** Committee members (each).
**Go to:** Assessment → **Committee / Determination**.
**Action:** Each member casts a vote with rationale; finalise weighted outcome.
**Values:** Chair vote weight = 2; others = 1. Outcome = Conditional approval.
**Presenter script:** "Committee decisions carry weight — literally. We can configure who counts for how much."
**Expected result:** Weighted outcome calculated and stored.
**Evidence:** Vote records · outcome calculation.
**If it doesn't appear (Partial):** Show the Determinations panel with recorded rationale; narrate weighted voting as planned.

---

#### Step 25 — DEMO-FPA-013 · Conditional Determination & SLA Breach
**Purpose:** Prove conditions have a lifecycle and SLA breach is tracked.
**Login as:** F&P Assessor.
**Go to:** Assessment → **Conditions**.
**Action:** Issue a conditional approval with a condition and deadline; show reminders; simulate breach.
**Values:** Condition: "Submit board risk committee TOR within 60 days." SLA breach date: past date.
**Presenter script:** "Conditions aren't paperwork — they are tracked, reminded, and breaches are on the record."
**Expected result:** Condition record; reminder log; SLA-breach badge.
**Evidence:** Condition · reminders · breach log.
**If it doesn't appear:** Show the Conditions panel with dates and narrate.

---

#### Step 26 — DEMO-FPA-014 · Appeals (Standalone & Linked)
**Purpose:** Prove appeals workflow updates the licence.
**Login as:** F&P Assessor → Appeals officer.
**Go to:** Assessment → **Appeals**.
**Action:** Create an appeal, decide it, show the linked licence update.
**Values:** Appeal reason: "New evidence submitted." Outcome: Upheld.
**Presenter script:** "Appeals close the loop — a favourable outcome flows back to the licence."
**Expected result:** Appeal record; licence status updated.
**Evidence:** Appeal record · linked licence audit.
**If it doesn't appear:** Show the Appeals panel and narrate.

---

#### Step 27 — DEMO-FPA-015 · Monitoring, Notifications & Audit
**Purpose:** Prove ongoing monitoring, event-triggered reassessment, and full audit.
**Login as:** Admin / F&P Assessor.
**Go to:** F&P → **Monitoring** panel; **Audit** tab.
**Action:** Open the scheduler; trigger a monitoring event; open the audit log for the individual.
**Values:** Reassessment cycle: 24 months.
**Presenter script:** "Fit & Proper is continuous. Events trigger reassessment, notifications go out, and everything is on the audit trail."
**Expected result:** Scheduler active; monitoring event logged; audit trail visible.
**Evidence:** Scheduler log · notification log · audit entries.
**If it doesn't appear:** Show the Monitoring panel and the History button on the individual.

---

### ACT 3 — Prudential Supervision (Script 3)

---

#### Step 28 — DEMO-PRUD-001 · Supervisory Universe & Risk Taxonomy
**Purpose:** Prove risk-based, configurable supervision.
**Login as:** Prudential Supervisor / Admin.
**Go to:** Prudential → **Supervised Entity Register**; Admin → **Risk Taxonomy**.
**Action:** Open the entity register; open the risk taxonomy config; show entity categories + risk sub-categories.
**Values:** Categories = Capital, Liquidity, Governance, Operational. Systemic importance flag on Caribbean Trust Bank.
**Presenter script:** "Supervision is not one-size-fits-all. Entities are segmented; the risk taxonomy is configurable."
**Expected result:** Register + configurable taxonomy.
**Evidence:** Register screen · taxonomy config.
**If it doesn't appear:** Show the sector master-data screens.

---

#### Step 29 — DEMO-PRUD-002 · Baseline Data & Historical Context
**Purpose:** Prove longitudinal data is available per entity.
**Login as:** Prudential Supervisor.
**Go to:** Entity → **Prudential Profile** → History.
**Action:** Navigate prior returns, historical ratios, prior assessments, enforcement history.
**Values:** —
**Presenter script:** "The supervisor sees the entity's story — not just today's snapshot."
**Expected result:** Historical views populated.
**Evidence:** Historical views · prior assessment records.
**If it doesn't appear:** Show the returns list ordered by period.

---

#### Step 30 — DEMO-PRUD-003 · Regulatory Return Submission (Entity View)
**Purpose:** Prove entities submit prudential returns with validation.
**Login as:** Regulated Entity user.
**Go to:** Licensee Portal → **Returns**.
**Action:** Start return, deliberately submit an invalid value, correct it, submit.
**Values:** Return: Q1 Capital Adequacy · CAR = 7 % (invalid) → correct to 12 %.
**Presenter script:** "Data quality starts at the source. The entity gets the validation error immediately."
**Expected result:** Validation error → correction → Submitted.
**Evidence:** Validation message · submitted return record.
**If it doesn't appear:** Show the returns validation panel.

---

#### Step 31 — DEMO-PRUD-004 · Intake, Validation & Versioning (Supervisor View)
**Purpose:** Prove the supervisor sees validated returns and version history.
**Login as:** Prudential Supervisor.
**Go to:** Prudential → **Returns Intake Queue**.
**Action:** Open the return; show validation results and version history.
**Values:** —
**Presenter script:** "Every version, every timestamp, every validation result is preserved."
**Expected result:** Validated return with version history.
**Evidence:** Intake queue · version history dialog · audit log.
**If it doesn't appear:** Show Change History Drawer.

---

#### Step 32 — DEMO-PRUD-005 · Ratio Calculation & Threshold Breach
**Purpose:** Prove automated ratios and configurable thresholds; show a breach.
**Login as:** Prudential Supervisor.
**Go to:** Return → **Analytics / Ratios**.
**Action:** Show CAR, LCR calculations; open thresholds; show one breach flagged.
**Values:** Threshold: CAR ≥ 10 %. Entity value: 9.4 % → breach.
**Presenter script:** "Ratios are calculated automatically; thresholds are configured; breaches are surfaced without waiting for a human."
**Expected result:** Ratio table + red breach flag.
**Evidence:** Ratio Summary Card · threshold config.
**If it doesn't appear:** Show the Ratio Summary Card.

---

#### Step 33 — DEMO-PRUD-006 · Peer Comparison & Trends
**Purpose:** Prove peer comparison and trend views.
**Login as:** Prudential Supervisor.
**Go to:** Entity → **Peer Comparison** / **Trends**.
**Action:** Compare Caribbean Trust Bank against banking peers; open trend chart.
**Values:** Time window: last 4 quarters.
**Presenter script:** "One entity means little without context. Peer comparison and trends give real supervisory insight."
**Expected result:** Peer chart + trend chart.
**Evidence:** Peer / trend charts.
**If it doesn't appear (Partial):** Show trend chart on the supervisory dashboard; narrate.

---

#### Step 34 — DEMO-PRUD-007 · Supervisory Assessment & Risk Scoring
**Purpose:** Prove judgment is captured with rationale.
**Login as:** Prudential Supervisor.
**Go to:** Entity → **Assessment**.
**Action:** Record an assessment, assign a risk score, save the rationale.
**Values:** Finding: "Governance weakness in board risk oversight." Severity: Medium. Score: 3/5. Recommendation: "Submit board risk committee TOR."
**Presenter script:** "The supervisor's judgment sits alongside the data — with reasons attached."
**Expected result:** Assessment record with score and rationale.
**Evidence:** Assessment · rationale text.
**If it doesn't appear:** Show the Return Review Panel.

---

#### Step 35 — DEMO-PRUD-008 · Supervisory Actions & Escalation
**Purpose:** Prove actions can be issued and escalated.
**Login as:** Prudential Supervisor.
**Go to:** Assessment → **Supervisory Actions**.
**Action:** Initiate a remediation request; show escalation to a superior.
**Values:** Action: "Remediation plan for governance weakness — due 60 days." Escalation: to Director.
**Presenter script:** "Findings turn into action — with escalation baked in."
**Expected result:** Action record; escalation log.
**Evidence:** Action record · escalation audit.
**If it doesn't appear:** Show the Escalations Tab.

---

#### Step 36 — DEMO-PRUD-009 · Notifications & Entity Communication
**Purpose:** Prove entities are notified and acknowledgements captured.
**Login as:** Prudential Supervisor → then Licensee user.
**Go to:** Action → **Notifications**; then Licensee inbox.
**Action:** Open notification log; switch to licensee; acknowledge.
**Values:** Recipient: Caribbean Trust Bank primary contact. Message body preview.
**Presenter script:** "Nothing happens off-record. Every message and every acknowledgement is in the log."
**Expected result:** Notification sent, acknowledged.
**Evidence:** Notification records · acknowledgement status.
**If it doesn't appear:** Show the notifications panel.

---

#### Step 37 — DEMO-PRUD-010 · Ongoing Monitoring & Stress Indicators
**Purpose:** Prove monitoring rules with early warning.
**Login as:** Prudential Supervisor / Admin.
**Go to:** Prudential → **Monitoring Configuration**.
**Action:** Show a rule (e.g. LCR trend deteriorating 3 quarters); trigger the warning.
**Values:** Rule: LCR < 100 % for 2 consecutive periods → Early warning.
**Presenter script:** "We don't wait for the wall — we get the early warning."
**Expected result:** Rule active; warning generated.
**Evidence:** Monitoring rules · warning log.
**If it doesn't appear:** Show the Validation & Ratios Panel and narrate.

---

#### Step 38 — DEMO-PRUD-011 · Dashboards, Integrations & Audit Trail
**Purpose:** Prove dashboards + integration readiness + end-to-end audit.
**Login as:** Prudential Supervisor / Admin.
**Go to:** **Supervisory Dashboard**; **Integration Logs**; **Audit**.
**Action:** Open the dashboard; open integration logs; drill into the audit trail.
**Values:** —
**Presenter script:** "The supervisor's dashboards, the integration logs, and the full audit — one platform, one story."
**Expected result:** Dashboards, integration log, audit trail all populated.
**Evidence:** Dashboards · logs · audit.
**If it doesn't appear (Partial for integration logs):** Show the audit + notifications log as the substitute and narrate integrations as planned.

---

### ACT 4 — Market Conduct Supervision (Script 4)

---

#### Step 39 — DEMO-MCS-001 · Market Conduct Scope & Risk Taxonomy
**Purpose:** Prove conduct supervision is structured and configurable.
**Login as:** Market Conduct Supervisor / Admin.
**Go to:** Admin → **Conduct Framework Configuration**.
**Action:** Show regulated activities (sales, advice, disclosure, marketing) and conduct risk categories (mis-selling, unfair treatment, misleading disclosures).
**Values:** —
**Presenter script:** "Conduct supervision has its own taxonomy — configurable, not baked in."
**Expected result:** Taxonomy screen.
**Evidence:** Risk taxonomy config.
**If it doesn't appear:** Show the Complaint Types management screen.

---

#### Step 40 — DEMO-MCS-002 · Supervisory Universe & Historical Context
**Purpose:** Prove entity/product/channel history is accessible.
**Login as:** Conduct Supervisor.
**Go to:** Entity → **Conduct Profile** → History.
**Action:** Navigate prior complaints, investigations, outcomes.
**Values:** —
**Presenter script:** "Every entity has a conduct story — we see it in full."
**Expected result:** Historical view populated.
**Evidence:** Historical conduct records.
**If it doesn't appear:** Show Complaint list filtered by entity.

---

#### Step 41 — DEMO-MCS-003 · Complaint Intake (External & Internal)
**Purpose:** Prove intake works via two channels.
**Login as:** Public complainant → then Conduct Supervisor.
**Go to:** Public → **Submit a Complaint**; then Regulator → **New Complaint**.
**Action:** Submit externally; then log a complaint internally.
**Values:**
- Complainant: Peter Roberts · peter.roberts@example.com
- Complaint: "Terms and conditions were unclear at account opening."
- Entity: Caribbean Trust Bank Ltd

**Presenter script:** "Complaints come from the public and from our own case officers — both work, both are acknowledged."
**Expected result:** Two complaint records; acknowledgements issued.
**Evidence:** Complaint records · acknowledgement artifacts.
**If it doesn't appear:** Show the Complaints module + Acknowledgement component.

---

#### Step 42 — DEMO-MCS-004 · Classification, Triage & Prioritization
**Purpose:** Prove classification, prioritisation, routing and SLA.
**Login as:** Conduct Supervisor.
**Go to:** Complaint → **Classification / Triage**.
**Action:** Classify (category, product, severity); show priority scoring and routing to case officer; show SLA timer.
**Values:** Category: Disclosure · Product: Deposit account · Severity: Medium.
**Presenter script:** "The right complaint goes to the right officer, in the right order, on the right clock."
**Expected result:** Prioritised, routed complaint with SLA.
**Evidence:** Classification fields · routing log · SLA indicator.
**If it doesn't appear:** Show the Triage History Card + Conduct Classification Card.

---

#### Step 43 — DEMO-MCS-005 · Conduct Analytics & Alerts
**Purpose:** Prove pattern-detection analytics with a live alert.
**Login as:** Conduct Supervisor.
**Go to:** Conduct → **Analytics Dashboard**.
**Action:** Show complaint spikes / product-specific patterns; open an alert.
**Values:** Alert: "Disclosure complaints against Caribbean Trust Bank increased 40 % vs prior quarter."
**Presenter script:** "The analytics catch patterns before they become crises."
**Expected result:** Alert visible.
**Evidence:** Analytics dashboards · alert record.
**If it doesn't appear (Partial):** Show the dashboard chart and narrate.

---

#### Step 44 — DEMO-MCS-006 · Thematic Review Initiation
**Purpose:** Prove a thematic review can be scoped and assigned.
**Login as:** Conduct Supervisor.
**Go to:** Conduct → **Thematic Reviews** → **New**.
**Action:** Define scope (entities, products, timeframe); assign the team.
**Values:** Scope: All deposit-taking entities · Product: Retail deposits · Timeframe: last 12 months. Team: Conduct Team A.
**Presenter script:** "One complaint becomes a pattern; the pattern becomes a thematic review."
**Expected result:** Thematic review record.
**Evidence:** Scope configuration · assignment log.
**If it doesn't appear (Partial):** Use the Coordination / Escalation module and narrate.

---

#### Step 45 — DEMO-MCS-007 · Investigation & Evidence Management
**Purpose:** Prove escalation from complaint / thematic to investigation with restricted evidence.
**Login as:** Conduct Supervisor → Investigator.
**Go to:** Complaint → **Escalate to Investigation**.
**Action:** Escalate; upload evidence with restricted access; show a denied-access attempt.
**Values:** Evidence: `customer_recordings.zip`. Access: Investigators only.
**Presenter script:** "Investigations are treated as legal evidence — controlled access, full audit."
**Expected result:** Investigation record; evidence secured; denial logged.
**Evidence:** Complaint Investigation Tab · evidence list · denied-access log.
**If it doesn't appear:** Show the Investigation Tab.

---

#### Step 46 — DEMO-MCS-008 · Supervisory Actions & Outcomes
**Purpose:** Prove actions and outcomes with notifications.
**Login as:** Conduct Supervisor.
**Go to:** Investigation → **Actions**.
**Action:** Issue action, record outcome, send notification.
**Values:** Action: "Update customer disclosure wording within 30 days." Outcome: "Undertaking accepted." Notify: Entity + Conduct Director.
**Presenter script:** "Every action ends with a documented outcome and a message on record."
**Expected result:** Action + outcome logged; notification logged.
**Evidence:** Action records · notification logs.
**If it doesn't appear:** Show correspondence dialog.

---

#### Step 47 — DEMO-MCS-009 · Ongoing Conduct Monitoring Rules
**Purpose:** Prove ongoing monitoring rules with active execution.
**Login as:** Admin / Conduct Supervisor.
**Go to:** Admin → **Conduct Monitoring Rules**.
**Action:** Show rules (repeat complaints post-remediation, product concentration, relapse thresholds); show execution log with timestamp.
**Values:** Rule: "Repeat complaint from same customer within 90 days of remediation → auto-escalation."
**Presenter script:** "Supervision doesn't stop when the action closes — the rules keep watching."
**Expected result:** Rule active · execution timestamp visible.
**Evidence:** Monitoring config · execution logs.
**If it doesn't appear (Partial):** Show the rule list and the audit and narrate.

---

#### Step 48 — DEMO-MCS-010 · Oversight Dashboards & Feedback Loop
**Purpose:** Prove closed-loop supervision — trend → case → action.
**Login as:** Conduct Supervisor.
**Go to:** Conduct → **Oversight Dashboard**.
**Action:** Open a trend widget; drill into underlying complaints; drill into supervisory actions taken.
**Values:** Trend: Disclosure complaints last 6 months.
**Presenter script:** "From a headline number we drill into the cases and the actions — nothing is a dead end."
**Expected result:** Drill-down chain works end-to-end.
**Evidence:** Dashboard widgets · drill-down · linked records.
**If it doesn't appear:** Use the reports module with filters.

---

### ACT 5 — Dashboards, Reporting & Auditability (Script 5)

---

#### Step 49 — DEMO-DPA-001 · Cross-Module Supervisory Dashboard
**Purpose:** Prove one dashboard aggregates Licensing, F&P, Prudential, Conduct.
**Login as:** Executive / Supervisor.
**Go to:** **Supervisory Dashboard**.
**Action:** Explain widgets; drill into one metric from each module.
**Values:** Metrics: application volumes, F&P active assessments, prudential breaches, complaint volumes, SLA breaches.
**Presenter script:** "One page, four regulatory disciplines — with drill-downs to the underlying records."
**Expected result:** Unified dashboard; drill-downs land on real records.
**Evidence:** Dashboard widgets · drill-down navigation.
**If it doesn't appear:** Show the supervisory metrics hook / cards.

---

#### Step 50 — DEMO-DPA-002 · Role-Specific Dashboards
**Purpose:** Prove role-based dashboard content and permissions.
**Login as:** Executive → then Operational Supervisor → then Licensee.
**Go to:** Dashboard.
**Action:** Log in as each role and compare.
**Values:** —
**Presenter script:** "What you see is what you're entitled to see. The dashboard changes with the role."
**Expected result:** Different dashboards per role.
**Evidence:** Side-by-side dashboards.
**If it doesn't appear:** Show the licensee dashboard vs supervisory dashboard.

---

#### Step 51 — DEMO-DPA-003 · Operational Reports (Cross-Script)
**Purpose:** Prove pre-defined reports across the four disciplines with filters.
**Login as:** Supervisor / Admin.
**Go to:** **Reports** module.
**Action:** Run reports: Licensing throughput · F&P SLAs · Prudential return compliance · Complaint volumes. Apply filters (time, entity type, risk).
**Values:** Time = Last 90 days · Entity type = Banking · Risk = Medium+.
**Presenter script:** "The operational reports are ready to run — filter by time, entity, or risk."
**Expected result:** Live reports.
**Evidence:** Report outputs · filter criteria.
**If it doesn't appear:** Show the reporting registry / recharts templates.

---

#### Step 52 — DEMO-DPA-004 · Ad-Hoc & Exportable Reporting
**Purpose:** Prove ad-hoc reporting and audited export.
**Login as:** Supervisor / Admin.
**Go to:** Reports → **New Ad-hoc**.
**Action:** Build an ad-hoc report; export CSV / PDF; open the export log.
**Values:** Report: "All conditional clearances by regulator, last 6 months." Export: CSV.
**Presenter script:** "Ad-hoc doesn't mean unaudited — every export is logged."
**Expected result:** Export downloads; export entry appears in the audit log.
**Evidence:** Export file · audit entry.
**If it doesn't appear:** Show the export audit log.

---

#### Step 53 — DEMO-DPA-005 · Case-Centric Audit (Licensing → Fit & Proper)
**Purpose:** Prove full chronological audit of one licence, including F&P.
**Login as:** Admin / Supervisor.
**Go to:** Application → **Audit / History**.
**Action:** Filter by the case ID; scroll through draft creation → submission → review → F&P → decision → appeal.
**Values:** Case: Caribbean Trust Bank application.
**Presenter script:** "One case, one story, timestamped from start to finish."
**Expected result:** Full audit trail.
**Evidence:** Audit log with timestamps, users, actions.
**If it doesn't appear:** Use the History Button on the case.

---

#### Step 54 — DEMO-DPA-006 · Supervisory & Enforcement Audit
**Purpose:** Prove the same audit framework covers prudential and conduct actions.
**Login as:** Admin / Supervisor.
**Go to:** Prudential action → **History**; Conduct investigation → **History**.
**Action:** Open the audit for one action from each side.
**Values:** —
**Presenter script:** "The same audit framework covers enforcement — one standard across the platform."
**Expected result:** Enforcement audit entries with timestamps and users.
**Evidence:** Audit entries for actions and outcomes.
**If it doesn't appear:** Use the notifications log + audit trail.

---

#### Step 55 — DEMO-DPA-007 · Data Lineage & Version History
**Purpose:** Prove version history and before/after comparison.
**Login as:** Admin.
**Go to:** Any application / return / complaint → **Version History**.
**Action:** Open the version comparison view.
**Values:** —
**Presenter script:** "We can always show what changed, when, and by whom."
**Expected result:** Before/after diff visible.
**Evidence:** Diff Viewer.
**If it doesn't appear:** Show the Change History Drawer.

---

#### Step 56 — DEMO-DPA-008 · Overrides & Justifications
**Purpose:** Prove overrides require justification and are audited.
**Login as:** Admin / Supervisor.
**Go to:** Any rule-driven screen → **Override**.
**Action:** Trigger an override; enter mandatory justification; save.
**Values:** Override: "Waive late-fee for FY-25 return." Justification: "System outage during submission window."
**Presenter script:** "Discretion is allowed — but never quiet. Every override needs a reason and lands in the audit."
**Expected result:** Override recorded with justification.
**Evidence:** Override Justification Dialog · audit entry.
**If it doesn't appear:** Show the Override Reason Dialog.

---

#### Step 57 — DEMO-DPA-009 · Integration Logs & Security Events
**Purpose:** Prove integration + security event logging.
**Login as:** Admin.
**Go to:** Admin → **Integration Logs**; **Security Events**.
**Action:** Show inbound/outbound integration entries; show failed access / denied permission events.
**Values:** —
**Presenter script:** "The platform's plumbing is transparent — integrations and security events are traceable."
**Expected result:** Logs populated; failures traceable.
**Evidence:** Integration logs · security event logs.
**If it doesn't appear (Partial):** Show the notifications + audit logs and narrate integrations as planned.

---

## 4. Spreadsheet Coverage Matrix

Every row of every uploaded script is listed below.

| # | Script | Feature / Action | Evaluation Intent | Expected Output | Evidence Required | Step | Screen / Page | Status | Presenter notes |
|---|---|---|---|---|---|---|---|---|---|
| DEMO-ULRA-001 | S1 Licensing | Applicant entry & draft creation | Confirm draft lifecycle exists and is auditable | Draft record with status & timestamp | Draft record; audit entry | 1 | Applicant Portal → Applications | Covered | Show log-out / log-in cycle |
| DEMO-ULRA-002 | S1 Licensing | Dynamic forms, validation & attachments | Prove forms are configurable | Dynamic fields; validation; document versions | Config screens; validation msg; version history | 2 | Application form + Form Builder | Covered | Batch upload works |
| DEMO-ULRA-003 | S1 Licensing | Submission & acknowledgement | Prove formal submission & traceability | Status Submitted; reference ID; acknowledgement | Acknowledgement; queue entry | 3 | Review & Submit | Covered | — |
| DEMO-ULRA-004 | S1 Licensing | Officer intake & queue visibility | Prove operational realism | Queue with metadata | Queue screen | 4 | Applications Queue | Covered | Sort by SLA age |
| DEMO-ULRA-005 | S1 Licensing | Sufficiency, SLA & RFI | Defensible intake & timing control | RFI logged; SLA paused/resumed; alerts | RFI record; SLA timer; audit | 5 | Application → Sufficiency | Covered | — |
| DEMO-ULRA-006 | S1 Licensing | Automated analyst review & routing | Prove automation-first review | Routing logged; findings timestamped; overrides logged | Routing audit; analyst notes | 6 | Application → Analyst | Partial | AI-suggested findings planned |
| DEMO-ULRA-007 | S1 Licensing | Legal / Compliance review | Prove legal defensibility | Legal review recorded; access restricted | Legal notes; denied access | 7 | Application → Legal | Covered | Trigger denied access |
| DEMO-ULRA-008 | S1 Licensing | Decision-ready consolidated view | Decision defensibility | Full case in one view | Consolidated screen | 8 | Application detail | Covered | — |
| DEMO-ULRA-009 | S1 Licensing | Decision, issuance & notifications | End-to-end accountability | Decision; signed artifact; notifications | Signed artifact; notification log | 9 | Application → Decision | Partial | Signing panel is a separate step |
| DEMO-ULRA-010 | S1 Licensing | Renewal, revocation, bulk & audit | Supervisory confidence | Statuses updated; batch visible; audit complete | Audit trail | 10 | Licences module | Covered | — |
| DEMO-ULRA-011 | S1 Licensing | Licensing → Supervision continuity | Prove supervision starts at licensing | Supervisory plan created; corrective actions | Audit; plan; tracker | 11 | Application → Handover / Licensee profile | Partial | Auto-seed of supervisory plan planned |
| DEMO-ULRA-012 | S1 Licensing | Twin Peaks interdependencies & divergent view | Make Twin Peaks explicit | Interdependency flags; conditional clearance | Coordination screen; clearance record | 12 | Case → Twin Peaks | Covered | Use Twin Peaks Clearance panel |
| DEMO-FPA-001 | S2 F&P | Multiple initiation paths | Operational flexibility | 4 initiation records | Initiation logs | 13 | F&P → Individuals → DEMO-FPA-001 | Covered | See DEMO-FPA-001 verification |
| DEMO-FPA-002 | S2 F&P | Single individual + multiple roles | No duplication | 1 profile, many roles | Profile; linkage audit | 14 | Individuals register | Covered | Uniqueness enforced |
| DEMO-FPA-003 | S2 F&P | Subject profile & access control | Defensible access | Denial logged | Access-denied log | 15 | Individual profile | Covered | — |
| DEMO-FPA-004 | S2 F&P | Declarations & notifications | Transparency | Declarations + notifications | Declaration audit; notification log | 16 | PQ | Covered | — |
| DEMO-FPA-005 | S2 F&P | Screening config & automated checks | Configurability | Screening results with confidence | Config; results | 17 | Screening panel | Partial | Auto adverse-media scoring planned |
| DEMO-FPA-006 | S2 F&P | Manual screening & evidence | Completeness of checks | Manual result + evidence linked | Task record; attachment | 18 | Screening panel | Covered | — |
| DEMO-FPA-007 | S2 F&P | Adverse findings & severity | Risk-based supervision | Severity + routing | Severity log; routing | 19 | Findings | Covered | — |
| DEMO-FPA-008 | S2 F&P | Historic comparison & trends | Supervisory insight over time | Comparison + trends | Comparison; charts | 20 | History / Trends | Partial | Population trend chart is planned |
| DEMO-FPA-009 | S2 F&P | AI-assisted analysis + human override | AI supports, doesn't replace | AI outputs + override captured | AI logs; sources | 21 | AI Analysis panel | Partial | AI panel is planned; show manual findings |
| DEMO-FPA-010 | S2 F&P | Sector-specific decision logic | Context-aware decisions | Rules per sector | Sector rules; rendered assessment | 22 | Admin → FP Sector Rules | Covered | — |
| DEMO-FPA-011 | S2 F&P | Multi-regulator determinations | Regulatory segregation | Independent determinations | Records; access logs | 23 | Regulator switcher | Covered | — |
| DEMO-FPA-012 | S2 F&P | Committee review & weighted voting | Governance realism | Weighted outcome | Vote records | 24 | Determinations panel | Partial | Weighted voting planned; show rationale |
| DEMO-FPA-013 | S2 F&P | Conditional determination & SLA breach | Enforceability | Condition + breach | Condition record; breach log | 25 | Conditions panel | Covered | — |
| DEMO-FPA-014 | S2 F&P | Appeals (standalone & linked) | Legal defensibility | Appeal resolved; licence updated | Appeal record; licence audit | 26 | Appeals panel | Covered | — |
| DEMO-FPA-015 | S2 F&P | Monitoring, notifications & audit | Supervisory confidence | Scheduler + notifications + audit | Scheduler; audit | 27 | Monitoring panel | Covered | — |
| DEMO-PRUD-001 | S3 Prudential | Supervisory universe & risk taxonomy | Configurable, risk-based | Universe + taxonomy | Register; taxonomy | 28 | Prudential register; Admin taxonomy | Covered | — |
| DEMO-PRUD-002 | S3 Prudential | Baseline data & historical context | Longitudinal supervision | History visible | Historical views | 29 | Entity profile → History | Covered | — |
| DEMO-PRUD-003 | S3 Prudential | Return submission (entity) | Data quality + usability | Return submitted; validation shown | Validation; return record | 30 | Licensee Portal → Returns | Covered | — |
| DEMO-PRUD-004 | S3 Prudential | Intake, validation & versioning (supervisor) | Defensible intake | Validated + versioned | Intake; version history; audit | 31 | Returns intake queue | Covered | — |
| DEMO-PRUD-005 | S3 Prudential | Ratio calculation & threshold breach | Analytical rigor | Ratios + breach flag | Ratio card; threshold config | 32 | Return → Analytics | Covered | — |
| DEMO-PRUD-006 | S3 Prudential | Peer comparison & trends | Population-level insight | Peer & trend views | Charts | 33 | Peer Comparison / Trends | Partial | Peer view planned; show trend chart |
| DEMO-PRUD-007 | S3 Prudential | Supervisory assessment & risk scoring | Judgment transparency | Assessment + score | Record; rationale | 34 | Entity → Assessment | Covered | — |
| DEMO-PRUD-008 | S3 Prudential | Supervisory actions & escalation | Enforcement readiness | Action + escalation | Action; routing | 35 | Assessment → Actions | Covered | — |
| DEMO-PRUD-009 | S3 Prudential | Notifications & entity communication | Transparency | Notifications + ack | Notifications; ack status | 36 | Action → Notifications | Covered | — |
| DEMO-PRUD-010 | S3 Prudential | Ongoing monitoring & stress indicators | Proactive supervision | Rule active + warning | Rules; warning log | 37 | Monitoring Config | Partial | Show validation & ratios panel |
| DEMO-PRUD-011 | S3 Prudential | Dashboards, integrations & audit | Oversight & future-proofing | End-to-end trace | Dashboards; logs; audit | 38 | Dashboards; Integration logs; Audit | Partial | Integration logs planned |
| DEMO-MCS-001 | S4 Conduct | Conduct scope & risk taxonomy | Structured & configurable | Taxonomy visible | Config screens | 39 | Admin → Conduct config | Covered | — |
| DEMO-MCS-002 | S4 Conduct | Supervisory universe & historical context | Longitudinal | History visible | Historical records | 40 | Entity conduct profile | Covered | — |
| DEMO-MCS-003 | S4 Conduct | Complaint intake (external & internal) | Accessibility + data quality | Records + acknowledgements | Records; acks | 41 | Public + Internal complaint entry | Covered | — |
| DEMO-MCS-004 | S4 Conduct | Classification, triage & prioritisation | Risk-based triage | Prioritised + routed | Classification; routing; SLA | 42 | Complaint → Triage | Covered | — |
| DEMO-MCS-005 | S4 Conduct | Conduct analytics & alerts | Proactive detection | Alert generated | Dashboards; alert record | 43 | Conduct analytics | Partial | Alert generation planned; show chart |
| DEMO-MCS-006 | S4 Conduct | Thematic review initiation | Supervisory scalability | Review record | Scope; assignment log | 44 | Thematic reviews | Partial | Use coordination workflow as substitute |
| DEMO-MCS-007 | S4 Conduct | Investigation & evidence management | Legal defensibility | Investigation + secure evidence | Evidence; denial logs | 45 | Complaint → Investigation | Covered | — |
| DEMO-MCS-008 | S4 Conduct | Supervisory actions & outcomes | Enforcement readiness | Action + outcome + notifications | Records; notifications | 46 | Investigation → Actions | Covered | — |
| DEMO-MCS-009 | S4 Conduct | Ongoing conduct monitoring rules | Continuous supervision | Rules active + executed | Config; execution logs | 47 | Admin → Conduct rules | Partial | Show rules; narrate execution |
| DEMO-MCS-010 | S4 Conduct | Oversight dashboards & feedback loop | Closed-loop supervision | Drill-down works | Widgets; drill-down | 48 | Conduct dashboard | Covered | — |
| DEMO-DPA-001 | S5 Dashboards | Cross-module supervisory dashboard | Single supervisory view | Unified dashboard + drill-downs | Widgets; drill-downs | 49 | Supervisory Dashboard | Covered | — |
| DEMO-DPA-002 | S5 Dashboards | Role-specific dashboards | Least privilege + relevance | Content differs by role | Role comparison | 50 | Dashboard per role | Covered | — |
| DEMO-DPA-003 | S5 Reporting | Operational reports (cross-script) | Operational control | Live reports | Report outputs; filters | 51 | Reports | Covered | — |
| DEMO-DPA-004 | S5 Reporting | Ad-hoc & exportable reporting | Transparency & governance | Export + audit | Export; audit entry | 52 | Reports → Ad-hoc | Covered | — |
| DEMO-DPA-005 | S5 Audit | Case-centric audit (Licensing → F&P) | Legal defensibility | Full chronological trail | Audit log | 53 | Application → Audit | Covered | — |
| DEMO-DPA-006 | S5 Audit | Supervisory & enforcement audit | Accountability & transparency | Enforcement auditable | Audit entries | 54 | Prudential/Conduct action → Audit | Covered | — |
| DEMO-DPA-007 | S5 Lineage | Data lineage & version history | Explainability | Changes visible & timestamped | Diff viewer | 55 | Any record → Version history | Covered | — |
| DEMO-DPA-008 | S5 Lineage | Overrides & justifications | Discretion control | Override + justification logged | Override record; audit | 56 | Any rule → Override | Covered | — |
| DEMO-DPA-009 | S5 Integration/Security | Integration logs & security events | Platform trust | Logs; failures traceable | Integration + security logs | 57 | Admin → Logs | Partial | Show audit + notification log as substitute |

Row count: 57 — matches the total number of source spreadsheet demo rows (Script 1: 12, Script 2: 15, Script 3: 11, Script 4: 10, Script 5: 9).

---

## 5. Suggested Demo Data

### Applicant
- Applicant Name: **Caribbean Trust Bank Ltd**
- Contact Person: **Maria James**
- Email: **maria.james@example.com**
- Phone: **+1 869 555 0101**
- Address: **Basseterre, St. Kitts**

### License Application
- License Type: **Banking License**
- Application Category: **New License**
- Business Activity: **Deposit taking and lending**
- Risk Rating: **Medium**
- Ownership Structure: **3 shareholders**
- Submitted Documents:
  - Certificate of Incorporation
  - Business Plan
  - AML/CFT Policy
  - Financial Projections
  - Fit & Proper Declarations

### RFI
- RFI Summary: **Missing ownership chart and AML policy clarification**
- Item 1: **Upload ownership structure chart**
- Item 2: **Clarify AML compliance officer appointment**
- Due Date: **7 days from today**
- Required: **Yes**

### Fit & Proper
- Individual: **Jonathan Williams**
- Role: **Chief Executive Officer**
- Nationality: **St. Kitts and Nevis**
- Assessment Type: **Initial / New License**
- Screening Result: **PEP check clear, adverse media review required**
- Determination: **Conditional approval**

### Prudential
- Finding: **Governance weakness in board risk oversight**
- Severity: **Medium**
- Recommendation: **Submit board risk committee terms of reference**
- Conditional Position: **Prudential clearance subject to governance remediation**

### Market Conduct
- Finding: **Disclosure wording in customer terms is unclear**
- Severity: **Medium**
- Recommendation: **Update customer disclosure wording**
- Conditional Position: **Conduct clearance subject to disclosure remediation**

### Twin Peaks Coordination
- Case Title: **Joint review of Caribbean Trust Bank application**
- Interdependency Flag: **Prudential governance weakness may affect conduct risk**
- Discussion Message: **Conduct team requests remediation before final clearance**
- Resolution: **Prudential clearance subject to conduct remediation**
- Escalation Outcome: **Conditionally cleared**

### Audit / Reporting
- Report Name: **Licensing Decision Report**
- Export Type: **PDF / CSV**
- Audit Evidence: application status change, RFI raised, RFI response, clearance decision, final approval.

---

## 6. Presenter Script (spoken)

**Opening (2 minutes):**
> "Good morning. Today we'll walk end-to-end through the Unified License Hub — from an applicant clicking 'Start New Application', through the internal review, Fit & Proper on the CEO, prudential and conduct supervision, Twin Peaks coordination, the final licensing decision, and everything that supervision needs afterwards: dashboards, reports, and a full audit trail. You'll see one story about one applicant — Caribbean Trust Bank Ltd — across every regulatory function."

**Transition to Licensing (Script 1):**
> "Let's start where every regulator starts — the front door. I'll log in as an applicant and take a licence application from a saved draft all the way to a signed decision. Along the way you'll see dynamic forms, sufficiency checks, SLAs, RFIs, analyst and legal review, the consolidated decision view, digital issuance, notifications, renewals, revocations, bulk intake, and the audit trail."

**Transition to F&P (Script 2):**
> "Licensing isn't just about the entity — it's about the people running it. Meet Jonathan Williams, proposed CEO. I'll show four ways F&P can start, one unique individual with many roles, declarations, screening, adverse findings, sector-specific rules, multi-regulator determinations, committee governance, conditional determinations, appeals, and ongoing monitoring."

**Transition to Prudential (Script 3):**
> "Once the licence is issued, supervision begins. Prudential focuses on capital, liquidity, and governance. I'll show the supervisory universe, how returns come in and get validated, ratios and threshold breaches, peer comparison, supervisory assessments, actions and escalation, notifications, ongoing monitoring, dashboards, and end-to-end audit."

**Transition to Market Conduct (Script 4):**
> "Twin Peaks means conduct sits alongside prudential. I'll show conduct scope, how complaints come in from the public and internally, classification and triage, analytics that spot patterns, thematic reviews, investigations with restricted evidence, supervisory actions, ongoing conduct monitoring, and closed-loop oversight dashboards."

**Transition to Dashboards / Audit (Script 5):**
> "Finally, the layer that ties it all together — cross-module dashboards, role-specific views, operational and ad-hoc reports with audited exports, case-centric audits, enforcement audits, version history, override justifications, and integration/security logs."

**Closing:**
> "What you've just seen is not four systems, it's one platform that supports the full regulatory lifecycle — with the audit trail to defend every decision. Thank you — we'll take your questions now."

---

## 7. Timing Plan (45 minutes)

| Time | Segment | Steps covered |
|---|---|---|
| 0:00 – 0:05 | Opening + dashboard tour | Intro · Step 49 · Step 50 |
| 0:05 – 0:13 | Applicant submits + intake + RFI | Steps 1–5 |
| 0:13 – 0:20 | Analyst + Legal + Decision + Renewal/Revocation + Continuity | Steps 6–11 |
| 0:20 – 0:23 | Twin Peaks coordination (first pass) | Step 12 |
| 0:23 – 0:30 | Fit & Proper (initiation → screening → determination → appeals) | Steps 13–27 (highlights) |
| 0:30 – 0:36 | Prudential (returns → ratios → assessment → action → monitoring) | Steps 28–38 (highlights) |
| 0:36 – 0:41 | Market Conduct (complaint → triage → investigation → action → oversight) | Steps 39–48 (highlights) |
| 0:41 – 0:45 | Reports + audit + version + override + integration logs + Closing | Steps 51–57 |

Extend to 60 minutes by walking every F&P / Prudential / Conduct step in full rather than in highlights.

---

## 8. Presenter Checklist (run 15 minutes before the demo)

- [ ] All 12 role accounts log in successfully
- [ ] Caribbean Trust Bank application record exists and is in the right status
- [ ] Jonathan Williams (DEMO-FPA-001) exists with at least one linked role
- [ ] At least one prudential return is submitted with a value that will trigger a breach
- [ ] At least one complaint exists against Caribbean Trust Bank
- [ ] Twin Peaks coordination panel opens on the case
- [ ] Reports load and export completes for a CSV
- [ ] Audit / History tab opens on at least one application and one prudential action
- [ ] Backup screenshots of every act saved locally in case of internet failure
- [ ] Fallback wording (section 1.7) rehearsed for partial features
- [ ] Browser zoom at 100 %, bookmarks bar hidden, notifications silenced

---

## 9. Feature Gap Notes (plain-English)

| Feature | What can be shown now | What is partial | Explain as | Evidence to still show |
|---|---|---|---|---|
| Automated / AI-assisted analyst findings (ULRA-006) | Manual analyst findings + routing + audit | AI pre-population of findings | Planned in next iteration | Analyst notes + audit trail |
| Digitally-signed licence certificate (ULRA-009) | Generated licence PDF + separate Sign Certificate panel | In-line signing on issuance | Two-step signing is by design; single-click is planned | Signed artifact + audit |
| Auto-seeded supervisory plan on issuance (ULRA-011) | Manual creation of the supervisory profile + licensing audit trail | Automatic hand-over | Planned | Handover section + audit |
| Automated adverse-media screening scoring (FPA-005) | Manual screening panel + configurable screening types | Match-confidence auto-scoring | Planned | Screening results + config |
| Population trend view for F&P (FPA-008) | Historical assessments list per individual | Cross-population dashboard | Planned | Assessments list ordered by date |
| AI panel in F&P (FPA-009) | Document extraction + manual findings | AI synthesis + citations panel | Planned | Extraction panel + findings |
| Weighted committee voting (FPA-012) | Determinations panel + rationale + status transitions | Vote-weight configuration + auto-tally | Planned | Determinations + rationale |
| Peer-comparison chart (PRUD-006) | Trend chart on supervisory dashboard | Side-by-side peer view | Planned | Trend chart |
| Early warning rules (PRUD-010) | Validation & Ratios Panel showing breaches | Configurable early-warning engine | Planned | Validation panel |
| Integration logs (PRUD-011 / DPA-009) | Notification log + audit trail | Dedicated integration console | Planned | Audit + notifications |
| Automated conduct alerts (MCS-005) | Analytics dashboard + trend chart | Auto-alert generation | Planned | Dashboard chart |
| Thematic review module (MCS-006) | Coordination / Escalation module for grouped cases | Dedicated thematic-review workflow | Planned | Coordination view |
| Continuous monitoring rule execution log (MCS-009) | Rule list + audit trail | Timestamped execution log | Planned | Rule list + audit |

---

*End of guide — all 57 spreadsheet demo IDs are covered.*
