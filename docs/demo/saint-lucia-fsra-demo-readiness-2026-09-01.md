# Saint Lucia FSRA — Demo Readiness Record (DEMO_SLU_FSRA_2026)

Environment: RC1 certification / non-production (`is_production_environment() = false`).
Migrations: 1,315. Demo data tag: `(SAINT-LUCIA-FSRA-DEMO)`.

## Verdict

**DEMO READY** for the rehearsed journey in `saint-lucia-fsra-final-runbook-2026-09-01.md`.

## What is configured

- 10 synthetic licensees (`5c1a…`), 6 persons, appointments, canonical addresses, ownership interests, party relationships, and one financial group with 3 members.
- Hero supervisory thread on **Coral Harbour Bank Limited** (`5855bf85-9fde-4cf8-a082-7ea904d46184`) built on the ACCEPTED filing **CV2-E02-2025-Q3** (version `5568551b-5574-48b8-aa9a-5f1ac283751f`).
- Three threshold detections for 2025-Q3: liquidity **breach** 14.5% vs 15.0% (left unacknowledged for the live click), NPL **warning** 5.8% vs 5.0% (pre-acknowledged through `prudential_breach_acknowledge`), cost/income **warning** 74.0% vs 65.0%.
- Two prudential actions: PA-2026-0001 (in progress, 40%, awaiting review) and PA-2026-0002 (completed, closed, review accepted).

## Automated smoke result

`npm run verify:st-lucia-demo` → **21/21 GATES PASSED** (rollback-scoped; creates nothing).

Gates cover: demo entities resolving to canonical party+organization, persons, appointments, ownership with canonical owned party, group membership, canonical address usages, ACCEPTED hero filing, canonical metric store only (no second ratio store), ratio arithmetic proven against reported inputs, breach values matching canonical metrics, threshold-consistent levels, complete acknowledgement evidence, reserved live-demo breach, audit evidence, linked open and closed actions with full closure evidence, RLS enabled on all demo-relevant tables, anonymous read isolation, and the non-production guard.

Browser smoke: 14 demo routes rendered with no error, 404, Access Denied or loading-failure text; Breaches and Actions tabs render the expected Q3 values.

## Truthful limitations (state these if asked; do not work around them)

- **No UBO policy configured** — `entity_ubo_resolve` returns `CONFIGURATION_REQUIRED`. Demonstrate ownership through the ownership-network view; do not claim UBO determination.
- **Metric mapping not configured** for the International Bank templates, so a brand-new filing cannot be pushed through automatic extraction on stage. Use the accepted 2025-Q3 filing.
- **Aggregate risk score** is recomputed by a worker-authenticated engine (`risk-score-recompute`) that the browser cannot invoke, so the stored score may pre-date the seeded Q3 detections. Present risk through breaches, actions and peer comparison — do not hard-code a risk band.
- **Append-only evidence**: the earlier 2025-Q4 detections and their two actions cannot be deleted; the actions are retitled "[Superseded record retained on file]". Filter the Breaches tab to 2025 / Q3.
- No standalone regulatory-universe or risk-explainability route; both are shown inside the executive dashboard and prudential analysis screens.

## Operational commands

- Seed: `npm run seed:st-lucia-demo` (idempotent; safe to re-run before the meeting).
- Verify: `npm run verify:st-lucia-demo`.
- Cleanup: `npm run cleanup:st-lucia-demo` (production-guarded; retains append-only audit and detection evidence).

## Fallbacks

| If this fails | Show instead |
|---|---|
| Live acknowledgement | The already-acknowledged NPL warning, with actor, timestamp and rationale |
| Ratios & Trends | The accepted filing's metric values on the entity Returns tab |
| Peer Comparison | Group Structure and the sector list on `/prudential/entities` |
| AI Analysis Reports | `/analytics/ai-insights` model-governance metrics |
| Group structure view | `/intelligence/network` ownership network |
| Examinations | Complaint CMP-2026-000099 closed outcome |
