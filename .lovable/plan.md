# Market Conduct Supervisory System — Execution Plan

The uploaded master plan explicitly forbids starting feature work before a repository-truth pass (EPIC MC-00, Execution Rule 1, and instruction 11: "Do not start MC-01 until MC-00 has a clear evidence-backed closure plan").

This plan therefore delivers **MC-00 only** in the next turn, and locks the sequencing for the remaining twelve epics.

## What already exists (verified at HEAD)

- Public consumer intake at `/complaints/file` (`src/pages/public/PublicComplaintIntake.tsx`, 389 lines) — a single-page form, not the required 7-step guided wizard.
- A large governed RPC surface already in use: `create_complaint`, `create_complaint_with_attachments`, `finalize_complaint_with_attachments`, `classify_complaint`, `execute_complaint_workflow_action`, `complaint_rfi_*` (raise/draft/submit/approve/reject), `complaint_record_closure_review`, `detect_complaint_duplicates`, `run_complaint_escalation_sweep`, `complaints_analytics`, `get_public_complaint_tracking`.
- Complaint screens: List, Detail, Tracking, Analytics, Bulk Intake, New Internal Complaint, duplicates, escalations, RFI approvals.
- Conduct screens: Dashboard, Alerts, Work Queue, Findings + Finding Detail, Investigations + Detail, Investigation Closure Queue, Remediation Detail, Surveillance Workspace, Supervision Loop, Conduct Actions, Conduct Entities.
- Supporting panels for evidence, interviews, closure, post-closure monitoring, related cases, governed steps, vulnerability review, triage history.
- Existing docs to reconcile: `docs/market-conduct-supervision-qa.md`, `docs/certification/p08-conduct-complaints-depth.md`, `docs/certification/p12-p08-closure-certification.md`.

Whether each of these fully satisfies the target model is exactly what MC-00 must establish with evidence — it is not assumed here.

## MC-00 — Repository Truth & Canonicalization (next turn, no feature work)

Deliverable: `docs/product/MARKET_CONDUCT_CURRENT_STATE.md`, containing:

1. **Object inventory** — every complaint/conduct/signal/alert/investigation/finding/remediation/enforcement-referral table at HEAD, with row counts, RLS state and grants, queried from the live database.
2. **Capability mapping** — each of the master plan's canonical objects (sections 5, 18-33) mapped to a current object and classified `REUSE` / `EXTEND` / `NEW` / `MIGRATE` / `DEPRECATE`.
3. **Governed-write map** — every RPC in the domain, plus a full inventory of browser-side direct writes (`.insert/.update/.delete`) that control status, ownership, decisions, classification, findings, redress, closure, review, remediation, enforcement referral or supervisory rating. These become the MC-00 remediation backlog (Rule 6).
4. **Duplicate/conflicting lifecycle objects** — e.g. overlapping complaint status catalogues, triage rule sets, escalation engines, duplicate-detection paths.
5. **Route inventory** — current complaint/conduct routes vs the section 38 navigation target, marking stale/legacy routes and redirects.
6. **Test + certification baseline** — existing pgTAP suites, `e2e/cert-v2` specs, and which target journeys have no coverage.
7. **Stale documentation register** — docs that contradict current behaviour.
8. **Proposed MC-00 canonicalization migration/refactor plan** — an ordered, evidence-backed closure list (governed-write replacements, table consolidations, route retirements) with nothing executed yet.

MC-00 changes no schema and no UI. Its only writes are the new document plus, if needed, a status matrix stub.

## Epic sequence after MC-00

Executed strictly one epic per approved turn, each closing with schema/migration, governed RPCs, RLS/RBAC, UI, audit, notifications, tests, runtime evidence, docs and status matrix, reported as **BUILT / TESTED / RUNTIME CERTIFIED / DEFERRED** (never collapsed):

| Epic | Scope |
| --- | --- |
| MC-01 | Public complaint intake — 7-step wizard, representative model, accessibility/vulnerability, respondent-not-found + suspected unlicensed provider, structured product/channel, incident/harm, prior entity complaint, desired outcome, governed canonical submission |
| MC-02 | Jurisdiction assessment + triage (harm severity, operational priority, conduct risk, systemic potential) |
| MC-03 | Investigation plan, allegation/issue model, evidence management, RFI + formal representations |
| MC-04 | Individual redress, closure prerequisites, QA policy, review/reconsideration |
| MC-05 | Conduct signals + alert register |
| MC-06 | Deterministic patterns, similarity clustering, server-authoritative analytics |
| MC-07 | Conduct 360 + formal conduct risk assessment |
| MC-08 | Conduct supervisory plans + thematic reviews |
| MC-09 | Formal conduct investigation + interviews + findings |
| MC-10 | Systemic remediation programmes + enforcement referral |
| MC-11 | Effectiveness review + recurrence monitoring |
| MC-12 | AI Intelligence Centre governance levels (AI-1..AI-4), failure-mode handling, certification dataset, negative security matrix, final certification |

## Governing rules applied throughout

- One canonical authority per business action; authoritative writes go through governed RPCs only.
- Deterministic logic before probabilistic; AI stays advisory (AI-1..AI-3), never takes a workflow action, always cites real source records, and shows an explicit unavailable/simulated state when the provider is not live.
- No invented regulation — jurisdiction grounds, SLA and QA policy stay configurable, seeded only as clearly labelled demo configuration.
- No user-facing technical leakage (no raw IDs, role codes, table or function names) — business labels only.
- Certified existing behaviour is preserved; supersession is deliberate, tested and documented.
- No completion claim without runtime evidence.

## Technical notes

Backend work uses migrations for schema plus governed `SECURITY DEFINER` RPCs with explicit grants and RLS aligned to the existing `sec_*` scope model and regulator scoping. Frontend follows the existing patterns: route modules under `src/routes`, `EnterpriseDataGrid` for registers, breadcrumb engine coverage, `src/platform` logging/error types, and TanStack Query hooks under `src/hooks`. Tests extend `supabase/tests` (pgTAP) and `e2e/cert-v2`.
