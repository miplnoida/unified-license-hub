# Shared Platform Services (Kernels)

Baseline HEAD: `302538690e0ad0090fc64cfaea31d7df52c864cb`. Analysis only.

A *kernel* is a capability every module must consume rather than reimplement. For each kernel:
what exists today, what is authoritative, and what must converge.

## K1 — Identity & Entity Kernel — CANONICAL

- Sources: `parties`, `organizations`, `persons`, `licensees`, `entity_licenses`,
  `entity_identifiers` (+ typed/normalised identifier machinery), `entity_relationships`,
  `entity_user_memberships`, resolution/merge (`entity_resolve_identity`,
  `entity_merge_preview/execute`, `merged_into_entity_id` lineage).
- Frontend contract: `src/services/entityRegistry.ts`. Modules must not query `licensees` /
  `entity_*` directly for identity.
- Converge: `persons` vs F&P individual records; contact blobs in complaints/correspondence.

## K2 — Security Kernel (RBAC / scope / membership) — CANONICAL

- Sources: `sec_*` (58 modules, 419 permissions, 145 routes, role templates + materialised roles),
  `sec_get_user_context()` as the single read for roles, permissions, scopes, routes, navigation.
- External access is by **approved membership capability**, never by role name.
- Legacy `app_role` is reduced to an audience projection only.
- Converge: 25 tables in the security space still include the pre-`sec_` generation
  (`roles`, `permissions`, `role_permissions`, `user_roles`, `role_types`,
  `sec_legacy_permission_map`) — read-compat only, must stay non-authoritative.

## K3 — Work & Coordination Kernel — STRONG_BUT_NEEDS_CONVERGENCE

- Sources: `supervisory_work_item` (view, `security_invoker=true`), `supervisory_work_assignment`,
  `supervisory_work_type`, `supervisory_work_queue`, `supervisory_work_item_assign`,
  `workflow_templates` (2) / `workflow_instances` (60), `approval_workflows` +
  `approval_workflow_versions` + `approval_steps` + `approval_step_actions`,
  `decision_authority_rules`, `delegation_rules`, `sla_configurations` +
  `sla_stage_instances`/`sla_stage_events` + `sla_escalation_tiers`/`_dispatches`,
  `escalations` + `escalation_rules`/tier & ownership events, `engine_rules` (+ versions,
  executions, tasks, alerts, suppressions).
- **Rule: coordination state is derived; domain state is authoritative.** The work item is a
  *pointer with an SLA and an owner*, not the lifecycle of the underlying record.
- Converge: module-local queues (conduct work queue, prudential work queue, F&P manual tasks,
  complaint intake queue, enforcement work queue) must project into `supervisory_work_item`
  instead of holding a private notion of "my work".

## K4 — Document & Records Kernel — STRONG_BUT_NEEDS_CONVERGENCE (control layer missing)

- K4 is an **enterprise document platform**, not a business module: business domains own document
  and evidence requirements, relationships and decisions — never content, storage, provider ids or
  a module-local canonical document. Final provider-neutral lock:
  `docs/dms/05-enterprise-document-platform-provider-architecture.md`.
- Control-plane sources (platform-owned, provider-independent): `document_groups` /
  `document_versions` / `document_action_logs`, `document_categories` / `document_types` /
  `classification_*`, `document_relationships`, `document_retention_policies`, `document_holds`,
  `document_extractions`; 34 governed `dms_*` RPCs; frontend contract `src/services/dms.ts`.
- Internal-provider sources (implementation, **not** provider-neutral): `file_uploads` + scan
  events, the `secure-documents` bucket, signed URLs. `file_uploads` is the internal provider's
  object record, not the universal physical-document truth; no new business module may depend on it.
- Missing: provider binding + provider resolution (one active provider per regulator, capability
  negotiation), and controlled-document lifecycle, controlled revisions, review/approval policy per
  document type, effective-dating, acknowledgement. See `docs/dms/03_document-control-master-architecture.md`.
- Access/linking/search contract (DocumentPicker, RecordPicker, action semantics, context
  propagation, filing exceptions, scale): `docs/dms/04_document-access-linking-search-contract.md`.
- Converge: legacy `documents` (3 rows), module-local evidence stores, `secureUpload` callers.
  Target: zero module-owned document repositories.

## K5 — Communication Kernel — STRONG_BUT_NEEDS_CONVERGENCE

- Sources: `notification_event_configs` + `notification_templates`/`_template_versions` +
  `notification_event_channel_templates`, `notification_outbox`, `notification_event_queue`,
  `notification_dispatch_log` (delivery evidence — never purged), digests, preferences;
  `correspondence_threads`/`_messages`/`_participants`/`_events`/`_dispatches`,
  `correspondence_routing_rules`, `correspondence_templates`.
- Rule: notifications are *operational prompts*; correspondence is a *regulatory record* and
  its attachments must be canonical documents.
- Converge: `notifications` is still inserted directly from the client in two places.

## K6 — Forms & Rules Kernel — STRONG_BUT_NEEDS_CONVERGENCE

- Sources: `form_templates` / `form_versions` / `form_fields` / `form_field_definitions`
  (with `regulatory_metric_id` binding measurement identity), `form_packages`,
  `form_applicability_rules`, `form_responses` / `form_submission_values`, `engine_rules`.
- Converge: the form builder writes `form_templates`/`form_versions`/`form_fields`/
  `field_conditions` directly from the browser (≈20 sites) — the largest remaining
  non-governed write surface on the platform.

## K7 — Audit & Evidence Kernel — STRONG_BUT_NEEDS_CONVERGENCE

- Sources: `audit_logs`, `compliance_audit_logs` (immutable), plus domain journals
  (`document_action_logs`, `return_audit_log`, `correspondence_events`,
  `engine_rule_executions`, `entity_resolution_events`, `supervisory_methodology_event`).
- Rule: domain journals stay, but one read model must present them as a single
  entity/record timeline (the W2 supervisory timeline already proves the pattern).
- Converge: `return_audit_log` inserted from the client (2 sites).

## K8 — Read-Model / Listing Kernel — CANONICAL (recently hardened)

- Server paging RPC contract: 1-based page, sizes 10/25/50/100 (max 100), whitelisted sort and
  filter keys, nulls last, deterministic id tie-break, `total_count` from the same filtered
  population, never fabricated. Reference implementation: the five AML registers
  (`aml_assessment_page`, `aml_portfolio_page`, `aml_work_queue_page`, `aml_examination_page`,
  `aml_finding_page`).
- Frontend: `src/components/shared/listing/*` — `useListingState` (URL-persisted q/filters/
  sort/dir/page/pageSize, implicit-default vs explicit sort), `useServerPageGuard`
  (owner-level invalid-page repair), `SortableHeader`, `PaginationBar`, `DataTableShell`,
  `SupervisoryRegister`.
- Converge: ~132 bespoke `<Table>` registers still client-bounded.

## K9 — Configuration & Master Data Kernel — CANONICAL

- `master_data_types`, classification schemes/values, taxonomy hierarchy, methodology
  configuration, thresholds/rules seeds under `supabase/baseline/seed/`.
- Rule: no domain constant in TypeScript that duplicates a configuration table.

## K4 addendum — canonical document ingestion (W1A.2)

The Document & Records Kernel now has one canonical ingestion contract:
`dms_ingest_begin` → controlled storage write → `dms_ingest_finalize`, consumed
only through `src/services/dmsIngest.ts` (`beginDocumentIngest`,
`finalizeDocumentIngest`, `uploadNewDocument`, `uploadNewVersion`). Consumers know
nothing about buckets, `file_uploads`, `document_groups`, version allocation or
relationship schema.

Convergence inventory for upload paths:

| Path | Classification | Status |
| --- | --- | --- |
| `dms_ingest_begin` / `dms_ingest_finalize` | CANONICAL | Mandatory for all new document upload flows |
| `secureUpload` | LEGACY TRANSPORT | Existing callers operational; never a document-registration operation |
| `uploadVersionedDocument` / `create_document_version_metadata` | DOMAIN COMPATIBILITY (Form Management) | Preserved; converge in a later wave |
| `dms_register_certificate` | SPECIAL-PURPOSE | Licence certificates only |

Ingest staging (`public.dms_ingest_sessions`) is server-written; browsers hold read
access to their own sessions only. Verifier: `scripts/verify-w1a2-dms-ingest.sql`.
