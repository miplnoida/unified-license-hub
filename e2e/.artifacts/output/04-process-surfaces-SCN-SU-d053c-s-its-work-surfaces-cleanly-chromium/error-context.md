# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-process-surfaces.spec.ts >> SCN-SURFACE-P12-CORRESPONDENCE: owning persona opens its work surfaces cleanly
- Location: e2e/cert-v2/04-process-surfaces.spec.ts:29:3

# Error details

```
Error: P12-CORRESPONDENCE surface defects

expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 455

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
+ Check the render method of `CorrespondenceInbox`. 
+     at DashboardLayout (http://localhost:8080/src/com",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CorrespondenceInbox`. 
+     at PageHeader (http://localhost:8080/src/componen",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CorrespondenceInbox`. 
+     at IntakeForm (http://localhost:8080/src/componen",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `IntakeForm`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/deps/@",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CorrespondenceInbox`. 
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
+     at Skeleton (http://localhost:8080/src/components/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at Skeleton (http://localhost:8080/src/components/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at Select (http://localhost:8080/node_modules/.vit",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `SelectContent`. 
+     at SelectPortal
+     at _c4 (http://localhost:8080/src/c",
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
+     at Navigate (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=56b67f16:4461:5)
+   ",
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
+ Check the render method of `CorrespondenceInbox`. 
+     at DashboardLayout (http://localhost:8080/src/com",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CorrespondenceInbox`. 
+     at PageHeader (http://localhost:8080/src/componen",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CorrespondenceInbox`. 
+     at IntakeForm (http://localhost:8080/src/componen",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `IntakeForm`. 
+     at Dialog (http://localhost:8080/node_modules/.vite/deps/@",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `CorrespondenceInbox`. 
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
+     at Skeleton (http://localhost:8080/src/components/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at Skeleton (http://localhost:8080/src/components/",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `EnterpriseDataGrid`. 
+     at Select (http://localhost:8080/node_modules/.vit",
+   "console: Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?%s%s 
+
+ Check the render method of `SelectContent`. 
+     at SelectPortal
+     at _c4 (http://localhost:8080/src/c",
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
              - link "My Payments" [ref=f2e49] [cursor=pointer]:
                - /url: /payments
          - generic [ref=f2e54]:
            - button "Entities & Registry" [ref=f2e55] [cursor=pointer]
            - generic [ref=f2e64]:
              - link "Regulated Entities" [ref=f2e65] [cursor=pointer]:
                - /url: /entities
              - link "Entity Resolution" [ref=f2e72] [cursor=pointer]:
                - /url: /licensing/entity-resolution
              - link "Onboarding Oversight" [ref=f2e82] [cursor=pointer]:
                - /url: /licensing/onboarding-oversight
              - link "Entity Memberships" [ref=f2e89] [cursor=pointer]:
                - /url: /admin/entity-memberships
              - link "Entity Web Users" [ref=f2e97] [cursor=pointer]:
                - /url: /admin/web-users
          - generic [ref=f2e104]:
            - button "Licensing & Authorisation" [ref=f2e105] [cursor=pointer]
            - generic [ref=f2e113]:
              - link "Fees & Penalties" [ref=f2e114] [cursor=pointer]:
                - /url: /billing/penalties
              - generic [ref=f2e120]:
                - button "Applications" [ref=f2e121] [cursor=pointer]
                - generic [ref=f2e130]:
                  - link "Review Queue" [ref=f2e131] [cursor=pointer]:
                    - /url: /applications/queue
                  - link "Bulk Intake" [ref=f2e137] [cursor=pointer]:
                    - /url: /admin/applications/bulk-intake
              - generic [ref=f2e143]:
                - button "Registration" [ref=f2e144] [cursor=pointer]
                - link "Registration Review" [ref=f2e153] [cursor=pointer]:
                  - /url: /admin/registration-review
              - link "Regulatory Requests" [ref=f2e160] [cursor=pointer]:
                - /url: /licensing/regulatory-requests
              - generic [ref=f2e166]:
                - button "Licences" [ref=f2e167] [cursor=pointer]
                - generic [ref=f2e175]:
                  - link "Licence Holders" [ref=f2e176] [cursor=pointer]:
                    - /url: /admin/licensees
                  - link "Licence Lifecycle" [ref=f2e183] [cursor=pointer]:
                    - /url: /licenses/lifecycle
                  - link "Approved Licensees" [ref=f2e191] [cursor=pointer]:
                    - /url: /admin/approved-licensees
              - generic [ref=f2e197]:
                - button "Appeals" [ref=f2e198] [cursor=pointer]
                - generic [ref=f2e209]:
                  - link "Appeals Register" [ref=f2e210] [cursor=pointer]:
                    - /url: /admin/license-appeals
                  - link "Appeal Panels" [ref=f2e217] [cursor=pointer]:
                    - /url: /admin/appeal-panels
          - generic [ref=f2e224]:
            - button "Supervision" [ref=f2e225] [cursor=pointer]
            - generic [ref=f2e233]:
              - generic [ref=f2e234]:
                - button "Supervisory Planning" [ref=f2e235] [cursor=pointer]
                - generic [ref=f2e244]:
                  - link "Supervisory Plans" [ref=f2e245] [cursor=pointer]:
                    - /url: /supervision/plans
                  - link "Risk Heatmap" [ref=f2e253] [cursor=pointer]:
                    - /url: /supervision/risk
                  - link "Breach Inbox" [ref=f2e258] [cursor=pointer]:
                    - /url: /supervision/breaches
                  - link "Early Warning Indicators" [ref=f2e263] [cursor=pointer]:
                    - /url: /supervision/early-warnings
                  - link "Inspections" [ref=f2e273] [cursor=pointer]:
                    - /url: /inspections
                  - link "Inspection Calendar" [ref=f2e280] [cursor=pointer]:
                    - /url: /inspections/schedule
                  - link "Coordination Cases" [ref=f2e286] [cursor=pointer]:
                    - /url: /coordination
              - generic [ref=f2e295]:
                - button "Market Conduct" [ref=f2e296] [cursor=pointer]
                - generic [ref=f2e308]:
                  - link "Overview" [ref=f2e309] [cursor=pointer]:
                    - /url: /conduct
                  - link "Conduct Work Queue" [ref=f2e317] [cursor=pointer]:
                    - /url: /conduct/work-queue
                  - link "Complaints" [ref=f2e323] [cursor=pointer]:
                    - /url: /complaints
                  - link "Market Surveillance" [ref=f2e328] [cursor=pointer]:
                    - /url: /conduct/surveillance
                  - link "Investigations" [ref=f2e338] [cursor=pointer]:
                    - /url: /conduct/investigations
                  - link "Enforcement Cases" [ref=f2e345] [cursor=pointer]:
                    - /url: /enforcement
                  - link "Thematic Reviews" [ref=f2e354] [cursor=pointer]:
                    - /url: /supervision/thematic-reviews
                  - link "Duplicate Detection" [ref=f2e362] [cursor=pointer]:
                    - /url: /complaints/duplicates
                  - link "Auto-Escalation" [ref=f2e372] [cursor=pointer]:
                    - /url: /complaints/escalations
                  - link "RFI Approvals" [ref=f2e377] [cursor=pointer]:
                    - /url: /complaints/rfi-approvals
                  - link "Conduct Alerts" [ref=f2e384] [cursor=pointer]:
                    - /url: /conduct/alerts
                  - link "Conduct Actions" [ref=f2e392] [cursor=pointer]:
                    - /url: /conduct/actions
                  - link "Conduct Entities" [ref=f2e398] [cursor=pointer]:
                    - /url: /conduct/entities
                  - link "Conduct Findings" [ref=f2e405] [cursor=pointer]:
                    - /url: /conduct/findings
                  - link "Investigation Closure Approvals" [ref=f2e413] [cursor=pointer]:
                    - /url: /conduct/closure-approvals
                  - link "Supervision Loop" [ref=f2e422] [cursor=pointer]:
                    - /url: /conduct/supervision-loop
                  - link "Thematic Closure Approvals" [ref=f2e430] [cursor=pointer]:
                    - /url: /supervision/thematic-closure-approvals
                  - link "Complaint Analytics" [ref=f2e437] [cursor=pointer]:
                    - /url: /complaints/analytics
                  - link "Complaint Bulk Intake" [ref=f2e442] [cursor=pointer]:
                    - /url: /complaints/bulk-intake
              - generic [ref=f2e448]:
                - button "Prudential" [ref=f2e449] [cursor=pointer]
                - generic [ref=f2e456]:
                  - link "Overview" [ref=f2e457] [cursor=pointer]:
                    - /url: /prudential/dashboard
                  - link "Work Queue" [ref=f2e465] [cursor=pointer]:
                    - /url: /prudential/work
                  - link "Supervised Entities" [ref=f2e471] [cursor=pointer]:
                    - /url: /prudential/entities
                  - link "Financial Groups" [ref=f2e478] [cursor=pointer]:
                    - /url: /prudential/groups
                  - link "Assessments" [ref=f2e486] [cursor=pointer]:
                    - /url: /prudential/assessments
                  - link "Examinations" [ref=f2e493] [cursor=pointer]:
                    - /url: /prudential/examinations
                  - link "Actions Ledger" [ref=f2e499] [cursor=pointer]:
                    - /url: /prudential/actions
                  - link "Early Warnings" [ref=f2e505] [cursor=pointer]:
                    - /url: /prudential/escalations
                  - link "Stress Indicators" [ref=f2e510] [cursor=pointer]:
                    - /url: /prudential/stress-indicators
                  - link "Payment Systems" [ref=f2e515] [cursor=pointer]:
                    - /url: /prudential/payment-systems
                  - link "Team Performance" [ref=f2e520] [cursor=pointer]:
                    - /url: /supervision/team-performance
              - generic [ref=f2e528]:
                - button "Fit & Proper" [ref=f2e529] [cursor=pointer]
                - generic [ref=f2e538]:
                  - link "Overview" [ref=f2e539] [cursor=pointer]:
                    - /url: /fpa
                  - link "Processes" [ref=f2e547] [cursor=pointer]:
                    - /url: /fpa/processes
                  - link "Sector Rules" [ref=f2e554] [cursor=pointer]:
                    - /url: /fpa/sector-rules
                  - link "Initiation Paths" [ref=f2e558] [cursor=pointer]:
                    - /url: /fpa/initiation
                  - link "Individual Register" [ref=f2e565] [cursor=pointer]:
                    - /url: /fpa/individuals
                  - link "Initiation Log" [ref=f2e573] [cursor=pointer]:
                    - /url: /fpa/initiation-log
                  - link "Declarations" [ref=f2e579] [cursor=pointer]:
                    - /url: /fpa/declarations
                  - link "Invitation Tracker" [ref=f2e587] [cursor=pointer]:
                    - /url: /fpa/invitations
                  - link "Screening Hub" [ref=f2e593] [cursor=pointer]:
                    - /url: /fpa/screening
                  - link "Manual Review Queue" [ref=f2e599] [cursor=pointer]:
                    - /url: /fpa/manual-tasks
                  - link "Findings Console" [ref=f2e605] [cursor=pointer]:
                    - /url: /fpa/findings
                  - link "AI Analysis" [ref=f2e610] [cursor=pointer]:
                    - /url: /fpa/ai-analysis
                  - link "Committee Voting" [ref=f2e625] [cursor=pointer]:
                    - /url: /fpa/committee
                  - link "Determinations" [ref=f2e632] [cursor=pointer]:
                    - /url: /fpa/determinations
                  - link "Conditions & SLA" [ref=f2e641] [cursor=pointer]:
                    - /url: /fpa/conditions
                  - link "Reassessment Scheduler" [ref=f2e647] [cursor=pointer]:
                    - /url: /fpa/scheduler
                  - link "Monitoring & Audit" [ref=f2e653] [cursor=pointer]:
                    - /url: /fpa/monitoring
                  - link "F&P Appeals" [ref=f2e663] [cursor=pointer]:
                    - /url: /fpa/appeals
                  - link "Notification Log" [ref=f2e670] [cursor=pointer]:
                    - /url: /fpa/notifications
                  - link "Trends & History" [ref=f2e677] [cursor=pointer]:
                    - /url: /fpa/trends
                  - link "Training & Awareness" [ref=f2e682] [cursor=pointer]:
                    - /url: /fpa/training
          - generic [ref=f2e688]:
            - button "Returns & Data" [ref=f2e689] [cursor=pointer]
            - generic [ref=f2e697]:
              - link "Filing Queue" [ref=f2e698] [cursor=pointer]:
                - /url: /returns/queue
              - link "Reporting Obligations" [ref=f2e704] [cursor=pointer]:
                - /url: /returns/obligations
              - link "Reporting Calendar" [ref=f2e710] [cursor=pointer]:
                - /url: /returns/calendar
          - generic [ref=f2e716]:
            - button "Correspondence & Cases" [expanded] [ref=f2e717] [cursor=pointer]
            - generic [ref=f2e727]:
              - link "Documents" [ref=f2e728] [cursor=pointer]:
                - /url: /documents
              - link "Inbox" [ref=f2e734] [cursor=pointer]:
                - /url: /correspondence/inbox
              - link "Threads" [ref=f2e740] [cursor=pointer]:
                - /url: /correspondence/manager
              - link "Records" [ref=f2e746] [cursor=pointer]:
                - /url: /correspondence/records
              - link "Correspondence Dashboard" [ref=f2e752] [cursor=pointer]:
                - /url: /correspondence/dashboard
          - generic [ref=f2e757]:
            - button "Insights & Reporting" [ref=f2e758] [cursor=pointer]
            - generic [ref=f2e765]:
              - link "Executive Dashboard" [ref=f2e766] [cursor=pointer]:
                - /url: /executive
              - link "AI Insights Hub" [ref=f2e774] [cursor=pointer]:
                - /url: /analytics/ai-insights
              - link "Alert Centre" [ref=f2e789] [cursor=pointer]:
                - /url: /alerts
              - link "Analytics" [ref=f2e797] [cursor=pointer]:
                - /url: /analytics
              - link "AI Reports" [ref=f2e802] [cursor=pointer]:
                - /url: /analytics/ai-reports
              - link "Reports" [ref=f2e817] [cursor=pointer]:
                - /url: /reports
          - generic [ref=f2e823]:
            - button "Administration" [ref=f2e824] [cursor=pointer]
            - generic [ref=f2e832]:
              - link "Admin Control Panel" [ref=f2e833] [cursor=pointer]:
                - /url: /admin
              - generic [ref=f2e841]:
                - button "People & Access" [ref=f2e842] [cursor=pointer]
                - generic [ref=f2e852]:
                  - link "Employees" [ref=f2e853] [cursor=pointer]:
                    - /url: /admin/users
                  - link "Roles" [ref=f2e868] [cursor=pointer]:
                    - /url: /admin/roles
                  - link "Permission Coverage" [ref=f2e874] [cursor=pointer]:
                    - /url: /admin/permission-coverage
                  - link "PPOC Mappings" [ref=f2e880] [cursor=pointer]:
                    - /url: /admin/ppoc-mappings
              - generic [ref=f2e888]:
                - button "Configuration" [ref=f2e889] [cursor=pointer]
                - generic [ref=f2e895]:
                  - link "Licensing & Registration" [ref=f2e896] [cursor=pointer]:
                    - /url: /admin/config/licensing
                  - link "Returns & Prudential" [ref=f2e902] [cursor=pointer]:
                    - /url: /admin/config/returns-prudential
                  - link "Supervision" [ref=f2e916] [cursor=pointer]:
                    - /url: /admin/config/supervision
                  - link "Forms & Packages" [ref=f2e922] [cursor=pointer]:
                    - /url: /admin/forms-packages
                  - link "Forms & Master Data" [ref=f2e930] [cursor=pointer]:
                    - /url: /admin/config/forms-master-data
                  - generic [ref=f2e937]:
                    - button "Regulatory Data Model" [ref=f2e938] [cursor=pointer]
                    - link "Reporting & Metrics" [ref=f2e948] [cursor=pointer]:
                      - /url: /admin/regulatory-data-model/reporting
              - generic [ref=f2e953]:
                - button "Workflow Engine" [ref=f2e954] [cursor=pointer]
                - generic [ref=f2e963]:
                  - link "Overview" [ref=f2e964] [cursor=pointer]:
                    - /url: /admin/workflow-engine
                  - link "Workflow Definitions" [ref=f2e972] [cursor=pointer]:
                    - /url: /workflows
                  - link "Rules & Approvals" [ref=f2e979] [cursor=pointer]:
                    - /url: /admin/workflow-engine/rules
              - generic [ref=f2e985]:
                - button "Notification Engine" [ref=f2e986] [cursor=pointer]
                - generic [ref=f2e994]:
                  - link "Overview" [ref=f2e995] [cursor=pointer]:
                    - /url: /admin/notification-engine
                  - link "Templates" [ref=f2e1003] [cursor=pointer]:
                    - /url: /admin/notification-templates
                  - link "Events & Routing" [ref=f2e1009] [cursor=pointer]:
                    - /url: /admin/notification-events
                  - link "Delivery & Channels" [ref=f2e1017] [cursor=pointer]:
                    - /url: /admin/notification-engine/delivery
              - generic [ref=f2e1023]:
                - button "Security & Audit" [ref=f2e1024] [cursor=pointer]
                - generic [ref=f2e1031]:
                  - link "Audit Trail" [ref=f2e1032] [cursor=pointer]:
                    - /url: /admin/audit-logs
                  - link "Security" [ref=f2e1038] [cursor=pointer]:
                    - /url: /admin/security-events
                  - link "System Events" [ref=f2e1043] [cursor=pointer]:
                    - /url: /admin/security-audit
              - generic [ref=f2e1048]:
                - button "System & Integrations" [ref=f2e1049] [cursor=pointer]
                - generic [ref=f2e1065]:
                  - link "Settings" [ref=f2e1066] [cursor=pointer]:
                    - /url: /settings
                  - link "Master Data" [ref=f2e1072] [cursor=pointer]:
                    - /url: /admin/master-data
                  - link "Integrations" [ref=f2e1079] [cursor=pointer]:
                    - /url: /settings/integrations
                  - link "API & Technical Config" [ref=f2e1084] [cursor=pointer]:
                    - /url: /admin/api-keys
    - generic [ref=f2e1093]:
      - banner [ref=f2e1094]:
        - button "Search navigation" [ref=f2e1096] [cursor=pointer]:
          - generic [ref=f2e1100]: Search...
          - generic [ref=f2e1101]: ⌘K
        - generic [ref=f2e1102]:
          - button "Notifications" [ref=f2e1103] [cursor=pointer]
          - button "C Certification - Super Admin Super Admin, Applicant" [ref=f2e1104] [cursor=pointer]:
            - generic [ref=f2e1105]: C
            - generic [ref=f2e1107]:
              - paragraph [ref=f2e1108]: Certification - Super Admin
              - paragraph [ref=f2e1109]: Super Admin, Applicant
      - main [ref=f2e1110]:
        - generic [ref=f2e1111]:
          - navigation "breadcrumb" [ref=f2e1112]:
            - list [ref=f2e1113]:
              - listitem [ref=f2e1114]:
                - link "Home" [ref=f2e1115] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=f2e1116]
              - listitem [ref=f2e1119]:
                - link "Correspondence" [ref=f2e1120] [cursor=pointer]:
                  - /url: /correspondence
              - listitem [ref=f2e1121]
              - listitem [ref=f2e1124]:
                - link "Work queue" [disabled] [ref=f2e1125]
          - generic [ref=f2e1128]:
            - generic [ref=f2e1130]:
              - generic [ref=f2e1131]:
                - heading "Correspondence work queue" [level=1] [ref=f2e1132]
                - paragraph [ref=f2e1133]: Every regulator-entity conversation needing attention, with server-computed ownership, service levels, waiting-on and next action.
              - button "Capture correspondence" [ref=f2e1135] [cursor=pointer]
            - generic [ref=f2e1136]:
              - generic [ref=f2e1137]:
                - textbox "Search subject, reference, entity or sender…" [ref=f2e1140]
                - generic [ref=f2e1141]:
                  - button "Refresh" [ref=f2e1142] [cursor=pointer]
                  - button "Columns" [ref=f2e1144] [cursor=pointer]
                  - button "Export" [disabled]
              - generic [ref=f2e1146]:
                - button "Open 0" [ref=f2e1147] [cursor=pointer]:
                  - text: Open
                  - generic [ref=f2e1148]: "0"
                - button "Action required 0" [ref=f2e1149] [cursor=pointer]:
                  - text: Action required
                  - generic [ref=f2e1150]: "0"
                - button "Assigned to me 0" [ref=f2e1151] [cursor=pointer]:
                  - text: Assigned to me
                  - generic [ref=f2e1152]: "0"
                - button "Unassigned 0" [ref=f2e1153] [cursor=pointer]:
                  - text: Unassigned
                  - generic [ref=f2e1154]: "0"
                - button "Awaiting response 0" [ref=f2e1155] [cursor=pointer]:
                  - text: Awaiting response
                  - generic [ref=f2e1156]: "0"
                - button "SLA breached 0" [ref=f2e1157] [cursor=pointer]:
                  - text: SLA breached
                  - generic [ref=f2e1158]: "0"
                - button "Unread 0" [ref=f2e1159] [cursor=pointer]:
                  - text: Unread
                  - generic [ref=f2e1160]: "0"
                - button "All 0" [ref=f2e1161] [cursor=pointer]:
                  - text: All
                  - generic [ref=f2e1162]: "0"
              - generic [ref=f2e1163]:
                - table [ref=f2e1165]:
                  - rowgroup [ref=f2e1166]:
                    - row [ref=f2e1167]:
                      - columnheader "Reference" [ref=f2e1168]
                      - columnheader "Subject" [ref=f2e1169]
                      - columnheader "Entity / person" [ref=f2e1170]
                      - columnheader "Related case" [ref=f2e1171]
                      - columnheader "Domain" [ref=f2e1172]
                      - columnheader "Channel" [ref=f2e1173]
                      - columnheader "Direction" [ref=f2e1174]
                      - columnheader "Owner / team" [ref=f2e1175]
                      - columnheader "Priority" [ref=f2e1176]
                      - columnheader "SLA" [ref=f2e1177]
                      - columnheader "Waiting on" [ref=f2e1178]
                      - columnheader "Next action" [ref=f2e1179]
                      - columnheader "Status" [ref=f2e1180]
                      - columnheader "Last activity" [ref=f2e1181]
                      - columnheader "Actions" [ref=f2e1182]
                  - rowgroup [ref=f2e1183]:
                    - row [ref=f2e1184]:
                      - cell [ref=f2e1185]:
                        - paragraph [ref=f2e1189]: Nothing in this queue
                        - paragraph [ref=f2e1190]: No correspondence matches the selected queue.
                - generic [ref=f2e1191]:
                  - paragraph [ref=f2e1192]: No records
                  - generic [ref=f2e1193]:
                    - generic [ref=f2e1194]:
                      - generic [ref=f2e1195]: Rows
                      - combobox [ref=f2e1196] [cursor=pointer]:
                        - generic: "25"
                    - generic [ref=f2e1199]:
                      - button "Previous" [disabled]
                      - generic [ref=f2e1200]: Page 1 of 1
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
     |                                                   ^ Error: P12-CORRESPONDENCE surface defects
  55 |   });
  56 | }
  57 | 
```