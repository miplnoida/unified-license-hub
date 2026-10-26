import { Route } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
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
const LicenseExpirySettings = lazy(() => import('@/pages/settings/LicenseExpirySettings'));
const CertificateSignatorySettings = lazy(() => import('@/pages/settings/CertificateSignatorySettings'));
const CaptchaSettings = lazy(() => import('@/pages/settings/CaptchaSettings'));
const CurrencySettings = lazy(() => import('@/pages/settings/CurrencySettings'));
const SubscriptionPackageSettings = lazy(() => import('@/pages/settings/SubscriptionPackageSettings'));

function S({ children }: { children: React.ReactNode }) {
  return <P><SettingsRoute>{children}</SettingsRoute></P>;
}

export const settingsRoutes = (
  <>
    <Route path="/settings" element={<S><SettingsHub /></S>} />
    <Route path="/settings/package" element={<S><SubscriptionPackageSettings /></S>} />
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
    <Route path="/settings/license-expiry" element={<S><LicenseExpirySettings /></S>} />
    <Route path="/settings/certificate-signatory" element={<S><CertificateSignatorySettings /></S>} />
    <Route path="/settings/captcha" element={<S><CaptchaSettings /></S>} />
    <Route path="/settings/currency" element={<S><CurrencySettings /></S>} />
  </>

);
