import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./pages/PlaceholderPage";

// Admin
import RoleManagement from "./pages/admin/RoleManagement";
import AuditLogs from "./pages/admin/AuditLogs";
import FormBuilder from "./pages/admin/FormBuilder";
import PreLicenseForms from "./pages/admin/PreLicenseForms";
import PostLicenseForms from "./pages/admin/PostLicenseForms";
import MasterConfiguration from "./pages/admin/MasterConfiguration";

// Workflows
import WorkflowList from "./pages/workflows/WorkflowList";

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

      {/* Dashboard */}
      <Route path="/dashboard" element={<P><Dashboard /></P>} />

      {/* Applications */}
      <Route path="/applications" element={<P><PlaceholderPage /></P>} />
      <Route path="/applications/queue" element={<P><PlaceholderPage /></P>} />

      {/* Complaints */}
      <Route path="/complaints" element={<P><PlaceholderPage /></P>} />

      {/* Workflows */}
      <Route path="/workflows" element={<P><WorkflowList /></P>} />
      <Route path="/delegation-rules" element={<P><PlaceholderPage /></P>} />

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

      {/* Administration */}
      <Route path="/admin/users" element={<P><PlaceholderPage /></P>} />
      <Route path="/admin/roles" element={<P><RoleManagement /></P>} />
      <Route path="/admin/audit-logs" element={<P><AuditLogs /></P>} />

      {/* Settings & Analytics */}
      <Route path="/settings" element={<P><PlaceholderPage /></P>} />
      <Route path="/analytics" element={<P><PlaceholderPage /></P>} />

      {/* Documents */}
      <Route path="/documents" element={<P><PlaceholderPage /></P>} />

      {/* Account */}
      <Route path="/notifications" element={<P><PlaceholderPage /></P>} />
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
