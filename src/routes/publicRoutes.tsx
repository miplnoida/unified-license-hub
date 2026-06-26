import { Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';

const Index = lazy(() => import('@/pages/Index'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const RegistrationSuccess = lazy(() => import('@/pages/registration/RegistrationSuccess'));
const RegistrationPortal = lazy(() => import('@/pages/registration/RegistrationPortal'));
const PreLicenseeRegistration = lazy(() => import('@/pages/registration/PreLicenseeRegistration'));
const UpdateRegistrationRedirect = lazy(() => import('@/routes/UpdateRegistrationRedirect'));

export const publicRoutes = (
  <>
    <Route path="/" element={<Index />} />
    <Route path="/login" element={<Login />} />
    {/* /register is for BRAND NEW registrations only. Existing users editing or
        resubmitting a registration must use /registration/portal — never /register. */}
    <Route path="/register" element={<Register />} />
    {/* Backward compatibility: legacy nested route redirects to canonical /register */}
    <Route path="/registration/pre-licensee" element={<Navigate to="/register" replace />} />
    <Route path="/registration/success" element={<RegistrationSuccess />} />
    {/* Legacy portal resolves immediately to the update form; it must not show
        generic pre-licensee form cards during resubmission. */}
    <Route path="/registration/portal" element={<P><RegistrationPortal /></P>} />
    <Route path="/registration/portal/form/:formId" element={<P><UpdateRegistrationRedirect /></P>} />
    {/* Canonical update/edit/resubmission flow. */}
    <Route path="/update-registration-form" element={<P><PreLicenseeRegistration mode="update" /></P>} />
    <Route path="/update-registration-form/:registrationId" element={<P><UpdateRegistrationRedirect /></P>} />
    <Route path="/registration/update/:registrationId" element={<P><PreLicenseeRegistration mode="update" /></P>} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<NotFound />} />
  </>
);
