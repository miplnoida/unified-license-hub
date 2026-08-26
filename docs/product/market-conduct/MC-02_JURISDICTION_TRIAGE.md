# MC-02 — Jurisdiction Assessment & Risk-Based Triage

Status: **BUILT / TESTED / CERTIFIED**

## What MC-02 does

After a complaint arrives (MC-01), MC-02 answers two separate questions:

1. **Is this something we can deal with?** — a structured jurisdiction assessment
   against versioned factors, ending in a recorded decision.
2. **How serious is it and how quickly must we act?** — a four-dimensional
   supervisory triage, recommended by the engine and confirmed by a person.

## Jurisdiction assessment

- Rule sets: `complaint_jurisdiction_rule_sets` (versioned, published/immutable).
  The version in force at start is pinned on the assessment.
- Factors: `complaint_jurisdiction_factor_catalogue` (16 factors) recorded per
  complaint in `complaint_jurisdiction_factors` with a rationale.
- Lifecycle: `PENDING_ASSESSMENT → IN_ASSESSMENT → PENDING_INFORMATION → DECIDED`,
  reopenable with a recorded reason.
- Outcomes: `ACCEPTED`, `PARTIALLY_ACCEPTED`, `REFERRED`, `OUT_OF_JURISDICTION`.
- Information requests: `complaint_jurisdiction_info_requests`. **`status` is the
  authoritative state** (`OPEN` → outstanding; `RESPONDED`/`CANCELLED` → not
  outstanding but retained in history). `response_received_at` is evidence, not state.
- Referrals: `complaint_referrals`.

RPCs: `complaint_jurisdiction_start`, `_save_factor`, `_request_information`,
`_record_response`, `_decide`, `_reopen`, read model `get_complaint_jurisdiction`.

## Triage

Four independent dimensions, never merged:

| Dimension | Values |
| --- | --- |
| Consumer harm | LOW, MODERATE, HIGH, SEVERE |
| Case priority | p1–p4 |
| Conduct risk level | LOW, MODERATE, HIGH, CRITICAL |
| Systemic potential | INDIVIDUAL, RECURRING, POTENTIAL_SYSTEMIC, CONFIRMED_SYSTEMIC |

Conduct **category**, **product** and **channel** are classification, shown
separately from conduct **risk level**.

- Engine: `evaluate-complaint-triage` (`triage.v4`) reads only **PUBLISHED**
  `conduct_triage_rule_versions`, records an append-only recommendation through
  `complaint_triage_record_evaluation`, and leaves
  `triage_confirmation_status` pending. It cannot confirm, and it can never
  recommend `CONFIRMED_SYSTEMIC`.
- Human decision: `complaint_triage_confirm` appends `manual_confirm` or
  `manual_override`. A material change requires `override_triage` authority plus a
  justification of at least 10 characters, enforced server-side. Confirming a
  systemic issue requires the same authority and a written justification.
- Jurisdiction gate: `complaint_triage_gate_ok` allows confirmation only where the
  decision is `ACCEPTED` or `PARTIALLY_ACCEPTED`.
- Conduct Signals remain owned by MC-05; a `POTENTIAL_SYSTEMIC` recommendation
  creates none.

## Timing

All targets come from the effective jurisdiction rule set via
`complaint_jurisdiction_sla` (`jurisdiction_assessment_days`,
`information_request_days`, `triage_days`). Where nothing is configured, no due
date is invented and the UI states that no target is configured. Configured
targets are labelled as **operational targets** unless the configuration marks
them statutory.

## Respondent match states (canonical, from MC-01)

| Stored value | Displayed as |
| --- | --- |
| MATCHED_REGULATED | Currently regulated |
| MATCHED_PREVIOUSLY_REGULATED | Previously regulated |
| UNMATCHED | Entity not yet matched |
| SUSPECTED_UNAUTHORISED | Suspected unauthorized provider |
| INTERMEDIARY | Intermediary / agent / broker |
| PENDING_MATCH | Matching required |

Raw codes are never displayed. Shared source of truth:
`src/lib/complaints/respondentMatchState.ts`.

## Surfaces

- `/complaints/intake-queue` — Complaint Intake Queue (server-authoritative rows
  and counts, complaints with no matched licensee are always included).
- Complaint detail → Casework → **Jurisdiction** and **Triage** tabs.
