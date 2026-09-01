# Fix final approval FK failure on entity_licenses (database lifecycle, not Edge Function)

## Diagnostics (live definitions, confirmed now)

- `entity_licenses_entity_id_fkey` = `FOREIGN KEY (entity_id) REFERENCES licensees(id) ON DELETE RESTRICT` (plus `entity_licenses_unique_period UNIQUE (entity_id, license_id, effective_from)`).
- `trg_licensees_legacy_license_id` = `BEFORE INSERT OR UPDATE OF license_id ON public.licensees FOR EACH ROW EXECUTE FUNCTION enforce_licensee_license_id_legacy()`.
- `enforce_licensee_license_id_legacy()` does two things: (a) rejects non-trusted writes to the deprecated `licensees.license_id`, and (b) — the defect — inserts into `public.entity_licenses (entity_id, license_id, effective_from)` using `NEW.id` while still in the BEFORE INSERT phase.
- `entity_link_license(entity, license, application)` is the canonical writer: it asserts the entity exists in `licensees`, is idempotent on `(entity_id, license_id)`, sets `is_primary`/`source='LICENCE_ISSUANCE'`, and rebinds `applications.entity_id`.
- `provision_application_entity(uuid)` creates the licence, resolves or creates the canonical entity (party → organizations upsert → `licensees` insert **with `license_id` set**), then calls `entity_link_license(...)`.
- `perform_final_workflow_approval()` reaches this through `perform-workflow-action`; no change needed there.
- Other `entity_licenses` writers found in the live database: `entity_link_license` (canonical) and `entity_attach_license` (no production caller — only referenced by itself). Remaining references in `scripts/` and `supabase/tests/` are fixture/verification only.
- Functions that write `public.licensees`: `provision_application_entity`, `entity_create_local`, `entity_merge_execute`, `entity_identifier_verify`, `entity_set_publication_policy`, `apply_entity_change_set`, `entity_change_set_transition`, `cert_v2_seed_entities`. Only `provision_application_entity` populates `license_id`, and it already calls `entity_link_license` immediately afterwards.

## Root cause

New-entity approval inserts the `licensees` row with the legacy `license_id` populated. The BEFORE INSERT trigger fires before the parent row is physically present, then inserts a child `entity_licenses` row pointing at `NEW.id`, so `entity_licenses_entity_id_fkey` has no parent to reference and the transaction aborts with a 500 at `perform-workflow-action`. Existing-entity approvals never hit it, which is why the failure looked intermittent and why earlier changes around `entity_for_license` / `v_entity_id` (which only fix *which* entity id is used) never removed it.

## Fix

1. Redefine `enforce_licensee_license_id_legacy()` to be validation/protection only: keep the `LEGACY_COLUMN_READ_ONLY` guard for untrusted writes to `licensees.license_id`, and delete the child `entity_licenses` insert entirely. Trigger timing stays BEFORE (correct for a guard).
2. No AFTER mirror trigger is added. The legacy mirror is not required: the only production writer that sets `licensees.license_id` is `provision_application_entity`, which already performs canonical linkage via `entity_link_license` after the parent exists. Adding an AFTER mirror would only create a second competing writer with different `effective_from`/`source` semantics.
3. Leave `entity_licenses_entity_id_fkey` exactly as it is — not dropped, not weakened, not deferred.
4. `entity_attach_license` is left in place but documented as non-runtime (no callers); `entity_link_license` is the single authoritative runtime writer.
5. No change to `perform-workflow-action`, readiness gates, maker/checker, payment validation, or entity resolution.
6. Backfill check: report (and link via `entity_link_license`) any existing `licensees` row that has `license_id` set but no matching `entity_licenses` row, so removing the mirror leaves no gap.

## Verification

New file `scripts/verify-entity-license-provisioning.sql`, rollback-scoped (`BEGIN … ROLLBACK`), asserting:

- direct reproduction: trusted-context insert of a `licensees` row carrying `license_id` succeeds with zero FK violations;
- parent ordering: the `licensees` row exists before any `entity_licenses` row for it;
- new-entity path through `provision_application_entity` on a seeded approved+paid application: licence created, one `licensees` row, exactly one `entity_licenses` row whose `entity_id` matches that `licensees.id`;
- existing-entity path: entity reused, no duplicate `licensees` row, licence linked;
- multiple licences: one entity, two `entity_licenses` rows;
- idempotency: re-running provisioning creates no duplicate licence, licensee, or link;
- the governed path `perform_final_workflow_approval` exercised on the seeded application, not only the helpers;
- final counts: duplicate `entity_licenses` rows = 0, dangling `entity_licenses.entity_id` = 0.

Then re-run the existing licensing regressions (`scripts/verify-licensing-readiness-reconciliation.sql`, `scripts/verify-edge-authz.mjs`), typecheck, and build, and return the requested A–V report.
