# Enterprise SupTech Certification Programme V2

Objective: prove — with evidence — that the platform can run the full supervisory lifecycle on a coherent, reproducible certification dataset, with correct actors, correct calculations, correct communications and zero unexplained data-integrity errors. Not a feature wave.

Operating cycle: CLEAN → SEED → INTEGRITY → EXECUTE → VERIFY SIDE EFFECTS → GAP → FIX → RESEED → REPLAY → CERTIFY.

## Confirmed baseline (verified now)

- Git HEAD `6cd80ecb2` ("Added login link to approval"), 2026-08-22.
- Backend: non-production project; `cert_nonproduction_guard` row present with `environment = non_production`, `reset_enabled = true` — destructive certification reset is permitted.
- 924 migration files applied; V1 fixture provenance exists only as `certification_seed_manifest` (25 rows, entity/party-shaped columns only — no run id, no scenario code, no cleanup policy, no generic object ledger).
- Current population is small: 28 licensees, 124 applications, 13 return filings, 21 complaints, 21 profiles.
- Canonical spine tables confirmed: `parties`, `organizations`, `entity_*`, `licenses`, `entity_licenses`, `return_filings` + `return_filing_versions`, `fp_assessments`, `examinations`, `enforcement_actions`, `correspondence_threads`, `notification_event_queue`, `notification_dispatch_log`.
- Not yet verified (deliberately, these are Wave 0 tasks): role catalogue contents, live navigation rows, active workflow versions, active notification event configs, provider credential state.

Because the programme is very large, it is delivered as sequenced waves. Each wave ends with committed evidence documents; no wave starts before the previous one's evidence exists. Nothing is marked complete because a screen, table or RPC exists.

## Wave 0 — Freeze, baseline, and test-data classification

1. `docs/certification/v2/00-certification-baseline.md`: HEAD, environment, non-production proof, migration count, role catalogue, navigation tree, active workflow definitions/versions, active notification event configs and channel bindings, provider/integration state.
2. Inventory every existing business population and classify each row set: KEEP_CONFIGURATION / KEEP_REFERENCE / KEEP_AUDIT / PURGE_OLD_FIXTURE / PURGE_ORPHAN / MANUAL_REVIEW. Ownership determined by creator id, audit trail, fixture manifest membership, reference prefixes (CERT-*, E01–E20), explicit synthetic markers, and dependency graph — never by display name.
3. Dry-run purge report `docs/certification/v2/01-purge-dryrun.md` with row counts per table and per classification, plus the MANUAL_REVIEW list. No deletion until this document exists.
4. Audit truth rules: immutable audit rows are never edited or back-filled; audit records orphaned by fixture removal are retained per the audit architecture and listed as explained exceptions.

## Wave 1 — Fixture registry and governed seed harness

5. New tables `cert_fixture_runs` and `cert_fixture_objects` (run id, dataset namespace `CERT-SUPTECH-V2`, fixture version, scenario code, object type, object id, created at, cleanup policy), with GRANTs, RLS and admin-only read.
6. Governed entry point with four verbs — RESET, SEED, VERIFY, REPORT — that only ever touches V2-owned objects recorded in the registry, refuses to run unless the non-production guard says so, and is deterministic, idempotent and dependency-aware. A second SEED must not duplicate rows.
7. Reference-data separation: certification thresholds, fee amounts, SLAs, CAMELS weights and committee quorums are written as explicitly labelled `CERTIFICATION / DEMO CONFIGURATION`, replaceable by regulator-approved settings, and surfaced as configured policy (not code constants).

## Wave 2 — Demo universe seed

8. 15–25 fictional entities using only categories the configured taxonomy already supports, each with a narrative: healthy (A), liquidity deterioration (B), capital breach (C), conduct concern (D), licence application in flight (E), licence lifecycle (F), multi-entity/PPOC user (G), merged entity (H), retired entity (I), financial group (J).
9. Multi-period return time series per relevant entity so trends, repeated breaches, late/missing filings, remediation, peer comparison and group exposure are real derived states — not decorative values.
10. Certification personas: one minimal representative account per permission family and per maker/checker boundary, covering the external, registration/licensing, supervision and platform/oversight families listed in the brief. Maker and checker actors are never the same user.
11. Realistic fictional correspondence and synthetic document fixtures where process behaviour depends on them.

## Wave 3 — Formula golden tests

12. For every certified metric (capital, liquidity, asset quality, profitability, leverage, concentration, threshold state, EWI, late-return state, peer percentile, CAMELS, fees, late fees, SLA dates, committee thresholds, risk scores, duplicate-complaint score): record source inputs and independently computed expected output, with NORMAL / BOUNDARY / WARNING / BREACH / MISSING-INPUT / INVALID cases. Assertions run in the database or service layer — never certified from a React display.

## Wave 4 — Integrity gates

13. A reusable integrity gate suite covering identity, access, licensing, returns, prudential, F&P, conduct, correspondence, workflow and audit categories, runnable as a pre-scenario gate and an after-action gate. Threshold for unexplained structural errors is 0. A failing gate stops the scenario; the cause is classified and repaired rather than hidden.

## Wave 5 — Process E2E execution (P01–P15)

14. Journeys executed via governed transitions and real actors (Playwright for UI-driven paths, RPC/edge invocation where the UI is not the governing surface): registration FORM_FIRST and ENTITY_FIRST; entity resolution vs membership proven separately; licensing application to licence issuance; licence lifecycle; returns; prudential detection-to-action driven from seeded returns (no hand-inserted breaches); F&P; complaints/conduct; examination; enforcement from multiple real source types.
15. Prohibited-edge tests alongside allowed edges: self-approval denial, applicant invoking regulator actions, approval with open blockers, reopening closed cases, version pinning for in-flight cases.
16. Correspondence classified per process as TRANSACTIONAL NOTIFICATION vs REGULATORY CORRESPONDENCE, with durable-correspondence journeys proven end to end and internal notes proven never to reach external users.
17. Notifications proven at four levels — event emitted once, enqueued once, dispatch channel/template/recipient correct, delivery attempt recorded — plus recipient-class assertions per scenario. Inbound webhooks tested through the signed contract with fixture payloads: signature failure rejected, duplicates idempotent, unknown thread safe, attachments validated.
18. Provider reality: if sandbox credentials exist, controlled sends to certification inboxes; if not, the verdict splits into APPLICATION_NOTIFICATION_PASS and EXTERNAL_PROVIDER_BLOCKED with the exact dependency named. Provider delivery is never fabricated.

## Wave 6 — Gap register and remediation

19. `docs/certification/v2/enterprise-suptech-gap-register.md` in the prescribed table format with the prescribed classifications and P0–P3 severities. First execution produces the register, not feature development.
20. Remediation in P0 → P1 → P2 → P3 order, nothing outside the register. Every P0/P1 fix ships with a regression test (unit/integration, DB invariant, or Playwright scenario) and a rerun of its whole parent process.

## Wave 7 — Reset, replay and certification

21. Mandatory full V2 RESET → integrity baseline → SEED → seed verification → full E2E replay from clean state. No certification against first-run manipulated records.
22. Reseed integrity proof: expected counts for entities, personas, memberships, licences/applications, obligations/filings, workflow instances; zero orphans, zero duplicate business keys, zero stale prior-run V2 objects.
23. Final documents:
    - `docs/certification/v2/enterprise-suptech-final-certification.md` — P01–P15 with verdict CERTIFIED / CERTIFIED_WITH_EXTERNAL_DEPENDENCY / NOT_CERTIFIED.
    - final data-integrity report with before/after counts and the five explicit zero assertions.
    - `docs/certification/v2/demo-universe.md` — the reusable demo guide.
    - `docs/certification/v2/e2e-scenario-results.md` — PASS / FAIL / BLOCKED_EXTERNAL with evidence; unexecuted tests are never labelled PASS.
24. Exit gate also requires typecheck, tests and build passing.

## Technical notes

- Fixture registry and reset are SQL-side (migration for tables + governed SECURITY DEFINER functions), gated on `cert_nonproduction_guard`. Reset deletes strictly by `cert_fixture_objects` membership in dependency order.
- Existing `certification_seed_manifest` (V1) is left intact and read-only; V2 provenance lives in the new registry. V1 fixtures are classified in Wave 0 like any other population.
- Integrity gates and formula goldens are expressed as pgTAP files under `supabase/tests/certification/v2/` so they run in CI alongside the existing suites.
- Seed content lives in a versioned, deterministic script (fixed UUID namespace derived from run + scenario code) so reruns are idempotent.
- E2E scenarios under `tests/e2e/certification/` driven by persona logins; RPC-level scenarios where the governed surface is a function rather than a screen.

## Sequencing note

I will execute Wave 0 and Wave 1 first and stop for your review of the baseline and dry-run purge report before any deletion or reseed happens, since Wave 1 onwards is destructive to existing test data.
