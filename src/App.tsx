import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";

import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

import { RegulatorProvider } from "@/contexts/RegulatorContext";
import { SiteSettingsProvider } from "@/contexts/SiteSettingsContext";
import { PpocProvider } from "@/contexts/PpocContext";
import { ActiveSectorProvider } from "@/contexts/ActiveSectorContext";
import { Suspense } from "react";
import { AuthLoadingScreen } from "@/components/shared/AuthLoadingScreen";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

import { publicRoutes } from "@/routes/publicRoutes";
import { dashboardRoutes } from "@/routes/dashboardRoutes";
import { adminRoutes } from "@/routes/adminRoutes";
import { settingsRoutes } from "@/routes/settingsRoutes";
import { returnsRoutes } from "@/routes/returnsRoutes";
import { fpaRoutes } from "@/routes/fpaRoutes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 300_000, retry: 2, retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), refetchOnWindowFocus: false },
    mutations: { retry: 1 },
  },
});

function AppRoutes() {
  return (
    <ErrorBoundary context="AppRoutes">
      <Routes>
        {/* Public routes keep their own layouts and their own Suspense island */}
        <Route
          element={
            <Suspense fallback={<AuthLoadingScreen />}>
              <Outlet />
            </Suspense>
          }
        >
          {publicRoutes}
        </Route>

        {/*
         * Authenticated portal: ONE persistent shell (Sidebar + Header +
         * LicenseeSwitcher). Route chunks suspend inside the content area only,
         * so navigation never remounts the chrome or flashes AuthLoadingScreen.
         */}
        <Route element={<AppShell />}>
          {dashboardRoutes}
          {adminRoutes}
          {settingsRoutes}
          {returnsRoutes}
          {fpaRoutes}
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    <SiteSettingsProvider>
      <AuthProvider>
        <NotificationsProvider>
          <RegulatorProvider>
            <PpocProvider>
              <ActiveSectorProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <AppRoutes />
                  </BrowserRouter>
                </TooltipProvider>
              </ActiveSectorProvider>
            </PpocProvider>
          </RegulatorProvider>
        </NotificationsProvider>
      </AuthProvider>

    </SiteSettingsProvider>
  </QueryClientProvider>
);

export default App;
