import { Route } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';
import { SettingsRoute } from '@/components/auth/RouteGuards';

const SettingsHub = lazy(() => import('@/pages/settings/SettingsHub'));
const GeneralSettings = lazy(() => import('@/pages/settings/GeneralSettings'));
const PaymentSettings = lazy(() => import('@/pages/settings/PaymentSettings'));
const ScheduleSettings = lazy(() => import('@/pages/settings/ScheduleSettings'));
const NotificationSettings = lazy(() => import('@/pages/settings/NotificationSettings'));
const SecuritySettings = lazy(() => import('@/pages/settings/SecuritySettings'));
const BrandingSettings = lazy(() => import('@/pages/settings/BrandingSettings'));
const EmailSmsSettings = lazy(() => import('@/pages/settings/EmailSmsSettings'));
const IntegrationSettings = lazy(() => import('@/pages/settings/IntegrationSettings'));
const DataManagementSettings = lazy(() => import('@/pages/settings/DataManagementSettings'));
const ApplicationFormSettings = lazy(() => import('@/pages/settings/ApplicationFormSettings'));

function S({ children }: { children: React.ReactNode }) {
  return <P><SettingsRoute>{children}</SettingsRoute></P>;
}

export const settingsRoutes = (
  <>
    <Route path="/settings" element={<S><SettingsHub /></S>} />
    <Route path="/settings/general" element={<S><GeneralSettings /></S>} />
    <Route path="/settings/payments" element={<S><PaymentSettings /></S>} />
    <Route path="/settings/schedule" element={<S><ScheduleSettings /></S>} />
    <Route path="/settings/notifications" element={<S><NotificationSettings /></S>} />
    <Route path="/settings/security" element={<S><SecuritySettings /></S>} />
    <Route path="/settings/branding" element={<S><BrandingSettings /></S>} />
    <Route path="/settings/email-sms" element={<S><EmailSmsSettings /></S>} />
    <Route path="/settings/integrations" element={<S><IntegrationSettings /></S>} />
    <Route path="/settings/data" element={<S><DataManagementSettings /></S>} />
    <Route path="/settings/applications" element={<S><ApplicationFormSettings /></S>} />
  </>
);
