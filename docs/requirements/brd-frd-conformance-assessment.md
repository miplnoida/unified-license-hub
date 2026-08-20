# BRD / FRD Conformance & Supervisory Readiness Assessment

**Programme:** SUPTECH BRD/FRD Conformance & Supervisory Readiness
**Task type:** Discovery and analysis only. No functionality was
implemented, no schema was changed, no data was seeded.

## 1. Verdict

The platform is **structurally conformant and operationally
under-certified**.

The regulatory data model, authorization model, configuration surfaces
and the licensing and returns chains are genuinely enterprise-grade and
provable against real data. The weakness is uniform and specific: the
**detection-to-action** half of every supervisory chain — breaches, early
warnings, pattern alerts, investigations, thematic reviews, determinations
with conditions, decision artefacts, escalations and AI insights — is
built but has never produced a single record. Fifteen business
requirements and fourteen FRD screens are therefore **NOT CERTIFIED**
rather than missing.

## 2. Scorecard

| Dimension | Score | Basis |
| --- | --- | --- |
| Requirement coverage (built) | **A−** | 63 of 64 BR requirements have an implementation; 89 of 90 FRD screens have a route |
| Requirement certification (proven with data) | **C** | 30/64 BR CONFORMS; 15 NOT CERTIFIED; 37/58 demo scenarios runnable |
| Regulatory data model | **A** | Party → Organization → Entity → Licence → Obligation → Filing → Metric, fully effective-dated, 0 integrity failures |
| Authorization architecture | **A−** | Single `sec_get_user_context()` model, 991 policies, 464/464 tables RLS-enabled |
| Authorization enforcement depth | **C+** | 27 routes auth-only; 34 `useCan` sites vs 2,067 `onClick`; 472 ungoverned direct writes |
| Configurability | **B+** | Forms, workflows, SLAs, rules, metrics, roles, navigation all DB-driven; reports and rule-engine coverage are not |
| Auditability | **B** | 3 audit stores, versioned artefacts, case timelines; export audit and override registries unexercised |
| AI governance | **C−** | Traceability columns designed correctly; zero insights ever produced |
| Test posture | **B+** | 113 pgTAP suites, 121 Vitest files, deterministic certification dataset |
| Security hygiene | **C** | 1,550 linter findings, broad SECURITY DEFINER execute grants, leaked-password protection off |
| Demo readiness | **B−** | 30-scenario clean path available; 18 scenarios would land on empty states |

## 3. What is genuinely strong

1. **One canonical entity spine.** 20 regulated entities carry 28
   licences, 160 appointments, 73 ownership interests, 56 reporting
   obligations, 233 periods, 112 filings, 128 versions and 240 metric
   values with zero integrity failures. Entity 360 renders this as a
   grouped supervisory profile with historic "as-of" re-entry.
2. **A single authorization model.** One RPC returns roles, permissions,
   scopes, the route registry and the nav tree; RLS is the authority; the
   assignment-only regulator persona is a correct least-privilege
   construct.
3. **Returns end to end.** Definition → obligation rule → entity
   obligation → period → filing → version → validation → metric works on
   real data, with version comparison and status-aware action gating.
4. **Deterministic certification.** CERTIFICATION DATASET v1 plus
   `cert_verify_dataset_v1()` and a reset/reseed path make the whole
   system repeatably testable — rare at this scale.
5. **Configuration governance.** Forms, workflows, SLAs, fees,
   obligations, metrics, triage rules, notification templates, roles and
   navigation are all database-driven.

## 4. What must be addressed

Ranked by supervisory consequence:

1. **GAP-XC-01 — 472 ungoverned direct writes.** The largest structural
   risk. Business mutations that skip governed RPCs produce no audit
   record and enforce no workflow precondition. This undermines the
   audit claims of BR-X-11/12 regardless of how good the audit viewers are.
2. **Detection-to-action certification (GAP-PS-01, PS-02, MC-01, MC-02,
   LIC-01, XC-03, XC-05).** Seven extensions to CERTIFICATION DATASET v1
   would convert 15 NOT-CERTIFIED verdicts into provable ones and lift
   demo coverage from 64% to roughly 90%.
3. **GAP-XC-02 — 27 unguarded-by-module routes**, including
   `/applications/:id` and the whole canonical returns queue. Denial
   currently depends on silent RLS with no logged authorization decision.
4. **GAP-XC-03 — AI governance unproven.** The traceability contract is
   designed but never exercised; for a supervisory authority this is a
   governance question, not a feature question.
5. **Security hygiene (GAP-SEC-01…06).** 1,550 linter findings and
   over-broad SECURITY DEFINER execute grants are not acceptable at
   production sign-off.
6. **GAP-XC-04 / D6 — FRD roles R-01…R-14 unmapped.** Cheap to fix and
   blocks credible persona-based demonstration.
7. **Legacy returns surfaces still mounted (D5).** A reviewer can land on
   an empty legacy screen and mis-conclude that returns are broken.

## 5. Divergences requiring an owner decision

Four deliberate reductions need either restoration or a written FRD
amendment: complaint closure quality review (D1), digital signature
capture (D2), collaborative review markup (D3), ad-hoc report builder
(D7). Two transitional architecture decisions (D4 entity-key rule, D5
legacy returns) need a retirement date. Full detail in
`requirements-divergence-register.md`.

## 6. Production-readiness decision

| Question | Answer |
| --- | --- |
| Can the platform be demonstrated credibly to BOJ/FSC today? | **Yes**, along the 30-scenario clean path in the scenario catalogue. |
| Can it be certified as BRD/FRD conformant today? | **No.** 15 NOT-CERTIFIED requirements and 11 P1 gaps stand in the way. |
| Is it production-ready for supervisory use? | **Not yet.** GAP-XC-01, GAP-XC-02 and the security-hygiene set must close first. |
| Is the shortfall architectural or completion debt? | **Completion debt.** No gap requires re-architecture; the model, security spine and configuration surfaces are sound. |

**Recommendation:** authorise one closure wave targeting the eleven P1
gaps — governed-write remediation, route guard completion, and
certification of the detection-to-action chains — then re-run this
assessment. Nothing discovered here suggests the foundation needs
rebuilding.

## 7. Companion documents

| Document | Contents |
| --- | --- |
| `docs/requirements/brd-frd-traceability-matrix.md` | 64 BR requirements, 90 FRD screens, 58 demo scenarios, R-xx roles, with verdicts and evidence |
| `docs/architecture/supervisory-operating-model.md` | As-built supervisory spine, lifecycle chains and where each stops |
| `docs/requirements/supervisory-gap-register.md` | 33 prioritised gaps with evidence and effort |
| `docs/requirements/requirements-divergence-register.md` | 10 intentional divergences and the decisions they need |
| `docs/testing/supervisory-scenario-catalogue.md` | 65 runnable scenarios with readiness verdicts and a clean demo path |
