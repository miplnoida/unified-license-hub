# AML/CFT SupTech — Golden Demo Certification

Wave: rehearsal and certification only. No new product features, no methodology redesign, no change to
active calculation policy values, no change to published ratings, no alteration of historical records.

| Item | Value |
|---|---|
| Repository baseline at start | clean HEAD `d5f0800c51813b457462e17ff6b0aaa8ba1ff40f` |
| Rehearsal persona | `aml_supervision_supervisor@mishainfotech.com` (`0b522724-adcb-48bf-b21d-175339479616`) |
| Maker persona referenced on screen | `aml_supervision_officer@mishainfotech.com` (`b8eaf680-fe66-4d49-b816-1c087f511235`) |
| Anchor entity | DEMO AML 06 Rodney Bay Payments Ltd (`aa220000-0000-4000-8000-000000000006`) |
| Anchor assessment | SCEN-06 `c3e16863-60d8-4c6e-8650-3f0eefcbc0cf` (`SUP-AML_CFT-2026-00744`) |
| Active calculation configuration | `daf7d06e-1876-45bc-8a14-6869545f65a5` on AML-CFT-RBA v1.0 (ACTIVE, REGULATOR_AUTHORED) |
| Published rating | residual LOW, calculation run hash `22ef382593b79db559563072bd70fb90`, inherent band LOW, control band STRONG |
| Verdict | **CONDITIONAL PASS — GO for recording**, with the stated limitations narrated on camera |

## 1. Authenticated scene-by-scene rehearsal

All routes were exercised in a real browser with a restored supervisor session.

| Scene(s) | Route | Result |
|---|---|---|
| 1–3 | `/supervision/aml` | loaded, 0 HTTP ≥400 |
| 4 | `/supervision/aml/entities` | loaded, 0 HTTP ≥400 |
| 5 | `/entities/aa220000-0000-4000-8000-000000000006` | loaded, entity named on screen |
| 6–10, 19 | `/supervision/aml/assessments/c3e16863-…` | loaded; header, readiness, calculation, review, approval history, consequence tabs present |
| Prelude A–K | `/admin/supervisory-methodology` | loaded, v1.0 ACTIVE and v1.1 DRAFT both visible |
| Prelude / 10a–10b | `/admin/supervisory-calculation` | loaded, active configuration visible |
| 10c | `/admin/supervisory-calculation/approvals` | loaded, maker/checker history visible |
| Prelude | `/admin/supervisory-policy-profiles`, `/admin/supervisory-assessment-programmes` | loaded |
| 11 | `/supervision/aml/work-queue` | loaded |
| 12–16 | `/entities/…007`, `/supervision/aml/examinations` | loaded; DEMO AML 07 present |
| 17 | `/supervision/aml/findings` | loaded, `SF-AML-2026-00327` present |
| 18, 20 | `/entities/…005`, `/entities/…008` | loaded |
| 22–24 | `/supervision/aml/portfolio`, `/supervision/aml/heatmap` | loaded, portfolio report renders fully |

Totals: 17 routes, 17 rendered, **0 responses with HTTP status ≥400**, no page-level error state.
Console shows only inherited `Function components cannot be given refs` warnings that predate this
wave and are invisible on camera.

## 2. Defects found and corrected in this wave

1. **Assessment header showed no inherent or control rating.** The header read only the working-file
   columns, which are empty for a calculated assessment, so an approved LOW rating appeared beside two
   dashes. Corrected display-only in `src/pages/supervision/aml/AmlAssessmentWorkspace.tsx`: the header
   now falls back to the server's latest CALCULATED run bands (LOW / STRONG) and labels them
   `calculated`. No rating is computed, decided or stored in the browser.
2. **Downstream demo seed was not idempotent after publication.** Governed consequence idempotency is
   keyed on the current risk basis, so a rerun after SCEN-06 publication created a duplicate plan and
   reassessment. The duplicates were removed through governed operations only
   (`scripts/demo/withdraw-aml-demo-duplicate-consequences.sql`: consequence withdrawal, then plan
   lifecycle CANCELLED), and `scripts/demo/seed-aml-demo-downstream.sql` now guards on the existing
   business record. The duplicate reassessment requirement is retained because no governed cancellation
   operation exists for it; it is a coherent record and was not deleted.
3. **Stale artefact claims.** Route manifest, scenario manifest, storyboard, presenter script and
   recording runbook still described the demonstration as policy-blocked with no publication, and used
   the retired `/aml/assessments/:id` path. All were reconciled to the current state.
4. **Finding lineage overstated.** `SF-AML-2026-00327` is recorded with `source_kind = ASSESSMENT` and
   is not linked to the showcased examination. All narration now describes it honestly as a finding
   whose recorded source is the assessment.

## 3. Data and governance evidence

- `scripts/demo/verify-aml-demo.sql` passes all current gates (INTEGRITY, CURRENT, DOWNSTREAM), with
  explicit legacy notices for 20 pre-AML-07 risk states without publication decisions and 984 historical
  responses predating question plans. Neither population has grown.
- `scripts/verify-aml-calculation-governance.sql` passes 14/14 (rollback-only).
- Full suite: **174 files / 1703 tests passed**, two-worker configuration. Typecheck clean.
- Risk history remains append-only and fully attributed: 27 movement rows, every row carrying a reason,
  a trigger and an approving identity. Nothing was mutated to improve the demonstration.
- Maker/checker separation holds on the configuration approval and on the rating approval and
  publication: submitter and approver are distinct identities.

## 4. Presenter safety and recovery

- Read-only walkthrough. Do not author, edit or re-activate a calculation policy, publish a further
  rating, or edit any seeded record on camera.
- Refusals are part of the story (open plan cannot be evaluated; earlier periods are not calculable).
  Show the message; never work around it.
- `/supervision/aml/examinations` takes up to ten seconds to populate. Open it one scene early or pause
  on the narration while it loads.
- Recovery: every screen has a refresh control; if a list looks empty, refresh once before moving on. If
  the session expires, sign in again as the supervisor persona and return via the route manifest. Never
  re-run a seed script during recording.

## 5. Timed paths

| Path | Duration | Scenes |
|---|---|---|
| Executive | 5 min | 1–3, 10, 12, 17, 22–24 |
| Standard | 20–25 min | full 24-scene script |
| Deep dive | 35–45 min | full script plus the policy and methodology configuration prelude A–K and the calculation trace |

## 6. Q&A sheet

- *Is the rating produced by the software's opinion?* No. The methodology defines the questions and
  scales; a separately approved calculation policy defines scoring, bands and the residual matrix. Both
  are configured by the regulator and visible in full.
- *Are these your policy values?* They are demonstration values, authored and approved in this
  environment. The eight regulator decisions DEC-01…DEC-08 remain unsigned.
- *Why do older assessments say not calculable?* Policy takes effect from its approval date forward.
  Earlier periods resolve no policy and are left exactly as recorded.
- *Can anyone approve their own work?* No. The officer who records or configures cannot approve;
  approval and publication require a second authorised identity, with a recorded reason.
- *Can history be edited?* No. Risk movements and governance decisions are append-only and attributed.

## 7. Limitations to state on camera

1. The active calculation configuration carries demonstration values; DEC-01…DEC-08 are unsigned.
2. Only SCEN-06 has a published calculated rating; other periods are correctly not calculable.
3. Historical ratings on cases 06–24 are officer-recorded legacy ratings without publication provenance.
4. The showcased high-severity finding is assessment-sourced, not examination-linked.
5. Methodology v1.1 remains DRAFT / MIPL_REFERENCE reference material.

## 8. Verdict

**CONDITIONAL PASS — GO for recording.** Every scene has a working authenticated screen and a real
record, governance controls demonstrably hold, and the remaining items are disclosure points rather than
defects. The condition is that limitations 1–5 are stated on camera as written above.
