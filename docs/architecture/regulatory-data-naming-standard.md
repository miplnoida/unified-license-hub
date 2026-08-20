# Regulatory Data Naming Standard (RDM-ENTITY-001, Phase 0)

Status: **Approved standard, phased adoption.** Nothing in this document was
applied as a rename in Phase 0/1 — renames are Phase 2+ work with compatibility
views.

## 1. Vocabulary

| Concept | Standard term | Meaning | Current implementation |
| --- | --- | --- | --- |
| Organisation known to the regulator | **Entity** | A legal person in the regulatory perimeter, with or without a licence | `public.licensees` |
| Human being | **Individual** | A natural person holding a regulated role | `fp_individuals`, `profiles` |
| Authorisation | **Licence** | One authorisation held by an entity | `public.licenses` |
| Request for authorisation or change | **Application** | Case seeking a licence or a post-licence change | `public.applications` |
| Onboarding record | **Registration** | Pre-entity onboarding of an organisation + primary contact | `public.registrations` |
| Structured data collection | **Form** | Versioned instrument (template + version + response) | `form_templates`, `form_versions`, `form_responses` |
| Periodic submission | **Return** | Period-scoped reporting instance | `returns`, `return_submissions` |
| Link between parties | **Relationship** | Typed, dated edge between entities/individuals | `entity_relationships` |
| Role held by an individual | **Role assignment** | Typed appointment at an entity | `fp_individual_roles` |

Forbidden in new code: "licensee" as a synonym for *entity* (it presumes a
licence), "customer", "company", "org" as table or column names.

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
