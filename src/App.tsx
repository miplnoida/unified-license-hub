import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import PreLicense from "./pages/PreLicense";
import Returns from "./pages/Returns";
import RoleManagement from "./pages/admin/RoleManagement";
import FormBuilder from "./pages/admin/FormBuilder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/pre-license" element={<ProtectedRoute><PreLicense /></ProtectedRoute>} />
      <Route path="/post-license" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      
      {/* Admin Routes */}
      <Route path="/admin/applications" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/returns" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/roles" element={<ProtectedRoute><RoleManagement /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/masters" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/admin/forms" element={<ProtectedRoute><FormBuilder /></ProtectedRoute>} />
      <Route path="/admin/workflows" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      
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
