# F4-B5 — DEF-F4-C-04 CLOSURE (Licence opening-term integrity)

Date: 2026-08-28
Scope: remediation only. F4-C was **not** run as certification in this phase.
Predecessor evidence: `docs/certification/F4-licensing-final-certification-2026-08-28.md`
(verdict: F4 NOT CERTIFIED — RETURN TO F4-B).

---

## 1. Defect

**DEF-F4-C-04 (PRODUCT_DEFECT)** — governed licence issuance created a
`public.licenses` row without the authoritative opening `original` record in
`public.license_terms`. Probe D-05 of `scripts/certify-f4c.sql` failed.

Empirical census before remediation:

| Metric | Value |
| --- | --- |
| Licences | 59 |
| `license_terms` rows | 1 (a single `renewal`) |
| Licences with an `original` term | 0 |
| Licences with any `is_current` term | 1 |

Root cause: `public.provision_application_entity` inserted the licence and (for
renewals) advanced the term chain, but no code path ever created term #1. The
term chain therefore had no origin, so validity history, conditions snapshots
and renewal supersession all rested on a missing anchor.

## 2. Remediation (migrated)

1. `public.ensure_license_original_term(uuid, uuid, text, jsonb)` — governed,
   idempotent writer for the opening term. Derives `effective_from` /
   `effective_until` from the licence's own `valid_from` / `valid_until`,
   `decision_actor` from the `approve_final` approval action, and snapshots the
   licence's open conditions. Refuses to fabricate history when later terms
   already exist (`LICENSE_TERM_HISTORY_CONFLICT`).
2. `trg_license_open_original_term` — `AFTER INSERT ON public.licenses`,
   executing in the **issuing transaction**. Every licence creation path
   (governed issuance, provisioning, reinstatement) now yields an opening term
   atomically; nothing is deferred to a worker.
3. `public.assert_license_term_integrity(uuid, uuid)` — post-issuance assertion.
4. `public.perform_final_workflow_approval` — asserts term integrity right after
   `provision_application_entity`, on both the first-decision path and the
   already-approved idempotent path. If the opening term cannot be established
   the approval transaction **fails atomically**; no licence is left behind.
5. Privilege posture: all three routines are `EXECUTE`-revoked from `PUBLIC`,
   `anon` and `authenticated`, granted to `service_role` only. Confirmed via
   `has_function_privilege` (anon=f, authenticated=f, service_role=t) and the
   security linter (the transient new SECURITY DEFINER exposure introduced by
   the trigger routine was revoked in the follow-up migration; counts returned
   below the pre-change baseline).

## 3. Backfill (data)

Reconstruction of the missing history from authoritative licence fields only —
no invented dates, no invented actors.

| Metric | After |
| --- | --- |
| Licences | 59 |
| Licences with an `original` term | 58 |
| Licences with an `is_current` term | 59 |
| Licences with multiple `is_current` terms | 0 |
| Missing `original` term | 1 (allowlisted) |

**DATA_REMEDIATION_REQUIRED (1):** `LIC-2026-000033`
(`96adeaa2-b3a4-467f-bc47-2b1e50f687a4`) recorded a `renewal` term at
`term_number = 1` before any original term existed. `license_terms` is
append-only (`tg_license_terms_append_only`), so term #1 cannot be reclaimed
without violating the immutability contract. The licence has a valid current
term; the gap is documented, allowlisted and tracked rather than papered over.

## 4. Category-wide gate

`scripts/verify-license-terms.sql`, registered as `npm run verify:license-terms`.
Seven assertions, all PASS:

1. zero licences without an `original` term (legacy allowlist only)
2. zero licences without a current term
3. zero licences with more than one current term
4. zero `original` terms diverging from the licence's own validity
5. issuance trigger present and enabled
6. term writers not executable by `anon` / `authenticated`
7. empirical, savepoint-rolled-back: inserting a licence creates term #1
   (`original`, `is_current`) in the same transaction; the writer is idempotent;
   `assert_license_term_integrity` passes; zero probe residue

Result: `verify:license-terms PASSED — 7/7 assertions, allowlisted legacy gaps: 1`.

## 5. Harness defects corrected (F4-C fixtures, not product)

Both were fixture faults recorded in the previous attempt, now fixed:

- **Trusted-context leak.** `scripts/certify-f4c.sql` runs as a single
  transaction, so `set_config('app.workflow_mutation_context','trusted',true)`
  used for fixture seeding leaked into later governed probes (A-01…A-04, F-01).
  `pg_temp.as_uid` / `as_service` / `as_nobody` now clear the mutation context
  on every identity switch, so governed probes always run as a real caller.
- **F-01 subject selection.** The "unrelated" user held
  `application_management.edit` (staff authority) and was therefore legitimately
  allowed to withdraw. A dedicated `unrelated` fixture user is now selected:
  not the owner, not an approved entity member, no super-admin, and without
  `application_management.edit`.

## 6. Validation run (post-remediation, not certification)

`psql -f scripts/certify-f4c.sql`: **87 PASS / 0 FAIL**, transaction rolled
back, zero residue (`CERT-F4C%` and probe licences = 0; licences 59, terms 59).
Previously failing probes now pass: A-01, A-02, A-03, A-04, D-05, F-01.

Backend gates re-run green: `verify:license-terms`, `verify:audit-contract`,
`verify:f4b`.

## 7. Verdict

**DEF-F4-C-04 CLOSED.** Licence issuance can no longer produce a licence without
its authoritative opening term, the failure mode is guarded by a permanent gate,
and the historical estate is reconstructed except for one documented,
append-only-blocked legacy row.

F4-C may be re-attempted (attempt 4).
