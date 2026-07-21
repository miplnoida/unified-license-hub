## Slice 3 — Returns RLS + storage lockdown

Scope: `returns_filed` + 15 return_* data child tables + `return-uploads` storage. Config/admin tables (return_configs, return_types, return_templates, return_cutoff_config, return_due_dates, return_form_versions, return_notification_templates, return_validation_rule[_versions], return_config_forms, return_configurations, return_template_downloads) remain deferred to Phase 4 per the RBAC change log.

### 1. Canonical helpers (new SECURITY DEFINER, `search_path=public`, `STABLE`)

- `public.can_read_return_filed(_user_id uuid, _return_id uuid) → boolean`
  Composes, in order: `is_super_admin` → `has_permission('returns_management','view_all_entities')` → `user_has_entity_assignment(_user, r.entity_id)` (mapped regulator, any status) → licensee membership (`profiles.licensee_id ∈ {entity_id, on_behalf_of_licensee_id}`) → PPOC (`ppoc_mapped_licensee_ids`) → external capability (`external_can_access_return_filed(_user, id, 'can_view_status' | 'can_submit_returns')`) → creator (`r.created_by = _user`).
- `public.can_read_return_filed_row(_user_id, _entity_id, _on_behalf uuid, _created_by uuid, _return_id uuid) → boolean`
  Value-form used inside `returns_filed` policies to avoid self-referencing subselects.
- `public.can_mutate_return_filed(_user_id uuid, _return_id uuid) → boolean`
  Owner during editable lifecycle (`workflow_status IN TEMP/WIP/TBR`) + `has_permission('returns_management','edit')` + super_admin + external `can_submit_returns`. Never grants mutate to assignment-only regulators.

Everything routes through `has_permission` — no `has_role` calls remain in the new policies.

### 2. `returns_filed` policy rewrite

Drop all 11 existing policies; replace with:

- **SELECT** `returns_filed_read` → `can_read_return_filed_row(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, id)`
- **INSERT** `returns_filed_insert` → creator = `auth.uid()` AND ( licensee-owner OR PPOC OR external-submit OR `has_permission('returns_management','create')` )
- **UPDATE** `returns_filed_update` → `can_mutate_return_filed(auth.uid(), id)`; `WITH CHECK` re-asserts same
- **DELETE** `returns_filed_delete` → `is_super_admin` OR `has_permission('returns_management','delete')`

Assignment-only regulators cannot mutate or insert; SELECT works for all statuses on mapped entities (matches the user's earlier correction).

### 3. Child data tables (15) — uniform pattern

| Table | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| return_form_data | `can_read_return_filed(uid, return_id)` | `can_mutate_return_filed(uid, return_id)` | mutate + super_admin |
| return_documents | same | mutate + `document_management.upload` for insert | mutate + `document_management.delete` |
| return_comments | same | `can_read_return_filed` + `performed_by = uid` | mutate |
| return_audit_log | same | `performed_by = uid` AND `can_read_return_filed` (append-only) | denied |
| return_data_revisions | same | mutate + `created_by = uid` | super_admin |
| return_calculated_ratios | same | `has_permission('returns_management','edit')` (system-populated) | super_admin |
| return_consolidated_analysis | `can_read_return_filed` OR `report_management.view` | `has_permission('returns_management','edit')` | super_admin |
| return_edit_requests | `can_read_return_filed` OR `has_permission('returns_management','workflow_action')` | requester = uid OR workflow_action | workflow_action |
| return_requests | same | workflow_action | workflow_action |
| return_notifications_log | `can_read_return_filed` | system/service-role only | denied |
| return_threshold_breaches | `can_read_return_filed` OR `report_management.view` | `edit` | super_admin |
| return_upload_attempts | `can_read_return_filed` OR uploader | `uploaded_by = uid` AND `can_mutate_return_filed` for return-scoped rows; entity-scoped rows require `edit` | super_admin |
| return_upload_imports | uploader OR `edit` | uploader | uploader OR super_admin |
| return_validation_run_log | `can_read_return_filed` | `edit` | super_admin |

`GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` and `GRANT ALL … TO service_role` re-asserted on each. `anon` grants dropped — none of these are public.

### 4. Storage — `return-uploads` bucket

Replace the three existing policies with authorized versions:

- **read**: object-name matches a `return_upload_attempts.storage_path` or `return_documents.file_path` whose parent return passes `can_read_return_filed`; OR uploader is the object owner; OR super_admin; OR `returns_management.view_all_entities`.
- **write (INSERT)**: `owner = auth.uid()` AND caller passes `can_mutate_return_filed` for the referenced return (path prefix parsed via `split_part(name,'/',1)::uuid` when the path encodes the return id) OR `has_permission('returns_management','edit')`.
- **delete**: object owner AND `can_mutate_return_filed`, OR super_admin.

All storage policies use the canonical helpers — no `has_role`.

### 5. pgTAP suite — `supabase/tests/rbac/40_returns_data_rls.sql`

Five personas seeded in a transaction:
1. super_admin
2. staff_with_view_all (`returns_management.view_all_entities`)
3. assignment_only_regulator (mapped to licensee A only)
4. licensee_primary_user (licensee A)
5. unrelated_authenticated (no rights)

Coverage per table (~60 assertions total): SELECT allowed/denied, INSERT allowed/denied, UPDATE allowed/denied, DELETE allowed/denied per persona. Explicit assertions:
- assignment-only regulator can SELECT return_form_data across all workflow statuses (TEMP/WIP/SUB/APR) for licensee A;
- assignment-only regulator **cannot** UPDATE or INSERT anything;
- assignment-only regulator sees nothing for licensee B.

### 6. Frontend impact

No frontend changes. All existing hooks/screens continue to work because policy semantics are preserved (creators, licensees, PPOC, external capability, view-all, mapped regulator) — only the underlying gate consolidates onto `has_permission` + canonical helpers.

### Deliverables

- `supabase/migrations/*_slice_3_returns_rls.sql`
- `supabase/tests/rbac/40_returns_data_rls.sql`
- `docs/rbac/change-log.md` — new Slice 3 section listing every dropped/created policy
- `docs/rbac/policy-inventory.md` — refreshed rows for the 16 tables + storage
