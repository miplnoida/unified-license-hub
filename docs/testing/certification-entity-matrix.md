# CERTIFICATION DATASET v1 — Entity Matrix

Fixed, deterministic certification cohort for the Unified License Hub. Every
subsequent build wave, demo, regression run and certification exercise reuses
**this** cohort. Do not invent new entities, persons or sectors for testing.

**Programme-wide contract:** modules delivered after Wave C are demonstrated and
regression-tested against E01–E20 only. New scenario data is added by extending
the cohort's history, never by creating fresh ad-hoc entities.

## Determinism

- All identifiers are generated from stable logical keys via
  `public.cert_uuid(text)` (MD5-derived UUIDv5-style), so a RESET followed by a
  re-SEED reproduces the same logical cohort with the same UUIDs.
- `public.certification_seed_manifest` is the registry of every seeded record
  (`scenario_key`, `record_kind`, `entity_id`, `display_name`,
  `primary_identifiers`, `entity_email`).
- Seed functions (idempotent, `SECURITY DEFINER`, not callable by app roles):
  - `cert_seed_identity_v1()` — parties, persons, organizations, entities,
    identifiers, applications, licences, resolution cases.
  - `cert_seed_structure_v1()` — ownership, appointments, relationships, facts,
    regulatory requests, change sets, Fit & Proper.
  - `cert_seed_returns_v1()` — obligations, periods, filings, versions, metrics.
- Sectors, sub-sectors, categories, licence types and form versions are **reused
  as configured** — the dataset introduces no new taxonomy.
- Seeding is never triggered from product UI or from application runtime code;
  the functions are invoked only by governed migrations/tooling, so a production
  database cannot be seeded accidentally.

## Verification (drift control)

- `public.cert_verify_dataset_v1()` (super-admin only) returns
  `{ counts, entities, failures, failure_count }` computed **from the live
  database**, covering: identity backbone, licence-to-entity uniqueness,
  applicant entities holding no licence, direct ownership reconciliation to
  100%, ownership temporal overlaps, filing/version integrity and the seeded
  business-email domain.
- `supabase/tests/certification/01_dataset_v1.sql` (pgTAP) asserts the actual
  counts recorded in this document and that `failure_count = 0`, so any future
  divergence between the database and this matrix fails CI.
- Current status: **0 integrity failures**.

## Regulated entity cohort (20)

Licences = distinct licences mapped to the entity through `entity_licenses`
(the canonical mapping). Appointments column shows total (current).

| Key | Legal name | Sector | Lifecycle | Identity | Licences | Identifiers | Appointments | Ownership rows | Return obligations | Filings | Reg. requests | Applications |
|-----|------------|--------|-----------|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| E01 | Atlantic Commercial Bank Ltd | Commercial Bank | authorised | verified | 2 | 3 | 9 (8) | 5 | 4 | 8 | 2 | 2 |
| E02 | Caribbean Merchant Bank Ltd | Merchant Bank | authorised | verified | 2 | 3 | 9 (8) | 4 | 4 | 8 | 2 | 2 |
| E03 | Federation Credit Finance Ltd | Micro-credit Institution | authorised | verified | 1 | 3 | 9 (8) | 5 | 3 | 6 | 2 | 1 |
| E04 | Eastern Caribbean Mortgage Ltd | Building Society | authorised | verified | 1 | 3 | 8 (8) | 3 | 4 | 8 | 2 | 1 |
| E05 | St Kitts Community Credit Ltd | Micro-credit Institution | former_licensee | verified | 1 (0 current) | 3 | 8 (8) | 3 | 0 | 0 | 1 | 1 |
| E06 | Caribbean General Insurance Ltd | General Insurance | authorised | verified | 2 | 3 | 9 (8) | 5 | 3 | 6 | 2 | 2 |
| E07 | Nevis Life Assurance Ltd | Life Insurance | authorised | verified | 1 | 3 | 9 (8) | 3 | 3 | 6 | 1 | 1 |
| E08 | Island Reinsurance Ltd | General Insurance | authorised | verified | 1 | 3 | 8 (8) | 3 | 3 | 6 | 1 | 1 |
| E09 | Federation Insurance Brokers Ltd | General Insurance | authorised | verified | 1 | 3 | 8 (8) | 3 | 3 | 6 | 1 | 1 |
| E10 | Island Payments Ltd | Payment Service Provider | authorised | verified | 2 | 3 | 9 (8) | 5 | 3 | 6 | 2 | 2 |
| E11 | Caribbean Money Services Ltd | Money Service Business | authorised | verified | 1 | 3 | 8 (8) | 3 | 3 | 6 | 1 | 2 |
| E12 | Federation Remittance Services Ltd | Money Service Business | authorised | verified | 1 | 3 | 8 (8) | 5 | 3 | 6 | 3 | 1 |
| E13 | Eastern Digital Wallet Ltd | Payment Service Provider | authorised | provisional | 1 | 3 | 8 (8) | 3 | 3 | 6 | 1 | 1 |
| E14 | Caribbean Capital Markets Ltd | Securities Dealer | authorised | verified | 2 | 3 | 9 (8) | 6 | 4 | 8 | 1 | 2 |
| E15 | Nevis Investment Management Ltd | Securities Dealer | authorised | verified | 1 | 3 | 8 (8) | 3 | 4 | 8 | 1 | 1 |
| E16 | Federation Securities Ltd | Securities Dealer | authorised | verified | 1 | 3 | 8 (8) | 4 | 4 | 8 | 1 | 2 |
| E17 | Caribbean Trust & Corporate Services Ltd | Financial Holding Company | authorised | verified | 1 | 3 | 8 (8) | 3 | 3 | 6 | 1 | 1 |
| E18 | Nevis Fiduciary Services Ltd | Financial Holding Company | applicant | pending_verification | 0 | 3 | 4 (4) | 2 | 0 | 0 | 0 | 1 |
| E19 | Heritage Finance Ltd | Pension Fund Administrator | authorised | verified | 1 | 3 | 9 (8) | 3 | 2 | 4 | 1 | 1 |
| E20 | Nevis Digital Finance Ltd | Payment Service Provider | applicant | provisional | 0 | 3 | 4 (4) | 2 | 0 | 0 | 0 | 1 |

Lifecycle coverage: 17 authorised, 2 applicant, 1 former licensee.
Identity coverage: verified, provisional and pending-verification.
Multi-licence entities (2 distinct licences each): E01, E02, E06, E10, E14.
E05 (former licensee) holds one licence whose `entity_licenses` period is closed,
so it has 0 current licence links.

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
entity. Fit & Proper records exist covering approved, under-assessment and
reassessment-due cases.

## Ownership integrity

- Every entity's **direct** current holdings reconcile to exactly 100%
  (verified: 20/20 entities, 0 mismatches).
- No temporal overlap exists between direct holdings of the same owner in the
  same entity.
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
| Licence period closure | 1 entity (E05) |

## Regulatory requests (26)

Statuses represented: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED (each with an
APPLIED change set and change item — 15 change sets), REJECTED (with rationale)
and CLOSED. Request types span legal name, director appointment/resignation,
shareholding, beneficial owner, auditor, group restructure, key person, licence
variation/surrender, new branch, outsourcing and material incident.

## Returns coverage — actual seeded counts

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

Filing status distribution (actual):

| Status | Filings |
|--------|--------:|
| ACCEPTED | 48 |
| UNDER_REVIEW | 16 |
| CORRECTION_REQUESTED | 16 |
| DRAFT | 16 |
| REJECTED | 8 |
| SUBMITTED | 8 |

Accepted versions and their metric values are immutable — the seed respects that
guard rather than editing them after acceptance. CORRECTION_REQUESTED filings
carry a superseded v1 plus a corrected v2.

## Documented vs actual (drift report)

| Object | Documented | Actual | Status |
|--------|-----------:|-------:|--------|
| Regulated entities | 20 | 20 | ✅ |
| Supporting organizations | 5 | 5 | ✅ |
| Persons | 50 | 50 | ✅ |
| Applications (cohort) | 27 | 27 | ✅ |
| Distinct licences | 23 | 23 | ✅ |
| Entity–licence links | 28 | 28 | ✅ |
| Ownership rows | 73 | 73 | ✅ |
| Appointments | 160 (152 current) | 160 (152) | ✅ |
| Party relationships | 23 | 23 | ✅ |
| Regulatory requests | 26 | 26 | ✅ |
| Change sets | 15 | 15 | ✅ |
| Obligations / periods / filings | 56 / 233 / 112 | 56 / 233 / 112 | ✅ |
| Filing versions / metric values | 128 / 240 | 128 / 240 | ✅ |

Corrected in this revision: multi-licence entities hold **2** distinct licences
(previously documented as 3 — that figure counted `entity_licenses` period rows,
including a superseded row); REJECTED/SUBMITTED filing split is 8/8 (previously
documented as 16 SUBMITTED before REJECTED coverage was carved out of it).

Known non-cohort condition (not a certification failure): 99 legacy
`applications` rows predating the canonical model still have no `entity_id`.
`cert_verify_dataset_v1()` reports this as
`counts.legacy_applications_without_entity` so it stays visible.

## Test coverage matrix

| Scenario | Entities used | Where exercised |
|----------|---------------|-----------------|
| Multi-licence entity view | E01, E02, E06, E10, E14 | Entity directory, licence tab, public register |
| Single-licence steady state | E03, E04, E07–E09, E11–E13, E15–E17, E19 | Entity detail, returns calendar |
| Former licensee (closed licence period) | E05 | Lifecycle, public register suppression |
| Applicant (no licence, non-public) | E18, E20 | Licensing queue, register exclusion |
| Provisional / pending identity | E13, E20, E18 | Identity verification, resolution queue |
| Group / UBO chains | H1→E01/E06/E14, H2→E03/E12 | Ownership tree, group risk profile |
| Ownership change history | 8 entities incl. E01, E03, E12 | Ownership history, change sets |
| Appointment change history | 8 ended appointments incl. E01, E04, E19 | Governance tab |
| Regulatory request approval → change set | E01, E02, E12 | Regulatory requests, change workbench |
| Regulatory request rejection | E12 | Request rationale display |
| Return submission (SUBMITTED) | spread over ≥3 entities | Returns queue, filing detail |
| Correction cycle (v1 superseded + v2) | spread over ≥3 entities | Filing versions, correction requests |
| Rejected filing | spread over ≥3 entities | Filing detail rejection reason |
| Draft filing (licensee side) | spread over ≥3 entities | Entity returns calendar |
| Accepted filing + metrics | E01, E02, E14 | Metric series, prudential analytics |
| Fit & Proper assessment states | 15 persons across E01–E14 | F&P queue |

## Rules of use

1. Reuse this cohort for every new module, demo and regression run.
2. Never seed against reserved migration/admin tooling UI — the dataset is
   exercised through normal product screens only.
3. Extending the dataset means adding a new `cert_seed_*` function plus a new
   row set here; do not mutate existing keys, or determinism is lost.
4. Any change to seeded volumes must update both this document and
   `supabase/tests/certification/01_dataset_v1.sql` in the same change.
