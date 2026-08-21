# Production Commissioning & Go-Live Acceptance

**Programme:** PRODUCTION COMMISSIONING & GO-LIVE ACCEPTANCE
**Release candidate:** the build certified in `docs/certification/final-brd-frd-certification.md`
**Predecessor verdict:** BRD/FRD CONFORMANCE = PASS (CONDITIONAL)
**Evidence collected:** 2026-08-21
**Verdict:** **NO_GO — commissioning incomplete (environment not provisioned)**

---

## 0. Decisive environment finding — CM-DEF-01 (BLOCKING)

Commissioning evidence must come from the **production environment**. The only
environment reachable from this project is still classified non-production:

```
select * from cert_nonproduction_guard;
 project_ref          | environment     | reset_enabled | note
 sndfttzqmbkmkcnrvpfn | non_production  | t             | Wave D Step 0 certification reset allow-list
```

The same backend also carries the E01–E20 certification dataset and has
`reset_enabled = true`, i.e. destructive reseed is still permitted. No separate
production project, production URL set, or production secret set exists yet.

**Consequence:** gates that are defined as *production-environment evidence*
(providers, backup/restore, DR, production-build performance, load, production
smoke) **cannot be evidenced here and are recorded FAIL — NO EVIDENCE**, not
PASS. Recording them as PASS from a non-production project would be a
fabricated receipt, which section 4 of the programme explicitly forbids.

**Required before this document can be reissued:** provision the production
environment (separate project/instance, production secrets, production URLs),
promote the release candidate to it, and re-run gates 4–7 there.

---

## 1. Release freeze

Freeze honoured. No product features, no new implementation wave, no
enhancement work. One configuration change was made (gate 2, auth hardening)
and it is a commissioning action explicitly required by the programme.

| Check | Result |
| --- | --- |
| New feature work | None |
| Schema migrations | None |
| Application logic changes | None |
| Typecheck / build | Clean (`tsgo --noEmit`, no diagnostics) |

**Gate: PASS**

---

## 2. Auth commissioning

### 2.1 Leaked-password protection — PASS

Enabled on the target auth configuration this session. Verified indirectly:
the security scan run immediately afterwards no longer reports the
leaked-password finding it previously raised. Remaining auth flags were left at
their existing values, confirmed safe against the codebase:

| Flag | Value | Justification |
| --- | --- | --- |
| `password_hibp_enabled` | **true** (changed) | Commissioning requirement |
| `disable_signup` | false (unchanged) | Public registration step 1 (`UserAccountStep.tsx`) calls `signUp` |
| `auto_confirm_email` | true (unchanged) | Registration runs its own email-OTP verification before account creation |
| `external_anonymous_users_enabled` | false (unchanged) | Anonymous sign-in is not part of the design |

RBAC/RLS untouched: 0 RLS-enabled tables without a policy.

### 2.2 Staff MFA policy — OWNER DECISION REQUIRED

Capability is present and application-level, not provider-level: `profiles` and
`pre_license_users` both carry `two_factor_enabled`, the login path in
`AuthContext.tsx` returns `requires2FA` from it, and `Profile.tsx` exposes
enrolment.

Current adoption:

| Population | Accounts | With 2FA |
| --- | --- | --- |
| Internal staff (`profiles`) | 21 | **0** |
| External users (`pre_license_users`) | 35 | **0** |

No policy currently *requires* MFA for staff, and no account has enrolled, so
the enrolment / login / recovery path cannot be exercised as a production
control. The platform owner must record one of:

- **MFA required for staff** — then enrol at least one supervisory and one
  administrator account and exercise enrolment, MFA login, and recovery; or
- **MFA not required** — then record the accepted residual risk and
  compensating controls (leaked-password protection, RBAC, audit trail).

**Gate: PARTIAL — hardening PASS, MFA OWNER DECISION REQUIRED**

---

## 3. Fit & Proper historic determinations

No bulk update was performed, as instructed.

```
select count(*) from v_fp_determination_integrity;  -->  9
```

The 9 historic assessments remain in `determined` state without determination
artefacts. This is by design of the control: the governed determination action
**refuses** to finalise them because the seeded records lack the screening and
committee evidence the process requires — proof the gate works, and precisely
why they cannot be closed by an agent or by SQL.

Each must be resolved by an authorised Fit & Proper officer through the
governed determination process, recording officer, outcome, rationale, evidence
and audit linkage. A forward invariant already blocks any *new* assessment from
reaching `determined` without an artefact.

**Gate: FAIL — 9 outstanding (requires authorised officer action)**

---

## 4. Provider commissioning

Production credentials are not installed. Registry state:

| Provider | Category | Enabled | Status | Credentials |
| --- | --- | --- | --- | --- |
| `email_smtp` | Notifications | true | inactive | required, absent |
| `sms_provider` | Notifications | false | inactive | required, absent |
| `notification_provider` | Notifications | false | inactive | required, absent |
| `aml_screening` | Screening | true | **active** | present (test) |
| `sanctions_screening` | Screening | true | **active** | present (test) |
| `identity_verification`, `credit_bureau` | Screening | false | inactive | required, absent |
| `external_registry`, `government_registry` | Registry | false | inactive | required, absent |
| `document_signing`, `audit_export`, `external_reporting`, `payment_gateway`, `platform_api`, `ai_gateway` | various | mixed | inactive | required, absent |

13 of 15 connections are inactive. The two active screening connections carry
non-production configuration.

**Email is not commissioned at all:** no email infrastructure exists on this
backend (`email_send_log`, `email_send_state`, `suppressed_emails` and the
`auth_emails` / `transactional_emails` queues are absent). Sending requires a
sender domain the owner owns, delegated and verified, plus queue provisioning —
an owner action in the production environment.

Failure drills (auth failure, unavailable/timeout, retry, dead-letter, logging)
therefore cannot be exercised against real providers. Retry and DLQ paths are
covered by automated tests only; live failure rows remain zero.

**Gates: PROVIDERS FAIL — NO EVIDENCE. FAILURE/RETRY DRILLS FAIL — NO EVIDENCE.**

---

## 5. Backup / restore / DR

Not performed. There is no non-production copy of a production dataset to drill
against, and the programme forbids a destructive drill against the only copy.
All required fields are unmeasured:

| Field | Value |
| --- | --- |
| Backup used / timestamp | none |
| Restore start / completion / validation | none |
| Actual RTO | **not measured** |
| Actual RPO / data-loss window | **not measured** |
| Critical table counts after restore | n/a |
| Authentication availability after restore | n/a |
| Application smoke after restore | n/a |

**Gates: BACKUP/RESTORE FAIL — NO EVIDENCE. DR FAIL — NO EVIDENCE.**

---

## 6. Production build performance and load

No production/release build is deployed, so the ten required journeys cannot be
measured under production conditions. The only figures on record are the
development-build measurements in the final BRD/FRD certification
(1.67–2.13 s to network idle across 10 authenticated routes); they are not
acceptable as production evidence.

No concurrent-user test was run: concurrent users, duration, request volume,
p50/p95/p99, error rate and database pressure are all unmeasured. Separate load
fixtures and accounts must be used so E01–E20 certification records stay
uncontaminated — a further reason this must not be run against the current
backend, which *is* the certification dataset.

**Gate: CONDITIONAL — no production measurement; load NOT RUN.**

---

## 7. Final smoke test

Deferred. A production smoke over supervisor / external filer / administrator /
wrong-domain isolation is only meaningful against the commissioned production
environment. The equivalent walkthrough passed on the release candidate during
BRD/FRD certification (10 supervisory routes, correct RBAC denials, 84
`ACCESS_DENIED` and 28 `AUTH_FAILED` security events recorded), which
establishes the build is smoke-ready — not that production is.

Typecheck/build clean at freeze.

**Gate: FAIL — NO EVIDENCE (production smoke not executed).**

---

## 8. Historic audit note

No historic audit entry was modified. `compliance_audit_logs` is append-only and
remains immutable by design.

| Population | Rows | Attribution |
| --- | --- | --- |
| Total | 1,026 | — |
| Created before CERT-DEF-01 | 936 | **lack actor/role attribution** — accepted, documented, not retrofitted |
| Created after CERT-DEF-01 | 3 | **3 of 3 carry user + role or explicit `SYSTEM` principal** |

Entries created before the CERT-DEF-01 fix may lack actor/role attribution.
This is a known historic limitation of records produced by automated and seeded
paths; it is documented rather than corrected, because falsifying attribution on
immutable audit records would be a worse defect than the gap.

**Gate: PASS**

---

## 9. Cutover hygiene

| Item | State |
| --- | --- |
| pgTAP extension / test-only objects removed | **NO** — `pgtap` still installed; 10 test-only functions in `public` |
| Non-production reset guard removed | **NO** — `cert_nonproduction_guard.reset_enabled = true` |
| Secrets are production secrets | **NO** — no production secret set exists |
| No test credentials | **NO** — active screening connections use test configuration |
| Scheduled workers enabled | `pg_cron` installed; production schedule unverified |
| Notification workers enabled | **NO** — no email/notification infrastructure provisioned |
| Monitoring / logging enabled | **YES** — structured logging, integration logs, `security_event_logs` (112 events) |
| Backups scheduled | Unverified in target environment |
| Environment URLs / config correct | **NO** — production URLs not configured |

**Gate: FAIL**

---

## 10. Gate summary

| # | Gate | Verdict | Basis |
| --- | --- | --- | --- |
| 1 | Release freeze | PASS | No feature work; build clean |
| 2a | Auth hardening (leaked passwords) | PASS | Enabled and scan-confirmed |
| 2b | Staff MFA policy | OWNER DECISION REQUIRED | Capability present, 0 enrolled, no policy |
| 3 | F&P determination integrity | FAIL | 9 outstanding; officer action required |
| 4a | Production providers | FAIL — NO EVIDENCE | 13/15 inactive; email not provisioned |
| 4b | Provider failure / retry drills | FAIL — NO EVIDENCE | No live providers to fail |
| 5a | Backup / restore | FAIL — NO EVIDENCE | Drill not performed |
| 5b | DR | FAIL — NO EVIDENCE | Drill not performed |
| 6a | Production build performance | CONDITIONAL | Dev-build figures only |
| 6b | Concurrency / load | CONDITIONAL — NOT RUN | No fixtures / environment |
| 7 | Production smoke | FAIL — NO EVIDENCE | Production not deployed |
| 8 | Historic audit note | PASS | 3/3 new attributed; history documented |
| 9 | Cutover hygiene | FAIL | pgTAP, reset guard, test creds, URLs |
| 10 | Data integrity | PASS | 124 filings, 0 orphaned; invariants hold |
| 11 | Security | PASS (with documented divergences) | 0 policy-less RLS tables; 0 critical findings |
| 12 | No critical open defects | PASS | 0 critical; 1 blocking commissioning defect (CM-DEF-01) |

### Data integrity detail

| Check | Result |
| --- | --- |
| Return filings | 124, 0 with a missing entity reference |
| Reporting obligations | 56 |
| Threshold breaches | 16, 2 acknowledged via governed acknowledgement records |
| Prudential directives | 1 |
| AI insights | 5, 5 with a recorded review decision |
| RLS-enabled tables without a policy | 0 |

### Security detail

Scan of 2026-08-21 returned 4 findings, 0 critical, 0 data-exposure: one
`SECURITY DEFINER` view class and three `SECURITY DEFINER` function classes,
all previously accepted as documented divergences (RLS helper predicates and
pgTAP test objects). The leaked-password finding present in earlier scans is
now closed. Retiring pgTAP at cutover removes most remaining entries.

---

## 11. Final go-live gate

| Required condition | Required | Actual |
| --- | --- | --- |
| Auth commissioning | PASS | PARTIAL (MFA decision open) |
| F&P determination integrity | 0 outstanding | **9** |
| Production providers | PASS | FAIL |
| Provider failure drills | PASS | FAIL |
| Backup / restore | PASS | FAIL |
| DR | PASS | FAIL |
| Data integrity | PASS | PASS |
| Production smoke | PASS | FAIL |
| Security | PASS | PASS |
| No critical open defects | PASS | PASS |

**GO_LIVE = NO.** Six required conditions are unmet. None of them is a software
defect: every one is an environment-provisioning, provider-credential, or
authorised-officer action that must occur in the target environment. The
release candidate itself remains certified and unchanged.

### Ordered path to GO

1. Provision the production environment — separate instance, production
   secrets, production URLs; promote the release candidate.
2. Remove pgTAP and the non-production reset guard from production; confirm no
   test credentials remain.
3. Record the staff MFA decision; if required, enrol and exercise
   enrolment / login / recovery.
4. Install production email (owned sender domain, delegated and verified, queue
   provisioned) and any SMS / registry / screening credentials; run success,
   auth-failure, timeout, retry and dead-letter drills with real provider
   responses.
5. Have an authorised F&P officer close the 9 historic determinations through
   the governed process until `v_fp_determination_integrity` returns 0 rows.
6. Execute a backup/restore and DR drill against a restored copy; record RTO
   and RPO.
7. Re-measure the production build over the ten journeys and run a load test on
   separate fixtures.
8. Run the production smoke across all four personas, then reissue this
   document.

---

## 12. Sign-off

This document may only be signed once its gates read PASS or a documented,
owner-approved acceptance. Signing at NO_GO is not valid.

| Role | Name | Decision | Date | Notes |
| --- | --- | --- | --- | --- |
| Platform Owner | | | | Environment provisioning, MFA policy, pgTAP retirement |
| Security / Infrastructure | | | | Auth hardening, secrets, backup/DR drill |
| Operations | | | | Provider commissioning, failure drills, monitoring, load test |
| Regulatory / F&P Owner | | | | 9 historic determinations |
| Project / Delivery Owner | | | | Overall go-live acceptance |

**Performance/load acceptance (only if accepted as non-blocking):**

| Finding | Accepted by | Date | Rationale |
| --- | --- | --- | --- |
| Production build performance not re-measured | | | |
| Concurrency / load test not executed | | | |
