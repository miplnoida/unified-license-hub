# Permission Coverage Matrix

_Generated 2026-08-28T21:32:10.659Z. Do not edit by hand — run `bunx tsx scripts/generate-permission-coverage.ts`._

**Total permissions:** 378  `|`  **Orphaned:** 169

Coverage classes:

- 🟢 **Enforced** — appears in at least one UI surface **and** at least one backend surface (RLS / RPC / storage).
- 🔵 **Backend only** — enforced by RLS / RPC / storage but no UI surface uses it. Safe, but the button that would trigger it is missing.
- 🟡 **UI only** — a menu / route / button / report references it but no RLS / RPC / storage guard enforces it server-side. Frontend gate only — not security.
- 🔴 **Orphaned** — used nowhere. Cannot be assigned to a role (server trigger `permission_orphaned` blocks it).

## Orphaned permissions

These permissions exist in the `permissions` catalog but have no enforcement path anywhere. Either wire them up, or set `permissions.enforced = false` to make the intent explicit.

| Module | Action |
| --- | --- |
| `ai_management` | `create` |
| `ai_management` | `execute` |
| `aml_supervision` | `approve` |
| `aml_supervision` | `edit` |
| `application_management` | `delete` |
| `application_management` | `manage_config` |
| `application_management` | `reject` |
| `complaint_management` | `analytics` |
| `complaint_management` | `approve` |
| `complaint_management` | `assess_jurisdiction` |
| `complaint_management` | `assign` |
| `complaint_management` | `close` |
| `complaint_management` | `decide_jurisdiction` |
| `complaint_management` | `escalate` |
| `complaint_management` | `investigate` |
| `complaint_management` | `override_triage` |
| `complaint_management` | `refer` |
| `complaint_management` | `resolve` |
| `complaint_management` | `retry_triage` |
| `complaint_management` | `review_vulnerability` |
| `complaint_management` | `submit` |
| `complaint_management` | `upload_documents` |
| `complaint_management` | `view_status` |
| `complaint_type` | `create` |
| `complaint_type` | `edit` |
| `compliance_management` | `create` |
| `compliance_management` | `delete` |
| `compliance_management` | `manage_config` |
| `compliance_management` | `respond` |
| `compliance_management` | `view_audit_logs` |
| `coordination` | `admin` |
| `coordination` | `create` |
| `coordination` | `delete` |
| `coordination_cases` | `approve` |
| `coordination_cases` | `create` |
| `coordination_cases` | `edit` |
| `coordination_cases` | `override` |
| `coordination_cases` | `view` |
| `coordination_escalations` | `approve` |
| `coordination_escalations` | `create` |
| `coordination_escalations` | `edit` |
| `coordination_escalations` | `override` |
| `coordination_escalations` | `view` |
| `coordination_flags` | `approve` |
| `coordination_flags` | `create` |
| `coordination_flags` | `edit` |
| `coordination_flags` | `override` |
| `coordination_flags` | `view` |
| `coordination_messages` | `approve` |
| `coordination_messages` | `create` |
| `coordination_messages` | `edit` |
| `coordination_messages` | `override` |
| `coordination_messages` | `view` |
| `enforcement_management` | `close` |
| `enforcement_management` | `delete` |
| `enforcement_management` | `edit` |
| `enforcement_management` | `impose_sanction` |
| `enforcement_management` | `issue_notice` |
| `entity_membership` | `manage` |
| `entity_membership` | `request` |
| `entity_structure` | `propose` |
| `entity_structure` | `review` |
| `entity_structure` | `view_history` |
| `executive_oversight` | `drill_into_cases` |
| `executive_oversight` | `receive_ai_insights` |
| `executive_oversight` | `view_all_dashboards` |
| `executive_oversight` | `view_all_reports` |
| `executive_oversight` | `view_cross_module_audit` |
| `fee_management` | `create` |
| `fit_and_proper` | `admin` |
| `fit_and_proper` | `delete` |
| `fit_and_proper` | `update` |
| `fit_and_proper` | `view_status` |
| `fit_and_proper_appeals` | `approve` |
| `fit_and_proper_appeals` | `create` |
| `fit_and_proper_appeals` | `edit` |
| `fit_and_proper_appeals` | `override` |
| `fit_and_proper_appeals` | `view` |
| `fit_and_proper_committee` | `provide_rationale` |
| `fit_and_proper_conditions` | `override` |
| `fit_and_proper_conditions` | `view` |
| `fit_and_proper_determinations` | `create` |
| `fit_and_proper_determinations` | `edit` |
| `fit_and_proper_determinations` | `override` |
| `fit_and_proper_initiation` | `manage_initiation_types` |
| `fit_and_proper_initiation` | `view` |
| `fit_and_proper_monitoring` | `approve` |
| `fit_and_proper_monitoring` | `override` |
| `fit_and_proper_monitoring` | `view` |
| `fit_and_proper_screening` | `create` |
| `fit_and_proper_screening` | `issue_determination` |
| `fit_and_proper_screening` | `manage_conditions_monitoring` |
| `fit_and_proper_screening` | `run_ai_analysis` |
| `form_management` | `manage_applicability` |
| `form_management` | `manage_packages` |
| `inspection_management` | `create` |
| `inspection_management` | `delete` |
| `integration_management` | `test_connection` |
| `integration_management` | `view` |
| `integration_management` | `view_health` |
| `license_appeals` | `view_all_entities` |
| `license_management` | `create` |
| `license_management` | `delete` |
| `licensee_management` | `create` |
| `licensee_management` | `delete` |
| `licensee_management` | `manage_pre_license` |
| `licensee_management` | `manage_products_channels` |
| `licensing` | `add_legal_notes` |
| `licensing` | `approve` |
| `licensing` | `conditional_approve` |
| `licensing` | `flag_concern` |
| `licensing` | `issue_digital_license` |
| `licensing` | `override_ai_recommendation` |
| `licensing` | `recommend_conditions` |
| `licensing` | `reject` |
| `licensing` | `respond_rfi` |
| `licensing` | `sign_enforcement_order` |
| `licensing` | `upload_documents` |
| `licensing` | `view_status` |
| `market_conduct` | `issue_enforcement_action` |
| `market_conduct_investigation` | `access_investigation_workspace` |
| `market_conduct_investigation` | `conduct_interviews` |
| `market_conduct_investigation` | `manage_evidence_repository` |
| `market_conduct_investigation` | `prepare_investigation_report` |
| `market_conduct_investigation` | `view` |
| `notification_management` | `manage_events` |
| `notification_management` | `manage_templates` |
| `operational_resilience` | `approve` |
| `operational_resilience` | `edit` |
| `operational_resilience` | `view_confidential` |
| `prudential_payment_systems` | `conduct_pfmi_assessment` |
| `prudential_payment_systems` | `manage_payment_workflow` |
| `prudential_payment_systems` | `oversee_msb` |
| `prudential_payment_systems` | `supervise_fmi` |
| `prudential_payment_systems` | `view` |
| `prudential_supervision` | `delete` |
| `prudential_supervision` | `manage_examination` |
| `prudential_supervision` | `review_returns` |
| `prudential_supervision` | `run_analytics` |
| `prudential_supervision` | `set_ewi_rules` |
| `prudential_supervision` | `signoff_workpaper` |
| `registration_management` | `create` |
| `registration_management` | `reject` |
| `regulatory_data_model` | `manage` |
| `regulatory_data_model` | `view` |
| `regulatory_requests` | `approve` |
| `regulatory_requests` | `assign` |
| `regulatory_requests` | `close` |
| `regulatory_requests` | `create` |
| `regulatory_requests` | `reject` |
| `regulatory_requests` | `review` |
| `returns_management` | `create` |
| `returns_management` | `respond_rfi` |
| `returns_management` | `upload_documents` |
| `returns_management` | `view_status` |
| `role_management` | `assign_role` |
| `rule_engine` | `manage_alerts` |
| `rule_engine` | `manage_tasks` |
| `rule_engine` | `restore_versions` |
| `rule_engine` | `test` |
| `rule_engine` | `view_alerts` |
| `rule_engine` | `view_executions` |
| `rule_engine` | `view_tasks` |
| `rule_engine` | `view_versions` |
| `support_management` | `resolve` |
| `support_management` | `respond` |
| `support_management` | `update` |
| `workflow_management` | `create` |
| `workflow_management` | `delete` |

## `admin_dashboard`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:80`) | 1 (`src/routes/adminRoutes.tsx:97`) | — | — | 2 (`supabase/migrations/20260820200412_4acd24ab-8d21-4dec-984b-caa54559bd5a.sql:311` + 1 more) | — | — |

## `ai_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟡 UI only | — | — | 10 (`src/pages/governance/ai/AiAssuranceDetail.tsx:314` + 9 more) | — | — | — | — |
| `assure` | 🟡 UI only | — | — | 4 (`src/pages/governance/ai/AiActivityDetail.tsx:41` + 3 more) | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟡 UI only | — | — | 5 (`src/pages/governance/ai/AiSurfaces.tsx:115` + 4 more) | — | — | — | — |
| `execute` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:195` + 1 more) | 11 (`src/routes/dashboardRoutes.tsx:287` + 10 more) | — | — | 2 (`supabase/migrations/20260826135819_8184cbfb-7ab9-4681-8978-f0d5b21409cf.sql:239` + 1 more) | — | — |

## `aml_supervision`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:29`) | — | — |
| `view_confidential` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:30`) | — | — |

## `application_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 3 (`src/components/applications/LegalReferralPanel.tsx:221` + 2 more) | — | 3 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:119` + 2 more) | — | — |
| `close` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260722073323_c907f29d-9cb6-4dd0-877b-7b0c5f183e47.sql:16`) | — | — |
| `configure` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260722073323_c907f29d-9cb6-4dd0-877b-7b0c5f183e47.sql:59`) | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 9 (`supabase/migrations/20260723080512_f3001359-6117-4c88-8560-e6411ac17af2.sql:22` + 8 more) | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟢 Enforced | — | — | 4 (`src/pages/applications/ApplicationDetail.tsx:1218` + 3 more) | — | 15 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:39` + 14 more) | — | — |
| `escalate` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260722073617_7076a327-f3e3-4a3c-a8e3-de37799972a6.sql:52`) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`src/pages/applications/ApplicationsList.tsx:508`) | — | — |
| `import` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260722073323_c907f29d-9cb6-4dd0-877b-7b0c5f183e47.sql:100`) | — | — |
| `manage_config` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820183504_d7a95be9-ba48-480b-a4b8-4557522352f7.sql:93` + 1 more) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:121` + 1 more) | 4 (`src/routes/adminRoutes.tsx:196` + 3 more) | — | — | 4 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:20` + 3 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:14`) | — | — |
| `workflow_action` | 🟢 Enforced | — | — | 2 (`src/components/applications/LegalReferralPanel.tsx:166` + 1 more) | — | 8 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:40` + 7 more) | — | — |

## `audit_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `export` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260807143504_e0e38f7f-5b9f-466f-bb2a-d1301289eac0.sql:34` + 4 more) | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260807143504_e0e38f7f-5b9f-466f-bb2a-d1301289eac0.sql:33` + 1 more) | — | — |

## `complaint_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `analytics` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `approve_rfi` | 🟡 UI only | — | — | 2 (`src/pages/complaints/rfi-approvals/RfiApprovalQueue.tsx:38` + 1 more) | — | — | — | — |
| `assess_jurisdiction` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `assign` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `close` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/functions/bulk-intake/index.ts:31`) | — | — |
| `decide_jurisdiction` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟡 UI only | — | — | 10 (`src/components/complaints/ClosureQaPanel.tsx:388` + 9 more) | — | — | — | — |
| `escalate` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `investigate` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override_triage` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `refer` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `resolve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `retry_triage` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review_vulnerability` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `triage` | 🔵 Backend only | — | — | — | — | 1 (`supabase/functions/evaluate-complaint-triage/index.ts:192`) | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 4 (`src/config/navigation.tsx:158` + 3 more) | 8 (`src/routes/dashboardRoutes.tsx:234` + 7 more) | — | — | 2 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:28` + 1 more) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `complaint_type`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:162`) | 1 (`src/routes/adminRoutes.tsx:188`) | — | — | — | — | — |

## `compliance_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:62` + 1 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`src/pages/admin/ComplianceAuditLogs.tsx:268`) | — | — |
| `manage_config` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `respond` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:31`) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:30`) | — | — |
| `view_audit_logs` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:63`) | — | — |

## `coordination`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `update` | 🔵 Backend only | — | — | — | — | 6 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:335` + 5 more) | — | — |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:319`) | 2 (`src/routes/dashboardRoutes.tsx:264` + 1 more) | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:40`) | — | — |

## `coordination_cases`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `coordination_escalations`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `coordination_flags`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `coordination_messages`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `correspondence_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260803054710_407cb6cc-5be1-4879-b634-2a2edc95a51c.sql:130` + 4 more) | — | — |
| `dispatch` | 🔵 Backend only | — | — | — | — | 1 (`supabase/functions/send-correspondence/index.ts:54`) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260803054937_ec0af289-292d-4821-9fe8-5eb094025c82.sql:225` + 1 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`src/pages/correspondence/CorrespondenceRecords.tsx:28`) | — | — |

## `employee_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820200412_4acd24ab-8d21-4dec-984b-caa54559bd5a.sql:313` + 1 more) | — | — |

## `enforcement_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `close` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:435` + 2 more) | — | — |
| `decide` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260821111826_e057c9d6-9565-4b2f-bed6-68ae87eb17e6.sql:209` + 2 more) | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `impose_sanction` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `issue_notice` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `refer` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260821111826_e057c9d6-9565-4b2f-bed6-68ae87eb17e6.sql:108` + 2 more) | — | — |
| `view` | 🟢 Enforced | — | 2 (`src/routes/dashboardRoutes.tsx:266` + 1 more) | — | — | 6 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:27` + 5 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:26` + 3 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260823145058_b857e819-58d2-4886-a3c1-a1c46af7aef3.sql:28`) | — | — |

## `entity_membership`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 1 (`src/pages/admin/EntityMemberships.tsx:63`) | — | 4 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:179` + 3 more) | — | — |
| `manage` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `request` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `revoke` | 🟢 Enforced | — | — | 1 (`src/pages/admin/EntityMemberships.tsx:64`) | — | 1 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:211`) | — | — |
| `verify` | 🟢 Enforced | — | — | 1 (`src/pages/admin/EntityMemberships.tsx:62`) | — | 2 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:164` + 1 more) | — | — |
| `view` | 🟢 Enforced | — | 1 (`src/routes/dashboardRoutes.tsx:383`) | — | — | 2 (`supabase/migrations/20260820085845_9da2e82d-fe9e-4d72-909b-4b1f0ab25894.sql:699` + 1 more) | — | — |

## `entity_resolution`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 1 (`src/pages/licensing/EntityResolutionDetail.tsx:103`) | — | 7 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:428` + 6 more) | — | — |
| `escalate` | 🟢 Enforced | — | — | 1 (`src/pages/licensing/EntityResolutionDetail.tsx:102`) | — | 2 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:422` + 1 more) | — | — |
| `merge` | 🟢 Enforced | — | — | 1 (`src/pages/licensing/EntityResolutionDetail.tsx:104`) | — | 1 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:492`) | — | — |
| `resolve` | 🟢 Enforced | — | — | 1 (`src/pages/licensing/EntityResolutionDetail.tsx:101`) | — | 4 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:394` + 3 more) | — | — |
| `verify` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:417` + 1 more) | — | — |
| `view` | 🟢 Enforced | — | 2 (`src/routes/dashboardRoutes.tsx:381` + 1 more) | — | — | 4 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:462` + 3 more) | — | — |

## `entity_structure`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apply` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260828204339_5e446caa-f809-4f74-b7f8-0343ede5f2e4.sql:263`) | — | — |
| `approve` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260828204339_5e446caa-f809-4f74-b7f8-0343ede5f2e4.sql:264`) | — | — |
| `propose` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:14` + 4 more) | — | — |
| `view_history` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `escalation_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `acknowledge` | 🟢 Enforced | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:82`) | — | 1 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:234`) | — | — |
| `configure` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:448` + 2 more) | — | — |
| `escalate` | 🟢 Enforced | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:94`) | — | 1 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:351`) | — | — |
| `own` | 🟢 Enforced | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:88`) | — | 1 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:267`) | — | — |
| `resolve` | 🟢 Enforced | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:104`) | — | 2 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:370` + 1 more) | — | — |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:84`) | 1 (`src/routes/adminRoutes.tsx:183`) | — | — | 5 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:447` + 4 more) | — | — |
| `view_system_health` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:618`) | — | — |

## `executive_oversight`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drill_into_cases` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `receive_ai_insights` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_all_dashboards` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_all_reports` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_cross_module_audit` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fee_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:118` + 1 more) | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:376`) | 2 (`src/routes/adminRoutes.tsx:161` + 1 more) | — | — | — | — | — |

## `fit_and_proper`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `approve` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:78` + 1 more) | — | — |
| `configure` | 🔵 Backend only | — | — | — | — | 3 (`supabase/functions/fp-ai-media-ingest/index.ts:16` + 2 more) | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:41` + 2 more) | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 11 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:40` + 10 more) | — | — |
| `execute` | 🔵 Backend only | — | — | — | — | 3 (`supabase/functions/fp-cycle-scheduler/index.ts:16` + 2 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 4 (`src/pages/fpa/FpaInitiationLog.tsx:191` + 3 more) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:33`) | — | — |
| `override_committee` | 🟢 Enforced | — | — | 1 (`src/pages/fpa/FpaDeterminations.tsx:492`) | — | 4 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:398` + 3 more) | — | — |
| `submit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:15` + 1 more) | — | — |
| `update` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:349` + 1 more) | — | — |
| `view` | 🟢 Enforced | 52 (`src/config/navigation.tsx:208` + 51 more) | — | — | — | 12 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:49` + 11 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 6 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:47` + 5 more) | — | — |
| `view_confidential` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:22`) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `workflow_action` | 🟢 Enforced | — | — | 1 (`src/pages/fpa/FpaAssessmentWorkspace.tsx:516`) | — | 2 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:39` + 1 more) | — | — |

## `fit_and_proper_appeals`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_committee`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cast_weighted_vote` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:730`) | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820151329_6250f2e3-81ea-4c19-9e55-c28e45c21f75.sql:217`) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 7 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:124` + 6 more) | — | — |
| `provide_rationale` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | — | 1 (`src/routes/adminRoutes.tsx:200`) | — | — | — | — | — |

## `fit_and_proper_conditions`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:555` + 1 more) | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:509`) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:557` + 1 more) | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_determinations`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:396` + 3 more) | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:23`) | — | — |

## `fit_and_proper_initiation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `initiate_assessment` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:54`) | — | — |
| `manage_initiation_types` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_monitoring`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:895`) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:922`) | — | — |
| `override` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_screening`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:290` + 2 more) | — | — |
| `issue_determination` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_conditions_monitoring` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_screening` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260827193808_73d10553-263e-4e3f-8270-b1e4135f5a5e.sql:281`) | — | — |
| `record_adverse_findings` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820150453_956b640b-b4f5-4b67-b70a-75e33c30ecaf.sql:208` + 3 more) | — | — |
| `run_ai_analysis` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | — | 2 (`src/routes/adminRoutes.tsx:199` + 1 more) | — | — | — | — | — |

## `form_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔵 Backend only | — | — | — | — | 3 (`src/pages/admin/FormManagement.tsx:382` + 2 more) | — | — |
| `edit` | 🟡 UI only | — | — | 4 (`src/pages/admin/FormsPackagesWorkspace.tsx:312` + 3 more) | — | — | — | — |
| `manage_applicability` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_packages` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `publish` | 🟢 Enforced | — | — | 1 (`src/pages/admin/FormsPackagesWorkspace.tsx:771`) | — | 2 (`src/pages/admin/FormManagement.tsx:170` + 1 more) | — | — |
| `retire` | 🔵 Backend only | — | — | — | — | 2 (`src/pages/admin/FormManagement.tsx:244` + 1 more) | — | — |
| `view` | 🟡 UI only | 2 (`src/config/navigation.tsx:359` + 1 more) | 7 (`src/routes/adminRoutes.tsx:99` + 6 more) | — | — | — | — | — |

## `inspection_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:400`) | — | — |
| `view` | 🟢 Enforced | — | 3 (`src/routes/dashboardRoutes.tsx:270` + 2 more) | — | — | 6 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:43` + 5 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:42` + 4 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:434`) | — | — |

## `integration_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `manage` | 🔵 Backend only | — | — | — | — | 1 (`supabase/functions/manage-api-key/index.ts:9`) | — | — |
| `test_connection` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_health` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `license_appeals`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign_panel` | 🟢 Enforced | — | — | 2 (`src/components/appeals/AppealActionsDialog.tsx:35` + 1 more) | — | 2 (`supabase/migrations/20260808121049_39731e6e-eff8-418d-9d6a-d796b637ac92.sql:232` + 1 more) | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820170449_9b085eec-a9dc-4a8b-862c-6bca839a3e30.sql:164`) | — | — |
| `decide` | 🟢 Enforced | — | — | 3 (`src/components/appeals/AppealActionsDialog.tsx:255` + 2 more) | — | 8 (`supabase/migrations/20260730125201_e0464236-248c-4ddb-a39a-eae9a391a1a1.sql:34` + 7 more) | — | — |
| `edit` | 🟢 Enforced | — | — | 4 (`src/components/appeals/AppealActionsDialog.tsx:283` + 3 more) | — | 4 (`supabase/migrations/20260808121049_39731e6e-eff8-418d-9d6a-d796b637ac92.sql:369` + 3 more) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260824170038_f23f6513-d02c-431a-a227-bd07d87d9b19.sql:17` + 1 more) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:124` + 1 more) | 2 (`src/routes/dashboardRoutes.tsx:210` + 1 more) | — | — | 2 (`supabase/migrations/20260730064518_8a88a62a-8f92-474b-becf-9cd4bb215e26.sql:110` + 1 more) | — | — |
| `view_all_entities` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `license_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 1 (`src/components/licenses/LicenseVariationPanel.tsx:137`) | — | 12 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:243` + 11 more) | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟢 Enforced | — | — | 1 (`src/components/licenses/LicenseFeeLedgerPanel.tsx:145`) | — | 5 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:66` + 4 more) | — | — |
| `manage_certificates` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820195611_052a788e-b840-4bc5-9738-8d62593d6230.sql:12` + 3 more) | — | — |
| `manage_conditions` | 🔵 Backend only | — | — | — | — | 10 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:155` + 9 more) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260828190141_48711bee-c89c-4848-b875-27b12157026e.sql:67` + 3 more) | — | — |
| `manage_license_actions` | 🔵 Backend only | — | — | — | — | 6 (`supabase/migrations/20260821142155_ea66e8a9-1f05-4a01-9e3b-e57d31594e80.sql:469` + 5 more) | — | — |
| `view` | 🟢 Enforced | 4 (`src/config/navigation.tsx:81` + 3 more) | 11 (`src/routes/adminRoutes.tsx:162` + 10 more) | — | — | 11 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:35` + 10 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:34` + 1 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 19 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:67` + 18 more) | — | — |

## `licensee_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign_supervision` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260824150952_c33b1377-2abe-4d15-a60c-0200fcee5e61.sql:131` + 4 more) | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟢 Enforced | — | — | 9 (`src/pages/admin/EntityMemberships.tsx:144` + 8 more) | — | 2 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:121` + 1 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`src/pages/admin/ApprovedLicensees.tsx:154`) | — | — |
| `manage_pre_license` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_products_channels` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | — | 3 (`src/routes/dashboardRoutes.tsx:374` + 2 more) | — | — | 10 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:85` + 9 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:84` + 2 more) | — | — |

## `licensing`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `add_legal_notes` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `conditional_approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `flag_concern` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `issue_digital_license` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `override_ai_recommendation` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `recommend_conditions` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `respond_rfi` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `sign_enforcement_order` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `submit` | 🔵 Backend only | — | — | — | — | 3 (`supabase/functions/verify-and-submit/authz_test.ts:17` + 2 more) | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260807143133_b831b148-562e-4b26-a1b1-db4e79db0b01.sql:33` + 1 more) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `market_conduct`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 4 (`src/pages/conduct/Conduct360.tsx:71` + 3 more) | — | 2 (`supabase/migrations/20260821180454_256ec8d6-b79f-4a9c-a096-15113c67752b.sql:219` + 1 more) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260821180250_d037756f-df51-4738-9c2a-abf93d603bea.sql:101` + 4 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`src/hooks/useMarketConduct.ts:202`) | — | — |
| `initiate_investigation` | 🟢 Enforced | — | — | 1 (`src/pages/conduct/ConductSignalDetail.tsx:57`) | — | 2 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:377` + 1 more) | — | — |
| `initiate_thematic_review` | 🔵 Backend only | — | — | — | — | 2 (`src/pages/supervision/NewThematicReview.tsx:72` + 1 more) | — | — |
| `issue_enforcement_action` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_complaints` | 🟢 Enforced | — | — | 17 (`src/pages/conduct/ConductSignalDetail.tsx:109` + 16 more) | — | 1 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:303`) | — | — |
| `manage_monitoring_rules` | 🟢 Enforced | — | — | 2 (`src/pages/conduct/ConductSignalDetail.tsx:56` + 1 more) | — | 2 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:302` + 1 more) | — | — |
| `run_conduct_analytics` | 🟢 Enforced | — | — | 14 (`src/pages/conduct/Conduct360.tsx:73` + 13 more) | — | 5 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:301` + 4 more) | — | — |
| `view` | 🟢 Enforced | 21 (`src/config/navigation.tsx:163` + 20 more) | 36 (`src/routes/adminRoutes.tsx:207` + 35 more) | — | — | 6 (`supabase/migrations/20260807143133_b831b148-562e-4b26-a1b1-db4e79db0b01.sql:69` + 5 more) | — | — |

## `market_conduct_investigation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `access_investigation_workspace` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `conduct_interviews` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_evidence_repository` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `prepare_investigation_report` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `notification_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dispatch` | 🟢 Enforced | — | — | 6 (`src/components/correspondence/ThreadDetail.tsx:151` + 5 more) | — | 3 (`supabase/migrations/20260803045339_9bcbbe6c-9ccd-4fce-a580-af0e064ab739.sql:295` + 2 more) | — | — |
| `manage_events` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_templates` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `test_send` | 🔵 Backend only | — | — | — | — | 1 (`supabase/functions/test-smtp-email/index.ts:28`) | — | — |
| `view` | 🟢 Enforced | 4 (`src/config/navigation.tsx:82` + 3 more) | 9 (`src/routes/adminRoutes.tsx:184` + 8 more) | — | — | 2 (`supabase/migrations/20260803070810_4f565658-70c2-478c-a6dd-b1d96a0bec5a.sql:99` + 1 more) | — | — |

## `onboarding`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audit_view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260821185656_305fa541-cb1d-473e-858f-ad1d10fe849a.sql:92`) | — | — |
| `security_audit_view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260821185656_305fa541-cb1d-473e-858f-ad1d10fe849a.sql:100`) | — | — |
| `view` | 🟡 UI only | — | 1 (`src/routes/dashboardRoutes.tsx:385`) | — | — | — | — | — |

## `operational_resilience`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:31`) | — | — |
| `view_confidential` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `prudential_payment_systems`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_pfmi_assessment` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_payment_workflow` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `oversee_msb` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `supervise_fmi` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `prudential_supervision`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conduct_onsite_examination` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260806072210_326e2fa8-8627-40f3-98e0-345ad5b0c48c.sql:24`) | — | — |
| `create` | 🟢 Enforced | — | — | 2 (`src/pages/prudential/AssessmentWorkspace.tsx:387` + 1 more) | — | 2 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:53` + 1 more) | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟢 Enforced | — | — | 6 (`src/pages/prudential/AssessmentWorkspace.tsx:317` + 5 more) | — | 5 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:52` + 4 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 2 (`src/pages/prudential/PrudentialEntityProfile.tsx:241` + 1 more) | — | — |
| `initiate_supervisory_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:468`) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 9 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:45` + 8 more) | — | — |
| `manage_examination` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_payment_oversight` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260806080520_e73af19e-e646-4683-9947-e6ea389d5972.sql:11` + 1 more) | — | — |
| `manage_remediation` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260823144139_44f0b338-472f-4762-9929-fa718baf670e.sql:13` + 1 more) | — | — |
| `record_camels_assessment` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820141538_ea56b357-4913-45f6-9ac1-6f45539c9b9a.sql:219`) | — | — |
| `review_returns` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `run_analytics` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `set_ewi_rules` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `signoff_workpaper` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 12 (`src/config/navigation.tsx:327` + 11 more) | 23 (`src/routes/adminRoutes.tsx:204` + 22 more) | — | — | 14 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:33` + 13 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 8 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:31` + 7 more) | — | — |
| `workflow_action` | 🟢 Enforced | — | — | 1 (`src/components/prudential/EwiPanel.tsx:47`) | — | 5 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:51` + 4 more) | — | — |

## `registration_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 1 (`src/pages/licensing/EntityResolutionDetail.tsx:395`) | — | 5 (`supabase/migrations/20260828125632_9e463f5e-3e2d-46c7-bb97-3def5461aa86.sql:555` + 4 more) | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟡 UI only | — | — | 1 (`src/pages/licensing/EntityResolutionDetail.tsx:537`) | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:127`) | 2 (`src/routes/adminRoutes.tsx:193` + 1 more) | — | — | 1 (`supabase/functions/get-licensee-registration/index.ts:93`) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260828125632_9e463f5e-3e2d-46c7-bb97-3def5461aa86.sql:556` + 2 more) | — | — |

## `regulatory_data_model`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `manage` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `regulatory_requests`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `assign` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `close` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:36`) | — | — |

## `report_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🟢 Enforced | — | — | — | — | 4 (`supabase/migrations/20260827193808_73d10553-263e-4e3f-8270-b1e4135f5a5e.sql:22` + 3 more) | — | 7 (`src/pages/reports/ReportsDashboard.tsx:41` + 6 more) |
| `execute` | 🔵 Backend only | — | — | — | — | 1 (`supabase/functions/run-scheduled-reports/index.ts:27`) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 3 (`src/pages/reports/components/ReportHistory.tsx:88` + 2 more) | — | — |
| `view` | 🟢 Enforced | 3 (`src/config/navigation.tsx:396` + 2 more) | 6 (`src/routes/dashboardRoutes.tsx:248` + 5 more) | 1 (`src/pages/returns-mgmt/ReturnDetail.tsx:637`) | — | 4 (`supabase/migrations/20260820200412_4acd24ab-8d21-4dec-984b-caa54559bd5a.sql:312` + 3 more) | — | 34 (`src/pages/reports/ReportPage.tsx:1` + 33 more) |

## `returns_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟡 UI only | — | — | 2 (`src/pages/returns-mgmt/ReturnDetail.tsx:725` + 1 more) | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟢 Enforced | — | — | 1 (`src/components/admin/returns-config/RegulatoryMetricsPanel.tsx:130`) | — | 6 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:70` + 5 more) | — | — |
| `export` | 🟢 Enforced | — | — | 1 (`src/pages/returns-mgmt/ViewReturns.tsx:273`) | — | 1 (`src/pages/returns-mgmt/ViewReturns.tsx:282`) | — | — |
| `manage_config` | 🟢 Enforced | — | — | 1 (`src/pages/admin/ReportingMetricsConfig.tsx:16`) | — | 3 (`supabase/migrations/20260810100752_fcd3150a-7dd7-4c4b-ac32-164bcab76a03.sql:7` + 2 more) | — | — |
| `reject` | 🟢 Enforced | — | — | 1 (`src/pages/returns-mgmt/ReturnDetail.tsx:750`) | — | 2 (`supabase/migrations/20260722075014_e42adb56-18bf-42f0-84ce-dfa0160e4338.sql:24` + 1 more) | — | — |
| `respond_rfi` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820162947_d5106a5c-02b7-4ea0-a642-a31398d87cdd.sql:96` + 1 more) | — | — |
| `submit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820170449_9b085eec-a9dc-4a8b-862c-6bca839a3e30.sql:13` + 1 more) | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 14 (`src/config/navigation.tsx:134` + 13 more) | 23 (`src/routes/adminRoutes.tsx:164` + 22 more) | 1 (`src/pages/returns-mgmt/ReturnDetail.tsx:624`) | — | 9 (`supabase/migrations/20260721141525_300d7d82-4892-466f-a30b-9d06b022ff65.sql:37` + 8 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 7 (`supabase/migrations/20260721060408_d89cea7e-35ef-40d2-b766-b34234a99258.sql:163` + 6 more) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `workflow_action` | 🟢 Enforced | — | — | 3 (`src/pages/returns-canonical/FilingDetail.tsx:150` + 2 more) | — | 3 (`supabase/functions/perform-return-workflow-action/authz_test.ts:17` + 2 more) | — | — |

## `role_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820012251_b49086ce-e13a-4a98-a9fa-4c28f1366fb2.sql:156` + 1 more) | — | — |
| `assign_permissions` | 🟢 Enforced | — | — | 1 (`src/pages/admin/RoleManagement.tsx:216`) | — | 1 (`src/hooks/useRoles.ts:138`) | — | — |
| `assign_role` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🟡 UI only | — | — | 1 (`src/pages/admin/RoleManagement.tsx:212`) | — | — | — | — |
| `delete` | 🟢 Enforced | — | — | 1 (`src/pages/admin/RoleManagement.tsx:214`) | — | 4 (`supabase/migrations/20260722061005_9fb94b33-3d1b-4e33-b06f-4217384f98fd.sql:117` + 3 more) | — | — |
| `edit` | 🟢 Enforced | — | — | 1 (`src/pages/admin/RoleManagement.tsx:213`) | — | 5 (`supabase/migrations/20260721170250_0353a422-3ffe-444a-8508-1ec6d5bdeb20.sql:225` + 4 more) | — | — |
| `manage_catalog` | 🟢 Enforced | — | — | 1 (`src/pages/admin/RoleManagement.tsx:221`) | — | 5 (`supabase/migrations/20260824191930_3e101687-08e3-4c94-9f2a-0f340c24e06d.sql:43` + 4 more) | — | — |
| `manage_config` | 🟢 Enforced | — | — | 6 (`src/pages/admin/DecisionAuthorityManager.tsx:214` + 5 more) | — | 5 (`supabase/migrations/20260827032419_67587d87-9073-4377-b429-75459a1ab880.sql:266` + 4 more) | — | — |
| `reset` | 🟢 Enforced | — | — | 1 (`src/pages/admin/RoleManagement.tsx:215`) | — | 1 (`src/hooks/useRoles.ts:253`) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:99` + 1 more) | 1 (`src/routes/adminRoutes.tsx:172`) | — | — | 5 (`supabase/migrations/20260824165313_c39b689d-267c-492f-bf44-9a98ce2a1eba.sql:488` + 4 more) | — | — |
| `view_catalog` | 🟡 UI only | — | — | 1 (`src/pages/admin/RoleManagement.tsx:220`) | — | — | — | — |
| `view_coverage` | 🟡 UI only | — | — | 1 (`src/pages/admin/PermissionCoverageReport.tsx:31`) | — | — | — | — |

## `rule_engine`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `activate` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260803162930_d348595b-e3dd-4635-909e-5ce6732699f7.sql:169` + 1 more) | — | — |
| `deactivate` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260804042039_8e65e22f-0e1c-4cf2-b10f-26075a36c4e9.sql:26`) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260803162930_d348595b-e3dd-4635-909e-5ce6732699f7.sql:153` + 4 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`src/pages/admin/RuleLibrary.tsx:163`) | — | — |
| `manage_alerts` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_tasks` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `restore_versions` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `test` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | — | 4 (`src/routes/adminRoutes.tsx:212` + 3 more) | — | — | 1 (`supabase/migrations/20260803162930_d348595b-e3dd-4635-909e-5ce6732699f7.sql:152`) | — | — |
| `view_alerts` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_executions` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_tasks` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_versions` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `security_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | — | 6 (`supabase/migrations/20260821185656_305fa541-cb1d-473e-858f-ad1d10fe849a.sql:101` + 5 more) | — | — |

## `settings`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `edit` | 🟢 Enforced | — | — | 18 (`src/pages/admin/RegulatorManagement.tsx:208` + 17 more) | — | 10 (`supabase/migrations/20260804065012_08abb314-e1b4-4aa5-a533-1e5230fd16c5.sql:200` + 9 more) | — | — |
| `export` | 🔵 Backend only | — | — | — | — | 2 (`src/pages/settings/DataManagementSettings.tsx:67` + 1 more) | — | — |
| `view` | 🟢 Enforced | 15 (`src/config/navigation.tsx:83` + 14 more) | 30 (`src/routes/adminRoutes.tsx:110` + 29 more) | — | — | 1 (`supabase/migrations/20260804065012_08abb314-e1b4-4aa5-a533-1e5230fd16c5.sql:302`) | — | — |

## `support_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign` | 🟡 UI only | — | — | 1 (`src/pages/admin/SupportQueue.tsx:254`) | — | — | — | — |
| `close` | 🟡 UI only | — | — | 1 (`src/pages/admin/SupportQueue.tsx:360`) | — | — | — | — |
| `resolve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `respond` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `update` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | — | 1 (`src/routes/adminRoutes.tsx:170`) | — | — | 1 (`supabase/migrations/20260825070000_c01090c0-39d0-4e9d-ad04-e224b66365c1.sql:80`) | — | — |

## `user_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔵 Backend only | — | — | — | — | 3 (`supabase/functions/create-web-user/authz_test.ts:17` + 2 more) | — | — |
| `delete` | 🔵 Backend only | — | — | — | — | 1 (`src/components/entity-detail/WebUsersTab.tsx:261`) | — | — |
| `edit` | 🟢 Enforced | — | — | 17 (`src/components/admin/operating-structure/EntitySupervisionTab.tsx:229` + 16 more) | — | 5 (`supabase/migrations/20260820012251_b49086ce-e13a-4a98-a9fa-4c28f1366fb2.sql:155` + 4 more) | — | — |
| `view` | 🟢 Enforced | 3 (`src/config/navigation.tsx:98` + 2 more) | 4 (`src/routes/adminRoutes.tsx:168` + 3 more) | — | — | 8 (`supabase/migrations/20260824165313_c39b689d-267c-492f-bf44-9a98ce2a1eba.sql:487` + 7 more) | — | — |

## `workflow_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:83` + 3 more) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 9 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:23` + 8 more) | — | — |
| `publish` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:85` + 3 more) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:351` + 1 more) | 2 (`src/routes/dashboardRoutes.tsx:244` + 1 more) | — | — | 4 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:22` + 3 more) | — | — |
| `view_all` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:43` + 1 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:35`) | — | — |
