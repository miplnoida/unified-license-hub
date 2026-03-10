import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./pages/PlaceholderPage";

// Applications
import ApplicationsList from "./pages/applications/ApplicationsList";
import ApplicationDetail from "./pages/applications/ApplicationDetail";

// Licenses
import LicensesList from "./pages/licenses/LicensesList";
import LicenseDetail from "./pages/licenses/LicenseDetail";

// Compliance
import ComplianceReturns from "./pages/compliance/ComplianceReturns";

// Payments
import PaymentHistory from "./pages/payments/PaymentHistory";

// Complaints
import ComplaintsList from "./pages/complaints/ComplaintsList";

// Workflows
import WorkflowList from "./pages/workflows/WorkflowList";

// Delegation
import DelegationRules from "./pages/delegation/DelegationRules";

// Documents
import DocumentStore from "./pages/documents/DocumentStore";

// Notifications
import NotificationCenter from "./pages/notifications/NotificationCenter";

// Analytics
import AnalyticsDashboard from "./pages/analytics/AnalyticsDashboard";

// Admin
import RoleManagement from "./pages/admin/RoleManagement";
import AuditLogs from "./pages/admin/AuditLogs";
import UserManagement from "./pages/admin/UserManagement";
import FormBuilder from "./pages/admin/FormBuilder";
import PreLicenseForms from "./pages/admin/PreLicenseForms";
import PostLicenseForms from "./pages/admin/PostLicenseForms";
import MasterConfiguration from "./pages/admin/MasterConfiguration";
import FeeManagement from "./pages/admin/FeeManagement";
import ReturnConfiguration from "./pages/admin/ReturnConfiguration";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<P><Dashboard /></P>} />

      {/* Applications */}
      <Route path="/applications" element={<P><ApplicationsList /></P>} />
      <Route path="/applications/queue" element={<P><ApplicationsList /></P>} />
      <Route path="/applications/:id" element={<P><ApplicationDetail /></P>} />

      {/* Licenses */}
      <Route path="/licenses" element={<P><LicensesList /></P>} />
      <Route path="/licenses/:id" element={<P><LicenseDetail /></P>} />

      {/* Compliance */}
      <Route path="/compliance/returns" element={<P><ComplianceReturns /></P>} />

      {/* Payments */}
      <Route path="/payments" element={<P><PaymentHistory /></P>} />

      {/* Complaints */}
      <Route path="/complaints" element={<P><ComplaintsList /></P>} />

      {/* Workflows */}
      <Route path="/workflows" element={<P><WorkflowList /></P>} />

      {/* Delegation Rules */}
      <Route path="/delegation-rules" element={<P><DelegationRules /></P>} />

      {/* Documents */}
      <Route path="/documents" element={<P><DocumentStore /></P>} />

      {/* Notifications */}
      <Route path="/notifications" element={<P><NotificationCenter /></P>} />

      {/* Analytics */}
      <Route path="/analytics" element={<P><AnalyticsDashboard /></P>} />

      {/* Form Management */}
      <Route path="/admin/forms/pre-license" element={<P><PreLicenseForms /></P>} />
      <Route path="/admin/forms/post-license" element={<P><PostLicenseForms /></P>} />
      <Route path="/admin/forms/create" element={<P><FormBuilder /></P>} />

      {/* Master Configuration */}
      <Route path="/admin/masters" element={<Navigate to="/admin/masters/sectors" replace />} />
      <Route path="/admin/masters/sectors" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/masters/sub-sectors" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/masters/categories" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/masters/services" element={<P><MasterConfiguration /></P>} />

      {/* Fee Management */}
      <Route path="/admin/fees" element={<P><FeeManagement /></P>} />

      {/* Return Configuration */}
      <Route path="/admin/return-config" element={<P><ReturnConfiguration /></P>} />

      {/* Administration */}
      <Route path="/admin/users" element={<P><UserManagement /></P>} />
      <Route path="/admin/roles" element={<P><RoleManagement /></P>} />
      <Route path="/admin/audit-logs" element={<P><AuditLogs /></P>} />

      {/* Settings & Account */}
      <Route path="/settings" element={<P><PlaceholderPage /></P>} />
      <Route path="/profile" element={<P><PlaceholderPage /></P>} />
      <Route path="/change-password" element={<P><PlaceholderPage /></P>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
