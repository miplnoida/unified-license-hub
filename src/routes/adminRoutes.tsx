import { Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';
import { AdminRoute } from '@/components/auth/RouteGuards';

const AdminHub = lazy(() => import('@/pages/admin/AdminHub'));
const FormManagement = lazy(() => import('@/pages/admin/FormManagement'));
const FormBuilder = lazy(() => import('@/pages/admin/FormBuilder'));
const MasterConfiguration = lazy(() => import('@/pages/admin/MasterConfiguration'));
const MasterDataManagement = lazy(() => import('@/pages/admin/MasterDataManagement'));
const FeeManagement = lazy(() => import('@/pages/admin/FeeManagement'));
const ReturnConfiguration = lazy(() => import('@/pages/admin/ReturnConfiguration'));
const RegulatorManagement = lazy(() => import('@/pages/admin/RegulatorManagement'));
const ManageLicensees = lazy(() => import('@/pages/admin/ManageLicensees'));
const LicenseeDetailPage = lazy(() => import('@/pages/admin/LicenseeDetail'));
const UserManagement = lazy(() => import('@/pages/admin/UserManagement'));
const ManageWebUsers = lazy(() => import('@/pages/admin/ManageWebUsers'));
const RoleManagement = lazy(() => import('@/pages/admin/RoleManagement'));
const AuditLogs = lazy(() => import('@/pages/admin/AuditLogs'));
const NotificationTemplates = lazy(() => import('@/pages/admin/NotificationTemplates'));
const ComplaintTypes = lazy(() => import('@/pages/admin/ComplaintTypes'));
const ApprovedLicensees = lazy(() => import('@/pages/admin/ApprovedLicensees'));
const RegistrationFormBuilder = lazy(() => import('@/pages/admin/RegistrationFormBuilder'));

// Returns Management - Admin
const ReturnTypesPage = lazy(() => import('@/pages/admin/returns/ReturnTypesPage'));
const ReturnConfigsPage = lazy(() => import('@/pages/admin/returns/ReturnConfigsPage'));
const CutoffConfigPage = lazy(() => import('@/pages/admin/returns/CutoffConfigPage'));
const DueDatesPage = lazy(() => import('@/pages/admin/returns/DueDatesPage'));
const LateFeesPage = lazy(() => import('@/pages/admin/returns/LateFeesPage'));
const NotifTemplatesPage = lazy(() => import('@/pages/admin/returns/NotifTemplatesPage'));
const NotifLogPage = lazy(() => import('@/pages/admin/returns/NotifLogPage'));
const ScheduleCalendarPage = lazy(() => import('@/pages/admin/returns/ScheduleCalendarPage'));

function A({ children }: { children: React.ReactNode }) {
  return <P><AdminRoute>{children}</AdminRoute></P>;
}

export const adminRoutes = (
  <>
    <Route path="/admin" element={<A><AdminHub /></A>} />

    <Route path="/admin/forms" element={<A><FormManagement /></A>} />
    <Route path="/admin/forms/pre-license" element={<Navigate to="/admin/forms?tab=pre_license" replace />} />
    <Route path="/admin/forms/post-license" element={<Navigate to="/admin/forms?tab=post_license" replace />} />
    <Route path="/admin/forms/create" element={<A><FormBuilder /></A>} />

    <Route path="/admin/masters" element={<Navigate to="/admin/masters/sectors" replace />} />
    <Route path="/admin/masters/sectors" element={<A><MasterConfiguration /></A>} />
    <Route path="/admin/masters/sub-sectors" element={<A><MasterConfiguration /></A>} />
    <Route path="/admin/masters/categories" element={<A><MasterConfiguration /></A>} />
    <Route path="/admin/masters/services" element={<A><MasterConfiguration /></A>} />

    <Route path="/admin/master-data" element={<A><MasterDataManagement /></A>} />
    <Route path="/admin/fees" element={<A><FeeManagement /></A>} />
    <Route path="/admin/return-config" element={<A><ReturnConfiguration /></A>} />
    <Route path="/admin/regulators" element={<A><RegulatorManagement /></A>} />
    <Route path="/admin/licensees" element={<A><ManageLicensees /></A>} />
    <Route path="/admin/licensees/:id" element={<A><LicenseeDetailPage /></A>} />
    <Route path="/admin/users" element={<A><UserManagement /></A>} />
    <Route path="/admin/web-users" element={<A><ManageWebUsers /></A>} />
    <Route path="/admin/roles" element={<A><RoleManagement /></A>} />
    <Route path="/admin/audit-logs" element={<A><AuditLogs /></A>} />
    <Route path="/admin/notification-templates" element={<A><NotificationTemplates /></A>} />
    <Route path="/admin/complaint-types" element={<A><ComplaintTypes /></A>} />
    <Route path="/admin/approved-licensees" element={<A><ApprovedLicensees /></A>} />
    <Route path="/admin/registration-forms" element={<A><RegistrationFormBuilder /></A>} />

    {/* Returns Management - Admin */}
    <Route path="/admin/returns/types" element={<A><ReturnTypesPage /></A>} />
    <Route path="/admin/returns/configurations" element={<A><ReturnConfigsPage /></A>} />
    <Route path="/admin/returns/cutoff" element={<A><CutoffConfigPage /></A>} />
    <Route path="/admin/returns/due-dates" element={<A><DueDatesPage /></A>} />
    <Route path="/admin/returns/late-fees" element={<A><LateFeesPage /></A>} />
    <Route path="/admin/returns/notifications/templates" element={<A><NotifTemplatesPage /></A>} />
    <Route path="/admin/returns/notifications/log" element={<A><NotifLogPage /></A>} />
    <Route path="/admin/returns/schedule" element={<A><ScheduleCalendarPage /></A>} />
  </>
);
