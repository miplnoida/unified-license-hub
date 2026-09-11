# PCOMP-R1C — Certification & Visibility Closure

Baseline HEAD: `a7adaba0fb0ec85f0b97b452b3b223b1ae2106a2` (clean tree).

## Evidence

- Rollback-only behavioural verifier `scripts/verify-pcomp-r1-effective-policy-spine.sql`:
  **50/50 gates PASS** plus **5/5 post-rollback preservation gates PASS**.
  - Resolution: single ACTIVE resolution, UNRESOLVED/NO_ACTIVE_PROFILE_CONFIGURED,
    AMBIGUOUS/MULTIPLE_ACTIVE_PROFILES, MIPL reference never resolved, effective-date
    windows, inactive regulator excluded, cross-regulator scope refused, sector precedence.
  - Cross-component convergence (each finding raised then cleared by canonical content):
    RESPONSE_RISK_BAND_UNKNOWN, RESPONSE_ACTION_UNKNOWN, SLA_STAGE_UNKNOWN,
    EVIDENCE_KIND_UNKNOWN, FACT_NOT_CANONICAL, JUDGEMENT_BAND_STEPS_INVALID,
    SECTOR_CODE_UNKNOWN, SOURCE_FACT_UNKNOWN, MATERIALITY_MEASURE_UNKNOWN,
    DASHBOARD_METRIC_UNKNOWN, NOTIFICATION_EVENT_UNKNOWN; determinism confirmed;
    profile approval refused while incompatible.
  - Snapshots: stamped on programmed creation, profile/methodology/programme/calculation
    versions plus 13 component hashes, immutable and undeletable, prior snapshots unchanged
    by new profile versions, legacy assessments never backfilled.
  - Governance: inactive owner refused, reference authoring restricted, no self-approval,
    independent approval to ACTIVE, approved content immutable, append-only history.
  - Capability truth: methodology/programme/calculation CERTIFIED; all ten generic areas
    report not runtime consumed and cannot be promoted from the client.
  - Preservation after ROLLBACK: assessment, snapshot, profile, component, methodology and
    calculation counts identical; risk-of-record digest unchanged; 27 movements intact.
- Frontend: `src/test/amlPolicyBasisPanel.test.tsx` 10/10 (read-only Policy Basis panel,
  legacy NO_POLICY_BASIS state, no client-side policy computation).
- Typecheck clean; production build clean.
- Full integration suite (2 workers): **175 files / 1713 tests passed**.

## Preservation census

No policy values, active AML-CFT-RBA v1.0 content, risk ratings, published risk,
historical assessments or demo records were modified. Live database state remains one
DRAFT MIPL_REFERENCE v1.1 profile and no active profile.

## Remaining non-runtime areas

Sector overlay, facts, sources, evidence, materiality, judgement, response, SLA, dashboard
and notification policy remain AUTHORING_AVAILABLE / VALIDATABLE / BINDABLE only; runtime
semantics are deferred to PCOMP-R2/R3.

## Classification

**PASS** (subject to GitHub CI reporting green on the pushed commit).
