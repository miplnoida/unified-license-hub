# 18 — FRD Traceability Strategy

## Objective
Every FRD requirement (BOJ + FSC) maps to: feature module → services → routes → tests → audit actions. Regulators can be shown a matrix at any time.

## Artefacts
1. **`docs/frd/BOJ_FRD.md`** — imported FRD, sectioned by requirement ID (e.g. `BOJ-LIC-001`).
2. **`docs/frd/FSC_FRD.md`** — same.
3. **`docs/frd/TRACEABILITY.csv`** — machine-readable:
   ```
   req_id, title, module, service, route, test, audit_action, status, notes
   BOJ-LIC-001, "Grant a new license", licensing, grantLicense, /admin/licenses, grantLicense.test.ts, license.granted, Implemented, ""
   ```
4. **Feature READMEs** — each lists the FRD IDs it satisfies.

## Process
- New feature EPIC starts by extracting FRD IDs into TRACEABILITY.csv with `status = Planned`.
- PR template requires updating `status → Implemented` and referencing tests.
- CI script (`scripts/verify-traceability.mjs`) verifies each `Implemented` row has an existing test file and audit action.

## Statuses
- `Planned` — accepted, not started.
- `In-Progress` — code merged behind flag.
- `Implemented` — merged, tested, audited.
- `Waived` — with sign-off note.

## Regulator Deliverable
Nightly job renders `TRACEABILITY.csv` → `docs/frd/traceability-report.md` grouped by requirement status. Ship as PDF from Reports module for regulator review.

## Ownership
- Product Owner: authoritative FRD text.
- Solution Architect: mapping to modules.
- Feature lead: implementation status + tests.
