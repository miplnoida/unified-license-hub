# Make every policy component genuinely configurable

## What you are seeing today

On a policy profile only three of the thirteen components can actually be set up:

| Component | Today |
| --- | --- |
| Methodology | configurable, versioned, approvable |
| Calculation policy | configurable (own screen), can be attached to a profile |
| Assessment programme | configurable, versioned, approvable |
| Sector overlay, Fact configuration, Source bindings, Evidence policy, Materiality, Judgement & override, Supervisory response, SLA, Dashboard, Notification | placeholders — "Awaiting platform capability" |

So the demonstration claim that a regulator can configure applicability, evidence rules, escalation, supervisory responses, SLAs, dashboards and notifications is not yet true for those ten areas. The calculation policy is real, but it can only be created from a separate admin screen and only for a methodology version, which is why the reference profile shows "Nothing bound".

## What this wave delivers

### 1. One governed component family for the ten missing areas

Instead of ten bespoke modules, add a single versioned component family that behaves exactly like the methodology and programme components already do:

- Each component version has: regulator, domain, component type, code, version, status, effective dates, author, approver, rationale, structured content.
- Lifecycle DRAFT → SUBMITTED → APPROVED → ACTIVE → SUPERSEDED/RETIRED, enforced on the server.
- Maker-checker: submitter cannot approve; rationale required on every transition.
- Immutability: once APPROVED the content cannot change — a new version must be created.
- Full audit and provenance rows for every transition, same tables the AML waves already use.
- Content is validated per component type on the server against an explicit field contract (for example an SLA policy must define at least one stage with a positive day count; a response policy must map risk bands to permitted supervisory actions). Nothing is accepted as free-form.

Once a type has real architecture, its catalogue row is flipped to available, so the profile screen automatically offers Bind/Change/Remove and the readiness engine starts counting it.

### 2. Configuration screens

- A component workspace under Administration → Configuration → Supervision where each of the ten types can be created, edited while DRAFT, submitted, approved, activated and versioned — with a per-type editor (bands, thresholds, stage days, action mappings, notification triggers, dashboard tiles, evidence sufficiency rules, materiality limits, override rules, applicability conditions, source bindings).
- The approvals screen already used for calculation configuration is extended to list these component approvals too, so the checker persona approves everything in one place.

### 3. Calculation policy reachable from the profile

- The profile component row gets a "Create new version" path that opens the calculation configuration workspace pre-scoped to the profile's bound methodology, and returns to the profile.
- Where a profile's methodology has no calculation configuration at all, the row explains that plainly and offers that path instead of just "Nothing bound".

### 4. Requirement control per profile

Requirement (Required / Optional / Not applicable) becomes editable for every newly available type, with domain-locked types still locked and explained, so the regulator decides which components its own policy package demands.

## Guardrails kept

- No policy values are invented: new component versions start empty and must be authored, submitted and approved by real personas.
- The active AML methodology v1.0, the active calculation configuration, published ratings and all history are untouched.
- No client-side decisions: readiness, eligibility, lifecycle and approval remain server-owned; the screens only display server verdicts.
- Existing demo data, cleanup safety and the AML certification evidence stay valid.

## Technical notes

- New tables: `supervisory_policy_component_version` (+ `_content`, `_event`) with GRANTs, RLS scoped by regulator and `aml_supervision.manage_config` / `methodology_approve`, and a per-type content validator function.
- New RPCs: `..._component_upsert`, `..._content_set`, `..._validate`, `..._lifecycle`, `..._list`, `..._detail`; reuse `supervisory_policy_component_probe` by extending it to the new family so binding, adoption and versioning of profiles work unchanged.
- Catalogue rows updated with `component_table` and `is_available = true` per type as its validator lands.
- Frontend: `useSupervisoryPolicyComponents` hook, component register/detail pages, per-type editors, route + navigation + breadcrumb registration, RBAC data attributes.
- Verification: a rollback-only SQL verifier covering lifecycle, maker-checker, immutability, validation refusals, scope isolation, binding and readiness; UI tests for each editor; frontend-boundary verifier extension; typecheck, build and one full two-worker suite.

## Sequencing

1. Component family schema, validators, RPCs, verifier.
2. Screens and profile integration for the four highest-value types (Supervisory response, SLA, Evidence, Materiality).
3. Remaining six types (Sector overlay, Fact configuration, Source bindings, Judgement & override, Dashboard, Notification).
4. Calculation policy in-profile authoring path, then documentation and demo script updates.
