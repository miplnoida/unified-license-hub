# F2-C — Users, Entity Identity & Onboarding — Final Certification & Freeze

- **Date:** 2026-08-28 (retry pass; supersedes the 2026-08-28 NOT CERTIFIED result recorded below in §6)
- **F2 freeze HEAD:** `b0ff1947676d0a07db1474fbf0498b3d0b8be0cc`
- **Scope:** F2 estate (user lifecycle, entity identity, onboarding journeys, membership authority, onboarding tokens)
- **Protected baselines:** F0 (frozen), F1 (frozen)
- **Authoritative inputs:** this document (prior pass) and
  `docs/certification/F2-B2-certification-defect-remediation-2026-08-28.md`
- **Verdict:** **F2 PRODUCT CERTIFIED AND FROZEN — DATA REMEDIATION ITEMS RECORDED**

Certification-only pass. No product code, schema, policy, grant or gate logic was
changed in this pass.

---

## 1. Stage 0 — Rebaseline of all gates at the freeze HEAD

| Gate | Command | Expected | Observed | Result |
|---|---|---|---|---|
| F2-B remediation gate | `npm run verify:f2b` | 63 pass / 0 fail | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | PASS |
| Breadcrumb coverage (F0 contract) | `npm run verify:breadcrumbs` | 0 uncovered | Uncovered: 0 | PASS |
| F0 product certification | `npm run verify:f0c` | 34 pass / 0 fail | 34 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | PASS |
| F1 product certification | `npm run verify:f1c` | 96 pass / 0 fail | 96 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | PASS |
| Listing/export hardening | `npm run verify:hardening` | all pass | 31 PASSED / 0 FAILED / 0 SKIPPED | PASS |
| Anonymous EXECUTE (GAP-F0-08) | `npm run verify:anon-execute` | 0 defects | 8 allowlisted, 1105 extension-owned residual, 0 defects | PASS |
| Definer guards (F0-B7) | `npm run verify:definer-guards` | PASS | PASS | PASS |
| Service configuration completeness | `npm run verify:service-completeness` | 0 incoherent rows | GATE PASSED | PASS |
| Frontend suite | `npm run test` | all pass | 140 files / 1281 tests passed | PASS |
| Typecheck | `tsgo --noEmit` | clean | clean (exit 0) | PASS |
| Production build | `npm run build` | success | built in 53.11s (chunk-size advisory only) | PASS |

### 1.1 Gate determinism (closes DEF-F2-C-02)

`verify:f2b` was executed **3 consecutive times** at this HEAD.

| Run | Summary | S7 G-05 detail | Artifact |
|---|---|---|---|
| 1 | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | `live=38 recorded=38` | `artifacts/verify-f2b-run1.log` |
| 2 | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | `live=38 recorded=38` | `artifacts/verify-f2b-run2.log` |
| 3 | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | `live=38 recorded=38` | `artifacts/verify-f2b-run3.log` |

The three artifacts are **byte-identical** (md5 `c306cce4d28ecfcad467e3283d7b9709` for all
three), each containing the full 63-row assertion table (stage, id, description, result,
detail). Evidence is usable and reproducible; the gate is deterministic.

---

## 2. F2 certification invariants — re-proved at the freeze HEAD

| Invariant | Required | Observed | Result |
|---|---|---|---|
| Governed identity registries | 37 | **37** (`identity_governed_tables`) | PASS |
| `anon` INSERT/UPDATE/DELETE/TRUNCATE on any registry | none | **0** | PASS |
| `anon` SELECT outside the declared allowlist | none | **0** (2 registries allowlisted, each justified) | PASS |
| `authenticated` write privileges outside `authenticated_writes` | none | **0** | PASS |
| Identity registries with RLS disabled | none | **0** | PASS |
| Entities without a canonical party | 0 | **0** of 54 entities | PASS |
| Entities bound to a non-`ORGANIZATION` party | 0 | **0** | PASS |
| Entities sharing a party (exactly one ORGANIZATION party each) | 0 shared | **0** | PASS |
| Orphan profiles (no `auth.users` row) | 0 | **0** | PASS |
| Legal name is **not** identity | no unique name index on `licensees` | **0** unique name indexes | PASS |
| Scoped authoritative identifiers remain the identity control | scoped uniqueness present | **5** unique indexes on `entity_identifiers` | PASS |
| Token storage hash-only | no raw-token column | **0** raw-token columns; 0 rows failing the SHA-256 hex shape | PASS |
| Token single use | enforced in shared redeem primitive | `verify:f2b` S5 E-04/E-05 (single use + expiry + step scope) | PASS |
| Token issue/redeem anonymous callability | none | S5 E-06 `anon executable=0` | PASS |
| Authority-sufficient membership statuses | `APPROVED` only | **`APPROVED` only**; `VERIFIED`, `REQUESTED`, `PENDING_VERIFICATION`, `REJECTED`, `REVOKED`, `EXPIRED` insufficient | PASS |
| `FORM_FIRST` and `ENTITY_FIRST` journeys valid | both live and public | both `is_enabled`/`is_public`, entry routes `/register/applicant` and `/register/entity` | PASS |
| `/register/authority-pending` route + breadcrumb + resume agree | all three | route `src/routes/publicRoutes.tsx:53`; breadcrumb rule `breadcrumbRouteRegistry.ts:24` (parent `/register`, public); `onboarding_stage_catalogue.resume_route = /register/authority-pending` (active) | PASS |
| Onboarding → F3 handoff blocks insufficient authority | blocked with explicit reason | S7 G-06/G-07/G-08: readiness RPC exists, not anon-callable, returns `ready:false` + `"No user holds approved authority to act for this entity"` | PASS |
| Unexplained NOT-TESTED surfaces | zero | **0 N-A across all three runs**; every F2 capability classified with a decision note (S7 G-01/G-02/G-03: classified=7, unjustified=0, missing=0) | PASS |
| Critical/High F2 **product** gaps | 0 | **0** — DEF-F2-C-01 and DEF-F2-C-02 both closed and re-proved | PASS |

---

## 3. Frozen F2 contracts

The following are frozen at HEAD `b0ff1947676d0a07db1474fbf0498b3d0b8be0cc` and may not
be changed without a new certification pass:

1. **Identity privilege contract** — the 37-row `public.identity_governed_tables`
   registry is the single declaration of permitted `anon` SELECT and `authenticated`
   write privileges on identity surfaces. Every entry carries a justification; RLS is
   enabled on all 37.
2. **Entity identity model** — `licensees.id` is canonical; every entity has exactly one
   `ORGANIZATION` party binding (enforced by `licensees_ensure_party_binding`, error
   `23514`, plus `licensees_name_present_chk`). Legal name is not an identity key;
   identity is established by scoped authoritative identifiers in `entity_identifiers`
   plus entity resolution.
3. **User identity** — no orphan profiles: every `profiles` row resolves to an
   `auth.users` row.
4. **Onboarding token boundary** — `onboarding_resolution_tokens` stores `token_hash`
   only (SHA-256 hex), unique-fingerprinted, single-use, expiry- and kind-scoped in the
   shared redeem primitive; never browser-readable; issue/redeem require `auth.uid()`.
5. **Membership authority vocabulary** — `entity_membership_status_catalogue` is the sole
   source of authority; only `APPROVED` is `is_authority_sufficient`.
   `entity_membership_approve()` requires `entity_membership.approve` and writes audit.
6. **Journey vocabulary** — `FORM_FIRST` and `ENTITY_FIRST` are DB-driven
   (`registration_journey_types`); stage vocabulary and resume routes come from
   `onboarding_stage_catalogue`, not React literals.
7. **Authority-pending contract** — route, canonical breadcrumb registry rule and
   catalogue resume route must remain in agreement; `verify:breadcrumbs` must stay at
   0 uncovered routes.
8. **Permanent gate** — `npm run verify:f2b` at 63 assertions, deterministic, with the
   full assertion table persisted to `artifacts/verify-f2b-latest.log` on every run.

---

## 4. Residual data-remediation items (NOT product gaps)

These are recorded, owner-noted operational backfill items in
`public.identity_data_remediation_register`. They are explicit, reconciled against live
data by gate assertion S7 G-05, and are **not** F2 product defects.

| Item | Observed count | Owner note recorded |
|---|---|---|
| `ENTITY_WITHOUT_OWNING_HUMAN` | 38 | yes |
| `REGISTRATION_WITHOUT_ENTITY_BINDING` | 1 | yes |

No product gap of any severity remains open against F2.

---

## 5. Verdict

**F2 PRODUCT CERTIFIED AND FROZEN — DATA REMEDIATION ITEMS RECORDED**

F2 freeze HEAD: `b0ff1947676d0a07db1474fbf0498b3d0b8be0cc`.

---

## 6. Superseded prior result (retained for traceability)

The first F2-C pass (certification HEAD `e0554a3625693e0ed6912f8d301e1f0a0d931228`)
returned **F2 NOT CERTIFIED — RETURN TO F2-B** on two narrow defects, both since closed
in F2-B2 (`docs/certification/F2-B2-certification-defect-remediation-2026-08-28.md`) and
both re-proved above:

- **DEF-F2-C-01 — breadcrumb coverage regression (High, blocking).**
  `/register/authority-pending` was declared as a route and as the catalogue resume route
  but had no rule in the canonical breadcrumb registry, so `verify:breadcrumbs` reported
  1 uncovered route. **Closed** — registry rule added (parent `/register`, public
  audience); gate now reports 0 uncovered of 339 routes.
- **DEF-F2-C-02 — non-deterministic F2-B gate observation (Low, non-blocking).**
  One unreproducible `62/1` observation. **Closed** — per-assertion self-identifying
  failure logging, full-output artifact persistence with `pipefail`, and the S7 G-05
  live/recorded read collapsed into a single statement; 3/3 byte-identical 63/63 runs at
  the freeze HEAD.

The substantive F2 evidence recorded in that pass (identity convergence, privilege
lockdown, token hardening, authority vocabulary, journey coverage) held throughout and is
restated in §2 above from fresh measurement at the freeze HEAD.
