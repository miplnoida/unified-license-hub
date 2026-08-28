# F5-B2 — Post-Licensing Intake Authority & Canonical Licence/Service Binding

Date: 2026-08-29
Scope: GAP-F5-01 (HIGH), GAP-F5-02 (HIGH), GAP-F5-15 (MEDIUM)
Out of scope (unchanged this pass): post-approval effect engine, F&P integration,
fees/payment logic, workflow redesign, F6, all frozen F0–F4 contracts.

## 1. Remediation delivered

| Gap | Defect | Remediation |
| --- | --- | --- |
| GAP-F5-01 | Intake and submission trusted client-written taxonomy (`sector_id`, `sub_sector_id`, `category_id`, `licensee_id`) | `public.resolve_post_license_intake_context(license_id, service_id)` is now the single source of taxonomy truth. `create_application_draft` overwrites any client-supplied taxonomy with licence-derived values; `submit_application` re-derives it at the decision boundary. |
| GAP-F5-02 | Submission was restricted to the row creator, so no entity delegate could file | `public.can_submit_application(application_id)` grants authority to the creator **or** an APPROVED entity member holding the `submit` capability. `submit_application` and the `verify-and-submit` Edge Function both consult it; the RPC remains the authoritative check. |
| GAP-F5-15 | Service ↔ licence compatibility existed only in the UI filter | `public.service_license_compatible(service_id, license_id)` mirrors the licence-scope rule server-side and is enforced at draft creation, at submission, and in the Edge Function fail-fast path. |

Supporting changes:

- All three routines are `SECURITY DEFINER` with a pinned `search_path`; `EXECUTE`
  is granted to `authenticated` and revoked from `anon`.
- `submit_application` records the submitting authority (`submission_authority`)
  in the audit trail, so delegated filings are attributable.
- `verify-and-submit` routes submission notifications to the filing owner rather
  than the delegate.
- `supabase/baseline/40_functions.sql` and `92_grants_functions.sql` synchronised
  with the live estate.

## 2. Permanent gate

`scripts/verify-f5b2-intake.sql`, wired as `npm run verify:f5b2` (log:
`artifacts/verify-f5b2-latest.log`).

The gate is empirical, not merely a source inspection. Every write executes inside
an implicit savepoint that is always discarded, so the run leaves zero residue.

| Section | Proves |
| --- | --- |
| A (5) | The three governed routines exist, are definer-scoped with a pinned `search_path`, are unreachable by `anon`, and are reachable by `authenticated`. |
| B (7) | Source contract: creator-only refusal removed, entity capability check present, canonical resolver used, compatibility gate present, authority audited — at both intake and submission. |
| C (3) | Behavioural compatibility matrix over 5 live licences: in-scope services accepted, out-of-scope services refused, null/unknown identifiers refused (never fail-open). |
| D (5) | Behavioural authority: creator may submit; an APPROVED delegate with `submit` may submit; a view-only member may not; `submit_application` returns `FORBIDDEN` for the view-only member and lets the delegate through to the next control (`PAYMENT_REQUIRED`). |
| E (4) | Behavioural canonical binding: forged taxonomy is overwritten with licence values, the entity is derived from the licence holder, an out-of-scope service is refused (`SERVICE_LICENSE_INCOMPATIBLE`), and a mismatched entity claim is refused (`LICENSE_ENTITY_MISMATCH`). |
| F (2) | Zero residue: no probe application or membership survives. |

## 3. Result

```
verify:f5b2 — 26 PASS / 0 FAIL   (run 1)
verify:f5b2 — 26 PASS / 0 FAIL   (run 2, re-run residue proof)
```

Run twice back-to-back with identical results and `residue=0` on both, confirming
idempotency and that the harness does not mutate the live estate.

## 4. Verdict

**F5-B2 CLOSED — GAP-F5-01, GAP-F5-02 and GAP-F5-15 remediated and gated.**

The post-approval effect engine (GAP-F5-03) and F&P enforcement (GAP-F5-04) remain
open and are the subject of the next pass.
