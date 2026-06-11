import { Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';

const Index = lazy(() => import('@/pages/Index'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const RegistrationSuccess = lazy(() => import('@/pages/registration/RegistrationSuccess'));

export const publicRoutes = (
  <>
    <Route path="/" element={<Index />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    {/* Backward compatibility: legacy nested route redirects to canonical /register */}
    <Route path="/registration/pre-licensee" element={<Navigate to="/register" replace />} />
    <Route path="/registration/success" element={<RegistrationSuccess />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<NotFound />} />
  </>
);
