import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import PreLicense from "./pages/PreLicense";
import Returns from "./pages/Returns";
import RoleManagement from "./pages/admin/RoleManagement";
import FormBuilder from "./pages/admin/FormBuilder";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./pages/PlaceholderPage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function P() {
  return <ProtectedRoute><PlaceholderPage /></ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/pre-license" element={<ProtectedRoute><PreLicense /></ProtectedRoute>} />
      <Route path="/post-license" element={<P />} />
      <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/notifications" element={<P />} />
      
      {/* Billing */}
      <Route path="/billing/pre-licensee" element={<P />} />
      <Route path="/billing/post-licensee" element={<P />} />
      <Route path="/billing/penalties" element={<P />} />
      <Route path="/payments" element={<P />} />

      {/* Returns Management */}
      <Route path="/returns-mgmt/structures" element={<P />} />
      <Route path="/returns-mgmt/rules" element={<P />} />
      <Route path="/returns-mgmt/validations" element={<P />} />
      <Route path="/returns-mgmt/groups" element={<P />} />
      <Route path="/returns-mgmt/scheduling" element={<P />} />
      <Route path="/returns-mgmt/view" element={<P />} />
      <Route path="/upload-returns" element={<P />} />

      {/* Reports */}
      <Route path="/reports/consolidated" element={<P />} />
      <Route path="/reports/insurance-internal" element={<P />} />
      <Route path="/reports/cooperatives" element={<P />} />
      <Route path="/reports/insurance" element={<P />} />
      <Route path="/reports/money-services" element={<P />} />
      <Route path="/reports/mutual-fund" element={<P />} />
      <Route path="/reports/international-banks" element={<P />} />
      <Route path="/reports/trust-company" element={<P />} />
      <Route path="/reports/internal" element={<P />} />
      <Route path="/reports/other" element={<P />} />
      <Route path="/reports/payments" element={<P />} />
      <Route path="/statement-reports" element={<P />} />

      {/* Settings */}
      <Route path="/settings/general" element={<P />} />
      <Route path="/settings/schedule" element={<P />} />
      <Route path="/settings/payment" element={<P />} />

      {/* Communication */}
      <Route path="/messages" element={<P />} />
      <Route path="/mail-sms" element={<P />} />
      <Route path="/profile" element={<P />} />

      {/* Admin Routes */}
      <Route path="/admin/applications" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/returns" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/roles" element={<ProtectedRoute><RoleManagement /></ProtectedRoute>} />
      <Route path="/admin/users" element={<P />} />
      <Route path="/admin/masters" element={<P />} />
      <Route path="/admin/forms" element={<ProtectedRoute><FormBuilder /></ProtectedRoute>} />
      <Route path="/admin/workflows" element={<P />} />
      
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
