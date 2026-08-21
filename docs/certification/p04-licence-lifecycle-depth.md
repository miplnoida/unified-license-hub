# P04 Licence Lifecycle — Deep Build Progress Ledger

A.1–A.3 frozen (server-owned eligibility, case header, queue contract).

## Landed in this increment

| Item | Status | Evidence |
| --- | --- | --- |
| A.4 Renewal term history | DONE | `public.license_terms` (append-only, one current term per licence, decision provenance, conditions snapshot). `license_lifecycle_action` APPROVE_RENEWAL creates a new term and supersedes the prior one; REFUSE_RENEWAL preserves the current term and records formal refusal evidence on the renewal matter. Backfill: 23/23 licences hold an original term, 0 term/validity mismatches. |
| A.5 Renewal configuration | DONE | `public.license_lifecycle_configs` scoped by regulator / sector / sub-sector / category / licence class and matter kind, resolved by `license_lifecycle_config_resolve()`. Renewal length, window, grace, reminders, forms/documents, verification, F&P, fee, decision authority, late-renewal treatment, expiry behaviour, breach consequence are all configuration — no renewal dates or requirements in React. |
| A.7 Conditions as monitored obligations | DONE | `license_conditions` extended (reference, source decision, requirement, effective date, owner/team, evidence requirement, review state, waiver, variation, breach). States: open / evidence_due / under_review / satisfied / waived / varied / breached / closed. `license_condition_evidence` + `license_condition_submit_evidence()` (never satisfies) and `license_condition_review()` (governed satisfy/waive/vary/return/breach). |
| A.8 Breach consequence | DONE | Breach applies the configured consequence only: supervisory follow-up, lifecycle matter, suspension **review**, additional remediation condition, or enforcement referral. No automatic suspension or revocation anywhere in the review path. |
| Frontend | DONE | `LicenseTermHistoryPanel`, `LicenseConditionsPanel`, hooks `useLicenseTerms`, `useLicenseLifecycleConfig`, `useLicenseConditions` — all render server truth; zero client lifecycle inference added. |

## A.25 lightweight gate

- Typecheck: clean. Build: OK. Migrations: applied.
- Focused tests: `src/test/p04LicenceLifecycleDepth.test.ts` — 14 passing (term-history invariants, configuration scoping, evidence-does-not-satisfy, breach never auto-suspends, renewal decision wiring).
- Term-history invariant verified live: append-only trigger present; current terms = licences; no divergence from `licenses.valid_until`.

## Deferred (next increments, in order)

A.6 variation via P03 post-licence Application reuse; A.9 suspension notice/representation prerequisites;
A.10 revocation decision artefacts; A.11 reinstatement prerequisites; A.12 surrender obligation blockers;
A.13 server-owned expiry/lapse (automatic vs officer-confirmed) scheduler; A.14 appeal linkage to the exact
decision; A.15–A.17 fee bindings, multi-stage triggers and payment verification gating; A.18 VERIFICATION
step kind with configurable checklist; A.19–A.20 licence workflow templates and version pinning;
A.21 Entity 360 licence summary; A.22 `/admin/licensees/:id` retirement; A.23 related cases; A.24 canonical
correspondence. Phase B (P08 Conduct & Complaints) starts after A.24.
