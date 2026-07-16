# RFP / Regulator Security & Compliance Q&A Tracker

Running log of compliance/RFP-style questions (likely BOJ/FSC procurement or audit questionnaire) answered against the **actual current implementation** of unified-license-hub. Intent: keep appending Q&A pairs as they come in, then do a single implementation pass at the end to close the gaps.

Each answer is split into two parts:
1. **What's implemented today** — verified against the actual codebase, with file:line citations.
2. **Path to implement / effort** — if there's a gap, a concrete approach and an effort tier. If fully implemented, this section says so explicitly.

**Effort scale used throughout:**
- **S (Small)** — hours to ~3 days. Config/UI wiring onto existing tables/services/patterns.
- **M (Medium)** — 1–3 weeks. New schema + edge function(s) + UI, following an existing pattern already proven elsewhere in this codebase.
- **L (Large)** — 3–8 weeks. New subsystem or integration requiring real design work.
- **XL (X-Large)** — 2+ months, and/or blocked on external procurement/vendor contract/infrastructure decisions (e.g., real ML models, licensed data feeds, on-prem hosting, a new AML vendor).

Status legend: ✅ Implemented · ⚠️ Partially implemented / stubbed · ❌ Not implemented (backlog)

---

## Batch 1 — 2026-07-15

### Q1. How is authentication handled at the API layer (protocols, token issuance/exchange, refresh, inactivity/absolute expiry)?

**Status: ⚠️ Partial**

**1. What's implemented today:**
- Supabase Auth (GoTrue) issues standard JWTs; only identity provider in the system. Client config: [src/integrations/supabase/client.ts:11-17](../src/integrations/supabase/client.ts#L11-L17) — `persistSession: true`, `autoRefreshToken: true`, stored in `localStorage`.
- Email+password login via `supabase.auth.signInWithPassword` ([src/contexts/AuthContext.tsx](../src/contexts/AuthContext.tsx)).
- Custom email-OTP second factor (6-digit code via `send-registration-otp`/`verify-registration-otp` edge functions), gated by `two_factor_enabled` flag — bespoke, not Supabase's native TOTP/MFA API ([src/pages/Login.tsx](../src/pages/Login.tsx), [AuthContext.tsx:160-182](../src/contexts/AuthContext.tsx#L160-L182)).
- Token refresh delegated to supabase-js SDK's `autoRefreshToken` — no custom logic. Edge functions verify bearer JWT per-request via platform `verify_jwt` (default true) or `auth.getUser()` (e.g. [supabase/functions/perform-workflow-action/index.ts:52-64](../supabase/functions/perform-workflow-action/index.ts#L52-L64)).
- Two functions opt out of platform JWT verification (`supabase/config.toml`): `public-registry` (intentionally anonymous) and `developer-api` (own `x-api-key`-header auth against `api_keys` table).

**2. Path to implement / effort (gaps):**
- **Idle/inactivity timeout + absolute session expiry** — no code exists at all today. Approach: a client-side activity tracker (last-interaction timestamp) that signs the user out after N idle minutes, plus a hard cutoff timestamp checked against session age. No new tables required if the threshold is a fixed constant. **Effort: S (2-3 days).**
- **Wire `SecuritySettings.tsx` to a real, enforced settings table** — needs a `security_settings` table (values like idle-timeout minutes, max concurrent sessions), persistence on save, and the idle-timer above reading the configured value instead of a hardcoded constant. **Effort: S–M (3-5 days)** on top of the idle-timer work.
- **Account lockout after N failed attempts** — needs a failed-attempt counter (per user or per email+IP) and a check in the login path that blocks further attempts for a cooldown window. **Effort: M (about 1 week).**
- Combined, closing all of Q1's gaps is roughly **2-3 weeks of work**, bucketed as **Medium** overall — all of it is additive (new table + checks), no rework of the existing Supabase Auth flow.

### Q2. SSO capabilities — protocols, BOJ/FSC IdP (AD/LDAP) integration, coverage for platform + embedded reporting tools?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- Nothing. No SAML, OIDC, LDAP, or Active Directory integration in code or config. No `[auth.external.*]` provider blocks in `supabase/config.toml`. No `signInWithOAuth`/`signInWithSSO` calls anywhere.
- No embedded BI/reporting tool exists in the repo at all, so there is no separate SSO-coverage question there yet (see Q29).
- Confirmed as an open backlog item by the project's own trackers: `docs/ADMIN_FIRST_TODO_PLAN.md:358`, `docs/FEATURE_DEVELOPMENT_TRACKER_SECOND_PASS.md:300`.

**2. Path to implement / effort:**
- Supabase Auth supports SAML 2.0 SSO as a provider type, and standard OIDC federation is also feasible. Approach: register the platform as a Service Provider with BOJ/FSC's IdP (AD FS/Azure AD/other SAML-capable AD front-end), configure the SAML/OIDC provider in Supabase Auth, map incoming IdP claims to internal roles/profiles, and add a "Sign in with BOJ SSO" entry point alongside (or instead of) email+password.
- **Effort: L (4-8 weeks)**, and importantly **not purely an engineering estimate** — it depends on: (a) whether the current Supabase project plan/tier includes SAML SSO (it's typically a paid add-on on Team/Enterprise tiers — may require a plan upgrade), and (b) BOJ IT's turnaround time to register/configure the platform as a relying party in their AD/IdP, which is usually the longer pole. Recommend starting the BOJ-side app registration conversation in parallel with any engineering work, since that coordination — not the code — is likely the critical path.
- Embedded-reporting-tool SSO coverage is not yet applicable (no such tool exists — see Q29/Q30); revisit once one is chosen.

### Q3. How are uploaded files/attachments scanned for malware (engine, definition updates incl. air-gapped, file types/size limits, block/quarantine/log/report)?

**Status: ⚠️ Pipeline exists; scanning does not**

**1. What's implemented today:**
- Upload pipeline: [src/lib/secureFileUpload.ts](../src/lib/secureFileUpload.ts) → private Supabase Storage buckets (`secure-documents`, `fp-evidence`, `documents`, `payment-documents`).
- Allowed types: PDF, DOC/DOCX, XLS/XLSX, JPEG, PNG, WEBP, TXT, CSV ([secureFileUpload.ts:4-15](../src/lib/secureFileUpload.ts#L4-L15)).
- Size limit: 20 MB, enforced client-side and at bucket level for `secure-documents`/`fp-evidence`. `documents`/`payment-documents` buckets have no bucket-level limit — app-layer only, bypassable via direct API.
- Access control: RLS on `storage.objects`, short-lived signed URLs (5 min view / 60 sec download).
- `file_uploads` table has `scan_status`/`is_quarantined` columns — schema scaffolding only, currently rubber-stamped `clean` at upload time with no inspection ([secureFileUpload.ts:121](../src/lib/secureFileUpload.ts#L121), [supabase/functions/process-queue/index.ts:190-199](../supabase/functions/process-queue/index.ts#L190-L199)).

**2. Path to implement / effort:**
- Two viable approaches: **(a)** call a cloud/SaaS malware-scanning API (submit file or hash, get a verdict) from the existing `process-queue` job instead of unconditionally marking files clean — the queue infrastructure and `scan_status` column already exist, so this is mostly wiring. **Effort: M (2-4 weeks).** **(b)** self-host a ClamAV (or equivalent) scanning service reachable from an edge function, with a definition-update job — needed if BOJ requires on-prem/air-gapped scanning where a SaaS API can't be reached. **Effort: L (4-6 weeks)** — includes container/infra provisioning, a private mirror or scheduled sync for virus definitions in a restricted network, and operational monitoring.
- Either approach also needs: gating file accessibility until `scan_status = 'clean'` (deny signed-URL issuance for pending/infected files), a quarantine bucket/flag with an admin review-and-release UI, and a scan-activity log/report view. **Add S–M (1-2 weeks)** on top of either (a) or (b) for the quarantine workflow + admin UI + reporting.
- Bucket-level size/type limits should also be added to `documents`/`payment-documents` to close the direct-API bypass — **S (1-2 days)**.

---

## Batch 2 — 2026-07-15 — Correspondence management

**Bottom line:** There is no standalone "regulatory correspondence" module with a lifecycle/status model. What exists is (a) an outbound-only notice/letter dispatch utility (`correspondence_templates` + `correspondence_dispatches` + `send-correspondence` edge function) that is **not wired into any UI page** (its history-view component is never imported/rendered), and (b) a complaints-scoped correspondence log (`complaint_correspondence`) — a flat threaded note list on one complaint, with no status workflow of its own.

### Q4. Can the system manage the complete correspondence lifecycle (receipt → assignment → review → approval → response → closure) with a full audit trail?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- `complaint_correspondence` ([supabase/migrations/20260702141230_...sql:47-69](../supabase/migrations/20260702141230_ba29e0c6-d03c-4afa-9f5b-a17374055ed9.sql#L47-L69)) logs messages against a complaint (`direction`: inbound/outbound/internal_note) but has no status column — a row is appended, never transitions through states.
- `correspondence_dispatches` ([supabase/migrations/20260702145856_...sql:44-63](../supabase/migrations/20260702145856_61ae1161-2617-4037-973c-83d84395b9bd.sql#L44-L63)) has a `status` column but only uses `queued`→`sent` — models a one-shot send, not a lifecycle.
- Audit trail: `complaint_correspondence` writes go through `logAction()`/`log_self_audit` ([src/hooks/useAuditLog.ts](../src/hooks/useAuditLog.ts)) — so complaint correspondence entries do get an audit-log row. The templated-dispatch path has no audit integration.

**2. Path to implement / effort:**
- The good news: the platform already has a **generic, data-driven workflow engine** (`approval_workflows`/`approval_steps`, the `/workflows` admin builder — see Q38) that supports exactly this shape of problem (multi-step, role-based, SLA'd, audited approval chains) for applications/registrations/complaints/inspections/returns. The most efficient path is to **model correspondence as a new workflow entity type** rather than build a bespoke state machine from scratch.
- Concretely: add a `correspondence` table with `status`, `assigned_to`, and workflow-instance linkage; extend the fixed `WorkflowEntityType` union (currently 6 categories — see Q38) to include it; reuse the existing approval-step/notification/audit infrastructure for the assignment→review→approval→response→closure chain.
- **Effort: M–L (3-5 weeks)** — meaningfully less than greenfield because the workflow engine, audit logging, and notification dispatch are all proven, reusable infrastructure; the work is schema + wiring, not new architecture.

### Q5. Can correspondence be automatically captured, classified, and routed based on configurable business rules (type, institution, subject, priority), with manual override?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- No inbound email ingestion mechanism anywhere. No classification/rules engine for correspondence (the complaints conduct-classification/triage system is a separate subsystem). No `correspondence_routing_rules` table. No auto-assignment, hence no override UI either.

**2. Path to implement / effort:**
- **Inbound capture:** stand up an inbound email address/mailbox (or IMAP polling job) that creates a draft correspondence record from each received message, storing sender/subject/body/attachments. **Effort: M (2 weeks).**
- **Classification/routing rules:** the complaints module already has a proven, admin-configurable rules engine (`conduct_triage_rules` + [TriageRules.tsx](../src/pages/admin/conduct/TriageRules.tsx), condition-fields + priority-ordered evaluation + a simulate/dry-run mode). The same pattern can be reused for correspondence (type/institution/subject/priority conditions → assigned team/officer outputs). **Effort: M (2 weeks)**, substantially reduced by reusing this pattern rather than designing a new rules engine.
- **Manual override/reassignment UI:** once there's an assignee field, a reassign action is a small addition. **Effort: S–M (about 1 week).**
- **Total: L (~5-6 weeks)** for the full capture→classify→route→override chain, but each piece is independently shippable and reuses existing patterns (queue/cron infra for capture, the triage-rule engine for classification).

### Q6. Document/records management for correspondence — version control, attachments, search, retention, historical retrieval?

**Status: ⚠️ Minimal, mostly schema-only**

**1. What's implemented today:**
- `complaint_correspondence.attachments` is a `jsonb DEFAULT '[]'` column (schema allows it), but it's dead in practice — [ComplaintInvestigationTab.tsx:108-114](../src/components/complaints/ComplaintInvestigationTab.tsx#L108-L114) has no file-upload control and never populates this field.
- No version control, no `correspondence_attachments` join table, no full-text search, no retention-schedule fields.
- `CorrespondenceHistory` in [SendCorrespondenceDialog.tsx:196-235](../src/components/correspondence/SendCorrespondenceDialog.tsx#L196-L235) queries dispatch history but is never imported/rendered anywhere — orphaned code.

**2. Path to implement / effort:**
- **Quick win — wire up the orphaned history component** into a reachable page. **Effort: S (1-2 days).**
- **Attachments upload UI** on `complaint_correspondence` — reuse the existing `secureFileUpload.ts` pattern already used elsewhere in the app. **Effort: S (2-3 days).**
- **Full-text search** — add a `tsvector` column + GIN index on subject/body, plus a search input on a correspondence list page. **Effort: M (about 1 week).**
- **Version control** — a revision/history table capturing prior versions on edit, plus a simple diff/history view. **Effort: M (1-2 weeks).**
- **Retention schedule** — a `retention_date`/disposal-eligible flag plus a scheduled job that flags (not necessarily auto-deletes) records past retention. **Effort: M (1-2 weeks).**
- **Total for full scope: M (3-5 weeks)**, but the quick wins (history view + attachments) are deliverable in under a week and deliver most of the day-to-day user value.

### Q7. Can reporting/dashboards be expanded to cover correspondence volumes, workload, aging, response performance, bottlenecks?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- No correspondence-specific dashboard/analytics/reports page exists — only a template-management CRUD page ([src/pages/admin/CorrespondenceTemplates.tsx](../src/pages/admin/CorrespondenceTemplates.tsx)).

**2. Path to implement / effort:**
- This is structurally **blocked on Q4** — aging/workload/SLA metrics require a status and assignee field to measure against, which don't exist yet.
- Once Q4 lands, building the dashboard itself is a well-worn pattern in this codebase (Recharts + aggregation queries, matching the existing Conduct/Prudential dashboards). **Effort: M (2-3 weeks)** after Q4 is done — comparable to the effort that built the existing Conduct Dashboard.

---

## Batch 3 — 2026-07-15 — Market Conduct Risk Assessment

**Scope note:** the codebase has a broader "supervisory risk score" (composite of prudential + conduct signals) rather than an isolated market-conduct-only framework. Called out explicitly below where relevant.

### Q8. Configurable Market Conduct Risk Assessment Frameworks (risk indicators, inherent risk, control effectiveness, residual risk), independently per sector (Insurance/Securities/Pensions)?

**Status: ❌ Not implemented as described**

**1. What's implemented today:**
- A conduct risk **tagging taxonomy** admin CRUD ([src/pages/admin/conduct/RiskTaxonomy.tsx](../src/pages/admin/conduct/RiskTaxonomy.tsx)) for classifying complaints/alerts — not a scoring framework (no weights, no inherent/control/residual fields).
- A **manual risk-rating log** per entity (`risk_ratings` table, [RiskRatingsTab.tsx](../src/components/entity-detail/RiskRatingsTab.tsx)) — free-text `overall_rating`/`risk_score`, no calculation behind it.
- **No per-sector configurability anywhere** — `licensees` carry a `sector_id`, but none of the risk tables (`conduct_risk_categories`, `risk_ratings`, `entity_risk_scores`, `risk_score_weights`, `conduct_monitoring_rules`) have a `sector_id` column at all.

**2. Path to implement / effort:**
- This is a genuine schema/engine redesign, not a config tweak: add `inherent_risk`, `control_effectiveness`, `residual_risk_rating` fields (with admin-configurable indicator/weight definitions per framework), and add `sector_id` scoping to the risk tables plus engine logic (in `risk-score-recompute`, `conduct_monitoring`, and `conduct_triage`) to select/apply the correct sector's framework.
- **Effort: L (4-6 weeks)** — schema redesign, an admin UI for defining indicators/weights per framework, and touching multiple existing edge functions to respect the new sector dimension. This is the single largest gap in the Market Conduct area from an engineering-scope perspective.

### Q9. Risk scoring methodology — can FSC admins configure weights, scoring methodology, and thresholds without vendor intervention?

**Status: ⚠️ A real formula exists, but it's not self-service configurable**

**1. What's implemented today:**
- Composite score computed in [supabase/functions/risk-score-recompute/index.ts](../supabase/functions/risk-score-recompute/index.ts): six weighted signals (breaches, complaints, overdue returns, enforcement, inspection findings, F&P alerts), banded into low/medium/high/critical.
- Weights/thresholds **are already stored in a DB table** (`risk_score_weights`) — the right shape for admin configurability — with RLS allowing `admin`/`super_admin` to update the row directly.
- No admin UI exists to edit this table; normalization caps (e.g. complaints capped at 10) are hardcoded constants in the edge function source.

**2. Path to implement / effort:**
- Since the config table already exists, this is primarily a **UI-build exercise**, not new engine work: an admin page to view/edit `risk_score_weights` (weights per signal + band thresholds), following the same admin-config pattern already used elsewhere (e.g. [MonitoringRules.tsx](../src/pages/admin/conduct/MonitoringRules.tsx)). **Effort: S (3-5 days).**
- Making the normalization caps configurable too (currently hardcoded `CAPS` constants) means moving them into the same config table and having the edge function read them. **Effort: S (2-3 days)** additional.
- **Total: S (about 1 week)** — this is the cheapest, highest-value fix in the whole Market Conduct batch since the hard part (the scoring engine itself) is already built correctly.

### Q10. Automatic identification of emerging conduct risks from complaints, supervisory findings, enforcement actions, returns, external data?

**Status: ⚠️ Threshold/rule-based monitoring exists; no cross-source correlation or trend/anomaly detection**

**1. What's implemented today:**
- Real, running rule-based monitoring (`conduct_monitoring_rules` + a 15-minute cron job) covering four single-metric rule types, raising `conduct_alerts` on breach.
- An LLM-generated narrative summarizing current counts (point-in-time, no memory of prior periods).
- No cross-source correlation, no historical trend analysis, no statistical outlier/anomaly detection — explicitly marked "Pending" in the project's own trackers (`docs/FEATURE_DEVELOPMENT_TRACKER.md:163`, `docs/ADMIN_FIRST_TODO_PLAN.md:326`).

**2. Path to implement / effort:**
- A pragmatic, non-ML first step: **rule-based trend/outlier detection** — e.g., flag when a metric deviates more than X% from its own trailing N-period average (a moving-average/z-score style check), computed from data already being collected. This is buildable without any ML infrastructure. **Effort: M–L (3-5 weeks).**
- **True cross-source correlation** (linking complaints + findings + enforcement + returns together into a single "emerging risk" signal) is a more open-ended data-science exercise with no existing analog in this codebase to build from. **Effort: L–XL (6-10+ weeks)**, best delivered incrementally (start with two sources correlated, expand from there) rather than as one project.
- External-data correlation is separately gated on Q20 (external intelligence integration) existing at all.

### Q11. Risk heat maps across Institution / Sector / Product / Distribution Channel / Complaint Category / Consumer Segment dimensions, configurable?

**Status: ❌ One fixed dimension only, not a true matrix, not configurable**

**1. What's implemented today:**
- [src/pages/supervision/RiskHeatmap.tsx](../src/pages/supervision/RiskHeatmap.tsx) renders one color-coded tile per entity, colored by composite risk band — a one-dimensional grid, not a two-axis matrix. No dimension picker; none of Sector/Product/Distribution Channel/Complaint Category/Consumer Segment are selectable or even queryable axes today.

**2. Path to implement / effort:**
- Two things are needed: (a) making the requested dimensions genuinely queryable — some groundwork already exists (`conduct_products.sector_id`, complaint category), but this needs to be joined through consistently, and Consumer Segment doesn't exist as a field anywhere yet and would need to be added; (b) a dimension-picker UI plus a true 2-axis matrix/heatmap visualization component (buildable directly on the existing Recharts stack — no new charting library needed).
- **Effort: M (2-3 weeks)** — moderate because the underlying risk-score data already exists; the work is mostly the cross-tabulation UI and filling in the one or two missing dimension fields (Consumer Segment).

---

## Batch 4 — 2026-07-15 — Complaint AI/analytics, predictive risk, cross-sector surveillance, export

### Q12. Complaint classification via configurable business rules AND AI/NLP (type, institution, product, consumer harm, keywords, regulatory breaches)?

**Status: ⚠️ Rule-based only — no AI/NLP anywhere in the classification path**

**1. What's implemented today:**
- A real, admin-configurable rules engine (`conduct_triage_rules`, [TriageRules.tsx](../src/pages/admin/conduct/TriageRules.tsx)) with a "Simulate" dry-run, evaluating complaint_type, product, channel, institution, customer type/vulnerability, keywords, repeat_count, SLA, severity, priority, conduct risk category, and age. "Keywords" is plain substring matching.
- No LLM/AI call anywhere in complaint intake or classification (the only AI calls in the repo — dashboard narrative, application decisioning, prudential return analysis — don't touch this path).

**2. Path to implement / effort:**
- The platform already has a proven pattern for prompt-based AI classification (`generate-application-ai-assessment`) that could be adapted: a new edge function invoked at complaint intake that asks the existing LLM gateway to suggest a classification/harm flag, surfaced as a **suggestion for human confirmation** (not an auto-decision, given false-positive risk in a regulatory context). **Effort: M (2-3 weeks).**
- Upgrading "keyword" matching to genuine semantic similarity would use Postgres's `pgvector` extension (available on Supabase) to store/search embeddings of complaint text. **Effort: M (2 weeks)** additional, independent of the LLM-classification piece above.

### Q13. Duplicate complaint detection (same institution/product/intermediary/issue)?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- A repeat-complainant counter (same person, same institution, 12-month window) and an alert-dedup hash — neither detects two records describing the same underlying incident.

**2. Path to implement / effort:**
- Simplest viable approach: Postgres's `pg_trgm` extension (trigram similarity, no AI dependency) to flag likely-duplicate complaints sharing institution/product with similar subject/description text, surfaced to a reviewer for confirmation (not auto-merge). **Effort: M (2-3 weeks).**
- A more semantically accurate version using embeddings (via the existing AI gateway) would catch paraphrased duplicates that trigram matching misses. **Effort: M–L (3-4 weeks)** instead, if higher recall is required.

### Q14. Complaint escalation on configurable criteria (consumer harm, age, institution risk rating, volume thresholds, recurrence)?

**Status: ⚠️ Partial — several triggers exist, but not all criteria and not all configurable**

**1. What's implemented today:**
- Automatic SLA-breach, thematic-volume-spike (admin-configurable), vulnerable-customer, and severity-based escalation. Recurrence-based escalation is hardcoded at `repeatCount >= 3` (not configurable, unlike the volume threshold). Manual escalation to enforcement exists. No escalation rule references the licensee's composite risk score/band at all.

**2. Path to implement / effort:**
- **Add institution-risk-rating as a triage condition** — join to `entity_risk_scores`/band in the existing rule engine, which already supports adding new condition fields. **Effort: S (2-3 days).**
- **Make the recurrence threshold admin-configurable** — move the hardcoded `3` into the existing `conduct_alert_thresholds` table (already used for thematic spikes) or the rule's own definition. **Effort: S (1-2 days).**
- **Total: S (about 1 week)** — both gaps are small, targeted additions to an engine that already supports this shape of configuration.

### Q15. Configurable Consumer Harm Indicators (frequency, severity, financial loss, resolution time, repeat complaints, vulnerability)?

**Status: ⚠️ Discrete fields exist; no unified/configurable harm-scoring engine**

**1. What's implemented today:**
- Vulnerability indicator, severity/priority, repeat-complaint count, SLA/resolution-time tracking, and upheld/resolution outcome all exist as standalone fields. No `financial_loss` field anywhere. No composite/weighted harm index combining them.

**2. Path to implement / effort:**
- **Add a `financial_loss` numeric field** to complaints plus a form-input update. **Effort: S (1-2 days).**
- **Build a composite harm score** — a weighted formula combining severity/vulnerability/repeat-count/resolution-time/financial-loss, reusing the same weights-table pattern already proven by `risk_score_weights` (see Q9), including an admin UI to configure the weights. **Effort: M (1-2 weeks).**
- **Total: S–M (about 2 weeks)** — this directly reuses an architecture pattern (weighted composite + config table) already validated elsewhere in the codebase.

### Q16. AI-based complaint pattern detection across institutions/products indicating systemic harm?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- Only deterministic threshold counting (`thematic_spike`, and the four `conduct_monitoring_rules` types) — no clustering, no cross-institution correlation, no AI/ML.

**2. Path to implement / effort:**
- Recommended first step (no ML required): **statistical outlier detection** — flag products/institutions whose complaint rate is a significant outlier vs. a peer group (similar to how prudential peer-ratio comparisons already work elsewhere in the codebase). Explainable and fast to ship. **Effort: M–L (3-5 weeks).**
- A true ML/embedding-based clustering approach (grouping complaints by latent similarity across institutions) is a larger, more open-ended effort with no existing infrastructure to build from. **Effort: L–XL (6+ weeks).** Recommend starting with the statistical approach and evaluating whether it's sufficient before investing in ML.

### Q17. AI detection of mis-selling, unsuitable advice, unfair treatment, fraud, conflicts of interest — models/algorithms used?

**Status: ❌ Not implemented — no AI models involved**

**1. What's implemented today:**
- These terms exist only as free-text taxonomy label examples an admin can type when creating a risk category — nothing auto-detects any of them.

**2. Path to implement / effort:**
- Pragmatic near-term approach: prompt-based LLM classification of complaint narratives against defined typologies (mis-selling, unsuitable advice, etc.), reusing the existing AI-gateway pattern, with **mandatory human review before any action is taken** given the false-positive/reputational risk of an AI-flagged mis-selling accusation. **Effort: M–L (3-5 weeks).**
- A purpose-trained classifier model (rather than a prompted general-purpose LLM) would be materially more accurate but requires an ML program (labeled training data, model training/validation, ongoing maintenance) that doesn't exist today. **Effort: XL (months)** — not recommended as a first step given no ML infrastructure exists; the prompt-based approach is the sensible entry point.

### Q18. Predictive Conduct Risk (models, confidence/accuracy measures, explainability)?

**Status: ❌ Not implemented — current risk score is backward-looking, not predictive**

**1. What's implemented today:**
- `risk-score-recompute` is a current-state composite (weighted sum of currently-open items), not a model trained to forecast future issues. No confidence/accuracy measure or explainability layer exists (nor would those concepts meaningfully apply to a hand-weighted sum).

**2. Path to implement / effort:**
- Genuine predictive modeling requires a proper data-science effort: historical labeled outcomes, feature engineering, model training/validation, an explainability layer (e.g. SHAP-style feature attribution), and ongoing MLOps (retraining cadence, drift monitoring). This is a fundamentally different kind of work from the rest of this codebase (which has zero ML training infrastructure today).
- **Effort: XL (3-6+ months)**, and should be scoped and resourced as its own distinct program/project — not bundled into the same delivery track as the other RFP items. Recommend a discovery phase first (data volume/quality assessment, hosting decision cloud-vs-on-prem) before committing to a build timeline.

### Q19. Cross-sector surveillance (Insurance/Securities/Pensions) — common framework with sector-specific overrides?

**Status: ⚠️ Common framework confirmed; sector-specific override does not actually function**

**1. What's implemented today:**
- One identical rule engine runs uniformly across all sectors (satisfies "common framework"). A `scope` column (`entity/product/sector/global`) exists on `conduct_monitoring_rules` with a UI dropdown — but the evaluation engine never reads it. `conduct_products.sector_id` exists but is never joined/filtered by the monitoring engine or dashboard filters.

**2. Path to implement / effort:**
- This is mostly **finishing what's already scaffolded**, not new architecture: wire the existing `scope`/`sector_id` fields into `evaluate-conduct-monitoring`'s evaluation logic (join through `licensee.sector_id` or `conduct_product.sector_id`, filter rule application by scope), and add a sector filter to the Conduct Dashboard.
- **Effort: M (about 2 weeks)** — meaningfully cheaper than Q8's full sector-scoped-framework rebuild because the columns/UI already exist; this is a much narrower "connect the wires" task.

### Q20. External intelligence integration (news feeds, social media, consumer review sites, ombudsman decisions, court rulings)?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- No RSS/news-API ingestion, no social-media/consumer-review connector, no ombudsman/court-ruling import exists among any edge function. All data originates solely from the platform's own tables.

**2. Path to implement / effort:**
- Each source is effectively a separate integration project with very different effort/risk profiles: **news/RSS ingestion** is the cheapest (M, 2-3 weeks); **social media** varies widely by platform (often requires paid API access and has volatile terms of service — L, 4-6 weeks); **consumer review sites** typically have no standard API (scraping raises legal/ToS concerns that need review before any build — L); **ombudsman/court rulings** depend entirely on whether the source publishes a structured feed — BOJ/FSC would need to identify a specific data source first before this is even schedulable.
- **Overall: L–XL**, and this should be treated as a **phased roadmap item pending source identification and licensing decisions** — not a single build with one effort number, since each source is independently gated on external factors outside engineering control.

### Q21. Early Warning Indicators (EWI) — how are they generated?

**Status: ⚠️ Exists conceptually under a different name; genuine "EWI" branding only exists on the prudential side**

**1. What's implemented today:**
- A literal "Early Warning" feature exists for **prudential** ratios ([PrudentialEarlyWarnings.tsx](../src/pages/supervision/PrudentialEarlyWarnings.tsx)). On the conduct side, the conceptual equivalent is the existing alert/monitoring system (real-time `conduct_alerts` + scheduled `conduct_monitoring_rules` sweeps), with most — but not all — thresholds admin-configurable (the `repeatCount >= 3` threshold is hardcoded — see Q14).

**2. Path to implement / effort:**
- Mostly a packaging/branding + small-gap-closing exercise rather than new capability: an admin page presenting the existing alert thresholds under explicit "Early Warning Indicators" terminology, plus closing the hardcoded-threshold gap from Q14, and optionally adding a softer "at-risk" tier that fires before a full threshold breach (a genuine leading indicator rather than only a lagging one).
- **Effort: S–M (1-2 weeks).**

### Q22. Drill-down analytics (executive/sector dashboard → institution → complaint → investigation → supervisory action)?

**Status: ✅ Implemented, verified multi-level click-through**

**1. What's implemented today:**
- Confirmed real path: Conduct Dashboard → Entities list → Entity profile (complaints/alerts/monitoring results/actions/investigations, each linking onward) → Complaint detail (with an Investigation tab and Escalate-to-Enforcement action) and/or a separate Investigations list/detail.
- One small gap: Investigation detail doesn't link directly to its resulting `conduct_actions` record (only visible together on the entity-profile page). No sector-level rollup in the dashboard.

**2. Path to implement / effort:**
- **No gap in the core capability** — this is implemented and working. The two minor items: a direct link from Investigation Detail to its resulting action (**S, 1-2 days**), and an optional sector-level rollup view on the Conduct Dashboard (**S–M, about 1 week**). Neither is required for the core "can users drill down" question — both are polish.

### Q23. Export to Excel, Word, PDF preserving formatting and drill-down?

**Status: ⚠️ CSV/XLSX/PDF supported as flat exports; no Word export; no drill-down preserved**

**1. What's implemented today:**
- A real export module ([exportService.ts](../src/pages/reports/services/exportService.ts)): CSV, XLSX, PDF (via `jspdf`+`jspdf-autotable`), and JSON. All flat/denormalized tabular data — no Word export (`mammoth` is only used to *import* .docx, never to generate it), and PDF isn't enabled on every report (gated by each report's own config). No per-record (complaint/entity/investigation) formatted export exists.

**2. Path to implement / effort:**
- **Word export** — add a `.docx` generation library (e.g. the `docx` npm package) mirroring the existing `exportService.ts` pattern. **Effort: M (1-2 weeks)**, including basic template/formatting design.
- **"Drill-down" preserved in a flat export** is inherently limited by the format — the realistic interpretation is nested/grouped sections or linked appendices within the document rather than true interactivity. **Effort: M (1-2 weeks)** to add grouped/nested rendering to the export pipeline.
- **Enable PDF universally** and add **per-record dossier export** (e.g., a formatted single-complaint or single-entity PDF) — **Effort: S–M (1-2 weeks)**, reusing the existing PDF pipeline.

---






















## Batch 5 — 2026-07-15 — Collaborative review, cycle-time, AI governance, dashboards/BI, submission channels, workflow extensibility

### Q24. Configurable collaborative review/markup — colored per-reviewer contributions, sidebar comments, Word-Track-Changes-style tracked edits, configurable role display?

**Status: ✅ Real feature, with one important caveat (not a rich-text editor)**

**1. What's implemented today:**
- A genuine, non-trivial feature: `review_comments` (threaded, blocking, resolvable, text-selection anchors), `review_suggestions` (insert/delete/replace, accept/reject), `review_role_display_settings` (per-role hex color + display toggles), `review_step_permissions` (per workflow-step-role action matrix). UI: [CollaborativeReview.tsx](../src/components/collab-review/CollaborativeReview.tsx), admin config: [CollabReviewConfigTab.tsx](../src/components/collab-review/CollabReviewConfigTab.tsx). Used across Application, Registration, Return, and Complaint detail pages.
- Caveat: the underlying document is a plain read-only `<Textarea>` — no rich-text/WYSIWYG editor, no real-time co-editing. Suggestions render as separate before/after blocks in a sidebar, not inline colored insertions/strikethroughs over a flowing document.

**2. Path to implement / effort:**
- **Recommend confirming with BOJ whether the current model already satisfies the requirement before investing further** — it covers the core attribution/auditability need.
- If a literal inline rich-text redline experience is a hard requirement: integrating a rich-text editor with a track-changes extension (e.g. TipTap + a collaborative/track-changes plugin) is a substantial rebuild of the review UI. **Effort: L (4-6 weeks).**
- If live multi-user real-time co-editing (not just async comments) is also required, that's a further architecture addition (CRDT/Yjs). **Effort: additional M–L (3-4 weeks)** on top of the rich-text rebuild.

### Q25. Automatic capture of time-per-stage and end-to-end cycle time for workflows/examinations (initiation→planning→fieldwork→QA→reporting→closure)?

**Status: ❌ Not implemented**

**1. What's implemented today:**
- `workflow_instances` has instance-level `started_at`/`completed_at`/pause tracking — total elapsed time per instance could be computed, but nothing does. No per-stage timestamp table. No "examination" entity with planning/fieldwork/QA/reporting phases exists at all (the closest, `inspections`, is a single flat record).

**2. Path to implement / effort:**
- Add a `workflow_stage_history` table populated by a hook/trigger on each step transition (start/end timestamp per stage), plus a reporting view (cycle-time-by-stage, average/median, bottleneck ranking) using the existing Recharts dashboard pattern. **Effort: M (2-3 weeks).**
- If BOJ needs a formal, distinct "examination" entity with named phases (not just generic workflow steps) — i.e., planning/fieldwork/QA/reporting as first-class stages on the `inspections` module specifically — that's additional schema + UI work on top. **Effort: additional M (2-3 weeks).**

### Q26. AI learning configured to weight feedback by reviewer authority (Senior Examiner corrections weighted more than Examiner's)?

**Status: ❌ Not implemented — and a genuine architecture mismatch**

**1. What's implemented today:**
- No training pipeline, no model-weight store, no reinforcement/fine-tuning code anywhere. Every AI call is a stateless one-shot prompt-completion request — the model has no memory of prior corrections. `application_ai_assessments` stores the analyst's decision as a human-override audit trail for accountability, not as a feedback loop.

**2. Path to implement / effort:**
- A literal trained/adaptive model with role-weighted learning requires a genuine ML training pipeline (data collection, labeling, retraining cadence, evaluation) — a fundamentally different architecture from today's stateless LLM-API pattern. **Effort: XL (3+ months)**, and not straightforwardly advisable given the scale of infrastructure it implies for a single feature.
- **A more practical alternative that achieves a similar governance goal:** use the existing decision-audit trail to build a periodically-curated set of examples that get folded into the *prompt* sent to the LLM (not model weights), optionally giving senior-reviewer overrides more prominence in that context. This is prompt-engineering, not model training, and should be described to BOJ as such — but it's achievable. **Effort: M–L (3-5 weeks).**

### Q27. Can BOJ change/substitute the underlying AI model (on-prem open-source or cloud)?

**Status: ❌ Not today — requires code changes, no config layer exists**

**1. What's implemented today:**
- Every AI-calling edge function independently hardcodes the model string (`"google/gemini-2.5-flash"`) — 6 separate functions, 6 separate hardcoded strings. The API key is externalized (rotatable without code change); the model/provider is not.

**2. Path to implement / effort:**
- Centralize the 6 hardcoded calls into one shared module (e.g. `_shared/ai-client.ts`) reading model/provider from an env var or config table, so switching models becomes a config change/redeploy instead of editing 6 files. **Effort: M (1-2 weeks).**
- Supporting a genuinely different provider (e.g., swapping the current gateway for direct OpenAI/Anthropic, or an on-prem inference endpoint) requires normalizing request/response shapes per provider on top of the centralization above. **Effort: additional S–M (about 1 week) per new provider integrated.**

### Q28. AI/ML model maintenance — retraining, versioning, drift monitoring, self-adjustment, vendor vs BOJ/FSC responsibility, on-prem considerations?

**Status: N/A as asked — there is no trained/tunable model to maintain**

**1. What's implemented today:**
- No training pipeline, no drift-monitoring code, no model-performance dashboard. What "maintenance" means today: Google/Lovable maintain the upstream Gemini model and gateway; the only maintenance action available to this project is updating a hardcoded model-name string if the current model is deprecated, and rotating the API key.

**2. Path to implement / effort:**
- If BOJ requires an on-prem/self-hosted model (for sovereignty or air-gap reasons), that's a significant infrastructure and MLOps undertaking: GPU-backed inference hosting, the abstraction layer from Q27 pointed at it, and — if fine-tuning is desired — an internal retraining/monitoring practice. **Effort: XL (2-4+ months)**, dependent on BOJ's hosting/hardware decisions. Recommend scoping this as a separate infrastructure project with its own discovery phase, not as a line item alongside the other RFP gaps.

### Q29. Dashboard/chart technology — proprietary vs Power BI/Tableau/etc.?

**Status: ✅ Proprietary, in-house — confirmed, no gap**

**1. What's implemented today:**
- `package.json` lists Recharts as the only charting library. Every dashboard renders Recharts components directly in React. No embedded third-party BI tool anywhere.

**2. Path to implement / effort:**
- N/A — this is a factual/architectural answer, not a gap. No further action needed unless BOJ specifically wants a BI-tool embed instead of the proprietary dashboards (which would be a strategic product decision, not a bug fix).

### Q30. Can data be exposed via API/direct DB connection to enterprise BI tools like Power BI?

**Status: ⚠️ Technically yes via Supabase's own REST layer; no purpose-built BI export exists**

**1. What's implemented today:**
- The frontend's entire data layer is Supabase's auto-generated PostgREST REST API, technically reachable by an external tool with the right credentials. A narrow `developer-api` edge function exists but is read-only and exposes only 3 whitelisted resources — not a general-purpose BI feed. No dedicated reporting connection/read-replica exists.

**2. Path to implement / effort:**
- Build a scoped, read-only reporting surface: either dedicated reporting views plus a restricted Postgres role (SELECT-only on those views) exposed via Supabase's connection pooler for Power BI's native Postgres connector, or an expanded, properly-scoped version of `developer-api`. The scoped-DB-role approach is generally preferable for BI tools since it supports native query/drill-down inside Power BI itself rather than being limited to whatever a REST endpoint pre-shapes.
- **Effort: M (2-3 weeks)** — defining the reporting views, creating the scoped role/credentials, and documenting the connection setup for BOJ's Power BI admins.

### Q31. Dashboard interactivity — drill-down by clicking charts?

**Status: ⚠️ Partial — no chart-segment click-through anywhere**

**1. What's implemented today:**
- The Conduct dashboard has real filtering (see Q32), but no dashboard implements click-a-chart-segment-to-drill-down — Recharts `onClick` is never wired on any bar/pie/line mark. Drill-down happens via separate link tiles instead.

**2. Path to implement / effort:**
- Wire `onClick` handlers on Recharts chart elements to navigate to the already-existing filtered list pages (the destination routes/pages already exist — this is just adding the click handler and a filter parameter). **Effort: S (3-5 days) per dashboard**, roughly **2 weeks total** across all four dashboards.

### Q32. Dashboard filters (date/institution/activity) updating all visualizations dynamically?

**Status: ⚠️ Implemented on one dashboard, not the others**

**1. What's implemented today:**
- The Conduct Dashboard has real global filters that re-run the query and recompute every KPI/chart/table on the page. Prudential, Analytics, and Executive dashboards are static (load-once or timer-refresh, no filter controls).

**2. Path to implement / effort:**
- Extend the same filter-bar-drives-all-widgets pattern already proven on the Conduct Dashboard to the other three dashboards. Since the pattern to copy already exists and works, this is replication, not invention. **Effort: S–M (1-2 weeks)** across the remaining dashboards.

### Q33. Self-service dashboard/report creation without vendor support?

**Status: ⚠️ Real ad-hoc builder, bounded to ~9 pre-approved datasets**

**1. What's implemented today:**
- A genuine ad-hoc report builder ([AdHocReportBuilder.tsx](../src/pages/reports/components/AdHocReportBuilder.tsx)) — pick dataset/columns/filters/grouping/sort, preview, save as a template, schedule. No code change needed to build a new report from existing datasets. The datasets themselves are a fixed, code-enforced whitelist of 9 sources.

**2. Path to implement / effort:**
- Adding a new dataset to the whitelist is a small, well-defined task following an existing pattern: update `ALLOWED_SOURCES` in the frontend service and the server-side edge function, then seed the column/filter metadata tables. **Effort: S (2-3 days) per new dataset** — not a redesign, just incremental additions as new datasets are requested.

### Q34. Data warehousing — architecture, volumes, retention, exposure to downstream tools?

**Status: ❌ No data warehouse exists — everything is live queries against the single transactional database**

**1. What's implemented today:**
- No materialized views, ETL/ELT pipeline, star-schema, or separate analytics DB connection. All reporting/dashboards run direct live queries against the operational Postgres tables. Report history is retained as ordinary rows in application tables.

**2. Path to implement / effort:**
- A lightweight interim step — materialized views for the heaviest/most expensive reports, refreshed on a schedule — reduces load on the operational database without a full warehouse build. **Effort: M–L (3-4 weeks).**
- A true separate warehouse (dedicated analytics database + ETL pipeline, star-schema modeling) is a significant infrastructure undertaking that should be scoped as its own project once data volumes and growth projections are actually known. **Effort: XL (2-4+ months).** Recommend a discovery/sizing exercise before committing to this path — the materialized-view interim may be sufficient for BOJ's near-term needs.

### Q35. Hybrid XML + Excel submission for the same return — validation, transformation, reconciliation to one internal structure?

**Status: ✅ Implemented for Returns specifically — client-side parsing, single reconciliation path**

**1. What's implemented today:**
- [ReturnUploadPanel.tsx](../src/components/returns/ReturnUploadPanel.tsx) lets a licensee download a template in either XLSX or XML, fill it, and upload it back; both parse client-side into an identical internal row shape and commit through the same RPC into the same table also used by the manual on-screen form. No XSD/schema validation (well-formedness only); the XML dialect is bespoke, not a regulator standard.

**2. Path to implement / effort:**
- Add XSD schema validation on the XML upload path (define a schema for the app's existing dialect, validate before accepting). **Effort: S–M (1-2 weeks).**
- Adopting a regulator-standard dialect (e.g. XBRL) instead of the bespoke format is a larger effort and depends entirely on whether BOJ mandates a specific standard. **Effort: L (4+ weeks)** if required.

### Q36. Is API-based submission a configuration of the default offering, or does it require customization?

**Status: Customization required**

**1. What's implemented today:**
- `developer-api` is GET-only at the transport level (CORS explicitly restricts to `GET, OPTIONS`) and exposes exactly 3 read-only resources. No write/submission capability, no write API-key scope exists anywhere.

**2. Path to implement / effort:**
- This genuinely is customization of the base product, not configuration — correctly scored as such on the stated 1-4 scale. However, effort is moderate because it reuses existing tables/RPCs (`return_form_data`, `import_return_form_data`) already proven by the Excel/XML channel (Q35): add a new authenticated POST resource with request validation, a new `returns:submit` API-key scope, and audit logging.
- **Effort: M (2-3 weeks)** for returns specifically. Extending the same capability to application submission would need a similar but separate effort since applications use different tables/workflow. **Effort: additional M (2-3 weeks)** for applications.
- Upgrade impact: this is additive (a new resource branch in one edge function plus a new scope value) rather than a change to the core schema — low risk to existing functionality.

### Q37. Offline form completion for applicants — evidence of offline-fill-then-upload for applications?

**Status: ❌ Not implemented for applications; a related (but distinct) mechanism exists only for Returns**

**1. What's implemented today:**
- No PWA/service-worker/offline infrastructure anywhere. License applications are a live, network-dependent, server-persisted form with no offline draft cache. The Returns download/edit/re-upload mechanism (Q35) is the closest analog but is wired only into Returns, not applications.

**2. Path to implement / effort:**
- Cheapest viable path: replicate the Returns pattern for applications — a downloadable Excel/XML template + re-upload/import flow, adapting the existing `returnTemplate.ts`/`ReturnUploadPanel.tsx` code to application forms. **Effort: M (2-4 weeks).**
- A true offline/PWA capability (service worker, offline draft caching directly inside the live web form, sync-on-reconnect) is a larger architecture change affecting the whole application-filling experience. **Effort: L (4-6 weeks).** Recommend clarifying with BOJ which of these two the requirement actually means before committing to either — "offline form completion" is often satisfied by the cheaper download/upload pattern.
- **No screenshots/evidence can be provided today because neither path exists yet for applications.**

### Q38. Workflow engine extensibility — new workflows/business rules/process changes via configuration, without vendor code changes?

**Status: ✅ Substantially real — a genuine no-code workflow builder, with defined limits**

**1. What's implemented today:**
- [WorkflowList.tsx](../src/pages/workflows/WorkflowList.tsx) (`/workflows`) is a fully-wired, non-mock builder: create workflows scoped by type/sector/category/service; add/reorder steps with approver roles/users, SLA, escalation, allowed actions, digital-signature requirement; configure notifications; save as templates; activate/deactivate with validation. Execution is genuinely data-driven (one generic RPC reads each step's config).
- Real limits: the 6 workflow entity types are a fixed code enum (a 7th category needs a developer). Conditional/branching logic exists as a schema column but isn't exposed in any UI — every workflow today is strictly linear.
- Two adjacent pages are non-functional mockups and must not be cited as evidence: `WorkflowConfig.tsx` and `returns-mgmt/ManageRules.tsx`.

**2. Path to implement / effort:**
- **Adding a new license type within the existing 6 categories is already zero-effort/self-service today** — no gap there.
- **Enabling a genuinely new workflow entity type** (a 7th category): extend the `WorkflowEntityType` union, add a routing branch in `usePerformAction`, and handle any special final-approval side effects specific to that new category. **Effort: M (2-3 weeks) per new entity-type category.**
- **Conditional/branching step logic** (UI + engine support for "if X then step Y else step Z"): the `condition` column already exists in the schema, which reduces scope vs. a greenfield feature, but the engine and UI both need real work to interpret and configure it. **Effort: M–L (3-4 weeks).**

### Q39. Workflow connectors — inbound/outbound connectivity, worked AML screening example, channel support (XML/API/portal/Excel) for submission and response?

**Status: ❌ No AML/sanctions connector exists; no generic connector abstraction; channel-agnostic submission exists only for Returns**

**1. What's implemented today:**
- **No real AML/sanctions/PEP-screening vendor integration exists anywhere.** The Fit & Proper "sanctions"/"PEP" checks are a plain keyword scan over self-declared text, explicitly commented in the code as "not a real sanctions-list check." "Adverse media" checks are an LLM asked to recall training-data knowledge, explicitly commented as "not a live third-party search." This should be stated plainly to BOJ, since assuming otherwise would be a material gap.
- No generic connector/integration-step abstraction in the workflow engine — every integration today is a bespoke hardcoded edge function.
- Channel-agnostic submission (web + Excel + XML into one record) works only for the Returns data-intake step; no other workflow step supports anything but the web portal.

**2. Path to implement / effort:**
- **Build a generic connector/integration step type** in the workflow engine (a step that calls an external API and ingests a result back into the workflow) — real platform engineering that pays off for every future integration, not just AML. **Effort: M–L (3-5 weeks).**
- **Integrate a specific AML/sanctions vendor** — separate effort, gated on vendor selection (see Q40); once a vendor and credentials exist, wiring it through the connector abstraction above (rather than as another bespoke function) is the efficient path.
- Recommend building the generic connector once, rather than a bespoke AML-only integration, since BOJ will likely want additional third-party checks (credit bureau, other KYC/AML sources) over time.

### Q40. Sample configuration of a third-party verification API integration (e.g. World-Check) — walkthrough of connector setup, credentials, results returned into workflow?

**Status: N/A today — cannot be demonstrated because no such connector exists**

**1. What's implemented today:**
- Nothing — no World-Check or equivalent integration anywhere, and no generic connector abstraction to configure one through (see Q39).

**2. Path to implement / effort:**
- **The blocking dependency is a vendor contract and API credentials, not engineering effort** — a walkthrough cannot honestly be produced before that exists, regardless of how the engineering work is prioritized.
- Once credentials are available: build one edge function following the existing `fp-screening-run`/`logIntegration()` pattern (or, better, wired through the generic connector from Q39 once it exists) to call the vendor API, store results, and surface them in the F&P screening UI. **Effort: M (2-3 weeks)** of engineering once a sandbox/trial credential is in hand.
- Recommend sequencing: (1) BOJ/vendor procurement conversation for a trial credential, (2) build the generic connector (Q39) in parallel, (3) wire World-Check through it, (4) then schedule the walkthrough.

---

## Consolidated gap list (living, update as batches are added)

*Each item below is expanded with implementation approach + effort estimate in its corresponding Q&A entry above — this list is a scan-friendly summary only.*

**Security (Batch 1):**
1. No idle/inactivity session timeout or absolute expiry enforcement; `SecuritySettings.tsx` UI is non-functional and unwired. *(Q1 — Effort: M, ~2-3 weeks combined)*
2. No account lockout after failed login attempts. *(Q1)*
3. No SSO/SAML/OIDC/LDAP integration with BOJ/FSC Active Directory (or any IdP). *(Q2 — Effort: L, 4-8 weeks, largely gated on BOJ IT coordination)*
4. No embedded reporting/BI tool exists yet — revisit SSO coverage once one is chosen. *(Q2)*
5. No malware/virus scanning engine in the file upload pipeline — `scan_status` is rubber-stamped `clean`, no quarantine workflow, no AV integration. *(Q3 — Effort: M-L, 2-6 weeks depending on cloud-API vs on-prem ClamAV)*
6. Marketing copy in `AnalyticsSection.tsx` overstates security capabilities ("virus scanning") — should be corrected to avoid misrepresentation in front of prospects/regulators. *(Q3 — Effort: S, trivial copy fix)*

**Correspondence (Batch 2):**
7. No first-class correspondence entity/lifecycle — no status model, no assignment field, no approval/maker-checker gate before send. *(Q4 — Effort: M-L, 3-5 weeks, reusing the existing workflow engine)*
8. Audit trail for correspondence is inconsistent — covered for `complaint_correspondence`, missing for `correspondence_dispatches`. *(Q4)*
9. No automatic capture of inbound correspondence (no email ingestion/webhook). *(Q5 — Effort: M, ~2 weeks)*
10. No classification or rules-based routing engine for correspondence, hence no manual-override UI either. *(Q5 — Effort: M, ~2 weeks, reusing the complaints triage-rule pattern)*
11. Attachments field on `complaint_correspondence` exists in schema but is unused; no version control, no full-text search, no retention schedule. *(Q6 — Effort: M, 3-5 weeks full scope; quick wins <1 week)*
12. `CorrespondenceHistory` component exists but is orphaned — never rendered in the app. *(Q6 — Effort: S, 1-2 days quick win)*
13. No correspondence reporting/dashboard. *(Q7 — Effort: M, 2-3 weeks, blocked on #7)*

**Market Conduct Risk Assessment (Batch 3):**
14. No true risk-assessment framework fields (inherent risk, control effectiveness, residual risk). *(Q8 — Effort: L, 4-6 weeks)*
15. No per-sector (Insurance/Securities/Pensions) configurability of risk frameworks/weights/thresholds. *(Q8)*
16. Risk scoring engine's weights/thresholds table is real, but there's no admin UI to edit it. *(Q9 — Effort: S, ~1 week — cheapest high-value fix in this batch)*
17. No isolated market-conduct-only score — current score is a blended prudential+conduct composite. *(Q9 — accept as-is or redesign; not separately estimated)*
18. No cross-source correlation or trend/anomaly detection for emerging risks. *(Q10 — Effort: M-L for rule-based trend detection, L-XL for true cross-source correlation)*
19. Risk heat map is a one-dimensional entity-by-band grid, not a configurable two-axis matrix. *(Q11 — Effort: M, 2-3 weeks)*

**Complaint AI/Analytics & Reporting (Batch 4):**
20. Complaint "keyword" classification is plain substring matching, not NLP; no AI touches classification/pattern detection; mis-selling/fraud/COI detection doesn't exist. *(Q12/Q16/Q17 — Effort: M for AI-assisted classification, M-L for pattern detection, M-L for typology detection — all recommend LLM-prompt approach with mandatory human review, not a trained classifier)*
21. No duplicate-complaint (same-issue) detection. *(Q13 — Effort: M using pg_trgm, M-L using embeddings)*
22. Complaint escalation doesn't factor in institution risk rating; recurrence threshold is hardcoded. *(Q14 — Effort: S, ~1 week)*
23. No unified/configurable Consumer Harm Indicator score; no `financial_loss` field. *(Q15 — Effort: S-M, ~2 weeks)*
24. No predictive conduct-risk model. *(Q18 — Effort: XL, 3-6+ months, needs its own program/discovery phase)*
25. Conduct monitoring's `sector` scope selector is never read by the evaluation engine. *(Q19 — Effort: M, ~2 weeks — mostly finishing existing scaffolding)*
26. No external intelligence integration at all. *(Q20 — Effort: L-XL, phased roadmap item gated on source identification/licensing)*
27. No distinct "EWI" feature/branding for conduct. *(Q21 — Effort: S-M, 1-2 weeks)*
28. Drill-down analytics has one small gap (investigation→action link) and no sector-level rollup. *(Q22 — Effort: S, 1-2 days + S-M, ~1 week)*
29. No Word (.docx) export anywhere; exports are flat with no drill-down structure preserved. *(Q23 — Effort: M, 1-2 weeks per item)*

**Collaborative Review, AI Governance, Dashboards/BI, Submission Channels, Workflow Extensibility (Batch 5):**
30. Collaborative review is comment/suggestion-based only — no rich-text editor, no real-time co-editing. *(Q24 — Effort: L, 4-6 weeks, only if BOJ confirms the current model is insufficient)*
31. No workflow/examination stage-level cycle-time capture or reporting. *(Q25 — Effort: M, 2-3 weeks, +M for a formal examination-phase model)*
32. No AI feedback loop of any kind (role-weighted or otherwise). *(Q26 — Effort: XL for literal model training; M-L for a practical prompt-engineering alternative)*
33. AI model/provider is hardcoded per edge function — no config layer to swap models. *(Q27 — Effort: M, 1-2 weeks to centralize + S-M per additional provider)*
34. No on-prem/self-hosted AI model option exists at all. *(Q28 — Effort: XL, 2-4+ months, its own infrastructure project)*
35. No purpose-built BI export/reporting-connection layer. *(Q30 — Effort: M, 2-3 weeks)*
36. No chart-click drill-down on any dashboard. *(Q31 — Effort: S per dashboard, ~2 weeks total)*
37. Only the Market Conduct dashboard has real dynamic cross-widget filtering. *(Q32 — Effort: S-M, 1-2 weeks to extend to the other 3 dashboards)*
38. Ad-hoc report builder is locked to 9 whitelisted datasets. *(Q33 — Effort: S, 2-3 days per new dataset)*
39. No data warehouse/OLAP layer exists. *(Q34 — Effort: M-L for a materialized-view interim; XL for a true warehouse)*
40. No XSD/schema validation on the Return XML channel; bespoke (non-standard) XML dialect. *(Q35 — Effort: S-M, 1-2 weeks; L if a regulator-standard dialect like XBRL is mandated)*
41. **No API-based submission channel exists for returns or applications** — genuine customization of the base product, not configuration. *(Q36 — Effort: M, 2-3 weeks per module, reusing existing tables/RPCs)*
42. No offline/PWA capability for license applications at all. *(Q37 — Effort: M for a download/upload-template approach; L for true offline/PWA)*
43. Workflow entity types are a fixed 6-category enum; step-level conditional/branching logic isn't exposed in any UI. *(Q38 — Effort: M per new entity-type category; M-L for branching logic)*
44. Two admin pages are dead mockups that must not be cited as working features (`WorkflowConfig.tsx`, `returns-mgmt/ManageRules.tsx`).
45. **No real AML/sanctions/PEP-screening vendor integration exists anywhere** — existing checks are keyword-scan and LLM-recall only, explicitly commented in the code as not real checks. Flag prominently. *(Q39 — Effort: M-L for a generic connector; additional effort once a vendor is chosen)*
46. No generic connector/integration-step abstraction in the workflow engine. *(Q39 — Effort: M-L, 3-5 weeks)*
47. Channel-agnostic submission works only for the Returns data-intake step. *(Q39 — covered by Q36/Q38 effort estimates for extending to other modules)*
48. A World-Check (or equivalent) integration cannot be demonstrated because none exists — blocked on vendor contract, not engineering priority. *(Q40 — Effort: M, 2-3 weeks once credentials exist)*

*(Append new batches below as more questions come in; when the user is ready, use the effort estimates above to sequence an implementation plan.)*
