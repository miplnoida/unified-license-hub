# F4-B3 — DEF-F4-C-02 REMEDIATION & CLOSURE

**Date:** 2026-08-28
**Scope:** DEF-F4-C-02 only (coordination audit-writer contract), plus the
category-wide audit-contract census it implies.
**Verdict:** `DEF-F4-C-02 CLOSED — F4-C MAY BE RE-RUN`

---

## 1. Defect restated

`log_coordination_case_change()` and `log_coordination_flag_change()` wrote
`INSERT INTO audit_logs (actor_id, ..., details)`. `public.audit_logs` has no
`actor_id` and no `details` column, so every coordination case clearance/closure
and every flag raise/resolve/withdraw aborted with `42703`. Because a
coordination blocker is one of the seven F4 licensing readiness dimensions, that
dimension could only ever fail closed.

## 2. Category census, not just the instance

`scripts/verify-audit-contract.sql` (new, permanent gate) extracts the column
list of every `INSERT INTO audit_logs` / `INSERT INTO compliance_audit_logs`
inside every `public` function and compares it against
`information_schema.columns`.

The first run found **28 stale column references across 9 routines** — the two
coordination triggers plus:

- `dismiss_complaint_escalation`, `evaluate_complaint_escalations`
- `manual_escalate_complaint`, `evaluate_complaint_vulnerability_escalations`
- `confirm_complaint_duplicate`, `dismiss_complaint_duplicate`
- `reject_return`
- `fp_request_pq_amendment`

All nine were rewritten in one forward migration onto the real audit contract:
`user_id` (actor, still server-derived from `auth.uid()`), `old_value` /
`new_value`, `metadata`; and for `compliance_audit_logs`, `action_type`,
`object_type`, `object_id`, `before_value`, `after_value`, `justification`.
No audit requirement was weakened: actor stays server-derived, action keys are
unchanged (`coordination.case.<status>`, `coordination.flag.raised`,
`coordination.flag.<status>`), and payloads stay complete.

Gate registered as `npm run verify:audit-contract` → **PASSED, 0 stale audit
writers.**

## 3. Empirical coordination lifecycle proof

`scripts/verify-f4b3-coordination.sql` (`npm run verify:coordination-lifecycle`)
drives the canonical production path — the same statements
`CoordinationList.tsx` / `CoordinationDetail.tsx` issue — as `authenticated`
with RLS on and a real `auth.uid()`, inside a single rolled-back transaction.

**26/26 assertions PASS:**

| Stage | Proven |
|---|---|
| A1–A8 | Case create succeeds (no 42703); owner auto-seeded cleared; case auto-transitions to `cleared`; audit row written with `coordination.case.cleared`, non-null actor = caller, `open → cleared` in old/new value, subject + regulator + from/to provenance in metadata |
| B1–B4 | Pending participant returns the case to `pending_clearance` (audited); participant self-clearance returns it to `cleared`, audit attributed to the clearing participant, not the owner |
| C1–C2 | Owner case closure succeeds and audits `coordination.case.closed` with the `cleared → closed` transition |
| D1–D3 | Flag raise succeeds (no 42703) and audits `coordination.flag.raised` with case + linked-application provenance |
| E1–E5 | F4 readiness reports coordination `REQUIRED_AND_INCOMPLETE` with 2 blockers; resolve and withdraw both succeed and audit `coordination.flag.resolved` / `.withdrawn`; dimension becomes `PASS` with 0 blockers; the six non-coordination gates are byte-identical before and after, i.e. evaluated independently |
| F1–F3 | Negative boundary: a non-participant cannot read the case, cannot update its status (0 rows), and is refused on flag insert (`42501`) |
| G1 | Contract guard: no `audit_logs` writer references `actor_id`/`details` |

Residue check after the run: `0` `CERT-F4B3%` coordination cases, `0` flags,
`0` `coordination.%` audit rows in the last hour. Nothing was committed.

## 4. Full regression battery

| Gate | Result |
|---|---|
| `verify:audit-contract` | PASS |
| `verify:coordination-lifecycle` | PASS |
| `verify:permission-refs` | PASS |
| `verify:anon-execute` | PASS |
| `verify:definer-guards` | PASS |
| `verify:service-completeness` | PASS |
| `verify:f0c` (F0 frozen) | PASS |
| `verify:f1c` (F1 frozen) | PASS |
| `verify:f2b` (F2 frozen) | PASS |
| `verify:f3b` (F3 frozen) | PASS |
| `verify:f4b` (F4-B) | PASS |
| `verify:hardening` | PASS |
| `verify:breadcrumbs` | PASS |
| Frontend suite | 141 files / 1293 tests PASS |
| Build | OK |

## 5. Disposition

- DEF-F4-C-02: **CLOSED** (instance + category).
- No frontend change was required; the defect was entirely in database triggers.
- F0–F3 freezes remain intact; F4-B gates unchanged.

**F4-C may now be re-run in full.**
