import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RegulatorProvider } from "@/contexts/RegulatorContext";
import { SiteSettingsProvider } from "@/contexts/SiteSettingsContext";
import { Suspense } from "react";
import { AuthLoadingScreen } from "@/components/shared/AuthLoadingScreen";

import { publicRoutes } from "@/routes/publicRoutes";
import { dashboardRoutes } from "@/routes/dashboardRoutes";
import { adminRoutes } from "@/routes/adminRoutes";
import { settingsRoutes } from "@/routes/settingsRoutes";
import { returnsRoutes } from "@/routes/returnsRoutes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 300_000, retry: 2, retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), refetchOnWindowFocus: false },
    mutations: { retry: 1 },
  },
});

function AppRoutes() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <Routes>
        {publicRoutes}
        {dashboardRoutes}
        {adminRoutes}
        {settingsRoutes}
        {returnsRoutes}
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SiteSettingsProvider>
      <AuthProvider>
        <RegulatorProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </RegulatorProvider>
      </AuthProvider>
    </SiteSettingsProvider>
  </QueryClientProvider>
);

export default App;
