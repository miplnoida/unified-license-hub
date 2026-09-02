# EPIC 1 — Enterprise SupTech Supervision Architecture Lock

**Mode:** deep rebaseline + target architecture only. Nothing was implemented, no
migration was generated, no navigation or business workflow was modified, no
production data was changed.

**Method:** live database catalogue introspection (`pg_constraint`, `pg_proc`,
`information_schema`, live row counts) plus source inspection of `src/`,
`supabase/migrations/`, `supabase/functions/` and `supabase/baseline/`. Where
documentation disagreed with source or runtime, **source/runtime wins** and the
conflict is recorded in §1.4.

---

## 1. Current HEAD / runtime truth

### 1.1 Repository

| Fact | Value |
| --- | --- |
| HEAD | `f027c8dcad76d016e51ae9700720128368c87402` ("Finalized Central DMS gaps") |
| Branch | `edit/edt-d858daff-d540-4d8c-8fc3-f7295f59a546` |
| Working tree | clean (no staged, unstaged or untracked changes) |
| Last functional wave | Central DMS Foundation Phases 0–4 (`f027c8dca`, `38fdd57b7`) |
| Last supervision/convergence wave before that | F8-W1A…W3A prudential waves, EPR-01…EPR-05 process convergence |
| Migration head | `20260902115715_9b6c5acc-f762-455c-9185-ac5c5f135fc6.sql` |
| Concurrent colleague/agent work | none detected — clean tree, no in-flight plan file, no conflicting branch artefacts in the workspace |

No supervision-domain code was touched by the DMS wave; the last edits inside
supervisory tables/RPCs predate it (prudential F8 waves and conduct planning
migrations of 2026-08-2x).

### 1.2 Live supervisory volumes (authoritative)

| Object | Rows | Object | Rows |
| --- | --- | --- | --- |
| `licensees` | 65 | `entity_supervision_assignments` | 25 |
| `risk_ratings` | 3 | `entity_risk_scores` | 19 |
| `prudential_assessments` | 8 | `prudential_assessment_component_ratings` | **0** |
| `prudential_actions` | 20 | `prudential_ewi_alerts` | 90 |
| `prudential_stress_events` | 0 | `group_risk_scores` | 0 |
| `supervisory_plans` | 3 | `supervisory_plan_actions` | 12 |
| `supervisory_plan_templates` | 0 | `conduct_priority_scores` | 36 |
| `conduct_attention_items` | **0** | `conduct_supervisory_plans` | **0** |
| `conduct_plan_milestones` | 0 | `conduct_interventions` | 2 |
| `conduct_intervention_events` | 8 | `conduct_intervention_types` | 11 |
| `examinations` | 14 | `examination_events` | 117 |
| `examination_scoping` | 10 | `examination_workpapers` | 11 |
| `examination_findings` | 10 | `inspections` | **0** |
| `inspection_findings` | **0** | `thematic_reviews` | 5 |
| `conduct_investigations` | 8 | `conduct_findings` | 7 |
| `conduct_actions` | 5 | `enforcement_actions` | 6 |
| `aml_assessments` | **0** | `aml_findings` | **0** |
| `fp_assessments` | 38 | `conduct_emerging_risks` | 1 |

### 1.3 Schema state

464+ public tables, all RLS-enabled except the internal
`worker_invocation_tokens`. Supervisory authority is centralised in
`sec_get_user_context()` / `has_permission()` and per-domain gate functions
(`can_act_on_examination`, `can_act_on_inspection`, `prudential_enforce`,
`conduct_require`, `can_manage_thematic_review`,
`can_manage_conduct_investigation`). Every supervisory mutation of consequence
is exposed as a SECURITY DEFINER RPC; direct browser writes still exist broadly
elsewhere in the platform but the supervisory objects examined here are
RPC-governed.

### 1.4 Documentation conflicts recorded (source/runtime wins)

| Document | Claim | Runtime truth |
| --- | --- | --- |
| `docs/architecture/supervisory-operating-model.md` §2 | "breaches (0), EWI alerts (0) … not exercised" | `prudential_ewi_alerts` = 90 rows; prudential detection is exercised |
| same, §2 | F&P "stops after assessment; findings 0 rows" | `fp_assessments` = 38, `fp_findings` populated with escalation RPC `fp_finding_escalate` present |
| same, §7 | "0 integrity failures … dataset covers downstream consequence thinly" | still directionally true, but `examinations` (14) + `examination_events` (117) show a genuinely exercised examination lifecycle |
| `docs/enterprise/process-operating-model.md` §1 P10 | "Examination … best in platform" | confirmed; but it also implies inspections is a live parallel surface — `inspections` has **0 rows** and is effectively dead |
| same, §1 P04 | "no lifecycle queue" | confirmed |
| `mem://features/prudential/assessment-case-workspace` | rating guidance = "NO AUTOMATED RATING SUGGESTION" | confirmed in `prudential_assessments.auto_suggested_rating` being present but unpopulated methodology; `prudential_assessment_component_ratings` = 0 rows, so CAMELS componentry is defined but **never used at runtime** |

---

## 2. Current supervisory architecture (as built)

The platform today is **five independently-designed supervisory sub-systems
sharing only the regulated entity**:

```text
                          licensees (65)  ← the ONLY universal join
                                 │
   ┌───────────────┬─────────────┼─────────────┬──────────────┬───────────────┐
   │               │             │             │              │               │
PRUDENTIAL      AML/CFT      MARKET        EXAMINATION    FIT & PROPER   RESILIENCE
returns→EWI/    aml_         CONDUCT       examinations   fp_assessments resilience_
breach→         assessments  signals→      (+8 children)  →fp_findings   arrangements
prudential_     →aml_        alerts→                                     /_incidents
assessments     findings     attention→
→prudential_    (0 rows,     priority→
actions         no UI write) plan→
→supervisory_               intervention→
 plans (legacy)             investigation→
                            conduct_findings
                            →conduct_actions
                                 │
                          THEMATIC (5) — many-entity
                                 │
                        enforcement_actions (6) ← polymorphic source_kind
```

Structural characteristics:

1. **No supervisory fact base.** There is no single "signal"/"fact" table.
   Prudential facts live in `prudential_ewi_alerts` / `return_threshold_breaches`
   / `prudential_stress_events`; conduct facts in `conduct_signals` /
   `conduct_alerts` / `conduct_clusters`; AML facts do not exist at all.
2. **Two planning stacks** (`supervisory_plans` legacy prudential;
   `conduct_*` attention→priority→plan→intervention) with no shared identifier.
3. **Two examination-shaped engines** (`examinations` rich, `inspections` dead)
   plus two further review engines (`thematic_reviews`, `conduct_investigations`).
4. **Five finding models** with five vocabularies.
5. **Three remediation models** (`prudential_actions`, `conduct_actions`,
   free-text `aml_findings.remediation_status`).
6. **One enforcement layer**, reached by three different mechanisms.
7. **Two read-model families** (`entity360_*`, `sup_*`) plus a third personal
   queue (`my_work_queue`) plus domain dashboards.
8. **Reassessment is not wired anywhere.**

---

## 3. Domain capability matrix

Legend: ● full ◐ partial ○ absent

| Capability | Prudential | AML/CFT | Market Conduct | Op-Resilience/Cyber | Governance | Cross-domain |
| --- | --- | --- | --- | --- | --- | --- |
| Risk/assessment object | ● `prudential_assessments` | ◐ `aml_assessments` (schema only, 0 rows, no UI write) | ● `conduct_emerging_risk_assessments` + priority scores | ◐ `resilience_arrangements.assessment_state` | ○ (only inside F&P / AI-governance, no entity governance assessment) | ◐ `entity_risk_scores` (computed only) |
| Inherent / control / residual | ○ (component ratings instead, 0 rows) | ● columns exist | ○ (severity/systemic potential) | ○ | ○ | ○ |
| Methodology + version | ◐ `prudential_assessment_components` (weighted, sector-scoped; unused) | ○ | ◐ `conduct_priority_configs` + `version` on emerging-risk assessment | ○ | ○ | ○ |
| Maker-checker | ● self-approval blocked in `prudential_assessment_transition` | ○ (single `approved_by` column, `aml_supervision.approve` permission orphaned) | ● `conduct_plan_transition`, `conduct_intervention_decide` | ○ | ○ | n/a |
| Supervisory attention/priority | ○ | ○ | ● `conduct_attention_items` (+scoring engine) | ○ | ○ | ○ |
| Plan | ◐ `supervisory_plans` (thin) | ○ | ● `conduct_supervisory_plans` | ○ | ○ | ○ |
| Intervention catalogue | ○ | ○ | ● `conduct_intervention_types` (11) | ○ | ○ | ○ |
| Examination engine | ● `examinations` | ○ | ◐ investigations/thematic | ○ | ○ | ○ |
| Workpapers/evidence | ● `examination_workpapers` | ○ | ● `conduct_evidence`, evidence packs | ○ | ○ | ◐ DMS |
| Findings | ● `examination_findings` | ◐ `aml_findings` (no UI) | ● `conduct_findings` | ○ | ◐ `fp_findings` | ○ |
| Remediation + validation | ● `prudential_actions` (+responses, events, auto-breach) | ○ free text | ● `conduct_actions` | ○ | ◐ conditions/evidence | ○ |
| Enforcement referral | ● governed | ○ NO_LINK | ● governed + direct | ○ | ◐ `FP_MATTER` at assessment grain | ● `enforcement_referral_create` |
| Reassessment feedback | ○ | ○ | ◐ `conduct_attention_reassessments` (0 rows) | ○ | ● role recert cycle | ○ |

---

## 4. Current relationship / provenance map

Classification per the requested taxonomy. Only relationships verified against
`pg_constraint`, RPC bodies or source lines are listed.

### 4.1 Prudential chain

| Hop | Class | Evidence |
| --- | --- | --- |
| return filing → EWI alert / breach / stress event | PHYSICAL_FK | `prudential_ewi_alerts.return_filing_id`, `.return_filing_version_id`, `prudential_stress_events.return_filing_id` |
| return filing → prudential assessment | PHYSICAL_FK | `prudential_assessments.return_filing_id`, `.return_filing_version_id`, `.reporting_period_id` |
| EWI/breach → prudential assessment | READ_MODEL_CORRELATION | `prudential_assessments.signal_snapshot` jsonb only; no FK |
| assessment → component ratings | PHYSICAL_FK | `prudential_assessment_component_ratings.assessment_id` (0 rows) |
| assessment → supervisory plan | NO_LINK | `supervisory_plans` references `risk_rating_id` (legacy `risk_ratings`), **not** `prudential_assessments` |
| plan → examination | NO_LINK | no column either direction |
| examination → finding → remediation | PHYSICAL_FK | `examination_findings.examination_id`, `.workpaper_id`, `.remediation_action_id → prudential_actions` |
| breach → enforcement | PHYSICAL_FK (post-hoc) + GOVERNED_REFERENCE | `return_threshold_breaches.escalated_enforcement_id` set by `prudential_breach_link_enforcement`; case created by `enforcement_referral_create('PRUDENTIAL_BREACH')` |
| remediation closure → reassessment | **NO_LINK** | `close_prudential_action` / `prudential_action_update` write status + audit only; nothing touches `prudential_assessments` or `entity_risk_scores` |

### 4.2 AML/CFT chain

| Hop | Class |
| --- | --- |
| entity → `aml_assessments` | PHYSICAL_FK (`entity_id → licensees`) |
| assessment → risk dimensions | **absent object** (no dimension table) |
| assessment → supervisory attention | **NO_LINK** |
| attention → plan → intervention | **NO_LINK** (conduct-only stack) |
| assessment/finding → examination | **NO_LINK** (`examinations` has no assessment or domain column) |
| examination scope ← AML risk | **NO_LINK** (`examination_scoping` has no risk-dimension reference) |
| evidence / workpaper | **NO_LINK** (no AML evidence table; DMS not bound to AML objects) |
| assessment → finding | PHYSICAL_FK (`aml_findings.aml_assessment_id`) |
| finding → remediation | TEXT_REFERENCE (`remediation_status` text, `remediation_due` date) |
| finding → enforcement | **NO_LINK** (`enforcement_resolve_source` has no AML branch) |
| reassessment / current AML risk state | ENTITY_ONLY_CORRELATION (latest row by `assessment_date`, no supersede chain) |

**AML is the weakest chain in the platform: 7 of 11 hops are NO_LINK.**

### 4.3 Market conduct chain

| Hop | Class |
| --- | --- |
| complaint/signal/cluster → alert | PHYSICAL_FK (`conduct_signal_alert_links`, `conduct_cluster_members`) |
| signal/emerging risk → attention | PHYSICAL_FK (`conduct_attention_items.emerging_risk_id`) + GOVERNED_REFERENCE (`source_module`/`source_id`) |
| attention → priority | PHYSICAL_FK (`conduct_attention_priority_calcs.attention_id`) |
| attention → plan | PHYSICAL_FK (`conduct_supervisory_plans.attention_id`) |
| plan → intervention | PHYSICAL_FK (`conduct_interventions.plan_id`) |
| intervention → examination / thematic / investigation | **TEXT/JSON_REFERENCE** (`canonical_module`, `canonical_record_id`, `canonical_route`, set by `conduct_intervention_link_canonical`; not FK-enforced) |
| investigation → finding | PHYSICAL_FK (`conduct_findings.investigation_id`) |
| finding → remediation | PHYSICAL_FK (`conduct_actions.finding_id`) |
| finding → enforcement | PHYSICAL_FK (`conduct_findings.enforcement_action_id`) + legacy direct insert (`escalate_complaint_to_enforcement`) |
| intervention → reassessment | PHYSICAL_FK (`conduct_attention_reassessments.intervention_id`) — the **only** closed loop in the platform, and it has 0 rows |

### 4.4 Enforcement provenance

`enforcement_actions.source_kind` ∈ {COMPLAINT, CONDUCT_INVESTIGATION,
THEMATIC_FINDING, PRUDENTIAL_BREACH, PRUDENTIAL_ACTION, EXAMINATION_FINDING,
LICENSING_VIOLATION, FP_MATTER, MANUAL_REFERRAL} with `source_id` +
`source_reference` resolved by `enforcement_resolve_source` = GOVERNED_REFERENCE.
Gaps: **no AML_FINDING, no INSPECTION_FINDING, no CONDUCT_FINDING, no
ASSESSMENT** source kinds; and three parallel entry mechanisms exist
(`enforcement_referral_create`, `inspection_finding_escalate`,
`escalate_complaint_to_enforcement`).

---

## 5. Duplication register

| # | Objects compared | Verdict | Basis |
| --- | --- | --- | --- |
| D-01 | `risk_ratings` vs `prudential_assessments` | **LEGACY_DUPLICATE** (`risk_ratings`) | `risk_ratings` is a flat rating (3 rows) with no status/approval; it is nonetheless the FK anchor of `supervisory_plans.risk_rating_id`, so it is load-bearing legacy |
| D-02 | `prudential_assessments` vs `aml_assessments` | **SAME_BUSINESS_CONCEPT, different domain** → candidate for one envelope + domain extension | both are periodic, entity-scoped, rated, approvable assessments; AML has the inherent/control/residual triad prudential lacks, prudential has the component/weight machinery AML lacks |
| D-03 | `entity_risk_scores` / `group_risk_scores` vs assessments | **LEGITIMATELY_DIFFERENT** | computed, versioned by `period_key`/`is_current`; not supervisory judgement |
| D-04 | `conduct_emerging_risk_assessments` vs the above | **DOMAIN_EXTENSION** | theme-level, not entity-level; versioned |
| D-05 | `supervisory_plans` vs `conduct_supervisory_plans` | **SAME_BUSINESS_CONCEPT**, currently expressed as DOMAIN_EXTENSION | both = "approved plan of supervisory activity"; conduct model is strictly richer (objective provenance, factual basis, planning period, activation, outcome). No migration path exists between them |
| D-06 | `supervisory_plan_actions` vs `conduct_plan_milestones` vs `conduct_interventions` | **Two concepts conflated** | `supervisory_plan_actions` = task list; `conduct_plan_milestones` = task list (SAME_BUSINESS_CONCEPT with plan_actions); `conduct_interventions` = a *governed supervisory activity with maker-checker and outcome* (LEGITIMATELY_DIFFERENT, and the correct enterprise concept) |
| D-07 | `inspections` vs `examinations` | **LEGACY_DUPLICATE** | same concept (one-entity onsite review → findings → rating); `can_act_on_examination` explicitly accepts `inspection_management` grants; inspections predates by 4.5 months, has 0 rows, no stage machine |
| D-08 | `examinations` vs `thematic_reviews` | **LEGITIMATELY_DIFFERENT** | many-entity/product scope, closure maker-checker, regulatory-learning capture |
| D-09 | `examinations` vs `conduct_investigations` | **DOMAIN_EXTENSION / UNCERTAIN** | investigation is reactive (`source_type`/`source_id`), single flat table with jsonb milestones; the same "available_actions + blockers + step" controller idiom is independently re-implemented server-side |
| D-10 | `examination_findings` vs `inspection_findings` vs `aml_findings` vs `conduct_findings` vs `fp_findings` vs `thematic_review_findings` | **SAME_BUSINESS_CONCEPT × 6** (fp_findings = LEGITIMATELY_DIFFERENT: it is a screening hit, not a supervisory finding) | five different severity/status vocabularies, five different remediation shapes, three different enforcement mechanisms, only two support management response |
| D-11 | `prudential_actions` vs `conduct_actions` vs `aml_findings.remediation_status` vs `thematic_review_actions` vs `enforcement_obligations` | **SAME_BUSINESS_CONCEPT × 5** | all are "required corrective action with owner, due date, response, verification, closure"; `prudential_actions` is the most complete (responses, events, auto-breach, waiver) |
| D-12 | `prudential_escalations` vs `escalations` vs `conduct_closure_breaches` | **TRANSITIONAL_BRIDGE / duplication** | `prudential_escalations.related_type/related_id` is ENTITY_ONLY_CORRELATION to its source |
| D-13 | `my_work_queue` vs `sup_priority_work_queue` vs domain queues (`PrudentialWorkQueue`, `/returns/queue`, `/enforcement`, `/conduct/*`, `ThematicClosureQueue`, `InvestigationClosureQueue`) | **DUPLICATED implementation pattern, different audiences** | two server-side "assemble items from N tables" implementations + ~10 domain queues; no single canonical work-item model |
| D-14 | `entity360_*` vs `sup_*` read models vs `executive_dashboard_snapshot` vs `conduct_supervision_loop_*` | **DUPLICATED read models** | four independent aggregation families over the same tables; `EntitySupervisoryStatePanel` already has to compose two of them |

---

## 6. AML/CFT deep-gap assessment

**Verdict: AML/CFT is a data display with an unused assessment schema. It is not
a supervisory operating domain.**

Evidence:

- `aml_assessments` / `aml_findings` exist with correct shape (inherent, control,
  residual, status, approver, `next_review_date`, severity, remediation due) and
  their own RBAC module `aml_supervision` (view / view_confidential / edit /
  approve), RLS-gated.
- **Zero rows in both tables.**
- **No page, route, hook, form or mutation anywhere in `src/`** writes AML data.
  No `.from('aml_assessments')`, no `aml_*` RPC exists at all. The only surface
  is the read-only Entity 360 `aml` / `aml_confidential` sections
  (`sectionCatalogue.tsx:402-429`, `useEntity360.ts:50`,
  `Entity360Overview.tsx:119-127`) served by `entity360_*` RPCs, plus
  `e360_section_allowed()` confidentiality tiering.
- `aml_supervision.approve` is **orphaned**: no RLS policy and no RPC references
  it; `approved_by`/`approved_at` are plain writable columns under the single
  `edit` right — there is no maker-checker.
- Absent objects: risk dimensions, methodology/version, evidence binding,
  supervisor commentary thread, review-type (periodic vs event-driven), risk
  trend / supersede chain, heatmap source, attention, plan, intervention,
  examination initiation, AML-scoped examination scope, AML workpapers,
  structured remediation, enforcement referral, reassessment, portfolio view.

Capability scoring:

| AML capability | Status |
| --- | --- |
| entity risk profiling | ◐ schema only |
| inherent / controls / residual | ◐ columns, unused |
| assessment dimensions | ○ |
| methodology / version | ○ |
| evidence | ○ |
| supervisor commentary | ◐ `summary`, `confidential_notes` |
| maker-checker | ○ |
| periodic review | ◐ `next_review_date` only |
| event-driven review | ○ |
| risk trend / heatmap | ○ (no dimension or period model) |
| supervisory attention / planning | ○ |
| examination initiation & AML-driven scope | ○ |
| AML workpapers / findings / remediation | ○ / ◐ / ○ |
| enforcement / reassessment / portfolio | ○ |

**Reuse determination — no separate AML engine is required.** Everything AML
needs already exists in enterprise form and needs only to be made
domain-neutral:

| AML need | Reuse |
| --- | --- |
| Assessment envelope + maker-checker + audit | `prudential_assessments` transition machine (`prudential_assessment_transition`, self-approval block, `prudential_audit_event`) generalised |
| Dimensions with weights | `prudential_assessment_components` + `prudential_assessment_component_ratings` generalised (currently 0 rows — free to generalise) |
| Attention / priority / plan / intervention | `conduct_attention_items` → `conduct_attention_priority_calcs` → `conduct_supervisory_plans` → `conduct_interventions` generalised (all 0 rows except 2 interventions — the cheapest generalisation in the platform) |
| Examination with scope, team, data requests, workpapers, exit meeting, versioned report, findings, events | `examinations` + 8 children, made domain-neutral |
| Remediation with response, verification, auto-breach | `prudential_actions` generalised |
| Enforcement consequence with provenance | `enforcement_actions` + a new `source_kind` |
| Reassessment | `conduct_attention_reassessments` generalised |
| Evidence | DMS (`document_management`) + `examination_workpapers` |

---

## 7. Enterprise SupTech maturity assessment

| Capability | Rating | Note |
| --- | --- | --- |
| Risk-based supervision | FRAGMENTED | risk exists in 6 unrelated stores; no single entity risk state |
| Continuous supervisory risk understanding | PARTIAL | prudential detection is live (90 EWI alerts); conduct scoring live (36 scores); AML/resilience/governance dark |
| Periodic + event-driven assessment | PARTIAL | periodicity only as `next_review_date`; no review-trigger classification anywhere |
| Methodology versioning | PARTIAL | component/weight model exists but unused (0 rows); conduct priority configs versioned |
| Supervisory judgment | ADEQUATE | explicit override/rationale fields on prudential and conduct paths |
| Maker-checker | ADEQUATE | strong on prudential assessment, conduct plan/intervention, thematic closure; absent on AML and legacy inspections |
| Supervisory planning | DUPLICATED | two stacks, neither authoritative |
| Risk-driven resource allocation | PARTIAL | `sup_team_performance` + `entity_supervision_assignments` exist; not plan-driven |
| Onsite/offsite examinations | STRONG (onsite, prudential only) / MISSING (offsite review as a first-class object) | `examinations` is the reference implementation; there is no "offsite review" object at all |
| Thematic reviews | ADEQUATE | own closure workflow; weak header/integration |
| Evidence management | ADEQUATE | DMS foundation + `examination_workpapers` + `conduct_evidence`; not bound to assessments |
| Workpapers | STRONG (examinations) / MISSING (all other domains) | |
| Management response | PARTIAL | only `examination_findings.entity_response`, `conduct_findings.entity_response`, `prudential_action_responses` |
| Findings | DUPLICATED | six models |
| Corrective action plans | DUPLICATED | five models |
| Remediation validation | PARTIAL | prudential (`review_status`, waiver) and thematic (`record_verification`) only |
| Enforcement | ADEQUATE | one case object, governed referral, maker-checker, appeals, obligations, penalties — but three entry mechanisms and missing source kinds |
| Reassessment | MISSING | no remediation→risk feedback anywhere; `conduct_attention_reassessments` is the only designed loop and is unused |
| Cross-domain supervision | MISSING | nothing joins domains except `entity_id` |
| Portfolio supervision | PARTIAL | `conduct_priority_scores` ranks entities; no cross-domain portfolio |
| Auditability | ADEQUATE→STRONG | `audit_logs` + `compliance_audit_logs` dual-write via `prudential_audit_event`; append-only `examination_events` (117) and `conduct_intervention_events` |
| Regulatory defensibility | PARTIAL | provenance breaks at plan→intervention→examination (text reference) and everywhere at remediation→reassessment |
| Executive oversight | ADEQUATE | `executive_dashboard_snapshot()` with authoritative/AI separation — but a fourth read model |

---

## 8. Canonical target architecture

One entity. One fact base. Many risk domains. One lifecycle. One examination
engine. One findings/remediation contract. One consequence layer. One timeline.
One work model.

```text
                        REGULATED ENTITY (licensees)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        SUPERVISORY FACT / SIGNAL            ENTITY RISK STATE
        supervisory_signal                   entity_risk_state
        (domain, source_kind,                (per entity × domain:
         source_id, severity,                 current residual band,
         detected_at, period)                 driving assessment,
         ← prudential EWI/breach/stress,      last/next review)
           conduct signals/alerts/clusters,   ▲
           complaints, returns, F&P,          │ (only a governed,
           incidents, intel                   │  human-approved
                    │                          │  transition writes here)
                    ▼                          │
        SUPERVISORY ASSESSMENT ────────────────┘
        supervisory_assessment (envelope: entity, domain, methodology_version,
          period, review_trigger[periodic|event], inherent, control, residual,
          status machine, maker≠checker, supersedes_id)
              └─ supervisory_assessment_dimension  (dimension, weight,
                   inherent/control/residual, rationale, evidence refs)
              └─ domain extensions: prudential (CAMELS components),
                   aml (TM/CDD/STR/sanctions/training), conduct, resilience,
                   governance
                    │
                    ▼
        SUPERVISORY ATTENTION  (attention item: basis, materiality/urgency/
          breadth/recurrence, calculated + confirmed priority, owner/team,
          many-to-many to originating assessments *and* dimensions *and* signals)
                    │
                    ▼
        SUPERVISORY PLAN  (period, objective + provenance, factual basis,
          maker-checker approval, activation, outcome)
                    │
                    ▼
        SUPERVISORY INTERVENTION  (catalogue-typed governed activity:
          MEETING | RFI | OFFSITE_REVIEW | EXAMINATION | THEMATIC_REVIEW |
          INVESTIGATION | ENHANCED_MONITORING | ENFORCEMENT_REFERRAL,
          proposer ≠ decider, PHYSICAL_FK to the canonical activity record)
                    │
                    ▼
        ACTIVITY ENGINE  ── examinations (domain-neutral) ── thematic_reviews
                        ── investigations ── offsite_review (new use of the
                           examination engine with a lightweight stage subset)
                    │
                    ▼
        EVIDENCE + WORKPAPERS  (examination_workpapers + DMS documents,
          referenceable from assessments, dimensions and findings)
                    │
                    ▼
        SUPERVISORY FINDING  (one table: entity, domain, source activity
          (polymorphic governed reference + FK per activity type), criteria
          breached, severity, root cause, recommendation, management response,
          status; domain extension table for AML/prudential/conduct attributes;
          FK to originating assessment dimension)
                    │
                    ▼
        REMEDIATION / SUPERVISORY ACTION  (one table generalised from
          prudential_actions: owner, due, entity response, auto-breach,
          waiver, verification, closure) ── ENFORCEMENT (enforcement_actions
          with complete originating provenance chain)
                    │
                    ▼
        VALIDATION  (verification record: verifier ≠ owner, evidence, outcome)
                    │
                    ▼
        REASSESSMENT TRIGGER  (system *proposes* a reassessment task; a human
          assessment transition is the only writer of entity_risk_state)
                    │
                    ▼
        UPDATED RISK STATE  →  next supervisory cycle
```

Cross-cutting: one `supervisory_timeline` read model (superset of
`entity360_timeline`, `conduct_supervision_timeline`, `examination_events`), one
`supervisory_work_item` canonical work model consumed by My Work, the
Supervisory Dashboard, domain queues and the Executive snapshot.

---

## 9. Object decision register

| Object | Decision | Rationale |
| --- | --- | --- |
| `licensees` (regulated entity) | KEEP_CANONICAL | already the single spine |
| `entity_supervision_assignments`, `regulatory_teams` | KEEP_CANONICAL | |
| `entity_risk_scores` / `group_risk_scores` | KEEP_CANONICAL (as computed score) + NEEDS_DECISION on relation to new `entity_risk_state` | computed ≠ authoritative judgement; must not be the risk state |
| `risk_ratings` | BRIDGE_THEN_MIGRATE → RETIRE_LATER | 3 rows, but FK anchor of `supervisory_plans` |
| `prudential_assessments` | GENERALISE_TO_ENTERPRISE (becomes `supervisory_assessment` + prudential extension) | best transition machine in the platform |
| `prudential_assessment_components` / `_component_ratings` | GENERALISE_TO_ENTERPRISE (→ dimension model) | 0 rows: free to generalise |
| `aml_assessments` | BRIDGE_THEN_MIGRATE (0 rows → migrate outright) | replace with envelope + AML dimension extension |
| `aml_findings` | REPLACE | 0 rows; replaced by canonical finding + AML extension |
| `conduct_emerging_risk*` | KEEP_AS_DOMAIN_EXTENSION | theme-level, not entity-level |
| `fp_assessments` / `fp_findings` | KEEP_CANONICAL (person/appointment grain) + add governed feed into entity governance risk | per the brief |
| `resilience_arrangements` / `_incidents` | KEEP_CANONICAL as facts; NEEDS_DECISION on a resilience assessment domain | |
| `supervisory_plans` / `supervisory_plan_actions` | MAKE_READ_ONLY_LATER → RETIRE_LATER | superseded by generalised plan + interventions |
| `supervisory_plan_templates` | REPLACE | 0 rows; re-implement against canonical plan |
| `conduct_attention_items` (+ events/priority_calcs/reassessments) | GENERALISE_TO_ENTERPRISE | 0 rows; richest and correct model |
| `conduct_supervisory_plans` (+ plan_events/milestones) | GENERALISE_TO_ENTERPRISE | 0 rows |
| `conduct_interventions` / `conduct_intervention_types` | GENERALISE_TO_ENTERPRISE | 2 rows; catalogue already carries `canonical_module`/`canonical_route` intent |
| `conduct_priority_configs/runs/scores` | KEEP_CANONICAL (prioritisation engine), generalise inputs to all domains | |
| `examinations` + 8 child tables | GENERALISE_TO_ENTERPRISE (add `domain`, `origin` links, offsite stage subset) | reference implementation; do not rebuild |
| `inspections` / `inspection_findings` | MAKE_READ_ONLY_LATER → RETIRE_LATER | 0 rows, legacy duplicate |
| `thematic_reviews` (+7 children) | KEEP_AS_DOMAIN_EXTENSION, bind to plan/intervention and canonical findings | |
| `conduct_investigations` | KEEP_AS_DOMAIN_EXTENSION, converge controller contract | |
| `examination_findings` | GENERALISE_TO_ENTERPRISE (becomes canonical finding) | already has target date, response, remediation FK |
| `conduct_findings` | BRIDGE_THEN_MIGRATE to canonical finding + conduct extension | 7 rows |
| `thematic_review_findings` | BRIDGE_THEN_MIGRATE | 5 rows |
| `prudential_actions` (+ responses/events) | GENERALISE_TO_ENTERPRISE (canonical remediation) | most complete action model |
| `conduct_actions` | BRIDGE_THEN_MIGRATE | 5 rows |
| `thematic_review_actions` | BRIDGE_THEN_MIGRATE | |
| `enforcement_actions` + satellites | KEEP_CANONICAL, extend provenance | add source kinds + provenance chain |
| `escalate_complaint_to_enforcement`, `inspection_finding_escalate` | RETIRE_LATER | must route through `enforcement_referral_create` |
| `escalations` / `prudential_escalations` / `conduct_closure_breaches` | NEEDS_DECISION | likely one escalation object with typed source |
| `entity360_*` RPCs | KEEP_CANONICAL (Entity 360 contract), source from new spine | |
| `sup_*` RPCs | KEEP_CANONICAL (supervisory read models), source from new spine | |
| `conduct_supervision_loop_*` | BRIDGE_THEN_MIGRATE into the enterprise loop read model | correct concept, wrong scope (conduct-only) |
| `my_work_queue` | GENERALISE_TO_ENTERPRISE (canonical work item, personal filter) | |
| `executive_dashboard_snapshot` | KEEP_CANONICAL, re-source | authoritative/AI separation already correct |
| `document_management` (DMS) | KEEP_CANONICAL as evidence store | |

---

## 10. Target relationship model (required classes)

| Relationship | Required class |
| --- | --- |
| signal → assessment (many-to-many) | CANONICAL_LINK_TABLE |
| assessment → dimension | PHYSICAL_FK |
| assessment/dimension → attention (many-to-many) | CANONICAL_LINK_TABLE |
| attention → plan | PHYSICAL_FK |
| plan → intervention | PHYSICAL_FK |
| intervention → activity record (examination / thematic / investigation / offsite / RFI / meeting) | PHYSICAL_FK per activity type (replacing today's text `canonical_record_id`) |
| activity → multiple originating assessments + dimensions (joint examinations) | CANONICAL_LINK_TABLE (`examination_origin`) |
| examination scope item → assessment dimension | PHYSICAL_FK |
| workpaper/evidence → finding | PHYSICAL_FK |
| finding → originating dimension | PHYSICAL_FK (nullable) |
| finding → remediation | PHYSICAL_FK |
| remediation → validation | PHYSICAL_FK |
| validation → reassessment task | PHYSICAL_FK |
| reassessment (assessment) → superseded assessment | PHYSICAL_FK (`supersedes_id`) |
| assessment approval → entity risk state | PHYSICAL_FK (`entity_risk_state.driving_assessment_id`) |
| finding/breach/action/assessment → enforcement | GOVERNED_REFERENCE via single `enforcement_referral_create` **plus** a provenance chain link table recording the full upstream path |
| enforcement → obligations/penalties/appeals | PHYSICAL_FK (already) |
| every object → timeline/work item | READ_MODEL_CORRELATION (read models only; never a write path) |

Explicitly forbidden in the target: TEXT/JSON_REFERENCE or
ENTITY_ONLY_CORRELATION for any lifecycle hop.

---

## 11. Legacy / convergence strategy

1. **Generalise the strongest implementation; never rebuild.** Assessment
   machine ← prudential; attention/plan/intervention ← conduct; activity engine
   ← examinations; remediation ← prudential actions; consequence ←
   enforcement_actions.
2. **Exploit the zero-row window.** `conduct_attention_items`,
   `conduct_supervisory_plans`, `conduct_plan_milestones`,
   `prudential_assessment_component_ratings`, `aml_assessments`, `aml_findings`,
   `inspections`, `inspection_findings`, `supervisory_plan_templates` are all
   empty. These can be generalised or replaced with no data migration.
3. **Bridge the small populated legacies** (`risk_ratings` 3, `supervisory_plans`
   3/12, `conduct_findings` 7, `conduct_actions` 5, `thematic_review_findings` 5,
   `examination_findings` 10, `prudential_actions` 20) by backfilling into
   canonical tables and keeping the legacy relations as views for one epic.
4. **Route retirement, not deletion**: legacy URLs preserved; legacy tables go
   read-only before retirement, per the pattern already used in EPR-01.
5. **Single writer per truth**: only the assessment transition RPC writes risk
   state; only `enforcement_referral_create` opens enforcement cases; only
   `examination_transition_stage`-family RPCs move activity stages.
6. **Read models last**: Entity 360, `sup_*`, loop, executive snapshot and My
   Work are re-sourced only after the spine is canonical (Epic 4).

---

## 12. Non-negotiable architecture invariants

- I-01 One regulated entity spine (`licensees`); no second entity identity.
- I-02 One supervisory assessment envelope; domains extend, never fork.
- I-03 Risk state is written **only** by an approved human assessment
  transition. No trigger, batch job or AI may change authoritative risk.
- I-04 Maker ≠ checker on every assessment approval, plan approval, intervention
  decision, finding closure, remediation validation and enforcement decision.
- I-05 Every lifecycle hop is a PHYSICAL_FK or a CANONICAL_LINK_TABLE. Shared
  `entity_id` is never a relationship.
- I-06 One examination engine; domain is an attribute, not a new table.
- I-07 One findings contract and one remediation contract; domain attributes live
  in extension tables keyed to the canonical row.
- I-08 One enforcement entry point (`enforcement_referral_create`) with complete
  originating provenance.
- I-09 Every governed mutation emits an audit event to `audit_logs` +
  `compliance_audit_logs`; activity/intervention event tables stay append-only.
- I-10 AI output is advisory, attributed, reviewable and never authoritative.
- I-11 RLS remains the authority; every new table ships GRANTs + policies.
- I-12 Assignment-only regulators stay read-only and scope-limited.
- I-13 No new work queue or dashboard may query base tables directly; read models
  only.
- I-14 Legacy paths are made read-only before retirement; legacy URLs never break.
- I-15 Confidentiality tiering (e.g. AML confidential) is enforced server-side
  per section/field, never in the client.

---

## 13. Epic 2 scope — Canonical supervisory spine

**Outcome:** one assessment envelope with dimensions and methodology versioning,
one supervisory fact/signal base, one attention→priority→plan→intervention
architecture, and a domain-neutral examination engine with real FK provenance.

Internal tasks:

1. Supervisory fact base: canonical `supervisory_signal` over prudential EWI /
   breach / stress, conduct signals/alerts/clusters, complaints, returns,
   F&P and resilience facts (link tables, no data movement).
2. Assessment envelope + dimension model + methodology version, generalised from
   `prudential_assessments` and its unused component tables; prudential extension
   preserves CAMELS; `supersedes_id` and `review_trigger` added.
3. `entity_risk_state` with single-writer invariant (I-03) and
   `driving_assessment_id`.
4. Generalise attention / priority / plan / intervention to all domains; retain
   conduct semantics; add assessment- and dimension-level origin link tables.
5. Domain-neutral examinations: `domain`, `examination_origin` link table
   (multiple assessments + dimensions for joint exams), scope items bound to
   dimensions, offsite-review stage subset, module gate generalised beyond
   `prudential_supervision`.
6. Bridge `risk_ratings` and `supervisory_plans` (read-only path defined, not yet
   retired).
7. Certification: provenance from signal → assessment → attention → plan →
   intervention → examination, all PHYSICAL_FK; maker-checker suites; RLS/persona
   suites; audit dual-write proof.

Out of scope for Epic 2: findings/remediation convergence, AML content,
dashboard re-sourcing, legacy retirement.

## 14. Epic 3 scope — AML/CFT + closed-loop supervision

**Outcome:** AML/CFT becomes a first-class supervisory domain on the Epic 2
spine, and the loop closes: findings → remediation → validation → reassessment →
updated risk state, with enforcement provenance.

Internal tasks:

1. AML domain configuration on the canonical envelope: AML dimensions (CDD/KYC,
   transaction monitoring, sanctions screening, STR governance, training,
   governance & MLRO, risk assessment), inherent/control/residual per dimension,
   AML methodology version, maker-checker, periodic + event-driven review,
   trend/heatmap read model, `aml_supervision.approve` wired into RLS/RPC.
2. AML supervisory operation: attention from AML dimensions, AML plan, AML
   intervention, AML-scoped examination (scope items bound to AML dimensions),
   AML workpapers, AML findings via the canonical finding.
3. Canonical finding contract + domain extensions; migrate `conduct_findings`,
   `thematic_review_findings`; retire `aml_findings`; management response
   mandatory field set.
4. Canonical remediation contract generalised from `prudential_actions`;
   migrate `conduct_actions`, `thematic_review_actions`; validation record with
   verifier ≠ owner.
5. Reassessment trigger: validated remediation *proposes* a reassessment task;
   only the human assessment transition updates risk state (I-03).
6. Enforcement provenance: add missing `source_kind`s (AML_FINDING,
   SUPERVISORY_FINDING, ASSESSMENT), full upstream provenance chain, retire
   `inspection_finding_escalate` and `escalate_complaint_to_enforcement` as
   independent writers.
7. Certification: the full AML trace (assessment → HIGH residual TM dimension →
   attention → plan → targeted AML examination → workpapers → finding →
   corrective action → validation → reassessment → updated residual) proven as
   database provenance, not UI correlation.

## 15. Epic 4 scope — Enterprise convergence & certification

**Outcome:** one supervisory truth surfaced everywhere; parallel paths retired;
end-to-end certification across all domains.

Internal tasks:

1. Canonical `supervisory_work_item` model; My Work, Supervisory Dashboard,
   domain queues and priority queue all consume it; `my_work_queue` becomes a
   personal filter over it.
2. One supervisory timeline read model; Entity 360 shows final supervisory state
   per domain (residual risk, driving assessment, open findings, open
   remediation, next review, active interventions) from the canonical spine.
3. Re-source `sup_*`, `entity360_*`, supervision-loop and
   `executive_dashboard_snapshot` onto the spine; retire redundant aggregations;
   preserve the authoritative/AI visual separation.
4. Cross-domain and portfolio supervision: multi-domain entity risk view,
   sector/portfolio heatmaps, joint examinations, cross-domain attention.
5. Legacy retirement: `inspections`/`inspection_findings`,
   `supervisory_plans`/`_actions`/templates, `risk_ratings`, duplicate
   escalation paths — read-only, then retired; legacy routes redirected.
6. F&P → entity governance risk feed (governed, not automatic risk change).
7. Comprehensive E2E certification: pgTAP + Vitest + Playwright persona journeys
   per domain, provenance-integrity verification script, RBAC/RLS matrices,
   audit completeness census, performance baselines, and a traceability report
   answering all §10 questions from the database alone.

---

## 16. Key risks and open questions

**Risks**

| # | Risk | Mitigation |
| --- | --- | --- |
| R-01 | Generalising `prudential_assessments` destabilises certified F8-W1A…W3A prudential paths | extend in place; prudential extension keeps existing columns and RPC names; run F8 gates each wave |
| R-02 | Generalising conduct planning breaks the certified EPR-04/EPR-05 conduct surfaces | zero rows in attention/plan tables; keep conduct RPC names as thin wrappers |
| R-03 | Findings convergence touches 6 populated tables and their UIs | canonical-first + views; migrate 22 populated rows in one governed backfill |
| R-04 | Enforcement provenance changes could break the certified maker-checker gate | additive source kinds only; no change to decision logic |
| R-05 | 472 ungoverned direct browser writes elsewhere could bypass new invariants | new supervisory tables get no `anon`/direct write grants; writes only via RPC |
| R-06 | Read-model re-sourcing regresses the Executive snapshot integrity work | snapshot capture contract frozen; only the source query changes, with a parity test |
| R-07 | Demo environment (Saint Lucia FSRA) depends on current surfaces | every wave keeps existing routes working; demo dataset re-verified per wave |

**Open questions for approval**

- Q-A: Should `entity_risk_scores` (computed) remain visible alongside
  `entity_risk_state` (judged), or be demoted to an input signal only?
- Q-B: Is "offsite review" an examination with a reduced stage subset (recommended)
  or a distinct activity type?
- Q-C: Do `escalations`, `prudential_escalations` and `conduct_closure_breaches`
  converge into one escalation object in Epic 4?
- Q-D: Should `conduct_investigations` be absorbed into the activity engine or
  remain a domain extension permanently?
- Q-E: Is a Governance domain assessment required in Epic 3, or does F&P plus
  examination coverage suffice until Epic 4?
- Q-F: Confirm AML dimension list and rating scale (the FATF-aligned set proposed
  in §14.1) before Epic 3 begins.

**Resolutions taken in Epic 2 (implemented and certified)**

| Q | Resolution | Evidence |
| --- | --- | --- |
| Q-A | `entity_risk_state` is the only judged risk of record and has exactly one governed writer (approved supervisory assessment transition). `entity_risk_scores` is demoted to a computed input signal and never drives supervisory action. | PASS 4, `scripts/verify-epic-2-supervisory-spine.sql` |
| Q-B | Offsite review is an **engagement type** of the single canonical activity engine (`examinations.engagement_type = 'OFFSITE_REVIEW'`) with a reduced stage subset — not a distinct activity object. One stage engine serves all engagement types. | PASS 5, Scenario C |
| Q-C | Deferred to Epic 4 as originally scoped; no escalation convergence performed in Epic 2. | out of Epic 2 scope |
| Q-D | `conduct_investigations` remains a **domain extension** of the canonical activity for now; the decision is revisited in Epic 4 rather than pre-empted. | Scenario C (legacy conduct reads intact) |
| Q-E | No Governance domain assessment added in Epic 2; F&P plus examination coverage carries until Epic 4. | Epic 2 domain set: PRUDENTIAL, AML_CFT, MARKET_CONDUCT, CROSS_DOMAIN |
| Q-F | AML dimensions and rating scale implemented as proposed in §14.1 (inherent risk and control effectiveness dimensions with residual rating), proven end-to-end. | PASS B, Scenario B |


---

## 17. Recommended acceptance criteria for Epic 1

1. HEAD, branch, tree state, migration head and live supervisory row counts
   recorded from runtime, not documentation. ✔ (§1)
2. Every documentation/runtime conflict recorded rather than silently resolved.
   ✔ (§1.4)
3. Every supervisory implementation inventoried from source and catalogue —
   entity foundation, assessments, planning, activity engines, findings,
   remediation, enforcement, supporting services. ✔ (§2–§3)
4. Every lifecycle hop classified with the required relationship taxonomy and
   column/file evidence; no relationship asserted from shared `entity_id`.
   ✔ (§4)
5. Duplication register covering all eight requested comparisons with a verdict
   each. ✔ (§5, D-01…D-14)
6. AML/CFT classified (display vs assessment vs operating domain) with a reuse
   determination and an explicit "no separate AML engine" conclusion. ✔ (§6)
7. All 24 benchmark capabilities classified. ✔ (§7)
8. Canonical target architecture defined end-to-end from entity to next cycle.
   ✔ (§8)
9. Every major object assigned exactly one decision class. ✔ (§9)
10. Target relationship model states the required class per hop and forbids
    text/entity-only lifecycle links. ✔ (§10)
11. Legacy/convergence strategy exploits the empty-table window and defines
    single writers. ✔ (§11)
12. Fifteen non-negotiable invariants recorded. ✔ (§12)
13. Exactly three remaining epics scoped, with internal tasks only. ✔ (§13–§15)
14. Risks and open questions requiring the user's decision listed. ✔ (§16)
15. No migration, schema change, navigation change, workflow change or data
    change made in Epic 1. ✔ (working tree contains this document only)

**Status: Epic 1 complete — awaiting architecture approval before Epic 2.**
