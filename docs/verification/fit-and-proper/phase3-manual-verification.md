# Phase 3 — Fit & Proper + Twin Peaks: manual verification handoff

Every scenario below is click-by-click. Each row names the route, the persona to
sign in as, the setup data, the action, the expected UI and the row that must be
persisted afterwards. Automated coverage lives in `supabase/tests/phase3/` and
`src/test/fitAndProperPhase3.test.ts`; this document covers the in-browser proof
that automation cannot give.

## 1. Individual registry and role history (FP-REG-001/002)

| Step | Detail |
|---|---|
| Route | `/fpa/individuals` |
| Persona | Internal user with `fit_and_proper.view` + `fit_and_proper.edit` |
| Action | Create an individual with full name, date of birth and national ID. Open the profile, add a director role and a senior-manager role for the same entity, then end-date the director role. |
| Expected UI | The profile lists both roles; the ended role shows its effective-to date and is no longer flagged current. |
| Persisted | one `fp_individuals` row, three `fp_individual_roles` rows, exactly two with `is_current = true`. |

## 2. Duplicate detection (FP-REG-003)

| Step | Detail |
|---|---|
| Route | `/fpa/individuals` → Create individual |
| Action | Enter a near-identical name plus the same date of birth as the person created in step 1. |
| Expected UI | The duplicate-candidate panel lists the existing person with a match score and a human-readable reason ("similar name + same date of birth"). Creation is still possible but requires an explicit confirmation. |
| Persisted | No merge and no status change on the existing record. |

## 3. PQ initial submission (FP-REG-004)

| Step | Detail |
|---|---|
| Route | Declaration invite link → `/declaration/...` |
| Persona | Declarant |
| Action | Complete every required question, save, then submit. |
| Expected UI | The PQ state badge moves draft → ready to submit → submitted; the form becomes read-only. |
| Persisted | `fp_assessments.pq_state = 'submitted'`, `submitted_at` set, `form_version_id` pinned. |

## 4. PQ amendment and version integrity (FP-REG-004)

| Step | Detail |
|---|---|
| Route | `/fpa/declarations` |
| Persona | Supervisor with `fit_and_proper.edit` |
| Action | Open the submitted questionnaire, press **Amend**, try a 3-character reason (must be refused), then submit a full reason. |
| Expected UI | Short reason is refused inline; after a valid reason the badge reads "Amendment required" and shows the reason. |
| Persisted | `pq_state = 'amendment_required'`, `pq_amendment_reason` retained, `declaration_data` and `form_version_id` unchanged. |
| Follow-up | Edit and publish a new version of the PQ template, then reopen the original submission — it must still render the original questions. |

## 5. Screening — live hit (FP-SCR-001)

| Step | Detail |
|---|---|
| Route | Individual profile → Screening |
| Action | Run screening against a configured live provider for a subject expected to hit. |
| Expected UI | Provider chip reads "Success — result found"; findings are listed for triage. |
| Persisted | `fp_screening_runs.provider_outcomes[].state = 'SUCCESS_HIT'`, `conclusive = true`. |

## 6. Screening — provider unavailable or sandbox (FP-SCR-001)

| Step | Detail |
|---|---|
| Route | Individual profile → Screening, and the assessment header |
| Action | Run screening with no provider connection configured, then again in sandbox mode. |
| Expected UI | Chips read "Provider not configured" / "Sandbox" with an explicit "check not completed" warning. **No screen anywhere may say "no adverse findings".** |
| Persisted | `state` is `NOT_CONFIGURED` / `SANDBOX`, `conclusive = false`. |

## 7. Assessment comparison (FP-ASS-002)

| Step | Detail |
|---|---|
| Route | Assessment detail → Comparison with prior assessment |
| Setup | A subject with a closed earlier assessment carrying findings. |
| Expected UI | Each finding is badged New / Changed / Unchanged / Resolved / Worsened, with prior → current severity shown, and the panel names the prior assessment. |
| Persisted | Nothing — the panel is read-only; prior findings must be byte-identical afterwards. |

## 8. AI advisory review

| Step | Detail |
|---|---|
| Route | `/fpa/ai-analysis` |
| Action | Open an advisory output produced while the provider was unavailable. |
| Expected UI | The canonical provider chip is shown and no clean/low-risk verdict is presented. Overriding the recommendation requires a justification; the original recommendation remains readable after the override. |
| Persisted | Override recorded with actor, timestamp and justification; the original output retained. |

## 9. Committee voting (FP-COM-001)

| Step | Detail |
|---|---|
| Route | `/fpa/committee` |
| Setup | Committee with quorum 3, threshold 60%, three active members (weights 2/1/1) and one deactivated member. |
| Action | (a) Record a decision after only two votes. (b) On a second assessment cast approve (chair), reject, abstain and record the decision. (c) Try to edit a cast vote. (d) Try to record the decision twice. |
| Expected UI | (a) outcome "Insufficient quorum". (b) outcome "Approved" at 66.67% — the abstention is shown but excluded from the percentage. (c) editing is refused. (d) the second attempt is refused. |
| Persisted | `fp_committee_decision_snapshots` rows with `entitled_members = 3`; snapshot values unchanged after a later committee reconfiguration. |

## 10. Twin Peaks disagreement (FP-COM-002)

| Step | Detail |
|---|---|
| Route | Individual profile → Regulator positions |
| Setup | Two regulators each with a current determination for the same person: suitable vs unsuitable. |
| Expected UI | Two side-by-side positions, each with its own regulator, actor, date, rationale and condition count, and a "Disagreement" coordination state. No single merged verdict is displayed anywhere. |
| Persisted | Both `fp_determinations` rows remain `is_current = true`. |

## 11. Condition evidence (FP-CON-001)

| Step | Detail |
|---|---|
| Route | Assessment detail → Conditions |
| Action | Create a condition with a due date and required evidence type. Upload evidence, reject it with a note, upload again and accept, then mark the condition satisfied. |
| Expected UI | Review state moves pending → rejected (with note) → accepted; the condition then shows satisfied with who closed it and when. |
| Persisted | `fp_condition_evidence` review trail plus `fp_condition_events` rows for each transition. |

## 12. Condition breach, waiver and storage denial (FP-CON-001)

| Step | Detail |
|---|---|
| Action | (a) Let a condition pass its due date and mark it breached without a rationale — must be refused. (b) Provide a rationale and record the breach. (c) Waive another condition without a justification — must be refused. (d) Sign in as an unrelated internal user and paste the evidence signed-URL/object path. |
| Expected UI | (a) and (c) are refused with a clear message; (b) records the breach and raises the escalation/notification; (d) returns an access error rather than the file. |
| Persisted | `fp_conditions.status`, `overdue_at`, `waiver_reason`, append-only `fp_condition_events`; no history row can be edited or deleted. |

## Automated coverage map

| File | Covers |
|---|---|
| `supabase/tests/phase3/01_registry.sql` | identity, multi-role history, duplicate scoring, direct-ID denial |
| `supabase/tests/phase3/02_pq.sql` | PQ states, amendment RPC, pinned version integrity after a template edit |
| `supabase/tests/phase3/03_screening.sql` | all eight provider states, "never clean" invariants, run conclusiveness |
| `supabase/tests/phase3/04_assessment.sql` | the six comparison classes and read-only guarantee |
| `supabase/tests/phase3/05_committee.sql` | entitlement, quorum, weighted tally, abstentions, immutability |
| `supabase/tests/phase3/06_twin_peaks.sql` | independent positions, aligned/disagreement/single-regulator |
| `supabase/tests/phase3/07_conditions.sql` | full condition lifecycle, append-only history, storage denial |
| `supabase/tests/phase3/08_rls_matrix.sql` | seven-persona behavioural matrix |
| `src/test/fitAndProperPhase3.test.ts` | client/SQL vocabulary parity and comparison classes |
