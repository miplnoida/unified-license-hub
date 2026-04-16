import { Route } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ApplicationsList = lazy(() => import('@/pages/applications/ApplicationsList'));
const ApplicationDetail = lazy(() => import('@/pages/applications/ApplicationDetail'));
const NewApplication = lazy(() => import('@/pages/NewApplication'));
const LicensesList = lazy(() => import('@/pages/licenses/LicensesList'));
const LicenseDetail = lazy(() => import('@/pages/licenses/LicenseDetail'));
const ComplianceReturns = lazy(() => import('@/pages/compliance/ComplianceReturns'));
const ReturnSubmission = lazy(() => import('@/pages/compliance/ReturnSubmission'));
const PaymentHistory = lazy(() => import('@/pages/payments/PaymentHistory'));
const PaymentDetail = lazy(() => import('@/pages/payments/PaymentDetail'));
const ComplaintsList = lazy(() => import('@/pages/complaints/ComplaintsList'));
const WorkflowList = lazy(() => import('@/pages/workflows/WorkflowList'));
const DelegationRules = lazy(() => import('@/pages/delegation/DelegationRules'));
const DocumentStore = lazy(() => import('@/pages/documents/DocumentStore'));
const NotificationCenter = lazy(() => import('@/pages/notifications/NotificationCenter'));
const AnalyticsDashboard = lazy(() => import('@/pages/analytics/AnalyticsDashboard'));
const ReportsDashboard = lazy(() => import('@/pages/reports/ReportsDashboard'));
const FormDetail = lazy(() => import('@/pages/FormDetail'));
const ViewReturns = lazy(() => import('@/pages/returns-mgmt/ViewReturns'));
const Profile = lazy(() => import('@/pages/Profile'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const FormPreview = lazy(() => import('@/pages/FormPreview'));

export const dashboardRoutes = (
  <>
    <Route path="/dashboard" element={<P><Dashboard /></P>} />

    <Route path="/applications" element={<P><ApplicationsList /></P>} />
    <Route path="/applications/new" element={<P><NewApplication /></P>} />
    <Route path="/applications/queue" element={<P><ApplicationsList /></P>} />
    <Route path="/applications/:id" element={<P><ApplicationDetail /></P>} />

    <Route path="/licenses" element={<P><LicensesList /></P>} />
    <Route path="/licenses/:id" element={<P><LicenseDetail /></P>} />

    <Route path="/returns-management" element={<P><ViewReturns /></P>} />

    <Route path="/compliance/returns" element={<P><ComplianceReturns /></P>} />
    <Route path="/compliance/returns/submit" element={<P><ReturnSubmission /></P>} />

    <Route path="/payments" element={<P><PaymentHistory /></P>} />
    <Route path="/payments/:id" element={<P><PaymentDetail /></P>} />
    <Route path="/complaints" element={<P><ComplaintsList /></P>} />
    <Route path="/workflows" element={<P><WorkflowList /></P>} />
    <Route path="/delegation-rules" element={<P><DelegationRules /></P>} />
    <Route path="/documents" element={<P><DocumentStore /></P>} />
    <Route path="/notifications" element={<P><NotificationCenter /></P>} />
    <Route path="/analytics" element={<P><AnalyticsDashboard /></P>} />
    <Route path="/reports" element={<P><ReportsDashboard /></P>} />
    <Route path="/reports/*" element={<P><ReportsDashboard /></P>} />

    <Route path="/forms/:formId" element={<P><FormDetail /></P>} />

    <Route path="/profile" element={<P><Profile /></P>} />
    <Route path="/change-password" element={<P><ChangePassword /></P>} />
    <Route path="/preview/:versionId" element={<P><FormPreview /></P>} />
  </>
);
