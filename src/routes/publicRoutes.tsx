import { Route } from 'react-router-dom';
import { lazy } from 'react';

const Index = lazy(() => import('@/pages/Index'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const PreLicenseeRegistration = lazy(() => import('@/pages/registration/PreLicenseeRegistration'));
const RegistrationSuccess = lazy(() => import('@/pages/registration/RegistrationSuccess'));

export const publicRoutes = (
  <>
    <Route path="/" element={<Index />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    {/* Backward compatibility: redirect legacy nested route to canonical /register */}
    <Route path="/registration/pre-licensee" element={<LegacyRegisterRedirect />} />
    <Route path="/registration/success" element={<RegistrationSuccess />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<NotFound />} />
  </>
);
