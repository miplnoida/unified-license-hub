# Remaining FRD Closure — Phase 8/9 Verification, then Phases 10–12

Phases 1–7 stay frozen. Phase 8 and Phase 9 implementations are not rebuilt — only verification is added.

## Verified current state (checked this turn)

- `supabase/tests/` contains phase1–phase7, complaints, conduct, notifications, rbac, integrations, rule_engine — there is **no** `phase8/` directory, so Phase 8 has no dedicated pgTAP suite.
- `supabase/tests/notifications/10_communication_registry.sql` exists from the Phase 9 work and is the file to strengthen.
- Lineage appears nowhere in `src/` or `supabase/` except an unrelated mention in `ComplianceAuditLogs.tsx` — no lineage RPC, viewer, or node contract exists.
- Phase 8 RPCs (`set_conduct_signal_disposition`, `refer_conduct_signal_to_investigation`) and the Phase 9 `communication_timeline` RPC exist in migrations and are wired to `useConductSurveillance.ts` / `CommunicationTimeline.tsx`.

## Part A — Phase 8 verification

New `supabase/tests/phase8/`:

- `01_market_surveillance.sql` — disposition vocabulary (NEW, UNDER_REVIEW, FALSE_POSITIVE, MONITOR, ESCALATED, CLOSED); direct disposition UPDATE denied; `set_conduct_signal_disposition` behaviour (authorized succeeds, unauthorized fails, FALSE_POSITIVE/CLOSED without reason fails, same-state fails, CLOSED not reopenable, ESCALATED not changeable through the normal RPC); append-only denial on `conduct_signal_events`, `conduct_signal_evidence`, rule-version snapshots; actor taken from `auth.uid()` and not spoofable via arguments.
- `02_referral.sql` — full signal → UNDER_REVIEW → `refer_conduct_signal_to_investigation` → investigation chain, asserting investigation row, `source_type='surveillance_signal'`, source id, licensee/product, rule id + version, threshold, explanation, source record ids, observation window, disposition ESCALATED, investigation id written back, append-only event row. Unauthorized referral and referral from NEW/FALSE_POSITIVE/CLOSED all denied.
- `03_rule_versions.sql` — v1 exists; changing threshold/metric/operator/lookback increments version; prior snapshot unchanged; a signal keeps the version that fired it and never reinterprets under a later version.
- `04_rls_personas.sql` — persona matrix (external/applicant, regulated entity user, complaints officer, conduct analyst, investigator, supervisor, admin, unrelated internal) across signal SELECT, evidence SELECT/INSERT, disposition RPC, referral RPC, rule configuration, and direct-ID access. Explicitly asserts complaint access does not confer investigation-management rights.
- `docs/verification/phase8/manual-verification.md` — click-by-click steps for workspace, signal detail, false-positive and monitor dispositions, evidence record, rule version display, escalation, provenance in the investigation, closed/escalated lock, unauthorized persona.

Where a test exposes a real defect (missing guard, weak grant), the fix is applied in the Phase 8 code rather than the assertion being softened.

## Part B — Phase 9 verification

Strengthen `supabase/tests/notifications/10_communication_registry.sql` (plus a new `11_communication_authz.sql` if size demands):

- Truthful state: QUEUED and SENT_TO_PROVIDER are never DELIVERED; only a provider confirmation path yields DELIVERED; provider failure yields FAILED/RETRYING; exhausted retries yield DEAD_LETTER; missing provider config yields PROVIDER_NOT_CONFIGURED.
- Template integrity: send under template v1, publish v2, historical row still linked to and rendered as v1.
- `communication_timeline` authorization across application, complaint, F&P assessment, prudential action, investigation, enforcement — authorized owner/supervisor allowed, unauthorized denied, guessed object id denied. The denial contract (error vs empty) is asserted explicitly and documented.
- Dead-letter security: notification operator can view, ordinary internal and external users denied; resend routes through the sanctioned retry path and cannot override recipient, object, or provider.

## Part C — Phase 10 lineage + export governance

- Three lineage RPCs returning one shared node contract (object type, id/reference, version, source object + version, rule/transformation + rule version, actor/system, generated timestamp, output status/value, route link):
  - Prudential: return version → field → ratio → threshold/breach → EWI → CAMELS → supervisory action.
  - Conduct: complaint/source → alert or surveillance signal → disposition → investigation → finding → enforcement.
  - F&P: PQ version → screening → assessment → committee → determination → condition.
  Nodes resolve only from rows the caller can already read — no SECURITY DEFINER bypass of source RLS; inaccessible sources are omitted, never leaked.
- One reusable lineage viewer component + page with drill-through links, mounted from prudential entity profile, complaint/investigation, and F&P assessment detail.
- Export registry: extend `audit_export_jobs` with REQUESTED / GENERATING / COMPLETED / FAILED lifecycle plus actor role, module, export type, filters, entity and regulator scope, requested/started/completed timestamps, row count, file reference, correlation id, failure reason. All governed exports route through one shared server helper; endpoints re-check module permission and entity/regulator scope server-side and apply existing sensitive-field redaction.
- Admin export-history screen driven by the registry.
- Tests: three lineage chains, inaccessible lineage source, lineage persona matrix (supervisor, entity user, unrelated internal, external, direct node id), export success/failure, cross-entity and cross-regulator denial, direct RPC/edge invocation denial, redaction, registry row written.

## Part D — Phase 11 dashboards

- Replace the conduct-alert proxy in the prudential heatmap column with a `prudential_sector_risk()` aggregation over ratio breaches, severe EWIs, CAMELS/assessment risk, group risk signals, and prudential supervisory actions. Documented CRITICAL/HIGH/MEDIUM/LOW methodology plus INSUFFICIENT_DATA when evidence is absent — never LOW-by-default.
- KPI reconciliation tests on deterministic fixtures for licensing, F&P, prudential, conduct, investigations, enforcement, SLA: headline number, drilldown predicate, and source rows must match exactly.
- Governed report exports write Phase 10 registry evidence and carry filters, as-of period, entity, regulator, generated-by, generated timestamp, with PDF + CSV/XLSX and payload-equals-screen reconciliation.

## Part E — Phase 12 revalidation

- Re-score every FRD requirement from current HEAD on route/screen, frontend action, DB persistence, backend logic, RLS, audit, notification, version history, and test evidence. Statuses limited to IMPLEMENTED — MANUAL VERIFICATION REQUIRED / PARTIAL / MISSING; iterate on each PARTIAL and MISSING until both lists are empty.
- Final regression: TypeScript, production build, Vitest, pgTAP, Deno tests, RLS persona matrices, RBAC oracles, integration tests. Failures classified as new regression, existing debt, or environment; new regressions fixed without weakening tests.
- Deliverables: the requirement matrix (Phase, FRD ID, Requirement, Code, Backend, RLS, Tests, Manual, State), per-phase state and verification gaps for Phase 8 and Phase 9, and the remaining PARTIAL / MISSING lists.

## Sequencing

Part A → B → C → D → E, stopping after each part for your manual verification. Phase 8 and Phase 9 are reported at most as IMPLEMENTED — MANUAL VERIFICATION REQUIRED.
