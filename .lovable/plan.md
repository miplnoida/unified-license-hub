# MC-06 Certification — Patterns & Clusters

Certification only. No backend or UI redesign, no MC-07 work, no AI, no re-running MC-00–MC-05.

## Approach

Add one runtime certification harness, mirroring the accepted MC-05 pattern (`scripts/cert-v2/mc05-signals.ts` + shared `scripts/cert-v2/api.ts`), and run it against the live API as authenticated certification personas (conduct supervisor, conduct analyst, auditor, plus a wrong-regulator officer). Every mutation goes through the governed RPCs only — no direct table writes.

New file: `scripts/cert-v2/mc06-patterns.ts`.

## Scenario coverage

| ID | Check | How |
|----|-------|-----|
| A | Deterministic rule run creates a pattern | Seed contributing signals via `conduct_signal_create`, then run `conduct_pattern_detect` / `conduct_pattern_run_all`; assert a cluster is produced |
| B | Rerun does not duplicate | Re-run same rule/window; assert cluster count and cluster id unchanged (dedupe key holds), members not duplicated |
| C | Rule/version, metric, threshold, explanation | `conduct_cluster_detail` returns rule name, rule version, window, measure, measured value, threshold, operator, match explanation |
| D | Contributing records linked | Members resolve to Signals / Complaints / Outcomes with correct source kind and ids |
| E | Review / confirm | `conduct_cluster_review` → under_review then confirmed with note |
| F | Dismiss requires rationale | Dismiss with short/empty rationale is rejected; valid rationale succeeds on a second cluster |
| G | Evidence linking | `conduct_cluster_link_evidence` attaches an existing conduct evidence item |
| H | Raise one Signal | `conduct_cluster_raise_signal` succeeds, returns linked signal |
| I | Second Signal prevented | Repeat call denied |
| J | Raise one Alert | `conduct_cluster_raise_alert` succeeds |
| K | Second Alert prevented | Repeat call denied |
| L | Wrong-regulator denied | Officer scoped to another regulator gets denial on review/escalate |
| M | Auditor read-only | Auditor can read register/detail; every mutation denied |
| N | No auto-created records | Snapshot counts of `conduct_investigations`, `conduct_findings`, `enforcement_actions` before/after detection and confirm unchanged |

## UI / presentation verification

- Load `/conduct/patterns` and `/conduct/patterns/:id` in a headless authenticated browser session; capture console errors and confirm loading → data states render.
- Scan rendered text for leaked UUIDs, raw enum tokens and dedupe keys; assert none appear.
- Confirm the sector / rule / detection-date filters in the register are labelled as refining the currently loaded page rather than searching server-wide, and record that limitation explicitly.

## Tests to run

- `supabase/tests/conduct/05_pattern_layer.sql` (pgTAP)
- MC-06 UI/route guardrail checks (`scripts/verify-authz-centralized.mjs`, `scripts/verify-no-alias-namespaces.mjs`, route/nav snapshot validation)
- Typecheck and build only if a defect fix touches code

## Defect handling

If a scenario fails, fix only that defect (narrowest change: a missing permission grant, a label, or a guard), then rerun only that scenario plus its related test. No opportunistic refactoring.

## Reported output

A. A–N PASS/FAIL · B. tests · C. defect fixed, if any · D. filter limitation confirmed · E. MC-06 CLOSED YES/NO · F. MC-07 SAFE TO START YES/NO
