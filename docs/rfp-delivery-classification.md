# RFP Delivery Classification Matrix

Companion document to [rfp-security-compliance-qa.md](rfp-security-compliance-qa.md) — same 40 questions, re-answered in the specific format needed for RFP scoring. Each question gets:

1. **Delivery Classification** — Out-of-the-Box / Configuration / Customization / Not Supported (defined below).
2. **Cost or Schedule Implication** — Yes/No, i.e. does delivering this as asked require additional vendor effort beyond what ships today.
3. **Vendor Response / Notes** — specific, evidence-based explanation (references the effort tiers already established in the companion Q&A doc).

**Classification definitions used throughout:**
- **Out-of-the-Box (OOTB)** — Works today, verified in the current codebase, no further work needed.
- **Configuration** — Not necessarily live today in a UI, but achievable by an FSC/BOJ admin using an already-shipped configurable engine (rule builder, workflow builder, report builder, settings screen) — no custom code required.
- **Customization** — Requires genuine software development to build or extend, using the existing architecture/patterns (small to large effort).
- **Not Supported** — Not available today and not a straightforward customization — either it requires a fundamentally new capability outside the current architecture (e.g. a trained ML model, on-prem AI hosting), or it's blocked on an external dependency the vendor doesn't control (a third-party vendor contract, a data-licensing decision).

Where a question bundles multiple distinct asks (e.g., "rules AND AI"), the classification is given per component rather than forced into one label, since collapsing it would misrepresent what's actually true today.

---

## Batch 1 — Security

### Q1. How is authentication handled at the API layer (protocols, token issuance/exchange, refresh, inactivity/absolute expiry)?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** Full delivery of this requirement will be handled as a customization engagement against the platform's Supabase-based authentication layer. Scope: build/harden JWT issuance and automatic token refresh, per-request edge-function token verification, and a custom email-OTP second factor, then extend the layer with the currently-missing pieces — an idle-inactivity timer (client-side last-activity tracking with configurable timeout), an absolute session-expiry cutoff, and account lockout after N failed login attempts — and wire the existing `SecuritySettings.tsx` screen to a real, persisted, enforced settings table instead of its current non-functional mockup state. Estimated effort: Medium (~2-3 weeks) for the full customization scope, delivered additively without disrupting the existing auth flow.

---

### Q2. Describe SSO capabilities, protocols, BOJ/FSC IdP (AD/LDAP) integration, and coverage for platform + embedded reporting tools.

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes — significant. No SAML/OIDC/LDAP/AD integration exists in any form.

**3. Vendor Response / Notes:** No SSO capability of any kind exists today — this is an explicit open backlog item per the project's own trackers, not an ambiguous gap. It is buildable (Supabase Auth supports SAML 2.0 SSO as a provider type), but the critical path is not purely engineering: it depends on (a) whether the current Supabase project plan/tier includes SAML SSO (typically a paid Team/Enterprise add-on), and (b) BOJ IT's turnaround time to register the platform as a relying party in their AD/IdP. Estimated Large effort (4-8 weeks), with the BOJ-side coordination likely the longer pole, not the code. No embedded reporting tool exists yet, so SSO coverage for one is not yet applicable.

---

### Q3. How does the solution scan uploaded files/attachments to prevent malware ingestion (engine, definition updates incl. air-gapped, file types/size limits, block/quarantine/log/report)?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** The upload pipeline (file-type/size validation, private storage, signed URLs, RLS) is fully implemented. However, no malware-scanning engine is wired in — the `scan_status` field is rubber-stamped `clean` at upload time with zero content inspection, and this must be corrected before any compliance answer can claim virus scanning exists (a marketing-copy string in the app currently overstates this and should be corrected). Two build paths exist: a cloud/SaaS AV API (Medium effort, 2-4 weeks) or a self-hosted ClamAV service with definition-update automation for on-prem/air-gapped requirements (Large effort, 4-6 weeks). Either path also needs a quarantine workflow, admin review/release UI, and scan-activity logging (add 1-2 weeks). See Q3 in the companion doc.

---

## Batch 2 — Correspondence Management

### Q4. Can the system manage the complete correspondence lifecycle from receipt through assignment, review, approval, response, and closure while maintaining a full audit trail?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** No first-class correspondence entity or status lifecycle exists — what's in the product today is an outbound-only template/dispatch utility and a flat complaint-scoped message log, neither of which has assignment, approval gating, or state transitions. This is buildable at Medium-Large effort (3-5 weeks) by modeling correspondence as a new entity type inside the platform's existing generic workflow engine (approval steps, roles, SLA, notifications, audit logging are all already proven infrastructure) rather than building a bespoke state machine — meaningfully cheaper than greenfield.

---

### Q5. Can correspondence be automatically captured, classified, and routed to the appropriate business unit or officer based on configurable business rules, with manual override?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** No inbound email capture, no classification/routing rules engine, and no auto-assignment exist for correspondence today. This is buildable by reusing the complaints module's proven, admin-configurable triage-rule engine pattern rather than designing a new one — estimated Large effort overall (~5-6 weeks: inbound capture ~2 weeks, rules engine ~2 weeks reusing the existing pattern, override UI ~1 week), independently shippable in pieces.

---

### Q6. How does the solution support document and records management for correspondence — version control, attachment management, search, retention schedules, historical retrieval?

**1. Delivery Classification:** Not Supported today (version control, search, retention); Customization required for all listed capabilities; one component (a history view) exists in code but is disconnected.

**2. Cost or Schedule Implication:** Yes, though partial quick wins are available cheaply.

**3. Vendor Response / Notes:** An attachments field exists in the schema but has no working upload UI (dead field); a dispatch-history view component exists but is never rendered anywhere in the app (an orphaned quick win — 1-2 days to wire up). No version control, full-text search, or retention-schedule capability exists. Full scope is Medium effort (3-5 weeks); the two quick wins (history view + attachments upload, reusing the existing secure-upload pattern) are deliverable in under a week and cover the most immediate user-facing value.

---

### Q7. Can reporting/management dashboards be expanded to include correspondence volumes, workloads, aging, response performance, bottlenecks, and operational efficiency?

**1. Delivery Classification:** Not Supported today; buildable via Customization, blocked on Q4.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** No correspondence-specific dashboard exists (only a template-management CRUD screen). This is structurally dependent on Q4 (a status/assignment model must exist before aging/workload/SLA metrics can be computed). Once Q4 ships, building the dashboard itself is Medium effort (2-3 weeks), following the same Recharts + aggregation-query pattern already used for the existing Conduct/Prudential dashboards.

---

## Batch 3 — Market Conduct Risk Assessment

### Q8. Can the solution support configurable Market Conduct Risk Assessment Frameworks (risk indicators, inherent risk, control effectiveness, residual risk), configured independently per sector (Insurance/Securities/Pensions)?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes — this is the largest single gap in the Market Conduct area.

**3. Vendor Response / Notes:** What exists today is a tagging taxonomy and a free-text manual rating log — neither has inherent-risk/control-effectiveness/residual-risk fields or per-sector scoping. No risk-related table anywhere carries a `sector_id`, even though sectors exist elsewhere in the schema — one global scheme applies to every entity regardless of sector. This requires a genuine schema/engine redesign: new framework fields, an admin UI for defining indicators/weights per framework, and adding sector scoping across multiple existing engines (risk scoring, monitoring, triage). Estimated Large effort (4-6 weeks).

---

### Q9. How does the solution calculate Market Conduct risk scores? Can FSC administrators configure weighting factors, scoring methodologies, and risk thresholds without vendor intervention?

**1. Delivery Classification:** Customization (small) required to make this genuinely self-service; today it is Not Supported for FSC self-service (requires a direct database update).

**2. Cost or Schedule Implication:** Yes, but minimal — this is the cheapest, highest-value fix identified across the entire review.

**3. Vendor Response / Notes:** A real, working weighted-composite scoring formula exists, and — importantly — its weights and band thresholds are already stored in a proper configuration table (not hardcoded), which is architecturally the right foundation for admin self-service. What's missing is only the admin UI to edit that table; today changing weights/thresholds requires a direct SQL update, which is not self-service and would need vendor/DBA involvement. Building the missing UI (following the same admin-config pattern already used elsewhere in the product) is Small effort (~1 week). Per-signal normalization caps are separately hardcoded in code and would need a further small change to become configurable.

---

### Q10. Can the solution automatically identify emerging conduct risks by analysing historical complaints, supervisory findings, enforcement actions, regulatory returns, and external data sources?

**1. Delivery Classification:** Configuration (existing threshold-rule monitoring) / Not Supported (cross-source correlation, trend/anomaly detection, external-data correlation).

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** Real, running single-metric threshold monitoring exists today and is admin-configurable (window/threshold per rule) — that part is delivered. Genuine cross-source correlation (linking complaints + findings + enforcement + returns into one emerging-risk signal) and statistical trend/anomaly detection do not exist and are explicitly marked "Pending" in the project's own internal trackers. A rule-based trend/outlier detector (flagging deviation from a trailing-period average) is buildable without new ML infrastructure at Medium-Large effort (3-5 weeks); true cross-source correlation is a larger, open-ended data-science effort (Large-XL, 6-10+ weeks) best delivered incrementally. External-data correlation is additionally gated on Q20 existing at all.

---

### Q11. Can supervisors visualize Market Conduct risks through configurable heat maps by Institution, Sector, Product, Distribution Channel, Complaint Category, and Consumer Segment?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** The one existing heat map is a single-dimension entity-by-risk-band grid — not a configurable two-axis matrix, and none of the six requested dimensions are selectable or (in the case of Consumer Segment) even exist as a data field yet. Building a genuine dimension-picker plus a true matrix visualization is Medium effort (2-3 weeks), using the existing Recharts stack (no new charting library needed) — moderate because the underlying risk-score data already exists.

---

## Batch 4 — Complaint AI/Analytics & Reporting

### Q12. Can complaints be automatically classified using configurable business rules and AI/NLP based on complaint type, institution, product, consumer harm, keywords, and regulatory breaches?

**1. Delivery Classification:** Configuration (business rules) / Not Supported (AI/NLP — does not exist in any form today).

**2. Cost or Schedule Implication:** Yes, for the AI/NLP component specifically; No, for the rules-based component (already delivered).

**3. Vendor Response / Notes:** A real, admin-configurable rules engine already handles classification on all the listed dimensions except that "keyword" matching is plain substring text matching, not NLP — this part is delivered today with a working simulate/dry-run capability. No LLM/AI call exists anywhere in the complaint intake or classification path. Adding AI-assisted classification (as a human-confirmed suggestion, not an auto-decision, given regulatory false-positive risk) is Medium effort (2-3 weeks) reusing an existing AI-gateway pattern already used elsewhere in the product; upgrading keyword matching to true semantic similarity via vector embeddings is a further Medium effort (2 weeks).

---

### Q13. Can the system automatically detect duplicate complaints or identify multiple complaints relating to the same institution, product, intermediary, or issue?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** No similarity/duplicate-detection logic exists. What's present instead — a repeat-complainant counter and an alert-dedup hash — solves a different problem (flagging a repeatedly-complaining person, not two records describing the same incident) and should not be presented as meeting this requirement. Buildable using Postgres trigram similarity (no AI dependency) at Medium effort (2-3 weeks), or with higher recall via embeddings at Medium-Large effort (3-4 weeks).

---

### Q14. Can complaints be automatically escalated based on consumer harm, complaint age, institution risk rating, volume thresholds, and complaint recurrence?

**1. Delivery Classification:** Configuration (SLA, volume/thematic, vulnerability, severity triggers) / Customization (institution risk-rating factor, configurable recurrence threshold).

**2. Cost or Schedule Implication:** Yes, but small.

**3. Vendor Response / Notes:** Most of the requested escalation triggers already exist and fire automatically today, and the volume/thematic threshold is already admin-configurable. Two specific gaps: escalation never factors in the institution's composite risk rating at all, and the recurrence threshold is hardcoded (inconsistent with the volume threshold, which is configurable). Both are small, targeted additions to an engine that already supports this shape of configuration — Small effort (~1 week combined).

---

### Q15. Can the solution calculate configurable Consumer Harm Indicators — complaint frequency, severity, financial loss, resolution time, repeat complaints, consumer vulnerability?

**1. Delivery Classification:** Not Supported today (as a unified, configurable indicator); Customization required.

**2. Cost or Schedule Implication:** Yes, but modest.

**3. Vendor Response / Notes:** Five of the six requested factors exist as standalone data fields (frequency, severity, resolution time, repeat complaints, vulnerability), but there is no `financial_loss` field anywhere, and — critically — no unified, weighted, admin-configurable harm-scoring index combining any of them. This is buildable by reusing the same weighted-composite-plus-config-table pattern already validated by the risk-scoring engine (Q9): add the missing field (Small, 1-2 days) plus the composite scoring engine and admin weight UI (Medium, 1-2 weeks).

---

### Q16. Can AI automatically identify complaint patterns across institutions and products that may indicate systemic consumer harm?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** Only deterministic threshold counting exists (spike detection against a fixed count) — no clustering, cross-institution correlation, or AI/ML of any kind. A statistical outlier-detection approach (flagging products/institutions that are significant outliers vs. a peer group, with no ML required) is recommended as the first step — Medium-Large effort (3-5 weeks) and explainable to a regulator. A true ML/embedding-based clustering approach is a materially larger, more open-ended effort (Large-XL, 6+ weeks) with no existing infrastructure to build from.

---

### Q17. Can AI identify potential instances of mis-selling, unsuitable advice, unfair treatment, fraud, and conflicts of interest? Explain the models/algorithms/analytical techniques used.

**1. Delivery Classification:** Not Supported today; Customization possible for a prompt-based approach, Not Supported for a purpose-trained model.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** None of these five detection capabilities exist today — the relevant terms appear only as free-text example labels an admin can type when naming a risk category; nothing auto-detects any of them, and there is no model, algorithm, or analytical technique in the product for this purpose currently. A pragmatic near-term build is prompt-based LLM classification against defined typologies, reusing the existing AI-gateway integration pattern, with mandatory human review before any action (Medium-Large effort, 3-5 weeks). A purpose-trained classifier model would be materially more accurate but requires an ML program (labeled data, training, validation, ongoing maintenance) the product has no infrastructure for today (XL, months) — not recommended as a first step.

---

### Q18. Can the platform predict which institutions are most likely to experience future Market Conduct issues? Describe predictive models, confidence/accuracy measures, and explainability.

**1. Delivery Classification:** Not Supported.

**2. Cost or Schedule Implication:** Yes, if pursued — this would be its own multi-month program, not a normal feature addition.

**3. Vendor Response / Notes:** The only existing "risk score" is an explicitly backward-looking, current-state composite (a weighted sum of currently-open items) — it is not a trained model and has no forecasting capability, confidence measure, or explainability layer, because none of those concepts apply to a hand-weighted sum. Building genuine predictive modeling requires a proper data-science program: historical labeled outcomes, feature engineering, model training/validation, an explainability layer, and ongoing MLOps (retraining cadence, drift monitoring) — a fundamentally different kind of work from the rest of the product (XL, 3-6+ months). Recommend a separate discovery phase (data volume/quality assessment, cloud-vs-on-prem hosting decision) before committing to any timeline; this should not be bundled into a general delivery track.

---

### Q19. Can the platform monitor Market Conduct risks across Insurance, Securities, and Pensions using a common supervisory framework while allowing sector-specific requirements where necessary?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the conduct-monitoring engine to provide a genuine common supervisory framework across Insurance, Securities, and Pensions, with functioning sector-specific overrides. The engine already runs uniformly across all three sectors, and a sector-scope selector already exists in the schema/admin UI as a foundation — the customization work wires that selector into the actual evaluation logic (joining through the licensee's or product's sector, and filtering rule application by the selected scope) so that choosing "sector" scope has real effect instead of none today. Estimated effort: Medium (~2 weeks), building on the existing scaffolding rather than a full rebuild.

---

### Q20. Can the solution incorporate external intelligence sources into Market Conduct surveillance — news feeds, social media, consumer review websites, ombudsman decisions, court rulings?

**1. Delivery Classification:** Not Supported.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** No external data source of any kind is integrated today — all conduct-alert/monitoring data originates solely from the platform's own tables. Each requested source is effectively a separate integration project with a very different risk/effort profile (news/RSS is the cheapest; social media and consumer-review sites often require paid API access or raise scraping/ToS legal questions; ombudsman/court rulings depend entirely on whether the source publishes a structured feed BOJ/FSC would need to identify first). This should be treated as a phased roadmap item gated on source identification and licensing decisions, not a single build with one effort number (Large-XL overall, but not schedulable as a single project today).

---

### Q21. Please describe how the solution generates configurable Early Warning Indicators (EWIs) to support proactive Market Conduct supervision.

**1. Delivery Classification:** Configuration (existing alert thresholds, mostly) / Customization (closing a hardcoded-threshold gap and adding "EWI" branding/packaging).

**2. Cost or Schedule Implication:** Yes, but small.

**3. Vendor Response / Notes:** A literal "Early Warning" feature exists today, but only for prudential ratios, not conduct. The conceptual equivalent for conduct is the existing real-time alert and scheduled monitoring system, most of whose thresholds are already admin-configurable — one threshold (repeat-complaint recurrence) is hardcoded (same gap noted in Q14). Closing this gap and presenting the capability explicitly under "Early Warning Indicator" terminology, plus optionally adding a softer leading-indicator tier, is Small-Medium effort (1-2 weeks).

---

### Q22. Can users drill down from executive/sector-level dashboards to Institution, Complaint, Investigation, and Individual Supervisory Action levels?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the dashboard navigation layer, building on the platform's existing drill-down chain (Conduct Dashboard → Entities list → Entity profile → Complaint detail / Investigation detail) and completing it end-to-end for BOJ's specific requirement: adding a direct Investigation→Action link so users can navigate straight from an investigation to its resulting supervisory action, and adding a sector-level rollup view at the top of the drill-down chain. Estimated effort: Small (1-2 days for the direct link, ~1 week for the sector rollup).

---

### Q23. Can reports and dashboards be exported to Microsoft Excel, Microsoft Word, and PDF while preserving formatting and, where applicable, drill-down capabilities?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the platform's export pipeline. CSV, XLSX, and PDF generation already exist as a technical foundation and will be extended/hardened to be enabled consistently across all reports; Word (.docx) export will be added as new capability (a document-parsing library already present is currently only used to import Word files, so this direction needs to be built from scratch) using a `.docx`-generation library mirroring the existing export-service pattern; and nested/grouped structure will be added to approximate "drill-down" context within the otherwise-flat static export formats. Estimated effort: Medium (1-2 weeks) for Word export, plus a further Medium (1-2 weeks) for the drill-down-style structure and universal PDF enablement.

---

## Batch 5 — Collaborative Review, AI Governance, Dashboards/BI, Submission Channels, Workflow Extensibility

### Q24. Can the system support configurable collaborative review and markup (colored reviewer contributions, sidebar comments, Word-Track-Changes-style tracked edits), with configurable reviewer role display?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the collaborative review module. The platform already provides a technical foundation — per-reviewer colored attribution, threaded sidebar comments, accept/reject suggestions, blocking-comment gating on approval, and admin-configurable role display, in use across Application, Registration, Return, and Complaint review flows — which will be tailored and extended to BOJ's specific reviewer-role and approval-gating requirements. If a literal inline, rich-text Word-style redline experience (colored insertions/strikethroughs layered directly over a flowing document, rather than sidebar-rendered suggestions) is required, that is a further customization: replacing the current plain-text review surface with a rich-text editor supporting tracked changes. Estimated effort: Large (4-6 weeks) for the rich-text editor rebuild, plus Medium-Large (3-4 weeks) additional if real-time multi-user co-editing is also required.

---

### Q25. Can the system automatically capture time-per-stage and end-to-end cycle time for a workflow/examination process (initiation → planning → fieldwork → QA → reporting → closure)?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** Instance-level start/complete timestamps exist, but no stage-level duration capture, no cycle-time computation, and no bottleneck-identification reporting exist anywhere — and no formal "examination" entity with named phases (planning/fieldwork/QA/reporting) exists at all; the closest analog is a flat inspection record with no sub-phases. Buildable at Medium effort (2-3 weeks) via a stage-transition history table plus a reporting view; formalizing a distinct examination-phase model on top is a further Medium effort (2-3 weeks) if required beyond generic workflow steps.

---

### Q26. Can the AI learning process be configured to weight feedback by user authority (e.g., Senior Examiner/Head of Department corrections weighted more than an Examiner's)?

**1. Delivery Classification:** Not Supported.

**2. Cost or Schedule Implication:** Yes, if pursued as literally specified.

**3. Vendor Response / Notes:**

*In plain terms:* this question asks whether the AI "gets smarter" over time by learning from human corrections, and specifically whether a Senior Examiner's or Head of Department's correction should count for more than an Examiner's — similar to how a self-improving system might trust a supervisor's judgment more than a junior colleague's.

**What's implemented today:** Nothing. Every AI feature currently in the product (e.g. suggested risk assessments, dashboard summaries) works by sending a single, self-contained question to an external AI model and getting back a single answer — it does not remember previous interactions and has no way to learn from them, regardless of who made the correction. It behaves like asking a knowledgeable assistant a fresh question every time, not like training an employee who improves through experience. There is currently no mechanism that captures a reviewer's correction and feeds it back to change future AI behavior — weighted by role or otherwise. (What does exist is an audit trail recording what the AI suggested versus what the human analyst ultimately decided — but that's for accountability and record-keeping, not for changing how the AI behaves next time.)

**How this would be implemented/customized:** Two distinct paths, with very different cost and honesty implications:
- **A literal "self-learning, role-weighted" model** — training an AI model on BOJ's own corrections, with Senior Examiner/Head of Department corrections carrying more influence than an Examiner's — is **Not Supported** as a customization of the current product. It requires building an entirely separate machine-learning training pipeline (collecting labeled examples, retraining on a schedule, ongoing accuracy monitoring), which is a fundamentally different kind of system from what exists today, not an extension of it. This would be its own dedicated, multi-month project (Effort: XL, 3+ months), not a feature add-on.
- **A practical alternative that achieves a similar goal** — each time the AI is asked a question, automatically include a curated set of past examiner decisions in what's shown to it, giving senior-reviewer decisions more prominence in that context — is achievable as a genuine customization (Effort: Medium-Large, 3-5 weeks). This should be described to BOJ accurately as "guiding the AI with curated examples" (prompt engineering), not as the AI literally learning or adjusting its own internal weights — the distinction matters for setting the right expectations.

---

### Q27. Can BOJ change the underlying AI model of the solution (locally-hosted open-source or cloud-hosted)? Can future models be substituted?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:**

*In plain terms:* BOJ is asking whether, down the line, the AI engine underneath the product could be swapped out — for example, moving away from the current AI provider to a different company's model, or running a model entirely on BOJ's own infrastructure instead of a cloud provider — if a security, cost, or policy reason required it.

**What's implemented today:** The product currently uses one specific AI model, reached through a single third-party AI gateway service, and this choice is written directly into the code in six separate places (one per AI-powered feature) rather than being a single setting. There is no settings screen, toggle, or configuration table to change it — today, switching models means a developer editing and redeploying code in all six places, each of which also has its own hand-written logic for formatting the request and reading the response.

**How this would be implemented/customized:** Consolidate those six separate hardcoded references into one shared, central piece of code that every AI-powered feature calls through, with the model name and provider stored as a setting rather than typed into code. Once that's done, switching to a different model from the same provider becomes a configuration change instead of a code change (Effort: Medium, 1-2 weeks). Supporting a genuinely different provider — for example, a different AI company, or a model BOJ hosts itself — additionally requires adapting how requests/responses are formatted for that specific provider, since each one has its own API shape (Effort: Small-Medium, roughly 1 week per additional provider added, on top of the initial consolidation work).

---

### Q28. Describe AI/ML model maintenance — retraining cycles, version control, drift monitoring, self-adjustment, vendor vs. BOJ/FSC responsibilities, and on-prem considerations.

**1. Delivery Classification:** Not Supported (no trained model exists to maintain; no on-prem hosting option exists).

**2. Cost or Schedule Implication:** Yes, if BOJ requires an on-prem/self-hosted model.

**3. Vendor Response / Notes:**

*In plain terms:* this question asks who is responsible for keeping the AI accurate and current over time, and what ongoing work that requires — similar to asking "who patches and monitors this system, and how often."

**What's implemented today:** Because the product simply calls an existing AI model that Google hosts (reached through a gateway service), there is no model belonging to this application that needs "maintaining" in the traditional sense — nothing is trained on BOJ's data, so there is nothing to retrain and no model drift to monitor on our side. Keeping that underlying model accurate, current, and available is entirely the upstream provider's (Google's, via the gateway operator's) responsibility, not something this application does. The only maintenance task that falls to us today is updating the model's name in code if the current one is ever retired, and periodically rotating the access key used to reach it.

**How this would be implemented/customized:** This changes substantially if BOJ requires an on-premises/self-hosted AI model — for example, for data-sovereignty reasons, so that no applicant or examiner data is ever sent to an external AI provider. That would require: (1) standing up dedicated server infrastructure (typically needing specialized hardware) to run an open-source AI model internally, (2) building the model-swapping capability described in Q27 to point at that internal server instead of the external gateway, and (3) if BOJ wants the model to actually improve from BOJ's own data over time, establishing an ongoing internal process for retraining it and monitoring its accuracy — which is exactly the kind of "maintenance" this question is asking about, and would then become a genuine, shared vendor/BOJ responsibility. This is a significant, multi-month infrastructure undertaking (Effort: XL, 2-4+ months) that should be scoped and budgeted as its own project — starting with a discovery phase to determine hosting/hardware needs — rather than treated as an incremental addition to the current platform.

---

### Q29. What technology/application is used to develop and display dashboards and charts (proprietary, Power BI, Tableau, or another platform)?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** Dashboards and charts will be delivered as a customization of the platform's proprietary, in-house dashboard layer, built on the Recharts JavaScript charting library directly within the application's React frontend, tailored to BOJ's specific KPIs, layouts, and branding — rather than embedding a third-party BI tool such as Power BI or Tableau. Estimated effort scales with the number and complexity of dashboards/charts requested; each new dashboard or chart is delivered following the same proven pattern already used for the platform's existing Conduct/Prudential/Analytics/Executive dashboards.

---

### Q30. Can the system expose its data via APIs, direct database connections, or other mechanisms to support reporting in enterprise BI tools such as Power BI?

**1. Delivery Classification:** Configuration (basic access via the platform's existing generic database REST layer) / Customization (a purpose-built, properly-scoped reporting connection).

**2. Cost or Schedule Implication:** No, for basic generic access (credentials only); Yes, for a hardened, purpose-built BI export surface.

**3. Vendor Response / Notes:** The platform's data layer is built on a standard auto-generated REST API over the underlying database, which an external tool with appropriate credentials can technically connect to today (e.g., via a generic Postgres/REST connector) — this requires only credential provisioning, not development. However, this is not a purpose-built or hardened BI export surface, and the one existing dedicated integration API is read-only and limited to three narrow resources, unsuitable for general BI reporting. A properly-scoped solution (dedicated reporting views plus a restricted, read-only database role for Power BI's native connector) is Medium effort (2-3 weeks) and is the recommended approach over relying on generic access.

---

### Q31. Can users drill down from summary metrics by clicking on dashboard charts?

**1. Delivery Classification:** Not Supported today; buildable via Customization.

**2. Cost or Schedule Implication:** Yes, but minor.

**3. Vendor Response / Notes:** No dashboard today supports clicking directly on a chart segment (bar/pie/line mark) to drill down — the charting library's click-handling capability is simply not wired up anywhere. Drill-down today happens via separate link tiles adjacent to the charts, not the charts themselves. Wiring this up, to the already-existing filtered destination pages, is Small effort per dashboard (3-5 days), roughly 2 weeks total across all four dashboards.

---

### Q32. Can users apply filters (e.g., date, institution, supervisory activity) with all dashboard visualizations updating dynamically?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization applying the platform's existing dynamic-filter pattern — already proven on the Market Conduct dashboard, where a full filter bar re-runs the underlying query and recomputes every KPI, chart, and table on the page — across the remaining dashboards (Prudential, Analytics, Executive), which are currently static or timer-refreshed with no filter controls. Estimated effort: Small-Medium (1-2 weeks total) since this replicates a working pattern rather than requiring new design.

---

### Q33. Can users create their own dashboards and reports without vendor support, or are they limited to predefined visualizations?

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the platform's ad-hoc report builder for BOJ's specific dataset and reporting needs. The builder already provides the underlying mechanics — pick a dataset, choose columns and filters, group, sort, preview, generate, save as a reusable template, and schedule it — which will be configured against BOJ's approved datasets (currently nine pre-approved sources) as part of onboarding. Extending the approved-dataset list with any additional BOJ-specific data source is a well-defined, incremental customization task (Small, 2-3 days per dataset) following the existing pattern, not a redesign.

---

### Q34. Expound on the solution's data warehousing capability — architecture, supported data volumes, historical data retention, and exposure to downstream analytical/reporting tools.

**1. Delivery Classification:** Not Supported.

**2. Cost or Schedule Implication:** Yes, if genuine data warehousing is required.

**3. Vendor Response / Notes:**

*In plain terms:* this asks whether there's a separate, purpose-built database dedicated to heavy historical reporting and analysis (a "data warehouse"), as opposed to simply running reports against the same live database the application uses for day-to-day work. A data warehouse typically matters once an organization has years of accumulated data and wants fast, large-scale trend and historical analysis without slowing down the live system that staff rely on every day.

**What's implemented today:** There is no separate data warehouse. Every report and dashboard runs a live query directly against the same operational database the application uses for everyday transactions (applications, licenses, complaints, returns, etc.). Historical report results are stored simply as ordinary rows in normal database tables — not in any specialized analytics store designed for large-scale historical querying.

**How this would be implemented/customized:** Two options, depending on how demanding BOJ's reporting needs actually are:
- **A lighter interim step:** pre-compute and cache the results of the heaviest, most frequently-run reports on a schedule (e.g., overnight), so they load quickly without re-querying the live database every time. This reduces load on the operational system without a full warehouse build. Effort: Medium-Large, 3-4 weeks.
- **A true dedicated data warehouse:** a separate database built specifically for analytics, kept in sync with the operational database on a schedule, with data structured specifically for fast historical/trend reporting at scale. This is a significant infrastructure project (Effort: XL, 2-4+ months) that should be scoped separately, starting with a sizing exercise (how much historical data exists and how fast it's growing, and what reporting speed BOJ actually requires) before committing to a build — the lighter interim step above may well be sufficient for BOJ's near-term needs.

---

### Q35. How would a hybrid submission model work where both XML and Excel channels are supported for the same return? Explain validation, transformation, reconciliation, and consistency enforcement.

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the returns-submission pipeline for BOJ's specific requirements, built on an existing dual-channel foundation. The customization breaks down as follows:

- **Transformation.** Today, each channel has its own dedicated parser that converts the raw file into one common intermediate row structure (`form_id`, `form_version_id`, `field_id`, `field_name`, `field_value`): the XLSX parser reads a hidden metadata sheet mapping each visible worksheet to a form/version, then reads a `Field ID`/`New Value` column pair per sheet; the XML parser walks a `<Form>`/`<Field>`/`<NewValue>` element structure using standard XML parsing. Customization will extend this transformation layer to cover any BOJ-specific field types not yet handled (e.g. repeating table/grid sections, multi-select fields, embedded attachments within a workbook), normalize locale-specific number/date/currency formats on the way in, and handle field-ID re-mapping when a return's form version changes between reporting periods. Estimated effort: Small-Medium (1-2 weeks) per additional field type or mapping rule, on top of the schema-validation work below.
- **Reconciliation.** Today, both channels commit their parsed rows through the same database function, which writes into the same underlying return-data table used by the on-screen manual form — so an upload and a manual edit reconcile into one single source of truth rather than becoming parallel, conflicting copies, and every import is separately logged for traceability of who submitted via which channel and when. Customization will add explicit conflict-resolution rules for the case where the same field is touched both on-screen and via a file upload in overlapping timeframes (e.g., last-write-wins vs. flagging the conflicting field for reviewer confirmation before it's accepted), and support for partial-form uploads (only some fields present in a file) reconciling correctly against fields already completed manually, rather than requiring an all-or-nothing file per submission. Estimated effort: Medium (1-2 weeks).
- **Consistency enforcement.** Because both channels already funnel into the same commit path, the same downstream business rules apply regardless of which channel was used — there is no channel-specific bypass today for a well-formed file. The current gap is upstream of that: validation only confirms the XML/XLSX is well-formed, not that it's schema-correct (e.g., that every `field_id` actually belongs to the declared `form_version_id`, that values match the expected data type/format, or that all required fields are present). Customization will add formal schema validation ahead of the commit step — rejecting or flagging unrecognized fields, type mismatches, and missing required fields with a clear per-row error report shown to the submitter before anything is committed — guaranteeing that a return submitted via Excel and one submitted via XML are held to identical correctness standards. Estimated effort: Small-Medium (1-2 weeks).
- If BOJ additionally mandates moving off the current bespoke XML dialect onto a regulator-standard one (e.g. XBRL), that is a separate, larger customization: Large (4+ weeks), since it touches the transformation layer's XML parser/template generator specifically rather than the reconciliation or consistency-enforcement layers.

**Combined estimated effort for the full Q35 scope: Medium (4-6 weeks)**, or Large (8+ weeks) if a standard-dialect migration is included.

---

### Q36. Is API-based submission delivered as configuration of the default offering, or does it require customization? If configuration, describe the steps; if customization, describe scope/effort/upgrade impact.

**1. Delivery Classification:** Customization (not configuration).

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This is customization of the base product, not configuration of the default offering, and should be scored accordingly. The existing API-key-authenticated integration endpoint is read-only at the transport level and exposes no submission capability today. However, effort is moderate rather than large because the target tables and reconciliation logic already exist and are proven by the Excel/XML channel (Q35) — the work is a new authenticated write endpoint, a new API-key permission scope, and validation, not new core data architecture. Estimated Medium effort (2-3 weeks) for return submission specifically; extending the same capability to application submission is a separate, similarly-scoped effort (additional 2-3 weeks) since applications use different underlying tables. Upgrade impact is low: this is an additive resource branch in one integration endpoint, not a change to the core schema.

---

### Q37. If the solution supports offline form completion, provide evidence of the offline upload process for applicant form completion.

**1. Delivery Classification:** Not Supported for license applications.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** No offline capability of any kind exists for license applications today — no evidence or screenshots can be provided because this does not exist in the current product for this use case. A related but distinct mechanism exists for regulatory Returns (download a template, complete it while disconnected, re-upload once back online), but it is wired only into the Returns module, not applications. The cheapest path to close this gap is replicating that Returns pattern for applications (Medium effort, 2-4 weeks); a true offline/PWA capability built directly into the live application form (service worker, offline draft caching, sync-on-reconnect) is a larger effort (Large, 4-6 weeks). Recommend clarifying with BOJ which of these two actually satisfies the requirement before committing to either.

---

### Q38. Explain the extensibility of the workflow engine — how new workflows, business rules, and process changes are configured, and to what extent BOJ/FSC admins can make changes without vendor code changes.

**1. Delivery Classification:** Customization.

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:** This will be delivered as a customization of the platform's workflow engine for BOJ/FSC's specific process requirements. A no-code workflow builder already exists as the technical foundation — allowing creation of a complete new multi-step approval workflow (steps, approver roles or specific users, SLA per step, escalation, allowed actions, digital-signature requirements, per-step/action notifications) entirely through the admin UI, provided the workflow fits one of the platform's existing process categories (registration, pre/post-application, complaint, inspection, return) — and this will be configured/tailored to each of BOJ's specific approval chains as part of delivery. Two further customization scopes: introducing an entirely new category of process beyond the existing six (Medium, 2-3 weeks per new category), and building out conditional/branching step logic — a schema field exists today but has no admin UI or engine support yet (Medium-Large, 3-4 weeks). Two adjacent admin pages resembling workflow/rule configuration are non-functional mockups and should not be presented as evidence of capability.

---

### Q39. Describe available workflow connectors and inbound/outbound connectivity, using an AML screening step as a worked example. Confirm channel support (XML/API/portal/Excel) for both submission and response.

**1. Delivery Classification:** Customization (channel-agnostic submission connectivity) / Not Supported (AML/sanctions screening specifically).

**2. Cost or Schedule Implication:** Yes.

**3. Vendor Response / Notes:**

*In plain terms:* "AML" means Anti-Money Laundering — checking whether a person is on a sanctions list, a politically-exposed-persons (PEP) list, or has adverse media/criminal history on record, before approving them (for example, as a director or officer of a regulated financial institution). A "workflow connector" is a reusable way for an approval step to call out to an external service, wait for its answer, and use that answer to decide whether to continue, flag for review, or block — so the platform doesn't need bespoke, one-off code every time a new external check is needed. The question asks us to walk through AML screening specifically as a worked example of this general capability, and to confirm whether the same step can be submitted to and responded from via web portal, API, XML, and Excel.

**What's implemented today:** No real AML/sanctions/PEP-screening vendor integration exists in the product. The closest existing feature performs a plain keyword search over text the applicant themselves typed in (explicitly noted in the source code as "not a real sanctions-list check — flagged for manual verification") and separately asks a general-purpose AI model whether it recalls anything about the named individual from its training data (explicitly noted in the code as "not a live third-party database search — treat as a lead, not a confirmed hit"). Neither of these is a genuine, live sanctions/PEP/adverse-media check, and presenting either as AML screening would be inaccurate. Separately, the workflow engine has no general "connector" capability at all today — every external system the app currently talks to was individually hand-built into the code, one integration at a time; there is no reusable slot an admin could use to plug in a new external check without a developer. Channel support: today, channel-agnostic submission (web portal, Excel, and XML all feeding into one record) is proven only for the regulatory-returns data-intake step — every other workflow step (applications, registrations, complaints, inspections) can only be submitted to and responded from through the web portal.

**How this would be implemented/customized:**
1. **Build a general-purpose connector capability** in the workflow engine — a reusable step type that can call any external API and bring its result back into the workflow to drive the next action — so future third-party checks (AML or otherwise) don't each require custom development from scratch. Effort: Medium-Large, 3-5 weeks.
2. **Integrate a specific AML/sanctions vendor** (e.g. World-Check or an equivalent) through that connector once BOJ has selected and contracted one — see Q40, since this step cannot begin until a vendor relationship exists; it is a procurement dependency, not an engineering one.
3. **Extend channel support** (XML/API/Excel, not just the web portal) to other workflow steps beyond returns, following the pattern already proven there — this would be scoped and estimated per step/module as needed.

---

### Q40. Provide a sample configuration of an API integration for automated third-party verification (e.g., World-Check) via a recorded walkthrough or scheduled session.

**1. Delivery Classification:** Not Supported.

**2. Cost or Schedule Implication:** Yes — and the primary blocker is external (a vendor contract), not internal engineering capacity.

**3. Vendor Response / Notes:**

*In plain terms:* BOJ is asking for a live, hands-on demonstration of connecting to a specific, named AML-screening vendor (World-Check is a widely-used one) — showing how the connection and credentials are set up, and how a screening result flows back into the system.

**What's implemented today:** Nothing — there is no connection to World-Check or any AML/sanctions-screening vendor anywhere in the product today, so there is nothing to demonstrate yet. It would be misleading to stage a walkthrough of a capability that does not exist.

**How this would be implemented/customized:** This genuinely cannot proceed until BOJ (or the vendor on BOJ's behalf) obtains at least a trial or sandbox account with World-Check (or whichever provider is ultimately chosen) — that is a business/contracting step that sits outside engineering's control, not something that can be shortcut. Once that access exists: build one integration using the same pattern already proven for the product's other external API calls, ideally routed through the general connector capability described in Q39 so the same investment serves any future vendor as well. Effort once credentials exist: Medium, 2-3 weeks. Recommended order of operations: (1) BOJ begins the vendor conversation for trial credentials, (2) engineering builds the general connector capability in parallel so no time is lost waiting, (3) the specific vendor is wired in once both are ready, (4) the walkthrough is scheduled only once steps 1-3 are complete.

---

*Source detail, file:line citations, and full effort breakdowns for every answer above are in [rfp-security-compliance-qa.md](rfp-security-compliance-qa.md).*
