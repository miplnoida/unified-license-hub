# Entity & External Registry Architecture (RDM-ENTITY-001, Phase 0/1/1.1)

## 1. Target model

```text
PARTY
├── ORGANIZATION ──► ENTITY (in perimeter) ──1..n── Licence ──1..n── Condition
│        │                    │                        │
│        │                    │                        └── Application (initial / post-licence)
│        │                    ├── Entity Identifier (n, scoped uniqueness)
│        │                    ├── Identity Status (1)
│        │                    ├── Lifecycle Stage (1, entity domain only)
│        │                    └── Classification Value (n, per scheme)
│        └── NON-REGULATED ORGANIZATION (auditor, agent, group parent)
└── INDIVIDUAL ──role assignment──► ENTITY

Relationship (n, typed, dated) ──► any PARTY ↔ any PARTY
Ownership interest (Phase 2+, quantitative) ──► holder PARTY → held ORGANIZATION
```

Key invariants of the target model:

1. An entity exists **before** and **independently of** any licence.
2. "Licensed" is a **state** (licences held), never an entity type.
3. An entity may hold many licences across sectors simultaneously; each licence
   carries its own status while the entity keeps a single entity-domain stage.
4. Entity lifecycle, licence status and application status are three separate
   vocabularies (`lifecycle_stages.domain`) and are never merged. Withdrawal,
   refusal, restriction and suspension are application/licence facts.
5. Legal identity and regulatory status are separate concerns with separate
   owners (see `data_domains`); the default identity authority is
   `DEPLOYMENT_CONFIGURED` — an external registry is optional.
6. Non-regulated counterparties are representable without a licence.
7. Relationship types are typed edges; quantitative ownership (percentages,
   share classes, voting rights, effective control, history) is a separate
   Phase 2+ model, never a relationship attribute.
8. Machine keys are immutable; system vocabulary is retireable but never
   deletable; referenced configuration cannot be deleted.
9. Relationship and role semantics are configuration, not code.


## 2. Where the platform is today (measured Phase 0 baseline)

| Fact | Value |
| --- | --- |
| Entities (`licensees`) | 23 |
| Licences | 23 |
| Entities with no licence | 0 |
| Licences with no entity | 0 |
| Entity is bound to a single `license_id` column | Yes — blocks multi-licence |
| Possible duplicate entity names | 4 |
| Foreign keys referencing `licensees` | 43 |
| Applications | 122 |
| Applications with a pinned `form_version_id` | 0 of 122 |
| Registrations | 32 |
| `entity_relationships` rows / distinct type strings | 0 / 0 |
| Form templates / distinct `form_type` strings | 55 / 5 |

Consequences:

* **No entity-first model.** `licensees.license_id` makes the entity a
  projection of one licence. Multi-licence and cross-sector supervision cannot
  be expressed without a join table (Phase 2).
* **Large rename surface.** 43 inbound foreign keys mean any rename of
  `licensees` must ship behind a compatibility view.
* **Submission reproducibility gap.** No application pins a form version, so
  historical submissions are re-rendered against current schemas.
* **Semantics as strings.** Relationship types and form types are free text
  with no controlled vocabulary — now supplied by Phase 1 metadata.

## 3. External registry integration strategy

The platform must work with **no registry**, a **read-only registry**, or a
**registry that owns identity** — chosen per deployment, never assumed.

`entity_resolution_policies` expresses this:

| Mode | Legal identity owner | On no match |
| --- | --- | --- |
| `LOCAL_AUTHORITATIVE` (default) | This platform | Create local entity |
| `EXTERNAL_AUTHORITATIVE` | External registry | Block, or create via registry API |
| `HYBRID_AUTHORITY` | Registry preferred, local fallback | Allow provisional entity |

Resolution sequence for any incoming organisation (registration, application,
bulk import, API):

```text
normalise identifiers ──► exact identifier match? ──► reuse entity
        │ no
        ├──► registry lookup (if configured) ──► exact ──► reuse / link
        ├──► fuzzy name/identifier candidates ──► resolution case (never auto-merge)
        └──► no match ──► policy: create local | provisional | block | manual review
```

Failure handling is governed by `entity_registry_failure_policies`: when a
registry is unreachable the deployment either continues on the last verified
projection (with a staleness ceiling), blocks identity-affecting actions,
allows a provisional entity, or raises a manual review task. Silent success on
unverified identity is never an option.

Transport reuses the existing connector framework
(`supabase/functions/_shared/connector`, adapter `government_registry`), so a
sandbox provider becomes a live provider through Integration Manager
configuration, not code.

## 4. Phase 1 delivery (this release)

Configuration foundation only, all audit-logged and permission-gated:

`classification_schemes`, `classification_values`, `lifecycle_stages`,
`entity_identity_statuses`, `relationship_types`, `role_types`,
`form_purposes`, `form_trigger_types`, `data_domains`,
`entity_identifier_types`, `entity_resolution_policies`,
`entity_registry_failure_policies`.

Plus read-only diagnostics `rdm_integrity_report()` and
`rdm_diag_duplicate_entities()`, surfaced at
**Administration → Configuration → Regulatory Data Model**.

No existing table, workflow, route or RLS policy was modified.

## 5. Phase 1.1 hardening (this release)

Corrective, still configuration-only:

* Entity lifecycle cleaned: `withdrawn`, `restricted`, `suspended` retired as
  entity stages; `supervised_non_licensed` and `former_licensee` added; separate
  `license`- and `application`-domain vocabularies seeded.
* `data_domains.entity_identity.default_authority` → `DEPLOYMENT_CONFIGURED`.
* `entity_identifier_types.uniqueness_scope` (+ `scope_requires_jurisdiction`,
  `scope_requires_issuer`, `normalization_rule`); registration and taxpayer
  numbers are jurisdiction-scoped, LEI global, internal numbers regulator-scoped.
* `relationship_types.inverse_relationship_type_id` FK with a trigger keeping
  `inverse_key` (compatibility) and the reference consistent; unresolvable
  inverse keys are rejected.
* Machine `key` immutability, `is_system` immutability and delete protection
  enforced by DB triggers on all 12 tables; taxonomy FKs switched to
  `ON DELETE RESTRICT`.
* Exactly one active default resolution policy and one active default
  registry-failure policy (partial unique indexes) plus internal-consistency
  CHECK constraints (`ALLOW_PROVISIONAL` requires provisional entities;
  `ALLOW_LAST_VERIFIED` requires a positive staleness ceiling;
  `LOCAL_AUTHORITATIVE` cannot create via an external registry API).
* Governed write RPCs `rdm_save_metadata` / `rdm_retire_metadata` /
  `rdm_delete_metadata` (server-side `settings.edit` re-check) and a canonical
  audit taxonomy `regulatory_data.metadata.*`.
* RBAC decision: read remains `settings.view`, write remains `settings.edit`.
  Only `super_admin`, `system_administrator` and `legacy_admin` hold
  `settings.edit`, so this configuration is already restricted to platform
  administrators; a dedicated `regulatory_data_model` module is deferred to the
  phase that gives the model runtime effect.

Phase 2 is **not** started.
