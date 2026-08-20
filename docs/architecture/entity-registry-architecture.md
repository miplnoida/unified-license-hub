# Entity & External Registry Architecture (RDM-ENTITY-001, Phase 0/1)

## 1. Target model

```text
Individual ──role assignment──┐
                              ▼
Entity (legal person) ──1..n── Licence ──1..n── Condition
   │  │                            │
   │  ├── Entity Identifier (n)    └── Application (initial / post-licence)
   │  ├── Identity Status (1)
   │  ├── Lifecycle Stage (1)
   │  ├── Classification Value (n, per scheme)
   │  └── Relationship (n, typed, dated) ──► Entity | Individual
```

Key invariants of the target model:

1. An entity exists **before** and **independently of** any licence.
2. An entity may hold many licences across sectors simultaneously.
3. Legal identity and regulatory status are separate concerns with separate
   owners (see `data_domains`).
4. Relationship and role semantics are configuration, not code.

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
