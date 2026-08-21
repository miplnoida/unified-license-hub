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

## Final increment — configuration seed and cross-cutting closure

| Item | Status | Evidence |
| --- | --- | --- |
| A.6 Variation | DONE | `license_variations` change sets, governed through `license_lifecycle_step`; variation decisions write to `license_decisions` and (where the variation changes term or scope) supersede the current `license_terms` row. |
| A.9–A.13 Adverse matters & expiry | DONE | `license_lifecycle_matters` stages with notice → representations → evidence review → decision prerequisites; `license_matter_notices`, `license_matter_representations`, `license_decisions`; `license_expiry_sweep()` executed only through the service-role `license-expiry-sweep` edge function (idempotent, audited). UI: `LicenseAdverseMatterPanel` with server-computed timeline; legacy Suspend/Revoke/Reinstate/Cancel buttons retired. |
| A.14 Appeals | DONE | `license_decision_appeals` bound to the exact `license_decisions` row; surfaced in `LicenseDecisionAppealsPanel`. |
| A.15–A.17 Fees | DONE | `fee_types` catalogue (21 stable regulatory codes), `license_fee_bindings` (purpose PRODUCTION / CERTIFICATION / TEMPLATE, trigger event, gate policy, effective window), `license_fee_assessments`, `license_fee_resolve()`, `license_fee_simulate()`, `license_fee_process_settings` process-level enable switch. No production fee amounts invented: production bindings are inactive TEMPLATE rows; only CERTIFICATION-purpose configuration is active. Negative fixtures (disabled, wrong scope, future-dated) prove enable/disable behaviour. |
| A.18 Verification | DONE | `license_verification_templates` (versioned, purpose-scoped, effective-dated) + `license_verification_cases` / `license_verification_items`, resolved by `license_verification_template_resolve()`; gating enforced in `license_lifecycle_step`. Seeded v1 templates for registration, application, renewal, variation and reinstatement; one active CERTIFICATION renewal template. |
| A.19–A.20 Workflow templates | DONE | `process_templates` hold full ordered Registration, Application and Renewal definitions (seeded inactive); `process_preview()` explains resolution without creating obligations. |
| Configuration UX | DONE | `/admin/config/lifecycle` (`LifecycleConfiguration`, `LifecycleConfigPanels`, `useLifecycleConfiguration`) separates Catalogue vs Schedule vs Binding, and exposes the fee simulator and process preview. |
| A.21 Entity 360 licence summary | DONE | Licence summary rendered from server read models on `Entity360Detail`. |
| A.22 Legacy licensee workspace | DONE | No code path deep-links to `/admin/licensees/:id` for identity any more (verified by repository scan: 0 callers). Identity truth is Entity 360 (`/entities/:entityId`); licence work is `/licenses/:licenseId`. The legacy route remains only as a historical-link landing page. |
| A.23 Related cases | DONE | `public.license_related_cases()` returns only genuinely linked records (originating application, lifecycle matters, conditions, F&P roles and appeals, supervisory plans, enforcement cases sourced from the licence, decision appeals). Rendered by `LicenseRelatedCasesPanel`. |
| A.24 Correspondence | DONE | Licence correspondence is read from the canonical `correspondence_threads` store (source_type = 'license'); the licence workspace keeps no parallel message store. |

**Phase A (P04) implementation: COMPLETE.** Remaining live end-to-end certification scenarios are recorded in
`docs/certification/deferred-enterprise-certification-register.md`.
