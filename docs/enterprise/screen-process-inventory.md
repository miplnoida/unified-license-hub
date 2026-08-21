# Screen ↔ Process Inventory

**Mode:** discovery only — no code changed.
**Source of truth:** mechanical extraction of every `<Route path=…>` in `src/routes/*.tsx`
(`adminRoutes`, `dashboardRoutes`, `fpaRoutes`, `publicRoutes`, `returnsRoutes`, `settingsRoutes`).

- Active routed screens: **283** (incl. 14 compatibility redirects)
- Distinct page components: **245**
- Process families in use: **15 of 15**

Process codes: P01 Onboarding · P02 Entity Resolution & Registry · P03 Licensing ·
P04 Licence Lifecycle · P05 Fit & Proper · P06 Returns · P07 Prudential ·
P08 Conduct & Complaints · P09 Thematic · P10 Examination/Inspection ·
P11 Enforcement · P12 Correspondence & RFI · P13 Supervisory Intelligence ·
P14 Regulatory Configuration · P15 Platform Operations.

Route distribution: P14 44 · P06 34 · P05 29 · P08 25 · P01 24 · P07 22 ·
P12 19 · P15 19 · P03 17 · P02 12 · P13 8 · P04 6 · P09 4 · P10 3 · P11 3 · redirects 14.

Columns not machine-derivable per route (mutation ops, workflow source, owner source,
SLA source, next-action logic) are asserted per **process** in
`process-operating-model.md` and per **defect** in `workflow-ux-gap-register.md`,
because in this codebase they are properties of the module's hook/RPC layer, not of
the route declaration.

| Route | Page component | Audience | Permission module | Process | Screen type | Operational truth | Canonical status |
|---|---|---|---|---|---|---|---|
| `/admin` | AdminHub | internal | admin_dashboard | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/forms` | FormManagement | internal | form_management | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/forms/pre-license` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/forms/post-license` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/forms/internal` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/forms/create` | FormBuilder | internal | form_management | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/forms/:templateId/view` | FormTemplateView | internal | form_management | P14 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/config/licensing` | NavHubPage | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/config/returns-prudential` | NavHubPage | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/config/supervision` | NavHubPage | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/config/forms-master-data` | NavHubPage | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/workflow-engine` | NavHubPage | internal | settings | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/workflow-engine/rules` | NavHubPage | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/notification-engine` | NavHubPage | internal | settings | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/notification-engine/delivery` | NavHubPage | internal | settings | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/security-audit` | NavHubPage | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/config` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/returns/prudential` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/masters` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/masters/sectors` | MasterConfiguration | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/masters/sub-sectors` | MasterConfiguration | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/masters/categories` | MasterConfiguration | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/masters/services` | MasterConfiguration | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/master-data` | MasterDataManagement | internal | settings | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/regulatory-data-model` | RegulatoryDataModel | internal | settings | P06 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/regulatory-data-model/reporting` | ReportingMetricsConfig | internal | returns_management | P06 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/forms-packages` | FormsPackagesWorkspace | internal | form_management | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/fees` | FeeManagement | internal | fee_management | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/return-config` | ReturnConfiguration | internal | returns_management | P06 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/regulators` | RegulatorManagement | internal | settings | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/licensees` | ManageLicensees | internal | license_management | P04 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/licensees/:id` | LicenseeDetailPage | internal | license_management | P04 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/users` | UserManagement | internal | user_management | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/web-users` | ManageWebUsers | internal | user_management | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/roles` | RoleManagement | internal | role_management | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/permission-coverage` | PermissionCoverageReport | internal | role_management | P01 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/audit-logs` | AuditLogs | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/compliance-audit-logs` | ComplianceAuditLogs | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/integration-logs` | IntegrationLogs | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/escalations` | EscalationManager | internal | escalation_management | P14 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/notification-templates` | NotificationTemplates | internal | notification_management | P12 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/notification-events` | NotificationEvents | internal | notification_management | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/notification-history` | NotificationHistory | internal | notification_management | P12 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/notification-channel-health` | NotificationChannelHealth | internal | notification_management | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/complaint-types` | ComplaintTypes | internal | complaint_type | P08 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/approved-licensees` | ApprovedLicensees | internal | license_management | P04 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/registration-forms` | RegistrationFormBuilder | internal | form_management | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/registration-forms/preview` | RegistrationFormPreviewPage | internal | form_management | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/ppoc-mappings` | PpocManagement | internal | license_management | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/registration-review` | RegistrationReview | internal | registration_management | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/registration-review/:registrationId` | RegistrationReviewDetail | internal | registration_management | P01 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/license-action-forms` | LicenseActionFormsPage | internal | license_management | P04 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/rfi-auto-rules` | RfiAutoRules | internal | application_management | P03 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/supervisory-plan-templates` | SupervisoryPlanTemplates | internal | application_management | P07 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/applications/bulk-intake` | BulkIntake | internal | application_management | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/fp-screening-configs` | FpScreeningConfigs | internal | fit_and_proper_screening | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/fp-committees` | FpCommittees | internal | fit_and_proper_committee | P05 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/fp-sector-rules` | FpSectorDecisionRules | internal | fit_and_proper_screening | P05 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/case-audit` | CaseAuditTrail | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/case-audit/:entityType/:entityId` | CaseAuditTrail | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/early-warnings` | PrudentialEarlyWarnings | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/external-portal-access` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/admin/overrides` | RuleOverrides | internal | settings | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/conduct/risk-taxonomy` | ConductRiskTaxonomy | internal | market_conduct | P08 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/conduct/products-channels` | ConductProductsChannels | internal | market_conduct | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/conduct/triage-rules` | ConductTriageRules | internal | market_conduct | P08 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/sufficiency-rules` | SufficiencyRules | internal | license_management | P03 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/sufficiency-rule-sets` | SufficiencyRuleSets | internal | license_management | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/rule-engine` | RuleLibrary | internal | rule_engine | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/rule-engine/new` | RuleEditor | internal | rule_engine | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/rule-engine/test/:family/:id` | ModuleRuleTester | internal | rule_engine | P14 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/rule-engine/:id` | RuleEditor | internal | rule_engine | P14 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/decision-options` | DecisionOptions | internal | license_management | P03 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/queue` | ViewReturns | internal | returns_management | P06 | WORK_QUEUE | LEGACY_TABLE / MIXED | LEGACY |
| `/admin/returns/queue/:id` | ReturnDetail | internal | returns_management | P06 | WORK_QUEUE | LEGACY_TABLE / MIXED | LEGACY |
| `/admin/returns/queue/:id/analysis` | ReturnAnalysis | internal | returns_management | P06 | WORK_QUEUE | LEGACY_TABLE / MIXED | LEGACY |
| `/admin/returns/types` | ReturnTypesPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/configurations` | ReturnConfigsPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/cutoff` | CutoffConfigPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/due-dates` | DueDatesPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/late-fees` | LateFeesPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/notifications/templates` | NotifTemplatesPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/notifications/log` | NotifLogPage | internal | returns_management | P06 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/schedule` | ScheduleCalendarPage | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/validations` | ManageValidations | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/prudential/thresholds` | PrudentialThresholds | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/prudential/ratios` | PrudentialRatios | internal | returns_management | P06 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/returns/prudential/analytics` | PrudentialAnalytics | internal | returns_management | P06 | PORTFOLIO_ANALYTICS | LEGACY_TABLE / MIXED | LEGACY |
| `/dashboard` | Dashboard | internal | — | P13 | DASHBOARD | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/applications` | ApplicationsList | external+internal | can_view_status | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/applications/new` | NewApplication | external+internal | can_submit | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/applications/:id/continue` | NewApplication | external+internal | — | P03 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/applications/queue` | ApplicationQueue | external+internal | application_management | P03 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/applications/:id` | ApplicationDetail | external+internal | — | P03 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/applications/:applicationId/forms` | ApplicationForms | external+internal | — | P03 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/pre-license/new` | NewApplication | external+internal | can_submit | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/post-license/new` | NewPostLicenseApplication | external+internal | can_submit | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/post-licensee/applications/:applicationId/forms` | PostLicenseApplicationForms | external+internal | — | P03 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/appeals` | MyAppeals | external+internal | can_view_status | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/license-appeals` | LicenseAppealsRegister | internal | license_appeals | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/appeal-panels` | LicenseAppealPanelsAdmin | internal | license_appeals | P03 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/licenses` | LicensesList | external+internal | can_view_status | P04 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/licenses/:id` | LicenseDetail | external+internal | can_view_status | P04 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/returns-management` | ViewReturns | internal | returns_management | P06 | REGISTER | LEGACY_TABLE / MIXED | LEGACY |
| `/returns-management/:id` | ReturnDetail | internal | returns_management | P06 | CASE_WORKSPACE | LEGACY_TABLE / MIXED | LEGACY |
| `/returns-management/:id/analysis` | ReturnAnalysis | internal | returns_management | P06 | CASE_WORKSPACE | LEGACY_TABLE / MIXED | LEGACY |
| `/compliance/returns` | ComplianceReturns | external+internal | can_view_status | P06 | REGISTER | LEGACY_TABLE / MIXED | LEGACY |
| `/compliance/returns/submit` | ReturnSubmission | external+internal | can_submit_returns | P06 | REGISTER | LEGACY_TABLE / MIXED | LEGACY |
| `/payments` | PaymentHistory | external+internal | can_view_status | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/payments/:id` | PaymentDetail | external+internal | can_view_status | P15 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints` | ComplaintsList | internal | complaint_management | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/analytics` | ComplaintsAnalytics | internal | complaint_management | P08 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/bulk-intake` | ComplaintBulkIntake | internal | complaint_management | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/duplicates` | DuplicateDetectionHub | internal | complaint_management | P08 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/escalations` | EscalationHub | internal | complaint_management | P08 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/rfi-approvals` | RfiApprovalQueue | internal | complaint_management | P08 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/track` | ComplaintTracking | internal | complaint_management | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/track/:reference` | ComplaintTracking | internal | complaint_management | P08 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/:id` | ComplaintDetail | internal | complaint_management | P08 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/workflows` | WorkflowList | internal | workflow_management | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/delegation-rules` | DelegationRules | internal | workflow_management | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/documents` | DocumentStore | external+internal | — | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/notifications` | NotificationCenter | internal | — | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/analytics` | AnalyticsDashboard | internal | report_management | P13 | PORTFOLIO_ANALYTICS | LEGACY_TABLE / MIXED | LEGACY |
| `/analytics/ai-insights` | AiInsightsHub | internal | report_management | P13 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/analytics/ai-reports` | SupervisoryAiReports | internal | report_management | P13 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/reports` | ReportsDashboard | internal | report_management | P13 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/reports/*` | ReportsDashboard | internal | report_management | P13 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/forms/:formId` | FormDetail | internal | — | P14 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/profile` | Profile | internal | — | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/change-password` | ChangePassword | internal | — | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/preview/:versionId` | FormPreview | internal | form_management | P14 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/change-sector` | ChangeActiveSector | external+internal | can_view_status | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registration-status` | RegistrationStatusPage | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/coordination` | CoordinationList | internal | coordination | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/coordination/:caseId` | CoordinationDetail | internal | coordination | P15 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/enforcement` | EnforcementList | internal | enforcement_management | P11 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/enforcement/:id` | EnforcementDetail | internal | enforcement_management | P11 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/billing/penalties` | Penalties | internal | fee_management | P11 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/breaches` | BreachInbox | internal | prudential_supervision | P07 | WORK_QUEUE | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/inspections` | InspectionsList | internal | inspection_management | P10 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/inspections/schedule` | InspectionsCalendar | internal | inspection_management | P10 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/inspections/:id` | InspectionDetail | internal | inspection_management | P10 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/plans` | SupervisoryPlansDashboard | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/team-performance` | SupervisoryTeamPerformance | internal | prudential_supervision | P07 | PORTFOLIO_ANALYTICS | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/supervision/risk` | RiskHeatmap | internal | prudential_supervision | P07 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/executive` | ExecutiveDashboard | internal | report_management | P13 | DASHBOARD | LEGACY_TABLE / MIXED | LEGACY |
| `/alerts` | AlertCenter | internal | returns_management | P13 | WORK_QUEUE | LEGACY_TABLE / MIXED | LEGACY |
| `/admin/correspondence-templates` | CorrespondenceTemplates | internal | settings | P12 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/document-intelligence` | DocumentIntelligence | internal | settings | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/api-keys` | ApiKeys | internal | settings | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/audit-export` | AuditExport | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/security-events` | SecurityEvents | internal | settings | P15 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/sla-manager` | SlaManager | internal | settings | P14 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct` | ConductDashboard | internal | market_conduct | P08 | DASHBOARD | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/alerts` | ConductAlerts | internal | market_conduct | P08 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/surveillance` | SurveillanceWorkspace | internal | market_conduct | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/actions` | ConductActions | internal | market_conduct | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/thematic-reviews` | ThematicReviews | internal | market_conduct | P09 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/thematic-reviews/new` | NewThematicReview | internal | market_conduct | P09 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/thematic-reviews/:id` | ThematicReviewDetail | internal | market_conduct | P09 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/supervision/thematic-closure-approvals` | ThematicClosureQueue | internal | market_conduct | P09 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/conduct/monitoring-rules` | MonitoringRules | internal | market_conduct | P08 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/entities` | ConductEntitiesList | internal | market_conduct | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/entities/:id` | ConductEntityProfile | internal | market_conduct | P08 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/supervision-loop` | SupervisionLoop | internal | market_conduct | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/investigations` | Investigations | internal | market_conduct | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/closure-approvals` | InvestigationClosureQueue | internal | market_conduct | P08 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/conduct/investigations/:id` | InvestigationDetail | internal | market_conduct | P08 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/complaints/internal/new` | NewInternalComplaint | internal | complaint_management | P08 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/prudential/dashboard` | PrudentialDashboard | internal | prudential_supervision | P07 | DASHBOARD | LEGACY_TABLE / MIXED | LEGACY |
| `/prudential/entities` | PrudentialEntitiesList | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/entities/:id` | PrudentialEntityProfile | internal | prudential_supervision | P07 | CASE_WORKSPACE | LEGACY_TABLE / MIXED | LEGACY |
| `/prudential/groups` | FinancialGroupsList | internal | prudential_supervision | P07 | REGISTER | LEGACY_TABLE / MIXED | LEGACY |
| `/prudential/groups/:groupId` | FinancialGroupProfile | internal | prudential_supervision | P07 | CASE_WORKSPACE | LEGACY_TABLE / MIXED | LEGACY |
| `/prudential/assessments` | AssessmentsList | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/assessments/:id` | AssessmentDetail | internal | prudential_supervision | P07 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/actions` | ActionsList | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/escalations` | EscalationsList | internal | prudential_supervision | P07 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/examinations` | ExaminationsList | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/examinations/:id` | ExaminationWorkspace | internal | prudential_supervision | P07 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/payment-systems` | PaymentSystemsOversight | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/payment-systems/:operatorId` | PaymentOperatorProfile | internal | prudential_supervision | P07 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/pfmi-assessments/:assessmentId` | PfmiAssessmentWizard | internal | prudential_supervision | P07 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/prudential/stress-indicators` | StressIndicatorsAdmin | internal | prudential_supervision | P07 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/prudential-taxonomy` | PrudentialTaxonomyAdmin | internal | prudential_supervision | P07 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/correspondence` | CorrespondenceDashboard | internal | notification_management | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/correspondence/dashboard` | CorrespondenceDashboard | internal | notification_management | P12 | DASHBOARD | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/correspondence/manager` | CorrespondenceManager | internal | notification_management | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/correspondence/inbox` | CorrespondenceInbox | internal | notification_management | P12 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/correspondence/records` | CorrespondenceRecords | internal | notification_management | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/correspondence/:id` | CorrespondenceDetail | internal | notification_management | P12 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/correspondence-routing` | CorrespondenceRoutingRules | internal | settings | P12 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entity/correspondence` | MyCorrespondence | external+internal | — | P12 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entity/correspondence/:id` | MyCorrespondenceDetail | external+internal | — | P12 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entity/complaint-rfis` | MyComplaintRfis | external+internal | — | P12 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entity/supervisory-actions` | MySupervisoryActions | external+internal | — | P12 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entities` | EntityDirectory | internal | license_management | P02 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entities/:entityId` | Entity360Detail | internal | license_management | P02 | CASE_WORKSPACE | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/entities/:entityId/structure` | EntityStructureHub | internal | license_management | P02 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entities/:entityId/360` | Entity360Redirect | internal | — | P02 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/licensing/entity-resolution` | EntityResolutionQueue | internal | entity_resolution | P02 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/licensing/entity-resolution/:caseId` | EntityResolutionDetail | internal | entity_resolution | P02 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/admin/entity-memberships` | EntityMemberships | internal | entity_membership | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa` | FpaDashboard | internal | — | P05 | DASHBOARD | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/processes` | FpaProcessList | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/individuals` | FpaIndividuals | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/individuals/:id` | FpaIndividualProfile | internal | — | P05 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/initiation` | FpaInitiation | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/declarations` | FpaDeclarations | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/screening` | FpaScreening | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/manual-tasks` | FpaManualTasks | internal | — | P05 | WORK_QUEUE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/manual-tasks/:id` | FpaManualTaskDetail | internal | — | P05 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/findings` | FpaFindings | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/findings/:id` | FpaFindingDetail | internal | — | P05 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/trends` | FpaTrends | internal | — | P05 | PORTFOLIO_ANALYTICS | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/ai-analysis` | FpaAiAnalysis | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/sector-rules` | FpaSectorRules | internal | — | P05 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/determinations` | FpaDeterminations | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/committee` | FpaCommittee | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/conditions` | FpaConditions | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/appeals` | FpaAppeals | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/monitoring` | FpaMonitoring | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/notifications` | FpaNotificationLog | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/scheduler` | FpaScheduler | internal | — | P05 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/initiation-log` | FpaInitiationLog | internal | — | P05 | AUDIT_HISTORY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/invitations` | FpaInvitationTracker | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/assessments/:id` | FpaAssessmentRedirect | internal | — | P05 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/entity/:type/:id` | FpaEntityRedirect | internal | — | P05 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/fpa/training` | FpaTraining | internal | — | P05 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/` | Index | internal | — | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/login` | Login | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/register` | Register | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/register/entity` | EntityIdentification | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/register/legacy` | PreLicenseeRegistration | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registration/pre-licensee` | Navigate | public | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/registration/success` | RegistrationSuccess | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registration/portal` | RegistrationPortal | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registration/portal/form/:formId` | UpdateRegistrationRedirect | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/update-registration-form` | PreLicenseeRegistration | internal | — | P01 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/update-registration-form/:registrationId` | UpdateRegistrationRedirect | internal | — | P01 | CASE_WORKSPACE | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registration/update/:registrationId` | PreLicenseeRegistration | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/forgot-password` | ForgotPassword | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/reset-password` | ResetPassword | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registry` | PublicRegistry | public | — | P02 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registry/licensees` | PublicLicensees | public | — | P02 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registry/licensees/:id` | PublicLicenseeDetail | public | — | P02 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registry/enforcement` | PublicEnforcement | public | — | P02 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registry/entities` | PublicEntityRegister | public | — | P02 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/registry/entities/:slug` | PublicEntityDetail | public | — | P02 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/declaration/:token` | DeclarationLanding | public | — | P01 | EXTERNAL_JOURNEY | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/track/complaint` | Navigate | public | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/complaints/submit` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/complaints/new` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/submit-complaint` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `*` | NotFound | internal | — | P15 | REGISTER | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/entity/returns/dashboard` | EntityReturnsDashboard | external+internal | can_view_status | P06 | DASHBOARD | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/entity/returns` | EntityReturnsWorkspace | external+internal | can_view_status | P06 | EXTERNAL_JOURNEY | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/entity/returns/filings/:filingId` | EntityFilingWorkspace | external+internal | can_view_status | P06 | EXTERNAL_JOURNEY | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/entity/returns/legacy` | MyReturnsPage | external+internal | can_view_status | P06 | EXTERNAL_JOURNEY | LEGACY_TABLE / MIXED | LEGACY |
| `/entity/returns/new` | CreateReturnPage | external+internal | can_submit_returns | P06 | EXTERNAL_JOURNEY | LEGACY_TABLE / MIXED | LEGACY |
| `/entity/returns/:id/fill` | FillReturnPage | external+internal | can_submit_returns | P06 | EXTERNAL_JOURNEY | LEGACY_TABLE / MIXED | LEGACY |
| `/entity/returns/:id/view` | ViewReturnPage | external+internal | can_view_status | P06 | EXTERNAL_JOURNEY | LEGACY_TABLE / MIXED | LEGACY |
| `/returns/queue` | ReturnsFilingQueue | internal | returns_management | P06 | WORK_QUEUE | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/returns/obligations` | EntityObligationsWorkbench | internal | returns_management | P06 | WORK_QUEUE | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/returns/calendar` | EntityReportingCalendar | internal | returns_management | P06 | REGISTER | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/returns/filings/:filingId` | FilingDetail | internal | returns_management | P06 | CASE_WORKSPACE | CANONICAL_SERVER_READ_MODEL / CANONICAL_TABLE_WITH_RLS | CANONICAL |
| `/returns/configuration` | Navigate | internal | — | n/a | COMPATIBILITY_ONLY | n/a | REDIRECT |
| `/settings` | SettingsHub | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/general` | GeneralSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/payments` | PaymentSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/schedule` | ScheduleSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/notifications` | NotificationSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/security` | SecuritySettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/branding` | BrandingSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/email-sms` | EmailSmsSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/integrations` | IntegrationSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/data` | DataManagementSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/applications` | ApplicationFormSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/license-expiry` | LicenseExpirySettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/certificate-signatory` | CertificateSignatorySettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
| `/settings/captcha` | CaptchaSettings | internal | — | P14 | CONFIGURATION | CANONICAL_TABLE_WITH_RLS (client-composed) | CANONICAL |
