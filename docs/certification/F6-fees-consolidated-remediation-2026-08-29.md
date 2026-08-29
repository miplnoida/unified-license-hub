# F6 — Fees & Payments Consolidated Remediation (Closure Evidence)

Date: 2026-08-29
Scope: F6 Fees & Payments. F0–F5 frozen contracts untouched.
Permanent gate: `npm run verify:f6b` (`scripts/verify-f6b.sql`)
Result: **38 PASS / 0 FAIL**, reproduced on two consecutive live runs, zero residue.

## 1. What was wrong

- Fee figures were computed in the browser (fee breakdown resolution, component
  metadata, outstanding balances), so the amount shown to an entity was not the
  amount of record.
- Browser roles held direct write privileges across the financial estate
  (assessments, lines, ledger, allocations, waivers, refunds, reconciliation,
  payment references, fee components, payments) — 68 privilege violations.
- Unauthenticated visitors could read 7 financial tables.
- The indicative preview and the formal assessment used different monetary
  semantics (preview totalled all lines, the assessment only payable lines).
- Fee itemisation could be edited under a weaker authority than fee administration.
- The consolidated finance view failed when loading its audit trail (identifier
  type mismatch), so regulators had no single governed financial record.
- No permanent, empirical gate existed for the money path.

## 2. What now holds

**Server authority.** Every fee figure originates from the server: the
assessment of record (`fee_assessment_ensure`), its state
(`fee_assessment_state`), the indicative preview (`fee_assessment_preview`) and
the consolidated regulator record (`fee_assessment_overview`). The client
computes presentation only; `assessmentClient.ts` asserts the shape it receives
and refuses to guess when the server does not answer.

**Ledger semantics.** Payments settle through a server trigger into
`fee_ledger_entries` and `fee_payment_allocations`. An overpayment is allocated
only up to the assessed balance and the excess is retained as an explicit
ledger credit — never silently absorbed. Corrections are compensating entries:
`fee_payment_reverse` adds an entry and marks the allocation reversed; ledger
history cannot be updated or deleted (append-only guard).

**Maker-checker.** A waiver requester can never approve their own waiver
(`MAKER_CHECKER`). Waivers cannot exceed the outstanding assessed amount.
Refunds cannot be executed before approval (`INVALID_FROM_STATE`) or exceed the
amount actually received (`INVALID_AMOUNT`).

**Reconciliation.** Statement lines are matched server-side; an unknown line is
recorded as unmatched/exception and resolved only through
`fee_reconciliation_resolve` — never guessed.

**Privilege surface.** `anon` and `authenticated` hold no INSERT/UPDATE/DELETE/
TRUNCATE/REFERENCES/TRIGGER on any financial table; `anon` holds no read at all.
RLS is enabled on every financial table, the trusted server path retains access,
and every F6 entry point is SECURITY DEFINER with a pinned `search_path`, no
`anon` EXECUTE, and an explicit authority or visibility check.

**Confidentiality.** Ledger, audit and reconciliation sections are regulator-only;
a non-privileged user is refused outright.

## 3. Surfaces

- `src/components/payments/ApplicationFinancePanel.tsx` — regulator financial
  record: assessment, payments, waivers, refunds, ledger, reconciliation, audit.
- `src/components/fees/FeeOperationsPanel.tsx` — waiver / refund / reconciliation
  queues (Financial Operations tab in Fee Management).
- `src/components/applications/FeeComponentsPanel.tsx` — itemisation, gated on
  `fee_management.edit`, with no client pricing fallback.
- `src/components/applications/LicenseePaymentPanel.tsx`,
  `src/components/payments/OfflinePaymentDialog.tsx` — assessment is ensured only
  at the payment-initiation boundary; outstanding balances are read from the server.

## 4. Gate coverage

| Section | Proves |
| --- | --- |
| A (5) | no browser write on money, no anonymous read, RLS on, append-only ledger, server path intact |
| B (9) | complete server contract, definer + pinned search_path, no anon execute, authority and visibility checks, preview parity, idempotency and reference uniqueness |
| C (6) | real actor and configuration (vacuity guard), preview equals assessed figure, idempotent assessment, one standing assessment, provenance recorded |
| D (4) | overpayment allocation ceiling, explicit credit, stale assessment never left standing, re-assessment reflects change |
| E (4) | no self-approval, no excess waiver, decision precedes payout, no excess refund |
| F (4) | compensating reversal, allocation marked not deleted, balance restored, history immutable |
| G (3) | unmatched statement line recorded, one governed regulator read, confidentiality boundary |
| H (3) | zero residue (applications, references, reconciliation runs) |

All behavioural assertions run inside a savepoint that is always rolled back;
results are buffered so they survive the rollback. The gate fails rather than
passes when no fee-administering actor, fee configuration, or non-privileged user
exists.

## 5. Notes for the next wave

- The project-wide database linter count (1,435) is the pre-existing
  SECURITY DEFINER baseline of the platform, not an F6 regression. F6 functions
  are definer by design, guarded, schema-pinned and closed to `anon`.
- The financial privilege lockdown is a database change: the app must be
  published for the deployed version to run against the locked-down estate.

**Verdict: F6 CLOSED.**
