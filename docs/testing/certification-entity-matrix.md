# CERTIFICATION DATASET v1 — Entity Matrix

Fixed, deterministic certification cohort for the Unified License Hub. Every
subsequent build wave, demo, regression run and certification exercise reuses
**this** cohort. Do not invent new entities, persons or sectors for testing.

## Determinism

- All identifiers are generated from stable logical keys via
  `public.cert_uuid(text)` (MD5-derived UUIDv5-style), so a RESET followed by a
  re-SEED reproduces the same logical cohort with the same UUIDs.
- `public.certification_seed_manifest` is the registry of every seeded record
  (`scenario_key`, `record_kind`, `entity_id`, `display_name`,
  `primary_identifiers`).
- Seed functions (idempotent, `SECURITY DEFINER`, not callable by app roles):
  - `cert_seed_identity_v1()` — parties, persons, organizations, entities,
    identifiers, applications, licences, resolution cases.
  - `cert_seed_structure_v1()` — ownership, appointments, relationships, facts,
    regulatory requests, change sets, Fit & Proper.
  - `cert_seed_returns_v1()` — obligations, periods, filings, versions, metrics.
- Sectors, sub-sectors, categories, licence types and form versions are **reused
  as configured** — the dataset introduces no new taxonomy.

## Regulated entity cohort (20)

| Key | Legal name | Sector | Lifecycle | Identity | Licences | Appointments | Ownership rows | Return obligations | Filings | Reg. requests | Applications |
|-----|------------|--------|-----------|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| E01 | Atlantic Commercial Bank Ltd | Commercial Bank | authorised | verified | 3 | 9 | 5 | 4 | 8 | 2 | 2 |
| E02 | Caribbean Merchant Bank Ltd | Merchant Bank | authorised | verified | 3 | 9 | 4 | 4 | 8 | 2 | 2 |
| E03 | Federation Credit Finance Ltd | Micro-credit Institution | authorised | verified | 1 | 9 | 5 | 3 | 6 | 2 | 1 |
| E04 | Eastern Caribbean Mortgage Ltd | Building Society | authorised | verified | 1 | 8 | 3 | 4 | 8 | 2 | 1 |
| E05 | St Kitts Community Credit Ltd | Micro-credit Institution | former_licensee | verified | 1 | 8 | 3 | 0 | 0 | 1 | 1 |
| E06 | Caribbean General Insurance Ltd | General Insurance | authorised | verified | 3 | 9 | 5 | 3 | 6 | 2 | 2 |
| E07 | Nevis Life Assurance Ltd | Life Insurance | authorised | verified | 1 | 9 | 3 | 3 | 6 | 1 | 1 |
| E08 | Island Reinsurance Ltd | General Insurance | authorised | verified | 1 | 8 | 3 | 3 | 6 | 1 | 1 |
| E09 | Federation Insurance Brokers Ltd | General Insurance | authorised | verified | 1 | 8 | 3 | 3 | 6 | 1 | 1 |
| E10 | Island Payments Ltd | Payment Service Provider | authorised | verified | 3 | 9 | 5 | 3 | 6 | 2 | 2 |
| E11 | Caribbean Money Services Ltd | Money Service Business | authorised | verified | 1 | 8 | 3 | 3 | 6 | 1 | 2 |
| E12 | Federation Remittance Services Ltd | Money Service Business | authorised | verified | 1 | 8 | 5 | 3 | 6 | 3 | 1 |
| E13 | Eastern Digital Wallet Ltd | Payment Service Provider | authorised | provisional | 1 | 8 | 3 | 3 | 6 | 1 | 1 |
| E14 | Caribbean Capital Markets Ltd | Securities Dealer | authorised | verified | 3 | 9 | 6 | 4 | 8 | 1 | 2 |
| E15 | Nevis Investment Management Ltd | Securities Dealer | authorised | verified | 1 | 8 | 3 | 4 | 8 | 1 | 1 |
| E16 | Federation Securities Ltd | Securities Dealer | authorised | verified | 1 | 8 | 4 | 4 | 8 | 1 | 2 |
| E17 | Caribbean Trust & Corporate Services Ltd | Financial Holding Company | authorised | verified | 1 | 8 | 3 | 3 | 6 | 1 | 1 |
| E18 | Nevis Fiduciary Services Ltd | Financial Holding Company | applicant | pending_verification | 0 | 4 | 2 | 0 | 0 | 0 | 1 |
| E19 | Heritage Finance Ltd | Pension Fund Administrator | authorised | verified | 1 | 9 | 3 | 2 | 4 | 1 | 1 |
| E20 | Nevis Digital Finance Ltd | Payment Service Provider | applicant | provisional | 0 | 4 | 2 | 0 | 0 | 0 | 1 |

Lifecycle coverage: 17 authorised, 2 applicant, 1 former licensee.
Identity coverage: verified, provisional and pending-verification.
Multi-licence entities (3 licences each): E01, E02, E06, E10, E14.

## Non-regulated supporting organizations (5)

| Key | Name | Role in the dataset |
|-----|------|--------------------|
| H1 | Caribbean Holdings Ltd | Group parent of E01 (60%), E06 (55%), E14 (51%) |
| H2 | Federation Financial Holdings Ltd | Group parent of E03 (70%), E12 (65%); ended relationship with E19 |
| H3 | Eastern Caribbean Services Ltd | Former service provider (ended relationships) |
| H4 | Island Audit Partners Ltd | External auditor of 8 entities (1 ended engagement) |
| H5 | Regional Technology Services Ltd | Outsourced technology provider to 5 entities |

## Persons

50 canonical person parties (`P01`–`P50`), reused across entities so the same
individual legitimately appears as director/officer/shareholder of more than one
entity. Fit & Proper records exist for 15 of them covering approved, under
assessment and reassessment-due cases.

## Ownership integrity

- Every entity's **direct** current holdings reconcile to exactly 100%.
- Indirect and beneficial interests are recorded separately and never counted in
  the direct 100%: 5 ultimate-beneficial-owner chains through H1/H2, one indirect
  group shareholding, one voting-control interest.
- 8 entities carry superseded ownership rows (effective-dated, never overwritten).

## History coverage

| History type | Coverage |
|--------------|----------|
| Legal name change | 5 entities (superseded `entity_facts` retained) |
| Ownership change | 8 entities |
| Appointment change | 8 ended appointments |
| Relationship change | 5 ended relationships |

## Regulatory requests (26)

Statuses represented: DRAFT (2), SUBMITTED (3), UNDER_REVIEW (4), APPROVED (15,
each with an APPLIED change set and change item), REJECTED (1, with rationale),
CLOSED (2). Request types span legal name, director appointment/resignation,
shareholding, beneficial owner, auditor, group restructure, key person, licence
variation/surrender, new branch, outsourcing and material incident.

## Returns coverage

| Object | Count |
|--------|------:|
| Return definitions (active) | 6 |
| Obligation rules | 36 |
| Entity reporting obligations | 56 |
| Reporting periods | 233 |
| Return filings | 112 |
| Filing versions | 128 |
| Regulatory metrics | 25 |
| Metric values | 240 |

Filing status coverage: ACCEPTED, SUBMITTED, UNDER_REVIEW,
CORRECTION_REQUESTED (with superseded v1 + corrected v2), REJECTED (with reason)
and DRAFT. Accepted versions and their metric values are immutable — the seed
respects that guard rather than editing them after acceptance.

## Rules of use

1. Reuse this cohort for every new module, demo and regression run.
2. Never seed against reserved migration/admin tooling UI — the dataset is
   exercised through normal product screens only.
3. Extending the dataset means adding a new `cert_seed_*` function plus a new
   row set here; do not mutate existing keys, or determinism is lost.
