# Regulatory Data Naming Standard (RDM-ENTITY-001, Phase 0 / 1.1)

Status: **Approved standard, phased adoption.** Nothing in this document was
applied as a rename in Phase 0/1 — renames are Phase 2+ work with compatibility
views.

## 1. Party model (restored, canonical)

The regulated world is a **party** model. "Entity" is a specialisation, not the
root:

```text
PARTY (any legal or natural person known to the regulator)
├── ORGANIZATION (legal person)
│   ├── ENTITY            — organisation inside the regulatory perimeter
│   │   └── LICENSED ENTITY — an entity holding ≥ 1 licence (a state, not a type)
│   └── NON-REGULATED ORGANIZATION — auditor, agent, service provider, group parent
└── INDIVIDUAL (natural person)
```

Rules:

1. **Licensed is a state, never a type.** Nothing in the schema may encode
   "licensee" as an entity class; authorisation is expressed by licences held.
2. Counterparties that are not supervised (auditors, outsourcing providers,
   overseas group parents) are organisations, not entities, and must be
   representable without inventing a licence.
3. Relationships and role assignments are edges between **parties**, so an
   individual, an entity and a non-regulated organisation are all valid endpoints.

## 2. Vocabulary

| Concept | Standard term | Meaning | Current implementation |
| --- | --- | --- | --- |
| Any person known to the regulator | **Party** | Legal or natural person | (Phase 2 abstraction) |
| Legal person | **Organisation** | Company, society, statutory body — regulated or not | `public.licensees` (regulated subset only today) |
| Organisation in the perimeter | **Entity** | Organisation the regulator supervises, with or without a licence | `public.licensees` |
| Human being | **Individual** | A natural person holding a regulated role | `fp_individuals`, `profiles` |
| Authorisation | **Licence** | One authorisation held by an entity | `public.licenses` |
| Request for authorisation or change | **Application** | Case seeking a licence or a post-licence change | `public.applications` |
| Onboarding record | **Registration** | Pre-entity onboarding of an organisation + primary contact | `public.registrations` |
| Structured data collection | **Form** | Versioned instrument (template + version + response) | `form_templates`, `form_versions`, `form_responses` |
| Periodic submission | **Return** | Period-scoped reporting instance | `returns`, `return_submissions` |
| Link between parties | **Relationship** | Typed, dated edge between parties | `entity_relationships` |
| Role held by an individual | **Role assignment** | Typed appointment at an entity | `fp_individual_roles` |

Forbidden in new code: "licensee" as a synonym for *entity* (it presumes a
licence), "customer", "company", "org" as table or column names.

## 2a. Lifecycle vocabulary separation (mandatory)

Three vocabularies, never merged, distinguished by `lifecycle_stages.domain`:

| Domain | Owns | Examples |
| --- | --- | --- |
| `entity` | Existence in the perimeter | prospect, applicant, authorised, supervised_non_licensed, former_licensee, closed |
| `license` | Status of one authorisation | pending, active, restricted, suspended, expired, surrendered, revoked |
| `application` | Status of one case | draft, submitted, under_review, information_requested, approved, rejected, withdrawn |

`is_terminal` is terminal **within its own domain only**. A refused application
or a revoked licence never terminates the entity, and an entity holding several
licences keeps one entity stage while each licence carries its own status.
Restriction and suspension are licence facts, not entity facts.

## 2b. Ownership is not a relationship type

`relationship_types` with `is_ownership = true` express graph semantics only.
Shareholding percentages, share classes, voting rights, indirect/effective
control computation and beneficial-ownership history belong to a dedicated
ownership model (Phase 2+), never to the relationship row.


## 2. Naming rules

1. Tables are plural snake_case nouns: `entities`, `entity_identifiers`.
2. Foreign keys are `<singular_target>_id`: `entity_id`, `license_id`.
3. Booleans read as assertions: `is_active`, `requires_verification`,
   `blocks_licensing`.
4. Configurable vocabularies are `*_types`, `*_statuses`, `*_stages`,
   `*_policies` and always carry `key`, `label`, `sort_order`, `is_active`,
   `is_system`.
5. `key` is the stable machine identifier referenced by rules and workflows;
   `label` is display-only and freely editable.
6. Timestamps are `*_at` (timestamptz); dates are `*_on` or
   `effective_from` / `effective_to`.
7. No enum types for business vocabulary that a regulator may extend — use a
   metadata table plus FK.
8. Diagnostics and programme-scoped objects are prefixed `rdm_`.

## 3. Authority rules

* Legal identity attributes (legal name, registration number, incorporation
  date) are owned by whatever `data_domains.default_authority` says —
  `SUPTECH`, `EXTERNAL_REGISTRY`, or `DEPLOYMENT_CONFIGURED`.
* Regulatory status (lifecycle stage, licences, conditions) is **always**
  owned by this platform and never overwritten by an external registry.
* External registry data is stored as a *projection* with a verification
  timestamp; it never silently replaces a supervisory decision.

## 4. Migration discipline

* Additive first: new tables and columns, no destructive renames.
* Renames land with a compatibility view carrying the legacy name for at least
  one release.
* Every vocabulary migration ships a mapping from the legacy free-text values
  to the new `key` values, and a diagnostic count proving the mapping is total.
