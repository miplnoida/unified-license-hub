import { Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';

const Index = lazy(() => import('@/pages/Index'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const RegistrationSuccess = lazy(() => import('@/pages/registration/RegistrationSuccess'));
const RegistrationPortal = lazy(() => import('@/pages/registration/RegistrationPortal'));
const RegistrationFormFill = lazy(() => import('@/pages/registration/RegistrationFormFill'));

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
    {/* Update/Edit/Resubmission flow for an authenticated pre-licensee.
        Loads the user's existing registration + form submissions and prefills data. */}
    <Route path="/registration-status" element={<P><RegistrationStatusPage /></P>} />
    <Route path="/registration/portal" element={<P><RegistrationPortal /></P>} />
    <Route path="/registration/portal/form/:formId" element={<P><RegistrationFormFill /></P>} />
    {/* Friendly alias used in resubmission email links */}
    <Route path="/update-registration-form" element={<Navigate to="/registration/portal" replace />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<NotFound />} />
  </>
);
