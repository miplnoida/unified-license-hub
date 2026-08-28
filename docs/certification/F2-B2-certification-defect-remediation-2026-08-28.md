# F2-B2 — Certification Defect Remediation (F2-C blockers only)

- **Date:** 2026-08-28
- **Authoritative input:** `docs/certification/F2-users-entity-identity-onboarding-final-certification-2026-08-28.md`
- **Scope:** DEF-F2-C-01 and DEF-F2-C-02 only. No F2 scope reopened; no product behaviour changed.
- **Verdict:** **F2-B2 READY TO RETRY F2-C**

---

## 1. DEF-F2-C-01 — breadcrumb coverage regression (CLOSED)

**Change:** one rule added to the existing canonical registry
`src/lib/breadcrumbs/breadcrumbRouteRegistry.ts`:

```ts
{ pattern: '/register/authority-pending', label: 'Authority pending', parent: '/register', audience: 'public' },
```

- Registered in the **existing** registry — no second breadcrumb mechanism introduced.
- Parent is the canonical registration journey root `/register`, matching siblings
  `/register/entity`, `/register/applicant`, `/register/account`, `/register/legacy`.
- `audience: 'public'`, identical to those siblings.
- Route and resume behaviour untouched: `/register/authority-pending` remains declared in
  `src/routes/publicRoutes.tsx` and remains the resume route returned by
  `public.onboarding_request_membership_by_token()` and recorded in
  `onboarding_stage_catalogue.resume_route` for `AUTHORITY_PENDING` (gate assertion S6 F-06 still passes).

**Proof**

| Check | Before | After |
|---|---|---|
| Route declared | yes (`publicRoutes.tsx:53`) | unchanged |
| Breadcrumb resolves via canonical registry | no source | registry rule (`/register` → Authority pending) |
| `npm run verify:breadcrumbs` | Routes 339, Registry rules 265, **Uncovered 1** | Routes 339, Registry rules **266**, **Uncovered 0** |
| Other F0 breadcrumb contract changes | — | none (only one rule added; no rule edited or removed; no navigation-snapshot change; 0 stale/orphan rules reported) |

---

## 2. DEF-F2-C-02 — F2 gate determinism (CLOSED)

No product behaviour was altered to stabilise the gate. Changes are confined to
`scripts/verify-f2b-remediation.sql` and the `verify:f2b` script entry.

1. **Every failure is now self-identifying.** The summary block emits a
   `F2-B FAILED ASSERTION [stage id] description -- detail` warning for each failed assertion and a
   `F2-B NOT-APPLICABLE ASSERTION [...]` warning for each N/A assertion, before raising. A future
   non-reproducible run therefore names the exact assertion and its detail.
2. **Every run is persisted.** `verify:f2b` now tees full output (all 63 assertion rows: stage, id,
   description, result, detail) to `artifacts/verify-f2b-latest.log` while preserving the psql exit
   code via `set -o pipefail`. `artifacts/` is git-ignored.
3. **Race window removed from the one live-count comparison.** S7 G-05 previously read the live
   count and then compared it to the recorded `observed_count` in a *second* statement, leaving a
   window in which concurrent application writes could change the live count between the two reads —
   the most plausible source of the single unreproducible failure. Both values are now read in one
   statement and both are printed (`live=38 recorded=38`). The assertion itself is unchanged and
   remains a genuine live-data integrity check, as intended.
4. **Fixture-sensitive probes remain rollback-safe.** The S2/S3 convergence and uniqueness probes
   continue to run inside inner subtransactions (`F2B_PROBE_ROLLBACK`) inside the outer transaction
   that ends in `ROLLBACK`; no assertion depends on a wall-clock window.

**Determinism proof:** `verify:f2b` executed 6 consecutive times after the change —
`63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A` on every run, with `G-05 live=38 recorded=38` on every run.
Combined with the 8 green runs recorded during F2-C, the gate count is unchanged: **63**. No
documentation count update is required.

---

## 3. Regression battery (all at post-fix working tree)

| Gate | Result |
|---|---|
| `verify:f2b` | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A (6/6 runs) |
| `verify:breadcrumbs` | 339 routes, 0 uncovered |
| `verify:f0c` | 34 TESTED_PASS / 0 TESTED_FAIL |
| `verify:f1c` | 96 TESTED_PASS / 0 TESTED_FAIL |
| `verify:hardening` | 31 PASSED / 0 FAILED / 0 SKIPPED |
| `verify:anon-execute` | PASS — 0 defects |
| `verify:definer-guards` | PASS |
| `verify:service-completeness` | PASS — 0 incoherent rows |
| Frontend suite (`npm run test`) | 140 files / 1281 tests passed |
| Typecheck (`tsgo --noEmit`) | clean |

### Reconfirmed F2 invariants (live census)

| Invariant | Observed |
|---|---|
| Governed identity registries | 37 |
| `anon` non-SELECT privileges on identity registries | none |
| `anon` SELECT outside the registry allowlist | none |
| `authenticated` writes outside declared `authenticated_writes` | none |
| Entities without an `ORGANIZATION` party | 0 |
| Orphan profiles | 0 |
| Raw token column on `onboarding_resolution_tokens` | 0 (hash-only; 0 rows failing the SHA-256 shape) |
| Authority-sufficient membership statuses | `APPROVED` only |
| DATA_REMEDIATION_REQUIRED items still explicit | `ENTITY_WITHOUT_OWNING_HUMAN=38`, `REGISTRATION_WITHOUT_ENTITY_BINDING=1` |

---

## 4. Verdict

**F2-B2 READY TO RETRY F2-C**
