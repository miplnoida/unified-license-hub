# F4 — LICENSING FINAL CERTIFICATION RECORD (Attempt 3)

- Date: 2026-08-28 (UTC)
- Remediation HEAD certified against: `496d87311210a8943df3193011b987c458b4d754` (F4-B4)
- Scope: certification only. No product remediation performed during this pass.
- Harness: `scripts/certify-f4c.sql` (single transaction, `ROLLBACK`, synthetic fixtures only)

## 1. Rebaseline of the frozen estate (pre-certification)

| Gate | Result |
|---|---|
| `verify:write-contract` | PASS — 357 runtime writes, 129 tables, 16 notification writers, 61 dynamic writes |
| `verify:audit-contract` | PASS |
| `verify:coordination-lifecycle` | PASS — 26/26 |
| `verify:outbox-delivery` | PASS — 28/28 |
| `verify:f4b` | PASS |
| `certify:f3c` | PASS — 39/39 |
| `verify:f3b` | PASS |
| `verify:f2b` | PASS — 63/63 (see note) |
| `verify:f1c`, `verify:f0c` | PASS |
| `verify:permission-refs` | PASS |
| hardening / edge-authz / anon-execute / definer-guards / breadcrumbs / service-completeness | PASS |
| Frontend suite | PASS — 141 files / 1293 tests |
| RBAC action coverage | PASS — 46/46 |
| Typecheck / build | PASS |

Note on the transient F2 `42501`: reproduced once and diagnosed as environment-sensitive, not
a product defect. `verify:hardening` sets `row_security = off`; because the sandbox role holds
`BYPASSRLS` and Supavisor (port 6543) recycles connections, the setting leaks into a later
session and defeats the anonymous-read assertion. Run in isolation, `verify:f2b` is
deterministic and green (63/63).

### Runtime write-contract review (dynamic writes)

Of the 61 dynamic/non-literal writes, the two touching F4-critical tables were manually
re-verified against live schema:

- `supabase/functions/add-application-remark/index.ts:101` → `approval_actions`
  (`application_id`, `actor_id`, `action`, `action_type`, `comments`, `workflow_instance_id`, `step_id`) — payload-safe.
- `src/hooks/useWorkflowEngine.ts:458` → `approval_workflows` update
  (`name`, `description`, `license_type`, `entity_type`, `is_active`, taxonomy ids) — payload-safe.

No dynamic write targets `applications`, `licenses`, `entity_licenses`, `license_terms`,
`registration_licensing_handoffs`, `notification_outbox`, `notifications` or `audit_logs`.

## 2. Certification run — result

`scripts/certify-f4c.sql` executed from Section A. 87 probes recorded; 82 PASS, 5 FAIL.
Transaction rolled back; post-run residue census across workflows, gate configs,
applications, registrations and notifications returned zero in every dimension.

Sections B (readiness dimensions), C (workflow / maker-checker / decision authority),
E (provisioning + notification outbox) and G (privilege / state integrity) passed in full,
including all negative proofs (draft cannot approve, applicant cannot self-approve, wrong
maker/checker denied, ungoverned approval routine absent, anon/authenticated cannot mutate
the outbox, exactly one active one-minute provisioning schedule).

### Failures and classification

| Probe | Failure | Classification |
|---|---|---|
| A-01 / A-02 / A-03 / A-04 | F3→F4 boundary probes created drafts instead of being denied | HARNESS DEFECT |
| F-01 | "unrelated user cannot withdraw" returned success | HARNESS DEFECT |
| D-05 | no opening (`original`) licence term created at issuance | **PRODUCT DEFECT — DEF-F4-C-04** |

Evidence for the harness classifications:

- The Section A failures are caused by the fixture block calling
  `set_config('app.workflow_mutation_context','trusted', true)` to seed the F3-owned handoff
  application and never restoring it. The setting is transaction-local, so every subsequent
  `create_application_draft` call in the same transaction takes the `v_trusted` path and
  legitimately skips the handoff contract. The product control itself is intact and is proved
  independently by B-01a/B-01b/B-01c (`REQUIRED_AND_INCOMPLETE` / `PASS` / `NOT_APPLICABLE`).
- F-01 fails because the fixture's "unrelated" user is not unrelated: the selected user holds
  `application_management.edit`, so `withdraw_application` correctly treats them as staff.
  All other withdrawal probes (F-02 … F-10) pass, including reason enforcement, owner
  withdrawal, workflow cancellation, audit, notification, idempotency, terminal-state refusal
  and no-licence guarantee.

Evidence for DEF-F4-C-04 (product):

- `perform_final_workflow_approval` issues the licence, the `entity_licenses` linkage, the
  decision record, the audit entry, the notification and the provisioning tasks, but writes no
  `license_terms` row.
- No trigger on `public.licenses` and no other routine creates an `original` term;
  `license_terms` is only written by `license_lifecycle_action` on `APPROVE_RENEWAL` /
  variation paths.
- Live census: **59 licences, 0 holding an `original` term** (the single existing row is a
  `renewal` term). This contradicts the P04 licence-lifecycle contract
  (`docs/certification/p04-licence-lifecycle-depth.md`: "23/23 licences hold an original
  term"); the historical backfill was removed by the cert-v2 zero-state reset and no
  issuance-time writer was ever introduced, so term history now begins only at first renewal.

Because a product defect was found, the run was not repeated (item 8 — two consecutive
identical passes — is not satisfiable at this HEAD), and the live gap/health re-census
(item 9) is deferred to the successful certification attempt.

## 3. Verdict

**F4 NOT CERTIFIED — RETURN TO F4-B.**

Required F4-B5 scope (remediation, then F4-C attempt 4):

1. DEF-F4-C-04 (product): create the opening `original` `license_terms` row atomically inside
   governed licence issuance, aligned with the append-only trigger and the
   one-current-term-per-licence index; backfill the 59 existing licences; add a permanent gate
   proving every licence holds exactly one current term and that term matches licence validity.
2. Harness corrections: restore `app.workflow_mutation_context` immediately after the F3
   handoff seed (so Section A exercises the untrusted path), and select the "unrelated" probe
   user with an explicit exclusion of `application_management` permissions and of membership in
   the fixture entity.
3. Re-run the full F0–F4 regression battery and re-prove zero residue before F4-C attempt 4.
