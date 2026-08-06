# Conduct Intelligence — Published Reports (MCS-ANA-003)

Adds the missing Market Conduct intelligence reporting capability: officers build periodic reports from live conduct data, a senior officer approves, and approved reports can be published to the sector so regulated entities see them in their portal. Nothing existing changes behaviourally — this is additive, following the same pattern already used for Thematic Review closure reports.

## What gets built

### 1. Intelligence report templates (admin-configurable)
Seeded templates: Monthly Conduct Intelligence Report, Quarterly Conduct Review, Sector Supervision Update, Annual Consumer Protection Report, plus a Custom option. Each template defines its section list and recommended period length. Managed from an admin screen under Market Conduct config.

### 2. Report builder
New screen: **Intelligence Reports** (list) and a report detail/builder.

- Template selector + period picker (period pre-fills from template type).
- "Generate" aggregates live data for the chosen period and populates each section with auto-built data tables and charts:
  - Executive Summary (narrative)
  - Complaint Volume Analysis (trend by bucket, severity split, SLA breaches)
  - Top Conduct Issues (by risk category / product / channel)
  - Pattern Alerts Summary (open/actioned/dismissed by severity)
  - Thematic Review Outcomes (closed reviews, findings)
  - Enforcement Actions (actions by type/status in period)
  - Emerging Risks (narrative)
  - Recommendations (narrative)
- Each section has an officer-editable narrative box; generated metrics stay read-only alongside it.
- **AI Draft** button generates first-draft narrative per section from the aggregated numbers. AI text is clearly badged "AI draft", and the original AI draft is preserved in version history even after officer edits.

### 3. Versioning, approval, publication
- Each generate/save cycle creates a new version snapshot; earlier versions remain viewable.
- Status flow: `draft` → `pending_approval` → `approved` → `published` (or `rejected` back to draft), and `superseded` when a newer version is published.
- Validation: Executive Summary narrative must be non-empty before submitting for approval or publishing.
- Approval queue screen for senior officers (approve / reject with reason).
- Published reports can never be deleted — only superseded by a new published version (enforced in the database, not just the UI).
- Publication notifies in-scope entities via the existing notification event queue.

### 4. Entity portal — Regulatory Intelligence
New licensee-portal page listing published reports (sector/scope filtered), with read view and download. Entities never see drafts, pending, rejected or unpublished reports.

### 5. Export
Print-optimised, branded report view (BOJ/FSC logo from site branding settings) for PDF via print-to-PDF, plus a downloadable document export. Every export writes an audit event.

### 6. Audit
`INTELLIGENCE_REPORT_GENERATED`, `_EXPORTED`, `_PUBLISHED`, plus approve/reject transitions, all through the existing compliance audit logger.

## Technical notes

**Database (one migration)**
- `conduct_intelligence_templates` — code, name, sections (jsonb), recommended period, active flag.
- `conduct_intelligence_reports` — template ref, title, period start/end, status, regulator/sector scope, current version, published_at/by, supersedes_report_id, timestamps.
- `conduct_intelligence_report_versions` — report ref, version, sections payload (metrics + narrative + `ai_draft` per section), generated_by, created_at.
- `conduct_intelligence_report_recipients` (scope resolution for publication + entity visibility).
- GRANTs for `authenticated` and `service_role` on every new table (plus `anon` nowhere), RLS enabled, policies: internal read/write gated by the market-conduct permission helpers already in use; entity users read only rows whose status is `published` and whose scope matches their licensee; a `BEFORE DELETE` guard blocks deleting published reports.
- SECURITY DEFINER RPCs mirroring the thematic-closure style: `conduct_intel_generate_report`, `conduct_intel_save_version`, `conduct_intel_submit_for_approval`, `conduct_intel_approve_report`, `conduct_intel_reject_report`, `conduct_intel_publish_report` (marks any prior published version superseded, enqueues the notification event), `conduct_intel_log_export`.
- Aggregation happens in a SQL function reading `complaints`, `conduct_alerts`, `thematic_reviews` + findings, `enforcement_actions`, scoped by period and regulator — reusing existing bucketing semantics from `src/lib/conduct/analytics.ts` where they overlap.

**Edge function**
- `conduct-intelligence-ai-draft`: validates the caller's market-conduct permission, takes the aggregated section metrics, calls the Lovable AI gateway (same pattern as `generate-dashboard-insights`), returns per-section draft narrative. Errors return HTTP 200 with details in the body per project convention.

**Frontend**
- `src/pages/conduct/IntelligenceReports.tsx`, `IntelligenceReportDetail.tsx`, `IntelligenceApprovalQueue.tsx`
- `src/components/conduct/intelligence/` — `ReportBuilderCanvas.tsx`, `SectionEditor.tsx`, `ReportPreview.tsx` (print layout), `VersionHistoryDrawer.tsx`, `PublishDialog.tsx`
- `src/pages/entity/intelligence/PublishedIntelligence.tsx` (+ detail)
- `src/lib/conduct/intelligence.ts` — section definitions, validation, export helpers
- Routes registered in `dashboardRoutes.tsx` (module-gated `market_conduct`) and the entity route under an existing portal guard; sidebar entries added to the Market Conduct group in `src/config/navigation.tsx` after Thematic Closure Approvals, admin template screen with the other `market_conduct` admin items. Executive dashboard gets a "Intelligence Reports" link per the FRD entry point.
- Notification event keys seeded for publication.

**Verification before reporting done**
- pgTAP suite `supabase/tests/conduct/03_intelligence_reports.sql`: publish supersedes prior version, published report cannot be deleted, empty executive summary blocks approval submission, entity persona sees only published rows, internal personas' read/write matrix.
- Vitest unit tests for section validation and aggregation shaping.
- Browser run through the live app: generate → AI draft → submit → approve → publish → confirm the entity portal shows it and drafts stay hidden, with screenshots.
