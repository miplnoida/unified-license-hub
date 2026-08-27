# Permission Coverage Matrix

_Generated 2026-08-27T18:55:20.455Z. Do not edit by hand — run `bunx tsx scripts/generate-permission-coverage.ts`._

**Total permissions:** 299  `|`  **Orphaned:** 122

Coverage classes:

- 🟢 **Enforced** — appears in at least one UI surface **and** at least one backend surface (RLS / RPC / storage).
- 🔵 **Backend only** — enforced by RLS / RPC / storage but no UI surface uses it. Safe, but the button that would trigger it is missing.
- 🟡 **UI only** — a menu / route / button / report references it but no RLS / RPC / storage guard enforces it server-side. Frontend gate only — not security.
- 🔴 **Orphaned** — used nowhere. Cannot be assigned to a role (server trigger `permission_orphaned` blocks it).

## Orphaned permissions

These permissions exist in the `permissions` catalog but have no enforcement path anywhere. Either wire them up, or set `permissions.enforced = false` to make the intent explicit.

| Module | Action |
| --- | --- |
| `analytics` | `edit` |
| `application_management` | `close` |
| `application_management` | `configure` |
| `application_management` | `escalate` |
| `application_management` | `export` |
| `application_management` | `import` |
| `application_management` | `reject` |
| `complaint_management` | `approve` |
| `complaint_management` | `approve_rfi` |
| `complaint_management` | `assess_jurisdiction` |
| `complaint_management` | `configure` |
| `complaint_management` | `decide_jurisdiction` |
| `complaint_management` | `escalate` |
| `complaint_management` | `investigate` |
| `complaint_management` | `reopen_jurisdiction` |
| `complaint_management` | `retry_triage` |
| `complaint_management` | `submit` |
| `complaint_management` | `triage` |
| `complaint_management` | `upload_documents` |
| `complaint_management` | `view_status` |
| `complaint_type` | `create` |
| `complaint_type` | `edit` |
| `compliance_management` | `export` |
| `conduct_management` | `create` |
| `conduct_management` | `export` |
| `coordination` | `admin` |
| `coordination` | `create` |
| `coordination` | `delete` |
| `coordination` | `edit` |
| `coordination` | `update` |
| `correspondence_management` | `export` |
| `correspondence_management` | `reject` |
| `delegation` | `create` |
| `executive_oversight` | `drill_into_cases` |
| `executive_oversight` | `receive_ai_insights` |
| `executive_oversight` | `view_all_reports` |
| `executive_oversight` | `view_cross_module_audit` |
| `fee_management` | `create` |
| `fit_and_proper` | `admin` |
| `fit_and_proper` | `configure` |
| `fit_and_proper` | `execute` |
| `fit_and_proper` | `export` |
| `fit_and_proper` | `submit` |
| `fit_and_proper` | `update` |
| `fit_and_proper` | `view_status` |
| `fit_and_proper_committee` | `cast_weighted_vote` |
| `fit_and_proper_committee` | `create` |
| `fit_and_proper_committee` | `edit` |
| `fit_and_proper_committee` | `provide_rationale` |
| `fit_and_proper_initiation` | `initiate_assessment` |
| `fit_and_proper_initiation` | `manage_initiation_types` |
| `fit_and_proper_initiation` | `view` |
| `fit_and_proper_screening` | `create` |
| `fit_and_proper_screening` | `edit` |
| `fit_and_proper_screening` | `issue_determination` |
| `fit_and_proper_screening` | `manage_conditions_monitoring` |
| `fit_and_proper_screening` | `manage_screening` |
| `fit_and_proper_screening` | `record_adverse_findings` |
| `fit_and_proper_screening` | `run_ai_analysis` |
| `form_management` | `create` |
| `form_management` | `delete` |
| `form_management` | `edit` |
| `form_management` | `import` |
| `form_management` | `publish` |
| `inspection_management` | `edit` |
| `licensee_management` | `export` |
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
| `licensing` | `submit` |
| `licensing` | `upload_documents` |
| `licensing` | `view_status` |
| `market_conduct` | `create` |
| `market_conduct_investigation` | `conduct_interviews` |
| `market_conduct_investigation` | `prepare_investigation_report` |
| `master_data_management` | `import` |
| `notification_management` | `create` |
| `notification_management` | `manage_events` |
| `notification_management` | `manage_templates` |
| `notification_management` | `test_send` |
| `prudential_payment_systems` | `conduct_pfmi_assessment` |
| `prudential_payment_systems` | `manage_payment_workflow` |
| `prudential_payment_systems` | `oversee_msb` |
| `prudential_payment_systems` | `supervise_fmi` |
| `prudential_payment_systems` | `view` |
| `prudential_supervision` | `approve` |
| `prudential_supervision` | `export` |
| `prudential_supervision` | `initiate_supervisory_action` |
| `prudential_supervision` | `record_camels_assessment` |
| `prudential_supervision` | `review_returns` |
| `prudential_supervision` | `run_analytics` |
| `prudential_supervision` | `set_ewi_rules` |
| `registration_management` | `approve` |
| `registration_management` | `create` |
| `registration_management` | `edit` |
| `registration_management` | `reject` |
| `report_management` | `export` |
| `returns_management` | `configure` |
| `returns_management` | `respond_rfi` |
| `returns_management` | `upload_documents` |
| `returns_management` | `view_status` |
| `role_management` | `assign_permissions` |
| `role_management` | `create` |
| `role_management` | `reset` |
| `role_management` | `view_coverage` |
| `rule_engine` | `export` |
| `rule_engine` | `test` |
| `rule_engine` | `view_executions` |
| `settings` | `create` |
| `settings` | `delete` |
| `settings` | `export` |
| `settings` | `import` |
| `user_management` | `create` |
| `user_management` | `delete` |
| `workflow_management` | `create` |

## `admin_dashboard`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:80`) | 1 (`src/routes/adminRoutes.tsx:95`) | — | — | 3 (`supabase/migrations/20260812135953_47a65a2b-c32b-40cf-ad4b-c316fafb7d66.sql:22` + 2 more) | — | — |

## `ai_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:195` + 1 more) | 11 (`src/routes/dashboardRoutes.tsx:287` + 10 more) | — | — | 2 (`supabase/migrations/20260826135819_8184cbfb-7ab9-4681-8978-f0d5b21409cf.sql:239` + 1 more) | — | — |

## `aml_supervision`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `edit` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260820113315_8f7a82d8-b328-4ea5-afe2-f97913e2621d.sql:174` + 3 more) | — | — | — |
| `view` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260820113315_8f7a82d8-b328-4ea5-afe2-f97913e2621d.sql:172` + 1 more) | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:29`) | — | — |
| `view_confidential` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:30`) | — | — |

## `analytics`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `application_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 1 (`src/components/auth/PermissionGate.tsx:24`) | — | 2 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:119` + 1 more) | — | — |
| `close` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `configure` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:75`) | 6 (`supabase/migrations/20260723080512_f3001359-6117-4c88-8560-e6411ac17af2.sql:22` + 5 more) | — | — |
| `delete` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:88`) | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | 9 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:96` + 8 more) | 11 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:39` + 10 more) | — | — |
| `escalate` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `import` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | 6 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:107` + 5 more) | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820183504_d7a95be9-ba48-480b-a4b8-4557522352f7.sql:93` + 1 more) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:121` + 1 more) | 4 (`src/routes/adminRoutes.tsx:192` + 3 more) | — | 3 (`supabase/migrations/20260807125000_6775b212-49e2-45bb-ae6d-b65283cc3afe.sql:258` + 2 more) | 8 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:20` + 7 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:14` + 1 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | 10 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:97` + 9 more) | 5 (`supabase/migrations/20260721131422_e66777b5-9205-47bd-9d37-fb01b3f277b5.sql:40` + 4 more) | — | — |

## `audit`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260826184944_a232e671-8912-4deb-9857-db820aca4e71.sql:203`) | — | — | — |

## `audit_logs`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260827032419_67587d87-9073-4377-b429-75459a1ab880.sql:106`) | — | — | — |

## `audit_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `export` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260807143504_e0e38f7f-5b9f-466f-bb2a-d1301289eac0.sql:34`) | 1 (`supabase/migrations/20260721064650_3a549654-4a8a-4ecf-8eb7-18225da0f95d.sql:74`) | — |
| `view` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260807143504_e0e38f7f-5b9f-466f-bb2a-d1301289eac0.sql:33` + 2 more) | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:34`) | — |

## `complaint_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `approve_rfi` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `assess_jurisdiction` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `assign` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260823141649_bfdd5bfc-2f79-4c40-aca8-55a63aceeb3c.sql:37`) | — | — | — |
| `configure` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | 6 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:24` + 5 more) | — | — | — |
| `decide_jurisdiction` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | 6 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:16` + 5 more) | — | — | — |
| `escalate` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `investigate` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reopen_jurisdiction` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `retry_triage` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `triage` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 4 (`src/config/navigation.tsx:158` + 3 more) | 8 (`src/routes/dashboardRoutes.tsx:234` + 7 more) | — | 10 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:9` + 9 more) | 5 (`supabase/migrations/20260812135953_47a65a2b-c32b-40cf-ad4b-c316fafb7d66.sql:15` + 4 more) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `complaint_type`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:162`) | 1 (`src/routes/adminRoutes.tsx:184`) | — | — | — | — | — |

## `compliance_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:100`) | — | — | — |
| `delete` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:133`) | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:62`) | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:31`) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:146`) | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:30`) | — | — |
| `view_audit_logs` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:145` + 1 more) | — | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132502_e2949718-03fe-4a4c-8520-a5f0a32ce4c4.sql:63`) | — | — |

## `conduct_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `coordination`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `update` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:319`) | 2 (`src/routes/dashboardRoutes.tsx:264` + 1 more) | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:40`) | — | — |

## `correspondence_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260803054710_407cb6cc-5be1-4879-b634-2a2edc95a51c.sql:130` + 3 more) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260803054937_ec0af289-292d-4821-9fe8-5eb094025c82.sql:225` + 1 more) | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `delegation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `employee_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820200412_4acd24ab-8d21-4dec-984b-caa54559bd5a.sql:313` + 1 more) | — | — |

## `enforcement_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260821111826_e057c9d6-9565-4b2f-bed6-68ae87eb17e6.sql:109`) | — | — |
| `decide` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260821111826_e057c9d6-9565-4b2f-bed6-68ae87eb17e6.sql:209` + 2 more) | — | — |
| `refer` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260821111826_e057c9d6-9565-4b2f-bed6-68ae87eb17e6.sql:108` + 2 more) | — | — |
| `view` | 🟢 Enforced | — | 2 (`src/routes/dashboardRoutes.tsx:266` + 1 more) | — | — | 8 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:27` + 7 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:26` + 3 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260823145058_b857e819-58d2-4886-a3c1-a1c46af7aef3.sql:28`) | — | — |

## `entity_membership`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:179` + 3 more) | — | — |
| `manage` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:89` + 1 more) | — | — | — |
| `revoke` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:211`) | — | — |
| `verify` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:164` + 1 more) | — | — |
| `view` | 🟢 Enforced | — | 1 (`src/routes/dashboardRoutes.tsx:383`) | — | 1 (`supabase/migrations/20260820074437_6bc6381a-1ccd-4b02-9ce0-7966fe70eae4.sql:83`) | 2 (`supabase/migrations/20260820085845_9da2e82d-fe9e-4d72-909b-4b1f0ab25894.sql:699` + 1 more) | — | — |

## `entity_resolution`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 7 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:428` + 6 more) | — | — |
| `escalate` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:422` + 1 more) | — | — |
| `merge` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:492`) | — | — |
| `resolve` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:394` + 3 more) | — | — |
| `verify` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:417` + 1 more) | — | — |
| `view` | 🟢 Enforced | — | 2 (`src/routes/dashboardRoutes.tsx:381` + 1 more) | — | 4 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:93` + 3 more) | 5 (`supabase/migrations/20260820074725_8f4f64df-b4c9-42f4-8ded-c9c0e9f4d28e.sql:174` + 4 more) | — | — |

## `entity_structure`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | 11 (`supabase/migrations/20260820082334_55e605e9-9ec3-4b8b-90e7-8ea42ac4693b.sql:337` + 10 more) | 5 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:14` + 4 more) | — | — |

## `escalation_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `acknowledge` | 🟡 UI only | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:81`) | — | — | — | — |
| `configure` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260803061434_7c4dbaf2-cb85-4ddc-8b72-6d9648e4d41c.sql:73` + 1 more) | 2 (`supabase/migrations/20260803062145_830d0ff7-3db4-4641-a81e-f060577e3010.sql:448` + 1 more) | — | — |
| `escalate` | 🟡 UI only | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:93`) | — | — | — | — |
| `own` | 🟡 UI only | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:87`) | — | — | — | — |
| `resolve` | 🟡 UI only | — | — | 1 (`src/components/escalations/EscalationDetailDrawer.tsx:103`) | — | — | — | — |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:84`) | 1 (`src/routes/adminRoutes.tsx:179`) | — | 1 (`supabase/migrations/20260803061434_7c4dbaf2-cb85-4ddc-8b72-6d9648e4d41c.sql:213`) | — | — | — |

## `executive_oversight`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drill_into_cases` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `receive_ai_insights` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `receive_ils` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260807092214_dd3d72f8-4729-4395-8629-4b298895b2a8.sql:479` + 1 more) | — | — | — |
| `view_all_dashboards` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260812135953_47a65a2b-c32b-40cf-ad4b-c316fafb7d66.sql:21`) | — | — |
| `view_all_reports` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_cross_module_audit` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fee_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:118` + 1 more) | — | — |
| `view` | 🟢 Enforced | 1 (`src/config/navigation.tsx:376`) | 2 (`src/routes/adminRoutes.tsx:159` + 1 more) | — | — | — | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:93`) | — |

## `fit_and_proper`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `approve` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260824161528_62a30e67-4823-4cf1-8813-46eef6737073.sql:277`) | — | — |
| `configure` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:41`) | — | — |
| `delete` | 🔵 Backend only | — | — | — | 3 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:149` + 2 more) | — | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:80`) | — |
| `edit` | 🔵 Backend only | — | — | — | 28 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:138` + 27 more) | 4 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:40` + 3 more) | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:69`) | — |
| `execute` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:33`) | — | — |
| `override_committee` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260812090000_fp_determination_committee_override.sql:128`) | — | — |
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `update` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔵 Backend only | — | — | — | — | — | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:68`) | — |
| `view` | 🟢 Enforced | 52 (`src/config/navigation.tsx:208` + 51 more) | — | — | 6 (`supabase/migrations/20260807073749_eba2d37f-64a7-4f9f-b91d-25b0f35e9768.sql:189` + 5 more) | 15 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:49` + 14 more) | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:57`) | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | 5 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:159` + 4 more) | 7 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:47` + 6 more) | — | — |
| `view_confidential` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:22`) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | 18 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:139` + 17 more) | 1 (`supabase/migrations/20260721134624_580a5cde-b8ea-400d-b7cc-c17fb4301b1d.sql:39`) | — | — |

## `fit_and_proper_committee`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cast_weighted_vote` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `provide_rationale` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | — | 1 (`src/routes/adminRoutes.tsx:196`) | — | — | — | — | — |

## `fit_and_proper_determinations`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:23`) | — | — |

## `fit_and_proper_initiation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `initiate_assessment` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_initiation_types` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_screening`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `issue_determination` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_conditions_monitoring` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_screening` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `record_adverse_findings` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `run_ai_analysis` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | — | 2 (`src/routes/adminRoutes.tsx:195` + 1 more) | — | — | — | — | — |

## `fit_proper_assessment`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260812143504_883b1b35-71a0-402c-a431-c804458806ad.sql:30`) | — | — |

## `form_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `import` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `publish` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:359` + 1 more) | 7 (`src/routes/adminRoutes.tsx:97` + 6 more) | — | 10 (`supabase/migrations/20260820082334_55e605e9-9ec3-4b8b-90e7-8ea42ac4693b.sql:310` + 9 more) | — | — | — |

## `inspection_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | — | 3 (`src/routes/dashboardRoutes.tsx:270` + 2 more) | — | — | 8 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:43` + 7 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260721135506_00a16cb4-3c26-4d4f-9ec6-92099e5e30e6.sql:42` + 4 more) | — | — |

## `license_appeals`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign_panel` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260808121049_39731e6e-eff8-418d-9d6a-d796b637ac92.sql:232` + 1 more) | — | — |
| `create` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260730064518_8a88a62a-8f92-474b-becf-9cd4bb215e26.sql:268`) | 1 (`supabase/migrations/20260820170449_9b085eec-a9dc-4a8b-862c-6bca839a3e30.sql:164`) | — | — |
| `decide` | 🔵 Backend only | — | — | — | — | 8 (`supabase/migrations/20260730125201_e0464236-248c-4ddb-a39a-eae9a391a1a1.sql:34` + 7 more) | — | — |
| `edit` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260730064518_8a88a62a-8f92-474b-becf-9cd4bb215e26.sql:274` + 1 more) | 4 (`supabase/migrations/20260808121049_39731e6e-eff8-418d-9d6a-d796b637ac92.sql:369` + 3 more) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | 6 (`supabase/migrations/20260730064518_8a88a62a-8f92-474b-becf-9cd4bb215e26.sql:297` + 5 more) | 2 (`supabase/migrations/20260824170038_f23f6513-d02c-431a-a227-bd07d87d9b19.sql:17` + 1 more) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:124` + 1 more) | 2 (`src/routes/dashboardRoutes.tsx:210` + 1 more) | — | 5 (`supabase/migrations/20260730064518_8a88a62a-8f92-474b-becf-9cd4bb215e26.sql:259` + 4 more) | 2 (`supabase/migrations/20260730064518_8a88a62a-8f92-474b-becf-9cd4bb215e26.sql:110` + 1 more) | — | — |

## `license_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 7 (`supabase/migrations/20260820195611_052a788e-b840-4bc5-9738-8d62593d6230.sql:13` + 6 more) | — | — |
| `create` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:142`) | — | — | — |
| `delete` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:152`) | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:66`) | — | — |
| `manage_certificates` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:234` + 1 more) | 1 (`supabase/migrations/20260820195611_052a788e-b840-4bc5-9738-8d62593d6230.sql:12`) | 3 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:117` + 2 more) | — |
| `manage_conditions` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:220` + 1 more) | 2 (`supabase/migrations/20260821143402_afd639ff-033e-428a-b33f-7cedf9fcea92.sql:33` + 1 more) | — | — |
| `manage_license_actions` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:169`) | 2 (`supabase/migrations/20260821143402_afd639ff-033e-428a-b33f-7cedf9fcea92.sql:32` + 1 more) | — | — |
| `view` | 🟢 Enforced | 4 (`src/config/navigation.tsx:81` + 3 more) | 13 (`src/routes/adminRoutes.tsx:160` + 12 more) | — | 8 (`supabase/migrations/20260820085845_9da2e82d-fe9e-4d72-909b-4b1f0ab25894.sql:72` + 7 more) | 15 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:35` + 14 more) | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:116`) | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:34` + 1 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:168` + 3 more) | 11 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:67` + 10 more) | — | — |

## `licensee_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign_supervision` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260824150952_c33b1377-2abe-4d15-a60c-0200fcee5e61.sql:131` + 4 more) | — | — |
| `create` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:262`) | — | — | — |
| `delete` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:272`) | — | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:16`) | — |
| `edit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:121` + 1 more) | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_pre_license` | 🔵 Backend only | — | — | — | 3 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:316` + 2 more) | — | — | — |
| `manage_products_channels` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:285` + 3 more) | — | — | — |
| `view` | 🟢 Enforced | — | 1 (`src/routes/dashboardRoutes.tsx:374`) | — | 4 (`supabase/migrations/20260820082334_55e605e9-9ec3-4b8b-90e7-8ea42ac4693b.sql:338` + 3 more) | 9 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:85` + 8 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:317` + 3 more) | 4 (`supabase/migrations/20260721132114_9490e78c-372a-46d9-a6ce-de46ee9ddb06.sql:84` + 3 more) | 1 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:33`) | — |

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
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260807143133_b831b148-562e-4b26-a1b1-db4e79db0b01.sql:33` + 1 more) | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `market_conduct`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260821180454_256ec8d6-b79f-4a9c-a096-15113c67752b.sql:219` + 1 more) | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260821180250_d037756f-df51-4738-9c2a-abf93d603bea.sql:101` + 2 more) | — | — |
| `initiate_investigation` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:377` + 1 more) | — | — |
| `initiate_thematic_review` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260823142731_9888f172-4a53-478c-a323-b62ed72f57d6.sql:13`) | — | — |
| `issue_enforcement_action` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:77` + 1 more) | — | — | — |
| `manage_complaints` | 🔵 Backend only | — | — | — | 8 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:66` + 7 more) | 1 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:303`) | — | — |
| `manage_monitoring_rules` | 🔵 Backend only | — | — | — | 9 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:133` + 8 more) | 2 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:302` + 1 more) | — | — |
| `run_conduct_analytics` | 🔵 Backend only | — | — | — | 6 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:126` + 5 more) | 1 (`supabase/migrations/20260807134539_05bf7b6b-ec2e-4bde-9dee-d7f5b33c23ab.sql:301`) | — | — |
| `view` | 🟢 Enforced | 21 (`src/config/navigation.tsx:163` + 20 more) | 36 (`src/routes/adminRoutes.tsx:203` + 35 more) | — | 43 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:62` + 42 more) | 7 (`supabase/migrations/20260807143133_b831b148-562e-4b26-a1b1-db4e79db0b01.sql:69` + 6 more) | — | — |

## `market_conduct_investigation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `access_investigation_workspace` | 🔵 Backend only | — | — | — | 3 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:90` + 2 more) | — | — | — |
| `conduct_interviews` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_evidence_repository` | 🔵 Backend only | — | — | — | 3 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:108` + 2 more) | — | — | — |
| `prepare_investigation_report` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:89` + 1 more) | — | — | — |

## `master_data_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `import` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `notification_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_events` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_templates` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `test_send` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 4 (`src/config/navigation.tsx:82` + 3 more) | 9 (`src/routes/adminRoutes.tsx:180` + 8 more) | — | 3 (`supabase/migrations/20260803052606_acfc1695-fb90-42c3-84b0-26b59f65ade2.sql:84` + 2 more) | 1 (`supabase/migrations/20260803070810_4f565658-70c2-478c-a6dd-b1d96a0bec5a.sql:99`) | — | — |
| `view_delivery_history` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260731135230_a5609505-885f-43cd-8e3e-70797e1bae85.sql:415`) | — | — | — |

## `onboarding`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `audit_view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260821185656_305fa541-cb1d-473e-858f-ad1d10fe849a.sql:92`) | — | — |
| `security_audit_view` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260821185656_305fa541-cb1d-473e-858f-ad1d10fe849a.sql:100`) | — | — |
| `view` | 🟡 UI only | — | 1 (`src/routes/dashboardRoutes.tsx:385`) | — | — | — | — | — |

## `operational_resilience`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `edit` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260820113315_8f7a82d8-b328-4ea5-afe2-f97913e2621d.sql:190` + 3 more) | — | — | — |
| `view` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260820113315_8f7a82d8-b328-4ea5-afe2-f97913e2621d.sql:186` + 1 more) | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:31`) | — | — |

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
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `conduct_onsite_examination` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260806072210_326e2fa8-8627-40f3-98e0-345ad5b0c48c.sql:24`) | — | — |
| `create` | 🟢 Enforced | — | — | 2 (`src/pages/prudential/AssessmentWorkspace.tsx:387` + 1 more) | — | 2 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:53` + 1 more) | — | — |
| `delete` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:117` + 3 more) | — | — | — |
| `edit` | 🟢 Enforced | — | — | 1 (`src/pages/prudential/AssessmentWorkspace.tsx:317`) | 10 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:108` + 9 more) | 6 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:52` + 5 more) | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `initiate_supervisory_action` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:173` + 1 more) | 2 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:45` + 1 more) | — | — |
| `manage_payment_oversight` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260806080520_e73af19e-e646-4683-9947-e6ea389d5972.sql:11` + 1 more) | — | — |
| `manage_remediation` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260823144139_44f0b338-472f-4762-9929-fa718baf670e.sql:13` + 1 more) | — | — |
| `record_camels_assessment` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review_returns` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `run_analytics` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `set_ewi_rules` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 12 (`src/config/navigation.tsx:327` + 11 more) | 23 (`src/routes/adminRoutes.tsx:200` + 22 more) | — | 9 (`supabase/migrations/20260807064609_1d9ffecb-d362-406b-8abe-3f7b0ef0bf2e.sql:141` + 8 more) | 18 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:33` + 17 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | 9 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:102` + 8 more) | 8 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:31` + 7 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | 6 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:109` + 5 more) | 5 (`supabase/migrations/20260721134322_6ceea271-7e8d-461a-a620-9538b7df2b88.sql:51` + 4 more) | — | — |

## `registration_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:127`) | 2 (`src/routes/adminRoutes.tsx:189` + 1 more) | — | — | — | — | — |

## `regulatory_data_model`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260820082334_55e605e9-9ec3-4b8b-90e7-8ea42ac4693b.sql:309` + 3 more) | — | — | — |

## `regulatory_requests`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260820083138_4cf74ace-145c-40ce-989d-c55934428aab.sql:365`) | — | — |
| `view` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260820082334_55e605e9-9ec3-4b8b-90e7-8ea42ac4693b.sql:353` + 1 more) | 1 (`supabase/migrations/20260820113520_31dcf25b-2e29-432d-ac14-16939cf924d4.sql:36`) | — | — |

## `report_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `configure` | 🟡 UI only | — | — | — | — | — | — | 1 (`src/pages/reports/ReportsDashboard.tsx:41`) |
| `create` | 🟢 Enforced | — | — | — | 9 (`supabase/migrations/20260721143911_8dadf913-41ff-4c5b-a53d-c68aeb10e96b.sql:209` + 8 more) | 1 (`supabase/migrations/20260807092214_dd3d72f8-4729-4395-8629-4b298895b2a8.sql:547`) | — | 1 (`src/pages/reports/ReportsDashboard.tsx:44`) |
| `edit` | 🟡 UI only | — | — | — | — | — | — | 5 (`src/pages/reports/components/AdHocReportBuilder.tsx:277` + 4 more) |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 3 (`src/config/navigation.tsx:396` + 2 more) | 6 (`src/routes/dashboardRoutes.tsx:248` + 5 more) | 1 (`src/pages/returns-mgmt/ReturnDetail.tsx:637`) | 4 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:238` + 3 more) | 2 (`supabase/migrations/20260820200412_4acd24ab-8d21-4dec-984b-caa54559bd5a.sql:312` + 1 more) | — | 34 (`src/pages/reports/ReportPage.tsx:1` + 33 more) |

## `returns_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟢 Enforced | — | — | 2 (`src/pages/returns-mgmt/ReturnDetail.tsx:725` + 1 more) | — | 1 (`supabase/migrations/20260821075110_b4e1e7b0-e8e8-4e5d-80b1-10cf1be55e0e.sql:279`) | — | — |
| `configure` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:111`) | 3 (`supabase/migrations/20260820095743_a294aca2-8683-4a10-9fe3-8bbab5cfc74f.sql:10` + 2 more) | 1 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:386`) | — |
| `delete` | 🔵 Backend only | — | — | — | 3 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:127` + 2 more) | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | 20 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:112` + 19 more) | 5 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:70` + 4 more) | 1 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:385`) | — |
| `export` | 🟡 UI only | — | — | 1 (`src/pages/returns-mgmt/ViewReturns.tsx:273`) | — | — | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | 23 (`supabase/migrations/20260721130916_9cbdde0b-33fa-40e0-9220-966a96267264.sql:11` + 22 more) | 1 (`supabase/migrations/20260810100752_fcd3150a-7dd7-4c4b-ac32-164bcab76a03.sql:7`) | — | — |
| `reject` | 🟡 UI only | — | — | 2 (`src/pages/returns-mgmt/ReturnDetail.tsx:750` + 1 more) | — | — | — | — |
| `respond_rfi` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820162947_d5106a5c-02b7-4ea0-a642-a31398d87cdd.sql:96` + 3 more) | — | — |
| `submit` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820170449_9b085eec-a9dc-4a8b-862c-6bca839a3e30.sql:13` + 1 more) | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 14 (`src/config/navigation.tsx:134` + 13 more) | 23 (`src/routes/adminRoutes.tsx:162` + 22 more) | 1 (`src/pages/returns-mgmt/ReturnDetail.tsx:624`) | 11 (`supabase/migrations/20260820095107_f5e3d00e-50b7-49ce-8a09-11d4fa335f07.sql:342` + 10 more) | 16 (`supabase/migrations/20260720105028_a04adec4-3f16-439e-b7bd-c7f411193e0c.sql:36` + 15 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | 4 (`supabase/migrations/20260720095919_51ddfd1e-df7a-4cb3-b3f7-86f142211f23.sql:128` + 3 more) | 14 (`supabase/migrations/20260720091329_a46a13ca-f072-4db6-bd1c-984c611c08cb.sql:52` + 13 more) | 2 (`supabase/migrations/20260720095919_51ddfd1e-df7a-4cb3-b3f7-86f142211f23.sql:208` + 1 more) | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | 11 (`supabase/migrations/20260721130151_b2c61ac4-8750-4e43-bff6-7bfc4d22a859.sql:199` + 10 more) | — | — | — |

## `role_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assign` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260820012251_b49086ce-e13a-4a98-a9fa-4c28f1366fb2.sql:156` + 1 more) | — | — |
| `assign_permissions` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260722061005_9fb94b33-3d1b-4e33-b06f-4217384f98fd.sql:117` + 2 more) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260721170250_0353a422-3ffe-444a-8508-1ec6d5bdeb20.sql:225` + 4 more) | — | — |
| `manage_catalog` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260824191930_3e101687-08e3-4c94-9f2a-0f340c24e06d.sql:43`) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260827032419_67587d87-9073-4377-b429-75459a1ab880.sql:266` + 2 more) | — | — |
| `reset` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:99` + 1 more) | 1 (`src/routes/adminRoutes.tsx:170`) | — | 13 (`supabase/migrations/20260819141014_6381baaa-97a3-47aa-9635-dd4e1df091d7.sql:276` + 12 more) | 5 (`supabase/migrations/20260824165313_c39b689d-267c-492f-bf44-9a98ce2a1eba.sql:488` + 4 more) | — | — |
| `view_catalog` | 🔵 Backend only | — | — | — | 2 (`supabase/migrations/20260820073932_e24ae24b-85b0-4269-8205-4157de2b17e1.sql:44` + 1 more) | — | — | — |
| `view_coverage` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `rule_engine`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `activate` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260803162930_d348595b-e3dd-4635-909e-5ce6732699f7.sql:169` + 1 more) | — | — |
| `deactivate` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260804042039_8e65e22f-0e1c-4cf2-b10f-26075a36c4e9.sql:26`) | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260803162930_d348595b-e3dd-4635-909e-5ce6732699f7.sql:153` + 3 more) | — | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `test` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | — | 4 (`src/routes/adminRoutes.tsx:208` + 3 more) | — | — | 1 (`supabase/migrations/20260803162930_d348595b-e3dd-4635-909e-5ce6732699f7.sql:152`) | — | — |
| `view_executions` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `security_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🔵 Backend only | — | — | — | 3 (`supabase/migrations/20260824142053_082aa91c-eb95-4039-bd22-2b9386de6fcd.sql:249` + 2 more) | 6 (`supabase/migrations/20260821185656_305fa541-cb1d-473e-858f-ad1d10fe849a.sql:101` + 5 more) | — | — |

## `settings`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🟢 Enforced | — | — | 6 (`src/pages/settings/IntegrationSettings.tsx:351` + 5 more) | 6 (`supabase/migrations/20260731093113_67d2e832-1fd3-4049-bf9f-28036fdfef2b.sql:209` + 5 more) | 2 (`supabase/migrations/20260804104350_d673c1c7-1d97-4192-9e26-e0b3cb5e814d.sql:385` + 1 more) | 3 (`supabase/migrations/20260721145805_015427a9-c149-4634-95d7-d8f2ee2ff917.sql:148` + 2 more) | — |
| `export` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `import` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 15 (`src/config/navigation.tsx:83` + 14 more) | 29 (`src/routes/adminRoutes.tsx:108` + 28 more) | — | 4 (`supabase/migrations/20260804065012_08abb314-e1b4-4aa5-a533-1e5230fd16c5.sql:87` + 3 more) | 5 (`supabase/migrations/20260804065012_08abb314-e1b4-4aa5-a533-1e5230fd16c5.sql:176` + 4 more) | — | — |

## `support_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view` | 🟢 Enforced | — | 1 (`src/routes/adminRoutes.tsx:168`) | — | — | 1 (`supabase/migrations/20260825070000_c01090c0-39d0-4e9d-ad04-e224b66365c1.sql:80`) | — | — |

## `user_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 3 (`supabase/migrations/20260820012251_b49086ce-e13a-4a98-a9fa-4c28f1366fb2.sql:155` + 2 more) | — | — |
| `view` | 🟢 Enforced | 3 (`src/config/navigation.tsx:98` + 2 more) | 4 (`src/routes/adminRoutes.tsx:166` + 3 more) | — | 3 (`supabase/migrations/20260824142053_082aa91c-eb95-4039-bd22-2b9386de6fcd.sql:251` + 2 more) | 7 (`supabase/migrations/20260824165313_c39b689d-267c-492f-bf44-9a98ce2a1eba.sql:487` + 6 more) | — | — |

## `workflow_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔵 Backend only | — | — | — | — | 4 (`supabase/migrations/20260820164107_d2193dbc-2390-4fb0-805d-49b21a87dc3c.sql:83` + 3 more) | — | — |
| `manage_config` | 🔵 Backend only | — | — | — | — | 8 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:23` + 7 more) | — | — |
| `publish` | 🔵 Backend only | — | — | — | — | 5 (`supabase/migrations/20260723062224_cb4c9505-767c-4011-82f6-b2abd1b2fbf3.sql:35` + 4 more) | — | — |
| `view` | 🟢 Enforced | 2 (`src/config/navigation.tsx:351` + 1 more) | 2 (`src/routes/dashboardRoutes.tsx:244` + 1 more) | — | — | 4 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:22` + 3 more) | — | — |
| `view_all` | 🔵 Backend only | — | — | — | — | 2 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:43` + 1 more) | — | — |
| `workflow_action` | 🔵 Backend only | — | — | — | — | 1 (`supabase/migrations/20260721133238_e2982c17-11f4-424d-986b-28f3d54a5c23.sql:35`) | — | — |
