# FRD Gap Tracker v4 — Refreshed Done / Pending Status

Produce a new Excel tracker (`FRD_Gap_Tracker_v4.xlsx`) that re-verifies every requirement in `ABC_FRD_v1.docx` against the repository as it stands today. No code changes.

## Why a new version is needed

v3 was generated before several modules landed. It records 75 Done / 19 Partial / 6 Missing (84.5%). Since then, work has been completed on the Rule Engine (Library, Editor, Tester), Integration Manager (registry, adapters, retry queue, dead-letter queue, health console), Licensing Appeals, and the Notifications & Communications stack — all of which v3 still lists as Partial or Missing. Those rows must be re-checked and re-scored from evidence, not carried forward.

## What the v4 file will contain

1. **Summary sheet** — per-module totals (Done / Partial / Missing), completion %, overall score, plus a "Changed since v3" count.
2. **Tracker sheet** — one row per FRD requirement, with: S.No, Module, FRD ID, Screen / Requirement, FRD Purpose, Status, % Complete, Evidence in Repository (routes, components, tables, functions), Gap / What is Missing (point by point, not a general conclusion), Priority, Est. Effort (days).
3. **Delta sheet** — only the rows whose status changed versus v3, with old status → new status and the evidence that justifies the change.
4. **Pending Backlog sheet** — every Partial and Missing item broken into concrete sub-tasks, each with the specific missing screen, field, action or audit event named, ordered by priority.

## How each row is verified

For every requirement, evidence is gathered before scoring:
- Frontend: route registration and the page/component that renders the screen.
- Backend: tables, RLS policies, RPCs, triggers, edge functions, cron jobs.
- Verification: pgTAP / Deno test files and `docs/verification/**` artefacts where they exist.

Scoring rules kept identical to v3 so the comparison is meaningful:
- **Done** — screen exists, backend persists, and the FRD's stated actions/audit events are present.
- **Partial** — exists but named FRD capabilities are absent; the gap column lists exactly which.
- **Missing** — no screen or backing data model.

Anything that cannot be confirmed by reading the repo is marked Partial with an explicit "unverified" note rather than assumed Done.

## Focus areas for re-verification

- Rule Engine (ADM-RE-001/002/003) and Integration Manager (ADM-INT-001) — likely upgrades to Done.
- Notifications, Communication Threads, Escalations — confirm against FRD trigger matrix.
- Known open clusters to re-confirm and detail: Onsite Examination lifecycle, Financial Group consolidated profile, Payment Systems oversight/PFMI, Market Conduct surveillance & conduct profile, Complaint bulk intake and RFI oversight, Enforcement compliance monitoring, Override registry and Data lineage viewer.

## Delivery

The file is written to `/mnt/documents/FRD_Gap_Tracker_v4.xlsx` and shared in chat as a downloadable artefact. v3 is left untouched. No application code, migrations or configuration are modified.
