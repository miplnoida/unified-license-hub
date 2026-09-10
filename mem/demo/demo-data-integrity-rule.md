---
name: Application-wide demo data integrity rule
description: Mandatory rules for any demo/fictional data seeding — canonical records only, governed operations, referential/lifecycle/audit integrity, reversible cleanup, zero non-demo change
type: preference
---

Demo data must satisfy the same relational, lifecycle, security, provenance and audit rules as
genuine data. Never seed rows merely to populate screens. If valid demo data cannot be created
through the canonical architecture, STOP and report the blocker — never bypass the architecture.

## Canonical records only
- For each record type identify: canonical table/server operation, parent, regulator/tenant owner,
  entity owner, domain, lifecycle state, permission, provenance, audit event, downstream consumers,
  cleanup dependency.
- No shadow/duplicate copies of information owned elsewhere (no AML-only entities, no AML-invented
  licences, no second risk rating outside risk-of-record, no copied examinations/findings/plans,
  no hand-inserted derived totals).
- Every fictional entity must first exist as a canonical party/entity with regulator ownership,
  entity type, registration state, fictional identifiers/contacts, sector, licence/authorisation
  where required, and AML/CFT perimeter membership. No orphan AML entities.

## Governed operations
Use public governed server operations for methodology, programme, assessment, question plan,
responses, evidence, review/return/resubmission, approval, publication, consequences, reassessment,
monitoring and outcome evaluation/approval. Direct SQL only for prerequisite fixtures with no
governed operation — justified, validated against server rules, with provenance, audit, exact
cleanup, and proof application users still cannot perform that insert.

## Forbidden
Disabling FKs/triggers/RLS, unvalidated constraints, bypassing immutability triggers, changing
constraints or canonical enums, temporary direct-write grants, `session_replication_role = replica`,
using superuser powers to manufacture lifecycle states impossible in the product, or backdating
actor actions deceptively (use business/effective dates, keep truthful technical timestamps).

## Required green gates before declaring a seed ready
orphans 0; cross-regulator links 0; cross-entity links 0; invalid parent refs 0; lifecycle
chronology valid (created <= submitted <= reviewed <= approved <= published, etc.); question-plan /
response mismatches 0 (5 canonical plan states, N/A is a response value); risk provenance mismatches
0; duplicate current risk records 0; overlapping risk periods 0; supervisory link mismatches and
copied canonical records 0; self-approvals 0; missing rationales/audit events 0; derived totals
reconcile across source / server read model / screen / export; second seed run idempotent with zero
duplicate business records; cleanup exact inverse of the dependency graph and fully reversible;
all non-demo counts and digests unchanged across every touched module; no RLS/constraint/trigger
weakening; no live calculation policy created.

## Deliverables
- `scripts/demo/verify-aml-demo.sql` with a behavioural `INTEGRITY-01 … INTEGRITY-N` section
  (behavioural checks, never source-code regex).
- `docs/aml/AML-demo-data-integrity-report.md` recording every invariant, result and approved
  exception.
- Cycle: baseline census → seed → integrity verification → cleanup → zero-survivor check →
  baseline comparison → reseed → final integrity verification.
- Verdict block: `APPLICATION-WIDE DEMO DATA INTEGRITY — PASS` / `ORPHAN RECORDS — 0` /
  `CROSS-REGULATOR/ENTITY VIOLATIONS — 0` / `NON-DEMO DATA CHANGED — NO` /
  `DEMO SEED AND CLEANUP — REVERSIBLE`.
- On any failure: roll back or clean the incomplete seed, report the exact failure, never leave
  partial demo data, never claim readiness.
