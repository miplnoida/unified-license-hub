# Permission Coverage Matrix

_Generated 2026-07-21T06:16:04.057Z. Do not edit by hand — run `bunx tsx scripts/generate-permission-coverage.ts`._

**Total permissions:** 123  `|`  **Orphaned:** 99

Coverage classes:

- 🟢 **Enforced** — appears in at least one UI surface **and** at least one backend surface (RLS / RPC / storage).
- 🔵 **Backend only** — enforced by RLS / RPC / storage but no UI surface uses it. Safe, but the button that would trigger it is missing.
- 🟡 **UI only** — a menu / route / button / report references it but no RLS / RPC / storage guard enforces it server-side. Frontend gate only — not security.
- 🔴 **Orphaned** — used nowhere. Cannot be assigned to a role (server trigger `permission_orphaned` blocks it).

## Orphaned permissions

These permissions exist in the `permissions` catalog but have no enforcement path anywhere. Either wire them up, or set `permissions.enforced = false` to make the intent explicit.

| Module | Action |
| --- | --- |
| `application_management` | `create` |
| `application_management` | `edit` |
| `application_management` | `reject` |
| `complaint_management` | `create` |
| `complaint_management` | `edit` |
| `complaint_management` | `submit` |
| `complaint_management` | `upload_documents` |
| `complaint_management` | `view_status` |
| `complaint_type` | `create` |
| `complaint_type` | `edit` |
| `coordination` | `admin` |
| `coordination` | `create` |
| `coordination` | `delete` |
| `coordination` | `update` |
| `executive_oversight` | `drill_into_cases` |
| `executive_oversight` | `receive_ai_insights` |
| `executive_oversight` | `view_all_dashboards` |
| `executive_oversight` | `view_all_reports` |
| `executive_oversight` | `view_cross_module_audit` |
| `fee_management` | `create` |
| `fee_management` | `edit` |
| `fit_and_proper` | `admin` |
| `fit_and_proper` | `create` |
| `fit_and_proper` | `delete` |
| `fit_and_proper` | `submit` |
| `fit_and_proper` | `update` |
| `fit_and_proper` | `upload_documents` |
| `fit_and_proper` | `view_status` |
| `fit_and_proper_committee` | `cast_weighted_vote` |
| `fit_and_proper_committee` | `provide_rationale` |
| `fit_and_proper_initiation` | `initiate_assessment` |
| `fit_and_proper_initiation` | `manage_initiation_types` |
| `fit_and_proper_initiation` | `view` |
| `fit_and_proper_screening` | `issue_determination` |
| `fit_and_proper_screening` | `manage_conditions_monitoring` |
| `fit_and_proper_screening` | `manage_screening` |
| `fit_and_proper_screening` | `record_adverse_findings` |
| `fit_and_proper_screening` | `run_ai_analysis` |
| `form_management` | `create` |
| `form_management` | `edit` |
| `license_management` | `approve` |
| `license_management` | `create` |
| `license_management` | `edit` |
| `license_management` | `manage_license_actions` |
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
| `licensing` | `view` |
| `licensing` | `view_status` |
| `market_conduct` | `initiate_investigation` |
| `market_conduct` | `initiate_thematic_review` |
| `market_conduct` | `issue_enforcement_action` |
| `market_conduct` | `manage_complaints` |
| `market_conduct` | `manage_monitoring_rules` |
| `market_conduct` | `run_conduct_analytics` |
| `market_conduct_investigation` | `access_investigation_workspace` |
| `market_conduct_investigation` | `conduct_interviews` |
| `market_conduct_investigation` | `manage_evidence_repository` |
| `market_conduct_investigation` | `prepare_investigation_report` |
| `market_conduct_investigation` | `view` |
| `prudential_payment_systems` | `conduct_pfmi_assessment` |
| `prudential_payment_systems` | `manage_payment_workflow` |
| `prudential_payment_systems` | `oversee_msb` |
| `prudential_payment_systems` | `supervise_fmi` |
| `prudential_payment_systems` | `view` |
| `prudential_supervision` | `conduct_onsite_examination` |
| `prudential_supervision` | `initiate_supervisory_action` |
| `prudential_supervision` | `manage_remediation` |
| `prudential_supervision` | `record_camels_assessment` |
| `prudential_supervision` | `review_returns` |
| `prudential_supervision` | `run_analytics` |
| `prudential_supervision` | `set_ewi_rules` |
| `registration_management` | `approve` |
| `registration_management` | `create` |
| `registration_management` | `edit` |
| `registration_management` | `reject` |
| `report_management` | `create` |
| `returns_management` | `create` |
| `returns_management` | `edit` |
| `returns_management` | `respond_rfi` |
| `returns_management` | `submit` |
| `returns_management` | `upload_documents` |
| `returns_management` | `view_status` |
| `role_management` | `create` |
| `role_management` | `edit` |
| `settings` | `edit` |
| `user_management` | `create` |
| `user_management` | `edit` |
| `workflow_management` | `create` |
| `workflow_management` | `edit` |

## `application_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟡 UI only | — | — | 1 (`src/components/auth/PermissionGate.tsx:24`) | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 2 (`src/config/navigation.tsx:83` + 1 more) | 7 (`src/routes/adminRoutes.tsx:118` + 6 more) | — | — | — | — | — |

## `complaint_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 3 (`src/config/navigation.tsx:117` + 2 more) | 5 (`src/routes/dashboardRoutes.tsx:169` + 4 more) | — | — | — | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `complaint_type`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:120`) | 1 (`src/routes/adminRoutes.tsx:110`) | — | — | — | — | — |

## `coordination`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `update` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:184`) | 2 (`src/routes/dashboardRoutes.tsx:188` + 1 more) | — | — | — | — | — |

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
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:233`) | 2 (`src/routes/adminRoutes.tsx:96` + 1 more) | — | — | — | — | — |

## `fit_and_proper`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `delete` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `update` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 21 (`src/config/navigation.tsx:138` + 20 more) | 26 (`src/routes/dashboardRoutes.tsx:190` + 25 more) | — | — | — | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_committee`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cast_weighted_vote` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `provide_rationale` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | — | 1 (`src/routes/adminRoutes.tsx:122`) | — | — | — | — | — |

## `fit_and_proper_initiation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `initiate_assessment` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_initiation_types` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `fit_and_proper_screening`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `issue_determination` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_conditions_monitoring` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_screening` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `record_adverse_findings` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `run_ai_analysis` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | — | 2 (`src/routes/adminRoutes.tsx:121` + 1 more) | — | — | — | — | — |

## `form_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 2 (`src/config/navigation.tsx:216` + 1 more) | 5 (`src/routes/adminRoutes.tsx:82` + 4 more) | — | — | — | — | — |

## `license_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_license_actions` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 3 (`src/config/navigation.tsx:54` + 2 more) | 10 (`src/routes/adminRoutes.tsx:99` + 9 more) | — | — | — | — | — |

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
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `market_conduct`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `initiate_investigation` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `initiate_thematic_review` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `issue_enforcement_action` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_complaints` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_monitoring_rules` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `run_conduct_analytics` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 10 (`src/config/navigation.tsx:121` + 9 more) | 14 (`src/routes/adminRoutes.tsx:129` + 13 more) | — | — | — | — | — |

## `market_conduct_investigation`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `access_investigation_workspace` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `conduct_interviews` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_evidence_repository` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `prepare_investigation_report` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🔴 Orphaned | — | — | — | — | — | — | — |

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
| `conduct_onsite_examination` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `initiate_supervisory_action` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `manage_remediation` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `record_camels_assessment` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `review_returns` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `run_analytics` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `set_ewi_rules` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 7 (`src/config/navigation.tsx:190` + 6 more) | 9 (`src/routes/dashboardRoutes.tsx:229` + 8 more) | — | — | — | — | — |

## `registration_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `reject` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:86`) | 2 (`src/routes/adminRoutes.tsx:115` + 1 more) | — | — | — | — | — |

## `report_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 2 (`src/config/navigation.tsx:248` + 1 more) | 4 (`src/routes/dashboardRoutes.tsx:177` + 3 more) | 2 (`src/pages/returns-mgmt/ReturnDetail.tsx:628` + 1 more) | — | — | — | 26 (`src/pages/reports/ReportPage.tsx:1` + 25 more) |

## `returns_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approve` | 🟡 UI only | — | — | 4 (`src/pages/returns-mgmt/ReturnDetail.tsx:716` + 3 more) | — | — | — | — |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `export` | 🟡 UI only | — | — | 2 (`src/pages/returns-mgmt/ViewReturns.tsx:268` + 1 more) | — | — | — | — |
| `reject` | 🟡 UI only | — | — | 4 (`src/pages/returns-mgmt/ReturnDetail.tsx:741` + 3 more) | — | — | — | — |
| `respond_rfi` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `submit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `upload_documents` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟢 Enforced | 14 (`src/config/navigation.tsx:93` + 13 more) | 24 (`src/routes/adminRoutes.tsx:97` + 23 more) | 3 (`src/pages/returns-mgmt/ReturnDetail.tsx:615` + 2 more) | — | 2 (`supabase/migrations/20260720105028_a04adec4-3f16-439e-b7bd-c7f411193e0c.sql:36` + 1 more) | — | — |
| `view_all_entities` | 🔵 Backend only | — | — | — | 1 (`supabase/migrations/20260720095919_51ddfd1e-df7a-4cb3-b3f7-86f142211f23.sql:128`) | 8 (`supabase/migrations/20260720091329_a46a13ca-f072-4db6-bd1c-984c611c08cb.sql:52` + 7 more) | 1 (`supabase/migrations/20260720095919_51ddfd1e-df7a-4cb3-b3f7-86f142211f23.sql:208`) | — |
| `view_status` | 🔴 Orphaned | — | — | — | — | — | — | — |

## `role_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 2 (`src/config/navigation.tsx:67` + 1 more) | 2 (`src/routes/adminRoutes.tsx:103` + 1 more) | — | — | — | — | — |

## `settings`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 15 (`src/config/navigation.tsx:53` + 14 more) | 24 (`src/routes/adminRoutes.tsx:90` + 23 more) | — | — | — | — | — |

## `user_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 1 (`src/config/navigation.tsx:66`) | 2 (`src/routes/adminRoutes.tsx:101` + 1 more) | — | — | — | — | — |

## `workflow_management`

| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `edit` | 🔴 Orphaned | — | — | — | — | — | — | — |
| `view` | 🟡 UI only | 2 (`src/config/navigation.tsx:208` + 1 more) | 2 (`src/routes/dashboardRoutes.tsx:173` + 1 more) | — | — | — | — | — |
