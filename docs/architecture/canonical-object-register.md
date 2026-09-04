# Canonical Object Register

Baseline HEAD: `302538690e0ad0090fc64cfaea31d7df52c864cb`
Mode: analysis only — no code, no migrations, nothing deleted.

Purpose: for every platform object, name **exactly one** canonical source, and list the
competing / legacy representations that must converge onto it. A representation listed as
`COMPETING` or `LEGACY` is not removed by this document; it is frozen for write purposes and
scheduled into a convergence wave (see `platform-master-implementation-plan.md`).

Measured baseline: 704 public tables, 55 views, 3,249 routines (1,846 `SECURITY DEFINER`),
1,260 RLS policies, 419 permissions across 58 modules, 145 registered routes.

## 1. Register

| Object | Canonical source | Canonical write path | Competing / legacy representations | Status |
|---|---|---|---|---|
| Party | `parties` (136 rows) | `rdm_*` / entity RPCs | `profiles`, `pre_license_users` hold party-like attributes | STRONG_BUT_NEEDS_CONVERGENCE |
| Person | `persons` (44 rows) | entity/F&P RPCs | `fp_individuals`-side person data, `profiles.full_name`, complaint/correspondence contact blobs | PARTIAL |
| Organisation | `organizations` | entity RPCs | `licensees` name/address columns, application `data` JSON | STRONG_BUT_NEEDS_CONVERGENCE |
| Regulated Entity | `licensees.id` (89 rows) — **the one entity key** | `entity_*` governed RPCs | `applications.entity_id` (FK, fine), `pre_license_users`, `entity_facts` snapshots | CANONICAL |
| Licence | `licenses` + `entity_licenses` (link) | `entity_link_license`, licence lifecycle RPCs | `licensee_products`, `license_actions`-derived state | CANONICAL |
| Application | `applications` (+ `application_form_requirements`, `application_rfis`) | `create_application_draft`, `provision_application_entity`, workflow RPCs | `registrations` + `registration_form_submissions` (separate journey), post-licence action forms | STRONG_BUT_NEEDS_CONVERGENCE |
| Filing | `return_filings` + `return_filing_versions` (immutable once submitted) | `returns_*` RPCs | `returns` / `return_form_data` / `return_due_dates` legacy family, `returns_legacy_mappings` classifies them | STRONG_BUT_NEEDS_CONVERGENCE |
| Assessment | `supervisory_assessment` (+ `_dimension`, `_response`) | `supervisory_assessment_*` RPCs, `supervisory_assessment_calculate` | `pfmi_*` assessment tables, `fp_assessments`, `application_ai_assessments` | STRONG_BUT_NEEDS_CONVERGENCE |
| Work Item | `supervisory_work_item` (view, `security_invoker=true`) + `supervisory_work_assignment` | `supervisory_work_item_assign`, `supervisory_work_queue` | per-module queues (`conduct_work_*`, prudential queue, `FpaManualTasks`, complaint intake queue) | STRONG_BUT_NEEDS_CONVERGENCE |
| Task | `engine_rule_tasks` + `approval_steps`/`approval_step_actions` | rule engine + approval RPCs | `fpa_manual_tasks`-style module tasks, ad-hoc "actions" tables | PARTIAL |
| Decision | `license_decisions`, `decision_artifacts`, `decision_authority_rules` | approval + decision RPCs | `fp_committee_decision_snapshots`, `conduct` decision columns, `rdm_migration_decisions` | PARTIAL |
| Plan | `supervisory_plan` (+ `supervisory_plan_templates`) | `supervisory_plan_*` RPCs | thematic review plan fields | CANONICAL |
| Intervention | `supervisory_intervention` | `supervisory_intervention_open` | `conduct` intervention register rows | STRONG_BUT_NEEDS_CONVERGENCE |
| Examination | `examinations` (+ scope/workpaper tables) | `supervisory_examination_open`, `examination_scope_from_assessment` | `inspections` / `inspection_findings` (RETIRED_EMPTY, writers dropped), `conduct_investigations` | CANONICAL |
| Finding | `findings` family | `supervisory_finding_create` | `inspection_findings` (retired), `fp_findings`, `conduct_findings` | STRONG_BUT_NEEDS_CONVERGENCE |
| Remediation | `remediation_actions` | finding remediation RPCs | conduct remediation register, licence `license_condition_evidence` | STRONG_BUT_NEEDS_CONVERGENCE |
| Enforcement Action | `enforcement_actions` (+ workflow stages/transitions) | `enforcement_management.*` RPCs | `license_actions` punitive variants, `penalty`-style columns | STRONG_BUT_NEEDS_CONVERGENCE |
| Document | `document_groups` (17) — logical document | `dms_*` RPCs only | `documents` (3 rows, LEGACY), `complaint_evidence`, `conduct_evidence`, `correspondence_attachments`, `fp-evidence`, `return-uploads`, payment documents | STRONG_BUT_NEEDS_CONVERGENCE |
| Document Version | `document_versions` (18) | `create_document_version_metadata`, `dms_register_certificate` | module attachment rows carrying their own version notion | CANONICAL |
| Physical file | `file_uploads` (19) + `file_upload_scan_events` | upload pipeline | direct storage paths written by module code | CANONICAL |
| Controlled Revision | **does not exist** | — | `notification_template_versions`, `form_versions`, `return_templates`, `supervisory_methodology` versioning are per-domain versioning, not document control | FUNCTIONAL_GAP |
| Communication | `correspondence_threads`/`_messages` (outbound/inbound record) and `notifications` (in-app) | correspondence + notification RPCs | `notification_outbox`, `notification_dispatch_log` (delivery evidence, correct), module-local email sends | STRONG_BUT_NEEDS_CONVERGENCE |
| Audit Event | `audit_logs` + `compliance_audit_logs` | trigger/RPC-written only | `return_audit_log`, `document_action_logs`, `correspondence_events`, `engine_rule_executions` (domain journals — keep, but must be discoverable as one timeline) | STRONG_BUT_NEEDS_CONVERGENCE |

## 2. Invariants carried forward

1. **One entity key**: `licensees.id`. No second regulated-entity identifier may be introduced.
2. **Licence ≠ identity**. Identifiers are typed, normalised (`normalize_entity_identifier`) and scoped.
3. **Domain business state is authoritative.** Workflow/task state never replaces the lifecycle of
   Application, Filing, Assessment, Document, Finding, Enforcement Action.
4. **One physical file → one logical document group → n versions.** A document reference
   (`DOC-YYYY-NNNNNN`) is written once and never rewritten.
5. **Every identity/decision state change is an RPC** with audit and provenance; no client table writes.
6. Menu visibility is discoverability only; RLS + RPC checks + route guards are enforcement.

## 3. Known violation of invariant 5 at this baseline

156 direct client write sites remain (`supabase.from(...).insert/update/upsert/delete`),
concentrated in: form builder (`form_versions`, `form_templates`, `form_fields`,
`field_conditions`), returns legacy (`return_form_data`, `return_due_dates`,
`return_validation_rules`, `return_comments`, `return_audit_log`), reports/`report_*`,
support tickets, `profiles`, `delegation_rules`, `notifications`, `workflow_instances`,
`licensees`. These are the W1/W9 convergence backlog; `return_audit_log` and `notifications`
written from the client are the two integrity-relevant ones.
