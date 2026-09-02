# OLRAS — Technical Proposal (Features, Capabilities & Screenshots)

A standalone technical proposal document for Saint Lucia FSC that describes what the OLRAS platform already does — every functional module, its capabilities, and an annotated screenshot of the corresponding screen. No commercial pricing, no implementation/rollout plan (those live in the two existing documents).

## What the document contains

1. **Cover & document control** — title, client, document ID, version, date, confidentiality.
2. **Table of contents.**
3. **Platform overview** — purpose, regulatory operating model (five process groups), audience/persona model, technology posture at a high level.
4. **Capability architecture map** — how modules relate across Market Entry, Regulated Entity Supervision, Conduct & Supervisory Response, Regulatory Action, Governance & Intelligence.
5. **Module chapters** — one chapter per functional area, each with: purpose, capability bullet list, roles that use it, key outputs/artifacts, and a captioned screenshot.
   - Public & Applicant Services: public portal, public register, online registration, complaint lodgement and tracking.
   - Registration & Licensing: registration review queue, application queues, licence register, licence lifecycle, post-licensing requests, Fit & Proper assessment.
   - Entity Intelligence: entity directory, Entity 360, ownership/UBO structure, entity resolution.
   - Prudential Supervision: prudential dashboard/analysis, ratios and thresholds, breach and stress indicators, group supervision, payment & PFMI oversight.
   - Returns & Compliance: obligations, filing calendar, filing workspace, returns review queue.
   - Market Conduct & Complaints: work queue, attention list, complaints intake/list/analytics, investigations, thematic reviews.
   - Regulatory Action: enforcement queue, appeals, penalties.
   - Correspondence & Notifications: inbox, dashboard, templated email/SMS/in-app delivery.
   - Fees & Payments: fee configuration, payment history, currency and exchange rates.
   - Reporting & Analytics: report library, ad-hoc builder, schedules, executive supervisory dashboard.
   - AI Governance: overview, models/surfaces, instructions, assurance, exceptions, activity log, vendor-neutral presentation.
   - Administration & Security: control panel, users, roles/RBAC, settings hub, SLA, audit logs.
6. **Cross-cutting technical capabilities** — RBAC and maker-checker, row-level data isolation, multi-regulator/sector scoping, audit trail, workflow engine, rule engine, dynamic form builder and versioning, document/evidence storage with signed URLs, integrations (SSO, REST/webhook, payment gateway, email/SMS), performance and accessibility, responsive design.
7. **Standards & compliance alignment** — traceability of capabilities to regulatory supervision expectations already implemented (audit, segregation of duties, evidence retention).
8. **Screenshot index** — figure list with module reference.

## Screenshots

- Reuse the 54 already-captured screens under `public/user-manual/screenshots/` as the primary figure source.
- Capture the missing screens (entity resolution, group supervision, PFMI/payment oversight, breach/stress, executive snapshot, report builder, settings sub-pages, licensee portal views) headlessly against the running preview at 1280px width, saved to a scratch folder — not committed to the project.
- Every figure gets a numbered caption ("Figure 12 — Returns filing workspace") and sits inside its module chapter, sized to the content width so nothing is clipped.

## Technical approach

- Generate with the `docx` Node library from a script under `/tmp`; output to `/mnt/documents/MIPL_OLRAS_Technical_Proposal_v1.docx`.
- US Letter, Arial, navy/green Misha Infotech styling consistent with the two existing proposal documents; header/footer with document ID and page numbers; TOC field.
- Images embedded via `ImageRun` with explicit `type` and alt text, scaled to 6.5in width preserving aspect ratio.
- Validate the package, convert every page to an image, and inspect all pages for clipped text, oversized/misplaced images, blank pages and broken tables; fix and re-run until clean.
- No project source files are modified.
