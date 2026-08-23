# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-process-surfaces.spec.ts >> SCN-SURFACE-P03-LICENSING: owning persona opens its work surfaces cleanly
- Location: e2e/cert-v2/04-process-surfaces.spec.ts:29:3

# Error details

```
Error: P03-LICENSING surface defects

expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 458

- Array []
+ Array [
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at App",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at QueryClientProvider (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at SiteSettingsProvider (http://localhost:8080/src/contexts/SiteS",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AuthProvider (http://localhost:8080/src/contexts/AuthContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at NotificationsProvider (http://localhost:8080/src/contexts/Noti",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at RegulatorProvider (http://localhost:8080/src/contexts/Regulato",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at PpocProvider (http://localhost:8080/src/contexts/PpocContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at ActiveSectorProvider (http://localhost:8080/src/contexts/Activ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at TooltipProvider (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/toaster.tsx:2",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Toaster`. 
+     at ToastProvider (http://localhost:8080/node_modules/.vite/de",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/sonner.tsx:24",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AppRoutes
+     at Router (http://localhost:8080/node_modules/.v",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at Routes (http://localhost:8080/node_modules/.vite/deps/re",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at AppShell (http://localhost:8080/src/components/layout/Ap",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at BreadcrumbLabelProvider (http://localhost:8080/src/compon",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Sidebar (http://localhost:8080/src/components/layout/Side",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Header (http://localhost:8080/src/components/layout/Heade",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at GlobalNavSearch (http://localhost:8080/src/components/layou",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `GlobalNavSearch`. 
+     at CommandDialog (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CommandDialog`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/dep",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DialogContent`. 
+     at DialogPortal (http://localhost:8080/node_modules/.vi",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at HoverCard (http://localhost:8080/node_modules/.vite/deps/@r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at LicenseeSwitcher (http://localhost:8080/src/components/pp",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ApplicationBreadcrumbs (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationBreadcrumbs`. 
+     at BreadcrumbSeparator (http://localhost:8080/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ActingOnBehalfOfBanner (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at RouteContentTransition (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Outlet (http://localhost:8080/node_modules/.vite/deps/rea",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at M (http://localhost:8080/src/routes/dashboardRoutes.tsx:264:14)
+     at RenderedRoute (http://loca",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `M`. 
+     at P (http://localhost:8080/src/routes/routeHelpers.tsx:217:87)
+    ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `P`. 
+     at ProtectedRoute (http://localhost:8080/src/routes/routeHelpers.ts",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ProtectedRoute`. 
+     at AuthLoadingScreen
+     at ProtectedRoute (http://loc",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at DropdownMenu (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DropdownMenuContent`. 
+     at DropdownMenuPortal (http://localhost:8080/node",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ModuleRoute`. 
+     at AuthLoadingScreen
+     at ModuleRoute (http://localhost",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Sidebar`. 
+     at CollapsibleNavItem (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at NavLeaf (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at CollapsibleNavItem (http://localhost:8080/src/c",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at RouteContentSkeleton (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at DashboardLayout (http://localhost:8080/src/compon",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at PageHeader (http://localhost:8080/src/components/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at Select (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `SelectContent`. 
+     at SelectPortal
+     at _c4 (http://localhost:8080/src/c",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at Select (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at Select (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at Select (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at Select (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationQueue`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at App",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at QueryClientProvider (http://localhost:8080/node_modules/.vite/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at SiteSettingsProvider (http://localhost:8080/src/contexts/SiteS",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AuthProvider (http://localhost:8080/src/contexts/AuthContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at NotificationsProvider (http://localhost:8080/src/contexts/Noti",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at RegulatorProvider (http://localhost:8080/src/contexts/Regulato",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at PpocProvider (http://localhost:8080/src/contexts/PpocContext.t",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at ActiveSectorProvider (http://localhost:8080/src/contexts/Activ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at TooltipProvider (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/toaster.tsx:2",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Toaster`. 
+     at ToastProvider (http://localhost:8080/node_modules/.vite/de",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at Toaster (http://localhost:8080/src/components/ui/sonner.tsx:24",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `App`. 
+     at AppRoutes
+     at Router (http://localhost:8080/node_modules/.v",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at Routes (http://localhost:8080/node_modules/.vite/deps/re",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppRoutes`. 
+     at AppShell (http://localhost:8080/src/components/layout/Ap",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at BreadcrumbLabelProvider (http://localhost:8080/src/compon",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Sidebar (http://localhost:8080/src/components/layout/Side",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Header (http://localhost:8080/src/components/layout/Heade",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at GlobalNavSearch (http://localhost:8080/src/components/layou",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `GlobalNavSearch`. 
+     at CommandDialog (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CommandDialog`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/dep",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DialogContent`. 
+     at DialogPortal (http://localhost:8080/node_modules/.vi",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at HoverCard (http://localhost:8080/node_modules/.vite/deps/@r",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at LicenseeSwitcher (http://localhost:8080/src/components/pp",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ApplicationBreadcrumbs (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ApplicationBreadcrumbs`. 
+     at BreadcrumbSeparator (http://localhost:8080/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at ActingOnBehalfOfBanner (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at RouteContentTransition (http://localhost:8080/src/compone",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at Outlet (http://localhost:8080/node_modules/.vite/deps/rea",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s  
+     at M (http://localhost:8080/src/routes/dashboardRoutes.tsx:264:14)
+     at RenderedRoute (http://loca",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `M`. 
+     at P (http://localhost:8080/src/routes/routeHelpers.tsx:217:87)
+    ",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `P`. 
+     at ProtectedRoute (http://localhost:8080/src/routes/routeHelpers.ts",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ProtectedRoute`. 
+     at AuthLoadingScreen
+     at ProtectedRoute (http://loc",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AuthLoadingScreen`. 
+     at Skeleton (http://localhost:8080/src/components/u",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Header`. 
+     at DropdownMenu (http://localhost:8080/node_modules/.vite/deps",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `DropdownMenuContent`. 
+     at DropdownMenuPortal (http://localhost:8080/node",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `ModuleRoute`. 
+     at AuthLoadingScreen
+     at ModuleRoute (http://localhost",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `Sidebar`. 
+     at CollapsibleNavItem (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at NavLeaf (http://localhost:8080/src/components/l",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CollapsibleNavItem`. 
+     at CollapsibleNavItem (http://localhost:8080/src/c",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `AppShell`. 
+     at RouteContentSkeleton (http://localhost:8080/src/component",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Metric (http://localhost:8080/src/pages/licens",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Metric (http://localhost:8080/src/pages/licens",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Metric (http://localhost:8080/src/pages/licens",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Metric (http://localhost:8080/src/pages/licens",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Metric (http://localhost:8080/src/pages/licens",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Select (http://localhost:8080/node_modules/.vi",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `SelectContent`. 
+     at SelectPortal
+     at _c4 (http://localhost:8080/src/c",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at Select (http://localhost:8080/node_modules/.vi",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `OnboardingWorkspace`. 
+     at EnterpriseDataGrid (http://localhost:8080/src/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at GridFilterBar (http://localhost:8080/src/compon",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at DropdownMenu (http://localhost:8080/node_module",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at Select (http://localhost:8080/node_modules/.vit",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f2e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=f2e3]:
    - complementary [ref=f2e4]:
      - generic [ref=f2e5]:
        - img "OLRAS" [ref=f2e7]
        - button [ref=f2e8] [cursor=pointer]
      - navigation [ref=f2e12]:
        - generic [ref=f2e14]:
          - generic [ref=f2e15]:
            - button "Home" [expanded] [ref=f2e16] [cursor=pointer]
            - link "Home" [ref=f2e27] [cursor=pointer]:
              - /url: /dashboard
          - generic [ref=f2e33]:
            - button "My Work" [ref=f2e34] [cursor=pointer]
            - generic [ref=f2e42]:
              - link "Notifications" [ref=f2e43] [cursor=pointer]:
                - /url: /notifications
              - link "My Appeals" [ref=f2e49] [cursor=pointer]:
                - /url: /appeals
              - link "My Payments" [ref=f2e58] [cursor=pointer]:
                - /url: /payments
          - generic [ref=f2e63]:
            - button "Entities & Registry" [expanded] [ref=f2e64] [cursor=pointer]
            - generic [ref=f2e75]:
              - link "Regulated Entities" [ref=f2e76] [cursor=pointer]:
                - /url: /entities
              - link "Entity Resolution" [ref=f2e83] [cursor=pointer]:
                - /url: /licensing/entity-resolution
              - link "Onboarding Oversight" [ref=f2e93] [cursor=pointer]:
                - /url: /licensing/onboarding-oversight
          - generic [ref=f2e100]:
            - button "Licensing & Authorisation" [expanded] [ref=f2e101] [cursor=pointer]
            - generic [ref=f2e111]:
              - generic [ref=f2e112]:
                - button "Applications" [expanded] [ref=f2e113] [cursor=pointer]
                - generic [ref=f2e124]:
                  - link "Review Queue" [ref=f2e125] [cursor=pointer]:
                    - /url: /applications/queue
                  - link "Bulk Intake" [ref=f2e131] [cursor=pointer]:
                    - /url: /admin/applications/bulk-intake
              - generic [ref=f2e137]:
                - button "Registration" [ref=f2e138] [cursor=pointer]
                - link "Registration Review" [ref=f2e147] [cursor=pointer]:
                  - /url: /admin/registration-review
              - generic [ref=f2e154]:
                - button "Licences" [ref=f2e155] [cursor=pointer]
                - generic [ref=f2e163]:
                  - link "Licence Holders" [ref=f2e164] [cursor=pointer]:
                    - /url: /admin/licensees
                  - link "Licence Lifecycle" [ref=f2e171] [cursor=pointer]:
                    - /url: /licenses/lifecycle
                  - link "Approved Licensees" [ref=f2e179] [cursor=pointer]:
                    - /url: /admin/approved-licensees
              - generic [ref=f2e185]:
                - button "Appeals" [ref=f2e186] [cursor=pointer]
                - generic [ref=f2e197]:
                  - link "Appeals Register" [ref=f2e198] [cursor=pointer]:
                    - /url: /admin/license-appeals
                  - link "Appeal Panels" [ref=f2e205] [cursor=pointer]:
                    - /url: /admin/appeal-panels
          - generic [ref=f2e212]:
            - button "Supervision" [ref=f2e213] [cursor=pointer]
            - generic [ref=f2e221]:
              - generic [ref=f2e222]:
                - button "Supervisory Planning" [ref=f2e223] [cursor=pointer]
                - generic [ref=f2e232]:
                  - link "Supervisory Plans" [ref=f2e233] [cursor=pointer]:
                    - /url: /supervision/plans
                  - link "Risk Heatmap" [ref=f2e241] [cursor=pointer]:
                    - /url: /supervision/risk
                  - link "Breach Inbox" [ref=f2e246] [cursor=pointer]:
                    - /url: /supervision/breaches
                  - link "Early Warning Indicators" [ref=f2e251] [cursor=pointer]:
                    - /url: /supervision/early-warnings
              - generic [ref=f2e261]:
                - button "Market Conduct" [ref=f2e262] [cursor=pointer]
                - generic [ref=f2e274]:
                  - link "Complaints" [ref=f2e275] [cursor=pointer]:
                    - /url: /complaints
                  - link "Duplicate Detection" [ref=f2e280] [cursor=pointer]:
                    - /url: /complaints/duplicates
                  - link "Auto-Escalation" [ref=f2e290] [cursor=pointer]:
                    - /url: /complaints/escalations
                  - link "RFI Approvals" [ref=f2e295] [cursor=pointer]:
                    - /url: /complaints/rfi-approvals
                  - link "Complaint Bulk Intake" [ref=f2e302] [cursor=pointer]:
                    - /url: /complaints/bulk-intake
              - generic [ref=f2e308]:
                - button "Prudential" [ref=f2e309] [cursor=pointer]
                - generic [ref=f2e316]:
                  - link "Overview" [ref=f2e317] [cursor=pointer]:
                    - /url: /prudential/dashboard
                  - link "Work Queue" [ref=f2e325] [cursor=pointer]:
                    - /url: /prudential/work
                  - link "Supervised Entities" [ref=f2e331] [cursor=pointer]:
                    - /url: /prudential/entities
                  - link "Financial Groups" [ref=f2e338] [cursor=pointer]:
                    - /url: /prudential/groups
                  - link "Assessments" [ref=f2e346] [cursor=pointer]:
                    - /url: /prudential/assessments
                  - link "Examinations" [ref=f2e353] [cursor=pointer]:
                    - /url: /prudential/examinations
                  - link "Actions Ledger" [ref=f2e359] [cursor=pointer]:
                    - /url: /prudential/actions
                  - link "Early Warnings" [ref=f2e365] [cursor=pointer]:
                    - /url: /prudential/escalations
                  - link "Stress Indicators" [ref=f2e370] [cursor=pointer]:
                    - /url: /prudential/stress-indicators
                  - link "Team Performance" [ref=f2e375] [cursor=pointer]:
                    - /url: /supervision/team-performance
          - generic [ref=f2e383]:
            - button "Insights & Reporting" [ref=f2e384] [cursor=pointer]
            - generic [ref=f2e391]:
              - link "Analytics" [ref=f2e392] [cursor=pointer]:
                - /url: /analytics
              - link "AI Reports" [ref=f2e397] [cursor=pointer]:
                - /url: /analytics/ai-reports
              - link "Reports" [ref=f2e412] [cursor=pointer]:
                - /url: /reports
          - generic [ref=f2e418]:
            - button "Administration" [ref=f2e419] [cursor=pointer]
            - generic [ref=f2e427]:
              - link "Admin Control Panel" [ref=f2e428] [cursor=pointer]:
                - /url: /admin
              - generic [ref=f2e436]:
                - button "Workflow Engine" [ref=f2e437] [cursor=pointer]
                - generic [ref=f2e446]:
                  - link "Overview" [ref=f2e447] [cursor=pointer]:
                    - /url: /admin/workflow-engine
                  - link "Workflow Definitions" [ref=f2e455] [cursor=pointer]:
                    - /url: /workflows
                  - link "Rules & Approvals" [ref=f2e462] [cursor=pointer]:
                    - /url: /admin/workflow-engine/rules
    - generic [ref=f2e468]:
      - banner [ref=f2e469]:
        - button "Search navigation" [ref=f2e471] [cursor=pointer]:
          - generic [ref=f2e475]: Search...
          - generic [ref=f2e476]: ⌘K
        - generic [ref=f2e477]:
          - button "Notifications" [ref=f2e478] [cursor=pointer]
          - button "C Certification - Licensing Officer Applicant, Licensing Officer" [ref=f2e479] [cursor=pointer]:
            - generic [ref=f2e480]: C
            - generic [ref=f2e482]:
              - paragraph [ref=f2e483]: Certification - Licensing Officer
              - paragraph [ref=f2e484]: Applicant, Licensing Officer
      - main [ref=f2e485]:
        - generic [ref=f2e486]:
          - navigation "breadcrumb" [ref=f2e487]:
            - list [ref=f2e488]:
              - listitem [ref=f2e489]:
                - link "Home" [ref=f2e490] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=f2e491]
              - listitem [ref=f2e494]:
                - link "Entities & Registry" [disabled] [ref=f2e495]
              - listitem [ref=f2e496]
              - listitem [ref=f2e499]:
                - link "Onboarding Oversight" [disabled] [ref=f2e500]
          - generic [ref=f2e502]:
            - generic [ref=f2e503]:
              - generic [ref=f2e504]:
                - heading "Registration & onboarding oversight" [level=1] [ref=f2e505]
                - paragraph [ref=f2e506]: Durable record of every organisation identification attempt across both registration journeys.
              - button "Refresh" [ref=f2e507] [cursor=pointer]
            - generic [ref=f2e508]:
              - generic [ref=f2e510]:
                - generic [ref=f2e511]: "0"
                - generic [ref=f2e512]: Active journeys
              - generic [ref=f2e514]:
                - generic [ref=f2e515]: "0"
                - generic [ref=f2e516]: Identifications (7 days)
              - generic [ref=f2e518]:
                - generic [ref=f2e519]: "0"
                - generic [ref=f2e520]: Open resolution cases
              - generic [ref=f2e522]:
                - generic [ref=f2e523]: "0"
                - generic [ref=f2e524]: Pending access requests
              - generic [ref=f2e526]:
                - generic [ref=f2e527]: "0"
                - generic [ref=f2e528]: Open risk signals
            - generic [ref=f2e529]:
              - tablist [ref=f2e530]:
                - tab "Identification activity" [selected] [ref=f2e531] [cursor=pointer]
                - tab "Registration journeys" [ref=f2e532] [cursor=pointer]
              - tabpanel "Identification activity" [ref=f2e533]:
                - generic [ref=f2e534]:
                  - generic [ref=f2e535]:
                    - heading "Search the audit ledger" [level=3] [ref=f2e536]
                    - paragraph [ref=f2e537]: Find who searched for an organisation, and what the register answered.
                  - generic [ref=f2e538]:
                    - generic [ref=f2e539]:
                      - text: User (email)
                      - textbox "user@example.com" [ref=f2e540]
                    - generic [ref=f2e541]:
                      - text: Organisation searched
                      - textbox "Legal name" [ref=f2e542]
                    - generic [ref=f2e543]:
                      - text: Outcome
                      - combobox [ref=f2e544] [cursor=pointer]:
                        - generic: All outcomes
                    - generic [ref=f2e547]:
                      - text: Journey
                      - combobox [ref=f2e548] [cursor=pointer]:
                        - generic: Both journeys
                    - button "Search" [ref=f2e552] [cursor=pointer]
                - generic [ref=f2e553]:
                  - generic [ref=f2e554]: Total 0
                  - generic [ref=f2e555]: Exact 0
                  - generic [ref=f2e556]: Possible 0
                  - generic [ref=f2e557]: No match 0
                  - generic [ref=f2e558]: Failures 0
                - generic [ref=f2e559]:
                  - generic [ref=f2e560]:
                    - textbox "Search records" [ref=f2e563]
                    - generic [ref=f2e564]:
                      - button "Refresh" [ref=f2e565] [cursor=pointer]
                      - button "Columns" [ref=f2e567] [cursor=pointer]
                      - button "Export" [disabled]
                  - generic [ref=f2e569]:
                    - table [ref=f2e571]:
                      - rowgroup [ref=f2e572]:
                        - row [ref=f2e573]:
                          - columnheader [ref=f2e574]:
                            - button "When" [ref=f2e575] [cursor=pointer]
                          - columnheader [ref=f2e579]:
                            - button "User" [ref=f2e580] [cursor=pointer]
                          - columnheader [ref=f2e584]:
                            - button "Organisation searched" [ref=f2e585] [cursor=pointer]
                          - columnheader "Identifier" [ref=f2e589]
                          - columnheader [ref=f2e590]:
                            - button "Outcome" [ref=f2e591] [cursor=pointer]
                          - columnheader "Matched organisation" [ref=f2e595]
                          - columnheader [ref=f2e596]:
                            - button "Candidates" [ref=f2e597] [cursor=pointer]
                          - columnheader "Follow-up" [ref=f2e601]
                          - columnheader "Case" [ref=f2e602]
                          - columnheader [ref=f2e603]:
                            - button "Journey" [ref=f2e604] [cursor=pointer]
                          - columnheader "Audit reference" [ref=f2e608]
                      - rowgroup [ref=f2e609]:
                        - row [ref=f2e610]:
                          - cell [ref=f2e611]:
                            - paragraph [ref=f2e615]: No identification activity
                            - paragraph [ref=f2e616]: No organisation identification attempts match these filters.
                    - generic [ref=f2e617]:
                      - paragraph [ref=f2e618]: No records
                      - generic [ref=f2e619]:
                        - generic [ref=f2e620]:
                          - generic [ref=f2e621]: Rows
                          - combobox [ref=f2e622] [cursor=pointer]:
                            - generic: "25"
                        - generic [ref=f2e625]:
                          - button "Previous" [disabled]
                          - generic [ref=f2e626]: Page 1 of 1
                          - button "Next" [disabled]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { PERSONAS } from './support/personas';
  3  | import { loginAs } from './support/auth';
  4  | 
  5  | /**
  6  |  * WAVE 3A / SCN-SURFACE — discovery pass over the process work surfaces each
  7  |  * internal persona owns. This test is a gap detector: it fails on server
  8  |  * rejections (4xx/5xx) or unhandled runtime errors raised while the owning
  9  |  * persona opens its own queue. Findings feed the Wave 3A gap register.
  10 |  */
  11 | 
  12 | interface Surface { code: string; persona: string; routes: string[] }
  13 | 
  14 | const SURFACES: Surface[] = [
  15 |   { code: 'P03-LICENSING', persona: PERSONAS.licensingOfficer, routes: ['/applications/queue', '/licensing/onboarding-oversight'] },
  16 |   { code: 'P04-LICENCE', persona: PERSONAS.licensingSupervisor, routes: ['/licenses', '/licenses/lifecycle'] },
  17 |   { code: 'P05-FITPROPER', persona: PERSONAS.fitProperOfficer, routes: ['/fpa', '/fpa/individuals'] },
  18 |   { code: 'P06-RETURNS', persona: PERSONAS.returnsOfficer, routes: ['/returns/queue', '/returns/obligations', '/returns/calendar'] },
  19 |   { code: 'P07-PRUDENTIAL', persona: PERSONAS.prudentialAnalyst, routes: ['/prudential/work', '/prudential/dashboard', '/supervision/early-warnings'] },
  20 |   { code: 'P08-CONDUCT', persona: PERSONAS.conductAnalyst, routes: ['/conduct/work-queue', '/conduct/alerts'] },
  21 |   { code: 'P09-COMPLAINTS', persona: PERSONAS.complaintsOfficer, routes: ['/complaints', '/complaints/escalations'] },
  22 |   { code: 'P10-INSPECTION', persona: PERSONAS.inspector, routes: ['/inspections', '/prudential/examinations'] },
  23 |   { code: 'P11-ENFORCEMENT', persona: PERSONAS.enforcementOfficer, routes: ['/enforcement'] },
  24 |   { code: 'P12-CORRESPONDENCE', persona: PERSONAS.superAdmin, routes: ['/correspondence/inbox', '/correspondence/threads'] },
  25 |   { code: 'P13-ENTITY-RES', persona: PERSONAS.entityResolutionOfficer, routes: ['/licensing/entity-resolution', '/entities'] },
  26 | ];
  27 | 
  28 | for (const s of SURFACES) {
  29 |   test(`SCN-SURFACE-${s.code}: owning persona opens its work surfaces cleanly`, async ({ page }) => {
  30 |     const failures: string[] = [];
  31 |     page.on('console', m => {
  32 |       if (m.type() === 'error') failures.push(`console: ${m.text().slice(0, 240)}`);
  33 |     });
  34 |     page.on('pageerror', e => failures.push(`pageerror: ${String(e.message).slice(0, 240)}`));
  35 |     page.on('response', r => {
  36 |       if (r.status() >= 400 && !r.url().includes('/auth/v1/')) {
  37 |         failures.push(`http ${r.status()} ${r.url().split('?')[0].slice(-90)}`);
  38 |       }
  39 |     });
  40 | 
  41 |     await loginAs(page, s.persona);
  42 |     failures.length = 0; // only judge the process surfaces, not the login hop
  43 | 
  44 |     for (const route of s.routes) {
  45 |       await page.goto(route, { waitUntil: 'domcontentloaded' });
  46 |       await page.waitForTimeout(3000);
  47 |       const body = (await page.locator('body').innerText().catch(() => '')) || '';
  48 |       expect(body.length, `${route} rendered an empty document for ${s.code}`).toBeGreaterThan(50);
  49 |       if (/access denied|not authorized|unauthorized|permission denied/i.test(body)) {
  50 |         failures.push(`denied-ui ${route}`);
  51 |       }
  52 |     }
  53 | 
> 54 |     expect(failures, `${s.code} surface defects`).toEqual([]);
     |                                                   ^ Error: P03-LICENSING surface defects
  55 |   });
  56 | }
  57 | 
```