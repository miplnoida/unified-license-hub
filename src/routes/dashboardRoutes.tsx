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
const ApplicationsList = lazy(() => import('@/pages/applications/ApplicationsList'));
const ApplicationQueue = lazy(() => import('@/pages/applications/ApplicationQueue'));
const ApplicationDetail = lazy(() => import('@/pages/applications/ApplicationDetail'));

const NewApplication = lazy(() => import('@/pages/NewApplication'));
const NewPostLicenseApplication = lazy(() => import('@/pages/NewPostLicenseApplication'));
const PostLicenseApplicationForms = lazy(() => import('@/pages/PostLicenseApplicationForms'));
const ApplicationForms = lazy(() => import('@/pages/ApplicationForms'));
const LicensesList = lazy(() => import('@/pages/licenses/LicensesList'));
const LicenseDetail = lazy(() => import('@/pages/licenses/LicenseDetail'));
const ComplianceReturns = lazy(() => import('@/pages/compliance/ComplianceReturns'));
const ReturnSubmission = lazy(() => import('@/pages/compliance/ReturnSubmission'));
const PaymentHistory = lazy(() => import('@/pages/payments/PaymentHistory'));
const PaymentDetail = lazy(() => import('@/pages/payments/PaymentDetail'));
const ComplaintsList = lazy(() => import('@/pages/complaints/ComplaintsList'));
const ComplaintDetail = lazy(() => import('@/pages/complaints/ComplaintDetail'));
const ComplaintTracking = lazy(() => import('@/pages/complaints/ComplaintTracking'));
const ComplaintsAnalytics = lazy(() => import('@/pages/complaints/ComplaintsAnalytics'));
const DuplicateDetectionHub = lazy(() => import('@/pages/complaints/duplicates/DuplicateDetectionHub'));
const EscalationHub = lazy(() => import('@/pages/complaints/escalations/EscalationHub'));
const WorkflowList = lazy(() => import('@/pages/workflows/WorkflowList'));
const DelegationRules = lazy(() => import('@/pages/delegation/DelegationRules'));
const DocumentStore = lazy(() => import('@/pages/documents/DocumentStore'));
const NotificationCenter = lazy(() => import('@/pages/notifications/NotificationCenter'));
const AnalyticsDashboard = lazy(() => import('@/pages/analytics/AnalyticsDashboard'));
const ReportsDashboard = lazy(() => import('@/pages/reports/ReportsDashboard'));
const FormDetail = lazy(() => import('@/pages/FormDetail'));
const ViewReturns = lazy(() => import('@/pages/returns-mgmt/ViewReturns'));
const ReturnDetail = lazy(() => import('@/pages/returns-mgmt/ReturnDetail'));
const ReturnAnalysis = lazy(() => import('@/pages/returns-mgmt/ReturnAnalysis'));
const Profile = lazy(() => import('@/pages/Profile'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const FormPreview = lazy(() => import('@/pages/FormPreview'));
const ChangeActiveSector = lazy(() => import('@/pages/admin/ChangeActiveSector'));
const RegistrationStatusPage = lazy(() => import('@/pages/registration/RegistrationStatusPage'));
const CoordinationList = lazy(() => import('@/pages/coordination/CoordinationList'));
const CoordinationDetail = lazy(() => import('@/pages/coordination/CoordinationDetail'));
const FitAndProperIndividuals = lazy(() => import('@/pages/fit-and-proper/FitAndProperIndividuals'));
const FitAndProperIndividualDetail = lazy(() => import('@/pages/fit-and-proper/FitAndProperIndividualDetail'));
const FitAndProperAssessmentDetail = lazy(() => import('@/pages/fit-and-proper/FitAndProperAssessmentDetail'));
const FpPopulationTrends = lazy(() => import('@/pages/fit-and-proper/FpPopulationTrends'));
const InvitationTracker = lazy(() => import('@/pages/fit-and-proper/InvitationTracker'));
const FpInitiationLog = lazy(() => import('@/pages/fit-and-proper/FpInitiationLog'));
const FpScheduler = lazy(() => import('@/pages/fit-and-proper/FpScheduler'));
const ManualScreeningQueue = lazy(() => import('@/pages/fit-and-proper/ManualScreeningQueue'));
const ManualTaskDetail = lazy(() => import('@/pages/fit-and-proper/ManualTaskDetail'));
const FpaDashboard = lazy(() => import('@/pages/fpa/FpaDashboard'));
const FpaInitiation = lazy(() => import('@/pages/fpa/FpaInitiation'));
const FpaIndividuals = lazy(() => import('@/pages/fpa/FpaIndividuals'));
const FpaIndividualProfile = lazy(() => import('@/pages/fpa/FpaIndividualProfile'));
const FpaDeclarations = lazy(() => import('@/pages/fpa/FpaDeclarations'));
const FpaScreening = lazy(() => import('@/pages/fpa/FpaScreening'));
const FpaManualTasks = lazy(() => import('@/pages/fpa/FpaManualTasks'));
const FpaManualTaskDetail = lazy(() => import('@/pages/fpa/FpaManualTaskDetail'));
const FpaFindings = lazy(() => import('@/pages/fpa/FpaFindings'));
const FpaTrends = lazy(() => import('@/pages/fpa/FpaTrends'));
const FpaAiAnalysis = lazy(() => import('@/pages/fpa/FpaAiAnalysis'));
const FpaSectorRules = lazy(() => import('@/pages/fpa/FpaSectorRules'));
const FpaDeterminations = lazy(() => import('@/pages/fpa/FpaDeterminations'));
const FpaCommittee = lazy(() => import('@/pages/fpa/FpaCommittee'));
const FpaConditions = lazy(() => import('@/pages/fpa/FpaConditions'));
const LicenseAppealsRegister = lazy(() => import('@/pages/admin/LicenseAppealsRegister'));
const LicenseAppealPanelsAdmin = lazy(() => import('@/pages/admin/LicenseAppealPanels'));
const MyAppeals = lazy(() => import('@/pages/appeals/MyAppeals'));
const FpaAppeals = lazy(() => import('@/pages/fpa/FpaAppeals'));
const FpaMonitoring = lazy(() => import('@/pages/fpa/FpaMonitoring'));
const EnforcementList = lazy(() => import('@/pages/enforcement/EnforcementList'));
const EnforcementDetail = lazy(() => import('@/pages/enforcement/EnforcementDetail'));
const Penalties = lazy(() => import('@/pages/billing/Penalties'));
const BreachInbox = lazy(() => import('@/pages/supervision/BreachInbox'));
const SupervisoryPlansDashboard = lazy(() => import('@/pages/supervision/SupervisoryPlansDashboard'));
const RiskHeatmap = lazy(() => import('@/pages/supervision/RiskHeatmap'));
const ExecutiveDashboard = lazy(() => import('@/pages/analytics/ExecutiveDashboard'));
const AlertCenter = lazy(() => import('@/pages/analytics/AlertCenter'));
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
const DocumentIntelligence = lazy(() => import('@/pages/admin/DocumentIntelligence'));
const ApiKeys = lazy(() => import('@/pages/admin/ApiKeys'));
const AuditExport = lazy(() => import('@/pages/admin/AuditExport'));
const SecurityEvents = lazy(() => import('@/pages/admin/SecurityEvents'));
const InspectionsList = lazy(() => import('@/pages/inspections/InspectionsList'));
const InspectionsCalendar = lazy(() => import('@/pages/inspections/InspectionsCalendar'));
const InspectionDetail = lazy(() => import('@/pages/inspections/InspectionDetail'));
const ConductDashboard = lazy(() => import('@/pages/conduct/ConductDashboard'));
const ConductAlerts = lazy(() => import('@/pages/conduct/ConductAlerts'));
const ConductActions = lazy(() => import('@/pages/conduct/ConductActions'));
const ThematicReviews = lazy(() => import('@/pages/supervision/ThematicReviews'));
const NewThematicReview = lazy(() => import('@/pages/supervision/NewThematicReview'));
const ThematicReviewDetail = lazy(() => import('@/pages/supervision/ThematicReviewDetail'));
const MonitoringRules = lazy(() => import('@/pages/admin/conduct/MonitoringRules'));
const ConductEntitiesList = lazy(() => import('@/pages/conduct/ConductEntitiesList'));
const ConductEntityProfile = lazy(() => import('@/pages/conduct/ConductEntityProfile'));
const Investigations = lazy(() => import('@/pages/conduct/Investigations'));
const InvestigationDetail = lazy(() => import('@/pages/conduct/InvestigationDetail'));
const NewInternalComplaint = lazy(() => import('@/pages/complaints/NewInternalComplaint'));
const PrudentialDashboard = lazy(() => import('@/pages/prudential/PrudentialDashboard'));
const PrudentialEntitiesList = lazy(() => import('@/pages/prudential/PrudentialEntitiesList'));
const PrudentialEntityProfile = lazy(() => import('@/pages/prudential/PrudentialEntityProfile'));
const FinancialGroupsList = lazy(() => import('@/pages/prudential/FinancialGroupsList'));
const FinancialGroupProfile = lazy(() => import('@/pages/prudential/FinancialGroupProfile'));
const AssessmentsList = lazy(() => import('@/pages/prudential/AssessmentsList'));
const AssessmentDetail = lazy(() => import('@/pages/prudential/AssessmentDetail'));
const ActionsList = lazy(() => import('@/pages/prudential/ActionsList'));
const EscalationsList = lazy(() => import('@/pages/prudential/EscalationsList'));
const StressIndicatorsAdmin = lazy(() => import('@/pages/prudential/StressIndicatorsAdmin'));
const ExaminationsList = lazy(() => import('@/pages/prudential/ExaminationsList'));
const ExaminationWorkspace = lazy(() => import('@/pages/prudential/ExaminationWorkspace'));
const PaymentSystemsOversight = lazy(() => import('@/pages/prudential/PaymentSystemsOversight'));
const PaymentOperatorProfile = lazy(() => import('@/pages/prudential/PaymentOperatorProfile'));
const PfmiAssessmentWizard = lazy(() => import('@/pages/prudential/PfmiAssessmentWizard'));
const PrudentialTaxonomyAdmin = lazy(() => import('@/pages/prudential/PrudentialTaxonomyAdmin'));

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
    <Route path="/licenses/:id" element={<EP area="licensing" capability="can_view_status"><LicenseDetail /></EP>} />

    <Route path="/returns-management" element={<M module="returns_management"><ViewReturns /></M>} />
    <Route path="/returns-management/:id" element={<M module="returns_management"><ReturnDetail /></M>} />
    <Route path="/returns-management/:id/analysis" element={<M module="returns_management"><ReturnAnalysis /></M>} />

    <Route path="/compliance/returns" element={<EP area="returns" capability="can_view_status"><ComplianceReturns /></EP>} />
    <Route path="/compliance/returns/submit" element={<EP area="returns" capability="can_submit_returns"><ReturnSubmission /></EP>} />

    <Route path="/payments" element={<EP area="licensing" capability="can_view_status"><PaymentHistory /></EP>} />
    <Route path="/payments/:id" element={<EP area="licensing" capability="can_view_status"><PaymentDetail /></EP>} />
    <Route path="/complaints" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintsList /></ExternalPortalOrModule>} />
    <Route path="/complaints/analytics" element={<M module="complaint_management"><ComplaintsAnalytics /></M>} />
    <Route path="/complaints/duplicates" element={<M module="complaint_management"><DuplicateDetectionHub /></M>} />
    <Route path="/complaints/escalations" element={<M module="complaint_management"><EscalationHub /></M>} />
    <Route path="/complaints/track" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintTracking /></ExternalPortalOrModule>} />
    <Route path="/complaints/track/:reference" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintTracking /></ExternalPortalOrModule>} />
    <Route path="/complaints/:id" element={<M module="complaint_management"><ComplaintDetail /></M>} />
    <Route path="/workflows" element={<M module="workflow_management"><WorkflowList /></M>} />
    <Route path="/delegation-rules" element={<M module="workflow_management"><DelegationRules /></M>} />
    <Route path="/documents" element={<EP area="licensing" capability={["can_view_status", "can_upload_documents"]}><DocumentStore /></EP>} />
    <Route path="/notifications" element={<P><NotificationCenter /></P>} />
    <Route path="/analytics" element={<M module="report_management"><AnalyticsDashboard /></M>} />
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
    <Route path="/fit-and-proper" element={<M module="fit_and_proper"><FitAndProperIndividuals /></M>} />
    <Route path="/fit-and-proper/individuals/:id" element={<M module="fit_and_proper"><FitAndProperIndividualDetail /></M>} />
    <Route path="/fit-and-proper/assessments/:id" element={<M module="fit_and_proper"><FitAndProperAssessmentDetail /></M>} />
    <Route path="/fit-and-proper/trends" element={<M module="fit_and_proper"><FpPopulationTrends /></M>} />
    <Route path="/fit-and-proper/invitations" element={<M module="fit_and_proper"><InvitationTracker /></M>} />
    <Route path="/fit-and-proper/initiation-log" element={<M module="fit_and_proper"><FpInitiationLog /></M>} />
    <Route path="/fit-and-proper/scheduler" element={<M module="fit_and_proper"><FpScheduler /></M>} />
    <Route path="/fit-and-proper/screening-queue" element={<M module="fit_and_proper"><ManualScreeningQueue /></M>} />
    <Route path="/fit-and-proper/screening-queue/:id" element={<M module="fit_and_proper"><ManualTaskDetail /></M>} />
    <Route path="/enforcement" element={<M module="license_management"><EnforcementList /></M>} />
    <Route path="/enforcement/:id" element={<M module="license_management"><EnforcementDetail /></M>} />
    <Route path="/billing/penalties" element={<M module="fee_management"><Penalties /></M>} />
    <Route path="/supervision/breaches" element={<M module="returns_management"><BreachInbox /></M>} />
    <Route path="/inspections" element={<M module="application_management"><InspectionsList /></M>} />
    <Route path="/inspections/schedule" element={<M module="application_management"><InspectionsCalendar /></M>} />
    <Route path="/inspections/:id" element={<M module="application_management"><InspectionDetail /></M>} />
    <Route path="/supervision/plans" element={<M module="returns_management"><SupervisoryPlansDashboard /></M>} />
    <Route path="/supervision/risk" element={<M module="returns_management"><RiskHeatmap /></M>} />
    <Route path="/executive" element={<M module="report_management"><ExecutiveDashboard /></M>} />
    <Route path="/alerts" element={<M module="returns_management"><AlertCenter /></M>} />
    <Route path="/admin/correspondence-templates" element={<M module="settings"><CorrespondenceTemplates /></M>} />
    <Route path="/admin/document-intelligence" element={<M module="settings"><DocumentIntelligence /></M>} />
    <Route path="/admin/api-keys" element={<M module="settings"><ApiKeys /></M>} />
    <Route path="/admin/audit-export" element={<M module="settings"><AuditExport /></M>} />
    <Route path="/admin/security-events" element={<M module="settings"><SecurityEvents /></M>} />
    <Route path="/conduct" element={<M module="market_conduct"><ConductDashboard /></M>} />
    <Route path="/conduct/alerts" element={<M module="market_conduct"><ConductAlerts /></M>} />
    <Route path="/conduct/actions" element={<M module="market_conduct"><ConductActions /></M>} />
    <Route path="/supervision/thematic-reviews" element={<M module="market_conduct"><ThematicReviews /></M>} />
    <Route path="/supervision/thematic-reviews/new" element={<M module="market_conduct"><NewThematicReview /></M>} />
    <Route path="/supervision/thematic-reviews/:id" element={<M module="market_conduct"><ThematicReviewDetail /></M>} />
    <Route path="/admin/conduct/monitoring-rules" element={<M module="market_conduct"><MonitoringRules /></M>} />
    <Route path="/conduct/entities" element={<M module="market_conduct"><ConductEntitiesList /></M>} />
    <Route path="/conduct/entities/:id" element={<M module="market_conduct"><ConductEntityProfile /></M>} />
    <Route path="/conduct/investigations" element={<M module="market_conduct"><Investigations /></M>} />
    <Route path="/conduct/investigations/:id" element={<M module="market_conduct"><InvestigationDetail /></M>} />
    <Route path="/complaints/internal/new" element={<M module="complaint_management"><NewInternalComplaint /></M>} />

    <Route path="/prudential" element={<Navigate to="/prudential/dashboard" replace />} />
    <Route path="/prudential/dashboard" element={<M module="prudential_supervision"><PrudentialDashboard /></M>} />
    <Route path="/prudential/entities" element={<M module="prudential_supervision"><PrudentialEntitiesList /></M>} />
    <Route path="/prudential/entities/:id" element={<M module="prudential_supervision"><PrudentialEntityProfile /></M>} />
    <Route path="/prudential/groups" element={<M module="prudential_supervision"><FinancialGroupsList /></M>} />
    <Route path="/prudential/groups/:groupId" element={<M module="prudential_supervision"><FinancialGroupProfile /></M>} />
    <Route path="/prudential/assessments" element={<M module="prudential_supervision"><AssessmentsList /></M>} />
    <Route path="/prudential/assessments/:id" element={<M module="prudential_supervision"><AssessmentDetail /></M>} />
    <Route path="/prudential/actions" element={<M module="prudential_supervision"><ActionsList /></M>} />
    <Route path="/prudential/escalations" element={<M module="prudential_supervision"><EscalationsList /></M>} />
    <Route path="/prudential/examinations" element={<M module="prudential_supervision"><ExaminationsList /></M>} />
    <Route path="/prudential/examinations/:id" element={<M module="prudential_supervision"><ExaminationWorkspace /></M>} />
    <Route path="/prudential/payment-systems" element={<M module="prudential_supervision"><PaymentSystemsOversight /></M>} />
    <Route path="/prudential/payment-systems/:operatorId" element={<M module="prudential_supervision"><PaymentOperatorProfile /></M>} />
    <Route path="/prudential/pfmi-assessments/:assessmentId" element={<M module="prudential_supervision"><PfmiAssessmentWizard /></M>} />
    <Route path="/prudential/stress-indicators" element={<M module="prudential_supervision"><StressIndicatorsAdmin /></M>} />
    <Route path="/admin/prudential-taxonomy" element={<M module="prudential_supervision"><PrudentialTaxonomyAdmin /></M>} />
    <Route path="/fpa" element={<M module="fit_and_proper"><FpaDashboard /></M>} />
    <Route path="/fpa/initiation" element={<M module="fit_and_proper"><FpaInitiation /></M>} />
    <Route path="/fpa/individuals" element={<M module="fit_and_proper"><FpaIndividuals /></M>} />
    <Route path="/fpa/individuals/:id" element={<M module="fit_and_proper"><FpaIndividualProfile /></M>} />
    <Route path="/fpa/declarations" element={<M module="fit_and_proper"><FpaDeclarations /></M>} />
    <Route path="/fpa/screening" element={<M module="fit_and_proper"><FpaScreening /></M>} />
    <Route path="/fpa/manual-tasks" element={<M module="fit_and_proper"><FpaManualTasks /></M>} />
    <Route path="/fpa/manual-tasks/:id" element={<M module="fit_and_proper"><FpaManualTaskDetail /></M>} />
    <Route path="/fpa/findings" element={<M module="fit_and_proper"><FpaFindings /></M>} />
    <Route path="/fpa/trends" element={<M module="fit_and_proper"><FpaTrends /></M>} />
    <Route path="/fpa/ai-analysis" element={<M module="fit_and_proper"><FpaAiAnalysis /></M>} />
    <Route path="/fpa/sector-rules" element={<M module="fit_and_proper"><FpaSectorRules /></M>} />
    <Route path="/fpa/determinations" element={<M module="fit_and_proper"><FpaDeterminations /></M>} />
    <Route path="/fpa/committee" element={<M module="fit_and_proper"><FpaCommittee /></M>} />
    <Route path="/fpa/conditions" element={<M module="fit_and_proper"><FpaConditions /></M>} />
    <Route path="/fpa/appeals" element={<M module="fit_and_proper"><FpaAppeals /></M>} />
    <Route path="/fpa/monitoring" element={<M module="fit_and_proper"><FpaMonitoring /></M>} />
    <Route path="/correspondence" element={<M module="settings"><CorrespondenceDashboard /></M>} />
    <Route path="/correspondence/dashboard" element={<M module="settings"><CorrespondenceDashboard /></M>} />
    <Route path="/correspondence/manager" element={<M module="settings"><CorrespondenceManager /></M>} />
    <Route path="/correspondence/inbox" element={<M module="settings"><CorrespondenceInbox /></M>} />

    <Route path="/correspondence/records" element={<M module="settings"><CorrespondenceRecords /></M>} />
    <Route path="/correspondence/:id" element={<M module="settings"><CorrespondenceDetail /></M>} />
    <Route path="/admin/correspondence-routing" element={<M module="settings"><CorrespondenceRoutingRules /></M>} />
    <Route path="/entity/correspondence" element={<MyCorrespondence />} />
    <Route path="/entity/correspondence/:id" element={<MyCorrespondenceDetail />} />
    <Route path="/entity/complaint-rfis" element={<MyComplaintRfis />} />

  </>
);
