# F3-B2 — Close F3-C Attempt-1 Defects Only

Date: 2026-08-28
Baseline HEAD at start: `10f7eee9cfa4e3ec05ff1d59a30cfeb42a48ae98`
HEAD at completion: `0be6740e355ad7e80ee2f3c6ac300eaca780e5cf`
Authoritative input: `docs/certification/F3-registration-final-certification-2026-08-28.md`

Scope: **only** the two items raised by F3-C attempt 1. No general F3 scope was
reopened. F0/F1/F2 frozen contracts were not weakened. F4 was not started.

---

## 1. DEF-F3-C-01 — invalid permission reference (Critical)

**Defect.** F3-B's governed registration workflow guard referenced the
uncatalogued permission pair `registration_review.approve`. No such module
exists (the canonical module is `registration_management`), so the guard was a
silent-deny: it could never evaluate true, and the frontend catalogue-integrity
gate (`src/test/catalogueIntegrity.test.ts`, GAP-F0-02) failed.

**Closure.**

| Surface | Action |
| --- | --- |
| `public.start_registration_workflow(uuid)` | Guard now calls `has_permission(v_uid,'registration_management','approve')` (deployed migration). |
| `public.get_registration_reviewer_remarks` | Inspected — no `registration_review` reference; unchanged. |
| `supabase/migrations/20260828125632_*.sql` | Superseded literal corrected in place so the migration corpus scanned by the catalogue gate no longer carries the invalid pair. |
| Whole-database sweep | `public.sec_invalid_permission_references` returns **0 rows**. |

**Permanent verification (new).** `scripts/verify-permission-references.sql`,
wired as `npm run verify:permission-refs`. It fails deterministically when:

- any project-owned `public` routine references a `(module, permission)` pair
  absent from `sec_modules` × `sec_permissions` (each defect is printed);
- `registration_management.approve` is missing from the catalogue;
- a `registration_review` module is created to satisfy the gate (anti-cheat);
- `start_registration_workflow` mentions `registration_review` again.

Result: `DEF-F3-C-01 permission-reference gate: PASS`.

The reporting view was also set to `security_invoker = on`, so it cannot widen
read access; the database linter's Security Definer View count fell from 4 to 3.

---

## 2. Anonymous applicant-name check drift (High)

**Defect.** `check_applicant_name_exists` remained in
`scripts/anon-execute-allowlist.json` and in the F0 hardening doc after its
anon EXECUTE was revoked, and the public registration form still called it
pre-authentication.

**Closure.**

- anon EXECUTE stays **revoked** (`has_function_privilege('anon', …)` = `false`).
- `src/components/registration/useApplicantNameUniqueness.ts` no longer performs
  the debounced existence probe; it remains the single source of applicant-name
  *field resolution* only.
- `src/components/registration/EntityDetailsStep.tsx` — inline applicant-name and
  business-registration-number existence probes removed.
- `src/components/registration/ApplicantInfoSection.tsx` — availability
  affordances (spinner / tick / cross / "already registered") removed; only
  ordinary field validation remains.
- Neutral submission-time messaging added:
  `src/lib/registrationDuplicateMessage.ts` →
  `neutraliseRegistrationSubmitError()`, applied to both intake error paths in
  `src/pages/registration/PreLicenseeRegistration.tsx`. Server errors that would
  disclose the existence of another record are replaced with a neutral
  "review your details / contact the regulator" instruction. Duplicate and
  entity-resolution authority remains entirely server-side (governed intake plus
  the `registrations` uniqueness and binding rules from F3-B).
- Allowlist and docs de-drifted: removed from
  `scripts/anon-execute-allowlist.json` (now **7** routines) and from
  `src/test/anonExecuteAllowlist.test.ts`;
  `docs/certification/F0-gap-08-anon-execute-hardening.md` records the retirement
  as an explicit supersession. Historical discovery/audit documents are
  point-in-time records and were left unchanged.

`verify:anon-execute`: `7 allowlisted, 1105 extension-owned (residual), 0 defects`.

---

## 3. Regression battery — all green

| Gate | Result |
| --- | --- |
| `vitest` (full frontend suite) | 140 files / **1281 tests passed** (catalogue integrity green) |
| `verify:f3b` | **38 TESTED_PASS / 0 FAIL / 0 N-A** |
| `verify:f2b` | **63 TESTED_PASS / 0 FAIL / 0 N-A** |
| `verify:f1c` | **96 TESTED_PASS / 0 FAIL / 0 N-A** |
| `verify:f0c` | **34 TESTED_PASS / 0 FAIL / 0 N-A** |
| `verify:permission-refs` (new) | PASS (0 uncatalogued references) |
| `verify:breadcrumbs` | PASS (0 uncovered routes) |
| `verify:hardening` | PASS |
| `verify:anon-execute` | PASS (0 defects) |
| `verify:definer-guards` | PASS |
| `verify:service-completeness` | PASS |
| edge authz coverage | user=47 worker=27 webhook=1 machine=1 public=7 — every function gated |
| `tsgo --noEmit` | clean |
| `npm run build` | success |

---

## Final verdict

**F3-B2 READY TO RETRY F3-C**
