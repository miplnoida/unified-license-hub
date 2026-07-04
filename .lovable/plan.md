
# Plan — Non-Technical Demo Presentation Guide

## Goal
Add a single new Markdown file — `docs/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.md` — that a non-technical presenter can follow end to end. No application code changes.

## Source coverage (57 demo IDs total)
Every row from every uploaded spreadsheet will get its own step and its own row in the coverage matrix. IDs to be covered:

- **Script 1 — Licensing (12):** DEMO-ULRA-001 … 012
- **Script 2 — Fit & Proper (15):** DEMO-FPA-001 … 015
- **Script 3 — Prudential (11):** DEMO-PRUD-001 … 011
- **Script 4 — Market Conduct (10):** DEMO-MCS-001 … 010
- **Script 5 — Dashboards / Reporting / Audit (9):** DEMO-DPA-001 … 009

For each ID I will carry over: Scenario name, Detailed Steps, Vendor Actions, Expected Outputs, Evaluation Intent, Evidence Required, Requirement Mapping.

## Document structure (matches the requested format exactly)

1. **Demo Preparation** — required accounts (Applicant, Licensing Officer, Analyst, Legal Reviewer, Approver, FP Assessor, FP Committee, Prudential Supervisor, Conduct Supervisor, Complainant, Admin), suggested demo data (Caribbean Trust Bank Ltd, Jonathan Williams CEO, etc.), browser setup (Chrome, 1440×900), tabs to pre-open (Dashboard, Applications queue, Fit & Proper register, Prudential returns, Conduct complaints, Reports, Audit), login order, fallback rules for partial features.

2. **Demo Storyline** — one plain-English narrative that threads the five scripts into one story about Caribbean Trust Bank applying for a banking licence, going through RFI → analyst/legal review → Fit & Proper on CEO → prudential + conduct findings → Twin Peaks conditional clearance → issuance → ongoing supervision → dashboards & audit.

3. **Step-by-Step Demo Script** — 57 steps, one per spreadsheet ID, each in the mandated 8-field format (Purpose / Login as / Go to / Action / Values / Presenter script / Expected result / Evidence / Fallback). Steps grouped into 5 acts matching the scripts and their time slots.

4. **Spreadsheet Coverage Matrix** — one big table with 57 rows, columns: Script | Feature/Action | Evaluation Intent | Expected Output | Evidence Required | Demo Step # | Screen/Page | Status (Covered / Partial / Not Available) | Presenter notes. Status assigned per what actually exists in this app (based on codebase: FP module, applications queue, RFI, workflow engine, twin-peaks clearance lib, returns, complaints, dashboards, audit, exports — most Covered; AI-assisted analyst review, weighted committee voting, adverse-media scoring, integration logs marked Partial with workaround).

5. **Suggested Demo Data** — full sample values block as specified (applicant, licence, RFI, F&P, prudential, conduct, twin peaks, audit/reporting).

6. **Presenter Script** — opening, per-module narration, transitions, closing — plain spoken language.

7. **Timing Plan** — 45-minute plan aligned to spreadsheet time slots (8:45 → 6:00 compressed to ~5+8+7+7+8+5+5 min).

8. **Presenter Checklist** — pre-demo readiness list.

9. **Feature Gap Notes** — plain-English list of partial/planned items with what to show instead (e.g. AI screening: show manual screening + notes card; weighted voting: show determinations panel + rationale; integration logs: show audit + notifications log).

## Deliverable
One new file:
- `docs/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.md`

No other files created, modified, or deleted.
