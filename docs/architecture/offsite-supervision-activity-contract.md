# Offsite supervision — activity contract (OS-01B)

## Intervention vs engagement

A **supervisory intervention** is a *decision* recorded on an approved supervisory
plan: the regulator has decided to do something about a risk. An **engagement** is
the *work* that carries the decision out. They are different objects with different
lifecycles, and the server owns the mapping between them
(`supervisory_intervention_execution_contract`).

Each intervention type has exactly one execution kind:

| Execution kind | Meaning | Examples |
| --- | --- | --- |
| `EXAMINATION` | Executed as one canonical examination | `OFFSITE_REVIEW`, `ONSITE_EXAMINATION`, `FOLLOW_UP_REVIEW`, `THEMATIC_REVIEW` |
| `INVESTIGATION` | Executed as an investigation | `INVESTIGATION`, `FORMAL_INVESTIGATION` |
| `LIGHTWEIGHT` | Recorded and closed on the intervention itself | `DESK_REVIEW`, `SUPERVISORY_MEETING`, `INFORMATION_REQUEST`, `ENHANCED_MONITORING` |
| `REFERRAL` | Handed to another process | `ESCALATION_REFERRAL`, `ENFORCEMENT_REFERRAL` |

## Six canonical engagement types

`examinations.engagement_type` accepts only these values, enforced by
`examinations_engagement_type_chk` and served to screens by
`supervisory_engagement_types()`:

`FULL_SCOPE_ONSITE`, `TARGETED_ONSITE`, `OFFSITE_REVIEW`, `FOLLOW_UP_REVIEW`,
`JOINT_EXAMINATION`, `THEMATIC_EXAMINATION`.

Display wording (`targeted`, `full_scope`, `Offsite Review`, `OFFSITE`) is never
persisted; casing is normalised server-side. `ONSITE_EXAMINATION` is ambiguous
between full-scope, targeted and joint work, so the engagement must be chosen by a
person — it is never guessed.

## The Desk Review boundary

A desk review is a lightweight supervisory action, not an engagement. It cannot
open an examination, has no scope, team, workpapers or stage machine, and no
desk-review lifecycle is invented. Its outcome is recorded on the intervention, and
escalating it means opening a *new* intervention of an examination-backed type.

## End-to-end Offsite Review

```text
approved plan
  -> intervention OFFSITE_REVIEW (maker/checker endorsed)
    -> supervisory_examination_open(engagement_type = OFFSITE_REVIEW)
       one row in public.examinations
         -> scope from assessment (exact provenance, no questionnaire copy)
         -> examination team (lead examiner rules apply)
         -> information requests (EXM-...-RFI-nnn)
         -> workpapers + review state (EXM-...-WP-nnn)
         -> same stage machine and prerequisites as onsite work
         -> canonical finding (plan, intervention, assessment, examination)
            -> canonical remediation action
```

## Shared workspace

There is no offsite workspace. `ExaminationWorkspace` and every panel
(`ScopingMemoPanel`, `TeamPanel`, `DataRequestsPanel`, `WorkpapersPanel`,
`FindingsPanel`, `ExitMeetingPanel`) render an offsite review unchanged. Only the
*wording* adapts, through `engagementPhrasing` / `examinationWorkLabel`, because
"fieldwork" and "on-site" are misleading for work done from the regulator's desk.
No component is forked, and no role name is evaluated in React.

## Capability authority

Screens ask `supervisory_intervention_execution_capabilities(intervention_id)`
whether an examination may be opened, which engagement types are permitted, what
the default is, and — when refused — why. The client mirror in
`src/lib/supervisoryEngagement.ts` is a fallback for wording only; the server
refusal is always the authority and every write is re-checked server-side.

## Zero duplication

No offsite-specific table, view, materialised view, read model or function exists
(`OSACT-07`, `OSACT-10`, `OSACT-29`). One offsite review is exactly one
`examinations` row, with one audit trail.

## Backlog

- **Enterprise RFI convergence** — examination information requests and the
  enterprise information-request register should converge on one request engine.
- **Next wave: OS-02 Continuous Offsite Monitoring** — periodic returns, triggers
  and alerts feeding supervisory attention, still without new engagement objects.

## Verification

- `scripts/verify-offsite-activity-contract.sql` — OSACT-01…30, all fixtures in a
  rolled-back transaction, with a production-state proof after rollback.
- `src/test/amlSupervisoryActivityContract.test.tsx` — OSUI-01…15.
