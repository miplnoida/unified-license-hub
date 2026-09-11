# PCOMP-R2A-C — Evidence Policy Runtime: UX and Certification Closure

## Scope
Closure wave for PCOMP-R2A only. EVIDENCE_POLICY remains the single generic
policy family with runtime behaviour; the other nine remain configuration-only.
No policy values, ratings, published risk, historical assessments or demo
records were changed.

## Server contract (verified, not re-designed)
- Evidence requirement vocabulary is `REQUIRED | OPTIONAL | NOT_REQUIRED`.
- `supervisory_evidence_policy_rules()` normalises scope, requirement and
  source-kind vocabulary and clamps nonsense minimums; rule codes are stored as
  authored.
- Contract-level refusal (required fields, unknown kinds/scopes) is owned by
  `supervisory_policy_component_content_validate('EVIDENCE_POLICY', …)`;
  `supervisory_evidence_policy_content_errors()` owns evidence-specific
  semantics such as duplicate rule codes.
- Sufficiency is evaluated only by the platform from the evidence policy version
  pinned in the assessment's immutable policy basis, returning `EVALUATED`,
  `NOT_GOVERNED` or `UNAVAILABLE`, with per-rule decisions `SATISFIED`,
  `UNSATISFIED`, `NOT_REQUIRED`, `EXCEPTION_REQUIRED`, `EXCEPTION_APPROVED`.
- `supervisory_assessment_evidence_policy_internal(uuid)` is now service-role
  only; signed-in identities use the governed wrapper and read model.

## New governed read models
- `supervisory_assessment_evidence_policy_view(uuid)` — evaluation, exceptions
  and server-owned request/decide capabilities.
- `supervisory_evidence_policy_authoring_options(uuid)` — canonical scopes,
  requirements, evidence kinds and methodology-bound dimensions/questions.

## Frontend (display and governance only)
- `useAssessmentEvidencePolicy` hooks: read model plus governed exception
  request/decision mutations. No client evaluation.
- `AmlEvidencePolicyPanel` — pinned policy/profile version, server decisions,
  reasons, counts, exceptions, maker/checker controls.
- `AmlQuestionEvidencePanel` — per-question requirement context from the server.
- `EvidencePolicyRuleEditor` — controlled authoring from server vocabulary with
  a rule preview; the other nine families keep the generic editor.
- `evidencePolicyPresentation.ts` — labels/tones only.

## Certification evidence
| Gate set | Result |
|---|---|
| `scripts/verify-pcomp-r2a-evidence-policy.sql` | 50/50 PASS, rollback preservation 6/6 (components, assessments, exceptions, evidence, movements, risk digest unchanged) |
| `scripts/verify-pcomp-r1-effective-policy-spine.sql` | 51/51 PASS plus 5/5 rollback gates |
| `scripts/verify-evidence-fact-frontend-boundary.mjs` | 12/12 PASS |
| `src/test/amlEvidencePolicyPanel.test.tsx` | 17/17 PASS |
| Typecheck | clean |

## Verifier corrections made during closure
- R2A gates aligned to the real vocabulary (`REQUIRED`) and to the function that
  actually owns each refusal; negative minimums are certified as normalised
  rather than rejected.
- Census/preservation SQL alias and variable substitution fixed.
- R1C capability gate now expects nine configuration-only areas plus
  EVIDENCE_POLICY runtime/certified.
- The R1C EVIDENCE_POLICY incompatibility fixture now uses
  `EVIDENCE_SCOPE_REFERENCE_UNKNOWN`, because R2A correctly makes an unknown
  evidence kind unsubmittable.

## Honest limitations
- `scripts/verify-supervisory-policy-components.sql` still fails on an inherited
  fixture that creates regulator-owned content without naming the regulator.
  This is pre-existing ownership validation, unrelated to evidence runtime, and
  was not modified in this wave.
- Project-wide security linter findings (~1786) remain, dominated by established
  SECURITY DEFINER, search-path and definer-view categories. Not claimed clean.
- Browser walkthrough was not repeated in this wave.

## Classification
PASS for PCOMP-R2A evidence policy runtime and UX closure. PCOMP-R2B not started.
