# Certification V2 — Wave 2: Workflow, Notification & Correspondence Readiness Map

Status: **READY FOR WAVE 3 EXECUTION** (no workflows executed in Wave 2 by design)

Wave 2 establishes data and identities only. This document records which
workflow, notification and correspondence entry points the seeded universe is
able to drive, and the clean runtime baseline from which Wave 3 will start.

---

## 1. Identities

46 certification identities exist (`profiles` = 46, `cert_certification_users` = 46),
one per governed role, plus the external personas below. No non-certification
human logins remain.

| Persona | Email | Entity relationship |
| --- | --- | --- |
| Licensee primary user | `licensee_primary_user@mishainfotech.com` | 1 entity, `primary_user` |
| Licensee secondary user | `licensee_secondary_user@mishainfotech.com` | 1 entity, `secondary_contact` |
| Applicant | `applicant_user@mishainfotech.com` | 1 entity (NEW_APPLICANT, no licence) |
| Pre-licensee | `pre_licensee_user@mishainfotech.com` | 1 entity |
| Entity PPOC (multi-entity) | `entity_ppoc@mishainfotech.com` | **2 entities** |

### 1.1 Multi-entity user test (E10 MULTI_ENTITY_USER)

`entity_ppoc@mishainfotech.com` holds two **active** relationships with
different access types:

| Entity | Access type | Active |
| --- | --- | --- |
| Brimstone Payments Limited | `primary_user` | yes |
| Verchilds Securities Limited | `secondary_contact` | yes |

This gives Wave 3 a persona whose portal scope must show exactly two entities,
with different capability sets per entity, and must never leak a third.

### 1.2 Maker–checker pairs available

Officer/supervisor identity pairs exist for every governed process family:
licensing, returns, prudential, conduct, complaints, enforcement, fit & proper,
entity resolution, AML supervision, inspections, coordination — plus
`appeals_panel_member`, `committee_member`, `legal_counsel` and `auditor` for
decision and review steps.

---

## 2. Workflow entry points the universe can drive

| Configured workflow | Steps | Active | Seeded driver |
| --- | --- | --- | --- |
| Registration Workflow | 2 | yes | E05 NEW_APPLICANT, pre-licensee persona |
| Pre License Approval Workflow | 3 | yes | E05 NEW_APPLICANT |
| Pre Licensee Approval Workflow | 3 | yes | pre-licensee persona |
| Post Application Workflow | 3 | yes | E06 LICENCE_LIFECYCLE |
| Return Workflow | 2 | yes | 3 filings left `SUBMITTED` (E02, E03, E13) |
| Complaint Management Workflow | 12 | yes | conduct/complaints personas + E07 CONDUCT_RISK |

Inactive definitions (`Insurance Workflow`, `Building Society Pre License
Workflow`, `VRF-EMPTY-ACTIONS`) are intentionally left inactive.

Deliberately un-actioned work left in the universe for Wave 3:

| Queue | Rows | Purpose |
| --- | --- | --- |
| Filings awaiting review (`SUBMITTED`) | 3 | review / accept / reject / correction-request paths |
| Open reporting periods with no filing | 1 (E04 LATE_FILER) | non-filing escalation path |
| Late-submitted filings | 2 (E04) | late-filing / penalty path |
| Unacknowledged threshold breaches | 47 | detection → acknowledge → escalate path |

---

## 3. Notification readiness

| Item | Value |
| --- | --- |
| Notification templates (config, retained) | 426 |
| Notification event configs (config, retained) | 248 |
| `notifications` | **0** |
| `notification_event_queue` | **0** |
| `notification_dispatch_log` | **0** |
| `notification_outbox` / digest tables | **0** |

`POST_SEED_NOTIFICATION_RUNTIME_ROWS = 0`.

Message runtime is cleared as the final governed step of
`cert_v2_seed_universe()` via `cert_v2_clear_message_runtime()`, so Wave 3
notification assertions ("exactly one message, correct recipient, correct
template") start from an empty delivery ledger. Configuration is never touched.

### 3.1 Defect found and fixed by the seed

`trg_return_threshold_breach_notification` resolved its context only from the
legacy `returns_filed` row via `return_id`. Canonical detection populates
`return_filing_id` / `entity_id` / `reporting_period_id` and leaves `return_id`
NULL, so breach alerts were emitted with `entity_id`, `sector_id` and `cta_url`
all NULL — producing notification titles with the entity name missing and a dead
CTA.

The trigger now prefers canonical breach columns, falls back to the legacy row,
resolves entity name and sector from `licensees`, and builds the CTA as
`/returns/filings/<filing_id>` (legacy `/returns/<return_id>` retained as
fallback). Verified payload after the fix:

```
entity_id           5855bf85-…
entity_name         Coral Harbour Bank Limited
sector_id           d90ffa53-…
cta_url             /returns/filings/41fff05c-…
return_filing_id    41fff05c-…
reporting_period_id e8180742-…
```

---

## 4. Correspondence readiness

| Item | Value |
| --- | --- |
| Correspondence templates (config, retained) | 5 |
| Correspondence routing rules (config, retained) | 5 |
| `correspondence_threads` / `messages` / `dispatches` / `events` / `participants` | **0** |

Correspondence runtime is empty, and every seeded entity has an addressable
primary contact relationship, so Wave 3 can originate threads from RFI,
examination and enforcement contexts against a clean baseline.
