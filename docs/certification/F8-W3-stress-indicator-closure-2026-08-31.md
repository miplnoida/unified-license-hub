# F8-W3 — Stress Indicator Engine Closure

**Date:** 2026-08-31
**Waves:** W3A (execution/certification), W3B (documentation closure)
**Gap:** GAP-F8-06 — Stress/scenario engine never fired

## Implementation / evidence HEAD

- Evidence HEAD: `906757633905611967848d79d090bde9d0839f6c` (W3A certification commit)
- Documentation HEAD: `eb4ed3f4a3b962126cfbe9d2a67e02f9ca778f5d`
- W3A product-code delta: **none** — only `scripts/verify-f8-w3a-stress-events.sql` + `package.json` gate registration. No migration, RPC, threshold, scenario, or notification change was required.

## Recovered contract

`prudential_stress_indicator_configs` (configured indicators, 13 present)
→ canonical accepted filing metric in `return_metric_values`
→ `evaluate_stress_indicators_for_filing(uuid)`
→ `prudential_stress_events` on breach (none on safe values)
→ event visibility (RLS, per-entity isolation)
→ governed acknowledgement
→ canonical dual-surface audit + existing notification behaviour.

## Canonical input truth

Stress evaluation reads **only** canonical filing metrics from `return_metric_values` on the accepted filing version. No parallel ratio store is consulted (consistent with GAP-F8-09 closure: `return_calculated_ratios` retired read-only, `record_return_ratio` dropped).

## Proven behaviour (W3A gate, 20/20 PASS)

- Configured stress indicators exist and resolve against canonical metrics.
- Safe value → **no event**; breached value → **event created**.
- Event carries canonical lineage: indicator, entity, `return_filing_id`, filing version.
- Idempotency: `(indicator_id, return_filing_id)` — re-evaluation of the same filing does not duplicate events.
- Automatic wiring: filing acceptance triggers evaluation (same accepted-return detection path as breach detection).
- Visibility isolation: events are not visible across entities/regulators.
- Governed acknowledgement records actor/time.
- Unauthorised, external and anonymous actors are denied.
- Canonical `prudential_audit_event` dual-surface audit (`audit_logs` + `compliance_audit_logs`) for governed mutations.

Gate: `npm run verify:f8-w3a-stress-events` — **20/20 PASS** (`scripts/verify-f8-w3a-stress-events.sql`).

## Security posture

- RLS isolation on indicator configs and stress events.
- Acknowledgement is a governed mutation with authority checks and audit.
- No permission, grant, or RLS change was made during W3A/W3B.

## Audit / notification contract

- Governed mutations emit canonical `prudential_audit_event` (dual-surface, per GAP-F8-02 closure).
- Existing notification triggers fire where already required; no notification logic changed.

## BCR residual (non-blocking)

**Classification: BCR / REGULATOR POLICY.**

Stress scenario definitions and methodology are regulator-owned policy inputs. The system must not invent:

- macroeconomic scenarios
- interest-rate shocks
- FX shocks
- liquidity shocks
- capital shocks
- scenario severity levels
- sector-specific assumptions
- scenario weightings
- regulator-defined thresholds / calibration values

The engine already supports configurable indicators; absence of regulator-approved scenario definitions is **not** an executable product defect.

## Final verdict

**GAP-F8-06 — PRODUCT CLOSED / BCR RESIDUAL.**
**F8 STRESS INDICATOR ENGINE — CERTIFIED.**
