## Problem

After the RBAC hardening pass, many `public.*` RLS policies were rewritten to require `has_permission(auth.uid(), <module>, <action>)` (or `has_scoped_permission`). Those permissions only exist on internal roles. External portal users (applicant / pre-license user, primary licensee user, secondary licensee user) don't hold them, so the same policies now block their own portal actions — even though every one of these tables already has an ownership predicate (`can_read_application`, `can_mutate_application`, `licensee_id ∈ user's assigned licensees`, `user_id = auth.uid()`, etc.).

Example just verified against the live DB:

- `applications_read` = `can_read_application(uid, id)` → applicants OK.
- `application_rfis_write` = `is_super_admin OR has_permission(application_management, edit|workflow_action)` → **applicants cannot respond to an RFI on their own application**.
- `application_rfi_responses_write` includes `can_mutate_application`, so responses are fine, but the parent `application_rfis` / `application_rfi_items` writes fall to `has_permission` only.
- Similar pattern shows up on rows we spot-checked in `fp_individuals`, licensee-user-owned records, etc.

`form_templates` was the same class of regression and has already been patched. This plan generalises the fix rather than chasing one table at a time.

## Guiding principle (to encode, not just apply once)

For every table used by an external portal, the RLS `USING` / `WITH CHECK` expression must be:

```
is_super_admin(uid)
  OR has_permission / has_scoped_permission(...)      -- internal path
  OR <ownership predicate for this table>              -- external path
```

External users are identified structurally by row ownership — `can_read_application`, `can_mutate_application`, `is_assigned_licensee_user(uid, licensee_id)`, `complainant_id = uid`, `submitted_by = uid`, `user_id = uid`, etc. — never by a permission flag. Frontend gating (`PortalRoute`, `INTERNAL_ROLES`) already follows this model; the DB layer must match.

## Scope of the fix

### 1. Inventory (read-only, one query)

Run one pg_policy sweep to list every `public` policy whose `qual` or `with_check` mentions `has_permission(` / `has_scoped_permission(` but does **not** mention any known external-ownership helper (`can_read_application`, `can_mutate_application`, `is_assigned_licensee_user`, `complainant_id`, `submitted_by`, `user_id`, `applicant_user_id`). Save the list — this is the audit surface.

### 2. Classify each hit into three buckets

- **Internal-only table** (e.g. `role_permissions`, `permission_modules`, `audit_logs`, `sla_configurations`, `notification_event_configs`, admin config tables) → leave as-is.
- **Applicant-owned table** (`applications`, `application_rfis`, `application_rfi_items`, `application_rfi_responses`, `application_legal_notes` for own app, `file_uploads` linked to own app, `payments` / `payment_receipts` / `payment_attachments` for own app, `registrations`, `registration_form_submissions`, `form_responses`, `documents` on own app) → add `can_mutate_application(uid, application_id)` (or `can_read_application` for read) to the OR chain.
- **Licensee-scoped table** (`returns_filed`, `return_form_data`, `return_documents`, `return_edit_requests`, `complaint_correspondence`, `complaint_evidence` on own complaint, `fp_individuals` / `fp_declarations` for the user's licensee, `licensee_channels`, `licensee_products`, `license_renewals`, `license_certificates` read, `notifications` for uid) → add `is_assigned_licensee_user(uid, licensee_id)` (existing helper — verify signature) or the row's own `user_id = auth.uid()` predicate.

### 3. Migration

One migration that, for each classified table, `DROP POLICY … ; CREATE POLICY …` with the extended OR chain. Deletes stay internal-only (matches product behaviour — external users cancel/withdraw via RPC, they don't `DELETE`). No new tables, no grant changes.

Where a suitable external-ownership helper does not yet exist (spot-check needed for `application_rfis`, `application_rfi_items`, `application_legal_notes`), reuse `can_mutate_application(uid, application_id)`; it already encodes primary/secondary licensee user access on top of the applicant.

### 4. Frontend / route guards

`PortalRoute` and `INTERNAL_ROLES` already keep external users out of the module-permission gate on public/portal routes, so no `src/hooks/usePermissions.ts` change is expected. Confirm by grepping for any portal-facing route or page that mounts a `PermissionRoute` / `PermissionGate` / `GuardedButton` requiring an internal module — if found, swap to `PortalRoute` / an ownership check.

### 5. Verification

- Re-run the flows the user cares about, signed in as each persona in staging:
    - Applicant: start pre-license application, upload documents, respond to RFI, make payment, view status.
    - Primary licensee user: submit a return, edit before cutoff, respond to compliance RFI, view certificates.
    - Secondary licensee user: same read paths, restricted mutations still governed by `can_mutate_application` / assignment flags.
- Add pgTAP cases under `supabase/tests/rbac/` that assert each patched policy allows the ownership path and still denies an unrelated authenticated user.
- Extend `src/test/personaMatrix.test.ts` with a "portal user without dynamic role" persona that walks the applicant + licensee happy paths and expects 200/OK.

## What this plan intentionally does NOT do

- Does not weaken internal `has_permission` gating. Every existing internal check stays; we only add the ownership branch.
- Does not grant blanket `anon` or authenticated `SELECT true` on any table.
- Does not touch delete policies or `SECURITY DEFINER` RPCs used for privileged operations.
- Does not modify `form_templates` again — the previous migration already handles it.

## Deliverables

- One SQL migration under `supabase/migrations/` recreating the affected policies with the added ownership branch.
- pgTAP tests covering each patched table (applicant path + negative test).
- Persona test additions in `src/test/personaMatrix.test.ts`.
- Short summary of tables changed and which ownership predicate was added to each.
