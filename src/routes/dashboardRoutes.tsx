import { Navigate, Route } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';
import { LegacyInspectionRegisterRedirect, LegacyInspectionScheduleRedirect } from '@/routes/LegacyInspectionRedirect';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { SupervisoryEnterpriseRoute } from '@/routes/SupervisoryEnterpriseRoute';
import { PortalRoute } from '@/components/auth/PortalRoute';
import type { PermissionModule } from '@/lib/permissionModules';
import { ExaminationDomainRoute } from '@/routes/ExaminationDomainRoute';
import { FindingDomainRoute } from '@/routes/FindingDomainRoute';

import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES } from '@/types/platform';
import type { PortalArea, PortalCapability } from '@/lib/portalAccess';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const MyWork = lazy(() => import('@/pages/MyWork'));
const SupportCenter = lazy(() => import('@/pages/support/SupportCenter'));
// Documentation only: role-aware in-application User Manual & Demo Playbook.
const UserManual = lazy(() => import('@/pages/help/UserManual'));
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
const ComplaintIntakeQueue = lazy(() => import('@/pages/complaints/IntakeQueue'));
const WorkflowList = lazy(() => import('@/pages/workflows/WorkflowList'));
const DelegationRules = lazy(() => import('@/pages/delegation/DelegationRules'));
const DocumentStore = lazy(() => import('@/pages/documents/DocumentStore'));
const DocumentRegister = lazy(() => import('@/pages/documents/DocumentRegister'));
const DocumentDetail = lazy(() => import('@/pages/documents/DocumentDetail'));
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
const SupervisoryPlanRecord = lazy(() => import('@/pages/supervision/SupervisoryPlanRecord'));
const SupervisoryTeamPerformance = lazy(() => import('@/pages/supervision/TeamPerformance'));
const RiskHeatmap = lazy(() => import('@/pages/supervision/RiskHeatmap'));
const SupervisoryPortfolio = lazy(() => import('@/pages/supervision/SupervisoryPortfolio'));
// OS-02 — continuous offsite supervision: one generic monitoring register for every domain.
const ContinuousMonitoring = lazy(() => import('@/pages/supervision/ContinuousMonitoring'));
const DetectionGovernance = lazy(() => import('@/pages/supervision/DetectionGovernance'));
const ManagementAssurance = lazy(() => import('@/pages/supervision/ManagementAssurance'));
// OS-02G1 — portfolio, thematic and systemic supervisory intelligence (read layer only).
const PortfolioIntelligence = lazy(() => import('@/pages/supervision/PortfolioIntelligence'));
// Epic 3 — AML/CFT supervision workspace (canonical spine, AML_CFT domain).
const AmlOverview = lazy(() => import('@/pages/supervision/aml/AmlOverview'));
const AmlWorkQueue = lazy(() => import('@/pages/supervision/aml/AmlWorkQueue'));
const AmlSupervisedEntities = lazy(() => import('@/pages/supervision/aml/AmlSupervisedEntities'));
const AmlAssessments = lazy(() => import('@/pages/supervision/aml/AmlAssessments'));
const AmlAssessmentWorkspace = lazy(() => import('@/pages/supervision/aml/AmlAssessmentWorkspace'));
const AmlRiskHeatmap = lazy(() => import('@/pages/supervision/aml/AmlRiskHeatmap'));
const AmlExaminations = lazy(() => import('@/pages/supervision/aml/AmlExaminations'));
const AmlFindings = lazy(() => import('@/pages/supervision/aml/AmlFindings'));
const AmlPortfolio = lazy(() => import('@/pages/supervision/aml/AmlPortfolio'));
// Canonical, domain-neutral finding workspace shared by every supervisory domain.
const FindingWorkspace = lazy(() => import('@/pages/supervision/FindingWorkspace'));

const ExecutiveDashboard = lazy(() => import('@/pages/analytics/ExecutiveDashboard'));
const AlertCenter = lazy(() => import('@/pages/analytics/AlertCenter'));
const ComplaintBulkIntake = lazy(() => import('@/pages/complaints/BulkIntake'));
const AiInsightsHub = lazy(() => import('@/pages/analytics/AiInsightsHub'));
const SupervisoryAiReports = lazy(() => import('@/pages/analytics/SupervisoryAiReports'));

const CorrespondenceTemplates = lazy(() => import('@/pages/admin/CorrespondenceTemplates'));
const CorrespondenceDashboard = lazy(() => import('@/pages/correspondence/CorrespondenceDashboard'));
const CorrespondenceInbox = lazy(() => import('@/pages/correspondence/CorrespondenceInbox'));
const ThreadWorkspace = lazy(() => import('@/pages/correspondence/ThreadWorkspace'));
const ConductEntityRedirect = lazy(() => import('@/routes/ConductEntityRedirect'));
const LegacyThreadRedirect = lazy(() => import('@/routes/LegacyThreadRedirect'));

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
// EPIC 4 / W6 — inspection convergence: the legacy inspection case pages were
// retired; `/inspections*` are compatibility routes onto the canonical
// examination engine.
const ExaminationSchedule = lazy(() => import('@/pages/supervision/ExaminationSchedule'));
const LegacyInspectionRecordNotice = lazy(() => import('@/routes/LegacyInspectionRedirect'));
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
const Investigations = lazy(() => import('@/pages/conduct/Investigations'));
const ConductWorkQueue = lazy(() => import('@/pages/conduct/ConductWorkQueue'));
const InvestigationDetail = lazy(() => import('@/pages/conduct/InvestigationDetail'));
const InvestigationClosureQueue = lazy(() => import('@/pages/conduct/InvestigationClosureQueue'));
const SupervisionLoop = lazy(() => import('@/pages/conduct/SupervisionLoop'));
const SurveillanceWorkspace = lazy(() => import('@/pages/conduct/SurveillanceWorkspace'));
const ConductSignals = lazy(() => import('@/pages/conduct/ConductSignals'));
const ConductSignalDetail = lazy(() => import('@/pages/conduct/ConductSignalDetail'));
const ConductPatterns = lazy(() => import('@/pages/conduct/ConductPatterns'));
const SupervisoryIntelligence = lazy(() => import('@/pages/conduct/SupervisoryIntelligence'));
const EmergingRisksRegister = lazy(() => import('@/pages/conduct/EmergingRisksRegister'));
const ConductPrioritisation = lazy(() => import('@/pages/conduct/ConductPrioritisation'));
const InterventionsRegister = lazy(() => import('@/pages/conduct/InterventionsRegister'));
const ManagementReporting = lazy(() => import('@/pages/conduct/ManagementReporting'));
const InterventionDetail = lazy(() => import('@/pages/conduct/InterventionDetail'));
const SupervisoryAttentionRegister = lazy(() => import('@/pages/conduct/SupervisoryAttentionRegister'));
const SupervisoryAttentionDetail = lazy(() => import('@/pages/conduct/SupervisoryAttentionDetail'));
const SupervisoryPlanDetail = lazy(() => import('@/pages/conduct/SupervisoryPlanDetail'));
const EmergingRiskDetail = lazy(() => import('@/pages/conduct/EmergingRiskDetail'));
const AiGovernanceOverview = lazy(() => import('@/pages/governance/ai/AiGovernanceOverview'));
const AiActivityRegister = lazy(() => import('@/pages/governance/ai/AiActivityRegister'));
const AiActivityDetail = lazy(() => import('@/pages/governance/ai/AiActivityDetail'));
const AiUseCases = lazy(() => import('@/pages/governance/ai/AiUseCases'));
const AiUseCaseDetail = lazy(() => import('@/pages/governance/ai/AiUseCaseDetail'));
const AiModels = lazy(() => import('@/pages/governance/ai/AiModels'));
const AiInstructions = lazy(() => import('@/pages/governance/ai/AiInstructions'));
const AiAssurance = lazy(() => import('@/pages/governance/ai/AiAssurance'));
const AiAssuranceDetail = lazy(() => import('@/pages/governance/ai/AiAssuranceDetail'));
const AiExceptions = lazy(() => import('@/pages/governance/ai/AiExceptions'));
const AiSurfaces = lazy(() => import('@/pages/governance/ai/AiSurfaces'));
const ConductPatternDetail = lazy(() => import('@/pages/conduct/ConductPatternDetail'));
const Conduct360 = lazy(() => import('@/pages/conduct/Conduct360'));


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
// F8A-B3 — canonical person identity surfaces.
const Person360Detail = lazy(() => import('@/pages/persons/Person360Detail'));
const PersonIdentityQueue = lazy(() => import('@/pages/persons/PersonIdentityQueue'));
// F8A-B4 — canonical address & relationship intelligence surfaces.
const Address360Detail = lazy(() => import('@/pages/intelligence/Address360Detail'));
const RelationshipIntelligenceSearch = lazy(() => import('@/pages/intelligence/RelationshipIntelligenceSearch'));
const Entity360Redirect = lazy(() => import('@/routes/Entity360Redirect'));
const LegacyExaminationRedirect = lazy(() => import('@/routes/LegacyExaminationRedirect'));
const EntityResolutionQueue = lazy(() => import('@/pages/licensing/EntityResolutionQueue'));
const EntityResolutionDetail = lazy(() => import('@/pages/licensing/EntityResolutionDetail'));
const EntityMemberships = lazy(() => import('@/pages/admin/EntityMemberships'));
const OnboardingWorkspace = lazy(() => import('@/pages/licensing/OnboardingWorkspace'));



function M({ module, children, allowedRoles }: { module: PermissionModule; children: React.ReactNode; allowedRoles?: any }) {
  return <P><ModuleRoute module={module} allowedRoles={allowedRoles}>{children}</ModuleRoute></P>;
}

/**
 * EPIC 4 / W6 — the Enterprise Supervisory Portfolio and Team Performance are
 * cross-domain surfaces. Their authority is stated explicitly in
 * `SupervisoryEnterpriseRoute` (enterprise `supervisory_spine.view` OR one
 * genuine domain supervisory view). There is NO default-module fallback: an
 * officer with no supervisory authority is denied instead of being evaluated
 * against `prudential_supervision`.
 */
function SE({ children }: { children: React.ReactNode }) {
  return <P><SupervisoryEnterpriseRoute>{children}</SupervisoryEnterpriseRoute></P>;
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

/**
 * `/documents` resolves to the canonical Document Register for internal staff
 * (governed by the `document_management` module) and keeps the existing
 * external-portal document screen for licensee/applicant users. Legacy records
 * remain readable — nothing is removed.
 */
function DocumentsHome() {
  const { user } = useAuth();
  if (user && INTERNAL_ROLES.includes(user.role)) {
    return <M module="document_management"><DocumentRegister /></M>;
  }
  return <EP area="licensing" capability={["can_view_status", "can_upload_documents"]}><DocumentStore /></EP>;
}

export const dashboardRoutes = (
  <>
    <Route path="/dashboard" element={<P><Dashboard /></P>} />
    {/* Checkpoint F: read-only aggregation of module work owned by the signed-in person. */}
    <Route path="/my-work" element={<P><MyWork /></P>} />
    {/* User Manual — available to every authenticated user; the page itself
        filters internal-only documentation. No new permission is required. */}
    <Route path="/help/user-manual" element={<P><UserManual /></P>} />

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
    <Route path="/complaints/intake-queue" element={<M module="complaint_management"><ComplaintIntakeQueue /></M>} />
    <Route path="/complaints/duplicates" element={<M module="complaint_management"><DuplicateDetectionHub /></M>} />

    <Route path="/complaints/escalations" element={<M module="complaint_management"><EscalationHub /></M>} />
    <Route path="/complaints/rfi-approvals" element={<M module="complaint_management"><RfiApprovalQueue /></M>} />
    <Route path="/complaints/track" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintTracking /></ExternalPortalOrModule>} />
    <Route path="/complaints/track/:reference" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={INTERNAL_ROLES}><ComplaintTracking /></ExternalPortalOrModule>} />
    <Route path="/complaints/:id" element={<M module="complaint_management"><ComplaintDetail /></M>} />
    <Route path="/workflows" element={<M module="workflow_management"><WorkflowList /></M>} />
    <Route path="/delegation-rules" element={<M module="workflow_management"><DelegationRules /></M>} />
    <Route path="/documents/registry" element={<ModuleRoute module="document_management"><DocumentRegister /></ModuleRoute>} />
    <Route path="/documents/registry/:documentId" element={<ModuleRoute module="document_management"><DocumentDetail /></ModuleRoute>} />
    {/* Canonical entry point: internal staff get the governed Document Register;
        external portal users keep their existing document self-service screen.
        The legacy technical store stays reachable at an explicit URL. */}
    <Route path="/documents" element={<DocumentsHome />} />
    <Route path="/documents/legacy-store" element={<EP area="licensing" capability={["can_view_status", "can_upload_documents"]}><DocumentStore /></EP>} />
    <Route path="/notifications" element={<P><NotificationCenter /></P>} />
    <Route path="/analytics" element={<M module="report_management"><AnalyticsDashboard /></M>} />
    <Route path="/analytics/ai-insights" element={<M module="report_management"><AiInsightsHub /></M>} />
    <Route path="/analytics/ai-reports" element={<M module="report_management"><SupervisoryAiReports /></M>} />

    <Route path="/reports" element={<M module="report_management"><ReportsDashboard /></M>} />
    <Route path="/reports/*" element={<M module="report_management"><ReportsDashboard /></M>} />

    <Route path="/forms/:formId" element={<P><FormDetail /></P>} />

    <Route path="/profile" element={<P><Profile /></P>} />
    {/* Technical help desk — available to every authenticated portal user. */}
    <Route path="/support" element={<P><SupportCenter /></P>} />
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
    <Route path="/inspections" element={<LegacyInspectionRegisterRedirect />} />
    <Route path="/inspections/schedule" element={<LegacyInspectionScheduleRedirect />} />
    <Route path="/inspections/:id" element={<M module="inspection_management"><LegacyInspectionRecordNotice /></M>} />
    <Route path="/supervision/examination-schedule" element={<M module="prudential_supervision"><ExaminationSchedule /></M>} />
    <Route path="/supervision/plans" element={<M module="prudential_supervision"><SupervisoryPlansDashboard /></M>} />
    <Route path="/supervision/plans/:id" element={<M module="prudential_supervision"><SupervisoryPlanRecord /></M>} />
    <Route path="/supervision/team-performance" element={<SE><SupervisoryTeamPerformance /></SE>} />
    <Route path="/supervision/portfolio" element={<SE><SupervisoryPortfolio /></SE>} />
    <Route path="/supervision/monitoring" element={<SE><ContinuousMonitoring /></SE>} />
    <Route path="/supervision/detection" element={<SE><DetectionGovernance /></SE>} />
    <Route path="/supervision/management-assurance" element={<SE><ManagementAssurance /></SE>} />
    <Route path="/supervision/portfolio-intelligence" element={<SE><PortfolioIntelligence /></SE>} />
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
    <Route path="/conduct/signals" element={<M module="market_conduct"><ConductSignals /></M>} />
    <Route path="/conduct/signals/:id" element={<M module="market_conduct"><ConductSignalDetail /></M>} />
    <Route path="/governance/ai" element={<M module="ai_management"><AiGovernanceOverview /></M>} />
    <Route path="/governance/ai/activity" element={<M module="ai_management"><AiActivityRegister /></M>} />
    <Route path="/governance/ai/activity/:kind/:id" element={<M module="ai_management"><AiActivityDetail /></M>} />
    <Route path="/governance/ai/use-cases" element={<M module="ai_management"><AiUseCases /></M>} />
    <Route path="/governance/ai/use-cases/:code" element={<M module="ai_management"><AiUseCaseDetail /></M>} />
    <Route path="/governance/ai/models" element={<M module="ai_management"><AiModels /></M>} />
    <Route path="/governance/ai/instructions" element={<M module="ai_management"><AiInstructions /></M>} />
    <Route path="/governance/ai/assurance" element={<M module="ai_management"><AiAssurance /></M>} />
    <Route path="/governance/ai/assurance/:id" element={<M module="ai_management"><AiAssuranceDetail /></M>} />
    <Route path="/governance/ai/exceptions" element={<M module="ai_management"><AiExceptions /></M>} />
    <Route path="/governance/ai/surfaces" element={<M module="ai_management"><AiSurfaces /></M>} />
    <Route path="/conduct/patterns" element={<M module="market_conduct"><ConductPatterns /></M>} />
    <Route path="/conduct/patterns/:id" element={<M module="market_conduct"><ConductPatternDetail /></M>} />
    <Route path="/conduct/supervisory-intelligence" element={<M module="market_conduct"><SupervisoryIntelligence /></M>} />
    <Route path="/conduct/reporting" element={<M module="market_conduct"><ManagementReporting /></M>} />
    <Route path="/conduct/emerging-risks" element={<M module="market_conduct"><EmergingRisksRegister /></M>} />
    <Route path="/conduct/emerging-risks/:riskId" element={<M module="market_conduct"><EmergingRiskDetail /></M>} />
    <Route path="/conduct/prioritisation" element={<M module="market_conduct"><ConductPrioritisation /></M>} />
    <Route path="/conduct/attention" element={<M module="market_conduct"><SupervisoryAttentionRegister /></M>} />
    <Route path="/conduct/attention/:id" element={<M module="market_conduct"><SupervisoryAttentionDetail /></M>} />
    <Route path="/conduct/plans/:id" element={<M module="market_conduct"><SupervisoryPlanDetail /></M>} />
    <Route path="/conduct/interventions" element={<M module="market_conduct"><InterventionsRegister /></M>} />
    <Route path="/conduct/interventions/:id" element={<M module="market_conduct"><InterventionDetail /></M>} />

    <Route path="/conduct/alerts" element={<M module="market_conduct"><ConductAlerts /></M>} />
    <Route path="/conduct/surveillance" element={<M module="market_conduct"><SurveillanceWorkspace /></M>} />
    <Route path="/conduct/actions" element={<M module="market_conduct"><ConductActions /></M>} />
    <Route path="/conduct/actions/:id" element={<M module="market_conduct"><RemediationDetail /></M>} />
    <Route path="/conduct/findings" element={<M module="market_conduct"><ConductFindings /></M>} />
    <Route path="/conduct/findings/:id" element={<M module="market_conduct"><FindingDetail /></M>} />


    <Route path="/supervision/thematic-reviews" element={<M module="market_conduct"><ThematicReviews /></M>} />
    <Route path="/supervision/thematic-reviews/new" element={<M module="market_conduct"><NewThematicReview /></M>} />
    <Route path="/supervision/thematic-reviews/:id" element={<M module="market_conduct"><ThematicReviewDetail /></M>} />
    <Route path="/supervision/thematic-closure-approvals" element={<M module="market_conduct"><ThematicClosureQueue /></M>} />

    <Route path="/admin/conduct/monitoring-rules" element={<M module="market_conduct"><MonitoringRules /></M>} />
    <Route path="/conduct/entities" element={<M module="market_conduct"><ConductEntitiesList /></M>} />
    <Route path="/conduct/entities/:entityId/360" element={<M module="market_conduct"><Conduct360 /></M>} />
    <Route path="/conduct/entities/:id" element={<ConductEntityRedirect />} />
    <Route path="/conduct/supervision-loop" element={<M module="market_conduct"><SupervisionLoop /></M>} />
    <Route path="/conduct/work-queue" element={<M module="market_conduct"><ConductWorkQueue /></M>} />
    <Route path="/conduct/investigations" element={<M module="market_conduct"><Investigations /></M>} />
    <Route path="/conduct/closure-approvals" element={<M module="market_conduct"><InvestigationClosureQueue /></M>} />
    <Route path="/conduct/investigations/:id" element={<M module="market_conduct"><InvestigationDetail /></M>} />

    <Route path="/complaints/internal/new" element={<M module="complaint_management"><NewInternalComplaint /></M>} />

    {/* Epic 3 — AML/CFT supervision workspace */}
    <Route path="/supervision/aml" element={<M module="aml_supervision"><AmlOverview /></M>} />
    <Route path="/supervision/aml/work-queue" element={<M module="aml_supervision"><AmlWorkQueue /></M>} />
    <Route path="/supervision/aml/entities" element={<M module="aml_supervision"><AmlSupervisedEntities /></M>} />
    <Route path="/supervision/aml/assessments" element={<M module="aml_supervision"><AmlAssessments /></M>} />
    <Route path="/supervision/aml/assessments/:id" element={<M module="aml_supervision"><AmlAssessmentWorkspace /></M>} />
    <Route path="/supervision/aml/heatmap" element={<M module="aml_supervision"><AmlRiskHeatmap /></M>} />
    <Route path="/supervision/aml/examinations" element={<M module="aml_supervision"><AmlExaminations /></M>} />
    <Route path="/supervision/aml/findings" element={<M module="aml_supervision"><AmlFindings /></M>} />
    <Route path="/supervision/aml/portfolio" element={<M module="aml_supervision"><AmlPortfolio /></M>} />

    {/* Canonical enterprise examination workspace — authorization derives from
        the examination's real supervisory domain (AML/CFT, prudential, conduct).
        The prudential path below remains an alias. */}
    <Route
      path="/supervision/examinations/:id"
      element={<ExaminationDomainRoute><ExaminationWorkspace /></ExaminationDomainRoute>}
    />

    {/* Canonical enterprise finding workspace — one screen for every domain;
        authorization derives from the finding's own supervisory domain. */}
    <Route
      path="/supervision/findings/:id"
      element={<FindingDomainRoute><FindingWorkspace /></FindingDomainRoute>}
    />


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
    <Route path="/prudential/examinations/:id" element={<LegacyExaminationRedirect />} />
    <Route path="/prudential/payment-systems" element={<M module="prudential_supervision"><PaymentSystemsOversight /></M>} />
    <Route path="/prudential/payment-systems/:operatorId" element={<M module="prudential_supervision"><PaymentOperatorProfile /></M>} />
    <Route path="/prudential/pfmi-assessments/:assessmentId" element={<M module="prudential_supervision"><PfmiAssessmentWizard /></M>} />
    <Route path="/prudential/stress-indicators" element={<M module="prudential_supervision"><StressIndicatorsAdmin /></M>} />
    <Route path="/admin/prudential-taxonomy" element={<M module="prudential_supervision"><PrudentialTaxonomyAdmin /></M>} />
    <Route path="/correspondence" element={<M module="notification_management"><CorrespondenceDashboard /></M>} />
    <Route path="/correspondence/dashboard" element={<M module="notification_management"><CorrespondenceDashboard /></M>} />
    <Route path="/correspondence/manager" element={<Navigate to="/correspondence/inbox" replace />} />
    <Route path="/correspondence/inbox" element={<M module="notification_management"><CorrespondenceInbox /></M>} />

    <Route path="/correspondence/records" element={<M module="notification_management"><CorrespondenceRecords /></M>} />
    <Route path="/correspondence/:id" element={<M module="notification_management"><ThreadWorkspace /></M>} />
    <Route path="/admin/correspondence-routing" element={<M module="settings"><CorrespondenceRoutingRules /></M>} />
    <Route path="/entity/correspondence" element={<P><MyCorrespondence /></P>} />
    <Route path="/entity/correspondence/:id" element={<P><MyCorrespondenceDetail /></P>} />
    <Route path="/entity/correspondence/thread/:id" element={<Navigate to="/entity/correspondence" replace />} />
    <Route path="/correspondence/threads" element={<Navigate to="/correspondence/inbox" replace />} />
    <Route path="/correspondence/thread/:id" element={<LegacyThreadRedirect />} />
    <Route path="/entity/complaint-rfis" element={<MyComplaintRfis />} />
    <Route path="/entity/supervisory-actions" element={<MySupervisoryActions />} />

    {/* RDM-ENTITY-001 Wave A — entity registry, resolution and membership */}
    <Route path="/entities" element={<M module="licensee_management"><EntityDirectory /></M>} />
    {/* Canonical regulated-entity profile = Enterprise Entity 360. */}
    <Route path="/entities/:entityId" element={<M module="licensee_management"><Entity360Detail /></M>} />
    {/* Structural mutation workspace (Wave B) lives inside the entity profile. */}
    <Route path="/entities/:entityId/structure" element={<M module="licensee_management"><EntityStructureHub /></M>} />
    {/* Compatibility URL for existing bookmarks — redirects to the canonical profile. */}
    <Route path="/entities/:entityId/360" element={<Entity360Redirect />} />
    {/* F8A-B3 — canonical person identity: queue is registered before the
        parameterised person profile so it is never captured as a party id. */}
    <Route path="/persons/identity-queue" element={<M module="licensee_management"><PersonIdentityQueue /></M>} />
    <Route path="/persons/:partyId" element={<M module="licensee_management"><Person360Detail /></M>} />
    {/* F8A-B4 — canonical address 360 and deterministic relationship intelligence. */}
    <Route path="/intelligence/network" element={<M module="entity_structure"><RelationshipIntelligenceSearch /></M>} />
    <Route path="/intelligence/addresses/:addressId" element={<M module="entity_structure"><Address360Detail /></M>} />
    <Route path="/licensing/entity-resolution" element={<M module="entity_resolution"><EntityResolutionQueue /></M>} />
    <Route path="/licensing/entity-resolution/:caseId" element={<M module="entity_resolution"><EntityResolutionDetail /></M>} />
    <Route path="/admin/entity-memberships" element={<M module="entity_membership"><EntityMemberships /></M>} />
    {/* Registration & entity onboarding oversight — durable identification audit ledger. */}
    <Route path="/licensing/onboarding-oversight" element={<M module="onboarding"><OnboardingWorkspace /></M>} />



  </>
);
