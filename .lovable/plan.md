
# BOJ/FSCA Demo Scripts 1–5 — Gap Analysis & Phased Build Plan

Scope: make every scenario in Scripts 1–5 fully functional against the existing Unified License Hub (not demo-only). This plan maps each scenario to what already exists, what needs to be extended, and what must be built from scratch, then orders the work.

Nothing is implemented yet. Once approved, we execute phase-by-phase, each phase ending in a runnable increment.

---

## 0. Legend

- ✅ **Exists** — already implemented; only wiring/UX polish needed
- 🟡 **Partial** — core exists; missing capability listed
- 🔴 **Build** — must be built from scratch
- Each scenario ID matches the uploaded scripts (`DEMO-ULRA-###`, `DEMO-FPA-###`, `DEMO-PRUD-###`, `DEMO-MCS-###`, `DEMO-DPA-###`)

---

## 1. Script 1 — Unified Licensing, Registration & Approval

| ID | Scenario | Status | Gap / Work |
|----|----------|--------|-----------|
| ULRA-001 | Applicant draft creation, resume | ✅ | Confirm resume-draft dashboard tile visible for all license types. |
| ULRA-002 | Dynamic forms, validation, batch upload, doc versioning | 🟡 | Batch/multi-file upload with per-file metadata (add batch-mode to VersionedDocumentUploader). |
| ULRA-003 | Submission, reference no., acknowledgement (portal + email) | ✅ | Add explicit "Acknowledgement" artifact (PDF receipt) to notification. |
| ULRA-004 | Officer intake queue with status, owner, SLA age, priority | 🟡 | Add SLA-age column + priority sort to Applications list; owner filter. |
| ULRA-005 | Sufficiency review, SLA timer, RFI with pause/resume, near-due alerts | 🔴 | **New RFI subsystem**: `application_rfis` table, RFI dialog, SLA pause/resume RPC, applicant response UI, "near-due" cron. Auto-sufficiency rules engine. |
| ULRA-006 | Analyst review + AI-assisted findings, override + explanations | 🟡 | Reuse `application_ai_assessments`; add "generate assessment" button on analyst step, override + rationale capture, explanation panel. |
| ULRA-007 | Legal/compliance review with restricted access | ✅ | `application_legal_notes` + role-gated tab already exist; verify denied-access audit entry. |
| ULRA-008 | Decision-ready consolidated case view | 🟡 | New "Consolidated Case" tab on ApplicationDetail: applicant + docs + analyst + legal + RFIs + SLA + AI assessment. |
| ULRA-009 | Decision (approve/conditional/reject) + digitally signed license + notifications; configurable per assessment | 🟡 | Add "Conditional approval" outcome with condition capture; wire digital-signature stamp on issued license PDF. |
| ULRA-010 | Renewal, revocation with justification, bulk intake (5–10), audit | 🟡 | Bulk intake screen (CSV upload → staged applications). Renewal/revocation exist. |
| ULRA-011 | Licensing → Supervision continuity: auto initial supervisory plan + time-bound corrective actions | 🔴 | **New supervisory-plan generator**: on approve, create `supervisory_plans` row + `supervisory_plan_actions` from licensing risk profile. |
| ULRA-012 | Twin Peaks: prudential/conduct interdependency, coordination space, conditional clearance | 🔴 | **New coordination workspace**: shared discussion thread across regulators, interdependency flag table, conditional-clearance record. |

---

## 2. Script 2 — Fit & Proper Assessment

Existing platform has **no Fit & Proper module**. This is the largest new domain.

| ID | Scenario | Status | Gap / Work |
|----|----------|--------|-----------|
| FPA-001 | Four initiation paths (new license / monitoring / ad-hoc / cycle) | 🔴 | New `fp_assessments` entity with `initiation_type` enum + trigger surfaces on License, Licensee, and Cron. |
| FPA-002 | Single individual + multiple roles across entities (unique ID, no duplicates) | 🔴 | `fp_individuals` table with system-generated unique ID; `fp_individual_roles` join to entities; cumulative-influence view. |
| FPA-003 | Subject profile + access control with denial audit | 🔴 | Profile page + role-scoped RLS; denial writes to `security_event_logs`. |
| FPA-004 | Declarations + assessor notifications | 🔴 | Declarations form (via existing FormRenderer) + `notification_event_configs` entries `fp.declaration.*`. |
| FPA-005 | Configurable automated screening + adverse-media, match-confidence, false-positive resolution | 🔴 | `fp_screening_configs`, `fp_screening_runs`, edge fn `run-fp-screening` (initial rules-based; adverse-media via Lovable AI). |
| FPA-006 | Manual screening + evidence attachment | 🔴 | Manual-task type in `fp_screening_runs`; VersionedDocumentUploader for evidence. |
| FPA-007 | Adverse findings, severity, high-severity escalation | 🔴 | `fp_findings` table with severity enum; escalation rules reuse `sla_escalation_tiers`. |
| FPA-008 | Historic comparison + individual/population trends | 🔴 | Comparison view + trends chart from `fp_assessments` history. |
| FPA-009 | AI-assisted analysis + human override with audit | 🔴 | Edge fn `generate-fp-ai-analysis` (Lovable AI gateway); override captured on assessment. |
| FPA-010 | Sector-specific decision logic | 🔴 | `fp_decision_rules` keyed by sector; rendered via decision-rule engine. |
| FPA-011 | Multi-regulator determinations on the same profile | 🔴 | `fp_determinations` scoped by `regulator_id`; independent workflows per regulator. |
| FPA-012 | Committee review with weighted voting | 🔴 | `fp_committees`, `fp_committee_votes` (weight, rationale); outcome tally RPC. |
| FPA-013 | Conditional determination + condition lifecycle + SLA breach | 🔴 | `fp_conditions` with reminders (cron) + breach log. |
| FPA-014 | Appeals (standalone + linked to license) | 🔴 | `fp_appeals` table; reflect outcome on linked license. |
| FPA-015 | Monitoring scheduler + event-triggered reassessment + audit | 🔴 | pg_cron entry + event triggers writing to `compliance_audit_logs`. |

---

## 3. Script 3 — Prudential Supervision

Substantial base exists (`returns_filed`, `prudential_ratios`, `prudential_thresholds`, `return_calculated_ratios`, `return_threshold_breaches`, `supervisory_plans`, `enforcement_actions`).

| ID | Scenario | Status | Gap / Work |
|----|----------|--------|-----------|
| PRUD-001 | Supervisory universe + configurable risk taxonomy | 🟡 | New `risk_taxonomy` config UI (categories/sub-risks) — reuse `master_data_types`. |
| PRUD-002 | Baseline + historical prudential profile | 🟡 | New "Prudential Profile" tab on Licensee showing prior returns/ratios/assessments/enforcement. |
| PRUD-003 | Entity submits return + validation | ✅ | Existing `returns_filed` + FormRenderer + validation rules. |
| PRUD-004 | Supervisor intake, validation, version history | 🟡 | Version-history view on `return_form_versions`; add "validation results" panel. |
| PRUD-005 | Ratio calc + threshold breach flag | ✅ | Already implemented via `evaluate-return-prudential`; confirm breach UI. |
| PRUD-006 | Peer comparison + trend | 🔴 | Peer-comparison query + trend chart; new "Peer Analytics" page. |
| PRUD-007 | Supervisory assessment + risk score + rationale | 🟡 | New `supervisory_assessments` table + form on Licensee/Return; risk score to `risk_ratings`. |
| PRUD-008 | Supervisory actions + escalation | 🟡 | Extend `supervisory_plan_actions` with escalation routing → reuses SLA tiers. |
| PRUD-009 | Notifications + acknowledgements | ✅ | `dispatchNotificationEvent`; add "acknowledged_at" to `notification_dispatch_log`. |
| PRUD-010 | Ongoing monitoring + early-warning indicators | 🟡 | New cron `prudential-early-warning-sweep` scanning trends against thresholds. |
| PRUD-011 | Dashboards + integration logs + end-to-end audit | 🟡 | Prudential dashboard widgets; integration-log table for outbound feeds. |

---

## 4. Script 4 — Market Conduct Supervision

Complaints module exists; conduct-specific analytics do not.

| ID | Scenario | Status | Gap / Work |
|----|----------|--------|-----------|
| MCS-001 | Conduct risk taxonomy | 🔴 | `mc_risk_taxonomy` config (mis-selling, unfair treatment, etc.). |
| MCS-002 | Historical conduct context | 🟡 | Conduct-history tab on entity/product. |
| MCS-003 | Complaint intake (consumer portal + regulator) | ✅ | Complaints module exists; add public consumer intake page. |
| MCS-004 | Classification + prioritization + routing | 🟡 | Auto-priority rules + auto-routing on complaint create. |
| MCS-005 | Conduct analytics + alerts (spike detection) | 🔴 | Analytics edge fn + `mc_alerts` table + alert dashboard. |
| MCS-006 | Thematic review initiation | 🔴 | `mc_thematic_reviews` table (scope, entities, timeframe, assignee). |
| MCS-007 | Investigation + evidence + restricted access | 🟡 | Extend `enforcement_actions` with investigation subtype + evidence via document_groups. |
| MCS-008 | Actions + outcomes + notifications | ✅ | Reuse enforcement + notification pipeline. |
| MCS-009 | Ongoing monitoring rules (relapse thresholds) | 🔴 | `mc_monitoring_rules` engine + cron. |
| MCS-010 | Oversight dashboard with drill-down | 🔴 | Conduct dashboard with drill from trend → cases → actions. |

---

## 5. Script 5 — Dashboards, Reporting, Auditability (cross-cutting)

| ID | Scenario | Status | Gap / Work |
|----|----------|--------|-----------|
| DPA-001 | Cross-module supervisory dashboard + AI-driven insights | 🔴 | New `/supervisor/overview` page aggregating Licensing + F&P + Prudential + Conduct; Lovable-AI insight widget. |
| DPA-002 | Role-specific dashboards (exec vs operational; regulator vs licensee) | 🟡 | Dashboard layouts already keyed to role; add "executive" role/preset. |
| DPA-003 | Cross-script operational reports with filters | 🟡 | Add predefined `report_templates` for licensing throughput, all SLAs, return compliance, complaint volumes. |
| DPA-004 | Ad-hoc report + export + export audit | 🟡 | Report builder exists; add export-audit event to `compliance_audit_logs`. |
| DPA-005 | Case-centric audit (Licensing → F&P) | 🔴 | Requires unified `<EntityTimeline>` primitive from analysis report; view keyed by case ID spanning entity_types. |
| DPA-006 | Supervisory & enforcement audit | 🟡 | Same primitive filtered by supervisory action IDs. |
| DPA-007 | Data lineage + version history | 🟡 | `compliance_audit_logs.before_value/after_value` already stored; add diff view. |
| DPA-008 | Overrides + mandatory justification | 🟡 | Central "override with justification" dialog primitive reused across modules. |
| DPA-009 | Integration + security-event logs | 🟡 | `security_event_logs` exists; add `integration_logs` table + admin viewer. |

---

## 6. Cross-Cutting Platform Primitives (build once, reused everywhere)

These are prerequisites for multiple scenarios and were flagged as platform gaps in the earlier architecture analysis:

1. **Unified `<EntityTimeline>` component** + `useEntityAuditLog` — required by DPA-005/006, ULRA-011, F&P appeals.
2. **RFI subsystem** (`entity_rfis`, dialog, SLA pause/resume) — ULRA-005, extendable to F&P & Conduct.
3. **SLA escalation sweep cron** — ULRA-005, FPA-013, PRUD-008.
4. **Twin-Peaks coordination workspace** (shared thread + interdependency flags + conditional clearance) — ULRA-012.
5. **Override-with-justification** dialog + audit hook — DPA-008.
6. **Bulk-intake (CSV) primitive** — ULRA-010, reusable by F&P and Conduct.
7. **AI-analysis wrapper** on Lovable AI Gateway with source citation + confidence + human-override storage — FPA-009, DPA-001, ULRA-006.
8. **Peer-comparison chart primitive** — PRUD-006.
9. **Integration-log service** — DPA-009.

---

## 7. Phased Delivery

Each phase ends in a runnable, testable increment. Phases 1–2 unblock every downstream module.

**Phase 1 — Platform primitives (foundation)**
- Unified `<EntityTimeline>` + `useEntityAuditLog`
- Override-with-justification primitive
- SLA escalation sweep cron
- Integration-log table + viewer
- Confirm `dispatch-notification-event` "acknowledged_at"

**Phase 2 — Script 1 completions**
- ULRA-005 RFI subsystem
- ULRA-002 batch upload + per-file metadata
- ULRA-004 SLA-age/priority queue columns
- ULRA-006 AI assessment button + override
- ULRA-008 Consolidated Case View
- ULRA-009 Conditional approval + signed license
- ULRA-010 Bulk intake CSV
- ULRA-011 Auto supervisory plan on approval
- ULRA-012 Twin Peaks coordination workspace

**Phase 3 — Script 2: Fit & Proper (largest greenfield)**
- Schema: `fp_individuals`, `fp_individual_roles`, `fp_assessments`, `fp_screening_configs`, `fp_screening_runs`, `fp_findings`, `fp_determinations`, `fp_committees`, `fp_committee_votes`, `fp_conditions`, `fp_appeals`
- Workflow engine `perform-fp-workflow-action` + RPC
- Individual profile, subject-context UI
- Declarations form + notifications
- Screening engine (rules-based + adverse-media via AI)
- Committee voting UI
- Conditional determination + SLA reminders
- Appeals + monitoring cron

**Phase 4 — Script 3: Prudential completions**
- Risk taxonomy config
- Prudential profile tab (historical)
- Return version-history view
- Supervisory assessment + risk score
- Peer comparison + trends
- Early-warning cron

**Phase 5 — Script 4: Market Conduct**
- Conduct risk taxonomy
- Public consumer intake page
- Auto-priority + auto-routing
- Conduct analytics + alerts (spike detection)
- Thematic reviews
- Ongoing monitoring rules + cron
- Conduct oversight dashboard with drill-down

**Phase 6 — Script 5: Dashboards & Reporting**
- Cross-module supervisor overview + AI insights
- Executive role + dashboard preset
- Predefined report templates
- Export-audit hook
- Data-lineage diff viewer

**Phase 7 — QA + hardening**
- Playwright end-to-end walkthrough of every DEMO-*** ID
- Tighten open RLS on `forms`/`sectors`/`sub_sectors`/`categories`/`services`/`audit_logs` (called out in architecture report)
- Real AV scanning on `file_uploads` (or explicit "unscanned" warning until enabled)
- Cron entries for `run-scheduled-reports` + `overdue-returns-sweep`

---

## 8. Effort Estimate (rough)

| Phase | Est. dev-days |
|-------|---------------|
| 1 – Platform primitives | 7–10 |
| 2 – Script 1 completions | 10–14 |
| 3 – Fit & Proper (greenfield) | 20–28 |
| 4 – Prudential completions | 6–9 |
| 5 – Market Conduct | 10–14 |
| 6 – Dashboards & Reporting | 6–9 |
| 7 – QA + hardening | 5–7 |
| **Total** | **~64–91 dev-days** |

---

## 9. Assumptions & Open Questions

1. **AI provider** — assume Lovable AI Gateway for FPA-009 / ULRA-006 / DPA-001 (chat completions, embeddings). Confirm.
2. **Adverse-media data source** — FPA-005 refers to "large adverse-media datasets". No external subscription is wired today; either (a) rules-based + AI-generated adverse-media synthesis for demo defensibility, or (b) integrate a real feed (WorldCheck/Dow Jones) — needs commercial decision.
3. **Digital signature** — ULRA-009 already stamps a signature-of-record on certificates via `generate-license-certificate`; confirm current PEM-key based signing is acceptable, or add third-party e-sign (DocuSign/eIDAS).
4. **Multi-regulator (BOJ + FSCA)** — existing `regulators` table + `RegulatorContext` support this; assume no new tenant model needed.
5. **Cycle-based F&P trigger** — cadence configurable per sector? Assume yes (annual default, override per sector).
6. **Consumer complaint portal** — public unauthenticated with OTP, or authenticated only? Existing complaints require auth today.
7. **Twin-Peaks coordination** — cross-regulator visibility on the same case is a security decision (default RLS isolates regulators). Confirm allowed.

---

## Next step
Approve this plan and we start with **Phase 1 — Platform primitives**. After each phase you review the increment before we start the next.
