# Extend Advisory AI to Examination, Enforcement, Complaints, Cross-Module Intelligence and Executive Workbenches

Reuse the advisory AI architecture already built for prudential risk/peer/heatmap work — same panel, same hook shape, same cache/staleness/fingerprint model, same "facts in, narrative out" contract. No new AI system, no new workflow engine.

## What stays untouched

All existing database models, workflow definitions and transitions, examination stages and workpaper sign-offs, maker/checker separation, complaint workflow / QA / RFI approvals, enforcement approvals and lifecycle, escalation rules, SLA and deadline logic, RBAC/RLS, audit logging, notifications, document generation, dashboards, filters and drilldowns. Nothing AI produces is written to a supervisory table; every regulatory action stays a human click in the existing panel.

## Shared foundation (built once, used by all five modules)

- **One new edge function** `generate-supervisory-ai-analysis`, modelled line-for-line on `generate-prudential-ai-analysis`: `requireUserPermission` gate per module, caller-supplied deterministic facts only, strict JSON parse, `provider_state` handling (`NOT_CONFIGURED` / `RATE_LIMITED` / `INSUFFICIENT_DATA` / `PROVIDER_FAILURE`), `logIntegration` audit, fingerprint cache in `ai_insights`, analysis returned unsaved if persistence fails.
- **Permission gate per analysis type** so AI can never widen access: examination/enforcement types gate on their own module permission, cross-module and executive types assemble facts through the same RLS-scoped reads/RPCs the pages already use (service-role fact assembly is filtered by an explicit per-user visibility check first). A user who cannot see enforcement data gets no enforcement facts in any brief.
- **Generalised frontend layer**: promote the prudential panel/hook into `src/components/ai/AdvisoryAiPanel.tsx` + `src/hooks/useAdvisoryAiAnalysis.ts` + `src/lib/ai/advisoryAi.ts` (types, fingerprint, section labels, state messages), with the existing prudential imports re-exported so the current prudential placements keep working unchanged.
- **Output shape extended, not replaced**: existing sections plus `facts[]`, `interpretation[]`, `evidence_refs[{label, kind, id, route}]`, `draft_sections[{heading, text}]`, `gaps[]`. Evidence refs render as drilldown links (`[View finding]`, `[View complaint]`, `[View examination]`, `[View enforcement case]`).
- **Draft handling**: drafts render read-only under an "AI draft — reviewer confirmation required" heading with a **Copy to editor** action that fills the existing form field. Saving remains the existing manual submit.
- **Labelling**: every panel carries "AI-assisted analysis — advisory" plus "This analysis supports supervisory review. It does not change official findings, workflow stages, risk ratings, enforcement decisions or case outcomes."
- **Feature flags** in `src/lib/featureFlags.ts`: `EXAMINATION_ADVISORY_AI_ENABLED`, `ENFORCEMENT_ADVISORY_AI_ENABLED`, `COMPLAINTS_ADVISORY_AI_ENABLED`, `CROSS_MODULE_ADVISORY_AI_ENABLED`, `EXECUTIVE_ADVISORY_AI_ENABLED` (prudential flag unchanged).
- **Behaviour**: nothing generates on page load; panels are collapsed with an explicit Generate / Refresh action, show generated timestamp + source period + requester, show "Analysis may be outdated" when the fingerprint no longer matches, and on failure show "AI analysis is temporarily unavailable. [Try again]" while the module keeps working.
- **Feedback**: Helpful / Not helpful / Flag incorrect analysis recorded against the stored analysis row only.

## Phase 1 — Inspection & Examination Management

Mounted in `ExaminationWorkspace.tsx` and its panels; no stage, sign-off or report transition logic changes.

- Overview tab: **AI Examination Brief** — supervisory history, prior findings, outstanding remediation, recent risk movement, conduct signals, areas needing attention, each with evidence links.
- Scoping panel: **Suggest examination focus areas** with evidence per suggestion; "Add to scope" remains the existing manual scoping action.
- Data requests panel: **Suggest information requests** as an editable list; creating an RFI stays manual.
- Workpapers panel: **Summarize evidence** plus missing/contradictory/repeated observations. No preparer or reviewer sign-off from AI; independent-review controls untouched.
- Findings panel: **Draft finding** (title, observation, criteria, evidence refs, possible root cause, risk/impact, suggested recommendation) copied into the existing finding form; severity never auto-set. Plus **Consistency check** on a draft finding (unsupported statements, missing evidence, duplicates, inconsistent severity, vague recommendations, observation/evidence contradictions).
- Reports panel: **Draft report sections** (executive summary, scope, major findings, recurring themes, management response, remediation) as copyable text; approval/issue/sign flow unchanged.
- Management responses: **Response analysis** comparing responses to findings and target dates.

## Phase 2 — Supervisory Actions & Enforcement

Mounted in `EnforcementDetail.tsx` / `EnforcementLifecyclePanel` / obligations panel.

- **Generate case chronology** from authoritative case events, each line linked to its record.
- **Evidence assessment**: supporting, potentially contradicting, missing evidence, related prior supervisory events, and explicit gap statements.
- **Historical comparison — advisory** over authorized internal enforcement cases only, never presented as binding.
- **Draft documents** (warning notice, information notice, direction, allegation summary, case summary, internal memo) labelled "AI-generated draft — legal/regulatory review required", copy-to-editor only; nothing issued or sent.
- Sanction/penalty: existing deterministic matrices and statutory limits stay the authoritative display; AI only summarises aggravating/mitigating factors. No sanction selection, status change or notice issuance from AI.

## Phase 3 — Market Conduct & Complaints

Mounted inside the existing guided Complaint Detail tabs; Current step, closure, QA and RFI approval flows untouched.

- Classification & case setup: **Suggested classification — reviewer confirmation required** (complaint category, conduct category, affected product, vulnerability indicators, severity considerations, possible related complaints). Never overwrites official classification; severity remains system/triage-controlled.
- Overview: **Generate case summary** — complainant position, entity response, disputed facts, evidence received, outstanding questions, current workflow state (state read from the platform, never inferred).
- **Similar complaint detection** with `[View related complaints]`; no automatic merge or duplicate marking (existing duplicate module stays authoritative).
- **Possible systemic conduct issue — supervisory review required** recurrence panel on the conduct/analytics surface; no automatic enforcement case creation.
- Investigation tab: **Investigation assistance** — summarise tasks, evidence, responses, RFI replies; surface contradictions, unanswered questions, missing evidence, suggested follow-up questions.
- Closure & QA: **Draft investigation summary / resolution rationale / complainant response / internal memo** (copy-to-editor), and **QA assistance** checking rationale coverage, evidence references, unresolved issues, outcome/evidence contradictions. AI cannot resolve, close or QA-approve.

## Phase 4 — Cross-Module Supervisory Intelligence

- **AI Supervisory Brief** on the entity 360 profile: overall picture, prudential and conduct developments, examination history, open findings, enforcement history, outstanding remediation, licensing/F&P issues, emerging cross-module concerns — every point with evidence links.
- **Cross-module pattern detection** that explicitly labels correlation and refuses to assert causation the data does not establish.
- **"What else should I know about this entity?"** related-event panel surfacing materially relevant authorized events from other modules, mountable beside a finding, complaint or enforcement case.
- **Governed natural-language supervisory queries**: a fixed catalogue of parameterised, RLS-scoped queries (entities with rising complaints and deteriorating liquidity; high-risk entities with overdue remediation; repeated governance findings across examinations; material sector changes this month). The model selects a query + parameters from the catalogue; it never receives SQL or database access. Answers render as answer + supporting data + data period + evidence links + limitations.

## Phase 5 — Executive & Supervisory Workbenches

Layered onto `ExecutiveSupervisoryDashboard` and the role dashboards; the dashboard renders fully before any AI call.

- **AI supervisory briefing — advisory**: headline plus 3–5 items needing attention, each linked, with "View detailed analysis" for depth.
- **Role-based briefing** driven by the existing role/permission and dashboard-tier data (supervisory manager, complaints manager, prudential supervisor, enforcement manager) — no unauthorized content in any variant.
- **"What changed since…"** (yesterday / this week / a chosen date) computed from authoritative timestamps and event rows, interpreted by AI.
- **Suggested priorities** rendered as advisory text; authoritative queues are never reordered unless the user explicitly picks an AI-assisted sort.
- **Prepare supervisory meeting brief** with drilldowns; never distributed or sent automatically.

## Technical notes

- Migration: extend `ai_insights` with the analysis-type values and any missing columns the new scopes need (module scoping, evidence refs, draft payloads), plus GRANTs and RLS policies mirroring each module's existing read scope. No changes to existing prudential rows or columns.
- Facts assembly per analysis type lives in `supabase/functions/_shared/supervisory-facts.ts` — reads already-computed rows only (examinations, findings, workpapers, remediation/`prudential_actions`, complaints and RFIs, enforcement actions/obligations/events, risk scores, EWI alerts, F&P). No metric is recomputed.
- Data minimization: structured extracts only — supervisory identifiers, dates, statuses and computed metrics. No tokens, credentials, unrelated PII or whole documents. Audit records the generation event, type and scope, not prompt bodies.
- Audit: `logIntegration` for every gateway call plus a compliance audit entry per material generation ("AI examination brief generated", "AI finding draft generated", "AI complaint summary generated", "AI enforcement evidence assessment generated", "AI supervisory briefing generated").
- Output validation rejects any non-conforming JSON and surfaces the unavailable state rather than rendering partial or free-text output.

## Verification per phase

- Module works identically with its flag off, and with AI simulated as down/timed-out/invalid-output.
- Every quantitative sentence traceable to a platform value; unavailable data reads "Data is not available."
- No workflow transition, sign-off, finding, action, notice, closure or QA approval is ever created by an AI path (checked against audit and workflow tables after generating in each module).
- Access control: a user without a module permission gets neither the panel nor that module's facts inside cross-module and executive briefs.
- Stale path: generate, mutate underlying data, confirm the outdated banner and refresh behaviour.
- Existing prudential and application AI panels regression-checked after the shared-layer extraction.
