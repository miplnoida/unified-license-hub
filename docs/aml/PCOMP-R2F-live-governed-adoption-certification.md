# PCOMP-R2F — Live governed AML/CFT adoption and operational certification

Baseline HEAD: `099f9d3934e1d324855c7c495d59c68c472db4e2` (rebaselined, clean).

## 1. What is now live (retained)

| Object | State |
| --- | --- |
| `FSRA-AML-CFT-POLICY` v1.0 | ACTIVE, REGULATOR_AUTHORED, FSRA-owned, 7 exact bindings |
| Bindings | METHODOLOGY (AML-CFT-RBA v1.0), CALCULATION_CONFIG, ASSESSMENT_PROGRAMME (FSRA-adopted set), EVIDENCE / JUDGEMENT / RESPONSE / SLA policy (all FSRA-owned, ACTIVE) |
| Reference content | No MIPL_REFERENCE object is operative policy |

Created by `scripts/pcomp-r2f-live-governed-adoption.sql` (idempotent, maker/checker lifecycle,
compatibility validated before activation). No methodology content, calculation values, historical
assessment or published rating was modified.

## 2. The live governed case

`scripts/pcomp-r2f-live-governed-chain.sql` created a real assessment through
`supervisory_assessment_create_programmed` for `DEMO AML 22` (Pigeon Island Payment Bank Ltd) and
drove the whole chain server-side. Retained: **`SUP-AML_CFT-2026-00830`**, status `approved`,
19/19 chain gates:

policy resolution (`CONFIGURED`) → immutable policy basis (`FSRA-AML-CFT-POLICY` v1.0) →
evidence deficiency and refused readiness → answers → real finding as evidence → independently
approved evidence exception → calculation (recommended **SEVERE**) → prohibited LOW override refused
→ permitted SEVERE→HIGH override with judgement-policy provenance, independently approved →
submission and publication (**operative HIGH**) → prohibited deferral refused → required
supervisory plan with response-policy provenance → SLA opened under `FSRA-AML-SLA-PLAN` (10 days),
paused, completed **ON_TIME** → Policy Trace 4/4 stages governed.

## 3. Certification

`scripts/verify-pcomp-r2f-live-governed-adoption.sql` — **20/20 PASS**, plus 3/3 preservation gates
after rollback. Gates A1–A12 read the retained live state (active package, exact bindings, approved
policy only, server resolution, immutable basis that cannot be rewritten, calculation and judgement,
published risk of record, preserved prior rating history, governed response deadline, integrated
trace). Gates B1–B8 are rollback-only: author cannot approve, officer without AML authority cannot
approve, v2.0 rollover does not rewrite the retained assessment's pinned policy, existing work stays
on v1.0 while new work takes v2.0 and its stricter evidence rule, an internally incompatible package
is detected and refused activation.

`scripts/verify-pcomp-r1-effective-policy-spine.sql` — PASS with preservation gates.
`bunx tsgo --noEmit` clean. Full suite: **179 files / 1752 tests passed**.

## 4. Honest limitations

1. **R2A–R2E verifier reruns blocked in this environment.** Those scripts seed synthetic personas by
   writing `user_roles` / `sec_*`, which needs an elevated database role; the current sandbox session
   holds only `authenticated`. Their prior certifications (R2A 50/50, R2B 63/63, R2C 66/66,
   R2D 102/102, R2E 57/57) stand as recorded evidence and were not re-obtained here.
2. **No authenticated browser walkthrough.** No preview auth session could be minted in this
   session, so the operational screens were not re-driven; the chain evidence above is server-side.
3. **Duplicate rating movements.** Entity 22 carries three AML/CFT movements, two of them same-rating
   HIGH entries written during approval and publication of the new case. History was left exactly as
   the server wrote it rather than edited.
4. **`supervisory_policy_profile_resolve` note text is stale**, still saying the generic components
   are "not yet runtime consumed". Wording only — the four runtime families are demonstrably
   consumed. Not changed in this wave.
5. **CI classification unresolved.** GitHub Actions logs are not reachable from here; local lint
   still carries ~6,367 inherited `no-explicit-any` findings, explicitly out of scope for R2F.
6. DEC-01…DEC-08 remain regulator decisions; the live calculation configuration is the previously
   recorded demonstration configuration, not signed regulator policy.

## 5. Classification

**PASS for policy and application**, with CI and browser certification recorded as not obtained.
No further wave was started.
