# EPR-03 — P11 Enforcement Process Rationalisation: Certification & Closure

**Status: EPR-03 COMPLETE = YES.** P06 (EPR-01) and P07 (EPR-02) are recorded as CLOSED in
`docs/enterprise/process-operating-model.md`; P11 now joins them.

## 1. Process shape

`Referral → Notice → Representation → Assessment → Decision → Sanction → Appeal → Monitoring → Closure`

- Referral into the process: `enforcement_referral_create` — validates the source record,
  derives the regulated entity server-side, checks referral authority.
- Every transition: `enforcement_case_action` — reads the configured stage model, checks
  enforcement authority, enforces rationale/evidence/maker-checker rules, writes the case
  timeline and the P11 compliance audit trail.
- The browser holds no lifecycle rules and performs no DML on `enforcement_actions`,
  `enforcement_case_events` or `enforcement_obligations`.

## 2. Certification scenarios (executed, evidence retained)

| Scenario | Source | Result |
|---|---|---|
| E1 | `COMPLAINT` | `ENF-2026-00001` driven REFERRAL → CLOSED. Source complaint record and its workflow state untouched; no `approval_actions` written. |
| E2 (central acceptance test) | `PRUDENTIAL_BREACH` | `ENF-2026-00002` full lifecycle including the appeal leg, with no complaint workflow involvement at any point. |

Additional assertions proven: unknown/mismatched source rejected; rationale minimum
enforced; closure blocked while obligations or penalties remain open; maker/checker
separation absolute (the referrer is refused a checker decision even holding `decide`);
audit rows attributed and immutable (`tg_cal_block_mutation`).

Script: `scripts/epr03/enforcement-certification.sql` (applied via migration; retained as
non-production evidence).

## 3. Defects found and remediated during certification

1. **Case-number concurrency** — `count(*) + 1` replaced by a sequence-backed yearly
   counter (`enforcement_case_number_counters`) plus a unique index on `case_number`.
2. **Decision authority** — maker/checker hardened so the referring/opening officer cannot
   take checker-mandated decisions.

## 4. Coupling removal / retirement

Deleted: `EnforcementDetail`, `EnforcementList`, `EnforcementLifecyclePanel`,
`EnforcementObligationsPanel`, `src/lib/enforcementGovernedOps.ts`.
Canonical surfaces: `/enforcement` (`EnforcementWorkQueue`), `/enforcement/:id`
(`EnforcementWorkspace`), Entity 360 read-only `EntityEnforcementPanel`.

Regression lock: `src/test/enforcementProcessGuardrails.test.ts` (7 tests) and the updated
`src/test/complaintWorkflowGuardrails.test.ts` — 17 tests passing.

## 5. Next package

**EPR-04 — P05 Fit & Proper case rationalisation.**
