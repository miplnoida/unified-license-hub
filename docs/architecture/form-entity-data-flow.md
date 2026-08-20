# Form → Entity Data Flow & Lineage (RDM-ENTITY-001, Phase 0)

## 1. Current flow

```text
Registration form ──► registrations ──► approval ──► profiles + licensees (entity)
                                                        │
Pre-licence form ───► applications ──► workflow ──► licenses ──► licensees.license_id
                                                        │
Post-licence form ──► applications (post_license) ──► license_actions
Return form ────────► return_submissions ──► return_field_values
Fit & Proper form ──► fp_individuals + fp_individual_roles
```

## 2. Lineage findings (Phase 0)

| Finding | Evidence | Impact | Resolution phase |
| --- | --- | --- | --- |
| Applications do not pin the form version used | 122 of 122 applications have `form_version_id IS NULL` | Historical submissions re-render against the current schema | Phase 2 (backfill + not-null) |
| Entity is created only at licence approval | `licensees.license_id` is set on approval | An organisation with a rejected application leaves no entity trail | Phase 2 (entity-first) |
| Form semantics carried as `form_type` strings | 5 distinct values across 55 templates | No governed meaning, no trigger semantics | Phase 1 metadata, Phase 3 adoption |
| Relationship semantics uncontrolled | `entity_relationships` uses free-text `relationship_type` (0 rows today) | Group/ownership views cannot be reasoned about | Phase 1 metadata, Phase 2 FK |
| Duplicate entity names present | 4 normalised names with more than one entity | Ambiguous supervisory identity | Phase 2 resolution cases |

## 3. Target lineage contract

Every captured value must be traceable to:

1. the **form version** it was captured under (`form_version_id`, pinned at
   submission and immutable),
2. the **entity** it describes (`entity_id`, resolved through the entity
   resolution policy, never inferred from the submitting user alone),
3. the **purpose** and **trigger** of the collection (`form_purposes`,
   `form_trigger_types`),
4. the **data domain** it belongs to, which determines who is authoritative
   for it (`data_domains`),
5. an **audit event** for the create/change, with actor and correlation id.

## 4. Field-level mapping rule

A form field that populates a regulatory attribute declares its target
explicitly (data domain + attribute key). Where the target domain's authority
is `EXTERNAL_REGISTRY`, the submitted value is treated as a *claim* pending
verification and cannot overwrite a verified projection — it raises a
discrepancy for supervisory attention instead.

## 5. Sequencing

* Phase 1 (done): configurable purposes, triggers, domains, identity policy.
* Phase 2: entity-first model, `entity_licenses`, resolution cases, version
  pinning backfill.
* Phase 3: forms declare purpose/trigger and field-to-attribute targets;
  legacy `form_type` becomes a derived compatibility field.
