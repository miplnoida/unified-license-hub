# EPIC 4 / W4-A6 — AML/CFT closed-loop supervision certification

Verification script: `scripts/verify-w4-a6-aml-closed-loop.sql` (25 gates, all PASS).

## What is certified

A single closed loop, executed by real personas through governed operations only:

perimeter determination → assessment (per-dimension inherent/control/residual)
→ maker/checker approval → attention with the exact causing dimension
→ recorded priority decision → plan (maker/checker) → intervention endorsement
→ examination opened only from an endorsed intervention → scope from approved
dimensions (with `EXAMINER_AMENDED` rationale) → information requests issued and
received → evidence-bearing workpaper → finding with full provenance chain
→ officer-recorded management response (sender, date, channel) → corrective
actions → effectiveness validation → residual acceptance → evidence-gated
closure → mandated reassessment → authoritative HIGH → MODERATE risk movement
→ complete compliance audit trail.

## Defects fixed this wave

1. **AML examination could not be opened by the officer authorised to examine.**
   `supervisory_intervention_link_activity` accepted only prudential, conduct or
   AML-approver authority, so an AML/CFT examiner authorised by
   `examination_execution_require` was refused mid-transaction. AML/CFT
   examination authority (and inspection edit authority) is now accepted.
2. **Linked examinations stored a retired deep link.** The stored canonical route
   pointed at `/prudential/examinations/:id`; it now points at the canonical
   `/supervision/examinations/:id` workspace.

## Independence rules confirmed (not defects)

- The officer who concluded a validation cannot accept the residual deficiency.
- A residual acceptance and a finding closure require approval-level authority,
  so the loop needs a second, independent supervisor — the certification uses one.

## Regression status

| Suite | Result |
| --- | --- |
| `verify-epic-2-supervisory-spine` | 18 PASS, 0 errors |
| `verify-epic-3-aml-closed-loop` | 22 PASS, 0 errors |
| `verify-epic4-w4a4-reconciliation` | 14 PASS, 0 errors |
| `verify-epic4-w4a5-residual-response` | 15 PASS, 0 errors |
| `verify-f8-w1d-prudential-config-governance` | 9 PASS, 0 errors |
| `verify-dms-phase4-closure` | PASS, 0 errors |
| Typecheck (`tsgo -p tsconfig.app.json`) | clean |

Security linter: 1589 issues, unchanged in kind from the wave baseline (no new
issue types; the two perimeter routines carry `SET search_path`).

## Verdict

**W4-A6 (AML/CFT closed-loop supervision) — CERTIFIED.**
