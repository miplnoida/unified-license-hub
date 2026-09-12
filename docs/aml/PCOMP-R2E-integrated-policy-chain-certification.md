# PCOMP-R2E — Integrated AML/CFT Policy Chain Certification

Baseline HEAD at start of wave: `79ea6d0ce56fbc8b7b649e43ccf403b789de3128` (clean tree).

## Scope

Integration and certification only. No new policy family was made operational.
Dashboard Policy, Notification Policy, Sector Overlay, Fact Config, Source
Binding and Materiality Policy remain configuration-only (six areas).

The certified chain, proven end to end in one rollback-only transaction:

```text
Policy Profile -> Assessment Policy Basis -> Evidence -> Readiness -> Calculation
  -> Judgement/Override -> Rating Approval -> Publication -> Operative Risk
  -> Response Policy -> AML-08 Consequence -> SLA Deadline / Hold / Completion
```

## Genuine server defects found and fixed

1. **Action-name convergence.** `supervisory_response_sla_open` passed the
   operational action (`OPEN_SUPERVISORY_PLAN`) to an SLA evaluator that only
   matched the policy-facing action (`SUPERVISORY_PLAN`), so a recorded
   consequence had no open governed deadline and hold/resume/completion were
   refused. Both identities now resolve exactly in both directions, are stored on
   the obligation (`policy_action`, `operational_action`) and are exposed by the
   read model. Unknown or near-match action names resolve to nothing — never to a
   guessed neighbour.
2. **Response provenance.** `supervisory_consequence_record` matched expectations
   on one name only, so the governing rule and response level were not recorded
   and a prohibited response submitted under its operational name was accepted.
   Both names are now matched; prohibited responses are refused.
3. **Approval permission resolution** for approval intent, and the **SLA read
   model referencing the wrong escalation timestamp**, were corrected earlier in
   the wave.
4. **Stale prior-wave verifiers.** R2A/R2B/R2C/R1 asserted capability counts and
   incompatibility fixtures written before SLA policy became runtime and before
   SLA content became governed at authoring. Expectations were corrected to the
   current truth (six configuration-only areas); the R1 SLA incompatibility gate
   now expresses the one incompatibility an SLA policy can still carry — timing
   work by a risk band the bound methodology does not own.

## Policy Trace read model

`public.supervisory_assessment_policy_trace(uuid)` is a stable, security-definer,
read-only model composing the policy basis, one link per policy stage (component
type, status, reason, policy code/version/hash, profile version, blocking count,
measure), the rating chain (calculated / approved / published / operative) and
downstream counts. `useAmlPolicyTrace` and `AmlPolicyTracePanel` are readers
mounted in the assessment workspace: no policy logic, arithmetic or writes exist
in TypeScript.

## Certification evidence

| Gate set | Result |
|---|---|
| `scripts/verify-pcomp-r2e-integrated-policy-chain.sql` | **57/57 PASS**, rollback-only |
| `scripts/verify-pcomp-r1-effective-policy-spine.sql` | **51/51 PASS** |
| `scripts/verify-pcomp-r2a-evidence-policy.sql` | **50/50 PASS** |
| `scripts/verify-pcomp-r2b-judgement-policy.sql` | **63/63 PASS** |
| `scripts/verify-pcomp-r2c-response-policy.sql` | **66/66 PASS** |
| `scripts/verify-pcomp-r2d-sla-policy.sql` | **102/102 PASS** |
| Focused policy panels (trace, basis, response, SLA) | 32/32 PASS |
| Typecheck + full integration suite | clean; **179 files, 1752 tests passed** |

Preservation census after rollback: policy profiles, components, assessments,
policy snapshots, calculation runs, overrides, publications, consequence
decisions, SLA obligations, risk movements, SLA stages and the canonical risk
digest all unchanged; no `R2ECERT` fixture survived.

## Honest limitations

- No authenticated browser walkthrough was run in this wave; UI evidence is the
  focused panel contract tests.
- Live assessments still carry no policy basis, so real records report
  `NOT_GOVERNED`. The governed `EVALUATED` path is certified against
  rollback-only synthetic fixtures.
- Project-wide security linter findings (~1,797) remain, dominated by inherited
  SECURITY DEFINER, search-path and definer-view categories. Not claimed clean.

## Classification

PASS for PCOMP-R2E integrated policy chain certification. No further policy
family runtime was started.
