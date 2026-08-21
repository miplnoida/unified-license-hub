import { Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';
import { AdminRoute, ModuleRoute, PermissionRoute } from '@/components/auth/RouteGuards';
import type { PermissionModule } from '@/lib/permissionModules';

const AdminHub = lazy(() => import('@/pages/admin/AdminHub'));
const NavHubPage = lazy(() => import('@/pages/admin/NavHubPage'));
const FormManagement = lazy(() => import('@/pages/admin/FormManagement'));
const FormBuilder = lazy(() => import('@/pages/admin/FormBuilder'));
const FormTemplateView = lazy(() => import('@/pages/admin/FormTemplateView'));
const MasterConfiguration = lazy(() => import('@/pages/admin/MasterConfiguration'));
const MasterDataManagement = lazy(() => import('@/pages/admin/MasterDataManagement'));
const RegulatoryDataModel = lazy(() => import('@/pages/admin/RegulatoryDataModel'));
const ReportingMetricsConfig = lazy(() => import('@/pages/admin/ReportingMetricsConfig'));
const FormsPackagesWorkspace = lazy(() => import('@/pages/admin/FormsPackagesWorkspace'));

const FeeManagement = lazy(() => import('@/pages/admin/FeeManagement'));
const ReturnConfiguration = lazy(() => import('@/pages/admin/ReturnConfiguration'));
const RegulatorManagement = lazy(() => import('@/pages/admin/RegulatorManagement'));
const ManageLicensees = lazy(() => import('@/pages/admin/ManageLicensees'));
const LicenseeDetailPage = lazy(() => import('@/pages/admin/LicenseeDetail'));
const UserManagement = lazy(() => import('@/pages/admin/UserManagement'));
const ManageWebUsers = lazy(() => import('@/pages/admin/ManageWebUsers'));
const RoleManagement = lazy(() => import('@/pages/admin/RoleManagement'));
const PermissionCoverageReport = lazy(() => import('@/pages/admin/PermissionCoverageReport'));
const AuditLogs = lazy(() => import('@/pages/admin/AuditLogs'));
const ComplianceAuditLogs = lazy(() => import('@/pages/admin/ComplianceAuditLogs'));
const IntegrationLogs = lazy(() => import('@/pages/admin/IntegrationLogs'));
const NotificationTemplates = lazy(() => import('@/pages/admin/NotificationTemplates'));
const NotificationEvents = lazy(() => import('@/pages/admin/NotificationEvents'));
const EscalationManager = lazy(() => import('@/pages/admin/EscalationManager'));
const NotificationHistory = lazy(() => import('@/pages/admin/NotificationHistory'));
const NotificationChannelHealth = lazy(() => import('@/pages/admin/NotificationChannelHealth'));
const ComplaintTypes = lazy(() => import('@/pages/admin/ComplaintTypes'));
const ApprovedLicensees = lazy(() => import('@/pages/admin/ApprovedLicensees'));
const RegistrationFormBuilder = lazy(() => import('@/pages/admin/RegistrationFormBuilder'));
const RegistrationFormPreviewPage = lazy(() => import('@/pages/admin/RegistrationFormPreviewPage'));
const PpocManagement = lazy(() => import('@/pages/admin/PpocManagement'));
const RegistrationReview = lazy(() => import('@/pages/admin/RegistrationReview'));
const RegistrationReviewDetail = lazy(() => import('@/pages/admin/RegistrationReviewDetail'));
const LicenseActionFormsPage = lazy(() => import('@/pages/admin/LicenseActionFormsPage'));
const RfiAutoRules = lazy(() => import('@/pages/admin/RfiAutoRules'));
const SupervisoryPlanTemplates = lazy(() => import('@/pages/admin/SupervisoryPlanTemplates'));
const BulkIntake = lazy(() => import('@/pages/admin/BulkIntake'));
const FpScreeningConfigs = lazy(() => import('@/pages/admin/FpScreeningConfigs'));
const FpCommittees = lazy(() => import('@/pages/admin/FpCommittees'));
const RuleOverrides = lazy(() => import('@/pages/admin/RuleOverrides'));
const RuleLibrary = lazy(() => import('@/pages/admin/RuleLibrary'));
const RuleEditor = lazy(() => import('@/pages/admin/RuleEditor'));
const ModuleRuleTester = lazy(() => import('@/pages/admin/ModuleRuleTester'));

const ConductRiskTaxonomy = lazy(() => import('@/pages/admin/conduct/RiskTaxonomy'));
const ConductProductsChannels = lazy(() => import('@/pages/admin/conduct/ProductsChannels'));
const ConductTriageRules = lazy(() => import('@/pages/admin/conduct/TriageRules'));
const SufficiencyRules = lazy(() => import('@/pages/admin/SufficiencyRules'));
const SufficiencyRuleSets = lazy(() => import('@/pages/admin/SufficiencyRuleSets'));
const DecisionOptions = lazy(() => import('@/pages/admin/DecisionOptions'));
const FpSectorDecisionRules = lazy(() => import('@/pages/admin/FpSectorDecisionRules'));
const CaseAuditTrail = lazy(() => import('@/pages/admin/CaseAuditTrail'));
const PrudentialEarlyWarnings = lazy(() => import('@/pages/supervision/PrudentialEarlyWarnings'));



// Returns Management - Admin
const LegacyReturnFilingRedirect = lazy(() => import('@/routes/LegacyReturnFilingRedirect'));
const ReturnTypesPage = lazy(() => import('@/pages/admin/returns/ReturnTypesPage'));
const ReturnConfigsPage = lazy(() => import('@/pages/admin/returns/ReturnConfigsPage'));
const CutoffConfigPage = lazy(() => import('@/pages/admin/returns/CutoffConfigPage'));
const DueDatesPage = lazy(() => import('@/pages/admin/returns/DueDatesPage'));
const LateFeesPage = lazy(() => import('@/pages/admin/returns/LateFeesPage'));
const NotifTemplatesPage = lazy(() => import('@/pages/admin/returns/NotifTemplatesPage'));
const NotifLogPage = lazy(() => import('@/pages/admin/returns/NotifLogPage'));
const ScheduleCalendarPage = lazy(() => import('@/pages/admin/returns/ScheduleCalendarPage'));
const ManageValidations = lazy(() => import('@/pages/returns-mgmt/ManageValidations'));
const PrudentialThresholds = lazy(() => import('@/pages/returns-mgmt/PrudentialThresholds'));
const PrudentialRatios = lazy(() => import('@/pages/returns-mgmt/PrudentialRatios'));
const PrudentialAnalytics = lazy(() => import('@/pages/returns-mgmt/PrudentialAnalytics'));

function A({ children }: { children: React.ReactNode }) {
  return <P><AdminRoute>{children}</AdminRoute></P>;
}

/** Admin route + dynamic module permission check */
function M({ module, children }: { module: PermissionModule; children: React.ReactNode }) {
  return <P><ModuleRoute module={module}>{children}</ModuleRoute></P>;
}

export const adminRoutes = (
  <>
    <Route path="/admin" element={<M module="admin_dashboard"><AdminHub /></M>} />

    <Route path="/admin/forms" element={<P><ModuleRoute module="form_management" allowedRoles={['super_admin','admin','developer']}><FormManagement /></ModuleRoute></P>} />
    <Route path="/admin/forms/pre-license" element={<Navigate to="/admin/forms?tab=pre_license" replace />} />
    <Route path="/admin/forms/post-license" element={<Navigate to="/admin/forms?tab=post_license" replace />} />
    <Route path="/admin/forms/internal" element={<Navigate to="/admin/forms?tab=internal" replace />} />
    <Route path="/admin/forms/create" element={<P><ModuleRoute module="form_management" allowedRoles={['super_admin','admin','developer']}><FormBuilder /></ModuleRoute></P>} />
    <Route path="/admin/forms/:templateId/view" element={<P><ModuleRoute module="form_management" allowedRoles={['super_admin','admin','developer']}><FormTemplateView /></ModuleRoute></P>} />

    {/* Database-driven configuration hubs. These collapse whole levels of menu
        nesting into one entry that lists only the tools the user may open. */}
    <Route
      path="/admin/config/licensing"
      element={<M module="settings"><NavHubPage navKey="nav_adm_cfg_licensing" title="Licensing & Registration Configuration" description="Application and registration forms, fees, RFI automation, regulators and portal access." /></M>}
    />
    <Route
      path="/admin/config/returns-prudential"
      element={<M module="settings"><NavHubPage navKey="nav_adm_cfg_returns_prud" title="Returns & Prudential Configuration" description="Return types, schedules, cut-offs, late fees, prudential thresholds, ratios and validations." /></M>}
    />
    <Route
      path="/admin/config/supervision"
      element={<M module="settings"><NavHubPage navKey="nav_adm_cfg_supervision" title="Supervision Configuration" description="Complaint taxonomy, triage and monitoring rules, supervisory plans and Fit & Proper policy." /></M>}
    />
    <Route
      path="/admin/config/forms-master-data"
      element={<M module="settings"><NavHubPage navKey="nav_adm_cfg_forms_data" title="Forms & Master Data" description="Sector taxonomy, master configuration, reference data and document intelligence." /></M>}
    />
    <Route
      path="/admin/workflow-engine"
      element={<M module="settings"><NavHubPage navKey="nav_adm_wf_overview" title="Workflow Engine" description="Workflow definitions, rule engine, decision options and sufficiency rules." /></M>}
    />
    <Route
      path="/admin/workflow-engine/rules"
      element={<M module="settings"><NavHubPage navKey="nav_adm_wf_rules" title="Rules & Approvals" description="Delegation rules, SLA management, escalation alerts and approval overrides." /></M>}
    />
    <Route
      path="/admin/notification-engine"
      element={<M module="settings"><NavHubPage navKey="nav_adm_notif_overview" title="Notification Engine" description="Routing rules, correspondence templates and email/SMS configuration." /></M>}
    />
    <Route
      path="/admin/notification-engine/delivery"
      element={<M module="settings"><NavHubPage navKey="nav_adm_notif_delivery" title="Delivery & Channels" description="Notification history and channel health monitoring." /></M>}
    />
    <Route
      path="/admin/security-audit"
      element={<M module="settings"><NavHubPage navKey="nav_adm_sec_system_events" title="System Events" description="Compliance audit, integration logs, audit exports and per-case audit trails." /></M>}
    />

    {/* Legacy hub paths */}
    <Route path="/admin/returns/config" element={<Navigate to="/admin/config/returns-prudential" replace />} />
    <Route path="/admin/returns/prudential" element={<Navigate to="/admin/config/returns-prudential" replace />} />


    <Route path="/admin/masters" element={<Navigate to="/admin/masters/sectors" replace />} />
    <Route path="/admin/masters/sectors" element={<M module="settings"><MasterConfiguration /></M>} />
    <Route path="/admin/masters/sub-sectors" element={<M module="settings"><MasterConfiguration /></M>} />
    <Route path="/admin/masters/categories" element={<M module="settings"><MasterConfiguration /></M>} />
    <Route path="/admin/masters/services" element={<M module="settings"><MasterConfiguration /></M>} />

    <Route path="/admin/master-data" element={<M module="settings"><MasterDataManagement /></M>} />
    <Route path="/admin/regulatory-data-model" element={<M module="settings"><RegulatoryDataModel /></M>} />
    <Route path="/admin/regulatory-data-model/reporting" element={<P><PermissionRoute module="returns_management" action="manage_config"><ReportingMetricsConfig /></PermissionRoute></P>} />
    <Route path="/admin/forms-packages" element={<M module="form_management"><FormsPackagesWorkspace /></M>} />

    <Route path="/admin/fees" element={<M module="fee_management"><FeeManagement /></M>} />
    <Route path="/admin/return-config" element={<M module="returns_management"><ReturnConfiguration /></M>} />
    <Route path="/admin/regulators" element={<M module="settings"><RegulatorManagement /></M>} />
    <Route path="/admin/licensees" element={<M module="license_management"><ManageLicensees /></M>} />
    <Route path="/admin/licensees/:id" element={<M module="license_management"><LicenseeDetailPage /></M>} />
    <Route path="/admin/users" element={<M module="user_management"><UserManagement /></M>} />
    <Route path="/admin/web-users" element={<M module="user_management"><ManageWebUsers /></M>} />
    <Route path="/admin/roles" element={<M module="role_management"><RoleManagement /></M>} />
    <Route path="/admin/permission-coverage" element={<P><PermissionRoute module="role_management" action="view_coverage"><PermissionCoverageReport /></PermissionRoute></P>} />

    <Route path="/admin/audit-logs" element={<M module="settings"><AuditLogs /></M>} />
    <Route path="/admin/compliance-audit-logs" element={<M module="settings"><ComplianceAuditLogs /></M>} />
    <Route path="/admin/integration-logs" element={<M module="settings"><IntegrationLogs /></M>} />
    <Route path="/admin/escalations" element={<M module="escalation_management"><EscalationManager /></M>} />
    <Route path="/admin/notification-templates" element={<M module="notification_management"><NotificationTemplates /></M>} />
    <Route path="/admin/notification-events" element={<M module="notification_management"><NotificationEvents /></M>} />
    <Route path="/admin/notification-history" element={<M module="notification_management"><NotificationHistory /></M>} />
    <Route path="/admin/notification-channel-health" element={<M module="notification_management"><NotificationChannelHealth /></M>} />
    <Route path="/admin/complaint-types" element={<M module="complaint_type"><ComplaintTypes /></M>} />
    <Route path="/admin/approved-licensees" element={<M module="license_management"><ApprovedLicensees /></M>} />
    <Route path="/admin/registration-forms" element={<M module="form_management"><RegistrationFormBuilder /></M>} />
    <Route path="/admin/registration-forms/preview" element={<M module="form_management"><RegistrationFormPreviewPage /></M>} />
    <Route path="/admin/ppoc-mappings" element={<M module="license_management"><PpocManagement /></M>} />
    <Route path="/admin/registration-review" element={<M module="registration_management"><RegistrationReview /></M>} />
    <Route path="/admin/registration-review/:registrationId" element={<M module="registration_management"><RegistrationReviewDetail /></M>} />
    <Route path="/admin/license-action-forms" element={<M module="license_management"><LicenseActionFormsPage /></M>} />
    <Route path="/admin/rfi-auto-rules" element={<M module="application_management"><RfiAutoRules /></M>} />
    <Route path="/admin/supervisory-plan-templates" element={<M module="application_management"><SupervisoryPlanTemplates /></M>} />
    <Route path="/admin/applications/bulk-intake" element={<M module="application_management"><BulkIntake /></M>} />
    <Route path="/admin/fp-screening-configs" element={<M module="fit_and_proper_screening"><FpScreeningConfigs /></M>} />
    <Route path="/admin/fp-committees" element={<M module="fit_and_proper_committee"><FpCommittees /></M>} />
    <Route path="/admin/fp-sector-rules" element={<M module="fit_and_proper_screening"><FpSectorDecisionRules /></M>} />
    <Route path="/admin/case-audit" element={<M module="settings"><CaseAuditTrail /></M>} />
    <Route path="/admin/case-audit/:entityType/:entityId" element={<M module="settings"><CaseAuditTrail /></M>} />
    <Route path="/supervision/early-warnings" element={<M module="prudential_supervision"><PrudentialEarlyWarnings /></M>} />
    <Route path="/admin/external-portal-access" element={<Navigate to="/admin/roles" replace />} />
    <Route path="/admin/overrides" element={<M module="settings"><RuleOverrides /></M>} />
    <Route path="/admin/conduct/risk-taxonomy" element={<M module="market_conduct"><ConductRiskTaxonomy /></M>} />
    <Route path="/admin/conduct/products-channels" element={<M module="market_conduct"><ConductProductsChannels /></M>} />
    <Route path="/admin/conduct/triage-rules" element={<M module="market_conduct"><ConductTriageRules /></M>} />
    <Route path="/admin/sufficiency-rules" element={<M module="license_management"><SufficiencyRules /></M>} />
    <Route path="/admin/sufficiency-rule-sets" element={<M module="license_management"><SufficiencyRuleSets /></M>} />
    <Route path="/admin/rule-engine" element={<M module="rule_engine"><RuleLibrary /></M>} />
    <Route path="/admin/rule-engine/new" element={<M module="rule_engine"><RuleEditor /></M>} />
    <Route path="/admin/rule-engine/test/:family/:id" element={<M module="rule_engine"><ModuleRuleTester /></M>} />
    <Route path="/admin/rule-engine/:id" element={<M module="rule_engine"><RuleEditor /></M>} />

    <Route path="/admin/decision-options" element={<M module="license_management"><DecisionOptions /></M>} />
    
    


    {/* Returns Management - Admin */}
    {/* EPR-01 — COMPATIBILITY_ONLY. The canonical internal Returns spine is
        /returns/queue + /returns/filings/:filingId. */}
    <Route path="/admin/returns/queue" element={<Navigate to="/returns/queue" replace />} />
    <Route path="/admin/returns/queue/:id" element={<M module="returns_management"><LegacyReturnFilingRedirect /></M>} />
    <Route path="/admin/returns/queue/:id/analysis" element={<M module="returns_management"><LegacyReturnFilingRedirect /></M>} />
    <Route path="/admin/returns/types" element={<M module="returns_management"><ReturnTypesPage /></M>} />
    <Route path="/admin/returns/configurations" element={<M module="returns_management"><ReturnConfigsPage /></M>} />
    <Route path="/admin/returns/cutoff" element={<M module="returns_management"><CutoffConfigPage /></M>} />
    <Route path="/admin/returns/due-dates" element={<M module="returns_management"><DueDatesPage /></M>} />
    <Route path="/admin/returns/late-fees" element={<M module="returns_management"><LateFeesPage /></M>} />
    <Route path="/admin/returns/notifications/templates" element={<M module="returns_management"><NotifTemplatesPage /></M>} />
    <Route path="/admin/returns/notifications/log" element={<M module="returns_management"><NotifLogPage /></M>} />
    <Route path="/admin/returns/schedule" element={<M module="returns_management"><ScheduleCalendarPage /></M>} />
    <Route path="/admin/returns/validations" element={<M module="returns_management"><ManageValidations /></M>} />
    <Route path="/admin/returns/prudential/thresholds" element={<M module="returns_management"><PrudentialThresholds /></M>} />
    <Route path="/admin/returns/prudential/ratios" element={<M module="returns_management"><PrudentialRatios /></M>} />
    <Route path="/admin/returns/prudential/analytics" element={<M module="returns_management"><PrudentialAnalytics /></M>} />
  </>
);
