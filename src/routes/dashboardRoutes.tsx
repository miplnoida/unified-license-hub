import { Navigate, Route } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { PortalRoute } from '@/components/auth/PortalRoute';
import type { PermissionModule } from '@/lib/permissionModules';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES } from '@/types/platform';
import type { PortalArea, PortalCapability } from '@/lib/portalAccess';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const LegacyReturnFilingRedirect = lazy(() => import('@/routes/LegacyReturnFilingRedirect'));
const ApplicationsList = lazy(() => import('@/pages/applications/ApplicationsList'));
const ApplicationQueue = lazy(() => import('@/pages/applications/ApplicationQueue'));
const ApplicationDetail = lazy(() => import('@/pages/applications/ApplicationDetail'));

const NewApplication = lazy(() => import('@/pages/NewApplication'));
const NewPostLicenseApplication = lazy(() => import('@/pages/NewPostLicenseApplication'));
const PostLicenseApplicationForms = lazy(() => import('@/pages/PostLicenseApplicationForms'));
const ApplicationForms = lazy(() => import('@/pages/ApplicationForms'));
const LicensesList = lazy(() => import('@/pages/licenses/LicensesList'));
const LicenseDetail = lazy(() => import('@/pages/licenses/LicenseDetail'));
const LicenseLifecycleQueue = lazy(() => import('@/pages/licenses/LicenseLifecycleQueue'));
const RegulatoryRequestsRegister = lazy(() => import('@/pages/licensing/RegulatoryRequestsRegister'));
const PaymentHistory = lazy(() => import('@/pages/payments/PaymentHistory'));
const PaymentDetail = lazy(() => import('@/pages/payments/PaymentDetail'));
const ComplaintsList = lazy(() => import('@/pages/complaints/ComplaintsList'));
const ComplaintDetail = lazy(() => import('@/pages/complaints/ComplaintDetail'));
const ComplaintTracking = lazy(() => import('@/pages/complaints/ComplaintTracking'));
const ComplaintsAnalytics = lazy(() => import('@/pages/complaints/ComplaintsAnalytics'));
const DuplicateDetectionHub = lazy(() => import('@/pages/complaints/duplicates/DuplicateDetectionHub'));
const EscalationHub = lazy(() => import('@/pages/complaints/escalations/EscalationHub'));
const RfiApprovalQueue = lazy(() => import('@/pages/complaints/rfi-approvals/RfiApprovalQueue'));
const WorkflowList = lazy(() => import('@/pages/workflows/WorkflowList'));
const DelegationRules = lazy(() => import('@/pages/delegation/DelegationRules'));
const DocumentStore = lazy(() => import('@/pages/documents/DocumentStore'));
const NotificationCenter = lazy(() => import('@/pages/notifications/NotificationCenter'));
const AnalyticsDashboard = lazy(() => import('@/pages/analytics/AnalyticsDashboard'));
const ReportsDashboard = lazy(() => import('@/pages/reports/ReportsDashboard'));
const FormDetail = lazy(() => import('@/pages/FormDetail'));
const Profile = lazy(() => import('@/pages/Profile'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const FormPreview = lazy(() => import('@/pages/FormPreview'));
const ChangeActiveSector = lazy(() => import('@/pages/admin/ChangeActiveSector'));
const RegistrationStatusPage = lazy(() => import('@/pages/registration/RegistrationStatusPage'));
const CoordinationList = lazy(() => import('@/pages/coordination/CoordinationList'));
const CoordinationDetail = lazy(() => import('@/pages/coordination/CoordinationDetail'));
const LicenseAppealsRegister = lazy(() => import('@/pages/admin/LicenseAppealsRegister'));
const LicenseAppealPanelsAdmin = lazy(() => import('@/pages/admin/LicenseAppealPanels'));
const MyAppeals = lazy(() => import('@/pages/appeals/MyAppeals'));
const EnforcementWorkQueue = lazy(() => import('@/pages/enforcement/EnforcementWorkQueue'));
const EnforcementWorkspace = lazy(() => import('@/pages/enforcement/EnforcementWorkspace'));
const Penalties = lazy(() => import('@/pages/billing/Penalties'));
const BreachInbox = lazy(() => import('@/pages/supervision/BreachInbox'));
const SupervisoryPlansDashboard = lazy(() => import('@/pages/supervision/SupervisoryPlansDashboard'));
const SupervisoryTeamPerformance = lazy(() => import('@/pages/supervision/TeamPerformance'));
const RiskHeatmap = lazy(() => import('@/pages/supervision/RiskHeatmap'));
const ExecutiveDashboard = lazy(() => import('@/pages/analytics/ExecutiveDashboard'));
const AlertCenter = lazy(() => import('@/pages/analytics/AlertCenter'));
const ComplaintBulkIntake = lazy(() => import('@/pages/complaints/BulkIntake'));
const AiInsightsHub = lazy(() => import('@/pages/analytics/AiInsightsHub'));
const SupervisoryAiReports = lazy(() => import('@/pages/analytics/SupervisoryAiReports'));

const CorrespondenceTemplates = lazy(() => import('@/pages/admin/CorrespondenceTemplates'));
const CorrespondenceDashboard = lazy(() => import('@/pages/correspondence/CorrespondenceDashboard'));
const CorrespondenceInbox = lazy(() => import('@/pages/correspondence/CorrespondenceInbox'));
const CorrespondenceManager = lazy(() => import('@/pages/correspondence/CorrespondenceManager'));

const CorrespondenceDetail = lazy(() => import('@/pages/correspondence/CorrespondenceDetail'));
const CorrespondenceRecords = lazy(() => import('@/pages/correspondence/CorrespondenceRecords'));
const CorrespondenceRoutingRules = lazy(() => import('@/pages/correspondence/RoutingRulesAdmin'));
const MyCorrespondence = lazy(() => import('@/pages/entity/correspondence/MyCorrespondence'));
const MyCorrespondenceDetail = lazy(() => import('@/pages/entity/correspondence/MyCorrespondenceDetail'));
const MyComplaintRfis = lazy(() => import('@/pages/entity/complaint-rfis/MyComplaintRfis'));
const MySupervisoryActions = lazy(() => import('@/pages/entity/MySupervisoryActions'));
const DocumentIntelligence = lazy(() => import('@/pages/admin/DocumentIntelligence'));
const ApiKeys = lazy(() => import('@/pages/admin/ApiKeys'));
const AuditExport = lazy(() => import('@/pages/admin/AuditExport'));
const SecurityEvents = lazy(() => import('@/pages/admin/SecurityEvents'));
const SlaManager = lazy(() => import('@/pages/admin/SlaManager'));
const InspectionsList = lazy(() => import('@/pages/inspections/InspectionsList'));
const InspectionsCalendar = lazy(() => import('@/pages/inspections/InspectionsCalendar'));
const InspectionDetail = lazy(() => import('@/pages/inspections/InspectionDetail'));
const ConductDashboard = lazy(() => import('@/pages/conduct/ConductDashboard'));
const ConductAlerts = lazy(() => import('@/pages/conduct/ConductAlerts'));
const ConductActions = lazy(() => import('@/pages/conduct/ConductActions'));
const RemediationDetail = lazy(() => import('@/pages/conduct/RemediationDetail'));
const ConductFindings = lazy(() => import('@/pages/conduct/ConductFindings'));
const FindingDetail = lazy(() => import('@/pages/conduct/FindingDetail'));

const ThematicReviews = lazy(() => import('@/pages/supervision/ThematicReviews'));
const NewThematicReview = lazy(() => import('@/pages/supervision/NewThematicReview'));
const ThematicReviewDetail = lazy(() => import('@/pages/supervision/ThematicReviewDetail'));
const ThematicClosureQueue = lazy(() => import('@/pages/supervision/ThematicClosureQueue'));
const MonitoringRules = lazy(() => import('@/pages/admin/conduct/MonitoringRules'));
const ConductEntitiesList = lazy(() => import('@/pages/conduct/ConductEntitiesList'));
const ConductEntityProfile = lazy(() => import('@/pages/conduct/ConductEntityProfile'));
const Investigations = lazy(() => import('@/pages/conduct/Investigations'));
const ConductWorkQueue = lazy(() => import('@/pages/conduct/ConductWorkQueue'));
const InvestigationDetail = lazy(() => import('@/pages/conduct/InvestigationDetail'));
const InvestigationClosureQueue = lazy(() => import('@/pages/conduct/InvestigationClosureQueue'));
const SupervisionLoop = lazy(() => import('@/pages/conduct/SupervisionLoop'));
const SurveillanceWorkspace = lazy(() => import('@/pages/conduct/SurveillanceWorkspace'));

const NewInternalComplaint = lazy(() => import('@/pages/complaints/NewInternalComplaint'));
const PrudentialDashboard = lazy(() => import('@/pages/prudential/PrudentialDashboard'));
const PrudentialWorkQueue = lazy(() => import('@/pages/prudential/PrudentialWorkQueue'));
const PrudentialEngineOperations = lazy(() => import('@/pages/admin/PrudentialEngineOperations'));
const PrudentialEntitiesList = lazy(() => import('@/pages/prudential/PrudentialEntitiesList'));
const PrudentialEntityProfile = lazy(() => import('@/pages/prudential/PrudentialEntityProfile'));
const PrudentialEntityRedirect = lazy(() => import('@/routes/PrudentialEntityRedirect'));
const FinancialGroupsList = lazy(() => import('@/pages/prudential/FinancialGroupsList'));
const FinancialGroupProfile = lazy(() => import('@/pages/prudential/FinancialGroupProfile'));
const AssessmentsList = lazy(() => import('@/pages/prudential/AssessmentsList'));
const AssessmentWorkspace = lazy(() => import('@/pages/prudential/AssessmentWorkspace'));
const ActionsList = lazy(() => import('@/pages/prudential/ActionsList'));
const EscalationsList = lazy(() => import('@/pages/prudential/EscalationsList'));
const StressIndicatorsAdmin = lazy(() => import('@/pages/prudential/StressIndicatorsAdmin'));
const ExaminationsList = lazy(() => import('@/pages/prudential/ExaminationsList'));
const ExaminationWorkspace = lazy(() => import('@/pages/prudential/ExaminationWorkspace'));
const PaymentSystemsOversight = lazy(() => import('@/pages/prudential/PaymentSystemsOversight'));
const PaymentOperatorProfile = lazy(() => import('@/pages/prudential/PaymentOperatorProfile'));
const PfmiAssessmentWizard = lazy(() => import('@/pages/prudential/PfmiAssessmentWizard'));
const PrudentialTaxonomyAdmin = lazy(() => import('@/pages/prudential/PrudentialTaxonomyAdmin'));

// RDM-ENTITY-001 Wave A — canonical entity registry surfaces.
const EntityDirectory = lazy(() => import('@/pages/entities/EntityDirectory'));
const EntityStructureHub = lazy(() => import('@/pages/entities/EntityStructureHub'));
const Entity360Detail = lazy(() => import('@/pages/entities/Entity360Detail'));
const Entity360Redirect = lazy(() => import('@/routes/Entity360Redirect'));
const EntityResolutionQueue = lazy(() => import('@/pages/licensing/EntityResolutionQueue'));
const EntityResolutionDetail = lazy(() => import('@/pages/licensing/EntityResolutionDetail'));
const EntityMemberships = lazy(() => import('@/pages/admin/EntityMemberships'));



function M({ module, children, allowedRoles }: { module: PermissionModule; children: React.ReactNode; allowedRoles?: any }) {
  return <P><ModuleRoute module={module} allowedRoles={allowedRoles}>{children}</ModuleRoute></P>;
}

function EP({ area, capability, children }: { area: PortalArea; capability: PortalCapability | PortalCapability[]; children: React.ReactNode }) {
  return <P><PortalRoute area={area} capability={capability}>{children}</PortalRoute></P>;
}

function ExternalPortalOrModule({
  module, area, capability, allowedRoles, children,
}: {
  module: PermissionModule;
  area: PortalArea;
  capability: PortalCapability | PortalCapability[];
  allowedRoles?: any;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (user && INTERNAL_ROLES.includes(user.role)) {
    return <P><ModuleRoute module={module} allowedRoles={allowedRoles}>{children}</ModuleRoute></P>;
  }
  return <EP area={area} capability={capability}>{children}</EP>;
}

export const dashboardRoutes = (
  <>
    <Route path="/dashboard" element={<P><Dashboard /></P>} />

    <Route path="/applications" element={<EP area="licensing" capability="can_view_status"><ApplicationsList /></EP>} />
    <Route path="/applications/new" element={<EP area="licensing" capability="can_submit"><NewApplication /></EP>} />
    <Route path="/applications/:id/continue" element={<EP area="licensing" capability={["can_submit", "can_respond_rfi"]}><NewApplication /></EP>} />
    <Route path="/applications/queue" element={<M module="application_management"><ApplicationQueue /></M>} />
    <Route path="/applications/:id" element={<EP area="licensing" capability={["can_view_status", "can_respond_rfi"]}><ApplicationDetail /></EP>} />
    <Route path="/applications/:applicationId/forms" element={<EP area="licensing" capability={["can_submit", "can_respond_rfi"]}><ApplicationForms /></EP>} />

    <Route path="/pre-license/new" element={<EP area="licensing" capability="can_submit"><NewApplication /></EP>} />
    <Route path="/post-license/new" element={<EP area="licensing" capability="can_submit"><NewPostLicenseApplication /></EP>} />
    <Route path="/post-licensee/applications/:applicationId/forms" element={<EP area="licensing" capability={["can_submit", "can_respond_rfi"]}><PostLicenseApplicationForms /></EP>} />

    <Route path="/appeals" element={<EP area="licensing" capability="can_view_status"><MyAppeals /></EP>} />
    <Route path="/admin/license-appeals" element={<M module="license_appeals"><LicenseAppealsRegister /></M>} />
    <Route path="/admin/appeal-panels" element={<M module="license_appeals"><LicenseAppealPanelsAdmin /></M>} />

    <Route path="/licenses" element={<EP area="licensing" capability="can_view_status"><LicensesList /></EP>} />
    <Route path="/licensing/regulatory-requests" element={<M module="license_management"><RegulatoryRequestsRegister /></M>} />
    <Route path="/licenses/lifecycle" element={<M module="license_management"><LicenseLifecycleQueue /></M>} />
    <Route path="/licenses/:id" element={<EP area="licensing" capability="can_view_status"><LicenseDetail /></EP>} />

    {/* EPR-01 — the legacy internal Returns spine is RETIRED. These paths are
        COMPATIBILITY_ONLY: old bookmarks resolve to the canonical spine
        (/returns/queue, /returns/filings/:filingId). No regulatory action may
        be taken here and there are no navigation entries pointing at them. */}
    <Route path="/returns-management" element={<Navigate to="/returns/queue" replace />} />
    <Route path="/returns-management/:id" element={<M module="returns_management"><LegacyReturnFilingRedirect /></M>} />
    <Route path="/returns-management/:id/analysis" element={<M module="returns_management"><LegacyReturnFilingRedirect /></M>} />

    {/* EPR-01 — the legacy external "Compliance Returns" spine is RETIRED in
        favour of the canonical filer journey at /entity/returns. */}
    <Route path="/compliance/returns" element={<Navigate to="/entity/returns" replace />} />
    <Route path="/compliance/returns/submit" element={<Navigate to="/entity/returns" replace />} />

    <Route path="/payments" element={<EP area="licensing" capability="can_view_status"><PaymentHistory /></EP>} />
    <Route path="/payments/:id" element={<EP area="licensing" capability="can_view_status"><PaymentDetail /></EP>} />
    <Route path="/complaints" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintsList /></ExternalPortalOrModule>} />
    <Route path="/complaints/analytics" element={<M module="complaint_management"><ComplaintsAnalytics /></M>} />
    <Route path="/complaints/bulk-intake" element={<M module="complaint_management"><ComplaintBulkIntake /></M>} />
    <Route path="/complaints/duplicates" element={<M module="complaint_management"><DuplicateDetectionHub /></M>} />
    <Route path="/complaints/escalations" element={<M module="complaint_management"><EscalationHub /></M>} />
    <Route path="/complaints/rfi-approvals" element={<M module="complaint_management"><RfiApprovalQueue /></M>} />
    <Route path="/complaints/track" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintTracking /></ExternalPortalOrModule>} />
    <Route path="/complaints/track/:reference" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintTracking /></ExternalPortalOrModule>} />
    <Route path="/complaints/:id" element={<M module="complaint_management"><ComplaintDetail /></M>} />
    <Route path="/workflows" element={<M module="workflow_management"><WorkflowList /></M>} />
    <Route path="/delegation-rules" element={<M module="workflow_management"><DelegationRules /></M>} />
    <Route path="/documents" element={<EP area="licensing" capability={["can_view_status", "can_upload_documents"]}><DocumentStore /></EP>} />
    <Route path="/notifications" element={<P><NotificationCenter /></P>} />
    <Route path="/analytics" element={<M module="report_management"><AnalyticsDashboard /></M>} />
    <Route path="/analytics/ai-insights" element={<M module="report_management"><AiInsightsHub /></M>} />
    <Route path="/analytics/ai-reports" element={<M module="report_management"><SupervisoryAiReports /></M>} />

    <Route path="/reports" element={<M module="report_management"><ReportsDashboard /></M>} />
    <Route path="/reports/*" element={<M module="report_management"><ReportsDashboard /></M>} />

    <Route path="/forms/:formId" element={<P><FormDetail /></P>} />

    <Route path="/profile" element={<P><Profile /></P>} />
    <Route path="/change-password" element={<P><ChangePassword /></P>} />
    <Route path="/preview/:versionId" element={<M module="form_management"><FormPreview /></M>} />
    <Route path="/change-sector" element={<EP area="licensing" capability="can_view_status"><ChangeActiveSector /></EP>} />
    <Route path="/registration-status" element={<P><RegistrationStatusPage /></P>} />
    <Route path="/coordination" element={<M module="coordination"><CoordinationList /></M>} />
    <Route path="/coordination/:caseId" element={<M module="coordination"><CoordinationDetail /></M>} />
    <Route path="/enforcement" element={<M module="enforcement_management"><EnforcementWorkQueue /></M>} />
    <Route path="/enforcement/:id" element={<M module="enforcement_management"><EnforcementWorkspace /></M>} />
    <Route path="/billing/penalties" element={<M module="fee_management"><Penalties /></M>} />
    <Route path="/supervision/breaches" element={<M module="prudential_supervision"><BreachInbox /></M>} />
    <Route path="/inspections" element={<M module="inspection_management"><InspectionsList /></M>} />
    <Route path="/inspections/schedule" element={<M module="inspection_management"><InspectionsCalendar /></M>} />
    <Route path="/inspections/:id" element={<M module="inspection_management"><InspectionDetail /></M>} />
    <Route path="/supervision/plans" element={<M module="prudential_supervision"><SupervisoryPlansDashboard /></M>} />
    <Route path="/supervision/team-performance" element={<M module="prudential_supervision"><SupervisoryTeamPerformance /></M>} />
    <Route path="/supervision/risk" element={<M module="prudential_supervision"><RiskHeatmap /></M>} />
    <Route path="/executive" element={<M module="report_management"><ExecutiveDashboard /></M>} />
    <Route path="/alerts" element={<M module="returns_management"><AlertCenter /></M>} />
    <Route path="/admin/correspondence-templates" element={<M module="settings"><CorrespondenceTemplates /></M>} />
    <Route path="/admin/document-intelligence" element={<M module="settings"><DocumentIntelligence /></M>} />
    <Route path="/admin/api-keys" element={<M module="settings"><ApiKeys /></M>} />
    <Route path="/admin/audit-export" element={<M module="settings"><AuditExport /></M>} />
    <Route path="/admin/security-events" element={<M module="settings"><SecurityEvents /></M>} />
    <Route path="/admin/sla-manager" element={<M module="settings"><SlaManager /></M>} />
    <Route path="/conduct" element={<M module="market_conduct"><ConductDashboard /></M>} />
    <Route path="/conduct/alerts" element={<M module="market_conduct"><ConductAlerts /></M>} />
    <Route path="/conduct/surveillance" element={<M module="market_conduct"><SurveillanceWorkspace /></M>} />
    <Route path="/conduct/actions" element={<M module="market_conduct"><ConductActions /></M>} />

    <Route path="/supervision/thematic-reviews" element={<M module="market_conduct"><ThematicReviews /></M>} />
    <Route path="/supervision/thematic-reviews/new" element={<M module="market_conduct"><NewThematicReview /></M>} />
    <Route path="/supervision/thematic-reviews/:id" element={<M module="market_conduct"><ThematicReviewDetail /></M>} />
    <Route path="/supervision/thematic-closure-approvals" element={<M module="market_conduct"><ThematicClosureQueue /></M>} />

    <Route path="/admin/conduct/monitoring-rules" element={<M module="market_conduct"><MonitoringRules /></M>} />
    <Route path="/conduct/entities" element={<M module="market_conduct"><ConductEntitiesList /></M>} />
    <Route path="/conduct/entities/:id" element={<M module="market_conduct"><ConductEntityProfile /></M>} />
    <Route path="/conduct/supervision-loop" element={<M module="market_conduct"><SupervisionLoop /></M>} />
    <Route path="/conduct/work-queue" element={<M module="market_conduct"><ConductWorkQueue /></M>} />
    <Route path="/conduct/investigations" element={<M module="market_conduct"><Investigations /></M>} />
    <Route path="/conduct/closure-approvals" element={<M module="market_conduct"><InvestigationClosureQueue /></M>} />
    <Route path="/conduct/investigations/:id" element={<M module="market_conduct"><InvestigationDetail /></M>} />

    <Route path="/complaints/internal/new" element={<M module="complaint_management"><NewInternalComplaint /></M>} />

    <Route path="/prudential" element={<Navigate to="/prudential/dashboard" replace />} />
    <Route path="/prudential/dashboard" element={<M module="prudential_supervision"><PrudentialDashboard /></M>} />
    <Route path="/prudential/work" element={<M module="prudential_supervision"><PrudentialWorkQueue /></M>} />
    <Route path="/admin/prudential/operations" element={<M module="prudential_supervision"><PrudentialEngineOperations /></M>} />
    <Route path="/prudential/entities" element={<M module="prudential_supervision"><PrudentialEntitiesList /></M>} />
    {/* EPR-02: legacy prudential entity profile → canonical Entity 360 (prudential section). */}
    <Route path="/prudential/entities/:id" element={<PrudentialEntityRedirect />} />
    <Route path="/prudential/analysis/:id" element={<M module="prudential_supervision"><PrudentialEntityProfile /></M>} />
    <Route path="/prudential/groups" element={<M module="prudential_supervision"><FinancialGroupsList /></M>} />
    <Route path="/prudential/groups/:groupId" element={<M module="prudential_supervision"><FinancialGroupProfile /></M>} />
    <Route path="/prudential/assessments" element={<M module="prudential_supervision"><AssessmentsList /></M>} />
    <Route path="/prudential/assessments/:id" element={<M module="prudential_supervision"><AssessmentWorkspace /></M>} />
    <Route path="/prudential/actions" element={<M module="prudential_supervision"><ActionsList /></M>} />
    <Route path="/prudential/escalations" element={<M module="prudential_supervision"><EscalationsList /></M>} />
    <Route path="/prudential/examinations" element={<M module="prudential_supervision"><ExaminationsList /></M>} />
    <Route path="/prudential/examinations/:id" element={<M module="prudential_supervision"><ExaminationWorkspace /></M>} />
    <Route path="/prudential/payment-systems" element={<M module="prudential_supervision"><PaymentSystemsOversight /></M>} />
    <Route path="/prudential/payment-systems/:operatorId" element={<M module="prudential_supervision"><PaymentOperatorProfile /></M>} />
    <Route path="/prudential/pfmi-assessments/:assessmentId" element={<M module="prudential_supervision"><PfmiAssessmentWizard /></M>} />
    <Route path="/prudential/stress-indicators" element={<M module="prudential_supervision"><StressIndicatorsAdmin /></M>} />
    <Route path="/admin/prudential-taxonomy" element={<M module="prudential_supervision"><PrudentialTaxonomyAdmin /></M>} />
    <Route path="/correspondence" element={<M module="notification_management"><CorrespondenceDashboard /></M>} />
    <Route path="/correspondence/dashboard" element={<M module="notification_management"><CorrespondenceDashboard /></M>} />
    <Route path="/correspondence/manager" element={<M module="notification_management"><CorrespondenceManager /></M>} />
    <Route path="/correspondence/inbox" element={<M module="notification_management"><CorrespondenceInbox /></M>} />

    <Route path="/correspondence/records" element={<M module="notification_management"><CorrespondenceRecords /></M>} />
    <Route path="/correspondence/:id" element={<M module="notification_management"><CorrespondenceDetail /></M>} />
    <Route path="/admin/correspondence-routing" element={<M module="settings"><CorrespondenceRoutingRules /></M>} />
    <Route path="/entity/correspondence" element={<P><MyCorrespondence /></P>} />
    <Route path="/entity/correspondence/:id" element={<MyCorrespondenceDetail />} />
    <Route path="/entity/complaint-rfis" element={<MyComplaintRfis />} />
    <Route path="/entity/supervisory-actions" element={<MySupervisoryActions />} />

    {/* RDM-ENTITY-001 Wave A — entity registry, resolution and membership */}
    <Route path="/entities" element={<M module="license_management"><EntityDirectory /></M>} />
    {/* Canonical regulated-entity profile = Enterprise Entity 360. */}
    <Route path="/entities/:entityId" element={<M module="license_management"><Entity360Detail /></M>} />
    {/* Structural mutation workspace (Wave B) lives inside the entity profile. */}
    <Route path="/entities/:entityId/structure" element={<M module="license_management"><EntityStructureHub /></M>} />
    {/* Compatibility URL for existing bookmarks — redirects to the canonical profile. */}
    <Route path="/entities/:entityId/360" element={<Entity360Redirect />} />
    <Route path="/licensing/entity-resolution" element={<M module="entity_resolution"><EntityResolutionQueue /></M>} />
    <Route path="/licensing/entity-resolution/:caseId" element={<M module="entity_resolution"><EntityResolutionDetail /></M>} />
    <Route path="/admin/entity-memberships" element={<M module="entity_membership"><EntityMemberships /></M>} />



  </>
);
